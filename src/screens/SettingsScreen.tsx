import { useState, useEffect } from 'react';
import {
  Shield, Cpu, Key, Palette, Save, CheckCircle2,
  ToggleLeft, ToggleRight, ChevronDown, Zap,
  AlertTriangle, Info,
} from 'lucide-react';
import {
  AppSettings, DEFAULT_APP_SETTINGS,
  GEMINI_MODELS, FALLBACK_MODEL_OPTIONS,
} from '../types';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

const SETTINGS_KEY = 'srt_app_settings';

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_APP_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_APP_SETTINGS };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

function saveSettings(s: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function applyTheme(theme: string, mode: string) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-mode', mode);
  
  // Update native window theme (Tauri)
  try {
    getCurrentWindow().setTheme(mode === 'dark' ? 'dark' : 'light').catch(console.error);
  } catch {
    // Ignore error if not in Tauri environment
  }
}

interface SettingsScreenProps {
  onSettingsChanged?: (s: AppSettings) => void;
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-surface p-5 rounded-2xl border border-subtle space-y-5">
      <div className="flex items-center gap-2 font-semibold text-main text-sm border-b border-subtle pb-3">
        <Icon className="h-4 w-4 accent-icon" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-start gap-3 w-full text-left cursor-pointer group">
      <div className="shrink-0 mt-0.5">
        {checked
          ? <ToggleRight className="h-5 w-5 accent-icon" />
          : <ToggleLeft className="h-5 w-5 text-muted" />}
      </div>
      <div>
        <p className={`text-sm font-medium ${checked ? 'text-main' : 'text-muted'}`}>{label}</p>
        {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
      </div>
    </button>
  );
}

function StyledSelect<T extends string>({ value, onChange, children }: { value: T; onChange: (v: T) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full appearance-none bg-surface border border-subtle rounded-lg px-3.5 py-2 text-sm text-main focus:outline-none pr-8 cursor-pointer"
      >
        {children}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted pointer-events-none" />
    </div>
  );
}

const THEMES = [
  { id: 'slate',    label: 'Slate',    bg: '#64748b' },
  { id: 'ocean',    label: 'Ocean',    bg: '#0ea5e9' },
  { id: 'forest',   label: 'Forest',   bg: '#10b981' },
  { id: 'sunset',   label: 'Sunset',   bg: '#f97316' },
  { id: 'midnight', label: 'Midnight', bg: '#8b5cf6' },
];

export function SettingsScreen({ onSettingsChanged }: SettingsScreenProps) {
  const [s, setS] = useState<AppSettings>(loadSettings);
  const [saved, setSaved] = useState(false);

  const upd = (patch: Partial<AppSettings>) => { setS((prev) => ({ ...prev, ...patch })); setSaved(false); };

  const [testStatus, setTestStatus] = useState<{ success: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleSave = () => {
    saveSettings(s);
    applyTheme(s.theme_name, s.color_mode);
    setSaved(true);
    onSettingsChanged?.(s);
    setTimeout(() => setSaved(false), 3000);
  };

  const setTheme = (theme: 'slate' | 'ocean' | 'forest' | 'sunset' | 'midnight', mode: 'light' | 'dark') => {
    const newS = { ...s, theme_name: theme, color_mode: mode };
    setS(newS);
    saveSettings(newS);
    applyTheme(theme, mode);
    onSettingsChanged?.(newS);
  };

  useEffect(() => { setS(loadSettings()); }, []);

  const primaryModelInfo = GEMINI_MODELS.find((m) => m.id === s.default_primary_model);
  const fallbackModelInfo = FALLBACK_MODEL_OPTIONS.find((m) => m.id === s.default_fallback_model);

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-8">
      <div className="text-center space-y-1.5">
        <h2 className="text-2xl font-bold text-main tracking-tight">Application Settings</h2>
        <p className="text-muted text-sm">App-wide defaults — applied to every new project.</p>
      </div>

      {/* API Key */}
      <SectionCard title="Default API Key" icon={Key}>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Gemini API Key <span className="text-muted">(stored in browser localStorage)</span></label>
          <div className="flex gap-3">
            <input
              type="password" value={s.default_api_key}
              onChange={(e) => upd({ default_api_key: e.target.value })}
              placeholder="AIzaSy... — paste your Gemini API key"
              className="flex-1 bg-app border border-subtle rounded-lg px-4 py-2.5 text-sm text-main focus:outline-none"
            />
            <button
              onClick={async () => {
                setTesting(true);
                setTestStatus(null);
                try {
                  await invoke('validate_api_key_command', { apiKey: s.default_api_key, model: s.default_primary_model });
                  setTestStatus({ success: true, msg: 'Validated Successfully' });
                } catch (err) {
                  setTestStatus({ success: false, msg: String(err) });
                } finally {
                  setTesting(false);
                }
              }}
              disabled={testing || !s.default_api_key.trim()}
              className="bg-surface-hover hover:bg-subtle disabled:opacity-50 text-main text-sm font-medium px-4 py-2.5 rounded-lg border border-subtle transition-colors cursor-pointer"
            >
              {testing ? 'Testing...' : 'Test Key'}
            </button>
            <button
              onClick={handleSave}
              className="btn-accent text-sm font-medium px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
            >
              Save Key
            </button>
          </div>
          {testStatus && (
            <div className={`mt-2 flex items-center gap-2.5 p-3 rounded-lg text-xs font-medium ${testStatus.success ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-red-500/10 text-red-300 border border-red-500/20'}`}>
              {testStatus.success ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />}
              <span>{testStatus.msg}</span>
            </div>
          )}
          <p className="text-xs text-muted mt-1.5 flex items-start gap-1">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            Saved locally. Never sent anywhere other than the Gemini API directly from this device.
          </p>
        </div>
      </SectionCard>

      {/* AI Models */}
      <SectionCard title="Default AI Models" icon={Cpu}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Default Primary Model</label>
            <StyledSelect value={s.default_primary_model} onChange={(v) => upd({ default_primary_model: v })}>
              {GEMINI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </StyledSelect>
            {primaryModelInfo && (
              <p className={`text-xs mt-1.5 ${primaryModelInfo.tier === 'legacy' ? 'text-amber-400' : 'text-muted'}`}>
                {primaryModelInfo.tier === 'legacy' && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                {primaryModelInfo.description}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Default QC Model</label>
            <StyledSelect value={s.default_qc_model} onChange={(v) => upd({ default_qc_model: v })}>
              {GEMINI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </StyledSelect>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Default Fallback Model</label>
            <StyledSelect value={s.default_fallback_model} onChange={(v) => upd({ default_fallback_model: v })}>
              {FALLBACK_MODEL_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </StyledSelect>
            {fallbackModelInfo && fallbackModelInfo.id !== 'none' && (
              <p className={`text-xs mt-1.5 ${fallbackModelInfo.tier === 'legacy' ? 'text-amber-400' : 'text-muted'}`}>
                {fallbackModelInfo.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end mt-4 gap-3">
          {saved && <span className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Saved!</span>}
          <button onClick={handleSave} className="text-xs text-muted hover:text-main px-3 py-1.5 rounded-lg border border-subtle bg-surface-hover cursor-pointer transition-colors">
            Save Models
          </button>
        </div>
      </SectionCard>

      {/* Concurrency */}
      <SectionCard title="API Concurrency" icon={Zap}>
        <div>
          <label className="block text-xs font-medium text-muted mb-2">
            Parallel Chunk Requests
            <span className="ml-1 text-muted font-normal">(chunks processed simultaneously)</span>
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range" min={1} max={20}
              value={s.concurrent_requests}
              onChange={(e) => upd({ concurrent_requests: Number(e.target.value) })}
              className="flex-1 accent-orange-400"
            />
            <span className="text-lg font-bold accent-text w-6 text-center">{s.concurrent_requests}</span>
          </div>
          <div className="flex justify-between text-xs text-muted mt-1">
            <span>1 (sequential)</span>
            <span>5 (recommended)</span>
            <span>10 (max)</span>
          </div>
          <p className="text-xs text-muted mt-2">
            Higher values dramatically speed up translation but may hit API rate limits. Start with 3–5.
          </p>
        </div>
      </SectionCard>


      {/* Export & Safety */}
      <SectionCard title="Export & Safety" icon={Shield}>
        <Toggle checked={s.bom_on_export} onChange={(v) => upd({ bom_on_export: v })}
          label="Write UTF-8 BOM on export by default"
          description="Required by some players (SubRip, Windows Media). Recommended."
        />
        <Toggle checked={s.safety_block_none} onChange={(v) => upd({ safety_block_none: v })}
          label="Use BLOCK_NONE safety thresholds"
          description="Sets all Gemini safety categories to BLOCK_NONE for uncensored transcreation."
        />
      </SectionCard>

      {/* Theme & Appearance */}
      <SectionCard title="Theme & Appearance" icon={Palette}>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Color Mode</label>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {(['dark', 'light'] as const).map((mode) => (
              <button key={mode} onClick={() => setTheme(s.theme_name, mode)}
                className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all cursor-pointer capitalize ${
                  s.color_mode === mode
                    ? 'sidebar-active'
                    : 'border-subtle bg-surface text-muted hover:border-subtle'
                }`}
              >
                {mode === 'dark' ? 'Dark Mode' : 'Light Mode'}
              </button>
            ))}
          </div>
          
          <label className="block text-xs font-medium text-muted mb-2">Color Theme</label>
          <div className="flex items-center gap-3 flex-wrap">
            {THEMES.map((th) => (
              <button key={th.id} onClick={() => setTheme(th.id as any, s.color_mode)} title={th.label}
                style={{ backgroundColor: th.bg }}
                className={`h-9 w-9 rounded-full transition-all cursor-pointer ${
                  s.theme_name === th.id ? 'ring-2 ring-offset-2 ring-offset-[var(--bg-app)] ring-[var(--accent)] scale-110' : 'opacity-60 hover:opacity-100 hover:scale-105'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-muted mt-3">Changes apply immediately.</p>
        </div>
      </SectionCard>

      {/* About */}
      <SectionCard title="About" icon={Info}>
        <div className="space-y-2 text-xs text-muted">
          {[['Application','SRT Transcreation Assistant'],['Version','v1.0'],['Runtime','Tauri v2'],['AI Engine','Google Gemini API'],['Model Catalogue','Updated August 2026']]
            .map(([k,v]) => (
              <div key={k} className="flex items-center justify-between">
                <span>{k}</span><span className="text-main font-mono">{v}</span>
              </div>
            ))}
        </div>
      </SectionCard>

      {/* Save */}
      <div className="flex items-center justify-end gap-4 pt-2">
        {saved && <span className="flex items-center gap-1.5 text-sm text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Saved!</span>}
        <button onClick={handleSave} className="flex items-center gap-2 btn-accent px-6 py-3 rounded-xl text-sm font-medium cursor-pointer">
          <Save className="h-4 w-4" /> Save Settings
        </button>
      </div>
    </div>
  );
}
