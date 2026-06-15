import React, { useState, useEffect } from 'react';
import { 
  Search, Plus, Pencil, Trash2, FolderPlus, BookOpen, ExternalLink, 
  Menu, ChevronRight, Settings, Info, Download, Trash, BookMarked, HelpCircle, X 
} from 'lucide-react';
import { loadState, saveState, AppState, Category, Case, sanitizeState } from './utils/db';
import SettingsModal from './components/SettingsModal';
import EditCaseModal from './components/EditCaseModal';
import EditCategoryModal from './components/EditCategoryModal';
import EditSubcategoryModal from './components/EditSubcategoryModal';
import ConfirmModal from './components/ConfirmModal';

export default function App() {
  // Core Application Data and Indexes
  const [state, setState] = useState<AppState>({ categories: [] });
  const [activeCategoryIndex, setActiveCategoryIndex] = useState<number | null>(null);
  const [activeSubcategoryFilter, setActiveSubcategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // App UI configuration states
  const [editorMode, setEditorMode] = useState<boolean>(() => {
    return localStorage.getItem('radiopaedia_editor_mode') === 'true';
  });
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const localMode = localStorage.getItem('radiopaedia_dark_mode');
    if (localMode !== null) {
      return localMode === 'true';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Modal flow states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false);
  const [caseModalEditing, setCaseModalEditing] = useState(false);
  const [selectedCaseIndex, setSelectedCaseIndex] = useState<number | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryModalEditing, setCategoryModalEditing] = useState(false);

  const [isSubcategoryModalOpen, setIsSubcategoryModalOpen] = useState(false);
  const [subcategoryModalEditing, setSubcategoryModalEditing] = useState(false);
  const [selectedSubcategoryName, setSelectedSubcategoryName] = useState<string>('');

  // Deletion confirmations
  const [confirmDeleteCatOpen, setConfirmDeleteCatOpen] = useState(false);
  const [confirmDeleteCaseOpen, setConfirmDeleteCaseOpen] = useState(false);
  const [confirmDeleteSubOpen, setConfirmDeleteSubOpen] = useState(false);

  // System status and toast bar
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'info' | null }>({ text: '', type: null });

  // 1. First Bootstrapper + PWA Setup
  useEffect(() => {
    async function init() {
      // Clean load State from local IndexedDB
      let dbState = await loadState();
      
      // Auto-bootstrap from raw data.json if state is null or database is fully empty
      if (!dbState || !dbState.categories || dbState.categories.length === 0) {
        try {
          const response = await fetch('/data.json');
          if (response.ok) {
            const raw = await response.json();
            if (raw && Array.isArray(raw.categories)) {
              dbState = raw;
              await saveState(raw);
              triggerToast('Successfully bootstrapped default clinical cases!', 'success');
            }
          }
        } catch (e) {
          console.warn('Initial server cache data.json was missing or blocked offline:', e);
        }
      }

      if (dbState && dbState.categories) {
        setState(dbState);
        if (dbState.categories.length > 0) {
          setActiveCategoryIndex(0);
        }
      }
    }
    init();

    // Listen for PWA installation capability
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  // 2. State & Style Persistence Effects
  useEffect(() => {
    localStorage.setItem('radiopaedia_editor_mode', String(editorMode));
  }, [editorMode]);

  useEffect(() => {
    localStorage.setItem('radiopaedia_dark_mode', String(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Reset subcategory selection when active category index evolves
  useEffect(() => {
    setActiveSubcategoryFilter('all');
    setSearchQuery('');
  }, [activeCategoryIndex]);

  // Toast auto-dimmer
  const triggerToast = (text: string, type: 'success' | 'info' = 'info') => {
    setToast({ text, type });
    setTimeout(() => {
      setToast({ text: '', type: null });
    }, 4000);
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      triggerToast('PWA App downloaded successfully!', 'success');
    }
    setDeferredPrompt(null);
  };

  // 3. Category Operations
  const handleAddCategorySubmit = async (name: string) => {
    const freshCat: Category = { name, cases: [] };
    const latestState = {
      ...state,
      categories: [...state.categories, freshCat]
    };
    setState(latestState);
    await saveState(latestState);
    setIsCategoryModalOpen(false);
    setActiveCategoryIndex(latestState.categories.length - 1);
    setIsSidebarOpen(false);
    triggerToast(`Created category "${name}"`, 'success');
  };

  const handleRenameCategorySubmit = async (newName: string) => {
    if (activeCategoryIndex === null) return;
    const updatedCats = state.categories.map((cat, idx) => 
      idx === activeCategoryIndex ? { ...cat, name: newName } : cat
    );
    const latestState = { ...state, categories: updatedCats };
    setState(latestState);
    await saveState(latestState);
    setIsCategoryModalOpen(false);
    triggerToast('Renamed category successfully', 'success');
  };

  const handleDeleteCategoryConfirm = async () => {
    if (activeCategoryIndex === null) return;
    const catToDelete = state.categories[activeCategoryIndex];
    const updatedCats = state.categories.filter((_, idx) => idx !== activeCategoryIndex);
    const latestState = { ...state, categories: updatedCats };
    
    setState(latestState);
    await saveState(latestState);
    setConfirmDeleteCatOpen(false);
    setActiveCategoryIndex(updatedCats.length > 0 ? 0 : null);
    triggerToast(`Deleted category "${catToDelete.name}"`);
  };

  // 4. Case Operations
  const handleSaveCaseSubmit = async (title: string, url: string, subcategory?: string) => {
    if (activeCategoryIndex === null) return;

    const updatedCats = state.categories.map((cat, catIdx) => {
      if (catIdx === activeCategoryIndex) {
        let revisedCases = [...cat.cases];
        
        if (caseModalEditing && selectedCaseIndex !== null) {
          revisedCases = cat.cases.map((cs, cIdx) => 
            cIdx === selectedCaseIndex ? { ...cs, title, url, subcategory } : cs
          );
        } else {
          revisedCases.push({ title, url, subcategory });
        }

        // Gather all subcategories from subcategory array, plus the new subcategory if specified
        let updatedSubs = cat.subcategories ? [...cat.subcategories] : [];
        if (subcategory && !updatedSubs.includes(subcategory)) {
          updatedSubs.push(subcategory);
        }

        return {
          ...cat,
          cases: revisedCases,
          subcategories: updatedSubs,
        };
      }
      return cat;
    });

    const latestState = { ...state, categories: updatedCats };
    setState(latestState);
    await saveState(latestState);
    setIsCaseModalOpen(false);
    setSelectedCaseIndex(null);
    triggerToast(caseModalEditing ? 'Updated case details' : 'Added new clinical case', 'success');
  };

  // Subcategory management utilities
  const handleAddSubcategory = async (subName: string) => {
    if (activeCategoryIndex === null || !subName.trim()) return;
    const trimmed = subName.trim();
    const cat = state.categories[activeCategoryIndex];
    const existing = cat.subcategories || [];
    if (existing.includes(trimmed)) {
      triggerToast('Subcategory already exists', 'info');
      return;
    }
    const updatedCats = state.categories.map((c, idx) => {
      if (idx === activeCategoryIndex) {
        return {
          ...c,
          subcategories: [...existing, trimmed]
        };
      }
      return c;
    });
    const latestState = { ...state, categories: updatedCats };
    setState(latestState);
    await saveState(latestState);
    triggerToast(`Added subcategory "${trimmed}"`, 'success');
  };

  const handleRenameSubcategory = async (oldName: string, newName: string) => {
    if (activeCategoryIndex === null || !newName.trim()) return;
    const trimmed = newName.trim();
    if (oldName === trimmed) return;
    
    const updatedCats = state.categories.map((c, idx) => {
      if (idx === activeCategoryIndex) {
        let subs = c.subcategories ? c.subcategories.map(s => s === oldName ? trimmed : s) : [trimmed];
        subs = Array.from(new Set(subs));
        const cases = c.cases.map(cs => cs.subcategory === oldName ? { ...cs, subcategory: trimmed } : cs);
        return {
          ...c,
          subcategories: subs,
          cases
        };
      }
      return c;
    });
    const latestState = { ...state, categories: updatedCats };
    setState(latestState);
    await saveState(latestState);
    if (activeSubcategoryFilter === oldName) {
      setActiveSubcategoryFilter(trimmed);
    }
    triggerToast(`Renamed subcategory to "${trimmed}"`, 'success');
  };

  const handleDeleteSubcategory = async (subName: string) => {
    if (activeCategoryIndex === null) return;
    const updatedCats = state.categories.map((c, idx) => {
      if (idx === activeCategoryIndex) {
        const subs = c.subcategories ? c.subcategories.filter(s => s !== subName) : [];
        const cases = c.cases.map(cs => cs.subcategory === subName ? { ...cs, subcategory: undefined } : cs);
        return {
          ...c,
          subcategories: subs,
          cases
        };
      }
      return c;
    });
    const latestState = { ...state, categories: updatedCats };
    setState(latestState);
    await saveState(latestState);
    if (activeSubcategoryFilter === subName) {
      setActiveSubcategoryFilter('all');
    }
    triggerToast(`Removed subcategory "${subName}"`);
  };

  const handleSaveSubcategorySubmit = async (newName: string) => {
    if (subcategoryModalEditing) {
      await handleRenameSubcategory(selectedSubcategoryName, newName);
    } else {
      await handleAddSubcategory(newName);
    }
    setIsSubcategoryModalOpen(false);
  };

  const handleDeleteSubcategoryConfirm = async () => {
    if (!selectedSubcategoryName) return;
    await handleDeleteSubcategory(selectedSubcategoryName);
    setConfirmDeleteSubOpen(false);
    setSelectedSubcategoryName('');
  };

  const handleDeleteCaseConfirm = async () => {
    if (activeCategoryIndex === null || selectedCaseIndex === null) return;
    
    const updatedCats = state.categories.map((cat, catIdx) => {
      if (catIdx === activeCategoryIndex) {
        return {
          ...cat,
          cases: cat.cases.filter((_, cIdx) => cIdx !== selectedCaseIndex)
        };
      }
      return cat;
    });

    const latestState = { ...state, categories: updatedCats };
    setState(latestState);
    await saveState(latestState);
    setConfirmDeleteCaseOpen(false);
    setSelectedCaseIndex(null);
    triggerToast('Removed case file');
  };

  // 5. Remote API / Local Sync replacement hook
  const handleImportRemoteState = async (newState: AppState) => {
    const sanitized = sanitizeState(newState);
    setState(sanitized);
    await saveState(sanitized);
    if (sanitized.categories.length > 0) {
      setActiveCategoryIndex(0);
    } else {
      setActiveCategoryIndex(null);
    }
    triggerToast('Clinical catalog sync complete!', 'success');
  };

  // Filter computation
  const activeCategory = activeCategoryIndex !== null ? state.categories[activeCategoryIndex] : null;

  // Single card helper to ensure visual styling is beautifully self-contained and DRY
  const renderCaseCard = (cs: Case, realIdx: number) => {
    return (
      <div
        id={`case-card-${realIdx}`}
        key={realIdx}
        className="group relative rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-500 shadow-sm transition duration-200 ease-in-out hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900 dark:hover:border-blue-500 flex flex-col justify-between"
      >
        <div>
          {/* Clinical classification icon tag */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <BookOpen className="h-4.5 w-4.5" />
            </div>
            
            {cs.subcategory && (
              <span className="rounded bg-slate-100 dark:bg-slate-800 border border-slate-200/40 dark:border-slate-750/30 text-[9px] px-2 py-0.5 font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                🏷️ {cs.subcategory}
              </span>
            )}
          </div>
          
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition leading-snug">
            {cs.title}
          </h3>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
          {/* Interactive Link */}
          <a
            id={`case-link-${realIdx}`}
            href={cs.url}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 group-hover:underline"
          >
            Open Study Case
            <ExternalLink className="h-3 w-3" />
          </a>

          {/* Editors inline buttons */}
          {editorMode && (
            <div className="flex items-center space-x-1.5">
              <button
                id={`edit-case-btn-${realIdx}`}
                onClick={() => {
                  setSelectedCaseIndex(realIdx);
                  setCaseModalEditing(true);
                  setIsCaseModalOpen(true);
                }}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-850 dark:hover:text-slate-200 transition"
                title="Edit Case details"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                id={`delete-case-btn-${realIdx}`}
                onClick={() => {
                  setSelectedCaseIndex(realIdx);
                  setConfirmDeleteCaseOpen(true);
                }}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-850 dark:hover:text-red-400 transition"
                title="Delete Case entry"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderGroupedCases = () => {
    if (!activeCategory) return null;

    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = (cs: Case) => cs.title.toLowerCase().includes(searchLower);

    // If a particular subcategory is filtered inside pills view
    if (activeSubcategoryFilter !== 'all') {
      const isUncategorizedFilter = activeSubcategoryFilter === '__uncategorized__';
      const filtered = activeCategory.cases.filter(c => {
        const matchSub = isUncategorizedFilter ? !c.subcategory : c.subcategory === activeSubcategoryFilter;
        return matchSub && matchesSearch(c);
      });

      return (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center gap-2 border-b border-slate-200/50 pb-2 dark:border-slate-800/50">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-450">
              📂 Filtering: {isUncategorizedFilter ? 'General / Uncategorized' : activeSubcategoryFilter} ({filtered.length} entries)
            </h4>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(cs => renderCaseCard(cs, activeCategory.cases.indexOf(cs)))}
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-xs text-slate-400 dark:text-slate-500">
              No matching cases in this subcategory.
            </div>
          )}
        </div>
      );
    }

    // Default 'all' filter rendering
    const subs = activeCategory.subcategories || [];
    const hasSubcategories = subs.length > 0;

    if (!hasSubcategories) {
      // Just normal flat cases list
      const filtered = activeCategory.cases.filter(matchesSearch);
      return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(cs => renderCaseCard(cs, activeCategory.cases.indexOf(cs)))}
        </div>
      );
    }

    // Has subcategories - group them vertically beautifully!
    const uncategorizedCases = activeCategory.cases.filter(c => !c.subcategory);
    const hasUncategorizedMatches = uncategorizedCases.filter(matchesSearch).length > 0;

    return (
      <div className="space-y-10 animate-fade-in animate-duration-500">
        {/* Render uncategorized cases first if there are any */}
        {uncategorizedCases.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200/50 pb-2 dark:border-slate-800/50">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                📂 General / Uncategorized ({uncategorizedCases.length})
              </h4>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {uncategorizedCases.filter(matchesSearch).map(cs => renderCaseCard(cs, activeCategory.cases.indexOf(cs)))}
            </div>
            {!hasUncategorizedMatches && searchQuery && (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic pl-1">No matching cases</p>
            )}
          </div>
        )}

        {/* Map through explicitly listed subcategories */}
        {subs.map((subName, sIdx) => {
          const subCases = activeCategory.cases.filter(c => c.subcategory === subName);
          const matched = subCases.filter(matchesSearch);
          if (subCases.length === 0) return null; // Hide empty subdirectories to keep layout compact

          return (
            <div key={sIdx} className="space-y-4" id={`subgroup-${sIdx}`}>
              <div className="flex items-center gap-2 border-b border-slate-200/50 pb-2 dark:border-slate-800/50">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  📁 {subName} ({subCases.length})
                </h4>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {matched.map(cs => renderCaseCard(cs, activeCategory.cases.indexOf(cs)))}
              </div>
              {matched.length === 0 && searchQuery && (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic pl-1">No matching cases</p>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div id="radiopaedia-app-root" className="flex flex-col h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 font-sans antialiased selection:bg-blue-500/30">
      
      {/* 1. Global Custom Header Notification Banner */}
      {toast.text && (
        <div 
          id="toast-notification" 
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 rounded-xl px-5 py-3 text-sm shadow-2xl transition duration-300 border backdrop-blur-md animate-bounce ${
            toast.type === 'success' 
              ? 'bg-emerald-50/90 text-emerald-800 border-emerald-100 dark:bg-emerald-950/90 dark:text-emerald-300 dark:border-emerald-900/40' 
              : 'bg-blue-50/90 text-blue-800 border-blue-100 dark:bg-blue-950/90 dark:text-blue-300 dark:border-blue-900/40'
          }`}
        >
          <BookMarked className="h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" />
          <span className="font-semibold">{toast.text}</span>
        </div>
      )}

      {/* 2. Primary Header Panel */}
      <header id="app-header" className="sticky top-0 z-30 shrink-0 border-b border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-900/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              id="mobile-drawer-toggle"
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-350 dark:hover:bg-slate-800 md:hidden"
              aria-label="Toggle navigation drawer"
            >
              <Menu className="h-5.5 w-5.5" />
            </button>
            
            <div className="flex items-center gap-2.5">
              {/* Premium Inline Vector Icon Representation */}
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-500/20">
                <svg className="h-6 w-6 stroke-current stroke-[2]" viewBox="0 0 24 24" fill="none">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white font-display md:text-lg">
                  Radiopaedia
                </h1>
                <p className="hidden text-[10px] md:block font-mono text-slate-400 dark:text-slate-500">
                  Case Collection Hub
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Installable PWA Button Anchor */}
            {deferredPrompt && (
              <button
                id="pwa-install-app-btn"
                onClick={handleInstallClick}
                className="hidden items-center gap-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/50 px-3 py-1.5 text-xs font-semibold animate-pulse sm:flex"
              >
                <Download className="h-3.5 w-3.5" />
                Install App
              </button>
            )}

            {/* Editor mode status pill */}
            {editorMode && (
              <span className="rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase border border-blue-100 dark:border-blue-900/40">
                📝 Editor Mode
              </span>
            )}

            {/* Gear Configuration Control */}
            <button
              id="open-settings-panel"
              onClick={() => setIsSettingsOpen(true)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-350 dark:hover:bg-slate-800 transition duration-150"
              title="Open Configuration panel"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* 3. Primary Content Panel */}
      <div id="app-body-layout" className="flex-1 overflow-hidden">
        <div className="mx-auto flex h-full max-w-7xl">
          
          {/* A. Desktop Category Sidebar Container (Sticky Left) */}
          <aside id="desktop-sidebar" className="hidden w-72 shrink-0 border-r border-slate-200 bg-slate-50/50 dark:border-slate-800/60 dark:bg-slate-900/25 md:flex md:flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-6">
              <div className="flex items-center justify-between mb-4 px-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Clinical Categories
                </span>
                <span className="rounded bg-slate-200 dark:bg-slate-800 text-[10px] px-1.5 py-0.5 font-semibold text-slate-600 dark:text-slate-400">
                  {state.categories.length}
                </span>
              </div>
              
              <nav id="desktop-categories-nav" className="space-y-1">
                {state.categories.map((cat, idx) => (
                  <button
                    id={`desktop-cat-item-${idx}`}
                    key={idx}
                    onClick={() => {
                      setActiveCategoryIndex(idx);
                      setSearchQuery('');
                    }}
                    className={`group w-full rounded-xl px-3.5 py-3 text-left text-sm font-semibold transition flex items-center justify-between ${
                      idx === activeCategoryIndex 
                        ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/10' 
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-350 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate pr-2">{cat.name}</span>
                    <ChevronRight className={`h-4 w-4 shrink-0 transition ${idx === activeCategoryIndex ? 'text-white translate-x-0.5' : 'text-slate-400 opacity-0 group-hover:opacity-100'}`} />
                  </button>
                ))}

                {state.categories.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                    No categories found.
                  </div>
                )}
              </nav>
            </div>

            {/* Bottom creator zone inside Sidebar (Curator only) */}
            {editorMode && (
              <div id="sidebar-curator-panel" className="p-4 border-t border-slate-200 dark:border-slate-850">
                <button
                  id="desktop-add-category-btn"
                  onClick={() => {
                    setCategoryModalEditing(false);
                    setIsCategoryModalOpen(true);
                  }}
                  className="w-full rounded-xl border border-dashed border-slate-300 hover:border-blue-500 text-slate-600 dark:border-slate-800 dark:text-slate-450 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 hover:text-blue-500 py-3 text-xs font-semibold transition flex items-center justify-center gap-2"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Category
                </button>
              </div>
            )}
          </aside>

          {/* B. Mobile Slide-In Custom Sidebar Drawer (Overlay Menu) */}
          {isSidebarOpen && (
            <div id="mobile-sidebar-backdrop" className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm md:hidden animate-fade-in" onClick={() => setIsSidebarOpen(false)}>
              <div 
                id="mobile-sidebar-drawer" 
                className="w-80 h-full bg-white dark:bg-slate-900 border-r border-slate-250 dark:border-slate-800 flex flex-col p-6 animate-slide-right animate-fill-forwards"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-150 pb-4 dark:border-slate-800 mb-6">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4 text-blue-500" />
                    Clinical Collections
                  </span>
                  <button 
                    id="close-mobile-drawer"
                    onClick={() => setIsSidebarOpen(false)} 
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5">
                  {state.categories.map((cat, idx) => (
                    <button
                      id={`mobile-cat-item-${idx}`}
                      key={idx}
                      onClick={() => {
                        setActiveCategoryIndex(idx);
                        setSearchQuery('');
                        setIsSidebarOpen(false);
                      }}
                      className={`w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition flex items-center justify-between ${
                        idx === activeCategoryIndex 
                          ? 'bg-blue-600 text-white shadow-lg' 
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-350 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="truncate">{cat.name}</span>
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    </button>
                  ))}

                  {state.categories.length === 0 && (
                    <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-6">
                      No categories compiled yet.
                    </p>
                  )}
                </div>

                {editorMode && (
                  <div id="mobile-sidebar-curator-panel" className="mt-auto pt-4 border-t border-slate-150 dark:border-slate-800">
                    <button
                      id="mobile-add-category-btn"
                      onClick={() => {
                        setIsSidebarOpen(false);
                        setCategoryModalEditing(false);
                        setIsCategoryModalOpen(true);
                      }}
                      className="w-full rounded-xl border border-dashed border-slate-300 hover:border-blue-500 text-slate-600 dark:border-slate-800 dark:text-slate-400 hover:bg-blue-500/5 hover:text-blue-500 py-3.5 text-xs font-semibold transition flex items-center justify-center gap-2"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Category
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* C. Primary Active Case Content Panel */}
          <main id="app-main-content" className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:py-8 lg:px-8 bg-slate-50 dark:bg-slate-950">
            {activeCategory ? (
              <div id="case-gallery-container" className="space-y-6">
                
                {/* 1. Header and Search Zone */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5 dark:border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold font-display text-slate-900 dark:text-white md:text-2xl">
                        {activeCategory.name}
                      </h2>
                      {editorMode && (
                        <button
                          id="rename-current-category"
                          onClick={() => {
                            setCategoryModalEditing(true);
                            setIsCategoryModalOpen(true);
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
                          title="Rename Category"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 font-mono block mt-0.5">
                      Collection Registry: {activeCategory.cases.length} entries
                    </span>
                  </div>

                  {/* Real-time search filter bar */}
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <input
                      id="search-cases-input"
                      type="text"
                      placeholder="Filter current cases..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500"
                    />
                    {searchQuery && (
                      <button
                        id="clear-search"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-slate-100 dark:bg-slate-800 text-[9px] px-1.5 py-0.5 font-bold hover:bg-slate-200 dark:hover:bg-slate-705 text-slate-500 dark:text-slate-450"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                       {/* Ribbon of subcategory filters */}
                {activeCategory && ((activeCategory.subcategories && activeCategory.subcategories.length > 0) || editorMode) && (
                  <div id="subcategory-filters" className="flex flex-wrap items-center gap-2 border-b border-dashed border-slate-200 dark:border-slate-800/80 pb-5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mr-2">
                      Subcategories:
                    </span>
                    
                    <button
                      id="sub-filter-all"
                      onClick={() => setActiveSubcategoryFilter('all')}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition ${
                        activeSubcategoryFilter === 'all'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800'
                      }`}
                    >
                      All Cases ({activeCategory.cases.length})
                    </button>

                    {(activeCategory.subcategories || []).map((subName, sIdx) => {
                      const caseCount = activeCategory.cases.filter(c => c.subcategory === subName).length;
                      const isActive = activeSubcategoryFilter === subName;
                      return (
                        <div key={sIdx} className="flex items-center gap-1 group/pill">
                          <button
                            id={`sub-filter-item-${sIdx}`}
                            onClick={() => setActiveSubcategoryFilter(subName)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition flex items-center gap-1.5 ${
                              isActive
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-850'
                            }`}
                          >
                            <span>{subName}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 select-none font-bold rounded-full ${isActive ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                              {caseCount}
                            </span>
                          </button>

                          {editorMode && (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover/pill:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
                              <button
                                id={`edit-sub-${sIdx}`}
                                onClick={() => {
                                  setSelectedSubcategoryName(subName);
                                  setSubcategoryModalEditing(true);
                                  setIsSubcategoryModalOpen(true);
                                }}
                                className="p-1 rounded bg-slate-100 dark:bg-slate-850 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-900 transition text-slate-400"
                                title="Rename subcategory"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                id={`delete-sub-${sIdx}`}
                                onClick={() => {
                                  setSelectedSubcategoryName(subName);
                                  setConfirmDeleteSubOpen(true);
                                }}
                                className="p-1 rounded bg-slate-100 dark:bg-slate-850 hover:bg-red-500 hover:text-white dark:hover:bg-red-955 transition text-slate-400"
                                title="Delete subcategory (keep cases)"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* General cases option if any exist without subcategory */}
                    {activeCategory.cases.some(c => !c.subcategory) && (
                      <button
                        id="sub-filter-uncategorized"
                        onClick={() => setActiveSubcategoryFilter('__uncategorized__')}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition ${
                          activeSubcategoryFilter === '__uncategorized__'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800'
                        }`}
                      >
                        General ({activeCategory.cases.filter(c => !c.subcategory).length})
                      </button>
                    )}

                    {editorMode && (
                      <button
                        id="add-new-sub-btn"
                        onClick={() => {
                          setSelectedSubcategoryName('');
                          setSubcategoryModalEditing(false);
                          setIsSubcategoryModalOpen(true);
                        }}
                        className="rounded-full border border-dashed border-slate-300 hover:border-blue-500 text-slate-500 hover:text-blue-500 px-3 py-1.5 text-xs font-semibold transition flex items-center gap-1 dark:border-slate-800 dark:text-slate-400"
                        title="Add Subcategory name"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Sub
                      </button>
                    )}
                  </div>
                )}

                {/* 2. Active Cases Grid / Cards Layout */}
                {renderGroupedCases()}

                {/* 3. Empty States inside Category */}
                {activeCategory.cases.length === 0 && (
                  <div id="category-empty-state" className="flex flex-col items-center justify-center text-center p-12 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl">
                    <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-850 flex items-center justify-center mb-3">
                      <Info className="h-6 w-6 text-slate-500" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      No cases compiled yet
                    </h3>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500 max-w-sm mb-4">
                      {editorMode 
                        ? 'Begin curation by appending clinical case documents right now!' 
                        : 'Curators can toggle Editor Mode in Settings to populate entries.'}
                    </p>
                    {editorMode && (
                      <button
                        id="empty-add-case-btn"
                        onClick={() => {
                          setCaseModalEditing(false);
                          setIsCaseModalOpen(true);
                        }}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 active:bg-blue-800 transition shadow-lg shadow-blue-500/10"
                      >
                        ➕ Add First Case
                      </button>
                    )}
                  </div>
                )}

                {/* Case exists but Search returned nothing */}
                {activeCategory.cases.length > 0 && activeCategory.cases.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                  <div id="search-empty-state" className="text-center py-12">
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-semibold mb-2">
                      No matches found for "{searchQuery}"
                    </p>
                    <button
                      id="reset-search-btn"
                      onClick={() => setSearchQuery('')}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Clear search filter
                    </button>
                  </div>
                )}

                {/* 4. Curator Bottom Action Bar */}
                {editorMode && (
                  <div id="curator-action-bar" className="flex items-center justify-between border-t border-slate-200 pt-6 dark:border-slate-850 mt-8">
                    <button
                      id="add-case-lower-btn"
                      onClick={() => {
                        setCaseModalEditing(false);
                        setIsCaseModalOpen(true);
                      }}
                      className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 text-xs font-semibold tracking-wide transition shadow-lg shadow-blue-500/10 flex items-center gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      Add New Case
                    </button>

                    <button
                      id="delete-category-lower-btn"
                      onClick={() => setConfirmDeleteCatOpen(true)}
                      className="rounded-xl border border-red-200 dark:border-red-950/40 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 px-4 py-3 text-xs font-semibold transition flex items-center gap-1.5"
                    >
                      <Trash className="h-4 w-4" />
                      Delete Category
                    </button>
                  </div>
                )}

              </div>
            ) : (
              /* Acknowledge state when category lists are completely unselected or empty */
              <div id="no-category-state" className="flex flex-col items-center justify-center text-center p-12 min-h-[50vh]">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 mb-4 animate-pulse">
                  <svg className="h-8 w-8 stroke-current" viewBox="0 0 24 24" fill="none">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                  Select a Collection
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-5">
                  Choose a clinical category from the sidebar or drawer to inspect radiograph cases.
                </p>
                
                {editorMode === false && (
                  <button 
                    id="welcome-enable-editor-btn"
                    onClick={() => setEditorMode(true)}
                    className="rounded-xl bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/40 px-4 py-2.5 text-xs font-medium cursor-pointer transition border border-dashed border-blue-200 dark:border-blue-900/40"
                  >
                    💡 Enable Curator Mode to add data
                  </button>
                )}
              </div>
            )}
          </main>

        </div>
      </div>

      {/* 4. Dialog & Overlay Modals Modules */}
      
      {/* Settings Panel */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        editorMode={editorMode}
        setEditorMode={setEditorMode}
        currentState={state}
        onImportState={handleImportRemoteState}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
      />

      {/* Adding/Editing Case dialog */}
      <EditCaseModal
        isOpen={isCaseModalOpen}
        isEditing={caseModalEditing}
        onClose={() => {
          setIsCaseModalOpen(false);
          setSelectedCaseIndex(null);
        }}
        onSave={handleSaveCaseSubmit}
        initialTitle={caseModalEditing && selectedCaseIndex !== null && activeCategory ? activeCategory.cases[selectedCaseIndex]?.title : ''}
        initialUrl={caseModalEditing && selectedCaseIndex !== null && activeCategory ? activeCategory.cases[selectedCaseIndex]?.url : ''}
        initialSubcategory={caseModalEditing && selectedCaseIndex !== null && activeCategory ? activeCategory.cases[selectedCaseIndex]?.subcategory : ''}
        availableSubcategories={activeCategory?.subcategories || []}
      />

      {/* Adding/Renaming Category dialog */}
      <EditCategoryModal
        isOpen={isCategoryModalOpen}
        isEditing={categoryModalEditing}
        onClose={() => setIsCategoryModalOpen(false)}
        onSave={categoryModalEditing ? handleRenameCategorySubmit : handleAddCategorySubmit}
        initialName={categoryModalEditing && activeCategory ? activeCategory.name : ''}
      />

      {/* Deleting category Confirmation popup */}
      <ConfirmModal
        isOpen={confirmDeleteCatOpen}
        title="⚠️ Deleting Clinical Category"
        message={`Are you planning to permanently throw away "${activeCategory?.name}" and all of its ${activeCategory?.cases.length} associated case entries? This process is immediate.`}
        confirmText="Yes, delete everything"
        onConfirm={handleDeleteCategoryConfirm}
        onCancel={() => setConfirmDeleteCatOpen(false)}
      />

      {/* Deleting case entry Confirmation popup */}
      <ConfirmModal
        isOpen={confirmDeleteCaseOpen}
        title="🗑️ Confirm Study Removal"
        message={`Remove the study entry "${selectedCaseIndex !== null && activeCategory ? activeCategory.cases[selectedCaseIndex]?.title : ''}" from the repository? Items can be added back at any time.`}
        confirmText="Remove entry"
        onConfirm={handleDeleteCaseConfirm}
        onCancel={() => {
          setConfirmDeleteCaseOpen(false);
          setSelectedCaseIndex(null);
        }}
      />

      {/* Adding/Renaming Subcategory Modal */}
      <EditSubcategoryModal
        isOpen={isSubcategoryModalOpen}
        isEditing={subcategoryModalEditing}
        onClose={() => setIsSubcategoryModalOpen(false)}
        onSave={handleSaveSubcategorySubmit}
        initialName={subcategoryModalEditing ? selectedSubcategoryName : ''}
      />

      {/* Deleting Subcategory Confirmation modal */}
      <ConfirmModal
        isOpen={confirmDeleteSubOpen}
        title="📂 Delete Subcategory"
        message={`Are you sure you want to delete subcategory "${selectedSubcategoryName}"? Clinical case entries inside will be preserved and moved to General/Uncategorized.`}
        confirmText="Delete subcategory"
        onConfirm={handleDeleteSubcategoryConfirm}
        onCancel={() => {
          setConfirmDeleteSubOpen(false);
          setSelectedSubcategoryName('');
        }}
      />

    </div>
  );
}
