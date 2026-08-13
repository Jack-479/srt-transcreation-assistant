import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Copy, CheckCheck, ChevronLeft, ChevronRight, Cpu, BarChart2, CheckCircle2, XCircle, Clock, BookOpen, AlertTriangle, RotateCcw, SkipForward } from 'lucide-react';
import {
  SubtitleEntry, ProjectConfig, Chunk,
  BUILTIN_PROFILE_TEMPLATES,
  renderProfileTemplate,
  getLinguisticNotes,
} from '../types';
import { chunkSubtitles, translateChunk, translateChunkStream, listenToTranslationStream, parseResponse, buildContextPrompt, generateContext, runFinalReview } from '../services/tauri';
import { preResolveDictionary } from '../services/dictionary-service';

interface GenerateScreenProps {
  entries: SubtitleEntry[];
  config: ProjectConfig;
  apiKey: string;
  onUpdateConfig: (patch: Partial<ProjectConfig>) => void;
  onComplete: (updatedEntries: SubtitleEntry[]) => void;
  qcIssues: import('../types').QCIssue[];
  setQcIssues: React.Dispatch<React.SetStateAction<import('../types').QCIssue[]>>;
}

// ─── Chunk status for parallel tracking ──────────────────────────────────
type ChunkStatus = 'waiting' | 'processing' | 'done' | 'failed' | 'retry';

interface ChunkState {
  index: number;
  status: ChunkStatus;
  merged: number;
  error?: string;
}

// ─── Build prompt from types system ──────────────────────────────────────
function buildFullPrompt(
  chunkEntries: SubtitleEntry[],
  coreIndices: number[],
  config: ProjectConfig,
  skipIndices: Set<number>,
  contextSummary: string
): string {
  // Build marker payload (the numbered [[N]] blocks)
  const blocks = chunkEntries.map((e) => {
    const marker = `[[${e.index}]]`;
    if (skipIndices.has(e.index)) {
      return `${marker} (context only — no translation needed)\n${e.content}`;
    }
    return `${marker}\n${e.content}`;
  });
  const payload = blocks.join('\n\n');

  // Count only actual targets (not skip)
  const targetCount = coreIndices.filter((i) => !skipIndices.has(i)).length;
  const lastTarget = coreIndices.filter((i) => !skipIndices.has(i)).slice(-1)[0] ?? coreIndices[coreIndices.length - 1];

  // Linguistic notes
  const lingNotes = config.use_linguistic_notes ? getLinguisticNotes(config.source_lang) : '';

  // Profile template
  const storedTemplates: Record<string, string> = JSON.parse(
    localStorage.getItem('srt_profile_templates') ?? '{}'
  );
  const baseTemplate =
    storedTemplates[config.active_profile] ?? BUILTIN_PROFILE_TEMPLATES[config.active_profile] ?? BUILTIN_PROFILE_TEMPLATES['natural'];

  return renderProfileTemplate(baseTemplate, {
    source_lang: config.source_lang,
    target_lang: config.target_lang,
    tone: config.tone || 'natural, neutral',
    count: targetCount,
    last: lastTarget,
    context_block: contextSummary,
    linguistic_notes: lingNotes,
    payload,
  });
}

// ─── Main Component ───────────────────────────────────────────────────────
export function GenerateScreen({ entries, config, apiKey, onUpdateConfig, onComplete, setQcIssues }: GenerateScreenProps) {
  const [phase, setPhase] = useState<'context' | 'chunks' | 'ai_review' | 'done'>(config.context_summary ? 'chunks' : 'context');
  const [contextSummary, setContextSummary] = useState(config.context_summary);
  const [isGeneratingContext, setIsGeneratingContext] = useState(false);
  const [contextFailed, setContextFailed] = useState(false);
  const [contextPromptCopied, setContextPromptCopied] = useState(false);

  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [updatedEntries, setUpdatedEntries] = useState<SubtitleEntry[]>(entries);
  const [chunkStates, setChunkStates] = useState<ChunkState[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);
  type StageState = 'waiting' | 'processing' | 'done' | 'failed' | 'retry' | 'skipped';
  const [contextState, setContextState] = useState<StageState>(config.context_summary ? 'done' : 'waiting');
  const [aiReviewState, setAiReviewState] = useState<StageState>(!config.auto_ai_review ? 'skipped' : 'waiting');

  // Manual mode state
  const [manualChunkIndex, setManualChunkIndex] = useState(0);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [pasteResponse, setPasteResponse] = useState('');
  const [copied, setCopied] = useState(false);
  const [mergeStatus, setMergeStatus] = useState('');

  // Resolved dictionary hits
  const [skipIndices, setSkipIndices] = useState<Set<number>>(new Set());
  const [dictResolved, setDictResolved] = useState<Record<number, string>>({});

  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);
  const hasStartedRef = useRef(false);
  const workingEntriesRef = useRef<SubtitleEntry[]>(entries);

  const isManual = config.translation_mode === 'manual';

  useEffect(() => {
    let unlisten: any;
    const setup = async () => {
      unlisten = await listenToTranslationStream((payload) => {
        let cleanText = payload.full_text.trim();
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```(?:json)?\s*\n/, '').replace(/```$/, '').trim();
        }
        const updates: { index: number; translation: string }[] = [];

        try {
          // Attempt full parse first in case it's perfectly formed
          const parsed = JSON.parse(cleanText);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (typeof item.index === 'number' && typeof item.translation === 'string') {
                updates.push(item);
              }
            }
          }
        } catch {
          // Fallback to a robust regex for incomplete streams
          // Handles both {"index": 1, "translation": "..."} and {"translation": "...", "index": 1}
          const objRegex = /\{\s*"index"\s*:\s*(\d+)\s*,\s*"translation"\s*:\s*("(?:[^"\\]|\\.)*")\s*\}|\{\s*"translation"\s*:\s*("(?:[^"\\]|\\.)*")\s*,\s*"index"\s*:\s*(\d+)\s*\}/g;
          let match;
          while ((match = objRegex.exec(cleanText)) !== null) {
            const idxStr = match[1] || match[4];
            const transStr = match[2] || match[3];
            try {
              const idx = parseInt(idxStr, 10);
              const trans = JSON.parse(transStr);
              updates.push({ index: idx, translation: trans });
            } catch {
              // incomplete string, ignore
            }
          }
        }
        
        if (updates.length > 0) {
          const currentWorking = [...workingEntriesRef.current];
          let changed = false;
          for (const u of updates) {
            const entryIdx = currentWorking.findIndex(e => e.index === u.index);
            if (entryIdx !== -1 && currentWorking[entryIdx].translated !== u.translation) {
              currentWorking[entryIdx] = { ...currentWorking[entryIdx], translated: u.translation };
              changed = true;
            }
          }
          if (changed) {
            updateWorkingEntries(currentWorking);
          }
        }
      });
    };
    setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleAutoGenerateContext = async (isRetry = false) => {
    setIsGeneratingContext(true);
    setContextState('processing');
    addLog('Generating whole-file context summary...', 'info');
    try {
      const summary = await generateContext(apiKey, config.primary_model, entries, config.source_lang, config.target_lang);
      setContextSummary(summary);
      onUpdateConfig({ context_summary: summary });
      addLog('Context summary generated successfully.', 'ok');
      setContextState('done');
      if (!isManual) setPhase('chunks');
    } catch (err) {
      if (!isRetry) {
        addLog(`Context generation failed. Retrying...`, 'warn');
        setContextState('retry');
        await handleAutoGenerateContext(true);
      } else {
        addLog(`Context generation failed after retry: ${err}`, 'err');
        setContextState('failed');
      }
    } finally {
      if (!isRetry) setIsGeneratingContext(false);
    }
  };

  const handleManualContextCopy = async () => {
    const prompt = buildContextPrompt(entries, config.source_lang, config.target_lang);
    try {
      await navigator.clipboard.writeText(prompt);
      setContextPromptCopied(true);
      setTimeout(() => setContextPromptCopied(false), 2500);
    } catch {
      addLog('Clipboard unavailable.', 'warn');
    }
  };

  const addLog = (msg: string, type: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const prefix = type === 'ok' ? '✓' : type === 'err' ? '✗' : type === 'warn' ? '⚠' : '›';
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLogs((prev) => [...prev, `[${time}] ${prefix} ${msg}`]);
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const updateWorkingEntries = (newEntries: SubtitleEntry[]) => {
    workingEntriesRef.current = newEntries;
    setUpdatedEntries(newEntries);
    localStorage.setItem('srt_app_wip_session', JSON.stringify(newEntries));
  };

  const handleComplete = (finalEntries: SubtitleEntry[]) => {
    localStorage.removeItem('srt_app_wip_session');
    onComplete(finalEntries);
  };

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    initPipeline();
    return () => { abortRef.current = true; };
  }, []);

  const initPipeline = async () => {
    abortRef.current = false;

    // Try restoring from localStorage
    let restoredWorking: SubtitleEntry[] | null = null;
    const savedSessionStr = localStorage.getItem('srt_app_wip_session');
    if (savedSessionStr) {
      try {
        const saved = JSON.parse(savedSessionStr);
        if (Array.isArray(saved) && saved.length === entries.length && saved[0]?.content === entries[0]?.content) {
          restoredWorking = saved;
          addLog('Restored previous unfinished session from local storage.', 'ok');
        }
      } catch (e) {}
    }

    // Step 1: Pre-resolve dictionary
    const { resolvedTranslations, skipIndices: dictSkips } = preResolveDictionary(entries, config.source_lang);
    setSkipIndices(dictSkips);
    setDictResolved(resolvedTranslations);

    if (dictSkips.size > 0 && !restoredWorking) {
      addLog(`Dictionary: pre-resolved ${dictSkips.size} entries (interjections/phrases) — skipping from AI.`, 'ok');
    }

    // Apply dict resolutions (or restored session)
    const withDict = restoredWorking || entries.map((e) =>
      resolvedTranslations[e.index] !== undefined
        ? { ...e, translated: resolvedTranslations[e.index] }
        : e
    );
    updateWorkingEntries(withDict);

    // Step 2: Deduplicate identical source lines (reuse_duplicate_translations)
    const dupeMap: Record<string, number> = {}; // content → first entry index
    const dupeTargets: Record<number, number> = {}; // later index → first index
    if (config.reuse_duplicate_translations) {
      for (const e of entries) {
        if (dictSkips.has(e.index)) continue;
        const norm = e.content.trim().toLowerCase();
        // Only deduplicate short phrases where context is less likely to alter meaning
        if (norm.length > 20 || norm.split(/\s+/).length > 3) continue;
        
        if (dupeMap[norm] !== undefined) {
          dupeTargets[e.index] = dupeMap[norm];
        } else {
          dupeMap[norm] = e.index;
        }
      }
      const dupeCount = Object.keys(dupeTargets).length;
      if (dupeCount > 0) {
        addLog(`Deduplication: ${dupeCount} short repeated lines will reuse translations.`, 'ok');
      }
    }

    // Step 3: Build chunks (skip dict-resolved indices)
    try {
      const skipArr = [...dictSkips, ...Object.keys(dupeTargets).map(Number)];
      addLog(`Building chunks (size ${config.chunk_size}, overlap ${config.chunk_overlap})…`);
      const created = await chunkSubtitles(entries, config.chunk_size, config.chunk_overlap);
      setChunks(created);
      setChunkStates(created.map((_, i) => ({ index: i, status: 'waiting', merged: 0 })));
      addLog(`Split ${entries.length} entries into ${created.length} chunk(s). ${skipArr.length} pre-resolved.`, 'ok');

      if (isManual && created.length > 0) {
        await generateManualPromptFor(0, created, dictSkips, contextSummary);
      }
    } catch (err) {
      addLog(`Error building chunks: ${err}`, 'err');
    }
  };

  // Orchestrator for automatic pipeline
  useEffect(() => {
    if (isManual || chunks.length === 0 || isDone) return;
    
    // Step 1: Context
    if (contextState === 'waiting' && !config.context_summary) {
      handleAutoGenerateContext(false);
      return;
    }
    
    // Step 2: Chunks
    if ((contextState === 'done' || contextState === 'skipped') && !isProcessing) {
      const allChunksWaiting = chunkStates.length > 0 && chunkStates.every(c => c.status === 'waiting');
      if (allChunksWaiting) {
        startTranslationPass(chunks);
      }
    }
  }, [chunks, contextState, isProcessing, isDone, isManual, chunkStates]);

  const updateChunkState = (index: number, patch: Partial<ChunkState>) => {
    setChunkStates((prev) =>
      prev.map((s) => (s.index === index ? { ...s, ...patch } : s))
    );
  };

  // ─── AUTOMATIC MODE ─────────────────────────────────────────
  const getConcurrentRequests = (): number => {
    try {
      const s = JSON.parse(localStorage.getItem('srt_app_settings') ?? '{}');
      return Number(s.concurrent_requests) || 3;
    } catch { return 3; }
  };

  const processChunk = async (
    chunk: Chunk,
    i: number,
    working: SubtitleEntry[],
    skipIdx: Set<number>,
    dupeTargets: Record<number, number>
  ): Promise<SubtitleEntry[]> => {
    if (abortRef.current) return working;

    updateChunkState(i, { status: 'processing' });
    const prompt = buildFullPrompt(chunk.entries, chunk.core_indices, config, skipIdx, contextSummary);

    const tryTranslate = async (model: string): Promise<string> => {
      return await translateChunkStream(apiKey, prompt, model, true, i);
    };

    let responseText: string;
    try {
      responseText = await tryTranslate(config.primary_model);
    } catch (primaryErr) {
      if (config.fallback_model && config.fallback_model !== 'none') {
        addLog(`Chunk ${i + 1}: primary failed, trying fallback ${config.fallback_model}…`, 'warn');
        try {
          responseText = await tryTranslate(config.fallback_model);
        } catch (fallbackErr) {
          addLog(`Chunk ${i + 1}: fallback also failed: ${fallbackErr}`, 'err');
          updateChunkState(i, { status: 'failed', error: String(fallbackErr) });
          return working;
        }
      } else {
        addLog(`Chunk ${i + 1}: failed: ${primaryErr}`, 'err');
        updateChunkState(i, { status: 'failed', error: String(primaryErr) });
        return working;
      }
    }

    // Parse
    const coreNotSkipped = chunk.core_indices.filter((idx) => !skipIdx.has(idx));
    const allIndices = chunk.entries.map((e) => e.index);
    const parsed = await parseResponse(responseText, coreNotSkipped, allIndices);

    // 1. JSON parsing failed completely — retry whole chunk
    if (Object.keys(parsed.translations).length === 0) {
      addLog(`Chunk ${i + 1}: JSON parsing failed — retrying with corrective prompt…`, 'warn');
      updateChunkState(i, { status: 'retry' });
      try {
        const correctivePrompt = prompt + "\n\nCRITICAL: Your previous response was invalid. You MUST return ONLY a valid JSON array. No conversational text.";
        const retryText = await translateChunk(apiKey, correctivePrompt, config.primary_model, true);
        const retryParsed = await parseResponse(retryText, coreNotSkipped, allIndices);
        
        if (Object.keys(retryParsed.translations).length === 0) {
          if (config.fallback_model && config.fallback_model !== 'none') {
            addLog(`Chunk ${i + 1}: retry failed, trying fallback model...`, 'warn');
            const fallbackText = await translateChunk(apiKey, correctivePrompt, config.fallback_model, true);
            const fallbackParsed = await parseResponse(fallbackText, coreNotSkipped, allIndices);
            if (Object.keys(fallbackParsed.translations).length === 0) {
              addLog(`Chunk ${i + 1}: fallback also failed to produce valid JSON.`, 'err');
              updateChunkState(i, { status: 'failed', error: 'Invalid JSON after all retries' });
              return working;
            }
            Object.assign(parsed.translations, fallbackParsed.translations);
          } else {
            addLog(`Chunk ${i + 1}: retry produced invalid JSON and no fallback model is set.`, 'err');
            updateChunkState(i, { status: 'failed', error: 'Invalid JSON after retry' });
            return working;
          }
        } else {
          Object.assign(parsed.translations, retryParsed.translations);
        }
      } catch (err) {
        updateChunkState(i, { status: 'failed', error: `Retry failed: ${err}` });
        return working;
      }
    }

    // 2. JSON parsed but some lines are missing — targeted micro-retry
    const missingCore = coreNotSkipped.filter(idx => !parsed.translations[idx] || parsed.translations[idx].trim().length === 0);
    if (missingCore.length > 0) {
      addLog(`Chunk ${i + 1}: ${missingCore.length} line(s) missing from response. Initiating targeted micro-retry...`, 'warn');
      try {
        const missingEntries = chunk.entries.filter(e => missingCore.includes(e.index));
        const microPayload = missingEntries.map(e => `[[${e.index}]]\n${e.content}`).join('\n\n');
        const microPrompt = `You are a professional subtitle translator.
In your previous response, you forgot to translate the following indices.
Please translate them now from ${config.source_lang} to ${config.target_lang}.

${microPayload}

Return ONLY a valid JSON array of the missing translations. Format:
[
  { "index": <number>, "translation": "<translation>" }
]
DO NOT wrap in markdown blocks, DO NOT include any conversational text.
`;
        const microResponseText = await translateChunk(apiKey, microPrompt, config.primary_model, true);
        const microParsed = await parseResponse(microResponseText, missingCore, missingCore);
        
        if (Object.keys(microParsed.translations).length > 0) {
          Object.assign(parsed.translations, microParsed.translations);
          addLog(`Chunk ${i + 1}: Recovered ${Object.keys(microParsed.translations).length} missing line(s) via micro-retry.`, 'ok');
        } else {
          addLog(`Chunk ${i + 1}: Micro-retry failed to recover missing lines.`, 'warn');
        }
      } catch (microErr) {
        addLog(`Chunk ${i + 1}: Micro-retry failed: ${microErr}`, 'warn');
      }
    }

    // Multi-Agent QC Pass
    if (parsed.ok && config.qc_model && config.qc_model !== 'none') {
      try {
        const qcPrompt = `You are a strict QA reviewer. The following JSON array is a chunk of translated subtitles from ${config.source_lang} to ${config.target_lang}.
Check the translations against any cultural/idiomatic constraints and ensure accuracy.
If there are NO violations, return exactly "OK".
If there ARE violations, fix the "translation" fields and return the updated JSON array.

JSON DATA:
${JSON.stringify(parsed.translations)}
`;
        addLog(`Chunk ${i + 1}: Running QC verification using ${config.qc_model}...`, 'info');
        const qcResponse = await translateChunk(apiKey, qcPrompt, config.qc_model, false);
        if (qcResponse.trim() !== 'OK') {
           const qcParsed = await parseResponse(qcResponse, coreNotSkipped, allIndices);
           if (qcParsed.ok) {
             Object.assign(parsed.translations, qcParsed.translations);
             addLog(`Chunk ${i + 1}: QC model applied terminology corrections.`, 'warn');
           }
        } else {
           addLog(`Chunk ${i + 1}: QC model verified terms successfully.`, 'ok');
        }
      } catch (err) {
        addLog(`Chunk ${i + 1}: QC verification failed: ${err}`, 'err');
      }
    }

    // Merge translations into working array
    let merged = 0;
    const result = working.map((e) => {
      if (parsed.translations[e.index]) {
        const trans = parsed.translations[e.index].trim();
        if (trans.length > 0) {
          merged++;
          return { ...e, translated: trans };
        }
      }
      
      // If this index was supposed to be translated by this chunk but is missing or returned empty
      if (coreNotSkipped.includes(e.index)) {
        addLog(`Index ${e.index} was dropped by the AI. Falling back to original content.`, 'warn');
        return { ...e, translated: e.content };
      }
      
      return e;
    });

    // Apply deduplication: copy first translation to all dupes
    if (config.reuse_duplicate_translations) {
      const finalResult = result.map((e) => {
        if (dupeTargets[e.index] !== undefined) {
          const srcEntry = result.find((x) => x.index === dupeTargets[e.index]);
          if (srcEntry?.translated) return { ...e, translated: srcEntry.translated };
        }
        return e;
      });
      updateChunkState(i, { status: 'done', merged });
      addLog(`Chunk ${i + 1}/${chunks.length} ✓ — ${merged} lines merged.`, 'ok');
      return finalResult;
    }

    updateChunkState(i, { status: 'done', merged });
    addLog(`Chunk ${i + 1}/${chunks.length} ✓ — ${merged} lines merged.`, 'ok');
    return result;
  };

  const requestTimesRef = useRef<number[]>([]);

  const startTranslationPass = async (chunksToProcess: Chunk[] = chunks) => {
    if (!apiKey) { addLog('Error: No API key. Go back to Configure.', 'err'); return; }
    if (chunksToProcess.length === 0) return;

    setIsProcessing(true);
    abortRef.current = false;

    // Build deduplication map from current entries
    const dupeMap: Record<string, number> = {};
    const dupeTargets: Record<number, number> = {};
    if (config.reuse_duplicate_translations) {
      for (const e of entries) {
        if (skipIndices.has(e.index)) continue;
        const norm = e.content.trim().toLowerCase();
        if (dupeMap[norm] !== undefined) {
          dupeTargets[e.index] = dupeMap[norm];
        } else {
          dupeMap[norm] = e.index;
        }
      }
    }

    const concurrency = getConcurrentRequests();
    addLog(`Starting parallel translation: ${chunksToProcess.length} chunks, ${concurrency} concurrent.`);
    addLog(`Rate Limit: Max 6 requests per 60 seconds.`);

    let working = [...workingEntriesRef.current];
    let currentIndex = 0;
    const MAX_REQUESTS = 6;
    const WINDOW_MS = 60000;

    const waitForToken = async (): Promise<void> => {
      while (true) {
        if (abortRef.current) throw new Error('aborted');
        const now = Date.now();
        while (requestTimesRef.current.length > 0 && now - requestTimesRef.current[0] > WINDOW_MS) {
          requestTimesRef.current.shift();
        }
        if (requestTimesRef.current.length < MAX_REQUESTS) {
          requestTimesRef.current.push(now);
          return;
        }
        const waitMs = requestTimesRef.current[0] + WINDOW_MS - now;
        addLog(`Rate limit reached (${MAX_REQUESTS}/min). Pausing queue for ${Math.ceil(waitMs / 1000)}s...`, 'warn');
        let remaining = waitMs;
        while (remaining > 0 && !abortRef.current) {
          await new Promise(r => setTimeout(r, Math.min(remaining, 1000)));
          remaining -= 1000;
          if (remaining > 0 && !abortRef.current) {
             addLog(`Resuming queue in ${Math.ceil(remaining/1000)}s...`, 'info');
          }
        }
      }
    };

    const processNext = async (): Promise<void> => {
      while (currentIndex < chunksToProcess.length && !abortRef.current) {
        const i = currentIndex++;
        try {
          await waitForToken();
        } catch (e) { break; } // aborted
        if (abortRef.current) break;
        
        const chunk = chunksToProcess[i];
        const result = await processChunk(chunk, i, working, skipIndices, dupeTargets);
        
        const mergedWorking = [...working];
        for (const entry of result) {
          const idx = mergedWorking.findIndex((e) => e.index === entry.index);
          if (idx !== -1 && entry.translated) {
            mergedWorking[idx] = entry;
          }
        }
        working = mergedWorking;
        updateWorkingEntries(working);
      }
    };

    const workers = Array.from({ length: concurrency }).map(() => processNext());
    await Promise.all(workers);

    setIsProcessing(false);
    setIsDone(true);
    const totalTranslated = working.filter((e) => e.translated).length;
    addLog(`Complete! ${totalTranslated}/${entries.length} entries translated.`, 'ok');

    // Auto AI Review Check
    if (!abortRef.current && config.translation_mode === 'automatic' && config.auto_ai_review) {
      const doAiReview = async (isRetry = false) => {
        setAiReviewState('processing');
        addLog('Starting automatic AI Review...', 'info');
        try {
          const aiIssues = await runFinalReview(apiKey, config.primary_model, working, config.source_lang, config.target_lang);
          setQcIssues(prev => {
            const otherIssues = prev.filter(i => i.code !== 'AI_REVIEW');
            return [...otherIssues, ...aiIssues];
          });
          addLog('AI Review completed.', 'ok');
          setAiReviewState('done');
          setPhase('done');
          handleComplete(workingEntriesRef.current);
        } catch (err) {
          if (!isRetry) {
             addLog(`AI Review failed: ${err}. Retrying...`, 'warn');
             setAiReviewState('retry');
             await doAiReview(true);
          } else {
             addLog(`AI Review failed after retry: ${err}`, 'err');
             setAiReviewState('failed');
          }
        }
      };
      await doAiReview(false);
    } else {
      if (!abortRef.current) {
        setPhase('done');
        handleComplete(workingEntriesRef.current);
      }
    }
  };

  const retryFailedChunks = async () => {
    const failedIndices = chunkStates.filter(cs => cs.status === 'failed').map(cs => cs.index);
    if (failedIndices.length === 0) return;

    setIsProcessing(true);
    abortRef.current = false;

    const dupeTargets: Record<number, number> = {};
    if (config.reuse_duplicate_translations) {
      const dupeMap: Record<string, number> = {};
      for (const e of entries) {
        if (skipIndices.has(e.index)) continue;
        const norm = e.content.trim().toLowerCase();
        if (dupeMap[norm] !== undefined) {
          dupeTargets[e.index] = dupeMap[norm];
        } else {
          dupeMap[norm] = e.index;
        }
      }
    }

    const concurrency = getConcurrentRequests();
    addLog(`Retrying ${failedIndices.length} failed chunks, ${concurrency} concurrent.`);

    let working = [...workingEntriesRef.current];
    const failedChunks = failedIndices.map(i => ({ chunk: chunks[i], index: i }));

    for (let batchStart = 0; batchStart < failedChunks.length; batchStart += concurrency) {
      if (abortRef.current) break;
      const batch = failedChunks.slice(batchStart, batchStart + concurrency);
      
      const results = await Promise.all(
        batch.map(({ chunk, index }) => processChunk(chunk, index, working, skipIndices, dupeTargets))
      );

      const mergedWorking = [...working];
      for (const result of results) {
        for (const entry of result) {
          const idx = mergedWorking.findIndex((e) => e.index === entry.index);
          if (idx !== -1 && entry.translated) {
            mergedWorking[idx] = entry;
          }
        }
      }
      working = mergedWorking;
      updateWorkingEntries(working);
    }

    setIsProcessing(false);
    const stillFailed = chunkStates.filter(cs => cs.status === 'failed').length;
    if (stillFailed === 0) {
      addLog('All retried chunks succeeded!', 'ok');
    } else {
      addLog(`${stillFailed} chunks still failed after retry.`, 'warn');
    }
  };

  // ─── MANUAL MODE ────────────────────────────────────────────
  const generateManualPromptFor = async (idx: number, chunkList: Chunk[], skip: Set<number>, forcedContext?: string) => {
    const chunk = chunkList[idx];
    if (!chunk) return;
    const prompt = buildFullPrompt(chunk.entries, chunk.core_indices, config, skip, forcedContext ?? contextSummary);
    setGeneratedPrompt(prompt);
    setPasteResponse('');
    setMergeStatus('');
    setCopied(false);
  };

  const handleManualCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      addLog('Clipboard unavailable — select and copy manually.', 'warn');
    }
  };

  const handleManualMerge = async () => {
    if (!pasteResponse.trim()) return;
    const chunk = chunks[manualChunkIndex];
    if (!chunk) return;

    const coreNotSkipped = chunk.core_indices.filter((i) => !skipIndices.has(i));
    const allIndices = chunk.entries.map((e) => e.index);
    const parsed = await parseResponse(pasteResponse, coreNotSkipped, allIndices);

    if (Object.keys(parsed.translations).length > 0) {
      let merged = 0;
      const working = updatedEntries.map((e) => {
        if (parsed.translations[e.index]) { merged++; return { ...e, translated: parsed.translations[e.index] }; }
        return e;
      });
      updateWorkingEntries(working);
      setMergeStatus(`✓ Merged ${merged} lines from chunk ${manualChunkIndex + 1}.`);
      updateChunkState(manualChunkIndex, { status: 'done', merged });
      addLog(`Manual chunk ${manualChunkIndex + 1} merged — ${merged} lines.`, 'ok');
    } else {
      setMergeStatus('⚠ No [[N]] markers found in the response. Check the AI output format.');
    }
  };

  const handleManualNav = async (dir: 'prev' | 'next') => {
    const next = dir === 'next'
      ? Math.min(manualChunkIndex + 1, chunks.length - 1)
      : Math.max(manualChunkIndex - 1, 0);
    setManualChunkIndex(next);
    await generateManualPromptFor(next, chunks, skipIndices);
  };

  const translatedCount = updatedEntries.filter((e) => e.translated).length;
  const failedCount = chunkStates.filter((s) => s.status === 'failed').length;

  const StatusIcon = ({ status }: { status: ChunkStatus }) => {
    if (status === 'done') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
    if (status === 'failed') return <XCircle className="h-3.5 w-3.5 text-red-400" />;
    if (status === 'processing' || status === 'retry') return <span className="h-3.5 w-3.5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin inline-block" />;
    return <Clock className="h-3.5 w-3.5 text-muted" />;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="text-center space-y-1.5">
        <h2 className="text-2xl font-bold text-main tracking-tight">
          {isManual ? 'Generate Prompt' : 'AI Subtitle Transcreation'}
        </h2>
        <p className="text-muted text-sm">
          {isManual
            ? `Copy each chunk prompt into your AI of choice and paste the response back.`
            : `Transcreating ${entries.length} entries → ${config.target_lang} · Profile: ${config.active_profile} · ${config.primary_model}`}
        </p>
      </div>

      {/* Stats pills */}
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <span className="text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-3 py-1 rounded-full">
          {translatedCount} / {entries.length} translated
        </span>
        {Object.keys(dictResolved).length > 0 && (
          <span className="text-xs font-medium bg-violet-500/10 text-violet-300 border border-violet-500/20 px-3 py-1 rounded-full">
            {Object.keys(dictResolved).length} from dictionary
          </span>
        )}
        {failedCount > 0 && (
          <span className="text-xs font-medium bg-red-500/10 text-red-300 border border-red-500/20 px-3 py-1 rounded-full">
            {failedCount} chunks failed
          </span>
        )}
      </div>

      {/* ── CONTEXT GENERATION PHASE ── */}
      {isManual && phase === 'context' && (
        <div className="bg-surface border border-subtle rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-main text-lg border-b border-subtle pb-3">
            <BookOpen className="h-5 w-5 accent-icon" /> Phase 1: Context Generation
          </div>
          <p className="text-sm text-muted leading-relaxed">
            Generate a full-file context summary (characters, relationships, scenes) to ensure consistency across all chunks.
          </p>
          
          {isManual ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-app border border-subtle p-4 rounded-xl">
                <span className="text-sm text-main font-medium">1. Copy Context Prompt</span>
                <button onClick={handleManualContextCopy}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                    contextPromptCopied ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-surface-hover border-subtle text-main hover:text-main'
                  }`}>
                  {contextPromptCopied ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {contextPromptCopied ? 'Copied!' : 'Copy Prompt'}
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">2. Paste AI YAML Response</label>
                <textarea
                  value={contextSummary}
                  onChange={(e) => setContextSummary(e.target.value)}
                  rows={8}
                  placeholder="Paste the YAML block here..."
                  className="w-full bg-app border border-subtle rounded-lg px-3.5 py-3 text-xs text-main font-mono focus:outline-none resize-y"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
               {contextSummary ? (
                 <div>
                   <label className="block text-xs font-medium text-muted mb-1.5">Generated Context Summary</label>
                   <textarea
                     value={contextSummary}
                     onChange={(e) => setContextSummary(e.target.value)}
                     rows={8}
                     className="w-full bg-app border border-subtle rounded-lg px-3.5 py-3 text-xs text-main font-mono focus:outline-none resize-y"
                   />
                 </div>
               ) : contextFailed ? (
                 <div className="flex gap-3">
                   <button
                     onClick={() => handleAutoGenerateContext(false)}
                     className="flex-1 py-3 btn-accent font-medium text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                   >
                     <RotateCcw className="h-4 w-4" /> Retry Context
                   </button>
                   <button
                     onClick={() => {
                       setContextFailed(false);
                       setPhase('chunks');
                     }}
                     className="flex-1 py-3 bg-surface-hover hover:bg-subtle border border-subtle text-muted hover:text-main font-medium text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                   >
                     <SkipForward className="h-4 w-4" /> Skip Context Generation
                   </button>
                 </div>
               ) : (
                 <button
                   onClick={() => handleAutoGenerateContext(false)}
                   disabled={isGeneratingContext}
                   className="w-full py-3 btn-accent disabled:opacity-50 font-medium text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                 >
                   {isGeneratingContext ? <span className="h-4 w-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin inline-block" /> : <Sparkles className="h-4 w-4" />}
                   {isGeneratingContext ? 'Generating Context...' : 'Generate Scene Context'}
                 </button>
               )}
            </div>
          )}

          <div className="flex justify-end pt-2 gap-3">
            {!contextSummary && (
              <button onClick={() => setPhase('chunks')} className="text-sm px-4 py-2 rounded-lg border border-subtle text-muted hover:text-main cursor-pointer">
                Skip Context
              </button>
            )}
            <button
              onClick={() => {
                if (isManual) {
                  generateManualPromptFor(manualChunkIndex, chunks, skipIndices, contextSummary);
                }
                setPhase('chunks');
              }}
              disabled={!contextSummary && !isManual}
              className="flex items-center gap-2 btn-accent disabled:opacity-50 font-medium text-sm px-6 py-2 rounded-xl transition-all cursor-pointer"
            >
              Proceed to Translation <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── AUTOMATIC MODE ── */}
      {!isManual && chunks.length > 0 && (phase === 'chunks' || phase === 'context') && (
        <div className="bg-surface p-6 rounded-2xl border border-subtle space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-main">
              <Sparkles className="h-5 w-5 accent-icon" />
              Parallel Progress
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted">{config.primary_model}</span>
              <span className="text-xs font-mono accent-text bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20">
                {
                  (() => {
                    let total = chunks.length;
                    let completed = chunkStates.filter(c => c.status === 'done').length;
                    
                    if (!config.context_summary) {
                       total += 1;
                       if (contextState === 'done' || contextState === 'skipped') completed += 1;
                    }
                    if (config.auto_ai_review) {
                       total += 1;
                       if (aiReviewState === 'done' || aiReviewState === 'skipped') completed += 1;
                    }
                    return total === 0 ? 0 : Math.round((completed / total) * 100);
                  })()
                }%
              </span>
            </div>
          </div>

          <div className="h-2 w-full bg-app rounded-full overflow-hidden border border-subtle">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${
                  (() => {
                    let total = chunks.length;
                    let completed = chunkStates.filter(c => c.status === 'done').length;
                    if (!config.context_summary) {
                       total += 1;
                       if (contextState === 'done' || contextState === 'skipped') completed += 1;
                    }
                    if (config.auto_ai_review) {
                       total += 1;
                       if (aiReviewState === 'done' || aiReviewState === 'skipped') completed += 1;
                    }
                    return total === 0 ? 0 : Math.round((completed / total) * 100);
                  })()
              }%` }}
              transition={{ duration: 0.4 }}
              className="h-full btn-accent rounded-full"
            />
          </div>

          {/* Status grid (Unified) */}
          <div className="grid grid-cols-6 gap-1.5 max-h-40 overflow-y-auto pr-1">
            {/* Context Pill */}
            {!config.context_summary && (
              <div title={`Context Generation: ${contextState}`} className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-mono border transition-all ${
                contextState === 'done' ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400' :
                contextState === 'failed' ? 'bg-red-500/8 border-red-500/20 text-red-400' :
                contextState === 'processing' || contextState === 'retry' ? 'bg-indigo-500/8 border-indigo-500/30 text-indigo-300' :
                'bg-app border-subtle text-muted'
              }`}>
                <StatusIcon status={contextState === 'processing' || contextState === 'retry' ? 'processing' : contextState === 'failed' ? 'failed' : contextState === 'done' ? 'done' : 'waiting'} />
                <span>Context</span>
              </div>
            )}
            
            {/* Chunk Pills */}
            {chunkStates.map((cs) => (
                <div
                  key={cs.index}
                  title={`Chunk ${cs.index + 1}: ${cs.status}${cs.error ? ' — ' + cs.error : ''}${cs.merged ? ' (' + cs.merged + ' lines)' : ''}`}
                  className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-mono border transition-all ${
                    cs.status === 'done' ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400' :
                    cs.status === 'failed' ? 'bg-red-500/8 border-red-500/20 text-red-400' :
                    cs.status === 'processing' || cs.status === 'retry' ? 'bg-indigo-500/8 border-indigo-500/30 text-indigo-300' :
                    'bg-app border-subtle text-muted'
                  }`}
                >
                  <StatusIcon status={cs.status} />
                  <span>{cs.index + 1}</span>
                </div>
              ))}

            {/* AI Review Pill */}
            {config.auto_ai_review && (
               <div title={`AI Review: ${aiReviewState}`} className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-mono border transition-all ${
                aiReviewState === 'done' ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400' :
                aiReviewState === 'failed' ? 'bg-red-500/8 border-red-500/20 text-red-400' :
                aiReviewState === 'processing' || aiReviewState === 'retry' ? 'bg-indigo-500/8 border-indigo-500/30 text-indigo-300' :
                'bg-app border-subtle text-muted'
              }`}>
                <StatusIcon status={aiReviewState === 'processing' || aiReviewState === 'retry' ? 'processing' : aiReviewState === 'failed' ? 'failed' : aiReviewState === 'done' ? 'done' : 'waiting'} />
                <span>Review</span>
              </div>
            )}
            </div>

          {!isProcessing && !isDone && (
            <button
              onClick={() => startTranslationPass()}
              disabled={chunks.length === 0}
              className="w-full py-3 btn-accent disabled:opacity-50 font-medium text-sm rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <BarChart2 className="h-4 w-4" /> Start AI Transcreation Pass
            </button>
          )}

          {isProcessing && (
            <div className="flex items-center gap-3 text-sm text-muted">
              <span className="h-2 w-2 rounded-full accent-bg animate-pulse shrink-0" />
              Processing {chunks.length} chunks in batches of {getConcurrentRequests()}…
            </div>
          )}

          {!isProcessing && isDone && chunkStates.some(cs => cs.status === 'failed') && (
            <button
              onClick={retryFailedChunks}
              className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-medium text-sm rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <AlertTriangle className="h-4 w-4" /> Retry Failed Chunks ({chunkStates.filter(cs => cs.status === 'failed').length})
            </button>
          )}

          {contextState === 'failed' && (
             <div className="flex gap-3">
               <button onClick={() => handleAutoGenerateContext(false)} className="flex-1 py-3 btn-accent font-medium text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer">
                 <RotateCcw className="h-4 w-4" /> Retry Context
               </button>
               <button onClick={() => setContextState('skipped')} className="flex-1 py-3 bg-surface-hover border border-subtle text-muted hover:text-main font-medium text-sm rounded-xl transition-colors cursor-pointer">
                 Skip Context
               </button>
             </div>
          )}

          {aiReviewState === 'failed' && (
             <div className="flex gap-3">
               <button onClick={() => {
                   setAiReviewState('processing');
                   runFinalReview(apiKey, config.primary_model, workingEntriesRef.current, config.source_lang, config.target_lang)
                       .then(aiIssues => {
                           setQcIssues(prev => {
                               const other = prev.filter(i => i.code !== 'AI_REVIEW');
                               return [...other, ...aiIssues];
                           });
                           setAiReviewState('done');
                           setPhase('done');
                           handleComplete(workingEntriesRef.current);
                       })
                       .catch(() => setAiReviewState('failed'));
               }} className="flex-1 py-3 btn-accent font-medium text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer">
                 <RotateCcw className="h-4 w-4" /> Retry AI Review
               </button>
               <button onClick={() => {
                   setAiReviewState('skipped');
                   setPhase('done');
                   handleComplete(workingEntriesRef.current);
               }} className="flex-1 py-3 bg-surface-hover border border-subtle text-muted hover:text-main font-medium text-sm rounded-xl transition-colors cursor-pointer">
                 Skip AI Review
               </button>
             </div>
          )}
        </div>
      )}

      {/* ── MANUAL MODE ── */}
      {isManual && chunks.length > 0 && phase === 'chunks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-surface border border-subtle rounded-xl p-4">
            <button onClick={() => handleManualNav('prev')} disabled={manualChunkIndex === 0}
              className="flex items-center gap-1.5 text-sm text-muted hover:text-main disabled:opacity-30 cursor-pointer transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-hover">
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-main">Chunk {manualChunkIndex + 1} / {chunks.length}</p>
              <p className="text-xs text-muted">{chunks[manualChunkIndex]?.core_indices.length ?? 0} lines to translate</p>
            </div>
            <button onClick={() => handleManualNav('next')} disabled={manualChunkIndex === chunks.length - 1}
              className="flex items-center gap-1.5 text-sm text-muted hover:text-main disabled:opacity-30 cursor-pointer transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-hover">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="bg-surface border border-subtle rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-main font-semibold text-sm">
                <Cpu className="h-4 w-4 accent-icon" /> Generated Prompt
              </div>
              <button onClick={handleManualCopy}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                  copied ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-surface-hover border-subtle text-main hover:text-main'
                }`}>
                {copied ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied!' : 'Copy prompt'}
              </button>
            </div>
            <textarea readOnly value={generatedPrompt} rows={12}
              className="w-full bg-app border border-subtle rounded-lg px-3.5 py-3 text-xs text-main font-mono focus:outline-none resize-y select-all" />
          </div>

          <div className="bg-surface border border-subtle rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-main font-semibold text-sm">Paste AI Response</div>
              <button onClick={handleManualMerge} disabled={!pasteResponse.trim()}
                className="flex items-center gap-1.5 text-xs btn-accent disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
                <CheckCheck className="h-3.5 w-3.5" /> Merge
              </button>
            </div>
            <textarea value={pasteResponse} onChange={(e) => setPasteResponse(e.target.value)} rows={10}
              placeholder="Paste the AI model's [[N]] formatted reply here..."
              className="w-full bg-app border border-subtle rounded-lg px-3.5 py-3 text-xs text-main font-mono focus:outline-none resize-y" />
            {mergeStatus && (
              <p className={`text-xs font-medium ${mergeStatus.startsWith('✓') ? 'text-emerald-400' : 'text-amber-400'}`}>
                {mergeStatus}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Log console */}
      <div ref={logRef} className="bg-app p-4 rounded-xl border border-subtle font-mono text-xs h-40 overflow-y-auto space-y-0.5 select-text">
        {logs.length === 0
          ? <span className="text-muted">Initializing pipeline…</span>
          : logs.map((log, idx) => (
            <div key={idx} className={
              log.startsWith('✓') ? 'log-ok' :
              log.startsWith('✗') ? 'log-err' :
              log.startsWith('⚠') ? 'log-warn' : 'text-muted'
            }>{log}</div>
          ))}
      </div>

      {/* Proceed */}
      {((isDone || (isManual && translatedCount > 0))) && (
        <div className="flex justify-end">
          <button onClick={() => handleComplete(updatedEntries)}
            className="flex items-center gap-2 btn-accent font-medium text-sm px-6 py-3 rounded-xl shadow-lg transition-all cursor-pointer">
            Proceed to Review & Edit <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
