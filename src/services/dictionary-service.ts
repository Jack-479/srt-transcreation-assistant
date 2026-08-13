/**
 * dictionary-service.ts
 * 
 * Client-side dictionary service for the SRT Transcreation Assistant.
 * Stores language dictionaries in localStorage, seeded from built-in data.
 * Provides lookup, add, delete, import, export, and normalization utilities.
 */
import { LanguageDictionary, DictionaryEntry, DICT_LANG_CODES } from '../types';
import { SEED_DICTIONARIES } from '../data/dictionary-seed';

// ─── Storage keys ─────────────────────────────────────────────────────────
function storageKey(langCode: string): string {
  return `srt_dict_${langCode}`;
}

// ─── Normalize a source text key ──────────────────────────────────────────
export function normalizeKey(text: string): string {
  return text
    .replace(/[\s]+/g, ' ')
    .replace(/[.!?…、。！？,]+$/g, '')
    .replace(/^[.!?…、。！？,]+/g, '')
    .trim();
}

// ─── Load / initialize a dictionary ──────────────────────────────────────
export function loadDictionary(langCode: string): LanguageDictionary {
  const key = storageKey(langCode);
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      return JSON.parse(raw) as LanguageDictionary;
    } catch {
      // corrupt — fall through to seed
    }
  }
  // First time: seed from built-in data
  const seed = SEED_DICTIONARIES[langCode];
  if (seed) {
    saveDictionary(langCode, seed);
    return seed;
  }
  // Unknown lang — return empty
  const empty: LanguageDictionary = { interjections: {}, common_phrases: {} };
  saveDictionary(langCode, empty);
  return empty;
}

// ─── Persist dictionary ───────────────────────────────────────────────────
export function saveDictionary(langCode: string, dict: LanguageDictionary): void {
  localStorage.setItem(storageKey(langCode), JSON.stringify(dict));
}

// ─── Lookup a single source text ──────────────────────────────────────────
export function lookupEntry(
  dict: LanguageDictionary,
  sourceText: string
): DictionaryEntry | null {
  const key = normalizeKey(sourceText);
  if (!key) return null;

  // Exact match first
  const inInter = dict.interjections[key];
  if (inInter) return inInter;
  const inPhrase = dict.common_phrases[key];
  if (inPhrase) return inPhrase;

  // Fuzzy: strip trailing small kana + punctuation variants
  for (const table of [dict.interjections, dict.common_phrases]) {
    for (const [k, entry] of Object.entries(table)) {
      if (
        k.length > 0 &&
        (key.startsWith(k) || k.startsWith(key)) &&
        Math.abs(k.length - key.length) <= 1
      ) {
        return entry;
      }
    }
  }
  return null;
}

// ─── Look up text by source language name (from ProjectConfig) ────────────
export function lookupByLang(
  sourceLang: string,
  sourceText: string
): DictionaryEntry | null {
  const code = DICT_LANG_CODES[sourceLang];
  if (!code) return null;
  const dict = loadDictionary(code);
  return lookupEntry(dict, sourceText);
}

// ─── Add/update an entry ──────────────────────────────────────────────────
export function addDictionaryEntry(
  langCode: string,
  source: string,
  translation: string,
  category: 'moan' | 'phrase'
): void {
  const key = normalizeKey(source);
  if (!key || !translation.trim()) return;
  const dict = loadDictionary(langCode);
  const entry: DictionaryEntry = { source, translation: translation.trim(), category };
  if (category === 'moan') {
    dict.interjections[key] = entry;
  } else {
    dict.common_phrases[key] = entry;
  }
  saveDictionary(langCode, dict);
}

// ─── Delete an entry ──────────────────────────────────────────────────────
export function deleteDictionaryEntry(
  langCode: string,
  normalizedKey: string,
  table: 'interjections' | 'common_phrases'
): void {
  const dict = loadDictionary(langCode);
  delete dict[table][normalizedKey];
  saveDictionary(langCode, dict);
}

// ─── All entries as flat list ─────────────────────────────────────────────
export interface FlatDictionaryEntry {
  key: string;
  entry: DictionaryEntry;
  table: 'interjections' | 'common_phrases';
}

export function allEntries(dict: LanguageDictionary): FlatDictionaryEntry[] {
  const result: FlatDictionaryEntry[] = [];
  for (const [key, entry] of Object.entries(dict.interjections)) {
    result.push({ key, entry, table: 'interjections' });
  }
  for (const [key, entry] of Object.entries(dict.common_phrases)) {
    result.push({ key, entry, table: 'common_phrases' });
  }
  return result.sort((a, b) => a.key.localeCompare(b.key, undefined, { sensitivity: 'base' }));
}

// ─── Pre-resolve: mark dictionary hits in entries before chunking ─────────
export interface PreResolveResult {
  resolvedTranslations: Record<number, string>;  // index → translation
  skipIndices: Set<number>;
}

export function preResolveDictionary(
  entries: { index: number; content: string }[],
  sourceLang: string
): PreResolveResult {
  const code = DICT_LANG_CODES[sourceLang];
  if (!code) return { resolvedTranslations: {}, skipIndices: new Set() };

  const dict = loadDictionary(code);
  const resolvedTranslations: Record<number, string> = {};
  const skipIndices = new Set<number>();

  for (const entry of entries) {
    const hit = lookupEntry(dict, entry.content);
    if (hit) {
      resolvedTranslations[entry.index] = hit.translation;
      skipIndices.add(entry.index);
    }
  }
  return { resolvedTranslations, skipIndices };
}

// ─── Export/Import JSON ───────────────────────────────────────────────────
export function exportDictionaryJSON(langCode: string): string {
  const dict = loadDictionary(langCode);
  return JSON.stringify(dict, null, 2);
}

export function importDictionaryJSON(langCode: string, jsonText: string): number {
  const data = JSON.parse(jsonText) as Partial<LanguageDictionary>;
  const dict = loadDictionary(langCode);
  let count = 0;
  for (const [key, entry] of Object.entries(data.interjections ?? {})) {
    dict.interjections[key] = entry;
    count++;
  }
  for (const [key, entry] of Object.entries(data.common_phrases ?? {})) {
    dict.common_phrases[key] = entry;
    count++;
  }
  saveDictionary(langCode, dict);
  return count;
}

export function resetToSeed(langCode: string): void {
  const seed = SEED_DICTIONARIES[langCode];
  if (seed) saveDictionary(langCode, seed);
}
