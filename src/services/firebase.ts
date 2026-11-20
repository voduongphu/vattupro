import { initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  type Auth,
  type User as FirebaseUser,
  type UserCredential
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  type Firestore
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  DEFAULT_FIRESTORE_QUOTA_MESSAGE,
  isFirestoreQuotaExceededError,
  isFirestoreBillingOrPlanError,
  isFirestoreCloudRestrictedError,
  isTransientResourceExhaustedError,
  formatFirestoreQuotaMessage
} from '../utils/cloudSyncHelpers';

const app = initializeApp(firebaseConfig);

const PENDING_REDIRECT_LOGIN_KEY = 'vtp_pending_google_redirect_login_v1';

export function isLikelyMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
    navigator.userAgent || ''
  );
}

export function isInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function createFastFirestore(): Firestore {
  try {
    // Trên điện thoại di động / mạng 4G / proxy NAT, ép dùng Long-Polling ngay từ đầu giúp tránh treo 8-15 giây khi dò WebChannel;
    // trên máy tính vẫn giữ auto-detect để tối ưu độ trễ WebChannel.
    const settings = isLikelyMobileDevice()
      ? { experimentalForceLongPolling: true }
      : { experimentalAutoDetectLongPolling: true };
    return initializeFirestore(app, settings, firebaseConfig.firestoreDatabaseId);
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

export function markPendingGoogleRedirectLogin(forceLogoutOtherDevice = false): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      PENDING_REDIRECT_LOGIN_KEY,
      JSON.stringify({ at: Date.now(), forceLogoutOtherDevice })
    );
  } catch {
    // ignore
  }
}

export function consumePendingGoogleRedirectLogin(): { forceLogoutOtherDevice: boolean } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_REDIRECT_LOGIN_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PENDING_REDIRECT_LOGIN_KEY);
    const parsed = JSON.parse(raw) as { at?: number; forceLogoutOtherDevice?: boolean };
    if (!parsed?.at || Date.now() - parsed.at > 5 * 60 * 1000) {
      return null;
    }
    return { forceLogoutOtherDevice: Boolean(parsed.forceLogoutOtherDevice) };
  } catch {
    return null;
  }
}

export function hasPendingGoogleRedirectFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.sessionStorage.getItem(PENDING_REDIRECT_LOGIN_KEY));
  } catch {
    return false;
  }
}

let cachedRedirectResultPromise: Promise<UserCredential | null> | null = null;

export function consumeGoogleRedirectResult(): Promise<UserCredential | null> {
  if (typeof window === 'undefined' || isInIframe()) {
    return Promise.resolve(null);
  }
  if (!cachedRedirectResultPromise) {
    cachedRedirectResultPromise = getRedirectResult(auth, browserPopupRedirectResolver).catch(
      () => null
    );
  }
  return cachedRedirectResultPromise;
}

export function purgeStaleFirebasePendingKeys(): void {
  if (typeof window === 'undefined') return;
  if (hasPendingGoogleRedirectFlag()) return;
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

function buildGoogleAuthProvider(forceSelectAccount = true): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  if (forceSelectAccount) {
    provider.setCustomParameters({ prompt: 'select_account' });
  }
  return provider;
}

export function signInWithGooglePopup(forceSelectAccount = true) {
  purgeStaleFirebasePendingKeys();
  return signInWithPopup(auth, buildGoogleAuthProvider(forceSelectAccount), browserPopupRedirectResolver);
}

export async function signInWithGoogleRedirectFallback(
  forceSelectAccount = true,
  forceLogoutOtherDevice = false
): Promise<boolean> {
  if (typeof window === 'undefined' || isInIframe()) {
    return false;
  }
  markPendingGoogleRedirectLogin(forceLogoutOtherDevice);
  await signInWithRedirect(
    auth,
    buildGoogleAuthProvider(forceSelectAccount),
    browserPopupRedirectResolver
  );
  return true;
}

export async function signOutAndPurgeFirebaseAuth(): Promise<void> {
  try {
    window.sessionStorage?.removeItem(PENDING_REDIRECT_LOGIN_KEY);
  } catch {
    // ignore
  }
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

export const FIRESTORE_QUOTA_EXCEEDED_MESSAGE = DEFAULT_FIRESTORE_QUOTA_MESSAGE;

let quotaExceededListener: ((msg: string) => void) | null = null;
let firestoreCircuitOpenUntilMs = 0;
let firestoreQuotaExhausted = false;
let lastFirestoreQuotaMessage = FIRESTORE_QUOTA_EXCEEDED_MESSAGE;

export {
  isTransientResourceExhaustedError,
  isFirestoreBillingOrPlanError,
  isFirestoreCloudRestrictedError,
  formatFirestoreQuotaMessage
};

export function isQuotaExceededError(error: unknown): boolean {
  return isFirestoreCloudRestrictedError(error);
}

export function getLastFirestoreQuotaMessage(): string {
  return lastFirestoreQuotaMessage || FIRESTORE_QUOTA_EXCEEDED_MESSAGE;
}

export function isFirestoreCircuitOpen(): boolean {
  if (Date.now() >= firestoreCircuitOpenUntilMs) {
    firestoreQuotaExhausted = false;
    lastFirestoreQuotaMessage = FIRESTORE_QUOTA_EXCEEDED_MESSAGE;
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

export function notifyFirestoreQuotaExceeded(durationMs = 300_000, error?: unknown): string {
  const hadSpecificDetail =
    firestoreQuotaExhausted && lastFirestoreQuotaMessage !== FIRESTORE_QUOTA_EXCEEDED_MESSAGE;
  if (error !== undefined && isQuotaExceededError(error)) {
    lastFirestoreQuotaMessage = formatFirestoreQuotaMessage(error);
  } else if (!hadSpecificDetail) {
    lastFirestoreQuotaMessage = formatFirestoreQuotaMessage(error);
  }
  firestoreQuotaExhausted = true;
  markFirestoreTemporarilyUnavailable(durationMs);
  quotaExceededListener?.(lastFirestoreQuotaMessage);
  return lastFirestoreQuotaMessage;
}

export function clearFirestoreQuotaExhaustedFlag(): void {
  firestoreQuotaExhausted = false;
  firestoreCircuitOpenUntilMs = 0;
  lastFirestoreQuotaMessage = FIRESTORE_QUOTA_EXCEEDED_MESSAGE;
}

export function resetFirestoreCircuitForRetry(): void {
  firestoreQuotaExhausted = false;
  firestoreCircuitOpenUntilMs = 0;
  lastFirestoreQuotaMessage = FIRESTORE_QUOTA_EXCEEDED_MESSAGE;
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
    notifyFirestoreQuotaExceeded(300_000, error);
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
