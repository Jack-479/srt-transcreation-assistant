use std::collections::HashSet;
use super::models::{Chunk, SubtitleEntry};

pub fn build_chunks(
    entries: &[SubtitleEntry],
    chunk_size: usize,
    overlap: usize,
    skip_indices: &HashSet<usize>,
) -> Result<Vec<Chunk>, String> {
    if chunk_size == 0 {
        return Err("chunk_size must be positive".to_string());
    }

    let n = entries.len();
    if n == 0 {
        return Ok(Vec::new());
    }

    let mut chunks = Vec::new();
    let mut chunk_idx = 0;
    let mut start = 0;

    while start < n {
        let end = (start + chunk_size).min(n);
        let core = &entries[start..end];
        let core_indices: Vec<usize> = core
            .iter()
            .map(|e| e.index)
            .filter(|idx| !skip_indices.contains(idx))
            .collect();

        let pad_start = start.saturating_sub(overlap);
        let pad_end = (end + overlap).min(n);
        let window = entries[pad_start..pad_end].to_vec();

        chunks.push(Chunk {
            chunk_index: chunk_idx,
            entries: window,
            core_indices,
        });

        chunk_idx += 1;
        start = end;
    }

    Ok(chunks)
}
