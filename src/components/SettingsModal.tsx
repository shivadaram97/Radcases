import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Settings, Eye, EyeOff, Save, Key, Github, HelpCircle, 
  Download, Upload, CheckCircle, AlertTriangle, CloudRain, RefreshCw, Sun, Moon 
} from 'lucide-react';
import { syncToGitHub, fetchFromGitHub, GitHubConfig } from '../utils/github';
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
}: SettingsModalProps) {
  // Sync core Github states in localStorage
  const [token, setToken] = useState(() => localStorage.getItem('radiopaedia_gh_token') || '');
  const [owner, setOwner] = useState(() => localStorage.getItem('radiopaedia_gh_owner') || '');
  const [repo, setRepo] = useState(() => localStorage.getItem('radiopaedia_gh_repo') || '');
  const [showToken, setShowToken] = useState(false);

  // Sync results state
  const [syncing, setSyncing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ text: string; type: 'success' | 'err' | 'info' | null }>({ text: '', type: null });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Persist configuration fields to client disk on changing
    localStorage.setItem('radiopaedia_gh_token', token);
    localStorage.setItem('radiopaedia_gh_owner', owner);
    localStorage.setItem('radiopaedia_gh_repo', repo);
  }, [token, owner, repo]);

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

  // Perform GitHub Commit-push sync
  const handleGithubPush = async () => {
    if (!token.trim() || !owner.trim() || !repo.trim()) {
      setSyncMessage({ text: 'Please complete all GitHub repository credentials fields.', type: 'err' });
      return;
    }

    setSyncing(true);
    setSyncMessage({ text: 'Establishing secure tunnel & evaluating remote SHA...', type: 'info' });

    try {
      const config: GitHubConfig = {
        token: token.trim(),
        owner: owner.trim(),
        repo: repo.trim(),
        filePath: 'data.json'
      };

      const result = await syncToGitHub(config, JSON.stringify(currentState, null, 2));
      setSyncMessage({ 
        text: `Successfully synced & committed to server (SHA: ${result.sha.substring(0, 7)})`, 
        type: 'success' 
      });
    } catch (error: any) {
      setSyncMessage({ text: error.message || 'Synchronization failed. Check credentials.', type: 'err' });
    } finally {
      setSyncing(false);
    }
  };

  // Fetch from GitHub
  const handleGithubPull = async () => {
    if (!token.trim() || !owner.trim() || !repo.trim()) {
      setSyncMessage({ text: 'Please fill out all repository configurations to fetch contents.', type: 'err' });
      return;
    }

    if (!window.confirm('Pulling will replace all local structures and cases on this phone/computer with the GitHub version. Continue?')) {
      return;
    }

    setPulling(true);
    setSyncMessage({ text: 'Downloading data.json from GitHub...', type: 'info' });

    try {
      const config: GitHubConfig = {
        token: token.trim(),
        owner: owner.trim(),
        repo: repo.trim(),
        filePath: 'data.json'
      };

      const fetchedStr = await fetchFromGitHub(config);
      const importedJson = JSON.parse(fetchedStr);

      if (validateStateStructure(importedJson)) {
        await onImportState(importedJson);
        setSyncMessage({ text: 'Successfully pulled latest database from server!', type: 'success' });
      } else {
        setSyncMessage({ text: 'Downloaded file layout is invalid. Valid categories expected.', type: 'err' });
      }
    } catch (error: any) {
      setSyncMessage({ text: error.message || 'Pull request failed.', type: 'err' });
    } finally {
      setPulling(false);
    }
  };

  // Standard static JSON export
  const handleLocalExport = () => {
    try {
      const dataStr = JSON.stringify(currentState, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `radiopaedia-cases-${new Date().toISOString().split('T')[0]}.json`;
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
          alert('Error: Imported file does not follow the correct Radiopaedia data structure template.');
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
              <div className="flex items-center justify-between border-t border-slate-200/50 pt-3 dark:border-slate-750">
                <div>
                  <label htmlFor="editor-checkbox" className="text-sm font-semibold block text-slate-800 dark:text-slate-200">
                    👨‍⚕️ Curator / Editor Mode
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Enable writing, deletions, and adding elements
                  </span>
                </div>
                <input
                  id="editor-checkbox"
                  type="checkbox"
                  checked={editorMode}
                  onChange={(e) => setEditorMode(e.target.checked)}
                  className="h-5 w-5 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:focus:ring-blue-950"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Github Cloud Sync */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Github className="h-4.5 w-4.5 text-blue-500" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Cloud Sync (GitHub Sync)
              </h4>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">
              Allows cross-device metadata synchronizations. Overwrites require a personal access token with repository read/write access scope.
            </p>

            <div className="space-y-3.5">
              {/* Token field */}
              <div>
                <label htmlFor="github-token" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  GitHub Personal Access Token (Classic / Fine-grained)
                </label>
                <div className="relative">
                  <input
                    id="github-token"
                    type={showToken ? 'text' : 'password'}
                    placeholder="ghp_xxxxxxxxxxxx"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 pr-10 pl-4 py-2 text-xs text-slate-900 outline-none dark:border-slate-750 dark:bg-slate-850 dark:text-white focus:border-blue-500"
                  />
                  <button
                    id="token-visibility-toggle"
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Owner & Repo Side-by-Side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="github-owner" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Repository Owner
                  </label>
                  <input
                    id="github-owner"
                    type="text"
                    placeholder="e.g., medicalcurator"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none dark:border-slate-750 dark:bg-slate-850 dark:text-white focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="github-repo" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Repository Name
                  </label>
                  <input
                    id="github-repo"
                    type="text"
                    placeholder="e.g., radiopaedia-cases"
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none dark:border-slate-750 dark:bg-slate-850 dark:text-white focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Sync Message Display */}
              {syncMessage.text && (
                <div className={`mt-2 rounded-lg p-2.5 text-xs flex items-start gap-2 border ${
                  syncMessage.type === 'success' 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/25 dark:text-emerald-400 dark:border-emerald-950/40' 
                    : syncMessage.type === 'err'
                    ? 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/25 dark:text-rose-400 dark:border-rose-950/40'
                    : 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/25 dark:text-blue-400 dark:border-blue-950/40'
                }`}>
                  {syncMessage.type === 'success' && <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                  {syncMessage.type === 'err' && <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
                  {syncMessage.type === 'info' && <RefreshCw className="h-4 w-4 shrink-0 mt-0.5 animate-spin" />}
                  <span>{syncMessage.text}</span>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <button
                  id="gh-sync-push-btn"
                  onClick={handleGithubPush}
                  disabled={syncing || pulling}
                  className="flex-1 rounded-lg bg-blue-600 py-2.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/10"
                >
                  <Upload className={`h-3.5 w-3.5 ${syncing ? 'animate-bounce' : ''}`} />
                  {syncing ? 'Uploading...' : 'Sync to GitHub'}
                </button>
                <button
                  id="gh-sync-pull-btn"
                  onClick={handleGithubPull}
                  disabled={syncing || pulling}
                  className="flex-1 rounded-lg border border-slate-300 hover:border-slate-400 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 py-2.5 text-xs font-medium disabled:opacity-50 transition flex items-center justify-center gap-1.5"
                >
                  <Download className={`h-3.5 w-3.5 ${pulling ? 'animate-bounce' : ''}`} />
                  {pulling ? 'Downloading...' : 'Pull from GitHub'}
                </button>
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
