/**
 * High-performance, robust client-side storage module.
 * Primary: IndexedDB (saves all state under the key 'main' in 'radiopaedia-db').
 * Fallback: localStorage (if IndexedDB is disabled or sandboxed in the preview iframe).
 */

const DB_NAME = 'radiopaedia-db';
const STORE_NAME = 'state-store';
const RECORD_KEY = 'main';

export interface Case {
  id?: string; // Client-side tracking if helpful
  title: string;
  url: string;
  subcategory?: string; // Optional name of subcategory (e.g., 'Knee', 'Shoulder')
}

export interface Category {
  id?: string;
  name: string;
  cases: Case[];
  subcategories?: string[]; // Optional array of names (e.g., ['Knee', 'Shoulder'])
}

export interface AppState {
  categories: Category[];
}

/**
 * Safely normalizes the AppState data structure for backwards compatibility.
 */
export function sanitizeState(raw: any): AppState {
  if (!raw || typeof raw !== 'object') {
    return { categories: [] };
  }
  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  const cleanCategories: Category[] = categories.map((cat: any) => {
    const cases = Array.isArray(cat.cases) ? cat.cases : [];
    const subcats = Array.isArray(cat.subcategories) ? cat.subcategories : [];
    
    // Auto-accumulate subcategories that already exist in case items or are pre-declared
    const uniqueSubcatsSet = new Set<string>();
    subcats.forEach((s: any) => {
      if (typeof s === 'string' && s.trim()) {
        uniqueSubcatsSet.add(s.trim());
      }
    });
    
    const cleanCases: Case[] = cases.map((c: any) => {
      const sub = typeof c.subcategory === 'string' && c.subcategory.trim() ? c.subcategory.trim() : undefined;
      if (sub) {
        uniqueSubcatsSet.add(sub);
      }
      return {
        title: typeof c.title === 'string' ? c.title.trim() : 'Unnamed Case',
        url: typeof c.url === 'string' ? c.url.trim() : '',
        subcategory: sub,
      };
    }).filter(c => c.title);

    return {
      name: typeof cat.name === 'string' ? cat.name.trim() : 'Unnamed Category',
      cases: cleanCases,
      subcategories: Array.from(uniqueSubcatsSet),
    };
  });

  return { categories: cleanCategories };
}

// Fallback detection
let isIndexedDBSupported = false;
try {
  isIndexedDBSupported = 'indexedDB' in window && window.indexedDB !== null;
} catch (e) {
  isIndexedDBSupported = false;
}

/**
 * Initializes the IndexedDB database.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBSupported) {
      reject(new Error('IndexedDB is not supported or is blocked in this environment.'));
      return;
    }

    try {
      const request = window.indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (err) => {
        reject(err);
      };
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Loads data from IndexedDB or the localStorage fallback.
 */
export async function loadState(): Promise<AppState | null> {
  // Try IndexedDB first
  if (isIndexedDBSupported) {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(RECORD_KEY);

        request.onsuccess = () => {
          const result = request.result;
          db.close();
          if (result) {
            resolve(sanitizeState(result));
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          db.close();
          resolve(loadStateFromLocalStorage());
        };
      });
    } catch (error) {
      console.warn('IndexedDB failed to load, falling back to localStorage:', error);
      return loadStateFromLocalStorage();
    }
  }

  return loadStateFromLocalStorage();
}

/**
 * Saves data to IndexedDB or the localStorage fallback.
 */
export async function saveState(state: AppState): Promise<void> {
  // Always save to localStorage as a redundant real-time backup,
  // making app switches and iframe sandboxing extremely resilient.
  saveStateToLocalStorage(state);

  if (isIndexedDBSupported) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(state, RECORD_KEY);

        request.onsuccess = () => {
          db.close();
          resolve();
        };

        request.onerror = (err) => {
          db.close();
          reject(err);
        };
      });
    } catch (error) {
      console.warn('IndexedDB write failed:', error);
    }
  }
}

// Low-level LocalStorage helpers
function loadStateFromLocalStorage(): AppState | null {
  try {
    const raw = localStorage.getItem(`radiopaedia_${RECORD_KEY}`);
    if (raw) {
      return sanitizeState(JSON.parse(raw));
    }
  } catch (e) {
    console.error('Error parsing data from localStorage:', e);
  }
  return null;
}

function saveStateToLocalStorage(state: AppState): void {
  try {
    localStorage.setItem(`radiopaedia_${RECORD_KEY}`, JSON.stringify(state));
  } catch (e) {
    console.error('Error writing data to localStorage:', e);
  }
}
