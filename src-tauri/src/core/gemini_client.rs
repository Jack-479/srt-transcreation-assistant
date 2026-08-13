use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use reqwest_eventsource::{EventSource, Event};
use futures_util::StreamExt;
use tauri::Emitter;

pub struct GeminiClient {
    api_key: String,
    primary_model: String,
    fallback_model: String,
    client: Client,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiResponse {
    candidates: Option<Vec<Candidate>>,
    error: Option<GeminiErrorDetail>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Candidate {
    content: Option<CandidateContent>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CandidateContent {
    parts: Option<Vec<Part>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Part {
    text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiErrorDetail {
    code: Option<u16>,
    message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct EmbeddingResponse {
    embedding: Option<EmbeddingValue>,
}

#[derive(Debug, Serialize, Deserialize)]
struct EmbeddingValue {
    values: Option<Vec<f32>>,
}

impl GeminiClient {
    pub fn new(api_key: String, primary_model: Option<String>, fallback_model: Option<String>) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(90))
            .build()
            .unwrap_or_default();

        Self {
            api_key,
            primary_model: primary_model.unwrap_or_else(|| "gemini-3.5-flash".to_string()),
            fallback_model: fallback_model.unwrap_or_else(|| "gemini-3.5-flash-lite".to_string()),
            client,
        }
    }

    fn get_safety_settings() -> Vec<Value> {
        vec![
            json!({"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"}),
            json!({"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"}),
            json!({"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"}),
            json!({"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"}),
        ]
    }

    pub async fn validate_key(&self) -> Result<String, String> {
        if self.api_key.trim().is_empty() {
            return Err("No Gemini API key provided.".to_string());
        }

        let res = self
            .generate("Reply with the single word: OK", None, Some("gemini-3.5-flash"), None)
            .await;

        match res {
            Ok(text) => Ok(format!("Key valid! Response: {}", text.trim())),
            Err(e) => Err(format!("Validation failed: {}", e)),
        }
    }

    pub async fn generate(
        &self,
        prompt: &str,
        system_instruction: Option<&str>,
        model_override: Option<&str>,
        is_json: Option<bool>,
    ) -> Result<String, String> {
        let model = model_override.unwrap_or(&self.primary_model);
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            model, self.api_key
        );

        let mut contents = Vec::new();
        if let Some(sys) = system_instruction {
            contents.push(json!({
                "role": "user",
                "parts": [{"text": sys}]
            }));
        }
        contents.push(json!({
            "role": "user",
            "parts": [{"text": prompt}]
        }));

        let safety_settings = Self::get_safety_settings();

        let mut generation_config = json!({
            "temperature": 0.3
        });
        if is_json.unwrap_or(false) {
            generation_config["responseMimeType"] = json!("application/json");
        }

        let body = json!({
            "contents": contents,
            "safetySettings": safety_settings,
            "generationConfig": generation_config
        });

        // Exponential backoff retry logic
        let mut last_err = String::new();
        for attempt in 1..=3 {
            let resp = self.client.post(&url).json(&body).send().await;
            match resp {
                Ok(r) => {
                    if r.status().is_success() {
                        let parsed: GeminiResponse = r
                            .json()
                            .await
                            .map_err(|e| format!("Failed to parse Gemini response JSON: {}", e))?;

                        if let Some(candidates) = parsed.candidates {
                            if let Some(first) = candidates.first() {
                                if let Some(content) = &first.content {
                                    if let Some(parts) = &content.parts {
                                        if let Some(p) = parts.first() {
                                            if let Some(txt) = &p.text {
                                                return Ok(txt.clone());
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        return Err("Gemini returned empty text candidate.".to_string());
                    } else {
                        let status = r.status();
                        let text_err = r.text().await.unwrap_or_default();
                        last_err = format!("HTTP {}: {}", status, text_err);
                    }
                }
                Err(e) => {
                    last_err = format!("Network error: {}", e);
                    log::warn!("Attempt {} failed: {}", attempt, last_err);
                }
            }

            tokio::time::sleep(Duration::from_millis(1000 * attempt)).await;
        }

        // Try fallback model if primary failed
        if model != self.fallback_model && model_override.is_none() {
            return Box::pin(self.generate(prompt, system_instruction, Some(&self.fallback_model), is_json)).await;
        }

        Err(format!("Gemini API call failed after retries: {}", last_err))
    }

    pub async fn get_embedding(&self, text: &str) -> Result<Vec<f32>, String> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={}",
            self.api_key
        );
        let body = json!({
            "model": "models/text-embedding-004",
            "content": {
                "parts": [{"text": text}]
            }
        });
        
        let res = self.client.post(&url).json(&body).send().await.map_err(|e| e.to_string())?;
        
        if res.status().is_success() {
            let parsed: EmbeddingResponse = res.json().await.map_err(|e| e.to_string())?;
            if let Some(emb) = parsed.embedding {
                if let Some(vals) = emb.values {
                    return Ok(vals);
                }
            }
            Err("No embedding values returned".to_string())
        } else {
            Err(format!("Embedding failed: {}", res.status()))
        }
    }

    pub async fn stream_generate(
        &self,
        prompt: &str,
        system_instruction: Option<&str>,
        model_override: Option<&str>,
        is_json: Option<bool>,
        app_handle: &tauri::AppHandle,
        chunk_index: usize,
    ) -> Result<String, String> {
        let model = model_override.unwrap_or(&self.primary_model);
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
            model, self.api_key
        );

        let mut contents = Vec::new();
        if let Some(sys) = system_instruction {
            contents.push(json!({
                "role": "user",
                "parts": [{"text": sys}]
            }));
        }
        contents.push(json!({
            "role": "user",
            "parts": [{"text": prompt}]
        }));

        let safety_settings = Self::get_safety_settings();

        let mut body = json!({
            "contents": contents,
            "safetySettings": safety_settings,
        });

        if let Some(true) = is_json {
            body["generationConfig"] = json!({
                "responseMimeType": "application/json"
            });
        }

        let mut last_err = String::new();
        let mut full_text = String::new();

        for attempt in 1..=4 {
            let builder = self.client.post(&url).json(&body);
            let es_result = EventSource::new(builder);
            
            match es_result {
                Ok(mut es) => {
                    let mut stream_started = false;
                    while let Some(event) = es.next().await {
                        match event {
                            Ok(Event::Open) => {},
                            Ok(Event::Message(message)) => {
                                stream_started = true;
                                if let Ok(parsed) = serde_json::from_str::<GeminiResponse>(&message.data) {
                                    if let Some(candidates) = parsed.candidates {
                                        if let Some(first) = candidates.first() {
                                            if let Some(content) = &first.content {
                                                if let Some(parts) = &content.parts {
                                                    if let Some(p) = parts.first() {
                                                        if let Some(txt) = &p.text {
                                                            full_text.push_str(txt);
                                                            
                                                            #[derive(Clone, Serialize)]
                                                            struct StreamPayload {
                                                                chunk_index: usize,
                                                                delta: String,
                                                                full_text: String,
                                                            }
                                                            
                                                            let _ = app_handle.emit("translation-stream", StreamPayload {
                                                                chunk_index,
                                                                delta: txt.clone(),
                                                                full_text: full_text.clone()
                                                            });
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            },
                            Err(e) => {
                                last_err = format!("EventSource error: {:?}", e);
                                es.close();
                                break;
                            }
                        }
                    }
                    
                    if stream_started && !full_text.trim().is_empty() {
                        return Ok(full_text); // Successful stream (or partially successful but yielded content)
                    }
                }
                Err(e) => {
                    last_err = format!("Failed to build EventSource: {}", e);
                }
            }

            log::warn!("Stream attempt {} failed: {}. Retrying in {}s...", attempt, last_err, attempt);
            tokio::time::sleep(Duration::from_millis(1000 * attempt as u64)).await;
        }

        // Try fallback model if full_text is completely empty (meaning immediate failure)
        if full_text.trim().is_empty() && model != self.fallback_model && model_override.is_none() {
            log::warn!("Stream generation failed. Falling back to {}.", self.fallback_model);
            return Box::pin(self.stream_generate(prompt, system_instruction, Some(&self.fallback_model), is_json, app_handle, chunk_index)).await;
        }
        
        Err(format!("Stream generation failed after retries: {}", last_err))
    }
}
