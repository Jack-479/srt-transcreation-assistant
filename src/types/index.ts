// ─── Subtitle Entry ───────────────────────────────────────────────────────
export interface SubtitleEntry {
  index: number;
  start_time: string;
  end_time: string;
  start_ms: number;
  end_ms: number;
  content: string;
  translated?: string;
  reviewed: boolean;
}

export interface Chunk {
  chunk_index: number;
  entries: SubtitleEntry[];
  core_indices: number[];
}

export interface QCIssue {
  entry_index: number;
  severity: string;
  code: string;
  message: string;
  fixable_by_subtitle_edit: boolean;
  suggested_fix?: string;
}

// ─── Config Types ─────────────────────────────────────────────────────────
export type TranslationProfile = 'explicit' | 'cultural' | 'natural' | 'custom';
export type TranslationMode = 'automatic' | 'manual';

export interface ProjectConfig {
  source_lang: string;
  target_lang: string;
  tone: string;
  chunk_size: number;
  chunk_overlap: number;
  max_lines: number;
  bom_on_export: boolean;
  // Profile & model
  active_profile: TranslationProfile;
  primary_model: string;
  fallback_model: string;
  qc_model: string;
  translation_mode: TranslationMode;
  // Context Generation
  context_summary: string;
  // Advanced toggles
  reuse_duplicate_translations: boolean;
  use_linguistic_notes: boolean;
  preserve_honorifics: boolean;
  sfx_filter_mode: 'keep' | 'remove' | 'italicize' | 'bracket';
  auto_ai_review: boolean;
}

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  source_lang: 'Japanese',
  target_lang: 'English',
  tone: 'natural, neutral',
  chunk_size: 200,
  chunk_overlap: 3,
  max_lines: 2,
  bom_on_export: true,
  active_profile: 'natural',
  primary_model: 'gemini-3.6-flash',
  fallback_model: 'gemini-3.1-flash-lite',
  qc_model: 'gemini-3.1-flash-lite',
  translation_mode: 'automatic',
  context_summary: '',
  reuse_duplicate_translations: true,
  use_linguistic_notes: true,
  preserve_honorifics: true,
  sfx_filter_mode: 'keep',
  auto_ai_review: true,
};

// ─── App-wide Settings ────────────────────────────────────────────────────
export interface AppSettings {
  default_api_key: string;
  default_primary_model: string;
  default_qc_model: string;
  default_fallback_model: string;
  concurrent_requests: number;
  bom_on_export: boolean;
  safety_block_none: boolean;
  theme_name: 'slate' | 'ocean' | 'forest' | 'sunset' | 'midnight';
  color_mode: 'dark' | 'light';
  default_translation_mode: TranslationMode;
  default_profile: TranslationProfile;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  default_api_key: '',
  default_primary_model: 'gemini-3.5-flash',
  default_qc_model: 'gemini-3.1-flash-lite',
  default_fallback_model: 'gemini-3.1-flash-lite',
  concurrent_requests: 5,
  bom_on_export: true,
  safety_block_none: true,
  theme_name: 'slate',
  color_mode: 'dark',
  default_translation_mode: 'automatic',
  default_profile: 'natural',
};

// ─── Gemini Models (August 2026) ──────────────────────────────────────────
export interface GeminiModel {
  id: string;
  label: string;
  tier: 'ga' | 'preview' | 'legacy';
  description: string;
}

export const GEMINI_MODELS: GeminiModel[] = [
  { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro', tier: 'ga',
    description: 'GA — The current flagship; best for complex reasoning, agents, and creative work.' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', tier: 'ga',
    description: 'GA — The newest Flash model; optimized for efficiency, coding, and agentic tasks.' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', tier: 'ga',
    description: 'GA — Balanced performance; widely used for sustained agent and coding workflows.' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', tier: 'ga',
    description: 'GA — Highly cost-effective; designed for high-volume automation.' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Legacy)', tier: 'legacy',
    description: '⚠ Legacy — Cost-effective alternatives from the 2.5 family.' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Legacy)', tier: 'legacy',
    description: '⚠ Legacy — Reasoning models from the 2.5 family.' },
];

export const FALLBACK_MODEL_OPTIONS: GeminiModel[] = [
  { id: 'none', label: 'None (no fallback)', tier: 'ga',
    description: 'Do not retry with a fallback model on failure.' },
  ...GEMINI_MODELS,
];

// ─── Profile Catalogue ────────────────────────────────────────────────────
export interface ProfileInfo {
  id: TranslationProfile;
  label: string;
  description: string;
  colorClass: string; // CSS class fragment
}

export const PROFILE_CATALOG: ProfileInfo[] = [
  { id: 'natural', label: 'Natural',
    description: 'Idiomatic, fluent translation. Prioritises how a native speaker would actually say it.',
    colorClass: 'emerald' },
  { id: 'cultural', label: 'Cultural',
    description: 'Preserves honorifics and culturally-specific terms with bracketed glosses on first use.',
    colorClass: 'violet' },
  { id: 'explicit', label: 'Explicit',
    description: 'Direct, plain-language. Everyday vocabulary for all content including mature scenes. No euphemisms.',
    colorClass: 'rose' },
  { id: 'custom', label: 'Custom',
    description: 'User-defined custom template. Fully editable prompt layout.',
    colorClass: 'amber' }
];

// ─── Prompt Profile Templates (built-in) ─────────────────────────────────
export const EXTRACTION_TEMPLATE = `You are a translation assistant preparing to transcreate subtitles from {source_lang} to {target_lang}. Before any line-by-line translation, read through the dialogue below and produce a structured summary that a translator can use to stay consistent across the whole file.

Keep scene summaries high-level and practical.
CRUCIAL TRANSLATION NOTES:
- Explicitly identify the gender and roles (e.g., Submissive/Dominant, Interviewer/Actress). This is critical for resolving missing pronouns in {source_lang} properly.
- Track tone shifts carefully (e.g., shifting from formal polite speech to intimate casual speech).
- Note any specific relationships that dictate pronouns (e.g., addressing someone as "brother" vs literal brother).

Return a strict JSON object with this exact schema:
{
  "characters": [
    {
      "label": "Character A",
      "gender_and_role": "Female, Submissive",
      "honorific_style": "Polite (-san) then shifts to casual",
      "tone_notes": "...",
      "relationships": "..."
    }
  ],
  "scenes": [
    {
      "entry_range": "1-42",
      "setting": "...",
      "summary": "..."
    }
  ],
  "pronoun_and_tone_guide": "Specific instructions on how to handle pronouns and tone shifts to avoid mistranslations.",
  "recurring_terms": [
    {
      "term": "...",
      "suggested_translation": "...",
      "notes": "..."
    }
  ]
}

Respond ONLY with valid JSON. Do not include markdown formatting (like \`\`\`json). Just the raw JSON object.

--- BEGIN DIALOGUE ---

{payload}
`;

const COMMON_HEADER = `You are an elite, professional subtitle transcreator working from {source_lang} to {target_lang}.

This is a high-level TRANSCREATION task, not a literal translation. You must use the surrounding context lines to deeply understand the scene, the speakers' relationships, and the implicit emotions. Your goal is to produce subtitles that:
- Read completely naturally and feel native in {target_lang}.
- Capture the emotional tone, nuance, and true intent of the original.
- Adapt idioms, jokes, and cultural references so they land correctly.
- Work within subtitle constraints (concise, time-synced, highly readable).
- Maintain distinct speaker voice and character personality throughout the entire chunk.

Overall tone / style: {tone}

CRITICAL SUBTITLE RULES:
1. Each subtitle block is marked with [[N]] where N is its number.
2. Do NOT merge, split, renumber, or omit any blocks. There are {count} blocks total (numbered [[1]] through [[{last}]]).
3. Preserve any inline tags (<i>, <b>, <u>) if they still apply in the translation.
4. Keep translations concise — subtitles are time-constrained. Aim for similar length to source where feasible.
5. Blocks marked "(context only — no translation needed)" are crucial for understanding the scene coherence. Read them to understand the flow, but do NOT produce output for those blocks.
6. ALWAYS output Japanese honorifics (e.g. -san, -chan, -sensei) in the translation. If they are in the source, keep them. They can be removed by post-processing later if needed.
7. ALWAYS wrap Sound Effects (SFX) or non-verbal cues (like sighs, pants, moans) in parentheses, e.g., "(pants)". Do NOT use plain text for SFX.
8. Return your translations as a strict JSON array of objects.

JSON RESPONSE SCHEMA:
[
  {
    "index": 1,
    "translation": "The transcreated text for block 1"
  },
  {
    "index": 2,
    "translation": "The transcreated text for block 2"
  }
]

Respond ONLY with valid JSON. Do not include markdown formatting (like \`\`\`json). Just the raw JSON array. No commentary, no explanations, no preamble.`;

export const FINAL_REVIEW_TEMPLATE = `You are a strict QA reviewer for translated subtitles from {source_lang} to {target_lang}.
You are reviewing the entire translated file holistically.

CRUCIAL QA TARGETS:
1. Pronoun Inconsistencies: Did the character's pronoun change inexplicably? (e.g. was a character referred to as "he" but is now "she"?)
2. Tone & Register Mismatches: Does a character suddenly use highly formal speech in an intimate context without reason, or vice versa?
3. Mistranslations & Literalness: Are there idioms translated so literally they make no sense in {target_lang}?

You will receive the full SRT file below. Each line contains the source and the translation.
Identify any serious issues. 

JSON RESPONSE SCHEMA:
[
  {
    "entry_index": 12,
    "issue": "Pronoun mismatch: character was referred to as 'he' previously, now 'she'.",
    "suggested_fix": "I love her so much."
  }
]

If no issues are found, return an empty array [].
Respond ONLY with valid JSON. Do not include markdown formatting (like \`\`\`json). Just the raw JSON array.

--- BEGIN TRANSLATED SRT DATA ---

{payload}
`;

const EXPLICIT_REGISTER = `
REGISTER — Explicit:
- Use direct, natural everyday language. Write the way real people actually talk in the moment.
- For physical or intimate content: use plain, common English vocabulary — not clinical terms, not euphemisms.
- Prioritise clarity and directness. If a literal phrase sounds stilted, write what a native speaker would actually say.`;

const CULTURAL_REGISTER = `
REGISTER — Cultural Preservation:
- Preserve honorific suffixes (-san, -chan, -kun, -senpai, -sama, -sensei) in their original form.
- On the first appearance of a preserved honorific or culturally-specific address term, add a short bracketed gloss (e.g. "Tanaka-senpai [upperclassman]"). Do not re-gloss on later occurrences.
- Keep culturally distinctive nouns (foods, festivals, place types, social roles) in their original form with a brief gloss where it aids understanding.
- Translate everything else naturally — this is about specific cultural markers, not writing stilted English throughout.`;

const NATURAL_REGISTER = `
REGISTER — Natural / Idiomatic:
- Prioritise idiomatic, fluent English and natural spoken rhythm above all else.
- If strict literalism would produce stiff or unnatural phrasing, favour how a native English speaker would actually say it.
- Normalise overly literal or grammatically transplanted phrasing into natural conversational English.
- Explicitness takes a back seat to naturalness — describe/convey scenes the way they would be written in natural English.`;

const SUFFIX = `
{linguistic_notes}
{context_block}
--- BEGIN SUBTITLE BLOCKS ---

{payload}`;

export const BUILTIN_PROFILE_TEMPLATES: Record<TranslationProfile, string> = {
  natural: COMMON_HEADER + NATURAL_REGISTER + SUFFIX,
  cultural: COMMON_HEADER + CULTURAL_REGISTER + SUFFIX,
  explicit: COMMON_HEADER + EXPLICIT_REGISTER + SUFFIX,
  custom: COMMON_HEADER + "\nREGISTER — Custom:\n- Enter your custom instructions here." + SUFFIX,
};

export const LINGUISTIC_NOTES: Record<string, string> = {
  Japanese: `
JAPANESE-SPECIFIC TRANSCREATION NOTES:
- Subject/pronoun dropping: Japanese frequently omits subjects. Infer the correct pronoun (I/you/he/she/they or a name) from verb politeness level, sentence-final particles, and character context — do NOT default everything to "I" or invent pronouns not implied.
- Sentence-final particles (ね/よ/わ/ぞ/かしら/な): reflect their tone/gender/emphasis through English word choice and punctuation, not literal translation.
- Keigo (honorific speech levels): map to English register (formality of vocabulary), not literal honorific phrases.
- Contractions and clipped forms (っ/ん elisions, etc.): render as natural speech patterns in English (contractions, trailing off, etc.).
- Onomatopoeia and sound words: translate to the closest English equivalent that fits the scene's emotional register.`,

  'Chinese (Simplified)': `
CHINESE-SPECIFIC TRANSCREATION NOTES:
- Subject/object dropping: Chinese is topic-prominent and frequently omits subjects — reconstruct explicit English subjects from context rather than leaving sentences vague.
- Measure words (量词): don't map to English articles — drop naturally in translation.
- Aspect particles (了/过/着): convey completed/experienced/ongoing action — map to correct English tense based on meaning, not literal gloss.
- Kinship/address terms: handled per the active register profile above.
- Reduplication for emphasis: render with English adverbs or intensifiers, not word repetition.`,

  'Chinese (Traditional)': `
CHINESE-SPECIFIC TRANSCREATION NOTES:
- Subject/object dropping: reconstruct explicit English subjects from context.
- Aspect particles (了/過/著): map to correct English tense/aspect based on meaning.
- Kinship/address terms: handled per the active register profile above.`,

  Korean: `
KOREAN-SPECIFIC TRANSCREATION NOTES:
- Subject/object dropping: frequently omitted — reconstruct explicit English subjects from context.
- Speech-level endings (formal/polite/casual/intimate): map to English register and tone, not literal phrasing.
- Honorific titles (오빠/언니/선배/선생님): handled per the active register profile above.
- Sentence-final particles and question endings: reflect emotional nuance in English through word choice and punctuation.`,
};

export function getLinguisticNotes(sourceLang: string): string {
  return LINGUISTIC_NOTES[sourceLang] ?? '';
}

// ─── Render a profile template ────────────────────────────────────────────
export function renderProfileTemplate(
  template: string,
  vars: {
    source_lang: string;
    target_lang: string;
    tone: string;
    count: number;
    last: number;
    context_block: string;
    linguistic_notes: string;
    payload: string;
  }
): string {
  const contextBlockStr = vars.context_block.trim() ? `MASTER SCRIPT CONTEXT (STRICT COMPLIANCE REQUIRED):
The following JSON defines the official character genders, roles, relationships, and tone shifts for this entire video. 
You MUST map pronouns, honorifics, and speech levels exactly as dictated below to maintain consistency across the project. Do not deviate.

${vars.context_block}
` : '';

  return template
    .replace(/{source_lang}/g, vars.source_lang)
    .replace(/{target_lang}/g, vars.target_lang)
    .replace(/{tone}/g, vars.tone)
    .replace(/{count}/g, String(vars.count))
    .replace(/{last}/g, String(vars.last))
    .replace(/{context_block}/g, contextBlockStr)
    .replace(/{linguistic_notes}/g, vars.linguistic_notes)
    .replace(/{payload}/g, vars.payload);
}

// ─── Dictionary types ─────────────────────────────────────────────────────
export interface DictionaryEntry {
  source: string;
  translation: string;
  category: 'moan' | 'phrase';
}

export interface LanguageDictionary {
  interjections: Record<string, DictionaryEntry>;
  common_phrases: Record<string, DictionaryEntry>;
}

export const DICT_LANG_CODES: Record<string, string> = {
  'Japanese': 'ja',
  'Chinese (Simplified)': 'zh',
  'Chinese (Traditional)': 'zh',
  'Korean': 'ko',
};

// ─── Navigation Steps ─────────────────────────────────────────────────────
export type Step =
  | 'projects'
  | 'load'
  | 'configure'
  | 'generate'
  | 'review'
  | 'export'
  | 'dictionary'
  | 'settings';
