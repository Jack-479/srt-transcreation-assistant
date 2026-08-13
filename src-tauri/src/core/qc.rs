use std::collections::HashMap;
use regex::Regex;

use super::models::{
    strip_tags, CPSProfile, ContextData, QCIssue, SubtitleEntry,
};

pub fn count_number_tokens(text: &str) -> usize {
    let re = Regex::new(r"(\d[\d,./]*|\b[一二三四五六七八九十百千万億兆]+\b)").unwrap();
    re.find_iter(text).count()
}

pub fn run_qc(
    entries: &[SubtitleEntry],
    _cps_profile: &CPSProfile,
    max_chars_per_line: usize,
    _context: Option<&ContextData>,
    glossary: Option<&HashMap<String, String>>,
    _active_profile: Option<&str>,
) -> Vec<QCIssue> {
    let mut issues = Vec::new();
    let mut prev_end_ms: Option<u64> = None;

    let any_translated = entries.iter().any(|e| e.translated.is_some());

    let placeholder_re = Regex::new(
        r"(?i)\[TRANSLATION\]|\[.*?NEEDED.*?\]|<translation>|^\s*N/A\s*$|^\s*\.\.\.\s*$"
    ).unwrap();

    let incomplete_re = Regex::new(r"[a-zA-Z0-9][,]\s*$|[a-zA-Z]{4,}\s*$").unwrap();

    for e in entries {
        let translated = e.translated.as_deref();
        let text = translated.unwrap_or(&e.content);
        let plain = strip_tags(text);

        // 1. Missing translation (error) - only if translation pass started
        if any_translated && translated.is_none() {
            issues.push(QCIssue {
                entry_index: e.index,
                severity: "error".to_string(),
                code: "untranslated".to_string(),
                message: "Entry has no translation — needs AI.".to_string(),
                fixable_by_subtitle_edit: false,
            });
            prev_end_ms = Some(e.end_ms);
            continue;
        }

        // 2. Empty text
        if plain.trim().is_empty() {
            issues.push(QCIssue {
                entry_index: e.index,
                severity: "warning".to_string(),
                code: "empty_text".to_string(),
                message: "Entry text is empty.".to_string(),
                fixable_by_subtitle_edit: false,
            });
        }

        if let Some(tr) = translated {
            // 3. Same as source
            if !tr.trim().is_empty() && tr.trim() == e.content.trim() {
                issues.push(QCIssue {
                    entry_index: e.index,
                    severity: "warning".to_string(),
                    code: "same_as_source".to_string(),
                    message: "Translation is identical to source — possible untranslated passthrough.".to_string(),
                    fixable_by_subtitle_edit: false,
                });
            }

            // 4. Placeholder text
            if placeholder_re.is_match(tr) {
                issues.push(QCIssue {
                    entry_index: e.index,
                    severity: "error".to_string(),
                    code: "placeholder".to_string(),
                    message: "Translation contains placeholder or stub text left by the AI.".to_string(),
                    fixable_by_subtitle_edit: false,
                });
            }

            // 5. Number sequence mismatch
            let src_nums = count_number_tokens(&e.content);
            let tgt_nums = count_number_tokens(tr);
            if src_nums >= 4 && tgt_nums == 0 {
                issues.push(QCIssue {
                    entry_index: e.index,
                    severity: "warning".to_string(),
                    code: "number_mistranslation".to_string(),
                    message: format!("Source has {} number tokens but translation has none — possible content shift.", src_nums),
                    fixable_by_subtitle_edit: false,
                });
            }

            // 6. Incomplete sentence
            if plain.len() > 20 && incomplete_re.is_match(&plain) {
                issues.push(QCIssue {
                    entry_index: e.index,
                    severity: "warning".to_string(),
                    code: "incomplete_sentence".to_string(),
                    message: "Translation appears to end mid-sentence without terminal punctuation.".to_string(),
                    fixable_by_subtitle_edit: false,
                });
            }
        }

        // 7. Timing checks (SubtitleEdit fixable)
        if e.end_ms <= e.start_ms {
            issues.push(QCIssue {
                entry_index: e.index,
                severity: "error".to_string(),
                code: "bad_timing".to_string(),
                message: "End time is not after start time.".to_string(),
                fixable_by_subtitle_edit: true,
            });
        }

        if let Some(p_end) = prev_end_ms {
            if e.start_ms < p_end {
                issues.push(QCIssue {
                    entry_index: e.index,
                    severity: "warning".to_string(),
                    code: "overlap".to_string(),
                    message: "Overlaps with the previous entry.".to_string(),
                    fixable_by_subtitle_edit: true,
                });
            }
        }


        // 9. Line length check
        let longest_line = text.lines().map(|l| l.chars().count()).max().unwrap_or(0);
        if longest_line > max_chars_per_line {
            issues.push(QCIssue {
                entry_index: e.index,
                severity: "warning".to_string(),
                code: "line_too_long".to_string(),
                message: format!("Longest line is {} chars (max {}).", longest_line, max_chars_per_line),
                fixable_by_subtitle_edit: true,
            });
        }

        // 10. Line count check
        let line_count = plain.lines().filter(|l| !l.trim().is_empty()).count();
        if line_count > 2 {
            issues.push(QCIssue {
                entry_index: e.index,
                severity: "warning".to_string(),
                code: "too_many_lines".to_string(),
                message: format!("Entry has {} lines (max 2).", line_count),
                fixable_by_subtitle_edit: true,
            });
        }

        // 11. Glossary check
        if let Some(g) = glossary {
            for (term, preferred) in g {
                if !term.is_empty() && e.content.contains(term)
                    && !preferred.is_empty() && !plain.to_lowercase().contains(&preferred.to_lowercase()) {
                        issues.push(QCIssue {
                            entry_index: e.index,
                            severity: "warning".to_string(),
                            code: "glossary_mismatch".to_string(),
                            message: format!(
                                "Source contains glossary term '{}' but translation doesn't contain '{}'.",
                                term, preferred
                            ),
                            fixable_by_subtitle_edit: false,
                        });
                    }
            }
        }

        prev_end_ms = Some(e.end_ms);
    }

    issues
}
