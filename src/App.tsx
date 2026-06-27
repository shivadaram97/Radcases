import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, Pencil, Trash2, FolderPlus, BookOpen, ExternalLink, 
  Menu, ChevronRight, Settings, Info, Download, Trash, BookMarked, HelpCircle, X,
  LogIn, LogOut, RefreshCw, ChevronUp, ChevronDown, GraduationCap, CheckCircle2, 
  RotateCcw, Award, Eye, EyeOff
} from 'lucide-react';
import { loadState, saveState, AppState, Category, Case, sanitizeState } from './utils/db';
import SettingsModal from './components/SettingsModal';
import EditCaseModal from './components/EditCaseModal';
import EditCategoryModal from './components/EditCategoryModal';
import EditSubcategoryModal from './components/EditSubcategoryModal';
import ConfirmModal from './components/ConfirmModal';
import PasscodeModal from './components/PasscodeModal';
import { 
  auth, 
  signInWithGoogle, 
  signOutUser, 
  loadUserCategoriesFromFirestore, 
  saveCategoryToFirestore, 
  deleteCategoryFromFirestore, 
  syncAllLocalToFirestore 
} from './utils/firebase';

// Helper function to dynamically highlight query matches in case titles
function highlightText(text: string, search: string): React.ReactNode {
  if (!search.trim()) return text;
  
  const regex = new RegExp(`(${search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <>
      {parts.map((part, i) => 
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/40 text-slate-900 dark:text-white px-0.5 rounded-sm">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

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

  // Security Passcode Layer states
  const [curatorPasscode, setCuratorPasscode] = useState<string>(() => {
    return localStorage.getItem('radiopaedia_curator_passcode') || 'curator123';
  });
  const [curatorPasscodeConfigured, setCuratorPasscodeConfigured] = useState<boolean>(() => {
    return localStorage.getItem('radiopaedia_curator_passcode_configured') === 'true';
  });
  const [isPasscodeModalOpen, setIsPasscodeModalOpen] = useState(false);
  const [passcodeModalTitle, setPasscodeModalTitle] = useState('');
  const [passcodeModalMessage, setPasscodeModalMessage] = useState('');
  const [passcodeSuccessCallback, setPasscodeSuccessCallback] = useState<() => void>(() => () => {});

  const handleUpdatePasscode = (newPasscode: string) => {
    setCuratorPasscode(newPasscode);
    localStorage.setItem('radiopaedia_curator_passcode', newPasscode);
    setCuratorPasscodeConfigured(true);
    localStorage.setItem('radiopaedia_curator_passcode_configured', 'true');
    triggerToast('Passcode verified and stored successfully', 'success');
  };

  const runWithPasscode = (title: string, message: string, onSuccessAction: () => void) => {
    setPasscodeModalTitle(title);
    setPasscodeModalMessage(message);
    setPasscodeSuccessCallback(() => onSuccessAction);
    setIsPasscodeModalOpen(true);
  };

  const handleTriggerEditorModeToggle = () => {
    if (courseMode) {
      triggerToast("🔐 Curator tools are disabled while studying in Course Mode. Disable Course Mode first!", "info");
      return;
    }
    if (!editorMode) {
      runWithPasscode(
        "🗝️ Enable Curation Privileges",
        "Enter the secure curator passcode to activate Editing Mode. This permits modifying clinical structures, renaming subcategories, and deleting category catalogs.",
        () => {
          setEditorMode(true);
          triggerToast("Editor Mode activated successfully", "success");
        }
      );
    } else {
      setEditorMode(false);
      triggerToast("Editor Mode turned off", "info");
    }
  };

  // System status and toast bar
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'info' | null }>({ text: '', type: null });

  // Firebase Auth and synchronization states
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);

  // Course Mode State
  const [courseMode, setCourseMode] = useState<boolean>(() => {
    return localStorage.getItem('casestacks_course_mode') === 'true';
  });
  const [courseDiagnosisOn, setCourseDiagnosisOn] = useState<boolean>(() => {
    return localStorage.getItem('casestacks_course_diagnosis_on') !== 'false';
  });
  const [completedCaseUrls, setCompletedCaseUrls] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('casestacks_completed_urls');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [courseFilter, setCourseFilter] = useState<'all' | 'unseen' | 'studied'>('all');
  const [isResetConfirming, setIsResetConfirming] = useState<boolean>(false);

  // Toggle Course Mode
  const handleToggleCourseMode = () => {
    const nextMode = !courseMode;
    setCourseMode(nextMode);
    localStorage.setItem('casestacks_course_mode', nextMode ? 'true' : 'false');
    if (nextMode) {
      setEditorMode(false); // Automatically disable curator/editor mode when starting Course Mode!
    }
    triggerToast(nextMode ? '🎓 Course Mode Enabled! Track your progress.' : 'Course Mode Disabled.', 'success');
  };

  // Toggle Course Diagnosis Visibility
  const handleToggleCourseDiagnosis = () => {
    const nextVal = !courseDiagnosisOn;
    setCourseDiagnosisOn(nextVal);
    localStorage.setItem('casestacks_course_diagnosis_on', nextVal ? 'true' : 'false');
    triggerToast(nextVal ? '👁️ Diagnosis Revealed' : '🙈 Diagnosis Hidden! Good luck with your studies (Case headers randomized to index codes).', 'info');
  };

  const toggleCaseCompleted = (url: string) => {
    setCompletedCaseUrls(prev => {
      const updated = prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url];
      localStorage.setItem('casestacks_completed_urls', JSON.stringify(updated));
      return updated;
    });
  };

  const resetCourseProgress = () => {
    setCompletedCaseUrls([]);
    localStorage.setItem('casestacks_completed_urls', JSON.stringify([]));
    setIsResetConfirming(false);
    triggerToast('All course study progress has been reset!', 'info');
  };

  // Cloudflare DNS 1.1.1.1 Accelerator Preference
  const [dnsSpeedup, setDnsSpeedup] = useState<boolean>(() => {
    return localStorage.getItem('casestacks_dns_speedup') !== 'false';
  });

  // Cloudflare 1.1.1.1 & Radiopaedia Image Accelerator connection pre-warming
  useEffect(() => {
    if (!dnsSpeedup) return;

    const accelerationDomains = [
      'https://1.1.1.1',
      'https://1.0.0.1',
      'https://cloudflare-dns.com',
      'https://radiopaedia.org',
      'https://images.radiopaedia.org',
      'https://prod-images-static.radiopaedia.org',
      'https://prod-images-static-radiopaedia-org.s3.amazonaws.com'
    ];

    const elements: HTMLElement[] = [];

    accelerationDomains.forEach(domain => {
      // DNS Prefetch Link
      const prefetchLink = document.createElement('link');
      prefetchLink.rel = 'dns-prefetch';
      prefetchLink.href = domain;
      document.head.appendChild(prefetchLink);
      elements.push(prefetchLink);

      // TCP/TLS Preconnect Link
      const preconnectLink = document.createElement('link');
      preconnectLink.rel = 'preconnect';
      preconnectLink.href = domain;
      preconnectLink.crossOrigin = 'anonymous';
      document.head.appendChild(preconnectLink);
      elements.push(preconnectLink);
    });

    return () => {
      elements.forEach(el => {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    };
  }, [dnsSpeedup]);

  // Drag and drop states/refs for clinical cases rearranging
  const draggedIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragActiveId, setDragActiveId] = useState<number | null>(null);

  // 1a. Firebase Auth Sync Observer
  useEffect(() => {
    let active = true;
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!active) return;
      setCurrentUser(user);
      if (user) {
        setIsSyncingCloud(true);
        try {
          const cloudCats = await loadUserCategoriesFromFirestore(user.uid);
          if (!active) return;
          if (cloudCats && cloudCats.length > 0) {
            const newState = { categories: cloudCats };
            setState(newState);
            await saveState(newState);
            setActiveCategoryIndex(0);
            triggerToast('Synced categories successfully from your cloud backup!', 'success');
          } else {
            // Empty cloud. Sync current local categories up to cloud
            const local = await loadState();
            if (local && local.categories.length > 0) {
              triggerToast('Backing up offline categories to cloud storage...', 'info');
              await syncAllLocalToFirestore(user.uid, local.categories);
              const updatedCloud = await loadUserCategoriesFromFirestore(user.uid);
              if (active && updatedCloud && updatedCloud.length > 0) {
                setState({ categories: updatedCloud });
                await saveState({ categories: updatedCloud });
              }
              triggerToast('Backup and synchronization complete!', 'success');
            }
          }
        } catch (error) {
          console.error('Firebase Auth sync error:', error);
          triggerToast('Cloud sync is temporarily unavailable.', 'info');
        } finally {
          if (active) setIsSyncingCloud(false);
        }
      } else {
        // Logged out: fallback to local repository cache
        const local = await loadState();
        if (active && local) {
          setState(local);
          setActiveCategoryIndex(local.categories.length > 0 ? 0 : null);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // 1b. First Bootstrapper + PWA Setup
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
    const freshCat: Category = { id: `cat_${Math.random().toString(36).substring(2, 11)}`, name, cases: [] };
    const latestState = {
      ...state,
      categories: [...state.categories, freshCat]
    };
    setState(latestState);
    await saveState(latestState);
    if (auth.currentUser) {
      await saveCategoryToFirestore(auth.currentUser.uid, freshCat);
    }
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
    if (auth.currentUser) {
      const activeCat = updatedCats[activeCategoryIndex];
      await saveCategoryToFirestore(auth.currentUser.uid, activeCat);
    }
    setIsCategoryModalOpen(false);
    triggerToast('Renamed category successfully', 'success');
  };

  const handleDeleteCategoryConfirm = async () => {
    if (activeCategoryIndex === null) return;
    const catToDelete = state.categories[activeCategoryIndex];
    
    runWithPasscode(
      "⚠️ Verify Deletion of Category",
      `Please provide the curator passcode to permanently delete the clinical category "${catToDelete.name}". This will immediately erase all case entries and synced data.`,
      async () => {
        const updatedCats = state.categories.filter((_, idx) => idx !== activeCategoryIndex);
        const latestState = { ...state, categories: updatedCats };
        
        setState(latestState);
        await saveState(latestState);
        if (auth.currentUser && catToDelete.id) {
          await deleteCategoryFromFirestore(auth.currentUser.uid, catToDelete.id);
        }
        setConfirmDeleteCatOpen(false);
        setActiveCategoryIndex(updatedCats.length > 0 ? 0 : null);
        triggerToast(`Deleted category "${catToDelete.name}"`);
      }
    );
  };

  // 4. Case Operations
  const handleSaveCaseSubmit = async (title: string, url: string, subcategory?: string) => {
    if (courseMode) {
      triggerToast("🔐 Curation & case modifications are prohibited during Course Mode!", "info");
      return;
    }
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
    if (auth.currentUser) {
      const activeCat = updatedCats[activeCategoryIndex];
      await saveCategoryToFirestore(auth.currentUser.uid, activeCat);
    }
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
    if (auth.currentUser) {
      const activeCat = updatedCats[activeCategoryIndex];
      await saveCategoryToFirestore(auth.currentUser.uid, activeCat);
    }
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
    if (auth.currentUser) {
      const activeCat = updatedCats[activeCategoryIndex];
      await saveCategoryToFirestore(auth.currentUser.uid, activeCat);
    }
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
    if (auth.currentUser) {
      const activeCat = updatedCats[activeCategoryIndex];
      await saveCategoryToFirestore(auth.currentUser.uid, activeCat);
    }
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
    runWithPasscode(
      "📂 Verify Deletion of Subcategory",
      `Please provide the curator passcode to delete the subcategory "${selectedSubcategoryName}". Medical studies inside will be preserved.`,
      async () => {
        await handleDeleteSubcategory(selectedSubcategoryName);
        setConfirmDeleteSubOpen(false);
        setSelectedSubcategoryName('');
      }
    );
  };

  const handleDeleteCaseConfirm = async () => {
    if (courseMode) {
      triggerToast("🔐 Case deletion is prohibited during Course Mode!", "info");
      return;
    }
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
    if (auth.currentUser) {
      const activeCat = updatedCats[activeCategoryIndex];
      await saveCategoryToFirestore(auth.currentUser.uid, activeCat);
    }
    setConfirmDeleteCaseOpen(false);
    setSelectedCaseIndex(null);
    triggerToast('Removed case file');
  };

  // 5. Remote API / Local Sync replacement hook
  const handleImportRemoteState = async (newState: AppState) => {
    const sanitized = sanitizeState(newState);
    setState(sanitized);
    await saveState(sanitized);
    if (auth.currentUser) {
      await syncAllLocalToFirestore(auth.currentUser.uid, sanitized.categories);
    }
    if (sanitized.categories.length > 0) {
      setActiveCategoryIndex(0);
    } else {
      setActiveCategoryIndex(null);
    }
    triggerToast('Clinical catalog sync complete!', 'success');
  };

  // 5a. Manual cloud synchronization trigger
  const handleManualSync = async () => {
    if (!auth.currentUser) {
      triggerToast('Please sign in with Google to sync.', 'info');
      return;
    }
    setIsSyncingCloud(true);
    triggerToast('Synchronizing with Google Firestore...', 'info');
    try {
      const sanitized = sanitizeState(state);
      // Upload current local state to Firestore
      await syncAllLocalToFirestore(auth.currentUser.uid, sanitized.categories);
      
      // Load fresh categories from Firestore to guarantee alignment
      const remoteCats = await loadUserCategoriesFromFirestore(auth.currentUser.uid);
      if (remoteCats && remoteCats.length > 0) {
        const newState = { categories: remoteCats };
        setState(newState);
        await saveState(newState);
      }
      triggerToast('Database fully synchronized with Google Cloud!', 'success');
    } catch (error) {
      console.error('Google manual sync error:', error);
      triggerToast('Sync failed. Please check network connection.', 'info');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // 5b. Rearrange clinical cases inside list (Drag & Drop)
  const handleReorderCases = async (srcIdx: number, destIdx: number) => {
    if (activeCategoryIndex === null || srcIdx === destIdx) return;
    const cat = state.categories[activeCategoryIndex];
    if (!cat) return;
    const updatedCases = [...cat.cases];
    
    // Splice from src and insert at dest
    const [removed] = updatedCases.splice(srcIdx, 1);
    updatedCases.splice(destIdx, 0, removed);
    
    const updatedCats = state.categories.map((c, idx) => {
      if (idx === activeCategoryIndex) {
        return {
          ...c,
          cases: updatedCases
        };
      }
      return c;
    });
    
    const latestState = { ...state, categories: updatedCats };
    setState(latestState);
    await saveState(latestState);
    
    if (auth.currentUser) {
      const activeCat = updatedCats[activeCategoryIndex];
      await saveCategoryToFirestore(auth.currentUser.uid, activeCat);
    }
    triggerToast('Rearranged clinical cases!', 'success');
  };

  const handleMoveCase = async (index: number, direction: 'up' | 'down') => {
    if (activeCategoryIndex === null) return;
    const cat = state.categories[activeCategoryIndex];
    if (!cat) return;
    
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= cat.cases.length) return;
    
    await handleReorderCases(index, targetIdx);
  };

  // Filter computation
  const activeCategory = activeCategoryIndex !== null ? state.categories[activeCategoryIndex] : null;

  // Single card helper to ensure visual styling is beautifully self-contained and DRY
  const renderCaseCard = (cs: Case, realIdx: number, displayNum?: number) => {
    return (
      <div
        id={`case-card-${realIdx}`}
        key={realIdx}
        draggable={editorMode && dragActiveId === realIdx}
        onDragStart={(e) => {
          if (!editorMode || dragActiveId !== realIdx) {
            e.preventDefault();
            return;
          }
          draggedIndexRef.current = realIdx;
          e.dataTransfer.effectAllowed = 'move';
          e.currentTarget.style.opacity = '0.45';
        }}
        onDragEnd={(e) => {
          draggedIndexRef.current = null;
          setDragOverIndex(null);
          setDragActiveId(null);
          e.currentTarget.style.opacity = '';
        }}
        onDragOver={(e) => {
          if (editorMode && draggedIndexRef.current !== null) {
            e.preventDefault();
          }
        }}
        onDragEnter={(e) => {
          if (editorMode && draggedIndexRef.current !== null && draggedIndexRef.current !== realIdx) {
            setDragOverIndex(realIdx);
          }
        }}
        onDragLeave={() => {
          if (dragOverIndex === realIdx) {
            setDragOverIndex(null);
          }
        }}
        onDrop={async (e) => {
          if (editorMode && draggedIndexRef.current !== null) {
            e.preventDefault();
            const srcIdx = draggedIndexRef.current;
            if (srcIdx !== realIdx) {
              await handleReorderCases(srcIdx, realIdx);
            }
          }
          setDragOverIndex(null);
          setDragActiveId(null);
        }}
        className={`group relative rounded-2xl border p-5 shadow-sm transition duration-200 ease-in-out flex flex-col justify-between ${
          editorMode 
            ? (dragActiveId === realIdx ? 'cursor-grabbing select-none scale-[1.012]' : 'cursor-default') 
            : ''
        } ${
          dragOverIndex === realIdx 
            ? 'border-blue-500 bg-blue-50/20 ring-2 ring-blue-500/20 dark:border-blue-400 dark:bg-blue-950/25 scale-[1.015]' 
            : (courseMode && completedCaseUrls.includes(cs.url)
                ? 'border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/15 dark:bg-emerald-950/10 hover:border-emerald-500 hover:shadow-md'
                : 'border-slate-200 bg-white hover:border-blue-500 hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900 dark:hover:border-blue-500')
        }`}
      >
        <div>
          {/* Clinical classification icon tag */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                <BookOpen className="h-4.5 w-4.5" />
              </div>
              {courseMode && (
                <button
                  id={`toggle-complete-case-${realIdx}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCaseCompleted(cs.url);
                  }}
                  className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                    completedCaseUrls.includes(cs.url)
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-750/30 text-slate-400 hover:text-slate-600 hover:border-slate-350 dark:hover:text-slate-200'
                  }`}
                  title={completedCaseUrls.includes(cs.url) ? "Marked as Studied - Click to undo" : "Mark as Studied"}
                >
                  <CheckCircle2 className={`h-3 w-3 ${completedCaseUrls.includes(cs.url) ? 'fill-emerald-500 text-white dark:text-emerald-950' : ''}`} />
                  <span>{completedCaseUrls.includes(cs.url) ? 'Studied' : 'Unseen'}</span>
                </button>
              )}
            </div>
            
            {editorMode ? (
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <span 
                  className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold select-none flex items-center gap-1 font-mono cursor-grab active:cursor-grabbing px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-705 hover:text-slate-700 dark:hover:text-slate-200 border border-slate-200/50 dark:border-slate-750/30 transition duration-150"
                  onMouseDown={() => setDragActiveId(realIdx)}
                  onMouseUp={() => setDragActiveId(null)}
                  onMouseLeave={() => setDragActiveId(null)}
                  onTouchStart={() => setDragActiveId(realIdx)}
                  onTouchEnd={() => setDragActiveId(null)}
                  title="Drag on desktop to reorder"
                >
                  ⋮⋮ Drag
                </span>
                <div className="flex items-center rounded border border-slate-200/50 dark:border-slate-750/30 overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <button
                    id={`move-up-btn-${realIdx}`}
                    type="button"
                    onClick={() => handleMoveCase(realIdx, 'up')}
                    disabled={realIdx === 0}
                    title="Move Study Up (useful on phone)"
                    className="p-1 px-1.5 text-slate-500 hover:text-slate-805 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-25 disabled:pointer-events-none transition cursor-pointer"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700"></div>
                  <button
                    id={`move-down-btn-${realIdx}`}
                    type="button"
                    onClick={() => handleMoveCase(realIdx, 'down')}
                    disabled={activeCategory ? realIdx === activeCategory.cases.length - 1 : true}
                    title="Move Study Down (useful on phone)"
                    className="p-1 px-1.5 text-slate-500 hover:text-slate-805 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-25 disabled:pointer-events-none transition cursor-pointer"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : cs.subcategory && (
              <span className="rounded bg-slate-100 dark:bg-slate-800 border border-slate-200/40 dark:border-slate-750/30 text-[9px] px-2 py-0.5 font-bold text-slate-500 dark:text-slate-400 tracking-wider animate-fade-in">
                🏷️ {cs.subcategory}
              </span>
            )}
          </div>
          
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition leading-snug">
            {courseMode && !courseDiagnosisOn 
              ? `Case #${displayNum !== undefined ? displayNum : realIdx + 1}` 
              : highlightText(cs.title, searchQuery)}
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
            onClick={() => {
              if (courseMode && !completedCaseUrls.includes(cs.url)) {
                toggleCaseCompleted(cs.url);
                triggerToast(
                  `Studied ${courseMode && !courseDiagnosisOn ? `Case #${displayNum !== undefined ? displayNum : realIdx + 1}` : `case: ${cs.title}`}`,
                  'success'
                );
              }
            }}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 group-hover:underline"
          >
            Open Study Case
            <ExternalLink className="h-3 w-3" />
          </a>

          {/* Editors inline buttons */}
          {editorMode && (
            <div className="flex items-center space-x-1">
              {/* Move Up */}
              <button
                id={`move-up-case-btn-${realIdx}`}
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (realIdx > 0) {
                    await handleReorderCases(realIdx, realIdx - 1);
                  }
                }}
                disabled={realIdx === 0}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-500 dark:hover:bg-slate-850 dark:hover:text-blue-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition"
                title="Move up in list"
              >
                <ChevronUp className="h-4 w-4" />
              </button>

              {/* Move Down */}
              <button
                id={`move-down-case-btn-${realIdx}`}
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (activeCategory && realIdx < activeCategory.cases.length - 1) {
                    await handleReorderCases(realIdx, realIdx + 1);
                  }
                }}
                disabled={!activeCategory || realIdx === activeCategory.cases.length - 1}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-500 dark:hover:bg-slate-850 dark:hover:text-blue-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition"
                title="Move down in list"
              >
                <ChevronDown className="h-4 w-4" />
              </button>

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
    const matchesSearch = (cs: Case) => {
      const matchText = cs.title.toLowerCase().includes(searchLower);
      if (!matchText) return false;
      
      if (courseMode) {
        const isCompleted = completedCaseUrls.includes(cs.url);
        if (courseFilter === 'unseen') return !isCompleted;
        if (courseFilter === 'studied') return isCompleted;
      }
      return true;
    };

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
            {filtered.map((cs, idx) => renderCaseCard(cs, activeCategory.cases.indexOf(cs), idx + 1))}
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
          {filtered.map((cs, idx) => renderCaseCard(cs, activeCategory.cases.indexOf(cs), idx + 1))}
        </div>
      );
    }

    // Has subcategories - group them vertically beautifully!
    const uncategorizedCases = activeCategory.cases.filter(c => !c.subcategory);
    const matchedUncategorized = uncategorizedCases.filter(matchesSearch);
    const hasUncategorizedMatches = matchedUncategorized.length > 0;

    let runningCounter = 0;

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
              {matchedUncategorized.map(cs => {
                runningCounter++;
                return renderCaseCard(cs, activeCategory.cases.indexOf(cs), runningCounter);
              })}
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
                {matched.map(cs => {
                  runningCounter++;
                  return renderCaseCard(cs, activeCategory.cases.indexOf(cs), runningCounter);
                })}
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
    <div id="casestacks-app-root" className="flex flex-col h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 font-sans antialiased selection:bg-blue-500/30">
      
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
                  CaseStacks
                </h1>
                <p className="hidden text-[10px] md:block font-mono text-slate-400 dark:text-slate-500">
                  Study Registry
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

            {/* Cloud Sync Status and Auth Controls */}
            {currentUser ? (
              <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-2">
                {currentUser.photoURL ? (
                  <img
                    id="user-profile-avatar"
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'User Profile'}
                    className="h-8 w-8 rounded-full border border-blue-500 shadow-sm"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div id="user-profile-avatar-placeholder" className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold text-xs border border-blue-200 dark:border-blue-900">
                    {(currentUser.displayName || currentUser.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="hidden flex-col text-left sm:flex">
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 leading-tight truncate max-w-[90px]">
                    {currentUser.displayName || 'Clinical Curator'}
                  </span>
                  <span className="text-[9px] font-semibold text-blue-500 leading-none">
                    {isSyncingCloud ? 'Syncing...' : 'Connected'}
                  </span>
                </div>
                
                {/* Manual Sync Button */}
                <button
                  id="navbar-manual-sync-btn"
                  type="button"
                  onClick={handleManualSync}
                  disabled={isSyncingCloud}
                  className="rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 disabled:opacity-50 p-1.5 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/40 transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                  title="Force Manual Sync"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
                  <span className="hidden md:inline">Sync</span>
                </button>

                <button
                  id="user-sign-out-btn"
                  onClick={async () => {
                    await signOutUser();
                    triggerToast('Logged out of Google secure session.', 'info');
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-800 transition"
                  title="Sign out of Google"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                id="user-sign-in-btn"
                onClick={async () => {
                  try {
                    await signInWithGoogle();
                    triggerToast('Signed in successfully with Google Cloud Active!', 'success');
                  } catch (e) {
                    triggerToast('Failed to sign in with Google.', 'info');
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200/85 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-300 shadow-sm transition"
                title="Synchronize and backup cases to Google Secure Account"
              >
                <LogIn className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                <span>Google Sync</span>
              </button>
            )}
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
                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 font-mono">
                        Collection Registry: {activeCategory.cases.length} entries
                      </span>
                      <button
                        id="toggle-course-mode-btn"
                        type="button"
                        onClick={handleToggleCourseMode}
                        className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full flex items-center gap-1 transition ${
                          courseMode
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm hover:from-blue-700 hover:to-indigo-700'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                        title="Toggle learning progression tracking & filters"
                      >
                        <GraduationCap className="h-3 w-3" />
                        <span>{courseMode ? 'Course Mode: ON' : 'Turn On Course Mode'}</span>
                      </button>
                    </div>
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

                {/* 1.1 Course Mode Progress Panel */}
                {courseMode && (() => {
                  const currentCourseCases = activeSubcategoryFilter === 'all' 
                    ? activeCategory.cases 
                    : (activeSubcategoryFilter === '__uncategorized__' 
                        ? activeCategory.cases.filter(c => !c.subcategory) 
                        : activeCategory.cases.filter(c => c.subcategory === activeSubcategoryFilter));
                  
                  const totalInFocus = currentCourseCases.length;
                  const completedInFocus = currentCourseCases.filter(c => completedCaseUrls.includes(c.url)).length;
                  const activeProgressPercent = totalInFocus > 0 ? Math.round((completedInFocus / totalInFocus) * 100) : 0;
                  
                  let rankLabel = "Unstarted Residency";
                  if (activeProgressPercent > 0 && activeProgressPercent < 40) rankLabel = "Resident in Training";
                  else if (activeProgressPercent >= 40 && activeProgressPercent < 80) rankLabel = "Advanced Clinical Fellow";
                  else if (activeProgressPercent >= 80 && activeProgressPercent < 100) rankLabel = "Radiology Specialist";
                  else if (activeProgressPercent === 100) rankLabel = "Subspecialty Master 🏆";

                  return (
                    <div 
                      id="course-mode-hub-panel" 
                      className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4 animate-fade-in"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/80 dark:text-blue-400">
                              <GraduationCap className="h-3.5 w-3.5" />
                            </span>
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest font-mono">
                              Clinical Course Pathway
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                            Course Focus: {activeSubcategoryFilter === 'all' 
                              ? `All ${activeCategory.name} studies` 
                              : (activeSubcategoryFilter === '__uncategorized__' 
                                  ? 'General/uncategorized studies' 
                                  : `Knee / ${activeSubcategoryFilter} subspecialty`
                                )}
                          </h3>
                          <p className="text-xs text-slate-400 dark:text-slate-450 max-w-xl">
                            Read external clinical studies to automatically track files you've masterfully researched. Check/uncheck studies manually to record curriculum completion.
                          </p>
                          
                          <div className="flex flex-wrap items-center gap-3 pt-3">
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-mono">
                              Diagnosis Viz:
                            </span>
                            <button
                              id="toggle-course-diagnosis-btn"
                              type="button"
                              onClick={handleToggleCourseDiagnosis}
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-xl flex items-center gap-1.5 transition border-2 cursor-pointer shadow-sm ${
                                courseDiagnosisOn
                                  ? 'bg-blue-50/70 border-blue-200/50 hover:bg-blue-100/70 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-350'
                                  : 'bg-amber-50/70 border-amber-200/50 hover:bg-amber-100/70 text-amber-700 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-300'
                              }`}
                              title="Turn On/Off Diagnosis heading. Off shows generic Case # numbers for self-assessment."
                            >
                              {courseDiagnosisOn ? (
                                <>
                                  <Eye className="h-3.5 w-3.5 text-blue-500" />
                                  <span>Revealed (ON)</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="h-3.5 w-3.5 text-amber-600" />
                                  <span>Self-Test (OFF)</span>
                                </>
                              )}
                            </button>


                          </div>
                        </div>

                        {/* Rank Badge and Reset */}
                        <div className="flex items-center gap-3 self-start md:self-center">
                          <div className="rounded-xl bg-orange-50 dark:bg-orange-950/20 px-3 py-1.5 border border-orange-100 dark:border-orange-900/30 text-center shrink-0">
                            <span className="text-[9px] uppercase font-bold text-orange-500 block leading-none">Curator Rank</span>
                            <span className="text-xs font-bold text-orange-600 dark:text-orange-400 block mt-1">{rankLabel}</span>
                          </div>
                          
                          {isResetConfirming ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                id="reset-course-progress-confirm"
                                type="button"
                                onClick={() => resetCourseProgress()}
                                className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 animate-pulse"
                              >
                                <RotateCcw className="h-3 w-3" />
                                <span>Are you sure?</span>
                              </button>
                              <button
                                id="reset-course-progress-cancel"
                                type="button"
                                onClick={() => setIsResetConfirming(false)}
                                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-805 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold transition cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              id="reset-course-progress-btn"
                              type="button"
                              onClick={() => setIsResetConfirming(true)}
                              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 hover:text-red-500 dark:hover:text-red-400 transition text-slate-400 text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                              title="Reset all completed marks"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Reset Progress</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Progress bar Zone */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-semibold text-slate-600 dark:text-slate-350">
                            Progress meter: <strong className="text-blue-600 dark:text-blue-400">{completedInFocus}</strong> of {totalInFocus} cases mastered
                          </span>
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                            {activeProgressPercent}% Completion
                          </span>
                        </div>
                        
                        <div className="w-full bg-slate-100 dark:bg-slate-850/80 rounded-full h-3 overflow-hidden border border-slate-200/20">
                          <div 
                            className="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 h-full rounded-full transition-all duration-1000 ease-out" 
                            style={{ width: `${activeProgressPercent}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Filter segmentation bar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-800/40">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Quick study filter:
                        </span>
                        
                        <div className="flex flex-wrap items-center gap-1 bg-slate-100/50 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/40 dark:border-slate-900">
                          <button
                            id="course-filter-all"
                            type="button"
                            onClick={() => setCourseFilter('all')}
                            className={`text-xs px-3.5 py-1.5 rounded-lg font-semibold transition ${
                              courseFilter === 'all'
                                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                            }`}
                          >
                            📚 Show All ({totalInFocus})
                          </button>
                          <button
                            id="course-filter-unseen"
                            type="button"
                            onClick={() => setCourseFilter('unseen')}
                            className={`text-xs px-3.5 py-1.5 rounded-lg font-semibold transition flex items-center gap-1 ${
                              courseFilter === 'unseen'
                                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm text-blue-600 dark:text-blue-400'
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                            }`}
                          >
                            👁️ Unseen ({totalInFocus - completedInFocus})
                          </button>
                          <button
                            id="course-filter-studied"
                            type="button"
                            onClick={() => setCourseFilter('studied')}
                            className={`text-xs px-3.5 py-1.5 rounded-lg font-semibold transition flex items-center gap-1 ${
                              courseFilter === 'studied'
                                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                            }`}
                          >
                            ✅ Studied ({completedInFocus})
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })()}

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
                    onClick={handleTriggerEditorModeToggle}
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
        currentUser={currentUser}
        isSyncingCloud={isSyncingCloud}
        onManualSync={handleManualSync}
        onGoogleSignIn={async () => { await signInWithGoogle(); }}
        onTriggerEditorModeToggle={handleTriggerEditorModeToggle}
        dnsSpeedup={dnsSpeedup}
        setDnsSpeedup={(enabled) => {
          setDnsSpeedup(enabled);
          localStorage.setItem('casestacks_dns_speedup', enabled ? 'true' : 'false');
          triggerToast(enabled ? '⚡ Cloudflare Accelerator Activated!' : 'Cloudflare Accelerator Deactivated.', 'info');
        }}
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

      {/* Security Passcode Interceptor Modal */}
      <PasscodeModal
        isOpen={isPasscodeModalOpen}
        title={passcodeModalTitle}
        message={passcodeModalMessage}
        correctPasscode={curatorPasscode}
        isConfigured={curatorPasscodeConfigured}
        currentUser={currentUser}
        onChangePasscode={handleUpdatePasscode}
        onSuccess={passcodeSuccessCallback}
        onClose={() => setIsPasscodeModalOpen(false)}
      />

    </div>
  );
}
