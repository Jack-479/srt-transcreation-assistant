use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum CPSProfile {
    Conservative,
    #[default]
    Standard,
    Relaxed,
}

impl CPSProfile {
    pub fn value(&self) -> &'static str {
        match self {
            CPSProfile::Conservative => "conservative",
            CPSProfile::Standard => "standard",
            CPSProfile::Relaxed => "relaxed",
        }
    }

    pub fn limit_for_script(&self, script: &str) -> f64 {
        if script == "cjk" {
            match self {
                CPSProfile::Conservative => 7.0,
                CPSProfile::Standard => 9.0,
                CPSProfile::Relaxed => 12.0,
            }
        } else {
            match self {
                CPSProfile::Conservative => 15.0,
                CPSProfile::Standard => 18.0,
                CPSProfile::Relaxed => 20.0,
            }
        }
    }
}


// CJK Unicode character ranges
const CJK_RANGES: &[(u32, u32)] = &[
    (0x3040, 0x30FF),   // Hiragana + Katakana
    (0x3400, 0x4DBF),   // CJK Extension A
    (0x4E00, 0x9FFF),   // CJK Unified Ideographs
    (0xF900, 0xFAFF),   // CJK Compatibility Ideographs
    (0xAC00, 0xD7A3),   // Hangul Syllables
    (0x1100, 0x11FF),   // Hangul Jamo
    (0x3130, 0x318F),   // Hangul Compatibility Jamo
    (0xFF00, 0xFFEF),   // Fullwidth forms
];

pub fn strip_tags(text: &str) -> String {
    let no_breaks = text.replace("\\N", "\n").replace("\\n", " ");
    
    // Regex 1: HTML-style tags <i>, <b>, etc.
    let re_tags = regex::Regex::new(r"</?[a-zA-Z][^>]*>").unwrap();
    let no_tags = re_tags.replace_all(&no_breaks, "");

    // Regex 2: ASS tags {\an8}
    let re_ass = regex::Regex::new(r"\{[^}]*\}").unwrap();
    let no_ass = re_ass.replace_all(&no_tags, "");

    // Regex 3: Furigana / ruby annotations ｜漢字《かんじ》 -> 漢字
    let re_furigana = regex::Regex::new(r"｜?([^｜《》]+)《[^》]*》").unwrap();
    let no_furigana = re_furigana.replace_all(&no_ass, "$1");

    no_furigana.to_string()
}

pub fn detect_script(text: &str) -> String {
    if text.is_empty() {
        return "latin".to_string();
    }
    let mut cjk_count = 0;
    let mut letter_count = 0;

    for ch in text.chars() {
        let code = ch as u32;
        let is_cjk = CJK_RANGES.iter().any(|&(lo, hi)| code >= lo && code <= hi);
        if ch.is_alphabetic() || is_cjk {
            letter_count += 1;
            if is_cjk {
                cjk_count += 1;
            }
        }
    }

    if letter_count == 0 {
        return "latin".to_string();
    }

    if (cjk_count as f64 / letter_count as f64) > 0.4 {
        "cjk".to_string()
    } else {
        "latin".to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleEntry {
    pub index: usize,
    pub start_time: String, // "00:01:20,000"
    pub end_time: String,   // "00:01:23,500"
    pub start_ms: u64,
    pub end_ms: u64,
    pub content: String,
    pub translated: Option<String>,
    pub reviewed: bool,
    pub speaker: Option<String>,
}

impl SubtitleEntry {
    pub fn duration_seconds(&self) -> f64 {
        if self.end_ms <= self.start_ms {
            0.0
        } else {
            (self.end_ms - self.start_ms) as f64 / 1000.0
        }
    }

    pub fn cps(&self, text_opt: Option<&str>) -> f64 {
        let text = text_opt.unwrap_or_else(|| {
            self.translated.as_deref().unwrap_or(&self.content)
        });
        let plain = strip_tags(text);
        let dur = self.duration_seconds();
        if dur <= 0.0 {
            f64::INFINITY
        } else {
            plain.chars().count() as f64 / dur
        }
    }

    pub fn script(&self, text_opt: Option<&str>) -> String {
        let text = text_opt.unwrap_or_else(|| {
            self.translated.as_deref().unwrap_or(&self.content)
        });
        detect_script(&strip_tags(text))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chunk {
    pub chunk_index: usize,
    pub entries: Vec<SubtitleEntry>,
    pub core_indices: Vec<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QCIssue {
    pub entry_index: usize,
    pub severity: String, // "warning" | "error"
    pub code: String,
    pub message: String,
    pub fixable_by_subtitle_edit: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CharacterContext {
    pub label: String,
    pub apparent_role: String,
    pub honorific_style: String,
    pub tone_notes: String,
    pub relationships: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SceneContext {
    pub entry_range: String,
    pub setting: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RecurringTerm {
    pub term: String,
    pub suggested_translation: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ContextData {
    pub characters: Vec<CharacterContext>,
    pub scenes: Vec<SceneContext>,
    pub recurring_terms: Vec<RecurringTerm>,
    pub register_notes: String,
    pub continuity_notes: String,
    pub raw_response: String,
}

impl ContextData {
    pub fn is_empty(&self) -> bool {
        self.characters.is_empty()
            && self.scenes.is_empty()
            && self.recurring_terms.is_empty()
            && self.register_notes.is_empty()
            && self.continuity_notes.is_empty()
    }

    pub fn condensed_block(&self) -> String {
        if self.is_empty() {
            return String::new();
        }
        let mut lines = Vec::new();
        if !self.characters.is_empty() {
            lines.push("Characters:".to_string());
            for c in &self.characters {
                let mut bits = vec![c.label.clone()];
                if !c.apparent_role.is_empty() {
                    bits.push(format!("({})", c.apparent_role));
                }
                if !c.honorific_style.is_empty() {
                    bits.push(format!("honorifics: {}", c.honorific_style));
                }
                if !c.relationships.is_empty() {
                    bits.push(format!("relationships: {}", c.relationships));
                }
                lines.push(format!("  - {}", bits.join(", ")));
            }
        }
        if !self.register_notes.is_empty() {
            lines.push(format!("Register notes: {}", self.register_notes));
        }
        if !self.continuity_notes.is_empty() {
            lines.push(format!("Continuity notes: {}", self.continuity_notes));
        }
        lines.join("\n")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSettings {
    pub source_path: String,
    pub source_lang: String,
    pub target_lang: String,
    pub tone: String,
    pub cps_profile: CPSProfile,
    pub max_chars_per_line: usize,
    pub chunk_size: usize,
    pub chunk_overlap: usize,
    pub bom_on_export: bool,
    pub detected_encoding: String,
    pub passthrough_interjections: bool,
    pub reuse_duplicate_translations: bool,
    pub use_dictionary: bool,
    pub use_linguistic_notes: bool,
    pub active_profile: String,
    pub context_window_preset: String,
    pub use_power_dynamics: bool,
}

impl Default for ProjectSettings {
    fn default() -> Self {
        Self {
            source_path: String::new(),
            source_lang: "English".to_string(),
            target_lang: "Spanish".to_string(),
            tone: String::new(),
            cps_profile: CPSProfile::Standard,
            max_chars_per_line: 42,
            chunk_size: 200,
            chunk_overlap: 3,
            bom_on_export: true,
            detected_encoding: "utf-8".to_string(),
            passthrough_interjections: false,
            reuse_duplicate_translations: true,
            use_dictionary: true,
            use_linguistic_notes: true,
            active_profile: "natural".to_string(),
            context_window_preset: "large".to_string(),
            use_power_dynamics: true,
        }
    }
}
