import { useState, useEffect } from 'react';
import { Plus, Trash2, Search, Download, Upload, RotateCcw, BookMarked } from 'lucide-react';
import {
  loadDictionary,
  addDictionaryEntry,
  deleteDictionaryEntry,
  allEntries,
  FlatDictionaryEntry,
  exportDictionaryJSON,
  importDictionaryJSON,
  resetToSeed,
} from '../services/dictionary-service';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';

const SUPPORTED_LANGS = [
  { name: 'Japanese', code: 'ja' },
  { name: 'Chinese', code: 'zh' },
  { name: 'Korean', code: 'ko' },
];

export function DictionaryScreen() {
  const [selectedLang, setSelectedLang] = useState<{ name: string; code: string }>(SUPPORTED_LANGS[0]);
  const [entries, setEntries] = useState<FlatDictionaryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newSource, setNewSource] = useState('');
  const [newTranslation, setNewTranslation] = useState('');
  const [newCategory, setNewCategory] = useState<'moan' | 'phrase'>('phrase');
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const refreshEntries = () => {
    const dict = loadDictionary(selectedLang.code);
    setEntries(allEntries(dict));
  };

  useEffect(() => { refreshEntries(); }, [selectedLang]);

  const setStatus = (text: string, ok = true) => {
    setStatusMsg({ text, ok });
    setTimeout(() => setStatusMsg(null), 3500);
  };

  const handleAdd = () => {
    if (!newSource.trim() || !newTranslation.trim()) {
      setStatus('Enter both source text and translation.', false);
      return;
    }
    addDictionaryEntry(selectedLang.code, newSource.trim(), newTranslation.trim(), newCategory);
    setNewSource('');
    setNewTranslation('');
    refreshEntries();
    setStatus(`Added "${newSource.trim()}"`);
  };

  const handleDelete = (key: string, table: 'interjections' | 'common_phrases') => {
    deleteDictionaryEntry(selectedLang.code, key, table);
    refreshEntries();
  };

  const handleExport = async () => {
    try {
      const path = await save({
        title: 'Export Dictionary as JSON',
        defaultPath: `dictionary_${selectedLang.code}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) return;
      const json = exportDictionaryJSON(selectedLang.code);
      await writeTextFile(path, json);
      setStatus(`Exported to ${path}`);
    } catch (err) {
      setStatus(`Export failed: ${err}`, false);
    }
  };

  const handleImport = async () => {
    try {
      const path = await open({
        title: 'Import Dictionary JSON',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        multiple: false,
      });
      if (!path || typeof path !== 'string') return;
      const text = await readTextFile(path);
      const count = importDictionaryJSON(selectedLang.code, text);
      refreshEntries();
      setStatus(`Imported ${count} entries.`);
    } catch (err) {
      setStatus(`Import failed: ${err}`, false);
    }
  };

  const handleReset = () => {
    resetToSeed(selectedLang.code);
    refreshEntries();
    setShowResetConfirm(false);
    setStatus('Dictionary reset to built-in defaults.');
  };

  const filtered = entries.filter((e) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return e.key.includes(q) || e.entry.source.toLowerCase().includes(q) || e.entry.translation.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-8">
      {/* Header */}
      <div className="text-center space-y-1.5">
        <h2 className="text-2xl font-bold text-main tracking-tight">Phrase Dictionary</h2>
        <p className="text-muted text-sm max-w-xl mx-auto">
          Entries here are translated instantly without sending them to the AI. Add corrections from the Review screen,
          or manage entries directly here.
        </p>
      </div>

      {/* Language selector */}
      <div className="flex items-center gap-2">
        {SUPPORTED_LANGS.map((lang) => (
          <button
            key={lang.code}
            onClick={() => setSelectedLang(lang)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-all cursor-pointer ${
              selectedLang.code === lang.code
                ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                : 'border-slate-800 bg-surface text-muted hover:border-subtle'
            }`}
          >
            {lang.name}
          </button>
        ))}
        <div className="ml-auto text-xs text-muted">
          {entries.length} entries
        </div>
      </div>

      {/* Add Entry */}
      <div className="bg-surface border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-main font-semibold text-sm border-b border-slate-800 pb-3">
          <Plus className="h-4 w-4 text-indigo-400" /> Add Entry
        </div>
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
            placeholder={`${selectedLang.name} source text`}
            className="flex-1 min-w-[160px] bg-app border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-main focus:outline-none focus:border-indigo-500"
          />
          <input
            type="text"
            value={newTranslation}
            onChange={(e) => setNewTranslation(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="English translation"
            className="flex-1 min-w-[160px] bg-app border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-main focus:outline-none focus:border-indigo-500"
          />
          <div className="relative">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as 'moan' | 'phrase')}
              className="appearance-none bg-app border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-main focus:outline-none focus:border-indigo-500 pr-7 cursor-pointer"
            >
              <option value="phrase">Phrase</option>
              <option value="moan">Interjection</option>
            </select>
          </div>
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 btn-accent px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        {statusMsg && (
          <p className={`text-xs font-medium ${statusMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {statusMsg.text}
          </p>
        )}
      </div>

      {/* Toolbar: search + import/export/reset */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entries..."
            className="w-full bg-surface border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-main focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleImport} className="flex items-center gap-1.5 text-xs bg-surface-hover hover:bg-subtle border border-subtle text-main px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
            <Upload className="h-3.5 w-3.5" /> Import JSON
          </button>
          <button onClick={handleExport} className="flex items-center gap-1.5 text-xs bg-surface-hover hover:bg-subtle border border-subtle text-main px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
            <Download className="h-3.5 w-3.5" /> Export JSON
          </button>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-1.5 text-xs bg-surface-hover hover:bg-red-900/30 border border-subtle hover:border-red-500/30 text-muted hover:text-red-400 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      </div>

      {/* Reset confirm */}
      {showResetConfirm && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-red-300">This will overwrite all custom entries with the built-in defaults. Continue?</p>
          <div className="flex gap-2">
            <button onClick={() => setShowResetConfirm(false)} className="text-xs px-3 py-1.5 rounded-lg border border-subtle text-muted hover:text-main cursor-pointer">Cancel</button>
            <button onClick={handleReset} className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-main cursor-pointer">Reset</button>
          </div>
        </div>
      )}

      {/* Entries table */}
      <div className="bg-surface border border-slate-800 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm">
            {searchQuery ? 'No entries match your search.' : 'No entries yet. Add one above.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted text-xs uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4 text-left">Source</th>
                <th className="py-2.5 px-4 text-left">Translation</th>
                <th className="py-2.5 px-4 text-left">Type</th>
                <th className="py-2.5 px-4 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((e) => (
                <tr key={`${e.table}-${e.key}`} className="hover:bg-surface-hover/30 transition-colors group">
                  <td className="py-2.5 px-4 font-mono text-main text-sm">{e.entry.source || e.key}</td>
                  <td className="py-2.5 px-4 text-main">{e.entry.translation}</td>
                  <td className="py-2.5 px-4">
                    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${
                      e.entry.category === 'moan'
                        ? 'bg-violet-500/10 text-violet-300 border border-violet-500/20'
                        : 'bg-surface-hover text-muted'
                    }`}>
                      {e.entry.category === 'moan' ? 'Interjection' : 'Phrase'}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <button
                      onClick={() => handleDelete(e.key, e.table)}
                      className="opacity-0 group-hover:opacity-100 h-7 w-7 flex items-center justify-center rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-start gap-2 text-xs text-muted bg-surface border border-subtle rounded-xl p-3">
        <BookMarked className="h-4 w-4 shrink-0 mt-0.5 text-muted" />
        <span>Dictionary entries are resolved before sending to the AI. Matched lines are pre-translated and excluded from API chunks, saving tokens and ensuring consistency. You can also add entries from the Review screen.</span>
      </div>
    </div>
  );
}
