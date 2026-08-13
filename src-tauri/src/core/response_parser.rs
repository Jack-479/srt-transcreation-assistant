use std::collections::{HashMap, HashSet};
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseResult {
    pub translations: HashMap<usize, String>,
    pub missing: Vec<usize>,
    pub duplicated: Vec<usize>,
    pub unexpected: Vec<usize>,
    pub extra_context: Vec<usize>,
    pub looks_truncated: bool,
    pub ok: bool,
}

fn check_looks_truncated(missing: &[usize], expected_indices: &[usize]) -> bool {
    if missing.is_empty() || expected_indices.is_empty() {
        return false;
    }
    let mut sorted_expected = expected_indices.to_vec();
    sorted_expected.sort();

    if missing.len() > sorted_expected.len() {
        return false;
    }

    let tail = &sorted_expected[(sorted_expected.len() - missing.len())..];
    let mut sorted_missing = missing.to_vec();
    sorted_missing.sort();

    sorted_missing == tail
}

pub fn parse_response(
    response_text: &str,
    expected_indices: &[usize],
    allowed_indices: Option<&[usize]>,
) -> ParseResult {
    let marker_re = Regex::new(r"\[\[(\d+)\]\]").unwrap();
    let mut matches = Vec::new();

    for m in marker_re.find_iter(response_text) {
        if let Some(caps) = marker_re.captures(m.as_str()) {
            if let Ok(idx) = caps[1].parse::<usize>() {
                matches.push((idx, m.end(), m.start()));
            }
        }
    }

    let mut translations = HashMap::new();
    let mut seen = Vec::new();

    for i in 0..matches.len() {
        let (idx, content_start, _) = matches[i];
        let content_end = if i + 1 < matches.len() {
            matches[i + 1].2
        } else {
            response_text.len()
        };

        let text = response_text[content_start..content_end].trim().to_string();
        seen.push(idx);

        translations.entry(idx).or_insert(text);
    }

    let expected_set: HashSet<usize> = expected_indices.iter().cloned().collect();
    let allowed_set: HashSet<usize> = if let Some(allowed) = allowed_indices {
        expected_set.union(&allowed.iter().cloned().collect()).cloned().collect()
    } else {
        expected_set.clone()
    };

    let seen_set: HashSet<usize> = seen.iter().cloned().collect();

    let mut missing: Vec<usize> = expected_set.difference(&seen_set).cloned().collect();
    missing.sort();

    let mut extra_context: Vec<usize> = (seen_set.difference(&expected_set).cloned().collect::<HashSet<usize>>())
        .intersection(&allowed_set)
        .cloned()
        .collect();
    extra_context.sort();

    let mut unexpected: Vec<usize> = seen_set.difference(&allowed_set).cloned().collect();
    unexpected.sort();

    let mut seen_counts: HashMap<usize, usize> = HashMap::new();
    for &idx in &seen {
        *seen_counts.entry(idx).or_insert(0) += 1;
    }
    let mut duplicated: Vec<usize> = seen_counts
        .into_iter()
        .filter(|&(_, count)| count > 1)
        .map(|(idx, _)| idx)
        .collect();
    duplicated.sort();

    let looks_truncated = check_looks_truncated(&missing, expected_indices);
    let ok = missing.is_empty() && duplicated.is_empty() && unexpected.is_empty();

    ParseResult {
        translations,
        missing,
        duplicated,
        unexpected,
        extra_context,
        looks_truncated,
        ok,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_response_success() {
        let resp = "[[1]]\nHello!\n\n[[2]]\nHow are you?\n";
        let res = parse_response(resp, &[1, 2], None);
        assert!(res.ok);
        assert_eq!(res.translations.get(&1).unwrap(), "Hello!");
        assert_eq!(res.translations.get(&2).unwrap(), "How are you?");
    }

    #[test]
    fn test_parse_response_missing() {
        let resp = "[[1]]\nHello!\n";
        let res = parse_response(resp, &[1, 2], None);
        assert!(!res.ok);
        assert_eq!(res.missing, vec![2]);
        assert!(res.looks_truncated);
    }
}

