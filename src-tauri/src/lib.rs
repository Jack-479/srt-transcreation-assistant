pub mod core;

use std::collections::HashSet;
use std::path::Path;
use tauri::Manager;
use core::models::{CPSProfile, Chunk, ProjectSettings, QCIssue, SubtitleEntry};
use core::srt_io::{export_srt, load_srt};
use core::chunker::build_chunks;
use core::qc::run_qc;
use core::prompt_builder::{build_payload, build_prompt};
use core::response_parser::{parse_response, ParseResult};
use core::gemini_client::GeminiClient;
use core::db::{TMEntry, insert_tm_entry, find_tm_match};

#[tauri::command]
async fn save_tm_entry_command(
    state: tauri::State<'_, sqlx::SqlitePool>,
    entry: TMEntry,
) -> Result<(), String> {
    insert_tm_entry(&state, entry).await
}

#[tauri::command]
async fn find_tm_match_command(
    state: tauri::State<'_, sqlx::SqlitePool>,
    hash: String,
) -> Result<Option<String>, String> {
    find_tm_match(&state, &hash).await
}

#[tauri::command]
fn load_srt_command(path: String) -> Result<(Vec<SubtitleEntry>, String), String> {
    log::info!("Loading SRT file from: {}", path);
    let file_path = Path::new(&path);
    match load_srt(file_path) {
        Ok(res) => {
            log::info!("Successfully loaded {} entries from {}", res.0.len(), path);
            Ok(res)
        }
        Err(e) => {
            log::error!("Failed to load SRT {}: {}", path, e);
            Err(e)
        }
    }
}

#[tauri::command]
fn chunk_subtitles_command(
    entries: Vec<SubtitleEntry>,
    chunk_size: usize,
    overlap: usize,
) -> Result<Vec<Chunk>, String> {
    let skip_indices = HashSet::new();
    build_chunks(&entries, chunk_size, overlap, &skip_indices)
}

#[tauri::command]
fn export_srt_command(
    entries: Vec<SubtitleEntry>,
    dest_path: String,
    bom: bool,
    bilingual: bool,
) -> Result<String, String> {
    log::info!("Exporting {} entries to: {}", entries.len(), dest_path);
    let path = Path::new(&dest_path);
    match export_srt(&entries, path, bom, true, bilingual) {
        Ok(exported) => {
            log::info!("Successfully exported SRT to {}", dest_path);
            Ok(exported.to_string_lossy().to_string())
        }
        Err(e) => {
            log::error!("Failed to export SRT to {}: {}", dest_path, e);
            Err(e)
        }
    }
}

#[tauri::command]
fn run_qc_command(
    entries: Vec<SubtitleEntry>,
    cps_profile: String,
    max_chars_per_line: usize,
) -> Vec<QCIssue> {
    let profile = match cps_profile.to_lowercase().as_str() {
        "conservative" => CPSProfile::Conservative,
        "relaxed" => CPSProfile::Relaxed,
        _ => CPSProfile::Standard,
    };
    run_qc(&entries, &profile, max_chars_per_line, None, None, None)
}

#[tauri::command]
fn build_prompt_command(
    entries: Vec<SubtitleEntry>,
    core_indices: Vec<usize>,
    source_lang: String,
    target_lang: String,
    tone: String,
) -> String {
    let settings = ProjectSettings {
        source_lang,
        target_lang,
        tone,
        ..Default::default()
    };

    let payload = build_payload(&entries, &core_indices);
    build_prompt(&settings, &payload, core_indices.len(), None)
}

#[tauri::command]
fn parse_response_command(
    response_text: String,
    expected_indices: Vec<usize>,
    allowed_indices: Option<Vec<usize>>,
) -> ParseResult {
    parse_response(&response_text, &expected_indices, allowed_indices.as_deref())
}

#[tauri::command]
async fn validate_api_key_command(api_key: String, model: Option<String>) -> Result<String, String> {
    log::info!("Validating Gemini API key...");
    let client = GeminiClient::new(api_key, model, None);
    match client.validate_key().await {
        Ok(res) => {
            log::info!("API key validated successfully.");
            Ok(res)
        }
        Err(e) => {
            log::error!("API key validation failed: {}", e);
            Err(e)
        }
    }
}

#[tauri::command]
async fn translate_chunk_command(
    api_key: String,
    prompt: String,
    primary_model: Option<String>,
    is_json: Option<bool>,
) -> Result<String, String> {
    log::info!("Translating chunk with Gemini API...");
    let client = GeminiClient::new(api_key, primary_model, None);
    match client.generate(&prompt, None, None, is_json).await {
        Ok(res) => {
            log::info!("Chunk translation successful.");
            Ok(res)
        }
        Err(e) => {
            log::error!("Chunk translation failed: {}", e);
            Err(e)
        }
    }
}

#[tauri::command]
async fn translate_chunk_stream_command(
    app_handle: tauri::AppHandle,
    api_key: String,
    prompt: String,
    primary_model: Option<String>,
    is_json: Option<bool>,
    chunk_index: usize,
) -> Result<String, String> {
    log::info!("Streaming chunk {} with Gemini API...", chunk_index);
    let client = GeminiClient::new(api_key, primary_model, None);
    client.stream_generate(&prompt, None, None, is_json, &app_handle, chunk_index).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                match core::db::init_db(&handle).await {
                    Ok(pool) => {
                        handle.manage(pool);
                        log::info!("Database initialized successfully.");
                    }
                    Err(e) => log::error!("Failed to initialize database: {}", e),
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_srt_command,
            chunk_subtitles_command,
            export_srt_command,
            run_qc_command,
            build_prompt_command,
            parse_response_command,
            validate_api_key_command,
            translate_chunk_command,
            translate_chunk_stream_command,
            save_tm_entry_command,
            find_tm_match_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
