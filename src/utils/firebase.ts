import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  User
} from 'firebase/auth';
import { 
  initializeFirestore,
  getFirestore,
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  orderBy, 
  serverTimestamp,
  getDocFromServer
} from 'firebase/firestore';
import { Category } from './db';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Resilient Firestore initialization
let dbInstance: any;
try {
  const dbId = firebaseConfig.firestoreDatabaseId;
  if (dbId && dbId !== '(default)') {
    dbInstance = initializeFirestore(app, {}, dbId);
  } else {
    dbInstance = getFirestore(app);
  }
} catch (error) {
  console.warn("Could not initialize targeted Firestore database with custom ID, falling back to default:", error);
  try {
    dbInstance = getFirestore(app);
  } catch (finalErr) {
    console.error("Firestore is completely unavailable in this client environment:", finalErr);
    dbInstance = null;
  }
}

export const db = dbInstance;
export const auth = getAuth();

// Provider initialization
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Sign-In Helper
export async function signInWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await saveUserProfile(result.user);
    return result.user;
  } catch (error) {
    console.error('Failed to log in via Google:', error);
    throw error;
  }
}

// Sign-Out Helper
export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

// --- SECURE ERROR HANDLERS ---
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
          })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- CLOUD SYNC OPERATIONS ---

/**
 * Saves or merges the user profile metadata inside Firestore.
 */
export async function saveUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  try {
    const docRef = doc(db, 'users', user.uid);
    await setDoc(docRef, {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error('Gracefully handled user profile sync error:', error);
  }
}

/**
 * Loads all Categories belonging to an authenticated user sorted by creation time.
 */
export async function loadUserCategoriesFromFirestore(userId: string): Promise<Category[]> {
  const path = `users/${userId}/categories`;
  try {
    const q = query(
      collection(db, 'users', userId, 'categories'),
      orderBy('createdAt', 'asc')
    );
    const snap = await getDocs(q);
    const categories: Category[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const createdAt = data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().toISOString() : data.createdAt) : null;
      const updatedAt = data.updatedAt ? (typeof data.updatedAt.toDate === 'function' ? data.updatedAt.toDate().toISOString() : data.updatedAt) : null;
      categories.push({
        id: data.id,
        name: data.name,
        cases: (data.cases || []).map((cs: any) => ({
          title: cs.title,
          url: cs.url,
          subcategory: cs.subcategory || undefined
        })),
        subcategories: data.subcategories || [],
        createdAt,
        updatedAt
      });
    });
    return categories;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Saves a single Category and its child Cases into Firestore.
 */
export async function saveCategoryToFirestore(userId: string, category: Category): Promise<void> {
  if (!userId) return;
  const categoryId = category.id || doc(collection(db, 'temp')).id;
  const path = `users/${userId}/categories/${categoryId}`;
  try {
    const docRef = doc(db, 'users', userId, 'categories', categoryId);
    
    // Check if the input already had an existing Firestore timestamp, otherwise set serverTimestamp
    let hasCreatedAt: any = null;
    if (category.createdAt) {
      if (typeof category.createdAt === 'string') {
        hasCreatedAt = new Date(category.createdAt);
      } else if (category.createdAt.seconds != null) {
        hasCreatedAt = new Date(category.createdAt.seconds * 1000);
      } else if (category.createdAt instanceof Date) {
        hasCreatedAt = category.createdAt;
      }
    }
    
    await setDoc(docRef, {
      id: categoryId,
      userId: userId,
      name: category.name,
      subcategories: category.subcategories || [],
      cases: category.cases.map(cs => ({
        title: cs.title,
        url: cs.url,
        subcategory: cs.subcategory || null
      })),
      createdAt: hasCreatedAt || serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Deletes a single Category from Firestore.
 */
export async function deleteCategoryFromFirestore(userId: string, categoryId: string): Promise<void> {
  if (!userId || !categoryId) return;
  const path = `users/${userId}/categories/${categoryId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'categories', categoryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Iteratively uploads all local offline categories to Firestore.
 */
export async function syncAllLocalToFirestore(userId: string, categories: Category[]): Promise<void> {
  if (!userId || categories.length === 0) return;
  for (const cat of categories) {
    // Generate an ID for categories that lack one to ensure clean syncing
    if (!cat.id) {
      cat.id = doc(collection(db, 'temp')).id;
    }
    await saveCategoryToFirestore(userId, cat);
  }
}

// --- FIREBASE VALIDATION AND TEST CONNECTION ---
export async function testConnection(): Promise<void> {
  if (!db) {
    console.warn("Firestore is disabled or uninitialized. Skipping test connection.");
    return;
  }
  try {
    const testDoc = doc(db, 'test', 'connection');
    await getDocFromServer(testDoc);
  } catch (error: any) {
    console.warn("Firestore connection check quietly bypassed or handled:", error);
  }
}

testConnection().catch(err => {
  console.warn("Unhandled error in testConnection promise chain:", err);
});
