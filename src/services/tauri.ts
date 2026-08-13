import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { SubtitleEntry, Chunk, QCIssue, ProjectConfig, EXTRACTION_TEMPLATE } from '../types';

export interface StreamPayload {
  chunk_index: number;
  delta: string;
  full_text: string;
}

export async function listenToTranslationStream(
  callback: (payload: StreamPayload) => void
): Promise<UnlistenFn> {
  return await listen<StreamPayload>('translation-stream', (event) => {
    callback(event.payload);
  });
}

export async function translateChunkStream(
  apiKey: string,
  prompt: string,
  primaryModel: string | null,
  isJson: boolean,
  chunkIndex: number
): Promise<string> {
  return await invoke<string>('translate_chunk_stream_command', {
    apiKey,
    prompt,
    primaryModel,
    isJson,
    chunkIndex
  });
}

export async function loadSrtFile(path: string): Promise<[SubtitleEntry[], string]> {
  return await invoke<[SubtitleEntry[], string]>('load_srt_command', { path });
}

export async function chunkSubtitles(
  entries: SubtitleEntry[],
  chunkSize: number,
  overlap: number
): Promise<Chunk[]> {
  return await invoke<Chunk[]>('chunk_subtitles_command', {
    entries,
    chunkSize,
    overlap,
  });
}

export async function exportSrtFile(
  entries: SubtitleEntry[],
  destPath: string,
  bom: boolean,
  bilingual: boolean
): Promise<string> {
  return await invoke<string>('export_srt_command', {
    entries,
    destPath,
    bom,
    bilingual,
  });
}

export async function runQC(
  entries: SubtitleEntry[],
  cpsProfile: string,
  maxCharsPerLine: number
): Promise<QCIssue[]> {
  return await invoke<QCIssue[]>('run_qc_command', {
    entries,
    cpsProfile,
    maxCharsPerLine,
  });
}

export async function buildPrompt(
  entries: SubtitleEntry[],
  coreIndices: number[],
  config: ProjectConfig
): Promise<string> {
  return await invoke<string>('build_prompt_command', {
    entries,
    coreIndices,
    sourceLang: config.source_lang,
    targetLang: config.target_lang,
    tone: '',
  });
}

export async function validateApiKey(apiKey: string, model?: string): Promise<string> {
  return await invoke<string>('validate_api_key_command', { apiKey, model });
}

export async function translateChunk(
  apiKey: string,
  prompt: string,
  primaryModel?: string,
  isJson?: boolean
): Promise<string> {
  return await invoke<string>('translate_chunk_command', {
    apiKey,
    prompt,
    primaryModel,
    isJson,
  });
}

export async function parseResponse(
  responseText: string,
  expectedIndices: number[],
  allowedIndices?: number[]
): Promise<{
  translations: Record<number, string>;
  missing: number[];
  duplicated: number[];
  unexpected: number[];
  extra_context: number[];
  looks_truncated: boolean;
  ok: boolean;
}> {
  const translations: Record<number, string> = {};
  const missing: number[] = [];
  const duplicated: number[] = [];
  const unexpected: number[] = [];
  
  try {
    let cleanText = responseText.trim();
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```(?:json)?\s*\n/, '').replace(/```$/, '').trim();
    }
    const parsed = JSON.parse(cleanText);
    if (!Array.isArray(parsed)) throw new Error("Expected JSON array");

    const seen = new Set<number>();
    for (const item of parsed) {
      if (typeof item.index !== 'number' || typeof item.translation !== 'string') continue;
      
      const idx = item.index;
      if (seen.has(idx)) {
        duplicated.push(idx);
      } else {
        seen.add(idx);
        translations[idx] = item.translation;
      }
      
      if (!expectedIndices.includes(idx) && !(allowedIndices && allowedIndices.includes(idx))) {
        unexpected.push(idx);
      }
    }
    
    for (const expected of expectedIndices) {
      if (!seen.has(expected)) {
        missing.push(expected);
      }
    }
    
    return {
      translations,
      missing,
      duplicated,
      unexpected,
      extra_context: [],
      looks_truncated: false,
      ok: missing.length === 0 && duplicated.length === 0,
    };
  } catch (e) {
    return {
      translations: {},
      missing: expectedIndices,
      duplicated: [],
      unexpected: [],
      extra_context: [],
      looks_truncated: true,
      ok: false,
    };
  }
}

export function buildContextPrompt(entries: SubtitleEntry[], sourceLang: string, targetLang: string): string {
  const payload = entries.map(e => `[[${e.index}]]\n${e.content}`).join('\n\n');
  return EXTRACTION_TEMPLATE
    .replace(/{source_lang}/g, sourceLang || 'the source language')
    .replace(/{target_lang}/g, targetLang || 'the target language')
    .replace(/{payload}/g, payload);
}

export function extractJsonString(text: string): string {
  let clean = text.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*\n/, '').replace(/```$/, '').trim();
  }
  return clean;
}

export async function generateContext(apiKey: string, model: string, entries: SubtitleEntry[], sourceLang: string, targetLang: string): Promise<string> {
  const prompt = buildContextPrompt(entries, sourceLang, targetLang);
  const rawResponse = await translateChunk(apiKey, prompt, model, true);
  return extractJsonString(rawResponse);
}

export async function runFinalReview(
  apiKey: string,
  model: string,
  entries: SubtitleEntry[],
  sourceLang: string,
  targetLang: string
): Promise<QCIssue[]> {
  const payload = entries.map(e => `[${e.index}] Source: ${e.content}\n[${e.index}] Translated: ${e.translated || ''}`).join('\n\n');
  
  // Note: we need to import FINAL_REVIEW_TEMPLATE, so let's make sure it's exported and imported
  // I will just use the string literal here for simplicity or import it. Wait, I should import it at the top.
  // Actually, I can just construct it here or pass the template. Let me import it at the top of tauri.ts.
  const { FINAL_REVIEW_TEMPLATE } = await import('../types');
  const prompt = FINAL_REVIEW_TEMPLATE
    .replace(/{source_lang}/g, sourceLang)
    .replace(/{target_lang}/g, targetLang)
    .replace(/{payload}/g, payload);
    
  const rawResponse = await translateChunk(apiKey, prompt, model, true);
  const clean = extractJsonString(rawResponse);
  
  try {
    const issues = JSON.parse(clean);
    if (Array.isArray(issues)) {
      return issues.map((i: any) => ({
        entry_index: i.entry_index,
        severity: 'warn',
        code: 'AI_REVIEW',
        message: i.issue,
        fixable_by_subtitle_edit: true,
        suggested_fix: i.suggested_fix,
      }));
    }
    return [];
  } catch (e) {
    console.error("Final review parse failed", e);
    return [];
  }
}
