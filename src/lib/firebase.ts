import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const clientEnv =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

export const resolvedFirebaseConfig = {
  projectId: clientEnv.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  appId: clientEnv.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
  apiKey: clientEnv.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
  authDomain: clientEnv.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  firestoreDatabaseId:
    clientEnv.VITE_FIREBASE_FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId,
  storageBucket: clientEnv.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
  messagingSenderId:
    clientEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
  measurementId:
    clientEnv.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfig.measurementId || '',
  oAuthClientId:
    clientEnv.VITE_FIREBASE_OAUTH_CLIENT_ID || firebaseConfig.oAuthClientId || '',
  recaptchaSiteKey:
    clientEnv.VITE_FIREBASE_RECAPTCHA_SITE_KEY || firebaseConfig.recaptchaSiteKey || ''
};

const app = initializeApp(resolvedFirebaseConfig);
export const db = getFirestore(app, resolvedFirebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

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

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();
