import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { SubtitleEntry, ProjectConfig } from '../types';
import { exportSrtFile } from '../services/tauri';
import { applyPostProcessing } from '../services/post-processing';

interface ExportScreenProps {
  entries: SubtitleEntry[];
  config: ProjectConfig;
  sourcePath: string;
}

export function ExportScreen({
  entries,
  config,
  sourcePath,
}: ExportScreenProps) {
  const defaultDest = sourcePath
    ? sourcePath.replace(/\.srt$/i, `.${config.target_lang.toLowerCase()}.srt`)
    : `translated.${config.target_lang.toLowerCase()}.srt`;

  const [destPath, setDestPath] = useState<string>(defaultDest);
  const [bom, setBom] = useState<boolean>(config.bom_on_export);
  const [bilingual, setBilingual] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [successPath, setSuccessPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBrowseDest = async () => {
    try {
      const selected = await save({
        defaultPath: destPath,
        filters: [{ name: 'Subtitle Files', extensions: ['srt'] }],
      });
      if (selected && typeof selected === 'string') {
        setDestPath(selected);
      }
    } catch (err: unknown) {
      setError(String(err));
    }
  };

  const handleExport = async () => {
    if (!destPath.trim()) return;
    setExporting(true);
    setError(null);
    setSuccessPath(null);
    try {
      const finalEntries = entries.map(e => ({
        ...e,
        translated: applyPostProcessing(e.translated || '', config.preserve_honorifics, config.sfx_filter_mode)
      }));
      const outPath = await exportSrtFile(finalEntries, destPath, bom, bilingual);
      setSuccessPath(outPath);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-main tracking-tight">Export Transcreation</h2>
        <p className="text-muted text-sm">
          Export your final {entries.length} subtitle cues into a clean `.srt` subtitle file.
        </p>
      </div>

      <div className="bg-surface p-6 rounded-2xl border border-subtle space-y-6">
        {/* Output Path Input */}
        <div>
          <label className="block text-xs font-medium text-muted mb-2">Export File Destination</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={destPath}
              onChange={(e) => setDestPath(e.target.value)}
              className="flex-1 bg-app border border-subtle rounded-lg px-4 py-2.5 text-xs text-main focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleBrowseDest}
              className="bg-surface-hover hover:bg-subtle text-main text-xs font-medium px-4 py-2.5 rounded-lg border border-subtle transition-colors cursor-pointer"
            >
              Browse
            </button>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3 pt-2 border-t border-subtle">
          <label className="flex items-center gap-3 text-xs text-main cursor-pointer">
            <input
              type="checkbox"
              checked={bom}
              onChange={(e) => setBom(e.target.checked)}
              className="h-4 w-4 rounded bg-app border-subtle text-indigo-600 focus:ring-0"
            />
            <span>Include UTF-8 Byte Order Mark (BOM) (Recommended for Windows media players)</span>
          </label>

          <label className="flex items-center gap-3 text-xs text-main cursor-pointer">
            <input
              type="checkbox"
              checked={bilingual}
              onChange={(e) => setBilingual(e.target.checked)}
              className="h-4 w-4 rounded bg-app border-subtle text-indigo-600 focus:ring-0"
            />
            <span>Bilingual Subtitle Mode (Output both original & translated text on screen)</span>
          </label>
        </div>

        {/* Export Button */}
        <button
          onClick={handleExport}
          disabled={exporting || !destPath.trim()}
          className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-main font-medium text-sm rounded-xl shadow-lg shadow-indigo-500/25 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> {exporting ? 'Writing File...' : 'Export SRT File Now'}
        </button>
      </div>

      {successPath && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <span>Successfully exported SRT file to: <strong>{successPath}</strong></span>
        </motion.div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-muted text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
