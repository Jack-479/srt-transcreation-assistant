use std::collections::HashMap;
use super::models::SubtitleEntry;

pub fn merge_translations(
    entries: &mut [SubtitleEntry],
    translations: &HashMap<usize, String>,
) -> usize {
    let mut updated = 0;
    for entry in entries.iter_mut() {
        if let Some(text) = translations.get(&entry.index) {
            entry.translated = Some(text.clone());
            updated += 1;
        }
    }
    updated
}
