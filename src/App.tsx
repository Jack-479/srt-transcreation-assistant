import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderOpen, FileText, Sliders, Sparkles, CheckSquare,
  Download, Settings as SettingsIcon, ChevronLeft, ChevronRight,
  Layers, Clock, Trash2, Plus, BookMarked,
  Minus, Square, Copy, X
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
const appWindow = getCurrentWindow();

import {
  Step, SubtitleEntry, ProjectConfig, DEFAULT_PROJECT_CONFIG,
  DEFAULT_APP_SETTINGS, AppSettings, TranslationMode
} from './types';
import { ConfigureScreen } from './screens/ConfigureScreen';
import { GenerateScreen } from './screens/GenerateScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { ExportScreen } from './screens/ExportScreen';
import { SettingsScreen, applyTheme } from './screens/SettingsScreen';
import { DictionaryScreen } from './screens/DictionaryScreen';
import { open } from '@tauri-apps/plugin-dialog';
import { loadSrtFile } from './services/tauri';
import './App.css';

// ─── Recent Projects ────────────────────────────────────────────────────────
interface RecentProject {
  path: string; name: string; sourceLang: string; targetLang: string; cueCount: number; openedAt: string;
}
const RECENT_KEY = 'srt_recent_projects';
const MAX_RECENTS = 10;

function loadRecentProjects(): RecentProject[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; }
}
function saveRecentProject(rp: RecentProject) {
  const list = loadRecentProjects().filter((r) => r.path !== rp.path);
  list.unshift(rp);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENTS)));
}
function removeRecentProject(path: string) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(loadRecentProjects().filter((r) => r.path !== path)));
}

function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem('srt_app_settings');
    return raw ? { ...DEFAULT_APP_SETTINGS, ...JSON.parse(raw) } : DEFAULT_APP_SETTINGS;
  } catch { return DEFAULT_APP_SETTINGS; }
}

// ─── Sidebar Steps ──────────────────────────────────────────────────────────
const STEPS: { id: Step; label: string; icon: React.ElementType; separator?: boolean }[] = [
  { id: 'projects',   label: 'Projects',     icon: FolderOpen },
  { id: 'configure',  label: 'Configure',    icon: Sliders },
  { id: 'generate',   label: 'Generate',     icon: Sparkles },
  { id: 'review',     label: 'Review & Edit',icon: CheckSquare },
  { id: 'export',     label: 'Export',       icon: Download },
  { id: 'dictionary', label: 'Dictionary',   icon: BookMarked, separator: true },
  { id: 'settings',   label: 'Settings',     icon: SettingsIcon },
];

const WORKFLOW_STEPS: Step[] = ['projects', 'configure', 'generate', 'review', 'export'];

// ─── Projects Screen ────────────────────────────────────────────────────────
function ProjectsScreen({
  onProjectCreated,
  onLoadRecent,
}: {
  onProjectCreated: (name: string, path: string, mode: TranslationMode, entries: SubtitleEntry[], encoding: string) => void;
  onLoadRecent: (rp: RecentProject) => void;
}) {
  const [recents, setRecents] = useState<RecentProject[]>(loadRecentProjects);
  const [showNew, setShowNew] = useState(false);
  const [projName, setProjName] = useState('');
  const [filePath, setFilePath] = useState('');
  const [mode, setMode] = useState<TranslationMode>('automatic');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBrowse = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Subtitle Files', extensions: ['srt'] }],
      });
      if (selected && typeof selected === 'string') {
        setFilePath(selected);
        if (!projName) {
          const defaultName = selected.split(/[\/\\]/).pop() || 'Untitled Project';
          setProjName(defaultName);
        }
      }
    } catch (err: unknown) {
      setError(String(err));
    }
  };

  const handleCreate = async () => {
    if (!filePath) {
      setError('Please select an SRT file first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [entries, encoding] = await loadSrtFile(filePath);
      const finalName = projName.trim() || filePath.split(/[\/\\]/).pop() || 'Untitled Project';
      onProjectCreated(finalName, filePath, mode, entries, encoding);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (path: string) => { removeRecentProject(path); setRecents(loadRecentProjects()); };

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-8">
      <div className="text-center space-y-3">
        <div className="inline-flex h-16 w-16 rounded-2xl items-center justify-center accent-bg-faint border accent-border mb-2">
          <Layers className="h-8 w-8 accent-icon" />
        </div>
        <h2 className="text-2xl font-bold text-main tracking-tight">SRT Transcreation Assistant</h2>
        <p className="text-muted text-sm max-w-md mx-auto leading-relaxed">
          AI-powered subtitle transcreation powered by Tauri v2 &amp; Rust.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!showNew ? (
          <motion.div key="new-btn" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-surface border border-subtle rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-main font-semibold text-base border-b border-subtle pb-3">
              <Plus className="h-5 w-5 accent-icon" /> New Project
            </div>
            <p className="text-muted text-sm">Create a new transcreation project from an existing <code className="accent-text bg-surface-hover px-1 rounded">.srt</code> file.</p>
            <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 rounded-xl btn-accent px-5 py-2.5 text-sm font-medium shadow-lg cursor-pointer">
              <FileText className="h-4 w-4" /> Start New Project &rarr;
            </button>
          </motion.div>
        ) : (
          <motion.div key="new-form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-surface border border-subtle rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-subtle pb-3">
              <div className="flex items-center gap-2 text-main font-semibold text-base">
                <Plus className="h-5 w-5 accent-icon" /> Configure New Project
              </div>
              <button onClick={() => setShowNew(false)} className="text-xs text-muted hover:text-main cursor-pointer">Cancel</button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Project Name</label>
                <input type="text" value={projName} onChange={(e) => setProjName(e.target.value)} placeholder="e.g. Episode 01 Transcreation"
                  className="w-full bg-app border border-subtle rounded-lg px-4 py-2.5 text-sm text-main focus:outline-none focus:border-accent-border" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Source SRT File</label>
                <div className="flex gap-2">
                  <input type="text" value={filePath} readOnly placeholder="Browse to select..."
                    className="flex-1 bg-app border border-subtle rounded-lg px-4 py-2.5 text-sm text-muted outline-none cursor-not-allowed" />
                  <button onClick={handleBrowse} className="bg-surface-hover border border-subtle text-main px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-subtle transition-colors cursor-pointer">
                    Browse
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Translation Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setMode('automatic')}
                    className={`p-3 border rounded-xl text-sm font-medium transition-all cursor-pointer ${mode === 'automatic' ? 'sidebar-active' : 'border-subtle bg-app text-muted hover:border-accent-border'}`}>
                    Automatic (API)
                  </button>
                  <button onClick={() => setMode('manual')}
                    className={`p-3 border rounded-xl text-sm font-medium transition-all cursor-pointer ${mode === 'manual' ? 'sidebar-active' : 'border-subtle bg-app text-muted hover:border-accent-border'}`}>
                    Manual (Copy-Paste)
                  </button>
                </div>
              </div>
            </div>

            {error && <div className="p-3 bg-red-900/20 border border-red-500/30 text-red-400 text-sm rounded-lg">{error}</div>}

            <div className="pt-2">
              <button onClick={handleCreate} disabled={loading || !filePath}
                className="w-full flex items-center justify-center gap-2 btn-accent px-5 py-3 rounded-xl text-sm font-semibold shadow-lg cursor-pointer disabled:opacity-50">
                {loading ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-main font-semibold text-sm">
          <Clock className="h-4 w-4 accent-icon" /> Recent Projects
        </div>
        {recents.length === 0 ? (
          <div className="bg-surface border border-dashed border-subtle rounded-xl p-8 text-center text-muted text-sm">
            No recent projects yet. Create a new project to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {recents.map((rp) => (
              <div key={rp.path} className="flex items-center gap-4 bg-surface border border-subtle rounded-xl px-4 py-3 hover:border-accent-border hover:bg-surface-hover transition-all group">
                <div className="h-9 w-9 rounded-lg accent-bg-faint border accent-border flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 accent-icon" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-main truncate">{rp.name}</p>
                  <p className="text-xs text-muted truncate mt-0.5">{rp.sourceLang} &rarr; {rp.targetLang} &middot; {rp.cueCount} cues</p>
                  <p className="text-xs text-muted/70 truncate">{rp.path}</p>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onLoadRecent(rp)} className="text-xs bg-surface-hover hover:bg-subtle border accent-border accent-text px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
                    Open
                  </button>
                  <button onClick={() => handleRemove(rp.path)} className="h-7 w-7 flex items-center justify-center rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── App ────────────────────────────────────────────────────────────────────
export function App() {
  const [currentStep, setCurrentStep] = useState<Step>('projects');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const [sourcePath, setSourcePath] = useState('');
  const [entries, setEntries] = useState<SubtitleEntry[]>([]);
  const [encoding, setEncoding] = useState('utf-8');
  const [apiKey, setApiKey] = useState('');
  const [config, setConfig] = useState<ProjectConfig>(() => {
    const appSettings = loadAppSettings();
    return {
      ...DEFAULT_PROJECT_CONFIG,
      primary_model: appSettings.default_primary_model,
      qc_model: appSettings.default_qc_model,
      fallback_model: appSettings.default_fallback_model,
      active_profile: appSettings.default_profile,
      translation_mode: appSettings.default_translation_mode,
      bom_on_export: appSettings.bom_on_export,
    };
  });
  const [qcIssues, setQcIssues] = useState<import('./types').QCIssue[]>([]);

  const [isMaximized, setIsMaximized] = useState(false);

  // Apply initial settings mount
  useEffect(() => {
    const appSettings = loadAppSettings();
    applyTheme(appSettings.theme_name, appSettings.color_mode);
    if (appSettings.default_api_key) setApiKey(appSettings.default_api_key);

    const updateMaximized = async () => {
      try {
        const max = await appWindow.isMaximized();
        setIsMaximized(max);
      } catch (e) {}
    };
    updateMaximized();
    
    let unlistenFn: (() => void) | null = null;
    appWindow.onResized(() => {
      updateMaximized();
    }).then(unlisten => {
      unlistenFn = unlisten;
    }).catch(() => {});

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  const handleProjectCreated = (name: string, path: string, mode: TranslationMode, loadedEntries: SubtitleEntry[], loadedEncoding: string) => {
    setSourcePath(path);
    setEntries(loadedEntries);
    setEncoding(loadedEncoding);
    setConfig((prev) => ({ ...prev, translation_mode: mode }));
    saveRecentProject({ path, name, sourceLang: config.source_lang, targetLang: config.target_lang, cueCount: loadedEntries.length, openedAt: new Date().toISOString() });
    setCurrentStep('configure');
  };

  const handleLoadRecent = async (rp: RecentProject) => {
    try {
      const [loadedEntries, loadedEncoding] = await loadSrtFile(rp.path);
      setSourcePath(rp.path);
      setEntries(loadedEntries);
      setEncoding(loadedEncoding);
      saveRecentProject({ ...rp, openedAt: new Date().toISOString() });
      setCurrentStep('configure');
    } catch (e) {
      alert('Failed to open project: ' + e);
    }
  };

  const handleUpdateConfig = (newConfig: ProjectConfig, newApiKey: string) => {
    setConfig(newConfig);
    setApiKey(newApiKey);
  };

  const workflowIndex = WORKFLOW_STEPS.indexOf(currentStep);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-app text-main" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Sidebar */}
      <motion.aside
        animate={{ width: isSidebarCollapsed ? 60 : 232 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="relative flex flex-col border-r border-subtle bg-surface backdrop-blur-md select-none z-20 shrink-0 overflow-hidden"
      >
        {/* Logo header */}
        <div className={`flex items-center border-b border-subtle h-14 px-3 ${isSidebarCollapsed ? 'justify-center' : 'justify-start gap-2'}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg btn-accent shadow-lg">
            <Layers className="h-4 w-4" />
          </div>
          <AnimatePresence initial={false}>
            {!isSidebarCollapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="whitespace-nowrap font-bold text-sm tracking-wide text-main truncate flex-1 min-w-0">
                SRT Transcreation
              </motion.span>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {!isSidebarCollapsed && (
              <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setIsSidebarCollapsed(true)}
                className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-subtle bg-surface-hover text-muted hover:text-main transition-colors cursor-pointer">
                <ChevronLeft className="h-3.5 w-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const stepIdx = WORKFLOW_STEPS.indexOf(step.id);
            const isCompleted = stepIdx !== -1 && workflowIndex > stepIdx;

            return (
              <React.Fragment key={step.id}>
                {step.separator && !isSidebarCollapsed && (
                  <div className="pt-2 pb-1"><div className="border-t border-subtle" /></div>
                )}
                <button
                  onClick={() => setCurrentStep(step.id)}
                  title={isSidebarCollapsed ? step.label : undefined}
                  className={`relative flex w-full items-center rounded-lg transition-all cursor-pointer ${
                    isSidebarCollapsed ? 'justify-center h-10 w-10 mx-auto' : 'gap-3 px-3 py-2.5'
                  } ${
                    isActive ? 'sidebar-active' : 'text-muted hover:bg-surface-hover hover:text-main border border-transparent'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'accent-icon' : isCompleted ? 'text-emerald-500' : ''}`} />
                  <AnimatePresence initial={false}>
                    {!isSidebarCollapsed && (
                      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="text-sm font-medium whitespace-nowrap overflow-hidden">
                        {step.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {isActive && (
                    <motion.div layoutId="activeIndicator"
                      className={`absolute rounded-full sidebar-active-dot ${
                        isSidebarCollapsed ? 'right-0.5 top-0.5 h-1.5 w-1.5' : 'right-2 h-1.5 w-1.5'
                      }`}
                      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    />
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Collapse toggle at bottom when collapsed */}
        {isSidebarCollapsed && (
          <div className="p-2 border-t border-subtle">
            <button onClick={() => setIsSidebarCollapsed(false)}
              className="flex h-10 w-10 mx-auto items-center justify-center rounded-lg border border-subtle bg-surface-hover text-muted hover:text-main transition-colors cursor-pointer">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Footer version pill */}
        <AnimatePresence initial={false}>
          {!isSidebarCollapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="p-3 border-t border-subtle text-xs text-muted flex items-center justify-between">
              <span>Version</span>
              <span className="px-1.5 py-0.5 rounded bg-surface-hover accent-text font-mono text-[10px]">v1.0</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>

      {/* Main workspace */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header data-tauri-drag-region className="flex h-14 items-center justify-between border-b border-subtle bg-surface px-6 backdrop-blur-sm select-none shrink-0">
          {/* Breadcrumb for workflow steps */}
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            {workflowIndex !== -1 ? (
              WORKFLOW_STEPS.slice(0, workflowIndex + 1).map((s, i) => (
                <React.Fragment key={s}>
                  {i > 0 && <span className="text-muted text-xs shrink-0">/</span>}
                  <button
                    onClick={() => setCurrentStep(s)}
                    className={`text-xs font-medium shrink-0 cursor-pointer capitalize transition-colors ${
                      s === currentStep ? 'accent-text' : 'text-muted hover:text-main'
                    }`}
                  >
                    {STEPS.find((x) => x.id === s)?.label ?? s}
                  </button>
                </React.Fragment>
              ))
            ) : (
              <span className="text-xs font-semibold accent-text capitalize">
                {STEPS.find((x) => x.id === currentStep)?.label ?? currentStep}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted shrink-0">
            {sourcePath && (
              <span className="hidden sm:block bg-app px-2 py-0.5 rounded border border-subtle text-main max-w-[200px] truncate">
                {sourcePath.split(/[\/\\]/).pop()}
              </span>
            )}
            {entries.length > 0 && (
              <span className="bg-app px-2 py-0.5 rounded border border-subtle text-main">
                {entries.length} cues &middot; {encoding}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </span>

            {/* Custom Window Controls */}
            <div className="flex items-center gap-1.5 border-l border-subtle pl-3.5 ml-1.5 h-6">
              <button 
                onClick={() => appWindow.minimize()} 
                className="p-1 rounded hover:bg-surface-hover text-muted hover:text-main cursor-pointer transition-colors"
                title="Minimize"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button 
                onClick={async () => {
                  await appWindow.toggleMaximize();
                  setIsMaximized(await appWindow.isMaximized());
                }} 
                className="p-1 rounded hover:bg-surface-hover text-muted hover:text-main cursor-pointer transition-colors"
                title="Maximize"
              >
                {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              </button>
              <button 
                onClick={() => appWindow.close()} 
                className="p-1 rounded hover:bg-red-500/20 text-muted hover:text-red-400 cursor-pointer transition-colors"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </header>

        {/* Screen content */}
        <main className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div key={currentStep} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }} className="h-full">
              {currentStep === 'projects' && (
                <ProjectsScreen onProjectCreated={handleProjectCreated} onLoadRecent={handleLoadRecent} />
              )}
              {currentStep === 'configure' && (
                <ConfigureScreen config={config} apiKey={apiKey} onUpdateConfig={handleUpdateConfig} onSaveModelDefaults={() => {
                  const currentSettings = loadAppSettings();
                  const newSettings = { ...currentSettings, default_primary_model: config.primary_model, default_qc_model: config.qc_model, default_fallback_model: config.fallback_model };
                  localStorage.setItem('srt_app_settings', JSON.stringify(newSettings));
                }} onNext={() => setCurrentStep('generate')} />
              )}
              {currentStep === 'generate' && (
                <GenerateScreen entries={entries} config={config} apiKey={apiKey}
                  onUpdateConfig={(patch) => setConfig(prev => ({ ...prev, ...patch }))}
                  onComplete={(updated) => { setEntries(updated); setCurrentStep('review'); }}
                  qcIssues={qcIssues} setQcIssues={setQcIssues} />
              )}
              {currentStep === 'review' && (
                <ReviewScreen entries={entries} config={config} onUpdateConfig={(patch) => setConfig(prev => ({ ...prev, ...patch }))} onUpdateEntries={setEntries} onNext={() => setCurrentStep('export')} apiKey={apiKey} qcIssues={qcIssues} setQcIssues={setQcIssues} />
              )}
              {currentStep === 'export' && (
                <ExportScreen entries={entries} config={config} sourcePath={sourcePath} />
              )}
              {currentStep === 'dictionary' && <DictionaryScreen />}
              {currentStep === 'settings' && (
                <SettingsScreen onSettingsChanged={(appSettings) => {
                  if (appSettings.default_api_key && !apiKey) setApiKey(appSettings.default_api_key);
                }} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export default App;
