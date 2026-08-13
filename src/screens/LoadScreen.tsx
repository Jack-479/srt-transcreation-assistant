import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileUp, AlertCircle } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { loadSrtFile } from '../services/tauri';
import { SubtitleEntry } from '../types';

interface LoadScreenProps {
  onFileLoaded: (path: string, entries: SubtitleEntry[], encoding: string) => void;
}

export function LoadScreen({ onFileLoaded }: LoadScreenProps) {
  const [filePathInput, setFilePathInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleBrowse = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Subtitle Files', extensions: ['srt'] }],
      });
      if (selected && typeof selected === 'string') {
        setFilePathInput(selected);
        processFile(selected);
      }
    } catch (err: unknown) {
      setError(String(err));
    }
  };

  const processFile = async (path: string) => {
    if (!path.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const [entries, encoding] = await loadSrtFile(path);
      onFileLoaded(path, entries, encoding);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white tracking-tight">Load SRT Subtitle File</h2>
        <p className="text-slate-400 text-sm">
          Select or drop your source `.srt` file. Rust parses the timestamps and text with zero latency.
        </p>
      </div>

      <motion.div
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={handleBrowse}
        className="relative flex flex-col items-center justify-center border-2 border-dashed border-indigo-500/40 hover:border-indigo-400 bg-slate-900/60 hover:bg-slate-900/80 rounded-2xl p-12 text-center cursor-pointer transition-all shadow-xl group"
      >
        <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform mb-4 shadow-inner">
          <FileUp className="h-8 w-8" />
        </div>
        <p className="text-base font-semibold text-slate-200">
          Click to Browse for `.srt` File
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Supports UTF-8, UTF-8 with BOM, and legacy CJK encodings
        </p>
      </motion.div>

      {/* Direct path entry */}
      <div className="flex gap-3 bg-slate-900/80 p-4 rounded-xl border border-slate-800">
        <input
          type="text"
          value={filePathInput}
          onChange={(e) => setFilePathInput(e.target.value)}
          placeholder="Or paste absolute file path here (e.g. C:\subtitles\sample.srt)"
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
        />
        <button
          onClick={() => processFile(filePathInput)}
          disabled={loading || !filePathInput.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
        >
          {loading ? 'Parsing...' : 'Load'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
