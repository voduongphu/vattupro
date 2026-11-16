import { initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  type Auth,
  type User as FirebaseUser
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  type Firestore
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

function createFastFirestore(): Firestore {
  try {
    // Tự động phát hiện và chuyển sang Long-Polling ngay khi mạng/proxy chặn WebChannel (tránh treo 10-15 giây khi đăng nhập)
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

/* CRITICAL: Connect explicitly to the provisioned named Firestore database */
export const db = createFastFirestore();

function createResilientAuth(): Auth {
  if (typeof window === 'undefined') {
    return getAuth(app);
  }
  try {
    return initializeAuth(app, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
        inMemoryPersistence
      ],
      popupRedirectResolver: browserPopupRedirectResolver
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = createResilientAuth();

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function purgeStaleFirebasePendingKeys(): void {
  if (typeof window === 'undefined') return;
  const storages: Storage[] = [];
  try {
    storages.push(window.sessionStorage);
  } catch {
    // ignore
  }
  try {
    storages.push(window.localStorage);
  } catch {
    // ignore
  }
  for (const store of storages) {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (
          k &&
          (k.startsWith('firebase:pendingRedirect:') ||
            k.startsWith('firebase:redirectUser:') ||
            k.startsWith('firebase:previous_websocket_failure'))
        ) {
          toRemove.push(k);
        }
      }
      for (const k of toRemove) {
        store.removeItem(k);
      }
    } catch {
      // ignore storage access error
    }
  }
}

export function signInWithGooglePopup(forceSelectAccount = true) {
  purgeStaleFirebasePendingKeys();
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  if (forceSelectAccount) {
    provider.setCustomParameters({ prompt: 'select_account' });
  }
  return signInWithPopup(auth, provider, browserPopupRedirectResolver);
}

export async function signOutAndPurgeFirebaseAuth(): Promise<void> {
  try {
    await signOut(auth);
  } catch {
    // ignore signOut error
  }
  if (typeof window === 'undefined') return;
  const storages: Storage[] = [];
  try {
    storages.push(window.sessionStorage);
  } catch {
    // ignore
  }
  try {
    storages.push(window.localStorage);
  } catch {
    // ignore
  }
  for (const store of storages) {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith('firebase:')) {
          toRemove.push(k);
        }
      }
      for (const k of toRemove) {
        store.removeItem(k);
      }
    } catch {
      // ignore storage access error
    }
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
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

export const FIRESTORE_QUOTA_EXCEEDED_MESSAGE =
  'Hết hạn mức Cloud Firestore trong ngày (Spark Plan). Hệ thống đang tạm sử dụng lưu trữ cục bộ & máy chủ nội bộ; hạn mức sẽ tự đặt lại vào ngày hôm sau.';

let quotaExceededListener: ((msg: string) => void) | null = null;
let firestoreCircuitOpenUntilMs = 0;
let firestoreQuotaExhausted = false;

export function isQuotaExceededError(error: unknown): boolean {
  const code = String((error as any)?.code || '').toLowerCase();
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  return (
    code === 'resource-exhausted' ||
    code.includes('resource-exhausted') ||
    rawMessage.includes('Quota limit exceeded') ||
    rawMessage.includes('Quota exceeded') ||
    rawMessage.includes('resource-exhausted')
  );
}

export function isFirestoreCircuitOpen(): boolean {
  if (Date.now() >= firestoreCircuitOpenUntilMs) {
    firestoreQuotaExhausted = false;
    return false;
  }
  return true;
}

export function isFirestoreQuotaExhausted(): boolean {
  return firestoreQuotaExhausted && isFirestoreCircuitOpen();
}

export function markFirestoreTemporarilyUnavailable(durationMs = 120_000): void {
  firestoreCircuitOpenUntilMs = Math.max(firestoreCircuitOpenUntilMs, Date.now() + durationMs);
}

export function notifyFirestoreQuotaExceeded(durationMs = 300_000): string {
  firestoreQuotaExhausted = true;
  markFirestoreTemporarilyUnavailable(durationMs);
  quotaExceededListener?.(FIRESTORE_QUOTA_EXCEEDED_MESSAGE);
  return FIRESTORE_QUOTA_EXCEEDED_MESSAGE;
}

export function clearFirestoreQuotaExhaustedFlag(): void {
  firestoreQuotaExhausted = false;
  firestoreCircuitOpenUntilMs = 0;
}

export function resetFirestoreCircuitForRetry(): void {
  firestoreQuotaExhausted = false;
  firestoreCircuitOpenUntilMs = 0;
}

export function onFirestoreQuotaError(cb: (msg: string) => void): () => void {
  quotaExceededListener = cb;
  return () => {
    if (quotaExceededListener === cb) {
      quotaExceededListener = null;
    }
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const rawMessage = error instanceof Error ? error.message : String(error);

  if (isQuotaExceededError(error)) {
    notifyFirestoreQuotaExceeded(300_000);
  }

  const errInfo: FirestoreErrorInfo = {
    error: rawMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export { signInWithPopup, signOut, onAuthStateChanged, firebaseConfig };
export type { FirebaseUser };
