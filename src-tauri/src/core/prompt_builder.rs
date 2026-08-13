use std::collections::HashMap;
use super::models::{ContextData, ProjectSettings, SubtitleEntry};

pub fn build_glossary_block(glossary: &HashMap<String, String>) -> String {
    if glossary.is_empty() {
        return String::new();
    }
    let mut lines = vec!["Use these preferred translations for specific terms:".to_string()];
    for (term, preferred) in glossary {
        lines.push(format!("   - \"{}\" -> \"{}\"", term, preferred));
    }
    lines.join("\n") + "\n"
}

pub fn build_context_block(context: Option<&ContextData>) -> String {
    if let Some(ctx) = context {
        if ctx.is_empty() {
            return String::new();
        }
        let condensed = ctx.condensed_block();
        if condensed.is_empty() {
            return String::new();
        }
        return format!("Scene/character context (for consistency, not for re-translation):\n{}\n", condensed);
    }
    String::new()
}

pub fn build_power_dynamic_block() -> String {
    r#"Power-Dynamic Logic Chain:
1. Identify DOM (dominant) and SUB (submissive) speakers from context.
2. DOM lines (commands, insults): Preserve full aggression; do not sanitize.
3. SUB lines: Follow resistance -> surrender arc by current emotion.
4. Insult terms: Preserve original aggression in target language.
"#
    .to_string()
}

const MARKER_RULES: &str = r#"
CRITICAL OUTPUT RULES (read before translating):
1. Each line marked "[[N]]" is a subtitle marker where N is the entry index.
2. You MUST output each [[N]] marker on its own line, followed immediately by the translation on the next line.
3. Do NOT skip, reorder, or drop any [[N]] markers.
4. Keep original formatting tags like <i> or <b> intact.
"#;

pub fn build_payload(entries: &[SubtitleEntry], core_indices: &[usize]) -> String {
    let core_set: std::collections::HashSet<usize> = core_indices.iter().cloned().collect();
    let mut payload = String::new();

    for entry in entries {
        if core_set.contains(&entry.index) {
            payload.push_str(&format!("[[{}]]\n{}\n\n", entry.index, entry.content));
        } else {
            payload.push_str(&format!(
                "[[{}]] (context only -- no translation needed)\n{}\n\n",
                entry.index, entry.content
            ));
        }
    }
    payload
}

pub fn build_prompt(
    settings: &ProjectSettings,
    payload: &str,
    entry_count: usize,
    context: Option<&ContextData>,
) -> String {
    let mut prompt = String::new();

    prompt.push_str(&format!(
        "You are an expert subtitle transcreator translating {} entries from {} to {}.\n",
        entry_count, settings.source_lang, settings.target_lang
    ));

    if !settings.tone.is_empty() {
        prompt.push_str(&format!("Desired tone: {}\n", settings.tone));
    }

    let ctx_block = build_context_block(context);
    if !ctx_block.is_empty() {
        prompt.push_str(&ctx_block);
        prompt.push('\n');
    }

    if settings.use_power_dynamics {
        prompt.push_str(&build_power_dynamic_block());
        prompt.push('\n');
    }

    prompt.push_str(MARKER_RULES);
    prompt.push_str("\n### SUBTITLE PAYLOAD ###\n");
    prompt.push_str(payload);

    prompt
}
