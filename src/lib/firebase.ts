import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported, type Analytics } from 'firebase/analytics';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import firebaseAppletConfig from '../../firebase-applet-config.json';

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAEGjQmQ6M9E9iG5IX468_U86xLQJkGXid8',
  authDomain: 'jerseyvalley-bd.firebaseapp.com',
  projectId: 'jerseyvalley-bd',
  storageBucket: 'jerseyvalley-bd.firebasestorage.app',
  messagingSenderId: '591799865718',
  appId: '1:591799865718:web:fd6a5f1757ea6453beea57',
  measurementId: 'G-8062XMJBFJ',
  firestoreDatabaseId: '(default)'
} as const;

const clientEnv =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

export const resolvedFirebaseConfig = {
  apiKey:
    (clientEnv.VITE_FIREBASE_API_KEY || '').trim() ||
    firebaseAppletConfig.apiKey ||
    DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain:
    (clientEnv.VITE_FIREBASE_AUTH_DOMAIN || '').trim() ||
    firebaseAppletConfig.authDomain ||
    DEFAULT_FIREBASE_CONFIG.authDomain,
  projectId:
    (clientEnv.VITE_FIREBASE_PROJECT_ID || '').trim() ||
    firebaseAppletConfig.projectId ||
    DEFAULT_FIREBASE_CONFIG.projectId,
  storageBucket:
    (clientEnv.VITE_FIREBASE_STORAGE_BUCKET || '').trim() ||
    firebaseAppletConfig.storageBucket ||
    DEFAULT_FIREBASE_CONFIG.storageBucket,
  messagingSenderId:
    (clientEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim() ||
    firebaseAppletConfig.messagingSenderId ||
    DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId:
    (clientEnv.VITE_FIREBASE_APP_ID || '').trim() ||
    firebaseAppletConfig.appId ||
    DEFAULT_FIREBASE_CONFIG.appId,
  measurementId:
    (clientEnv.VITE_FIREBASE_MEASUREMENT_ID || '').trim() ||
    firebaseAppletConfig.measurementId ||
    DEFAULT_FIREBASE_CONFIG.measurementId,
  firestoreDatabaseId:
    (clientEnv.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '').trim() ||
    (clientEnv.VITE_FIREBASE_DATABASE_ID || '').trim() ||
    firebaseAppletConfig.firestoreDatabaseId ||
    DEFAULT_FIREBASE_CONFIG.firestoreDatabaseId
};

// Initialize Firebase Web SDK singleton once
export const app: FirebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(resolvedFirebaseConfig);

export const db =
  resolvedFirebaseConfig.firestoreDatabaseId &&
  resolvedFirebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, resolvedFirebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

let analyticsInstance: Analytics | null = null;
let analyticsInitPromise: Promise<Analytics | null> | null = null;

/**
 * Safely initializes Firebase Analytics only in supported browser environments.
 * Returns null in Node.js, SSR, automated test runners, or browsers with blocked cookies/storage.
 */
export function initFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === 'undefined' || !resolvedFirebaseConfig.measurementId) {
    return Promise.resolve(null);
  }
  if (analyticsInstance) {
    return Promise.resolve(analyticsInstance);
  }
  if (!analyticsInitPromise) {
    analyticsInitPromise = isAnalyticsSupported()
      .then((supported) => {
        if (!supported) {
          return null;
        }
        analyticsInstance = getAnalytics(app);
        return analyticsInstance;
      })
      .catch(() => null);
  }
  return analyticsInitPromise;
}

export const analyticsPromise: Promise<Analytics | null> =
  typeof window !== 'undefined'
    ? new Promise((resolve) => {
        const schedule =
          'requestIdleCallback' in window
            ? (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback
            : (cb: () => void) => setTimeout(cb, 1200);
        schedule(() => {
          initFirebaseAnalytics().then(resolve).catch(() => resolve(null));
        });
      })
    : Promise.resolve(null);

/**
 * Uploads a product image file to Firebase Storage under `products/{productId}/`
 * and returns the public download URL.
 */
export async function uploadProductImageToStorage(
  productId: string,
  file: File
): Promise<string> {
  const safeProductId = productId.replace(/[^a-zA-Z0-9_-]/g, '') || 'draft';
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
  const objectPath = `products/${safeProductId}/${Date.now()}-${safeName}`;
  const fileRef = storageRef(storage, objectPath);
  const snapshot = await uploadBytes(fileRef, file, {
    contentType: file.type || 'image/jpeg'
  });
  return getDownloadURL(snapshot.ref);
}

/**
 * Deletes an uploaded product image from Firebase Storage if it belongs to this project's bucket.
 */
export async function deleteProductImageFromStorage(imageUrl: string): Promise<void> {
  if (!imageUrl || !imageUrl.includes('firebasestorage.googleapis.com')) {
    return;
  }
  const fileRef = storageRef(storage, imageUrl);
  await deleteObject(fileRef);
}

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

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
