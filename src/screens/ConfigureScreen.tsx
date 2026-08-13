import { useState } from 'react';
import {
  Key, Globe, Layers, CheckCircle2, AlertCircle, ArrowRight,
  Cpu, BookOpen, Wand2, Zap, AlertTriangle, ToggleLeft, ToggleRight,
  Info, ChevronDown, Edit2, X, RotateCcw, Settings as SettingsIcon,
} from 'lucide-react';
import {
  ProjectConfig, GEMINI_MODELS, FALLBACK_MODEL_OPTIONS,
  PROFILE_CATALOG, TranslationProfile, TranslationMode,
  BUILTIN_PROFILE_TEMPLATES,
} from '../types';
import { validateApiKey } from '../services/tauri';

interface ConfigureScreenProps {
  config: ProjectConfig;
  apiKey: string;
  onUpdateConfig: (config: ProjectConfig, apiKey: string) => void;
  onSaveModelDefaults: () => void;
  onNext: () => void;
}

const COMMON_LANGUAGES = [
  'Japanese', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Korean',
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese',
  'Russian', 'Arabic', 'Hindi', 'Vietnamese', 'Thai', 'Indonesian',
];

const PROFILE_ICON: Record<TranslationProfile, React.ElementType> = {
  natural: Wand2, cultural: BookOpen, explicit: Zap, custom: SettingsIcon,
};
const PROFILE_COLORS: Record<TranslationProfile, string> = {
  natural: 'emerald', cultural: 'violet', explicit: 'rose', custom: 'amber',
};

function borderClass(id: TranslationProfile, active: boolean) {
  if (!active) return 'border-subtle bg-surface hover:border-subtle';
  const m: Record<string, string> = {
    emerald: 'border-emerald-500/50 bg-emerald-500/5',
    violet: 'border-violet-500/50 bg-violet-500/5',
    rose: 'border-rose-500/50 bg-rose-500/5',
    amber: 'border-amber-500/50 bg-amber-500/5',
  };
  return m[PROFILE_COLORS[id]] ?? 'sidebar-active';
}
function textClass(id: TranslationProfile, active: boolean) {
  if (!active) return 'text-muted';
  const m: Record<string, string> = { emerald: 'text-emerald-300', violet: 'text-violet-300', rose: 'text-rose-300', amber: 'text-amber-300' };
  return m[PROFILE_COLORS[id]] ?? 'accent-text';
}
function iconClass(id: TranslationProfile, active: boolean) {
  if (!active) return 'text-muted';
  const m: Record<string, string> = { emerald: 'text-emerald-400', violet: 'text-violet-400', rose: 'text-rose-400', amber: 'text-amber-400' };
  return m[PROFILE_COLORS[id]] ?? 'accent-icon';
}
function dotClass(id: TranslationProfile) {
  const m: Record<string, string> = {
    emerald: 'bg-emerald-400 shadow-emerald-400',
    violet: 'bg-violet-400 shadow-violet-400',
    rose: 'bg-rose-400 shadow-rose-400',
    amber: 'bg-amber-400 shadow-amber-400',
  };
  return m[PROFILE_COLORS[id]] ?? 'bg-indigo-400 shadow-indigo-400';
}

function StyledSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-app border border-subtle rounded-lg px-3.5 py-2 text-sm text-main focus:outline-none pr-8 cursor-pointer">
        {children}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted pointer-events-none" />
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, collapsible, defaultExpanded = true }: { title: string; icon: React.ElementType; children: React.ReactNode; collapsible?: boolean; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="bg-surface p-5 rounded-2xl border border-subtle space-y-4">
      <div 
        className={`flex items-center gap-2 font-semibold text-main text-sm border-b border-subtle pb-3 ${collapsible ? 'cursor-pointer select-none' : ''}`}
        onClick={() => collapsible && setExpanded(!expanded)}
      >
        <Icon className="h-4 w-4 accent-icon" />
        <span className="flex-1">{title}</span>
        {collapsible && (
          <ChevronDown className={`h-4 w-4 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
        )}
      </div>
      {expanded && children}
    </div>
  );
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-start gap-3 w-full text-left cursor-pointer">
      <div className="shrink-0 mt-0.5">
        {checked ? <ToggleRight className="h-5 w-5 accent-icon" /> : <ToggleLeft className="h-5 w-5 text-muted" />}
      </div>
      <div>
        <p className={`text-sm font-medium ${checked ? 'text-main' : 'text-muted'}`}>{label}</p>
        {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
      </div>
    </button>
  );
}

// Profile template editor modal
function ProfileEditModal({
  profile, onClose,
}: {
  profile: TranslationProfile;
  onClose: () => void;
}) {
  const storeKey = 'srt_profile_templates';
  const stored = JSON.parse(localStorage.getItem(storeKey) ?? '{}');
  const [text, setText] = useState<string>(stored[profile] ?? BUILTIN_PROFILE_TEMPLATES[profile] ?? '');

  const handleSave = () => {
    const all = JSON.parse(localStorage.getItem(storeKey) ?? '{}');
    all[profile] = text;
    localStorage.setItem(storeKey, JSON.stringify(all));
    onClose();
  };
  const handleReset = () => {
    setText(BUILTIN_PROFILE_TEMPLATES[profile] ?? '');
  };

  const profileInfo = PROFILE_CATALOG.find((p) => p.id === profile);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-subtle rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-subtle">
          <div>
            <h3 className="font-semibold text-main">Edit Profile Template — {profileInfo?.label}</h3>
            <p className="text-xs text-muted mt-0.5">Changes are saved per-device and override built-in defaults.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleReset} className="flex items-center gap-1.5 text-xs text-muted hover:text-main bg-surface-hover hover:bg-subtle border border-subtle px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
              <RotateCcw className="h-3 w-3" /> Reset to default
            </button>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted hover:text-main hover:bg-subtle cursor-pointer transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-xs text-muted mb-3 leading-relaxed">
            Template variables: <code className="text-indigo-300 bg-indigo-500/10 px-1 rounded">{'{source_lang}'}</code>{' '}
            <code className="text-indigo-300 bg-indigo-500/10 px-1 rounded">{'{target_lang}'}</code>{' '}
            <code className="text-indigo-300 bg-indigo-500/10 px-1 rounded">{'{tone}'}</code>{' '}
            <code className="text-indigo-300 bg-indigo-500/10 px-1 rounded">{'{count}'}</code>{' '}
            <code className="text-indigo-300 bg-indigo-500/10 px-1 rounded">{'{last}'}</code>{' '}
            <code className="text-indigo-300 bg-indigo-500/10 px-1 rounded">{'{linguistic_notes}'}</code>{' '}
            <code className="text-indigo-300 bg-indigo-500/10 px-1 rounded">{'{glossary_block}'}</code>{' '}
            <code className="text-indigo-300 bg-indigo-500/10 px-1 rounded">{'{payload}'}</code>
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={22}
            className="w-full bg-app border border-subtle rounded-xl px-4 py-3 text-sm text-main font-mono focus:outline-none focus:border-indigo-500 resize-y"
          />
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-subtle">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-subtle text-muted hover:text-main cursor-pointer transition-colors">Cancel</button>
          <button onClick={handleSave} className="text-sm px-5 py-2 rounded-lg btn-accent font-medium cursor-pointer">Save Profile</button>
        </div>
      </div>
    </div>
  );
}

export function ConfigureScreen({ config, apiKey: initialApiKey, onUpdateConfig, onNext }: ConfigureScreenProps) {
  const [c, setC] = useState<ProjectConfig>(config);
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [validating, setValidating] = useState(false);
  const [valStatus, setValStatus] = useState<{ success: boolean; msg: string } | null>(null);
  const [editingProfile, setEditingProfile] = useState<TranslationProfile | null>(null);

  const upd = (patch: Partial<ProjectConfig>) => {
    setC((prev) => {
      const next = { ...prev, ...patch };
      onUpdateConfig(next, apiKey);
      return next;
    });
  };

  const handleValidate = async () => {
    if (!apiKey.trim()) return;
    setValidating(true); setValStatus(null);
    try {
      const msg = await validateApiKey(apiKey, c.primary_model);
      setValStatus({ success: true, msg });
    } catch (err) {
      setValStatus({ success: false, msg: String(err) });
    } finally { setValidating(false); }
  };

  const handleSaveAndContinue = () => {
    onUpdateConfig(c, apiKey);
    onNext();
  };

  const primaryModel = GEMINI_MODELS.find((m) => m.id === c.primary_model);
  const fallbackModel = FALLBACK_MODEL_OPTIONS.find((m) => m.id === c.fallback_model);

  // Check if a profile has been customized
  const storedTemplates: Record<string, string> = JSON.parse(localStorage.getItem('srt_profile_templates') ?? '{}');
  const isCustomized = (id: TranslationProfile) => !!storedTemplates[id] && storedTemplates[id] !== BUILTIN_PROFILE_TEMPLATES[id];

  return (
    <>
      {editingProfile && (
        <ProfileEditModal profile={editingProfile} onClose={() => setEditingProfile(null)} />
      )}

      <div className="max-w-4xl mx-auto space-y-6 pb-8">
        <div className="text-center space-y-1.5">
          <h2 className="text-2xl font-bold text-main tracking-tight">Project Configuration</h2>
          <p className="text-muted text-sm">Set languages, translation profile, AI models, and advanced options.</p>
        </div>

        {/* Translation Mode */}
        <SectionCard title="Translation Mode" icon={Zap}>
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: 'automatic' as TranslationMode, label: 'Automatic (API)', desc: 'Sends each chunk to Gemini API. Requires API key.', icon: Zap },
              { id: 'manual' as TranslationMode, label: 'Manual (Copy-Paste)', desc: 'Generates prompt text to copy into any AI chat. No API key needed.', icon: Cpu },
            ]).map((mode) => {
              const isActive = c.translation_mode === mode.id;
              const MIcon = mode.icon;
              return (
                <button key={mode.id} onClick={() => upd({ translation_mode: mode.id })}
                  className={`flex flex-col gap-2 p-4 rounded-xl border transition-all cursor-pointer text-left ${
                    isActive ? 'sidebar-active' : 'border-subtle bg-surface hover:border-subtle'
                  }`}>
                  <div className="flex items-center gap-2">
                    <MIcon className={`h-4 w-4 ${isActive ? 'accent-icon' : 'text-muted'}`} />
                    <span className={`text-sm font-semibold ${isActive ? 'accent-text' : 'text-muted'}`}>{mode.label}</span>
                    {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full sidebar-active-dot" />}
                  </div>
                  <p className="text-xs text-muted leading-relaxed">{mode.desc}</p>
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* Language Pair */}
        <SectionCard title="Language Pair" icon={Globe}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Source Language</label>
              <StyledSelect value={c.source_lang} onChange={(v) => upd({ source_lang: v })}>
                {COMMON_LANGUAGES.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
              </StyledSelect>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Target Language</label>
              <StyledSelect value={c.target_lang} onChange={(v) => upd({ target_lang: v })}>
                {COMMON_LANGUAGES.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
              </StyledSelect>
            </div>
          </div>

        </SectionCard>

        {/* Profile */}
        <SectionCard title="Transcreation Profile" icon={BookOpen}>
          <div className="grid grid-cols-2 gap-3">
            {PROFILE_CATALOG.map((profile) => {
              const isActive = c.active_profile === profile.id;
              const PIcon = PROFILE_ICON[profile.id] || BookOpen;
              const customized = isCustomized(profile.id);
              return (
                <div key={profile.id} className={`flex flex-col gap-2 p-4 rounded-xl border transition-all ${borderClass(profile.id, isActive)}`}>
                  <div className="flex items-center gap-2">
                    <button onClick={() => upd({ active_profile: profile.id })} className="flex-1 flex items-center gap-2 cursor-pointer text-left">
                      <PIcon className={`h-4 w-4 ${iconClass(profile.id, isActive)}`} />
                      <span className={`text-sm font-semibold ${textClass(profile.id, isActive)}`}>{profile.label}</span>
                      {customized && (
                        <span className="text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded ml-1">custom</span>
                      )}
                      {isActive && <span className={`ml-auto h-1.5 w-1.5 rounded-full shadow ${dotClass(profile.id)}`} />}
                    </button>
                    <button
                      onClick={() => setEditingProfile(profile.id)}
                      title="Edit profile template"
                      className="h-6 w-6 flex items-center justify-center rounded-md text-muted hover:text-slate-300 hover:bg-subtle transition-colors cursor-pointer shrink-0"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                  </div>
                  <button onClick={() => upd({ active_profile: profile.id })} className="text-left cursor-pointer">
                    <p className="text-xs text-muted leading-relaxed">{profile.description}</p>
                  </button>
                </div>
              );
            })}
          </div>


        </SectionCard>



        {/* AI Models (automatic only) */}
        {c.translation_mode === 'automatic' && (
          <SectionCard title="AI Models (Gemini)" icon={Cpu} collapsible defaultExpanded={false}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Primary Model</label>
                <StyledSelect value={c.primary_model} onChange={(v) => upd({ primary_model: v })}>
                  {GEMINI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </StyledSelect>
                {primaryModel && (
                  <p className={`text-xs mt-1.5 ${primaryModel.tier === 'legacy' ? 'text-amber-400' : 'text-muted'}`}>
                    {primaryModel.tier === 'legacy' && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                    {primaryModel.description}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">QC Judge Model</label>
                <StyledSelect value={c.qc_model} onChange={(v) => upd({ qc_model: v })}>
                  {GEMINI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </StyledSelect>
                <p className="text-xs mt-1.5 text-muted">
                  Used for real-time glossary verification. A shorter, cheaper model like Flash Lite is highly recommended.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Fallback Model</label>
                <StyledSelect value={c.fallback_model} onChange={(v) => upd({ fallback_model: v })}>
                  {FALLBACK_MODEL_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </StyledSelect>
                {fallbackModel && fallbackModel.id !== 'none' && (
                  <p className={`text-xs mt-1.5 ${fallbackModel.tier === 'legacy' ? 'text-amber-400' : 'text-muted'}`}>
                    {fallbackModel.description}
                  </p>
                )}
              </div>
            </div>

          </SectionCard>
        )}

        {/* Batching */}
        <SectionCard title="Batching" icon={Layers}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Chunk Size</label>
              <StyledSelect value={String(c.chunk_size)} onChange={(v) => upd({ chunk_size: Number(v) })}>
                <option value={50}>50 (Small)</option>
                <option value={100}>100 (Medium)</option>
                <option value={200}>200 (Recommended)</option>
                <option value={300}>300 (Large)</option>
                <option value={500}>500 (Ultra)</option>
              </StyledSelect>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Chunk Overlap</label>
              <input type="number" min={0} max={20} value={c.chunk_overlap}
                onChange={(e) => upd({ chunk_overlap: Number(e.target.value) })}
                className="w-full bg-app border border-subtle rounded-lg px-3.5 py-2 text-sm text-main focus:outline-none" />
            </div>
          </div>
        </SectionCard>

        {/* Advanced Toggles */}
        <SectionCard title="Advanced Options" icon={Zap} collapsible defaultExpanded={false}>
          <div className="space-y-4">
            <Toggle checked={c.reuse_duplicate_translations} onChange={(v) => upd({ reuse_duplicate_translations: v })}
              label="Reuse translations for repeated identical lines"
              description="Translate duplicates once, copy the result to all — saves tokens and ensures consistency." />

            <Toggle checked={c.use_linguistic_notes} onChange={(v) => upd({ use_linguistic_notes: v })}
              label="Include deep linguistic notes in prompt"
              description="Injects per-language grammar notes (pronoun-drop, aspect…) into each chunk prompt." />
              
            <Toggle checked={c.preserve_honorifics} onChange={(v) => upd({ preserve_honorifics: v })}
              label="Preserve Japanese Honorifics (-san, -chan, etc.)"
              description="If disabled, honorific suffixes will be automatically stripped via post-processing." />

            <Toggle checked={c.auto_ai_review} onChange={(v) => upd({ auto_ai_review: v })}
              label="Enable Auto AI Review"
              description="Automatically run a final AI Review pass after chunks are completed." />

            <div className="pt-2 border-t border-subtle">
              <label className="block text-xs font-medium text-muted mb-1.5">SFX & Non-Verbal Cues Filter</label>
              <StyledSelect value={c.sfx_filter_mode} onChange={(v) => upd({ sfx_filter_mode: v as typeof c.sfx_filter_mode })}>
                <option value="keep">Keep as generated (Default)</option>
                <option value="bracket">Standardize to brackets: [pant]</option>
                <option value="italicize">Italicize: *(pant)*</option>
                <option value="remove">Remove entirely (Filter out)</option>
              </StyledSelect>
              <p className="text-xs mt-1.5 text-muted">
                Applies strict regex post-processing to standardize or remove non-verbal audio cues generated by the AI.
              </p>
            </div>
          </div>
        </SectionCard>

        {/* API Key (automatic only) */}
        {c.translation_mode === 'automatic' && (
          <SectionCard title="Gemini API Key" icon={Key}>
            <div className="flex gap-3">
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your Gemini API key (AIzaSy...)"
                className="flex-1 bg-app border border-subtle rounded-lg px-4 py-2.5 text-sm text-main focus:outline-none" />
              <button onClick={handleValidate} disabled={validating || !apiKey.trim()}
                className="bg-surface-hover hover:bg-subtle disabled:opacity-50 text-main text-sm font-medium px-4 py-2.5 rounded-lg border border-subtle transition-colors cursor-pointer">
                {validating ? 'Testing…' : 'Test'}
              </button>
            </div>
            {valStatus && (
              <div className={`flex items-center gap-2.5 p-3 rounded-lg text-xs font-medium ${valStatus.success ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-red-500/10 text-red-300 border border-red-500/20'}`}>
                {valStatus.success ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />}
                <span>{valStatus.msg}</span>
              </div>
            )}
            <p className="text-xs text-muted flex items-start gap-1">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              Stored in memory for this session. Save a default key in Settings to avoid re-entering.
            </p>
          </SectionCard>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button onClick={handleSaveAndContinue}
            className="flex items-center gap-2 btn-accent font-medium text-sm px-6 py-3 rounded-xl shadow-lg transition-all cursor-pointer">
            Save & Proceed to Generation <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
