use std::fs;
use std::path::{Path, PathBuf};
use regex::Regex;

use super::models::SubtitleEntry;

pub fn parse_timestamp_ms(ts: &str) -> u64 {
    // Expected format: "00:01:20,000" or "00:01:20.000"
    let parts: Vec<&str> = ts.split(|c| [':', ',', '.'].contains(&c)).collect();
    if parts.len() == 4 {
        let h: u64 = parts[0].parse().unwrap_or(0);
        let m: u64 = parts[1].parse().unwrap_or(0);
        let s: u64 = parts[2].parse().unwrap_or(0);
        let ms: u64 = parts[3].parse().unwrap_or(0);
        return h * 3_600_000 + m * 60_000 + s * 1000 + ms;
    }
    0
}

pub fn format_timestamp_ms(ms: u64) -> String {
    let h = ms / 3_600_000;
    let rem_h = ms % 3_600_000;
    let m = rem_h / 60_000;
    let rem_m = rem_h % 60_000;
    let s = rem_m / 1000;
    let millis = rem_m % 1000;
    format!("{:02}:{:02}:{:02},{:03}", h, m, s, millis)
}

pub fn parse_srt_content(raw_text: &str) -> Vec<SubtitleEntry> {
    let mut entries = Vec::new();
    let normalized = raw_text.replace("\r\n", "\n").replace('\r', "\n");
    let blocks: Vec<&str> = normalized.split("\n\n").collect();

    let ts_re = Regex::new(r"(?m)^(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})").unwrap();

    let mut auto_idx = 1;

    for block in blocks {
        let trimmed = block.trim();
        if trimmed.is_empty() {
            continue;
        }

        let lines: Vec<&str> = trimmed.lines().collect();
        if lines.len() < 2 {
            continue;
        }

        let mut index: usize = auto_idx;
        let header_idx;

        // Try reading index from line 0
        if let Ok(parsed_index) = lines[0].trim().parse::<usize>() {
            index = parsed_index;
        }

        let mut found_ts = false;
        for (i, line) in lines.iter().enumerate() {
            if let Some(caps) = ts_re.captures(line) {
                header_idx = i;
                found_ts = true;
                
                let start_str = caps[1].replace('.', ",");
                let end_str = caps[2].replace('.', ",");
                let start_ms = parse_timestamp_ms(&start_str);
                let end_ms = parse_timestamp_ms(&end_str);

                let content_lines = &lines[(header_idx + 1)..];
                let content = content_lines.join("\n").trim().to_string();

                entries.push(SubtitleEntry {
                    index,
                    start_time: start_str,
                    end_time: end_str,
                    start_ms,
                    end_ms,
                    content,
                    translated: None,
                    reviewed: false,
                    speaker: None,
                });

                auto_idx += 1;
                break;
            }
        }
        
        if !found_ts {
            // Block didn't have a valid timestamp line, skip it.
            continue;
        }
    }

    // Ensure indices are sequential and unique
    for (i, entry) in entries.iter_mut().enumerate() {
        entry.index = i + 1;
    }

    entries
}

pub fn load_srt(path: &Path) -> Result<(Vec<SubtitleEntry>, String), String> {
    let bytes = fs::read(path).map_err(|e| format!("Failed to read file: {}", e))?;

    // Handle UTF-8 with BOM or UTF-8 plain
    let (text, encoding) = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        let decoded = String::from_utf8_lossy(&bytes[3..]).to_string();
        (decoded, "utf-8-sig".to_string())
    } else {
        match String::from_utf8(bytes.clone()) {
            Ok(valid_utf8) => (valid_utf8, "utf-8".to_string()),
            Err(_) => {
                // Fallback decode lossy
                let lossy = String::from_utf8_lossy(&bytes).to_string();
                (lossy, "utf-8-lossy".to_string())
            }
        }
    };

    let entries = parse_srt_content(&text);
    if entries.is_empty() {
        return Err("No valid subtitle cues found in file.".to_string());
    }

    Ok((entries, encoding))
}

pub fn entries_to_srt_text(entries: &[SubtitleEntry], use_translated: bool, bilingual: bool) -> String {
    let mut out = String::new();
    for entry in entries {
        out.push_str(&entry.index.to_string());
        out.push('\n');
        out.push_str(&format!("{} --> {}\n", entry.start_time, entry.end_time));

        if bilingual {
            let translated = entry.translated.as_deref().unwrap_or("");
            if !translated.is_empty() {
                out.push_str(&format!("{}\n{}\n", entry.content, translated));
            } else {
                out.push_str(&format!("{}\n", entry.content));
            }
        } else {
            let text = if use_translated {
                let trans = entry.translated.as_deref().unwrap_or("");
                if trans.trim().is_empty() {
                    &entry.content
                } else {
                    trans
                }
            } else {
                &entry.content
            };
            out.push_str(text);
            out.push('\n');
        }
        out.push('\n');
    }
    out
}

pub fn export_srt(
    entries: &[SubtitleEntry],
    dest_path: &Path,
    bom: bool,
    use_translated: bool,
    bilingual: bool,
) -> Result<PathBuf, String> {
    let content = entries_to_srt_text(entries, use_translated, bilingual);

    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }

    let mut bytes = Vec::new();
    if bom {
        bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    bytes.extend_from_slice(content.as_bytes());

    fs::write(dest_path, bytes).map_err(|e| format!("Failed to write export file: {}", e))?;

    Ok(dest_path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_srt_content() {
        let content = "1\n00:00:01,000 --> 00:00:03,000\nHello world!\n\n2\n00:00:04,000 --> 00:00:06,000\nSecond cue\n";
        let entries = parse_srt_content(content);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].content, "Hello world!");
        assert_eq!(entries[1].start_ms, 4000);
    }
}

