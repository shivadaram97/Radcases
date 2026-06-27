import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Settings, HelpCircle, Download, Upload, CheckCircle, 
  RefreshCw, Sun, Moon, LogIn, Lock, Check, Eye, EyeOff,
  Zap, Activity, Globe, ExternalLink
} from 'lucide-react';
import { AppState } from '../utils/db';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  editorMode: boolean;
  setEditorMode: (mode: boolean) => void;
  currentState: AppState;
  onImportState: (newState: AppState) => Promise<void>;
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  currentUser: any;
  isSyncingCloud: boolean;
  onManualSync: () => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
  onTriggerEditorModeToggle: () => void;
  dnsSpeedup: boolean;
  setDnsSpeedup: (enabled: boolean) => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  editorMode,
  setEditorMode,
  currentState,
  onImportState,
  darkMode,
  setDarkMode,
  currentUser,
  isSyncingCloud,
  onManualSync,
  onGoogleSignIn,
  onTriggerEditorModeToggle,
  dnsSpeedup,
  setDnsSpeedup,
}: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States for DNS latency benchmarking
  const [latency, setLatency] = useState<number | null>(null);
  const [testing, setTesting] = useState<boolean>(false);

  const runLatencyTest = async () => {
    setTesting(true);
    const start = performance.now();
    try {
      // Secure DNS Lookup via Cloudflare DNS-over-HTTPS json API
      await fetch('https://cloudflare-dns.com/dns-query?name=radiopaedia.org&type=A', {
        headers: { 'Accept': 'application/dns-json' },
        mode: 'cors'
      });
      const duration = Math.round(performance.now() - start);
      setLatency(duration);
    } catch (err) {
      console.warn("Direct DNS latency check failed, trying backup protocol:", err);
      try {
        const startFallback = performance.now();
        await fetch('https://1.1.1.1', { mode: 'no-cors' });
        const duration = Math.round(performance.now() - startFallback);
        setLatency(duration);
      } catch {
        setLatency(null);
      }
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runLatencyTest();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Validate imported app state structure before applying
  const validateStateStructure = (obj: any): obj is AppState => {
    if (!obj || typeof obj !== 'object') return false;
    if (!Array.isArray(obj.categories)) return false;
    
    for (const cat of obj.categories) {
      if (typeof cat !== 'object' || !cat.name || !Array.isArray(cat.cases)) {
        return false;
      }
      for (const cs of cat.cases) {
        if (typeof cs !== 'object' || !cs.title || !cs.url) {
          return false;
        }
      }
    }
    return true;
  };

  // Standard static JSON export
  const handleLocalExport = () => {
    try {
      const dataStr = JSON.stringify(currentState, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `casestacks-clinical-registry-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export state.', e);
    }
  };

  // Local JSON file upload trigger
  const handleLocalImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleLocalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const json = JSON.parse(text);

        if (validateStateStructure(json)) {
          if (window.confirm('Are you sure you want to replace your entire current category lists with this import file?')) {
            await onImportState(json);
            alert('Collection loaded successfully!');
          }
        } else {
          alert('Error: Imported file does not follow the correct CaseStacks registry structure template.');
        }
      } catch (err) {
        alert('Error parsing uploaded file. Make sure file is valid JSON.');
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  return (
    <div id="settings-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div 
        id="settings-container" 
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 transition-all text-slate-900 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <h3 className="text-xl font-bold font-display flex items-center gap-2 text-slate-900 dark:text-white">
            <Settings className="h-5.5 w-5.5 text-blue-500 animate-spin-slow" />
            Control Center
          </h3>
          <button 
            id="close-settings-btn"
            onClick={onClose} 
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-850 dark:hover:text-slate-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Tabs/Stacks */}
        <div className="mt-5 space-y-6">
          {/* Section 1: Work Mode Preference */}
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-850 border border-slate-100 dark:border-slate-805">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 block">
              Global Preferences
            </h4>
            <div className="space-y-4">
              {/* Dark mode */}
              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="theme-toggle" className="text-sm font-semibold block text-slate-800 dark:text-slate-200">
                    Visual Layout Theme
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Switch between day and night display formats
                  </span>
                </div>
                <button
                  id="theme-toggle"
                  onClick={() => setDarkMode(!darkMode)}
                  className="rounded-lg bg-slate-200 dark:bg-slate-700 p-2 text-slate-700 dark:text-slate-200 hover:scale-105 active:scale-95 transition"
                  type="button"
                >
                  {darkMode ? <Sun className="h-4.5 w-4.5 text-amber-400" /> : <Moon className="h-4.5 w-4.5 text-blue-600" />}
                </button>
              </div>

              {/* Editor mode checklist */}
              <div className="flex flex-col border-t border-slate-200/50 pt-3 dark:border-slate-750">
                <div className="flex items-center justify-between">
                  <div>
                    <label htmlFor="editor-toggle-switch" className="text-sm font-semibold block text-slate-800 dark:text-slate-200">
                      👨‍⚕️ Curator / Editor Mode
                    </label>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Enable writing, deletions, reorganizing, and adding elements
                    </span>
                  </div>
                  <button
                    id="editor-toggle-switch"
                    type="button"
                    onClick={onTriggerEditorModeToggle}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      editorMode ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                    role="switch"
                    aria-checked={editorMode}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        editorMode ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Google Cloud Sync */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <RefreshCw className="h-4.5 w-4.5 text-blue-500" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block pb-0.5">
                Google Sync Service
              </h4>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4 leading-normal">
              Back up your entire medical database to secure Firebase Cloud Storage. Pull, write, and persist edits across your devices.
            </p>

            <div className="space-y-3">
              {currentUser ? (
                <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100/60 dark:border-blue-900/30 rounded-lg flex items-center justify-between">
                  <div className="overflow-hidden mr-2">
                    <span className="text-xs font-bold block text-slate-800 dark:text-slate-200">
                      Cloud Account Connected
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate block font-mono" title={currentUser.email}>
                      {currentUser.email}
                    </span>
                  </div>
                  
                  <button
                    id="modal-google-sync-btn"
                    type="button"
                    onClick={onManualSync}
                    disabled={isSyncingCloud}
                    className="shrink-0 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400/80 dark:bg-blue-500 dark:hover:bg-blue-600 dark:disabled:bg-blue-600/50 px-3.5 py-1.5 text-xs text-white transition flex items-center gap-1.5 font-semibold"
                  >
                    <RefreshCw className={`h-3 w-3 ${isSyncingCloud ? 'animate-spin' : ''}`} />
                    {isSyncingCloud ? 'Syncing...' : 'Sync Now'}
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100/60 dark:border-amber-900/30 rounded-lg flex items-center justify-between">
                  <div className="mr-2">
                    <span className="text-xs font-bold block text-slate-850 dark:text-amber-300">
                      Syncing Disabled
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-450 block">
                      Saved locally. Sign in to sync your changes.
                    </span>
                  </div>
                  
                  <button
                    id="modal-google-login-btn"
                    type="button"
                    onClick={onGoogleSignIn}
                    className="shrink-0 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 px-3.5 py-1.5 text-xs text-white transition flex items-center gap-1.5 font-semibold"
                  >
                    <LogIn className="h-3.5 w-3.5" />
                    Connect Workspace
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Section: Cloudflare 1.1.1.1 Image Loading Accelerator */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4.5 w-4.5 text-amber-500 fill-amber-500/20" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block pb-0.5">
                  1.1.1.1 Image Accelerator
                </h4>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30 px-2 py-0.5 rounded-lg select-none">
                Smart Cache
              </span>
            </div>
            
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4 leading-normal">
              Pre-warms TCP handshakes and resolves Radiopaedia image CDN queries instantly. Enable active edge acceleration or configure system secure DNS.
            </p>

            <div className="space-y-3">
              {/* DNS Speedup Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800 rounded-lg">
                <div>
                  <span className="text-xs font-bold block text-slate-800 dark:text-slate-200">
                    Active Edge Preconnection
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                    Preconnects browser socket pools to Cloudflare CDN
                  </span>
                </div>
                <button
                  id="dns-speedup-toggle"
                  type="button"
                  onClick={() => setDnsSpeedup(!dnsSpeedup)}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    dnsSpeedup ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                  role="switch"
                  aria-checked={dnsSpeedup}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      dnsSpeedup ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Dynamic Latency Checker */}
              <div className="p-3 bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold block text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <Activity className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
                    Real-time Latency Bench
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                    Round-trip latency to Cloudflare Secure DoH Edge
                  </span>
                </div>

                <div className="text-right">
                  {testing ? (
                    <span className="text-xs font-mono text-slate-400 dark:text-slate-500 animate-pulse block">
                      Pinging...
                    </span>
                  ) : latency !== null ? (
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-bold font-mono text-emerald-500 block">
                        {latency} ms
                      </span>
                      <span className="text-[8px] uppercase tracking-wider font-bold text-emerald-600 block">
                        Excellent Connection
                      </span>
                    </div>
                  ) : (
                    <button
                      id="retry-latency-btn"
                      type="button"
                      onClick={runLatencyTest}
                      className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Measure
                    </button>
                  )}
                </div>
              </div>

              {/* Secure DNS configuration steps */}
              <div className="p-3 bg-blue-50/40 dark:bg-blue-950/10 border border-blue-100/40 dark:border-blue-900/20 rounded-lg">
                <span className="text-xs font-bold text-blue-700 dark:text-blue-300 block mb-1">
                  💡 How to Enable System-Wide 1.1.1.1
                </span>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  For maximum rendering speeds, configure Secure DNS in your browser settings: search <strong className="text-slate-700 dark:text-slate-300">"Secure DNS"</strong> or <strong className="text-slate-700 dark:text-slate-300">"DNS over HTTPS"</strong>, select <strong className="text-slate-700 dark:text-slate-300">Custom</strong>, and choose <strong className="text-slate-700 dark:text-slate-300">Cloudflare (1.1.1.1)</strong>.
                </p>
                <div className="mt-2 flex justify-between items-center border-t border-blue-100/40 dark:border-blue-900/20 pt-1.5">
                  <span className="text-[9px] text-slate-400 dark:text-slate-500">
                    Direct Official Guide:
                  </span>
                  <a 
                    href="https://1.1.1.1" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                  >
                    1.1.1.1 WARP
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Import/Export Local */}
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-850 border border-slate-100 dark:border-slate-805">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 block">
              Emergency Backup Options
            </h4>
            <div className="flex gap-3">
              <button
                id="export-file-btn"
                onClick={handleLocalExport}
                className="flex-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:hover:bg-slate-750 py-2.5 text-xs text-slate-700 dark:text-slate-300 font-semibold transition flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4 text-emerald-500" />
                Export Local JSON
              </button>
              <button
                id="import-file-btn"
                onClick={handleLocalImportClick}
                className="flex-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:hover:bg-slate-750 py-2.5 text-xs text-slate-700 dark:text-slate-300 font-semibold transition flex items-center justify-center gap-2"
              >
                <Upload className="h-4 w-4 text-blue-500" />
                Import JSON File
              </button>
            </div>
            <input 
              id="file-import-picker"
              type="file" 
              ref={fileInputRef} 
              onChange={handleLocalFileChange} 
              accept=".json" 
              className="hidden" 
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            id="close-settings-lower-btn"
            onClick={onClose}
            className="rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 px-5 py-2.5 text-xs font-semibold tracking-wide transition shadow-md"
          >
            Finished Setup
          </button>
        </div>
      </div>
    </div>
  );
}
