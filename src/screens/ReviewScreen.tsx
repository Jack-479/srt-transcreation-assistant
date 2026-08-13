import { useState, useEffect } from 'react';
import { Search, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ArrowRight, BookPlus, X, User, UserMinus, Trash2, RotateCcw } from 'lucide-react';
import { SubtitleEntry, ProjectConfig, QCIssue, DICT_LANG_CODES } from '../types';
import { runQC } from '../services/tauri';
import { addDictionaryEntry } from '../services/dictionary-service';
import { applyPostProcessing } from '../services/post-processing';
import { translateChunk, parseResponse } from '../services/tauri';

interface ReviewScreenProps {
  entries: SubtitleEntry[];
  config: ProjectConfig;
  onUpdateEntries: (updated: SubtitleEntry[]) => void;
  onUpdateConfig: (patch: Partial<ProjectConfig>) => void;
  onNext: () => void;
  apiKey: string; // Needed for runFinalReview
  qcIssues: QCIssue[];
  setQcIssues: React.Dispatch<React.SetStateAction<QCIssue[]>>;
}

// ─── Add to Dictionary Toast ────────────────────────────────────────────
interface DictToastProps {
  entry: SubtitleEntry;
  langCode: string;
  onClose: () => void;
}

function AddToDictionaryToast({ entry, langCode, onClose }: DictToastProps) {
  const [translation, setTranslation] = useState(entry.translated ?? '');
  const [category, setCategory] = useState<'moan' | 'phrase'>('phrase');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!translation.trim()) return;
    addDictionaryEntry(langCode, entry.content.trim(), translation.trim(), category);
    setSaved(true);
    setTimeout(onClose, 1200);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 bg-surface border border-subtle rounded-2xl shadow-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-main text-sm">
          <BookPlus className="h-4 w-4 accent-icon" /> Add to Dictionary
        </div>
        <button onClick={onClose} className="h-6 w-6 flex items-center justify-center text-muted hover:text-main cursor-pointer"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-2">
        <div>
          <label className="text-xs text-muted mb-1 block">Source text</label>
          <div className="bg-app border border-subtle rounded-lg px-3 py-2 text-sm text-main font-mono">{entry.content}</div>
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">Translation (editable)</label>
          <input type="text" value={translation} onChange={(e) => setTranslation(e.target.value)}
            className="w-full bg-app border border-subtle rounded-lg px-3 py-2 text-sm text-main focus:outline-none focus:border-indigo-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted">Category:</label>
          {(['phrase', 'moan'] as const).map((cat) => (
            <button key={cat} onClick={() => setCategory(cat)}
              className={`text-xs px-3 py-1 rounded-lg border transition-colors cursor-pointer capitalize ${
                category === cat ? 'sidebar-active accent-text' : 'border-subtle text-muted hover:border-subtle'
              }`}>{cat === 'moan' ? 'Interjection' : 'Phrase'}</button>
          ))}
        </div>
      </div>
      {saved ? (
        <div className="flex items-center gap-2 text-emerald-400 text-sm"><CheckCircle2 className="h-4 w-4" /> Saved to dictionary!</div>
      ) : (
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 text-xs py-2 rounded-lg border border-subtle text-muted hover:text-main cursor-pointer transition-colors">Cancel</button>
          <button onClick={handleSave} className="flex-1 text-xs py-2 rounded-lg btn-accent font-medium cursor-pointer">Save Entry</button>
        </div>
      )}
    </div>
  );
}

export function ReviewScreen({ entries: initialEntries, config, onUpdateEntries, onUpdateConfig, onNext, apiKey, qcIssues: issues, setQcIssues: setIssues }: ReviewScreenProps) {
  const [entries, setEntries] = useState<SubtitleEntry[]>(initialEntries);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'errors' | 'warnings' | 'untranslated'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [dictToastEntry, setDictToastEntry] = useState<SubtitleEntry | null>(null);
  const pageSize = 50;

  const [isRetryingIssues, setIsRetryingIssues] = useState(false);

  const langCode = DICT_LANG_CODES[config.source_lang] ?? 'ja';

  useEffect(() => { 
    refreshQC(entries); 
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 's') {
        const selected = window.getSelection()?.toString().trim();
        if (selected) {
          e.preventDefault();
          // Create a mock entry to pass to the toast if it doesn't match a specific one
          setDictToastEntry({ 
            index: -1, 
            content: selected, 
            translated: '', 
            start_time: '', 
            end_time: '', 
            start_ms: 0, 
            end_ms: 0, 
            reviewed: false 
          });
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const refreshQC = async (current: SubtitleEntry[]) => {
    try {
      const detectedIssues = await runQC(current, 'standard', 80);
      // Preserve any existing AI issues
      setIssues(prev => {
        const aiIssues = prev.filter(i => i.code === 'AI_REVIEW');
        return [...detectedIssues, ...aiIssues];
      });
    } catch (err) { console.error('QC error:', err); }
  };

  const handleRetryIssues = async () => {
    if (!apiKey) return;
    
    // Find entries with issues
    const problematicIndices = [...new Set(issues.map(i => i.entry_index))];
    if (problematicIndices.length === 0) return;
    
    setIsRetryingIssues(true);
    
    try {
      const entriesToFix = entries.filter(e => problematicIndices.includes(e.index));
      
      const promptPayload = entriesToFix.map(e => {
        const eIssues = issues.filter(i => i.entry_index === e.index);
        const issueDesc = eIssues.map(i => `[${i.severity.toUpperCase()}] ${i.message}`).join(' | ');
        return `[[${e.index}]]
Original: ${e.content}
Current Translation: ${e.translated || ''}
Issues to fix: ${issueDesc}`;
      }).join('\n\n');

      const prompt = `You are an expert translator specializing in subtitles. 
The following subtitle translations have QC warnings or errors that need to be fixed.
Based on the provided issues, rewrite the 'Current Translation' for each entry to resolve the problems.
Maintain the original context and style as much as possible, just fix the specific issues (like line length or terminology).

${promptPayload}

Return ONLY a valid JSON array matching this format for each entry you fix:
[
  { "index": <entry_index>, "translation": "<fixed_translation>" }
]
DO NOT wrap in markdown blocks, DO NOT include any conversational text.
`;

      const responseText = await translateChunk(apiKey, prompt, config.primary_model, true);
      const expectedIndices = entriesToFix.map(e => e.index);
      
      const parsed = await parseResponse(responseText, expectedIndices, expectedIndices);
      
      if (Object.keys(parsed.translations).length > 0) {
        const updated = entries.map(e => {
          if (parsed.translations[e.index]) {
            return { ...e, translated: parsed.translations[e.index] };
          }
          return e;
        });
        
        setEntries(updated);
        onUpdateEntries(updated);
        await refreshQC(updated);
      } else {
         console.warn("AI didn't return any valid JSON fixes.");
      }
    } catch (err) {
      console.error("Retry issues failed:", err);
    } finally {
      setIsRetryingIssues(false);
    }
  };

  const handleDeleteEntry = (indexToDelete: number) => {
    const filtered = entries.filter(e => e.index !== indexToDelete);
    // Reindex everything sequentially
    const reindexed = filtered.map((e, idx) => ({ ...e, index: idx + 1 }));
    setEntries(reindexed);
    onUpdateEntries(reindexed);
    refreshQC(reindexed);
  };

  const handleTextChange = (index: number, newTranslated: string) => {
    const updated = entries.map((e) => e.index === index ? { ...e, translated: newTranslated, reviewed: true } : e);
    setEntries(updated);
    onUpdateEntries(updated);
    refreshQC(updated);
  };

  const filteredEntries = entries.filter((e) => {
    const textToMatch = `${e.content || ''} ${e.translated || ''}`.toLowerCase();
    if (!textToMatch.includes(searchQuery.toLowerCase())) return false;
    if (filterMode === 'untranslated') return !e.translated?.trim();
    const entryIssues = issues.filter((i) => i.entry_index === e.index);
    if (filterMode === 'errors') return entryIssues.some((i) => i.severity === 'error');
    if (filterMode === 'warnings') return entryIssues.some((i) => i.severity === 'warning');
    return true;
  });

  const totalPages = Math.ceil(filteredEntries.length / pageSize) || 1;
  const paginatedEntries = filteredEntries.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const translatedCount = entries.filter((e) => e.translated?.trim()).length;

  return (
    <div className="space-y-4 h-full flex flex-col">
      {dictToastEntry && (
        <AddToDictionaryToast entry={dictToastEntry} langCode={langCode} onClose={() => setDictToastEntry(null)} />
      )}

      {/* Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface/80 p-4 rounded-2xl border border-subtle">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted" />
          <input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            placeholder="Search original or translation..."
            className="w-full bg-app border border-subtle rounded-lg pl-10 pr-4 py-2 text-xs text-main focus:outline-none" />
        </div>

        <div className="flex items-center gap-1.5 bg-app p-1 rounded-lg border border-subtle text-xs">
          {[['all', `All (${entries.length})`, ''], ['errors', `Errors (${errorCount})`, 'bg-red-600'], ['warnings', `Warnings (${warningCount})`, 'bg-amber-600'], ['untranslated', 'Untranslated', 'bg-slate-700']] .map(([mode, label, activeClass]) => (
            <button key={mode} onClick={() => { setFilterMode(mode as typeof filterMode); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                filterMode === mode ? (activeClass || 'btn-accent') : 'text-muted hover:text-main'
              }`}>{label}</button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          {isRetryingIssues ? (
            <span className="flex items-center gap-2 text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin inline-block" />
              Retrying Issues...
            </span>
          ) : (
            (errorCount > 0 || warningCount > 0) && (
              <button onClick={handleRetryIssues} className="flex items-center gap-2 text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg border border-amber-500/20 cursor-pointer transition-colors">
                <RotateCcw className="h-3.5 w-3.5" />
                Retry Issues with AI
              </button>
            )
          )}
          
          <button 
            onClick={() => onUpdateConfig({ preserve_honorifics: !config.preserve_honorifics })} 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${config.preserve_honorifics ? 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20' : 'text-slate-400 bg-slate-800/50 border-slate-700/50 hover:text-slate-300'}`}
            title="Toggle Japanese honorifics stripping (Review Only)"
          >
            {config.preserve_honorifics ? <User className="h-3.5 w-3.5" /> : <UserMinus className="h-3.5 w-3.5" />}
            {config.preserve_honorifics ? 'Honorifics: Keep' : 'Honorifics: Strip'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{translatedCount}/{entries.length} done</span>
          <button onClick={onNext} className="flex items-center gap-2 btn-accent font-medium text-xs px-4 py-2 rounded-lg cursor-pointer">
            Export <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-surface/40 rounded-2xl border border-subtle select-text">
        <table className="w-full text-left text-xs text-main">
          <thead className="bg-surface/90 text-muted uppercase tracking-wider sticky top-0 z-10 border-b border-subtle">
            <tr>
              <th className="py-3 px-4 w-12">#</th>
              <th className="py-3 px-4 w-32">Timecodes</th>
              <th className="py-3 px-4 w-1/3">Original</th>
              <th className="py-3 px-4">Transcreation</th>
              <th className="py-3 px-4 w-28 text-center">Status</th>
              <th className="py-3 px-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {paginatedEntries.map((e) => {
              const entryIssues = issues.filter((i) => i.entry_index === e.index);
              const hasError = entryIssues.some((i) => i.severity === 'error');
              const hasWarning = entryIssues.some((i) => i.severity === 'warning');
              const issueTitles = entryIssues.map(i => `[${i.code}] ${i.message}${i.suggested_fix ? `\nSuggestion: ${i.suggested_fix}` : ''}`).join('\n\n');
              return (
                <tr key={e.index} className="hover:bg-surface-hover/30 transition-colors group">
                  <td className="py-3 px-4 font-mono text-muted">{e.index}</td>
                  <td className="py-3 px-4 font-mono text-[11px] text-muted whitespace-nowrap">
                    <div>{e.start_time}</div>
                    <div className="text-muted">{e.end_time}</div>
                  </td>
                  <td className="py-3 px-4 text-main whitespace-pre-wrap leading-relaxed">{e.content}</td>
                  <td className="py-3 px-4">
                    <textarea 
                      id={`textarea-${e.index}`}
                      rows={1}
                      value={e.translated || ''}
                      onChange={(evt) => handleTextChange(e.index, evt.target.value)}
                      onBlur={(evt) => {
                        const formatted = applyPostProcessing(evt.target.value, config.preserve_honorifics, config.sfx_filter_mode);
                        if (formatted !== evt.target.value) {
                          handleTextChange(e.index, formatted);
                        }
                      }}
                      onInput={(evt) => {
                        const target = evt.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = `${target.scrollHeight}px`;
                      }}
                      onKeyDown={(evt) => {
                        if (evt.ctrlKey && evt.key === 'Enter') {
                          evt.preventDefault();
                          const nextIdx = paginatedEntries.findIndex(p => p.index === e.index) + 1;
                          if (nextIdx < paginatedEntries.length) {
                            const nextTargetIdx = paginatedEntries[nextIdx].index;
                            const nextEl = document.getElementById(`textarea-${nextTargetIdx}`);
                            if (nextEl) (nextEl as HTMLTextAreaElement).focus();
                          }
                        }
                      }}
                      placeholder="Type translation..."
                      className="w-full bg-app border border-subtle focus:border-indigo-500 rounded-lg p-2 text-xs text-indigo-200 focus:outline-none transition-colors resize-none overflow-hidden" 
                      style={{ minHeight: '36px' }}
                    />
                  </td>
                  <td className="py-3 px-4 text-center">
                    {hasError ? (
                      <span title={issueTitles} className="inline-flex items-center gap-1 bg-red-500/10 border border-red-500/30 text-red-400 px-2 py-0.5 rounded text-[10px] font-semibold cursor-help">
                        <AlertTriangle className="h-3 w-3" /> Error
                      </span>
                    ) : hasWarning ? (
                      <span title={issueTitles} className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded text-[10px] font-semibold cursor-help">
                        <AlertTriangle className="h-3 w-3" /> Warning
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">
                        <CheckCircle2 className="h-3 w-3" /> OK
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => setDictToastEntry(e)}
                        title="Save to dictionary (Select text and press Alt+S)"
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-muted hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer"
                      >
                        <BookPlus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteEntry(e.index)}
                        title="Delete this line"
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between bg-surface/80 px-4 py-2.5 rounded-xl border border-subtle text-xs text-muted">
        <div>Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({filteredEntries.length} lines)</div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
            className="p-1.5 rounded-lg border border-subtle bg-app text-main disabled:opacity-40 hover:bg-surface-hover transition-colors cursor-pointer">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
            className="p-1.5 rounded-lg border border-subtle bg-app text-main disabled:opacity-40 hover:bg-surface-hover transition-colors cursor-pointer">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
