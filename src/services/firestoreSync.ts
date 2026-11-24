import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  runTransaction,
  onSnapshot,
  serverTimestamp,
  type DocumentReference,
  type Unsubscribe
} from 'firebase/firestore';
import {
  db,
  auth,
  signInWithGooglePopup,
  signInWithGoogleRedirectFallback,
  consumeGoogleRedirectResult,
  consumePendingGoogleRedirectLogin,
  isInIframe,
  signOutAndPurgeFirebaseAuth,
  signOut,
  onAuthStateChanged,
  handleFirestoreError,
  onFirestoreQuotaError,
  isFirestoreCircuitOpen,
  isFirestoreQuotaExhausted,
  isQuotaExceededError,
  isFirestoreBillingOrPlanError,
  notifyFirestoreQuotaExceeded,
  clearFirestoreQuotaExhaustedFlag,
  resetFirestoreCircuitForRetry,
  getLastFirestoreQuotaMessage,
  OperationType,
  isLikelyMobileDevice,
  hasPendingGoogleRedirectFlag,
  type FirebaseUser
} from './firebase';
import { StorageService } from './storage';
import type {
  User,
  Warehouse,
  MaterialItem,
  InboundReceipt,
  InboundItemDetail,
  OutboundReceipt,
  OutboundItemDetail,
  TombstoneMap,
  ActiveUserSession,
  OsdReceipt,
  OsdItemDetail,
  OsdPdfAttachment
} from '../types/inventory';
import {
  normKey,
  normUserKey,
  computeEmailAuthDigest,
  resolveGoogleUserRecord,
  findMatchingUser,
  isPasswordMatch,
  isSessionHeartbeatFresh,
  createEmptyTombstones,
  isRecordDeleted,
  computeMaterialsDigest,
  computeInboundReceiptDigest,
  computeOutboundReceiptDigest,
  computePackingListSummary,
  sumInboundItems,
  sumOutboundItems,
  roundQty,
  canonicalUserSessionKey,
  computeOsdDigest,
  normalizeAllowedWarehouseIds
} from '../utils/additiveMerge';
import {
  computeUsersDomainDigest,
  computeWarehousesDomainDigest,
  computeTombstonesDomainDigest,
  computeOsdDomainDigest,
  computeInboundDomainDigest,
  computeOutboundDomainDigest,
  computeReceiptDomainDigestFromIndexEntries,
  encodeMetaDigestV2,
  parseMetaDigestV2,
  computeItemsChunkDigest,
  computeRecordDigest,
  buildStableReceiptIndexChunks,
  diffChunkDigests,
  computeDomainSyncPlan,
  createEmptyPendingOutbox,
  sanitizePendingOutbox,
  mergePendingOutboxMutation,
  clearPendingOutboxDomains,
  hasAnyPendingOutbox,
  hasRemoteManifestChanged,
  computeLoginMetaPullFlags,
  resolveManifestTransactionUpdate,
  resolveConvergedCheckpointDigests,
  withAsyncTimeout,
  isLocalTimeoutError,
  extractCountFromDigestPart,
  getAdaptiveCloudFetchConfig,
  getAdaptiveBatchWriteConfig,
  isRetryableCloudReadError,
  retryAsyncWithBackoff,
  runWithConcurrencyLimit,
  estimateUtf8ByteLength,
  estimateFirestoreValueBytes,
  estimateStagedWritePayloadBytes,
  deduplicateStagedWritesByPath,
  partitionStagedWritesIntoBatches,
  chunkItemsByCountAndBytes,
  isPayloadSizeExceededError,
  CLOUD_SYNC_HARD_TIMEOUT_MS,
  SyncAbortedError,
  isSyncAbortedError,
  createSyncDeadline,
  getEffectiveStepTimeoutMs,
  classifyCloudPauseReason,
  formatCloudPauseNotice,
  shouldPauseCloudOnFailure,
  shouldSkipAutoCloudActivity,
  readManualCloudPauseFlag,
  writeManualCloudPauseFlag,
  formatManualCloudPauseNotice,
  createSyncTransferTracker,
  type SyncTransferProgress,
  type SyncDeadlineController,
  type CloudPendingOutbox,
  type TouchedManifestDomains,
  type ManifestSnapshotLike,
  type DomainSyncPlan
} from '../utils/cloudSyncHelpers';

export type CloudConnectionStatus =
  | 'initializing'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'paused'
  | 'error';

export interface CloudSyncSnapshotState {
  authReady: boolean;
  status: CloudConnectionStatus;
  cloudEmail: string | null;
  cloudDisplayName: string | null;
  cloudUid: string | null;
  lastSyncedAt: number | null;
  errorMessage: string | null;
  quotaExceeded: boolean;
  connectionPaused: boolean;
  manualPaused: boolean;
  pauseReason: string | null;
  pausedAt: number | null;
}

interface CloudReceiptIndexEntry {
  docId: string;
  code: string;
  id: string;
  itemCount: number;
  chunkCount: number;
  appUpdatedAt: number;
  itemsReplacedAt: number;
  digest: string;
}

interface WorkspaceManifestDoc {
  workspaceId: string;
  name: string;
  ownerUid: string;
  updatedByUid: string;
  status: 'active' | 'archived';
  allowSelfJoin: boolean;
  serverRevision: number;
  metaRevision: number;
  materialsRevision: number;
  materialsCount: number;
  materialsChunkCount: number;
  materialsDigest: string;
  metaDigest: string;
  accountChunkCount: number;
  warehouseChunkCount: number;
  tombstoneChunkCount: number;
  inboundIndexChunkCount: number;
  outboundIndexChunkCount: number;
}

const WORKSPACE_ID = 'vtp_main';
const WORKSPACE_NAME = 'Hệ Thống Quản Lý Nhập Xuất Tồn Vật Tư';
const BOOTSTRAPPED_ADMIN_EMAIL = 'voduongphu@gmail.com';
const CLOUD_CHUNK_SIZE = 200;
// Giới hạn an toàn ~350 KB/tài liệu để vừa nằm rất xa trần 1 MiB của Firestore vừa tải lên nhanh trên đường truyền thông thường
const DOC_PAYLOAD_BYTE_LIMIT = 350_000;
// Chia đợt ghi phiếu lớn thành từng sóng 20 phiếu để chốt chỉ mục & checkpoint liên tục, đảm bảo tiếp tục được ngay nếu mạng chập chờn
const RECEIPT_PUSH_WAVE_SIZE = 20;
const ACTIVE_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 giờ bảo vệ toàn vẹn phiên

const KNOWN_CLOUD_PATHS_KEY = `vtp_known_cloud_paths_v1_${WORKSPACE_ID}`;
const MAX_PERSISTED_KNOWN_PATHS = 8000;
const knownExistingPaths = new Set<string>();
let knownExistingPathsUid: string | null = null;
const stateListeners = new Set<(state: CloudSyncSnapshotState) => void>();

const initialManualCloudPaused = readManualCloudPauseFlag();
const initialManualPauseNotice = initialManualCloudPaused ? formatManualCloudPauseNotice() : null;

let currentState: CloudSyncSnapshotState = {
  authReady: false,
  status: 'initializing',
  cloudEmail: null,
  cloudDisplayName: null,
  cloudUid: null,
  lastSyncedAt: null,
  errorMessage: null,
  quotaExceeded: false,
  connectionPaused: initialManualCloudPaused,
  manualPaused: initialManualCloudPaused,
  pauseReason: initialManualPauseNotice,
  pausedAt: initialManualCloudPaused ? Date.now() : null
};

let workspaceUnsub: Unsubscribe | null = null;
let sessionUnsub: Unsubscribe | null = null;
let osdUnsub: Unsubscribe | null = null;
let watchedSessionDocId: string | null = null;
let workspaceReadyPromise: Promise<boolean> | null = null;
let workspaceReadyUid: string | null = null;
let verifiedWorkspaceUid: string | null = null;
let cachedWsManifest: { data: WorkspaceManifestDoc; atMs: number } | null = null;
let interactiveAuthInFlight = false;
let deferredRemoteChangeDuringAuth = false;
let activeInteractiveAuthAttemptId = 0;

let cloudConnectionPaused = initialManualCloudPaused;
let manualSyncPaused = initialManualCloudPaused;
let cloudPauseReason: string | null = initialManualPauseNotice;
let cloudControlEpoch = 0;
let activeCloudWatchdog: SyncDeadlineController | null = null;
let consecutiveCloudFailures = 0;
const cloudTransferTracker = createSyncTransferTracker({ throttleMs: 80 });

function getCloudFetchConfig() {
  return getAdaptiveCloudFetchConfig(isLikelyMobileDevice());
}

function throwIfActiveSyncAborted(): void {
  if (cloudConnectionPaused) {
    throw new SyncAbortedError(
      cloudPauseReason || currentState.errorMessage || 'Đã tạm dừng kết nối Cloud.',
      { reason: cloudPauseReason || undefined }
    );
  }
  activeCloudWatchdog?.throwIfAborted();
}

function getDeadlineStepTimeout(requestedMs: number): number {
  throwIfActiveSyncAborted();
  if (!activeCloudWatchdog) return requestedMs;
  return getEffectiveStepTimeoutMs(requestedMs, activeCloudWatchdog.remainingMs());
}

function getSyncAbortOptions(): {
  isAborted: () => boolean;
  getAbortError: () => Error;
  getRemainingMs: () => number;
  onAbort?: (cb: () => void) => () => void;
} {
  const watchdog = activeCloudWatchdog;
  return {
    isAborted: () => cloudConnectionPaused || Boolean(watchdog?.isAborted()),
    getAbortError: () => {
      if (watchdog?.didTimeOut()) {
        const msg =
          watchdog.getAbortReason() ||
          'Quá thời gian chờ kết nối máy chủ Cloud (> 2 phút) do mạng phản hồi chậm hoặc không thể liên hệ máy chủ Cloud';
        return new SyncAbortedError(msg, { reason: msg, timedOut: true });
      }
      const msg =
        cloudPauseReason ||
        watchdog?.getAbortReason() ||
        'Đã tạm dừng kết nối Cloud.';
      return new SyncAbortedError(msg, { reason: msg });
    },
    getRemainingMs: () =>
      watchdog ? watchdog.remainingMs() : Number.POSITIVE_INFINITY,
    onAbort: watchdog ? (cb: () => void) => watchdog.onAbort(cb) : undefined
  };
}
let adminPiiLoadedForMetaRev = -1;
let lastAppliedCloudServerRev = -1;
let lastAppliedCloudMetaRev = -1;
let lastAppliedCloudMetaDigest = '';
let lastAppliedCloudMaterialsDigest = '';
let latestObservedRemoteServerRev = -1;
let latestObservedRemoteMetaDigest = '';
let latestObservedRemoteMaterialsDigest = '';
let latestObservedRemoteUpdatedAtMs = 0;
let isCloudReconciling = false;
let pendingCloudReconcile = false;
let pendingForceManifestRefresh = false;
let currentLocalMutationSeq = 0;
let passStartedLocalMutationSeq = 0;
let activePassServerRev = -1;
let activePassMetaDigest = '';
let activePassMaterialsDigest = '';
const activeWorkDetectedCallbacks = new Set<() => void>();
let reconcileInFlightPromise: Promise<{
  ok: boolean;
  pulledChanges: boolean;
  pushedChanges?: boolean;
  quotaExceeded?: boolean;
  paused?: boolean;
  errorMessage?: string;
}> | null = null;
let isPushingOsd = false;
let pendingOsdPush = false;
let cloudMetaDirty = false;
let cloudMetaUsersDirty = false;
let cloudMetaWarehousesDirty = false;
let cloudMetaTombstonesDirty = false;
let cloudOsdDirty = false;
let cloudMaterialsDirty = false;
let cloudInboundDirty = false;
let cloudOutboundDirty = false;
const dirtyUserIds = new Set<string>();
const dirtyWarehouseIds = new Set<string>();
const dirtyMaterialCodes = new Set<string>();
const dirtyInboundCodes = new Set<string>();
const dirtyOutboundCodes = new Set<string>();
let lastSyncedOsdDigest = '';
const syncedAttachmentSignatures = new Set<string>();

interface ReceiptIndexCache {
  uid: string;
  domainDigest: string;
  chunkCount: number;
  entries: Map<string, CloudReceiptIndexEntry>;
  chunkIndexByCode: Map<string, number>;
}

let cloudInboundIndexCache: ReceiptIndexCache | null = null;
let cloudOutboundIndexCache: ReceiptIndexCache | null = null;
let ramChunkDigests: Record<string, string> = {};
let ramChunkDigestsUid: string | null = null;

interface CloudSyncCheckpoint {
  uid: string;
  serverRevision: number;
  metaRevision: number;
  metaDigest: string;
  materialsDigest: string;
  remoteMetaDigest?: string;
  remoteMaterialsDigest?: string;
  inboundDigest: string;
  outboundDigest: string;
  osdDigest: string;
  inboundCount: number;
  outboundCount: number;
  materialsCount: number;
  inboundTombCount?: number;
  outboundTombCount?: number;
  chunkDigests?: Record<string, string>;
}

const CLOUD_CHECKPOINT_KEY = `vtp_cloud_sync_checkpoint_v1_${WORKSPACE_ID}`;
const PENDING_OUTBOX_KEY = `vtp_cloud_pending_outbox_v1_${WORKSPACE_ID}`;

function readPendingOutbox(): CloudPendingOutbox {
  if (typeof window === 'undefined') return createEmptyPendingOutbox();
  try {
    const raw = window.localStorage.getItem(PENDING_OUTBOX_KEY);
    if (!raw) return createEmptyPendingOutbox();
    return sanitizePendingOutbox(JSON.parse(raw));
  } catch {
    return createEmptyPendingOutbox();
  }
}

function writePendingOutbox(outbox: CloudPendingOutbox): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PENDING_OUTBOX_KEY, JSON.stringify(outbox));
  } catch {
    // ignore storage quota errors
  }
}

function hydrateOutboxIntoRamFlags(): CloudPendingOutbox {
  const outbox = readPendingOutbox();
  if (outbox.users) cloudMetaUsersDirty = true;
  if (outbox.warehouses) cloudMetaWarehousesDirty = true;
  if (outbox.tombstones) cloudMetaTombstonesDirty = true;
  cloudMetaDirty = cloudMetaUsersDirty || cloudMetaWarehousesDirty || cloudMetaTombstonesDirty;
  if (outbox.osd) cloudOsdDirty = true;
  if (outbox.materials) cloudMaterialsDirty = true;
  if (outbox.inbound) cloudInboundDirty = true;
  if (outbox.outbound) cloudOutboundDirty = true;
  for (const id of outbox.userIds) dirtyUserIds.add(id);
  for (const id of outbox.warehouseIds) dirtyWarehouseIds.add(id);
  for (const code of outbox.materialCodes) dirtyMaterialCodes.add(code);
  for (const code of outbox.inboundCodes) dirtyInboundCodes.add(code);
  for (const code of outbox.outboundCodes) dirtyOutboundCodes.add(code);
  return outbox;
}

function clearSyncedOutboxDomains(
  cleared: Partial<Record<'users' | 'warehouses' | 'tombstones' | 'osd' | 'materials' | 'inbound' | 'outbound', boolean>>
): void {
  if (cleared.users) {
    cloudMetaUsersDirty = false;
    dirtyUserIds.clear();
  }
  if (cleared.warehouses) {
    cloudMetaWarehousesDirty = false;
    dirtyWarehouseIds.clear();
  }
  if (cleared.tombstones) {
    cloudMetaTombstonesDirty = false;
  }
  cloudMetaDirty = cloudMetaUsersDirty || cloudMetaWarehousesDirty || cloudMetaTombstonesDirty;
  if (cleared.osd) {
    cloudOsdDirty = false;
  }
  if (cleared.materials) {
    cloudMaterialsDirty = false;
    dirtyMaterialCodes.clear();
  }
  if (cleared.inbound) {
    cloudInboundDirty = false;
    dirtyInboundCodes.clear();
  }
  if (cleared.outbound) {
    cloudOutboundDirty = false;
    dirtyOutboundCodes.clear();
  }
  const next = clearPendingOutboxDomains(readPendingOutbox(), cleared);
  writePendingOutbox(next);
}

hydrateOutboxIntoRamFlags();

function readCloudSyncCheckpoint(uid?: string | null): CloudSyncCheckpoint | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const raw = window.localStorage.getItem(CLOUD_CHECKPOINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CloudSyncCheckpoint;
    if (!parsed || parsed.uid !== uid) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCloudSyncCheckpoint(cp: CloudSyncCheckpoint): void {
  if (typeof window === 'undefined' || !cp.uid) return;
  try {
    window.localStorage.setItem(CLOUD_CHECKPOINT_KEY, JSON.stringify(cp));
  } catch {
    // ignore storage quota errors
  }
}

function clearCloudSyncCheckpoint(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CLOUD_CHECKPOINT_KEY);
    window.localStorage.removeItem(KNOWN_CLOUD_PATHS_KEY);
  } catch {
    // ignore
  }
}

function loadKnownExistingPaths(uid?: string | null): void {
  if (typeof window === 'undefined' || !uid) return;
  if (knownExistingPathsUid === uid) return;
  knownExistingPaths.clear();
  knownExistingPathsUid = uid;
  try {
    const raw = window.localStorage.getItem(KNOWN_CLOUD_PATHS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { uid?: string; paths?: string[] };
    if (parsed && parsed.uid === uid && Array.isArray(parsed.paths)) {
      const start = Math.max(0, parsed.paths.length - MAX_PERSISTED_KNOWN_PATHS);
      for (let i = start; i < parsed.paths.length; i++) {
        const p = parsed.paths[i];
        if (typeof p === 'string' && p) {
          knownExistingPaths.add(p);
        }
      }
    }
  } catch {
    // ignore
  }
}

function persistKnownExistingPaths(uid?: string | null): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    let arr = Array.from(knownExistingPaths);
    if (arr.length > MAX_PERSISTED_KNOWN_PATHS) {
      arr = arr.slice(arr.length - MAX_PERSISTED_KNOWN_PATHS);
      knownExistingPaths.clear();
      for (const p of arr) knownExistingPaths.add(p);
    }
    window.localStorage.setItem(KNOWN_CLOUD_PATHS_KEY, JSON.stringify({ uid, paths: arr }));
  } catch {
    // ignore storage quota errors
  }
}

function hydrateRamStateFromCheckpoint(uid?: string | null): CloudSyncCheckpoint | null {
  hydrateOutboxIntoRamFlags();
  if (!uid) return null;
  loadKnownExistingPaths(uid);
  const cp = readCloudSyncCheckpoint(uid);
  if (!cp) {
    if (ramChunkDigestsUid !== uid) {
      ramChunkDigests = {};
      ramChunkDigestsUid = uid;
    }
    return null;
  }
  if (lastAppliedCloudServerRev < 0 && typeof cp.serverRevision === 'number') {
    lastAppliedCloudServerRev = cp.serverRevision;
  }
  if (lastAppliedCloudMetaRev < 0 && typeof cp.metaRevision === 'number') {
    lastAppliedCloudMetaRev = cp.metaRevision;
  }
  const effectiveRemoteMetaDigest = cp.remoteMetaDigest || cp.metaDigest;
  const effectiveRemoteMaterialsDigest = cp.remoteMaterialsDigest || cp.materialsDigest;
  if (!lastAppliedCloudMetaDigest && effectiveRemoteMetaDigest) {
    lastAppliedCloudMetaDigest = effectiveRemoteMetaDigest;
  }
  if (!lastAppliedCloudMaterialsDigest && effectiveRemoteMaterialsDigest) {
    lastAppliedCloudMaterialsDigest = effectiveRemoteMaterialsDigest;
  }
  if (!lastSyncedOsdDigest && cp.osdDigest) {
    lastSyncedOsdDigest = cp.osdDigest;
  }
  if (ramChunkDigestsUid !== uid) {
    ramChunkDigests = cp.chunkDigests && typeof cp.chunkDigests === 'object' ? { ...cp.chunkDigests } : {};
    ramChunkDigestsUid = uid;
  }
  return cp;
}

function resetCloudSessionCaches(clearStorage = false): void {
  knownExistingPaths.clear();
  knownExistingPathsUid = null;
  workspaceReadyPromise = null;
  workspaceReadyUid = null;
  verifiedWorkspaceUid = null;
  cachedWsManifest = null;
  adminPiiLoadedForMetaRev = -1;
  lastAppliedCloudServerRev = -1;
  lastAppliedCloudMetaRev = -1;
  lastAppliedCloudMetaDigest = '';
  lastAppliedCloudMaterialsDigest = '';
  latestObservedRemoteServerRev = -1;
  latestObservedRemoteMetaDigest = '';
  latestObservedRemoteMaterialsDigest = '';
  latestObservedRemoteUpdatedAtMs = 0;
  lastSyncedOsdDigest = '';
  cloudInboundIndexCache = null;
  cloudOutboundIndexCache = null;
  ramChunkDigests = {};
  ramChunkDigestsUid = null;
  syncedAttachmentSignatures.clear();
  if (clearStorage) {
    clearSyncedOutboxDomains({
      users: true,
      warehouses: true,
      tombstones: true,
      osd: true,
      materials: true,
      inbound: true,
      outbound: true
    });
    clearCloudSyncCheckpoint();
  } else {
    // Giữ nguyên hàng đợi pending outbox trên localStorage và nạp lại vào RAM để không bỏ sót dữ liệu sửa khi offline/đổi phiên
    hydrateOutboxIntoRamFlags();
  }
}

let externalOnRemoteWorkspaceChange: (() => void) | null = null;
let externalOnRemoteSessionSnapshot: ((remoteData: Record<string, any>) => void) | null = null;
let externalOnRemoteOsdChange: ((remoteOsd: OsdReceipt[]) => void) | null = null;
let externalIsLocalSessionStillActive: ((sessionToken: string) => boolean) | null = null;

const revokedCloudSessionTokens = new Set<string>();
const authReadyWaiters = new Set<() => void>();

function rememberRevokedCloudToken(token?: string | null): void {
  const clean = String(token || '').trim();
  if (!clean) return;
  if (revokedCloudSessionTokens.size > 500) {
    const oldest = revokedCloudSessionTokens.values().next().value;
    if (oldest) revokedCloudSessionTokens.delete(oldest);
  }
  revokedCloudSessionTokens.add(clean);
}

function isSessionStillValidLocally(token?: string | null): boolean {
  const clean = String(token || '').trim();
  if (!clean) return false;
  if (revokedCloudSessionTokens.has(clean)) return false;
  if (externalIsLocalSessionStillActive && !externalIsLocalSessionStillActive(clean)) {
    return false;
  }
  return true;
}

async function ensureValidFirebaseAuthToken(
  fbUser: FirebaseUser,
  timeoutMs = 8000
): Promise<boolean> {
  try {
    await withAsyncTimeout(
      fbUser.getIdToken(false),
      timeoutMs,
      'Hết thời gian xác thực phiên Google.'
    );
    return true;
  } catch (err: any) {
    const code = String(err?.code || '');
    const msg = String(err?.message || '');
    const isStaleOrRevoked =
      code === 'auth/user-token-expired' ||
      code === 'auth/invalid-user-token' ||
      code === 'auth/user-disabled' ||
      code === 'auth/user-not-found' ||
      code === 'auth/invalid-credential' ||
      msg.includes('TOKEN_EXPIRED') ||
      msg.includes('USER_DISABLED') ||
      msg.includes('INVALID_REFRESH_TOKEN');
    if (isStaleOrRevoked) {
      try {
        detachAllListeners();
        workspaceReadyPromise = null;
        workspaceReadyUid = null;
        await signOut(auth);
        emitCloudState({
          status: 'disconnected',
          cloudEmail: null,
          cloudDisplayName: null,
          cloudUid: null,
          errorMessage: null
        });
      } catch {
        // ignore signOut cleanup error
      }
    }
    return false;
  }
}

function resolveAuthReadyWaiters(): void {
  if (authReadyWaiters.size === 0) return;
  authReadyWaiters.forEach((resolve) => {
    try {
      resolve();
    } catch {
      // ignore
    }
  });
  authReadyWaiters.clear();
}

function emitCloudState(patch: Partial<CloudSyncSnapshotState>): void {
  const nextPatch = { ...patch };
  if (
    cloudConnectionPaused &&
    nextPatch.status !== 'paused' &&
    nextPatch.connectionPaused !== false
  ) {
    return;
  }
  if (
    (nextPatch.status === 'connected' || nextPatch.status === 'disconnected') &&
    nextPatch.quotaExceeded === undefined
  ) {
    nextPatch.quotaExceeded = false;
  }
  if (
    (nextPatch.status === 'connected' || nextPatch.status === 'disconnected') &&
    nextPatch.connectionPaused === undefined
  ) {
    nextPatch.connectionPaused = false;
    nextPatch.manualPaused = false;
    nextPatch.pauseReason = null;
    nextPatch.pausedAt = null;
  }
  currentState = { ...currentState, ...nextPatch };
  if (currentState.authReady) {
    resolveAuthReadyWaiters();
  }
  stateListeners.forEach((cb) => {
    try {
      cb(currentState);
    } catch {
      // ignore listener errors
    }
  });
}

function pauseCloudConnection(
  rawErrOrReason: unknown,
  opts?: { timedOutOver2Min?: boolean; quotaExceeded?: boolean; isOnline?: boolean }
): string {
  const isOnline =
    opts?.isOnline ?? (typeof navigator !== 'undefined' ? navigator.onLine : true);
  const reason = classifyCloudPauseReason(rawErrOrReason, {
    isOnline,
    timedOutOver2Min: opts?.timedOutOver2Min
  });
  const notice = formatCloudPauseNotice(reason);
  cloudConnectionPaused = true;
  manualSyncPaused = false;
  writeManualCloudPauseFlag(false);
  cloudPauseReason = notice;

  if (activeCloudWatchdog) {
    activeCloudWatchdog.abort(notice, Boolean(opts?.timedOutOver2Min));
  }
  workspaceReadyPromise = null;
  workspaceReadyUid = null;
  pendingCloudReconcile = false;
  pendingForceManifestRefresh = false;
  deferredRemoteChangeDuringAuth = false;
  detachAllListeners();

  emitCloudState({
    status: 'paused',
    connectionPaused: true,
    manualPaused: false,
    pauseReason: notice,
    pausedAt: Date.now(),
    quotaExceeded: Boolean(opts?.quotaExceeded || isFirestoreQuotaExhausted()),
    errorMessage: notice
  });
  return notice;
}

function pauseCloudConnectionManually(): string {
  const notice = formatManualCloudPauseNotice();
  cloudControlEpoch += 1;
  cloudConnectionPaused = true;
  manualSyncPaused = true;
  writeManualCloudPauseFlag(true);
  cloudPauseReason = notice;

  const prevWatchdog = activeCloudWatchdog;
  activeCloudWatchdog = null;
  if (prevWatchdog) {
    prevWatchdog.abort(notice, false);
    prevWatchdog.dispose();
  }
  isCloudReconciling = false;
  reconcileInFlightPromise = null;
  activeWorkDetectedCallbacks.clear();
  workspaceReadyPromise = null;
  workspaceReadyUid = null;
  pendingCloudReconcile = false;
  pendingForceManifestRefresh = false;
  deferredRemoteChangeDuringAuth = false;
  detachAllListeners();

  emitCloudState({
    status: 'paused',
    connectionPaused: true,
    manualPaused: true,
    pauseReason: notice,
    pausedAt: Date.now(),
    quotaExceeded: false,
    errorMessage: null
  });
  return notice;
}

function unpauseForManualRetry(): void {
  cloudControlEpoch += 1;
  cloudConnectionPaused = false;
  manualSyncPaused = false;
  writeManualCloudPauseFlag(false);
  cloudPauseReason = null;
  consecutiveCloudFailures = 0;
  resetFirestoreCircuitForRetry();
  workspaceReadyPromise = null;
  workspaceReadyUid = null;
  const fbUser = auth.currentUser;
  const hasVerifiedUser = Boolean(fbUser && fbUser.emailVerified);
  emitCloudState({
    status: hasVerifiedUser
      ? verifiedWorkspaceUid === fbUser?.uid
        ? 'connected'
        : 'connecting'
      : 'disconnected',
    connectionPaused: false,
    manualPaused: false,
    pauseReason: null,
    pausedAt: null,
    quotaExceeded: false,
    errorMessage: null
  });
}

function settleConnectingStateIfNeeded(fallbackErrorMessage?: string): void {
  if (cloudConnectionPaused) return;
  if (currentState.status !== 'connecting') return;
  if (isFirestoreQuotaExhausted()) {
    emitCloudState({
      status: 'error',
      quotaExceeded: true,
      errorMessage: getLastFirestoreQuotaMessage()
    });
    return;
  }
  if (auth.currentUser && auth.currentUser.emailVerified) {
    emitCloudState({
      status: 'error',
      quotaExceeded: false,
      errorMessage:
        fallbackErrorMessage ||
        currentState.errorMessage ||
        'Kết nối Cloud Firestore đang tạm gián đoạn. Vui lòng thử lại sau giây lát.'
    });
    return;
  }
  emitCloudState({
    status: 'disconnected',
    quotaExceeded: false,
    errorMessage: fallbackErrorMessage || null
  });
}

onFirestoreQuotaError((msg) => {
  if (cloudConnectionPaused) {
    emitCloudState({
      status: 'paused',
      connectionPaused: true,
      quotaExceeded: true,
      pauseReason: currentState.pauseReason || msg,
      errorMessage: currentState.errorMessage || msg
    });
    return;
  }
  emitCloudState({ status: 'error', quotaExceeded: true, errorMessage: msg });
});

// ============================================================================
// Deterministic Hashing & Blueprint-Bound Sanitization Helpers
// ============================================================================
function hash32Pair(str: string): [number, number] {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + ((i & 0xff) << 8);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return [h1 >>> 0, h2 >>> 0];
}

export function makeSafeDocId(prefix: string, rawKey: string): string {
  const normalized = String(rawKey || 'default').trim();
  const [h1, h2] = hash32Pair(`${prefix}|${normalized}`);
  const asciiSlug = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 44);
  const hashHex = `${h1.toString(36)}${h2.toString(36)}`;
  const id = asciiSlug ? `${prefix}_${asciiSlug}_${hashHex}` : `${prefix}_${hashHex}`;
  return id.slice(0, 120);
}

function cleanStr(val: unknown, maxLen: number, minFallback = ''): string {
  const s = val === null || val === undefined ? '' : String(val).trim();
  if (!s && minFallback) return minFallback.slice(0, maxLen);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function cleanNum(val: unknown, min = 0, max = 100_000_000_000_000): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return Math.max(0, min);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function chunkArray<T>(arr: T[], size = CLOUD_CHUNK_SIZE): T[][] {
  if (arr.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function isCloudAdmin(fbUser: FirebaseUser | null): boolean {
  return Boolean(
    fbUser &&
      fbUser.emailVerified &&
      fbUser.email &&
      fbUser.email.trim().toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL
  );
}

// Digest chung v2 không phụ thuộc PII tách riêng để Admin và Nhân viên kho luôn hội tụ 100%
function computeCloudSharedMetaDigest(
  users: User[],
  warehouses: Warehouse[],
  tombstones: TombstoneMap,
  osdListInput?: OsdReceipt[],
  inboundListInput?: InboundReceipt[],
  outboundListInput?: OutboundReceipt[]
): string {
  const osdList = Array.isArray(osdListInput) ? osdListInput : StorageService.getOsdReceipts();
  const inboundList = Array.isArray(inboundListInput)
    ? inboundListInput
    : StorageService.getInboundReceipts();
  const outboundList = Array.isArray(outboundListInput)
    ? outboundListInput
    : StorageService.getOutboundReceipts();
  return encodeMetaDigestV2({
    u: computeUsersDomainDigest(users),
    w: computeWarehousesDomainDigest(warehouses),
    t: computeTombstonesDomainDigest(tombstones),
    o: computeOsdDomainDigest(osdList),
    in: computeInboundDomainDigest(inboundList),
    out: computeOutboundDomainDigest(outboundList)
  });
}

function computeInboundListDigest(list: InboundReceipt[]): string {
  return computeInboundDomainDigest(list);
}

function computeOutboundListDigest(list: OutboundReceipt[]): string {
  return computeOutboundDomainDigest(list);
}

function computeOsdOnlyDigest(osdList: OsdReceipt[], tombstones: TombstoneMap): string {
  return `${computeOsdDomainDigest(osdList)}|${computeTombstonesDomainDigest(tombstones)}`;
}

// ============================================================================
// Firestore Safe Document Read / Write Wrappers (Preserving Immortal createdAt)
// ============================================================================
function isPermissionError(err: unknown): boolean {
  if (isFirestoreBillingOrPlanError(err)) {
    return false;
  }
  const code = (err as any)?.code || '';
  const msg = err instanceof Error ? err.message : String(err);
  return (
    code === 'permission-denied' ||
    msg.includes('Missing or insufficient permissions') ||
    msg.includes('PERMISSION_DENIED')
  );
}

function isNotFoundError(err: unknown): boolean {
  const code = String((err as any)?.code || '');
  const msg = err instanceof Error ? err.message : String(err);
  return code === 'not-found' || code === 'firestore/not-found' || msg.includes('No document to update');
}

async function safeGetDoc(
  ref: DocumentReference,
  pathLabel: string,
  timeoutMs?: number,
  maxRetries?: number
) {
  throwIfActiveSyncAborted();
  const cfg = getCloudFetchConfig();
  const effectiveTimeoutMs = getDeadlineStepTimeout(timeoutMs ?? cfg.readTimeoutMs);
  const effectiveRetries = maxRetries ?? cfg.maxReadRetries;

  try {
    const abortOpts = getSyncAbortOptions();
    const snap = await retryAsyncWithBackoff(
      () =>
        withAsyncTimeout(
          getDoc(ref),
          getDeadlineStepTimeout(effectiveTimeoutMs),
          'Kết nối Cloud Firestore phản hồi quá chậm. Vui lòng kiểm tra mạng và thử lại.',
          abortOpts
        ),
      {
        maxRetries: effectiveRetries,
        baseDelayMs: cfg.retryBaseDelayMs,
        shouldRetry: (err) =>
          !isSyncAbortedError(err) &&
          !isQuotaExceededError(err) &&
          !isPermissionError(err) &&
          isRetryableCloudReadError(err),
        ...abortOpts
      }
    );
    clearFirestoreQuotaExhaustedFlag();
    if (!snap.metadata?.fromCache) {
      activeCloudWatchdog?.markConnected();
    }
    if (cloudTransferTracker.isActive()) {
      const readBytes = snap.exists()
        ? estimateFirestoreValueBytes(snap.data()) + estimateUtf8ByteLength(pathLabel) + 64
        : estimateUtf8ByteLength(pathLabel) + 64;
      cloudTransferTracker.recordDownload(readBytes);
    }
    if (snap.exists()) {
      knownExistingPaths.add(ref.path);
    } else {
      knownExistingPaths.delete(ref.path);
    }
    return snap;
  } catch (err) {
    if (isSyncAbortedError(err)) {
      throw err;
    }
    if (isQuotaExceededError(err)) {
      notifyFirestoreQuotaExceeded(300_000, err);
    }
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.GET, pathLabel);
    }
    throw err;
  }
}

async function writeSingleProtectedDoc(
  ref: DocumentReference,
  pathLabel: string,
  immutableCreateFields: Record<string, any>,
  mutableFields: Record<string, any>
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Chưa kết nối tài khoản đám mây.');

  let existsAlready = knownExistingPaths.has(ref.path);
  if (!existsAlready) {
    const snap = await safeGetDoc(ref, pathLabel);
    existsAlready = snap.exists();
  }

  if (existsAlready) {
    try {
      await updateDoc(ref, {
        ...mutableFields,
        updatedByUid: uid,
        updatedAt: serverTimestamp()
      });
      clearFirestoreQuotaExhaustedFlag();
      activeCloudWatchdog?.markConnected();
      if (cloudTransferTracker.isActive()) {
        cloudTransferTracker.recordUpload(
          estimateStagedWritePayloadBytes(ref.path, immutableCreateFields, mutableFields)
        );
      }
      return;
    } catch (err) {
      if (isNotFoundError(err)) {
        knownExistingPaths.delete(ref.path);
      } else {
        if (isQuotaExceededError(err)) {
          notifyFirestoreQuotaExceeded(300_000, err);
        }
        if (isPermissionError(err)) {
          handleFirestoreError(err, OperationType.UPDATE, pathLabel);
        }
        throw err;
      }
    }
  }

  try {
    await setDoc(ref, {
      ...immutableCreateFields,
      ...mutableFields,
      updatedByUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    clearFirestoreQuotaExhaustedFlag();
    activeCloudWatchdog?.markConnected();
    if (cloudTransferTracker.isActive()) {
      cloudTransferTracker.recordUpload(
        estimateStagedWritePayloadBytes(ref.path, immutableCreateFields, mutableFields)
      );
    }
    knownExistingPaths.add(ref.path);
    return;
  } catch (err) {
    if (isQuotaExceededError(err)) {
      notifyFirestoreQuotaExceeded(300_000, err);
    }
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.CREATE, pathLabel);
    }
    throw err;
  }
}

class ManifestConflictError extends Error {
  reason: string;
  constructor(reason: string) {
    super(`Manifest conflict: ${reason}`);
    this.name = 'ManifestConflictError';
    this.reason = reason;
  }
}

async function commitManifestWithTransaction(params: {
  fbUser: FirebaseUser;
  expectedBaseline: {
    serverRevision: number;
    metaDigest: string;
    materialsDigest: string;
  };
  localUpdate: {
    touched: TouchedManifestDomains;
    metaDigest: string;
    accountChunkCount?: number;
    warehouseChunkCount?: number;
    tombstoneChunkCount?: number;
    inboundIndexChunkCount?: number;
    outboundIndexChunkCount?: number;
    materialsCount?: number;
    materialsChunkCount?: number;
    materialsDigest?: string;
    bumpMetaRevision?: boolean;
  };
  allowForceOverwrite?: boolean;
}): Promise<WorkspaceManifestDoc> {
  throwIfActiveSyncAborted();
  const uid = params.fbUser.uid;
  const wsPath = `workspaces/${WORKSPACE_ID}`;
  const wsRef = doc(db, 'workspaces', WORKSPACE_ID);
  const txTimeoutMs = getDeadlineStepTimeout(45000);

  try {
    const committed = await withAsyncTimeout(
      runTransaction(db, async (tx) => {
      throwIfActiveSyncAborted();
      const wsSnap = await tx.get(wsRef);
      if (!wsSnap.exists()) {
        const initMutable: ManifestSnapshotLike = {
          serverRevision: 1,
          metaRevision: params.localUpdate.bumpMetaRevision ? 1 : 0,
          materialsRevision: params.localUpdate.touched.materials ? 1 : 0,
          materialsCount: cleanNum(params.localUpdate.materialsCount, 0),
          materialsChunkCount: cleanNum(params.localUpdate.materialsChunkCount, 0, 2000),
          materialsDigest: cleanStr(params.localUpdate.materialsDigest, 128, '0:0:0:0'),
          metaDigest: cleanStr(
            params.localUpdate.metaDigest,
            128,
            'v2:0.0.0|0.0.0|0.0.0|0.0.0|0.0.0|0.0.0'
          ),
          accountChunkCount: cleanNum(params.localUpdate.accountChunkCount, 0, 50),
          warehouseChunkCount: cleanNum(params.localUpdate.warehouseChunkCount, 0, 50),
          tombstoneChunkCount: cleanNum(params.localUpdate.tombstoneChunkCount, 0, 500),
          inboundIndexChunkCount: cleanNum(params.localUpdate.inboundIndexChunkCount, 0, 500),
          outboundIndexChunkCount: cleanNum(params.localUpdate.outboundIndexChunkCount, 0, 500)
        };
        const fullDoc: WorkspaceManifestDoc = {
          workspaceId: WORKSPACE_ID,
          name: WORKSPACE_NAME,
          ownerUid: cleanStr(uid, 128),
          updatedByUid: uid,
          status: 'active',
          allowSelfJoin: true,
          ...initMutable
        };
        tx.set(wsRef, {
          ...fullDoc,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        return fullDoc;
      }

      const latestRaw = wsSnap.data() as Record<string, any>;
      const latestSnapshot: ManifestSnapshotLike = {
        serverRevision: Number(latestRaw.serverRevision) || 0,
        metaRevision: Number(latestRaw.metaRevision) || 0,
        materialsRevision: Number(latestRaw.materialsRevision) || 0,
        materialsCount: Number(latestRaw.materialsCount) || 0,
        materialsChunkCount: Number(latestRaw.materialsChunkCount) || 0,
        materialsDigest: String(latestRaw.materialsDigest || '0:0:0:0'),
        metaDigest: String(latestRaw.metaDigest || 'v2:0.0.0|0.0.0|0.0.0|0.0.0|0.0.0|0.0.0'),
        accountChunkCount: Number(latestRaw.accountChunkCount) || 0,
        warehouseChunkCount: Number(latestRaw.warehouseChunkCount) || 0,
        tombstoneChunkCount: Number(latestRaw.tombstoneChunkCount) || 0,
        inboundIndexChunkCount: Number(latestRaw.inboundIndexChunkCount) || 0,
        outboundIndexChunkCount: Number(latestRaw.outboundIndexChunkCount) || 0
      };

      let nextMutable: ManifestSnapshotLike;
      if (params.allowForceOverwrite) {
        nextMutable = {
          serverRevision: latestSnapshot.serverRevision + 1,
          metaRevision: latestSnapshot.metaRevision + 1,
          materialsRevision: latestSnapshot.materialsRevision + 1,
          materialsCount: cleanNum(params.localUpdate.materialsCount, 0),
          materialsChunkCount: cleanNum(params.localUpdate.materialsChunkCount, 0, 2000),
          materialsDigest: cleanStr(
            params.localUpdate.materialsDigest,
            128,
            latestSnapshot.materialsDigest
          ),
          metaDigest: cleanStr(
            params.localUpdate.metaDigest,
            128,
            latestSnapshot.metaDigest
          ),
          accountChunkCount: cleanNum(params.localUpdate.accountChunkCount, 0, 50),
          warehouseChunkCount: cleanNum(params.localUpdate.warehouseChunkCount, 0, 50),
          tombstoneChunkCount: cleanNum(params.localUpdate.tombstoneChunkCount, 0, 500),
          inboundIndexChunkCount: cleanNum(params.localUpdate.inboundIndexChunkCount, 0, 500),
          outboundIndexChunkCount: cleanNum(params.localUpdate.outboundIndexChunkCount, 0, 500)
        };
      } else {
        const outcome = resolveManifestTransactionUpdate({
          latestRemote: latestSnapshot,
          expectedBaseline: params.expectedBaseline,
          localUpdate: params.localUpdate
        });
        if ('reason' in outcome) {
          throw new ManifestConflictError(outcome.reason);
        }
        nextMutable = {
          serverRevision: cleanNum(outcome.manifest.serverRevision, 1),
          metaRevision: cleanNum(outcome.manifest.metaRevision, 0),
          materialsRevision: cleanNum(outcome.manifest.materialsRevision, 0),
          materialsCount: cleanNum(outcome.manifest.materialsCount, 0),
          materialsChunkCount: cleanNum(outcome.manifest.materialsChunkCount, 0, 2000),
          materialsDigest: cleanStr(outcome.manifest.materialsDigest, 128, '0:0:0:0'),
          metaDigest: cleanStr(
            outcome.manifest.metaDigest,
            128,
            'v2:0.0.0|0.0.0|0.0.0|0.0.0|0.0.0|0.0.0'
          ),
          accountChunkCount: cleanNum(outcome.manifest.accountChunkCount, 0, 50),
          warehouseChunkCount: cleanNum(outcome.manifest.warehouseChunkCount, 0, 50),
          tombstoneChunkCount: cleanNum(outcome.manifest.tombstoneChunkCount, 0, 500),
          inboundIndexChunkCount: cleanNum(outcome.manifest.inboundIndexChunkCount, 0, 500),
          outboundIndexChunkCount: cleanNum(outcome.manifest.outboundIndexChunkCount, 0, 500)
        };
      }

      tx.update(wsRef, {
        ...nextMutable,
        updatedByUid: uid,
        updatedAt: serverTimestamp()
      });

      return {
        workspaceId: cleanStr(latestRaw.workspaceId, 64, WORKSPACE_ID),
        name: cleanStr(latestRaw.name, 200, WORKSPACE_NAME),
        ownerUid: cleanStr(latestRaw.ownerUid, 128, uid),
        updatedByUid: uid,
        status: latestRaw.status === 'archived' ? 'archived' : 'active',
        allowSelfJoin: latestRaw.allowSelfJoin !== false,
        ...nextMutable
      } as WorkspaceManifestDoc;
    }),
      txTimeoutMs,
      'Giao dịch đồng bộ Cloud Firestore phản hồi quá chậm. Vui lòng thử lại.'
    );

    clearFirestoreQuotaExhaustedFlag();
    activeCloudWatchdog?.markConnected();
    if (cloudTransferTracker.isActive()) {
      cloudTransferTracker.recordDownload(estimateFirestoreValueBytes(committed) + 128);
      cloudTransferTracker.recordUpload(estimateFirestoreValueBytes(committed) + 192);
    }
    knownExistingPaths.add(wsRef.path);
    cachedWsManifest = { data: committed, atMs: Date.now() };
    lastAppliedCloudServerRev = committed.serverRevision;
    lastAppliedCloudMetaRev = committed.metaRevision;
    lastAppliedCloudMetaDigest = committed.metaDigest;
    lastAppliedCloudMaterialsDigest = committed.materialsDigest;
    return committed;
  } catch (err) {
    if (isSyncAbortedError(err)) {
      throw err;
    }
    if (err instanceof ManifestConflictError) {
      cachedWsManifest = null;
      throw err;
    }
    if (isQuotaExceededError(err)) {
      notifyFirestoreQuotaExceeded(300_000, err);
    }
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.UPDATE, wsPath);
    }
    throw err;
  }
}

interface StagedDocWrite {
  ref: DocumentReference;
  pathLabel: string;
  immutableCreateFields: Record<string, any>;
  mutableFields: Record<string, any>;
  isKnownNew?: boolean;
}

async function commitBatchChunk(
  chunk: StagedDocWrite[],
  uid: string,
  reprobeAttempts = 0,
  commitTimeoutMs = 60_000
): Promise<void> {
  throwIfActiveSyncAborted();
  const cfg = getCloudFetchConfig();
  const buildAndCommit = async () => {
    throwIfActiveSyncAborted();
    const batch = writeBatch(db);
    for (let i = 0; i < chunk.length; i++) {
      const w = chunk[i];
      if (knownExistingPaths.has(w.ref.path)) {
        batch.update(w.ref, {
          ...w.mutableFields,
          updatedByUid: uid,
          updatedAt: serverTimestamp()
        });
      } else {
        batch.set(w.ref, {
          ...w.immutableCreateFields,
          ...w.mutableFields,
          updatedByUid: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }
    await batch.commit();
  };

  try {
    await retryAsyncWithBackoff(
      () =>
        withAsyncTimeout(
          buildAndCommit(),
          getDeadlineStepTimeout(commitTimeoutMs),
          'Ghi dữ liệu lên Cloud Firestore phản hồi quá chậm. Vui lòng thử lại.'
        ),
      {
        maxRetries: 2,
        baseDelayMs: Math.max(cfg.retryBaseDelayMs, 600),
        // TUYỆT ĐỐI không gửi chồng batch trùng khi hết giờ cục bộ (vì Firestore SDK vẫn đang giữ gói cũ trên cùng WriteStream);
        // chỉ tự động thử lại khi Firestore thực sự trả về lỗi mạng/máy chủ tạm thời (unavailable/aborted).
        shouldRetry: (err) =>
          !isSyncAbortedError(err) &&
          !isLocalTimeoutError(err) &&
          !isQuotaExceededError(err) &&
          !isPermissionError(err) &&
          !isNotFoundError(err) &&
          !isPayloadSizeExceededError(err) &&
          isRetryableCloudReadError(err),
        ...getSyncAbortOptions()
      }
    );
    clearFirestoreQuotaExhaustedFlag();
    activeCloudWatchdog?.markConnected();
    if (cloudTransferTracker.isActive()) {
      let chunkBytes = 0;
      for (let i = 0; i < chunk.length; i++) {
        const w = chunk[i];
        chunkBytes += estimateStagedWritePayloadBytes(
          w.ref.path,
          w.immutableCreateFields,
          w.mutableFields
        );
      }
      cloudTransferTracker.recordUpload(chunkBytes);
    }
    for (let i = 0; i < chunk.length; i++) {
      knownExistingPaths.add(chunk[i].ref.path);
    }
  } catch (err) {
    if (isSyncAbortedError(err)) {
      throw err;
    }

    if (isPayloadSizeExceededError(err) && chunk.length > 1) {
      // Tự động chia đôi gói batch khi vượt trần kích thước payload của Firestore
      const mid = Math.ceil(chunk.length / 2);
      await commitBatchChunk(chunk.slice(0, mid), uid, reprobeAttempts, commitTimeoutMs);
      await commitBatchChunk(chunk.slice(mid), uid, reprobeAttempts, commitTimeoutMs);
      return;
    }

    if (isNotFoundError(err) && reprobeAttempts < 2) {
      // Tự phục hồi nếu có tài liệu bị xóa bên ngoài làm cache đường dẫn cũ bị lệch
      for (let i = 0; i < chunk.length; i++) {
        knownExistingPaths.delete(chunk[i].ref.path);
      }
      await runWithConcurrencyLimit(
        chunk,
        cfg.concurrency,
        (w) => safeGetDoc(w.ref, w.pathLabel),
        getSyncAbortOptions()
      );
      await commitBatchChunk(chunk, uid, reprobeAttempts + 1, commitTimeoutMs);
      return;
    }

    if (isPermissionError(err) && reprobeAttempts < 2) {
      // Tự phục hồi nếu tài liệu đã tồn tại trên Cloud từ lần đồng bộ bị gián đoạn trước đó (chưa kịp ghi vào index):
      // batch.set sẽ bị Firestore Rules từ chối vì ghi đè trường bất biến createdAt -> dò lại tồn tại và chuyển sang batch.update.
      const setCandidates = chunk.filter((w) => !knownExistingPaths.has(w.ref.path));
      if (setCandidates.length > 0) {
        await runWithConcurrencyLimit(
          setCandidates,
          cfg.concurrency,
          (w) => safeGetDoc(w.ref, w.pathLabel),
          getSyncAbortOptions()
        );
        const discoveredExisting = setCandidates.some((w) => knownExistingPaths.has(w.ref.path));
        if (discoveredExisting) {
          await commitBatchChunk(chunk, uid, reprobeAttempts + 1, commitTimeoutMs);
          return;
        }
      }
    }

    if (isPermissionError(err) && chunk.length > 1) {
      // Nếu batch nhiều tài liệu vẫn bị từ chối quyền (ví dụ chạm trần truy vấn rules), tự động tách đôi xuống từng tài liệu lẻ để cô lập/hoàn tất
      const mid = Math.ceil(chunk.length / 2);
      await commitBatchChunk(chunk.slice(0, mid), uid, 0, commitTimeoutMs);
      await commitBatchChunk(chunk.slice(mid), uid, 0, commitTimeoutMs);
      return;
    }

    if (isQuotaExceededError(err)) {
      notifyFirestoreQuotaExceeded(300_000, err);
    }
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.WRITE, chunk[0]?.pathLabel || `workspaces/${WORKSPACE_ID}`);
    }
    throw err;
  }
}

async function commitStagedWrites(writes: StagedDocWrite[]): Promise<void> {
  throwIfActiveSyncAborted();
  if (writes.length === 0) return;
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Chưa kết nối tài khoản đám mây.');

  // Loại bỏ các đường dẫn trùng nhau (nếu dữ liệu cục bộ có mã phiếu trùng) để tránh xung đột ghi đè trong cùng hoặc giữa các batch song song
  const uniqueWrites = deduplicateStagedWritesByPath(writes, (w) => w.ref.path);

  // Chỉ kiểm tra sự tồn tại cho các doc chưa có trong cache và không được gợi ý là mới;
  // nếu một doc gợi ý mới thực chất đã tồn tại trên Cloud (orphan), commitBatchChunk sẽ tự dò lại và chuyển sang update.
  const unknownWrites = uniqueWrites.filter(
    (w) => !w.isKnownNew && !knownExistingPaths.has(w.ref.path)
  );
  if (unknownWrites.length > 0) {
    await runWithConcurrencyLimit(
      unknownWrites,
      getCloudFetchConfig().concurrency,
      (w) => safeGetDoc(w.ref, w.pathLabel),
      getSyncAbortOptions()
    );
  }

  const estimatedBytesByPath = new Map<string, number>();
  let totalEstimatedBytes = 0;
  let allKnownExisting = true;
  for (let i = 0; i < uniqueWrites.length; i++) {
    const w = uniqueWrites[i];
    const bytes = estimateStagedWritePayloadBytes(w.ref.path, w.immutableCreateFields, w.mutableFields);
    estimatedBytesByPath.set(w.ref.path, bytes);
    totalEstimatedBytes += bytes;
    if (!knownExistingPaths.has(w.ref.path)) {
      allKnownExisting = false;
    }
  }

  const avgPayloadBytes = uniqueWrites.length > 0 ? totalEstimatedBytes / uniqueWrites.length : 0;
  const writeCfg = getAdaptiveBatchWriteConfig({
    isMobile: isLikelyMobileDevice(),
    isAdmin: isCloudAdmin(auth.currentUser),
    allKnownExisting,
    avgPayloadBytes
  });

  // Chia batch theo cả trần get()/exists() của Firestore Rules lẫn dung lượng byte nhỏ gọn (~400 KB) để gửi mượt qua WriteStream
  const batches = partitionStagedWritesIntoBatches(
    uniqueWrites,
    (w) => estimatedBytesByPath.get(w.ref.path) || 2048,
    {
      maxOpsPerBatch: writeCfg.maxOpsPerBatch,
      maxBytesPerBatch: writeCfg.maxBytesPerBatch
    }
  );

  let committedAnyBatch = false;
  try {
    await runWithConcurrencyLimit(
      batches,
      writeCfg.batchConcurrency,
      async (chunk) => {
        await commitBatchChunk(chunk, uid, 0, writeCfg.commitTimeoutMs);
        committedAnyBatch = true;
      },
      getSyncAbortOptions()
    );
  } finally {
    if (committedAnyBatch) {
      persistKnownExistingPaths(uid);
    }
  }
}

// ============================================================================
// Entity Serializers & Deserializers (Native Maps Only, Zero JSON.stringify)
// ============================================================================
function serializeAccountPublic(u: User): Record<string, any> {
  const emailDigest = cleanStr(u.emailDigest || computeEmailAuthDigest(u.email), 64, '');
  const allowedWarehouseIds =
    u.role === 'admin'
      ? []
      : normalizeAllowedWarehouseIds(u.allowedWarehouseIds)
          .slice(0, 100)
          .map((id) => cleanStr(id, 120, ''))
          .filter(Boolean);
  return {
    id: cleanStr(u.id, 120, `user-${Date.now()}`),
    username: cleanStr(u.username, 120, 'user'),
    fullName: cleanStr(u.fullName || u.username, 160, 'Người dùng'),
    role: ['admin', 'manager', 'staff', 'viewer'].includes(u.role) ? u.role : 'staff',
    credential: cleanStr(u.password, 120, ''),
    emailDigest,
    department: cleanStr(u.department, 160, ''),
    isActive: Boolean(u.isActive),
    allowedWarehouseIds,
    createdAt: cleanStr(u.createdAt, 64, new Date().toISOString()),
    lastLogin: cleanStr(u.lastLogin, 64, ''),
    sessionRevokedAt: cleanNum(u.sessionRevokedAt, 0),
    updatedAt: cleanNum(u.updatedAt, 1)
  };
}

function deserializeAccountPublic(m: Record<string, any>): User {
  const emailDigest = cleanStr(m.emailDigest, 64, '');
  const role: User['role'] = ['admin', 'manager', 'staff', 'viewer'].includes(m.role)
    ? m.role
    : 'staff';
  const allowedWarehouseIds =
    role === 'admin'
      ? undefined
      : Array.isArray(m.allowedWarehouseIds)
        ? normalizeAllowedWarehouseIds(m.allowedWarehouseIds)
        : undefined;
  return {
    id: cleanStr(m.id, 120, 'user-unknown'),
    username: cleanStr(m.username, 120, 'user'),
    fullName: cleanStr(m.fullName, 160, cleanStr(m.username, 120, 'Người dùng')),
    role,
    password: cleanStr(m.credential, 120, ''),
    emailDigest: emailDigest || undefined,
    department: cleanStr(m.department, 160, ''),
    isActive: m.isActive !== false,
    allowedWarehouseIds,
    createdAt: cleanStr(m.createdAt, 64, '2026-01-01T00:00:00Z'),
    lastLogin: cleanStr(m.lastLogin, 64, '') || undefined,
    sessionRevokedAt: Number(m.sessionRevokedAt) > 0 ? Number(m.sessionRevokedAt) : undefined,
    updatedAt: Number(m.updatedAt) || 1
  };
}

function serializeWarehousePublic(w: Warehouse): Record<string, any> {
  return {
    id: cleanStr(w.id, 120, `wh-${Date.now()}`),
    code: cleanStr(w.code, 100, 'WH'),
    shortCode: cleanStr(w.shortCode, 32, ''),
    name: cleanStr(w.name, 200, 'Kho vật tư'),
    location: cleanStr(w.location, 300, ''),
    type: ['covered', 'open_yard', 'transit', 'specialized'].includes(w.type) ? w.type : 'covered',
    capacityAreaM2: cleanNum(w.capacityAreaM2, 0),
    capacityTons: cleanNum(w.capacityTons, 0),
    keeperName: cleanStr(w.keeperName, 160, ''),
    status: ['active', 'full', 'maintenance'].includes(w.status) ? w.status : 'active',
    notes: cleanStr(w.notes, 500, ''),
    createdAt: cleanStr(w.createdAt, 64, new Date().toISOString()),
    updatedAt: cleanNum(w.updatedAt, 1)
  };
}

function deserializeWarehousePublic(m: Record<string, any>): Warehouse {
  return {
    id: cleanStr(m.id, 120, 'wh-0'),
    code: cleanStr(m.code, 100, 'WH'),
    shortCode: cleanStr(m.shortCode, 32, '') || undefined,
    name: cleanStr(m.name, 200, 'Kho vật tư'),
    location: cleanStr(m.location, 300, ''),
    type: ['covered', 'open_yard', 'transit', 'specialized'].includes(m.type) ? m.type : 'covered',
    capacityAreaM2: cleanNum(m.capacityAreaM2, 0),
    capacityTons: cleanNum(m.capacityTons, 0),
    keeperName: cleanStr(m.keeperName, 160, ''),
    phone: '',
    status: ['active', 'full', 'maintenance'].includes(m.status) ? m.status : 'active',
    notes: cleanStr(m.notes, 500, ''),
    createdAt: cleanStr(m.createdAt, 64, '2026-01-01T00:00:00Z'),
    updatedAt: Number(m.updatedAt) || 1
  };
}

function serializeOsdPublic(o: OsdReceipt): Record<string, any> {
  const safeItems = (Array.isArray(o.items) ? o.items : []).map((it) => ({
    id: cleanStr(it.id, 160),
    materialCode: cleanStr(it.materialCode, 160),
    materialName: cleanStr(it.materialName, 200),
    unit: cleanStr(it.unit, 64),
    packageNo: cleanStr(it.packageNo, 160),
    packageName: cleanStr(it.packageName, 200),
    packingListNo: cleanStr(it.packingListNo, 160),
    shipment: cleanStr(it.shipment, 160),
    inboundQuantity: cleanNum(it.inboundQuantity, 0),
    osdType: cleanStr(it.osdType, 32, 'damage'),
    osdQuantity: cleanNum(it.osdQuantity, 0),
    osdWeightKg: cleanNum(it.osdWeightKg, 0),
    defectDescription: cleanStr(it.defectDescription, 500),
    rootCause: cleanStr(it.rootCause, 500),
    proposedAction: cleanStr(it.proposedAction, 500)
  }));

  const payload: Record<string, any> = {
    id: cleanStr(o.id, 160, `osd-${Date.now()}`),
    osdCode: cleanStr(o.osdCode, 160, 'OSD-0001'),
    osdDate: cleanStr(o.osdDate, 32, new Date().toISOString().slice(0, 10)),
    inboundReceiptId: cleanStr(o.inboundReceiptId, 160),
    inboundReceiptCode: cleanStr(o.inboundReceiptCode, 160),
    warehouseId: cleanStr(o.warehouseId, 160),
    warehouseName: cleanStr(o.warehouseName, 200),
    supplier: cleanStr(o.supplier, 200),
    packingListNo: cleanStr(o.packingListNo, 160),
    shipment: cleanStr(o.shipment, 160),
    status: o.status === 'closed' ? 'closed' : 'open',
    resolutionNotes: cleanStr(o.resolutionNotes, 1000),
    resolvedAt: cleanStr(o.resolvedAt, 64),
    resolvedBy: cleanStr(o.resolvedBy, 160),
    items: safeItems,
    totalOsdQuantity: cleanNum(o.totalOsdQuantity, 0),
    totalOsdWeightKg: cleanNum(o.totalOsdWeightKg, 0),
    notes: cleanStr(o.notes, 1000),
    createdAt: cleanStr(o.createdAt, 64, new Date().toISOString()),
    createdBy: cleanStr(o.createdBy, 160),
    updatedAt: cleanNum(o.updatedAt, 1),
    lastEditedBy: cleanStr(o.lastEditedBy, 160),
    lastEditedAt: cleanStr(o.lastEditedAt, 64)
  };

  if (o.pdfAttachment) {
    const pdf = o.pdfAttachment;
    // Để tài liệu metaChunks/osd_0 không bao giờ vượt quá giới hạn 1MB của Firestore,
    // ta chỉ lưu metadata trong chunk danh sách, và dataUrl inline nếu kích thước nhỏ (< 50KB).
    // Toàn bộ file PDF đầy đủ được lưu và đồng bộ riêng biệt qua collection `osdAttachments`.
    const inlineDataUrl = (pdf.dataUrl || '').length < 65_000 ? pdf.dataUrl : '';
    payload.pdfAttachment = {
      fileName: cleanStr(pdf.fileName, 255),
      fileSize: cleanNum(pdf.fileSize, 0),
      fileType: cleanStr(pdf.fileType, 64, 'application/pdf'),
      uploadedAt: cleanStr(pdf.uploadedAt, 64),
      dataUrl: inlineDataUrl
    };
  }

  return payload;
}

function deserializeOsdPublic(raw: any): OsdReceipt {
  const safeItems: OsdItemDetail[] = (Array.isArray(raw?.items) ? raw.items : []).map((it: any) => ({
    id: String(it?.id || ''),
    materialCode: String(it?.materialCode || ''),
    materialName: String(it?.materialName || ''),
    unit: String(it?.unit || 'Bộ'),
    packageNo: String(it?.packageNo || ''),
    packageName: String(it?.packageName || ''),
    packingListNo: String(it?.packingListNo || ''),
    shipment: String(it?.shipment || ''),
    inboundQuantity: Number(it?.inboundQuantity) || 0,
    osdType: (it?.osdType || 'damage') as any,
    osdQuantity: Number(it?.osdQuantity) || 0,
    osdWeightKg: it?.osdWeightKg ? Number(it.osdWeightKg) : undefined,
    defectDescription: String(it?.defectDescription || ''),
    rootCause: it?.rootCause ? String(it.rootCause) : undefined,
    proposedAction: it?.proposedAction ? String(it.proposedAction) : undefined
  }));

  const rcp: OsdReceipt = {
    id: String(raw?.id || `osd-${Date.now()}`),
    osdCode: String(raw?.osdCode || 'OSD-0001'),
    osdDate: String(raw?.osdDate || new Date().toISOString().slice(0, 10)),
    inboundReceiptId: String(raw?.inboundReceiptId || ''),
    inboundReceiptCode: String(raw?.inboundReceiptCode || ''),
    warehouseId: String(raw?.warehouseId || ''),
    warehouseName: String(raw?.warehouseName || ''),
    supplier: String(raw?.supplier || ''),
    packingListNo: raw?.packingListNo ? String(raw.packingListNo) : undefined,
    shipment: raw?.shipment ? String(raw.shipment) : undefined,
    status: raw?.status === 'closed' ? 'closed' : 'open',
    resolutionNotes: raw?.resolutionNotes ? String(raw.resolutionNotes) : undefined,
    resolvedAt: raw?.resolvedAt ? String(raw.resolvedAt) : undefined,
    resolvedBy: raw?.resolvedBy ? String(raw.resolvedBy) : undefined,
    items: safeItems,
    totalOsdQuantity: Number(raw?.totalOsdQuantity) || 0,
    totalOsdWeightKg: raw?.totalOsdWeightKg ? Number(raw.totalOsdWeightKg) : undefined,
    notes: raw?.notes ? String(raw.notes) : undefined,
    createdAt: String(raw?.createdAt || new Date().toISOString()),
    createdBy: String(raw?.createdBy || ''),
    updatedAt: Number(raw?.updatedAt) || 1,
    lastEditedBy: raw?.lastEditedBy ? String(raw.lastEditedBy) : undefined,
    lastEditedAt: raw?.lastEditedAt ? String(raw.lastEditedAt) : undefined
  };

  if (raw?.pdfAttachment && typeof raw.pdfAttachment === 'object') {
    rcp.pdfAttachment = {
      fileName: String(raw.pdfAttachment.fileName || 'bien_ban_osd.pdf'),
      fileSize: Number(raw.pdfAttachment.fileSize) || 0,
      fileType: String(raw.pdfAttachment.fileType || 'application/pdf'),
      uploadedAt: String(raw.pdfAttachment.uploadedAt || new Date().toISOString()),
      dataUrl: String(raw.pdfAttachment.dataUrl || '')
    };
  }

  return rcp;
}

async function pushSingleOsdAttachment(osdId: string, pdf: OsdPdfAttachment): Promise<void> {
  const dataUrl = pdf?.dataUrl;
  if (!osdId || !dataUrl || dataUrl.length === 0) return;
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return;

  const attSig = `${osdId}|${pdf.fileName || ''}|${pdf.fileSize || 0}|${pdf.uploadedAt || ''}|${dataUrl.length}|${dataUrl.slice(0, 48)}`;
  if (syncedAttachmentSignatures.has(attSig)) return;

  try {
    const CHUNK_CHAR_LIMIT = 600_000;
    const totalChunks = Math.max(1, Math.ceil(dataUrl.length / CHUNK_CHAR_LIMIT));
    const safeOsdId = makeSafeDocId('att', osdId);

    for (let c = 0; c < totalChunks; c++) {
      const chunkId = `${safeOsdId}_c${c}`;
      const chunkPath = `workspaces/${WORKSPACE_ID}/osdAttachments/${chunkId}`;
      const chunkRef = doc(db, 'workspaces', WORKSPACE_ID, 'osdAttachments', chunkId);
      const start = c * CHUNK_CHAR_LIMIT;
      const slice = dataUrl.slice(start, start + CHUNK_CHAR_LIMIT);

      await writeSingleProtectedDoc(
        chunkRef,
        chunkPath,
        {
          workspaceId: WORKSPACE_ID,
          attachmentId: chunkId,
          osdId: cleanStr(osdId, 160)
        },
        {
          chunkIndex: c,
          totalChunks,
          fileName: cleanStr(pdf.fileName, 255),
          fileSize: cleanNum(pdf.fileSize, 0),
          fileType: cleanStr(pdf.fileType, 64, 'application/pdf'),
          uploadedAt: cleanStr(pdf.uploadedAt, 64),
          dataChunk: slice
        }
      );
    }

    syncedAttachmentSignatures.add(attSig);

    void fetch('/api/osd/attachment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ osdId, attachment: pdf })
    }).catch(() => {});
  } catch (err) {
    console.warn('pushSingleOsdAttachment deferred:', err);
  }
}

async function getOsdPdfAttachment(osdId: string): Promise<string | null> {
  if (!osdId) return null;

  const localList = StorageService.getOsdReceipts();
  const matched = localList.find((o) => o.id === osdId || normKey(o.osdCode) === normKey(osdId));
  if (matched?.pdfAttachment?.dataUrl && matched.pdfAttachment.dataUrl.length > 50) {
    return matched.pdfAttachment.dataUrl;
  }

  const fbUser = auth.currentUser;
  if (fbUser && fbUser.emailVerified && !isFirestoreCircuitOpen()) {
    try {
      const safeOsdId = makeSafeDocId('att', osdId);
      const c0Id = `${safeOsdId}_c0`;
      const c0Ref = doc(db, 'workspaces', WORKSPACE_ID, 'osdAttachments', c0Id);
      const c0Snap = await safeGetDoc(c0Ref, `workspaces/${WORKSPACE_ID}/osdAttachments/${c0Id}`);

      if (c0Snap.exists()) {
        const d0 = c0Snap.data();
        const totalChunks = Number(d0?.totalChunks) || 1;
        const chunks: string[] = [String(d0?.dataChunk || '')];

        if (totalChunks > 1) {
          const reads = Array.from({ length: totalChunks - 1 }, (_, idx) => {
            const cid = `${safeOsdId}_c${idx + 1}`;
            return safeGetDoc(
              doc(db, 'workspaces', WORKSPACE_ID, 'osdAttachments', cid),
              `workspaces/${WORKSPACE_ID}/osdAttachments/${cid}`
            );
          });
          const otherSnaps = await Promise.all(reads);
          for (const s of otherSnaps) {
            if (s.exists()) {
              chunks.push(String(s.data()?.dataChunk || ''));
            }
          }
        }

        const fullDataUrl = chunks.join('');
        if (fullDataUrl && fullDataUrl.startsWith('data:')) {
          StorageService.cacheOsdPdfAttachment(osdId, fullDataUrl);
          return fullDataUrl;
        }
      }
    } catch (err) {
      console.warn('Error fetching osd attachment from cloud:', err);
    }
  }

  try {
    const res = await fetch(`/api/osd/attachment/${encodeURIComponent(osdId)}`);
    if (res.ok) {
      const json = await res.json();
      const url = json?.attachment?.dataUrl;
      if (url && typeof url === 'string') {
        StorageService.cacheOsdPdfAttachment(osdId, url);
        return url;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

async function preloadOsdAttachments(receipts: OsdReceipt[]): Promise<void> {
  const needsFetch = receipts.filter(
    (r) => r.pdfAttachment && (!r.pdfAttachment.dataUrl || r.pdfAttachment.dataUrl.length === 0)
  );
  if (needsFetch.length === 0) return;

  for (let i = 0; i < needsFetch.length; i += 2) {
    const batch = needsFetch.slice(i, i + 2);
    await Promise.all(batch.map((r) => getOsdPdfAttachment(r.id).catch(() => null)));
  }
}


function serializeMaterial(m: MaterialItem): Record<string, any> {
  return {
    id: cleanStr(m.id, 120, `mat-${Date.now()}`),
    code: cleanStr(m.code, 120, 'VT'),
    name: cleanStr(m.name, 300, cleanStr(m.code, 120, 'Vật tư')),
    unit: cleanStr(m.unit, 64, 'Bộ'),
    category: cleanStr(m.category, 200, 'Chung'),
    packageNo: cleanStr(m.packageNo, 160, ''),
    drawingNo: cleanStr(m.drawingNo, 200, ''),
    manufacturer: cleanStr(m.manufacturer, 200, ''),
    supplier: cleanStr(m.supplier, 200, ''),
    unitWeightKg: cleanNum(m.unitWeightKg, -1_000_000_000, 1_000_000_000),
    specification: cleanStr(m.specification, 400, ''),
    minStockAlert: cleanNum(m.minStockAlert, 0),
    notes: cleanStr(m.notes, 500, ''),
    updatedAt: cleanNum(m.updatedAt, 1)
  };
}

function deserializeMaterial(m: Record<string, any>): MaterialItem {
  return {
    id: cleanStr(m.id, 120, 'mat-0'),
    code: cleanStr(m.code, 120, 'VT'),
    name: cleanStr(m.name, 300, 'Vật tư'),
    unit: cleanStr(m.unit, 64, 'Bộ'),
    category: cleanStr(m.category, 200, 'Chung'),
    packageNo: cleanStr(m.packageNo, 160, ''),
    drawingNo: cleanStr(m.drawingNo, 200, ''),
    manufacturer: cleanStr(m.manufacturer, 200, ''),
    supplier: cleanStr(m.supplier, 200, ''),
    unitWeightKg: Number(m.unitWeightKg) || 0,
    specification: cleanStr(m.specification, 400, ''),
    minStockAlert: Number(m.minStockAlert) || 0,
    notes: cleanStr(m.notes, 500, ''),
    updatedAt: Number(m.updatedAt) || 1
  };
}

function serializeInboundItem(it: InboundItemDetail): Record<string, any> {
  return {
    id: cleanStr(it.id, 120, `in-it-${Math.random().toString(36).slice(2, 8)}`),
    materialCode: cleanStr(it.materialCode, 120, ''),
    materialName: cleanStr(it.materialName, 300, ''),
    unit: cleanStr(it.unit, 64, 'Bộ'),
    batchCode: cleanStr(it.batchCode, 120, ''),
    packingListNo: cleanStr(it.packingListNo, 200, ''),
    shipment: cleanStr(it.shipment, 200, ''),
    manufacturer: cleanStr(it.manufacturer, 200, ''),
    supplier: cleanStr(it.supplier, 200, ''),
    packageNo: cleanStr(it.packageNo, 160, ''),
    packageName: cleanStr(it.packageName, 240, ''),
    category: cleanStr(it.category, 200, ''),
    drawingNo: cleanStr(it.drawingNo, 200, ''),
    weightKg: cleanNum(it.weightKg, -1_000_000_000, 1_000_000_000),
    quantity: roundQty(it.quantity),
    unitPrice: cleanNum(it.unitPrice, 0),
    totalPrice: cleanNum(it.totalPrice, 0),
    storageLocation: cleanStr(it.storageLocation, 160, ''),
    warehouseName: cleanStr(it.warehouseName, 200, ''),
    conditionNote: cleanStr(it.conditionNote, 300, ''),
    note: cleanStr(it.note, 400, '')
  };
}

function deserializeInboundItem(m: Record<string, any>): InboundItemDetail {
  return {
    id: cleanStr(m.id, 120, ''),
    materialCode: cleanStr(m.materialCode, 120, ''),
    materialName: cleanStr(m.materialName, 300, ''),
    unit: cleanStr(m.unit, 64, 'Bộ'),
    batchCode: cleanStr(m.batchCode, 120, ''),
    packingListNo: cleanStr(m.packingListNo, 200, ''),
    shipment: cleanStr(m.shipment, 200, ''),
    manufacturer: cleanStr(m.manufacturer, 200, ''),
    supplier: cleanStr(m.supplier, 200, ''),
    packageNo: cleanStr(m.packageNo, 160, ''),
    packageName: cleanStr(m.packageName, 240, ''),
    category: cleanStr(m.category, 200, ''),
    drawingNo: cleanStr(m.drawingNo, 200, ''),
    weightKg: Number(m.weightKg) || 0,
    quantity: roundQty(m.quantity),
    unitPrice: Number(m.unitPrice) || 0,
    totalPrice: Number(m.totalPrice) || 0,
    storageLocation: cleanStr(m.storageLocation, 160, ''),
    warehouseName: cleanStr(m.warehouseName, 200, ''),
    conditionNote: cleanStr(m.conditionNote, 300, ''),
    note: cleanStr(m.note, 400, '')
  };
}

function serializeOutboundItem(it: OutboundItemDetail): Record<string, any> {
  return {
    id: cleanStr(it.id, 120, `out-it-${Math.random().toString(36).slice(2, 8)}`),
    materialCode: cleanStr(it.materialCode, 120, ''),
    materialName: cleanStr(it.materialName, 300, ''),
    unit: cleanStr(it.unit, 64, 'Bộ'),
    batchCode: cleanStr(it.batchCode, 120, ''),
    warehouseName: cleanStr(it.warehouseName, 200, ''),
    packingListNo: cleanStr(it.packingListNo, 200, ''),
    shipment: cleanStr(it.shipment, 200, ''),
    manufacturer: cleanStr(it.manufacturer, 200, ''),
    supplier: cleanStr(it.supplier, 200, ''),
    packageNo: cleanStr(it.packageNo, 160, ''),
    packageName: cleanStr(it.packageName, 240, ''),
    category: cleanStr(it.category, 200, ''),
    drawingNo: cleanStr(it.drawingNo, 200, ''),
    weightKg: cleanNum(it.weightKg, -1_000_000_000, 1_000_000_000),
    quantity: roundQty(it.quantity),
    unitPrice: cleanNum(it.unitPrice, 0),
    totalPrice: cleanNum(it.totalPrice, 0),
    purpose: cleanStr(it.purpose, 300, ''),
    note: cleanStr(it.note, 400, '')
  };
}

function deserializeOutboundItem(m: Record<string, any>): OutboundItemDetail {
  return {
    id: cleanStr(m.id, 120, ''),
    materialCode: cleanStr(m.materialCode, 120, ''),
    materialName: cleanStr(m.materialName, 300, ''),
    unit: cleanStr(m.unit, 64, 'Bộ'),
    batchCode: cleanStr(m.batchCode, 120, ''),
    warehouseName: cleanStr(m.warehouseName, 200, ''),
    packingListNo: cleanStr(m.packingListNo, 200, ''),
    shipment: cleanStr(m.shipment, 200, ''),
    manufacturer: cleanStr(m.manufacturer, 200, ''),
    supplier: cleanStr(m.supplier, 200, ''),
    packageNo: cleanStr(m.packageNo, 160, ''),
    packageName: cleanStr(m.packageName, 240, ''),
    category: cleanStr(m.category, 200, ''),
    drawingNo: cleanStr(m.drawingNo, 200, ''),
    weightKg: Number(m.weightKg) || 0,
    quantity: roundQty(m.quantity),
    unitPrice: Number(m.unitPrice) || 0,
    totalPrice: Number(m.totalPrice) || 0,
    purpose: cleanStr(m.purpose, 300, ''),
    note: cleanStr(m.note, 400, '')
  };
}

// ============================================================================
// Workspace Membership Bootstrap & Real-Time Listeners
// ============================================================================
async function ensureWorkspaceReady(
  fbUser: FirebaseUser,
  options?: { readTimeoutMs?: number; maxRetries?: number }
): Promise<boolean> {
  throwIfActiveSyncAborted();
  if (cloudConnectionPaused) {
    return false;
  }
  if (isFirestoreCircuitOpen()) {
    if (isFirestoreQuotaExhausted()) {
      emitCloudState({
        status: 'error',
        quotaExceeded: true,
        errorMessage: getLastFirestoreQuotaMessage()
      });
    } else {
      settleConnectingStateIfNeeded('Kết nối Cloud Firestore đang tạm gián đoạn. Vui lòng thử lại sau giây lát.');
    }
    return false;
  }
  if (currentState.quotaExceeded) {
    emitCloudState({
      status: verifiedWorkspaceUid === fbUser.uid ? 'connected' : 'connecting',
      quotaExceeded: false,
      errorMessage: null
    });
  }
  if (!fbUser.emailVerified) {
    emitCloudState({
      status: 'error',
      errorMessage: 'Tài khoản Google chưa xác minh email nên không thể kết nối Cloud Firestore.'
    });
    return false;
  }

  if (verifiedWorkspaceUid === fbUser.uid) {
    return true;
  }

  if (workspaceReadyPromise && workspaceReadyUid === fbUser.uid) {
    return workspaceReadyPromise;
  }

  workspaceReadyUid = fbUser.uid;
  workspaceReadyPromise = (async () => {
    const uid = fbUser.uid;
    hydrateRamStateFromCheckpoint(uid);
    const displayLabel = cleanStr(
      fbUser.displayName || fbUser.email || 'Thiết bị Kho',
      160,
      'Thiết bị Kho'
    );
    const wsPath = `workspaces/${WORKSPACE_ID}`;
    const memberPath = `workspaces/${WORKSPACE_ID}/members/${uid}`;
    const wsRef = doc(db, 'workspaces', WORKSPACE_ID);
    const memberRef = doc(db, 'workspaces', WORKSPACE_ID, 'members', uid);

    const createInitialBatch = async (memberRole: 'admin' | 'member') => {
      const batch = writeBatch(db);
      const localUsers = StorageService.getUsers();
      const localWhs = StorageService.getWarehouses();
      const localTomb = StorageService.getTombstones();
      const localMats = StorageService.getMaterials();
      const initManifest: WorkspaceManifestDoc = {
        workspaceId: WORKSPACE_ID,
        name: WORKSPACE_NAME,
        ownerUid: uid,
        updatedByUid: uid,
        status: 'active',
        allowSelfJoin: true,
        serverRevision: 1,
        metaRevision: 0,
        materialsRevision: 0,
        materialsCount: 0,
        materialsChunkCount: 0,
        materialsDigest: cleanStr(computeMaterialsDigest([]), 128, '0:0:0:0'),
        metaDigest: cleanStr(
          computeCloudSharedMetaDigest([], [], createEmptyTombstones(), [], [], []),
          128,
          'v2:0.0.0|0.0.0|0.0.0|0.0.0|0.0.0|0.0.0'
        ),
        accountChunkCount: 0,
        warehouseChunkCount: 0,
        tombstoneChunkCount: 0,
        inboundIndexChunkCount: 0,
        outboundIndexChunkCount: 0
      };
      batch.set(wsRef, {
        ...initManifest,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      batch.set(memberRef, {
        workspaceId: WORKSPACE_ID,
        uid,
        displayName: displayLabel,
        memberRole,
        status: 'active',
        updatedByUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      if (localUsers.length > 0 || localWhs.length > 0 || Object.keys(localTomb.inbound).length > 0) {
        cloudMetaDirty = true;
        cloudMetaUsersDirty = localUsers.length > 0;
        cloudMetaWarehousesDirty = localWhs.length > 0;
        cloudMetaTombstonesDirty = Object.keys(localTomb.inbound).length > 0;
      }
      if (StorageService.getOsdReceipts().length > 0) {
        cloudOsdDirty = true;
      }
      if (localMats.length > 0) {
        cloudMaterialsDirty = true;
      }
      if (StorageService.getInboundReceipts().length > 0) {
        cloudInboundDirty = true;
      }
      if (StorageService.getOutboundReceipts().length > 0) {
        cloudOutboundDirty = true;
      }
      try {
        await batch.commit();
        activeCloudWatchdog?.markConnected();
        if (cloudTransferTracker.isActive()) {
          cloudTransferTracker.recordUpload(estimateFirestoreValueBytes(initManifest) + 512);
        }
        knownExistingPaths.add(wsRef.path);
        knownExistingPaths.add(memberRef.path);
        cachedWsManifest = { data: initManifest, atMs: Date.now() };
      } catch (err) {
        if (isQuotaExceededError(err)) {
          notifyFirestoreQuotaExceeded(300_000, err);
        }
        if (isPermissionError(err)) {
          handleFirestoreError(err, OperationType.CREATE, wsPath);
        }
        throw err;
      }
    };

    const hasCompleteManifestSchema = (raw: Record<string, any> | undefined | null): boolean => {
      if (!raw) return false;
      const reqKeys = [
        'workspaceId',
        'name',
        'ownerUid',
        'updatedByUid',
        'status',
        'allowSelfJoin',
        'serverRevision',
        'metaRevision',
        'materialsRevision',
        'materialsCount',
        'materialsChunkCount',
        'materialsDigest',
        'metaDigest',
        'accountChunkCount',
        'warehouseChunkCount',
        'tombstoneChunkCount',
        'inboundIndexChunkCount',
        'outboundIndexChunkCount',
        'createdAt',
        'updatedAt'
      ];
      const actualKeys = Object.keys(raw);
      return actualKeys.length === reqKeys.length && reqKeys.every((k) => k in raw);
    };

    const repairWorkspaceManifestIfNeeded = async (raw: Record<string, any>) => {
      if (hasCompleteManifestSchema(raw) && (!isCloudAdmin(fbUser) || raw.allowSelfJoin === true)) {
        cachedWsManifest = { data: raw as WorkspaceManifestDoc, atMs: Date.now() };
        return;
      }
      const repaired: WorkspaceManifestDoc = {
        workspaceId: WORKSPACE_ID,
        name: cleanStr(raw.name, 200, WORKSPACE_NAME),
        ownerUid: cleanStr(raw.ownerUid, 128, uid),
        updatedByUid: uid,
        status: raw.status === 'archived' && !isCloudAdmin(fbUser) ? 'archived' : 'active',
        allowSelfJoin: isCloudAdmin(fbUser) ? true : raw.allowSelfJoin !== false,
        serverRevision: cleanNum(raw.serverRevision, 1),
        metaRevision: cleanNum(raw.metaRevision, 0),
        materialsRevision: cleanNum(raw.materialsRevision, 0),
        materialsCount: cleanNum(raw.materialsCount, 0),
        materialsChunkCount: cleanNum(raw.materialsChunkCount, 0, 2000),
        materialsDigest: cleanStr(raw.materialsDigest, 128, '0:0:0:0'),
        metaDigest: cleanStr(raw.metaDigest, 128, 'v2:0.0.0|0.0.0|0.0.0|0.0.0|0.0.0|0.0.0'),
        accountChunkCount: cleanNum(raw.accountChunkCount, 0, 50),
        warehouseChunkCount: cleanNum(raw.warehouseChunkCount, 0, 50),
        tombstoneChunkCount: cleanNum(raw.tombstoneChunkCount, 0, 500),
        inboundIndexChunkCount: cleanNum(raw.inboundIndexChunkCount, 0, 500),
        outboundIndexChunkCount: cleanNum(raw.outboundIndexChunkCount, 0, 500)
      };
      await setDoc(wsRef, {
        ...repaired,
        createdAt: raw.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      knownExistingPaths.add(wsRef.path);
      cachedWsManifest = { data: repaired, atMs: Date.now() };
    };

    // Đọc memberRef để kiểm tra tư cách thành viên
    const readTimeout = options?.readTimeoutMs;
    const readRetries = options?.maxRetries;
    const memberSnap = await safeGetDoc(memberRef, memberPath, readTimeout, readRetries);
    if (memberSnap.exists()) {
      const mData = memberSnap.data();
      if (mData.status !== 'active') {
        emitCloudState({
          status: 'error',
          errorMessage: 'Quyền truy cập đám mây của tài khoản Google này đã bị thu hồi.'
        });
        return false;
      }
      const wsSnap = await safeGetDoc(wsRef, wsPath, readTimeout, readRetries);
      if (!wsSnap.exists()) {
        await createInitialBatch(isCloudAdmin(fbUser) ? 'admin' : 'member');
      } else {
        if (isCloudAdmin(fbUser)) {
          await repairWorkspaceManifestIfNeeded(wsSnap.data());
        } else {
          cachedWsManifest = { data: wsSnap.data() as WorkspaceManifestDoc, atMs: Date.now() };
        }
      }
      verifiedWorkspaceUid = uid;
      return true;
    }

    if (isCloudAdmin(fbUser)) {
      const wsSnap = await safeGetDoc(wsRef, wsPath, readTimeout, readRetries);
      if (!wsSnap.exists()) {
        await createInitialBatch('admin');
      } else {
        await repairWorkspaceManifestIfNeeded(wsSnap.data());
        await setDoc(memberRef, {
          workspaceId: WORKSPACE_ID,
          uid,
          displayName: displayLabel,
          memberRole: 'admin',
          status: 'active',
          updatedByUid: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        knownExistingPaths.add(memberRef.path);
      }
      verifiedWorkspaceUid = uid;
      return true;
    }

    // Nhân viên / Quản lý kho (ngoài Admin gốc): tự động đăng ký thành viên vào workspace hiện hữu
    try {
      await setDoc(memberRef, {
        workspaceId: WORKSPACE_ID,
        uid,
        displayName: displayLabel,
        memberRole: 'member',
        status: 'active',
        updatedByUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      knownExistingPaths.add(memberRef.path);
      const wsSnap = await safeGetDoc(wsRef, wsPath, readTimeout, readRetries);
      if (wsSnap.exists()) {
        cachedWsManifest = { data: wsSnap.data() as WorkspaceManifestDoc, atMs: Date.now() };
      }
      verifiedWorkspaceUid = uid;
      return true;
    } catch (joinErr) {
      if (isQuotaExceededError(joinErr) || isFirestoreQuotaExhausted()) {
        notifyFirestoreQuotaExceeded(300_000, joinErr);
        return false;
      }
      try {
        const wsSnap = await safeGetDoc(wsRef, wsPath, readTimeout, readRetries);
        if (!wsSnap.exists()) {
          await createInitialBatch('member');
          verifiedWorkspaceUid = uid;
          return true;
        }
      } catch (secondaryErr) {
        if (isQuotaExceededError(secondaryErr) || isFirestoreQuotaExhausted()) {
          notifyFirestoreQuotaExceeded(300_000, secondaryErr);
          return false;
        }
      }
      emitCloudState({
        status: 'error',
        quotaExceeded: false,
        errorMessage: 'Không thể tham gia không gian đồng bộ kho (Vui lòng nhờ Quản trị viên mở ứng dụng đồng bộ trước 1 lần hoặc kiểm tra quyền truy cập).'
      });
      return false;
    }
  })();

  try {
    const ready = await workspaceReadyPromise;
    if (!ready) {
      workspaceReadyPromise = null;
      workspaceReadyUid = null;
      settleConnectingStateIfNeeded();
    }
    return ready;
  } catch (err) {
    workspaceReadyPromise = null;
    workspaceReadyUid = null;
    verifiedWorkspaceUid = null;
    if (isQuotaExceededError(err)) {
      notifyFirestoreQuotaExceeded(300_000, err);
    } else {
      settleConnectingStateIfNeeded(err instanceof Error ? err.message : undefined);
    }
    throw err;
  }
}

function attachOsdRealtimeListener(): void {
  if (cloudConnectionPaused || osdUnsub || !auth.currentUser) return;
  const osdPath = `workspaces/${WORKSPACE_ID}/metaChunks/osd_0`;
  const osdRef = doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', 'osd_0');

  osdUnsub = onSnapshot(
    osdRef,
    (snap) => {
      if (!snap.exists()) return;
      knownExistingPaths.add(osdRef.path);
      const data = snap.data();
      const rawItems = Array.isArray(data?.items) ? data.items : [];
      const remoteOsd: OsdReceipt[] = [];
      for (const raw of rawItems) {
        if (raw && typeof raw === 'object') {
          remoteOsd.push(deserializeOsdPublic(raw));
        }
      }
      const changed = StorageService.applyRemoteOsdReceipts(remoteOsd);
      lastSyncedOsdDigest = computeOsdOnlyDigest(StorageService.getOsdReceipts(), StorageService.getTombstones());
      if (changed) {
        void preloadOsdAttachments(remoteOsd);
        externalOnRemoteOsdChange?.(remoteOsd);
      }
    },
    (err) => {
      if (isQuotaExceededError(err)) {
        notifyFirestoreQuotaExceeded(300_000, err);
        return;
      }
      try {
        handleFirestoreError(err, OperationType.GET, osdPath);
      } catch {
        // ignore transient error
      }
    }
  );
}

function extractTimestampMs(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (val && typeof val === 'object') {
    const obj = val as { toMillis?: () => number; seconds?: number };
    if (typeof obj.toMillis === 'function') {
      const ms = obj.toMillis();
      return Number.isFinite(ms) ? ms : 0;
    }
    if (typeof obj.seconds === 'number' && Number.isFinite(obj.seconds)) {
      return obj.seconds * 1000;
    }
  }
  return 0;
}

function attachWorkspaceRealtimeListener(): void {
  if (cloudConnectionPaused) return;
  attachOsdRealtimeListener();
  if (workspaceUnsub || !auth.currentUser) return;
  const wsPath = `workspaces/${WORKSPACE_ID}`;
  const wsRef = doc(db, 'workspaces', WORKSPACE_ID);

  workspaceUnsub = onSnapshot(
    wsRef,
    (snap) => {
      if (!snap.exists()) return;
      knownExistingPaths.add(wsRef.path);
      const data = snap.data() as WorkspaceManifestDoc;
      cachedWsManifest = { data, atMs: Date.now() };
      const rev = Number(data.serverRevision) || 0;
      const remoteMetaDigest = String(data.metaDigest || '');
      const remoteMatDigest = String(data.materialsDigest || '');
      const remoteUpdatedAt = extractTimestampMs((data as unknown as Record<string, unknown>).updatedAt);
      latestObservedRemoteServerRev = Math.max(latestObservedRemoteServerRev, rev);
      latestObservedRemoteMetaDigest = remoteMetaDigest;
      latestObservedRemoteMaterialsDigest = remoteMatDigest;
      if (remoteUpdatedAt > latestObservedRemoteUpdatedAtMs) {
        latestObservedRemoteUpdatedAtMs = remoteUpdatedAt;
      }
      if (
        hasRemoteManifestChanged({
          remoteServerRev: rev,
          remoteMetaDigest,
          remoteMaterialsDigest: remoteMatDigest,
          lastAppliedServerRev: lastAppliedCloudServerRev,
          lastAppliedMetaDigest: lastAppliedCloudMetaDigest,
          lastAppliedMaterialsDigest: lastAppliedCloudMaterialsDigest
        })
      ) {
        if (interactiveAuthInFlight) {
          deferredRemoteChangeDuringAuth = true;
        } else {
          deferredRemoteChangeDuringAuth = false;
          externalOnRemoteWorkspaceChange?.();
        }
      }
    },
    (err) => {
      if (isQuotaExceededError(err)) {
        const msg = notifyFirestoreQuotaExceeded(300_000, err);
        pauseCloudConnection(msg, { quotaExceeded: true });
        return;
      }
      try {
        handleFirestoreError(err, OperationType.GET, wsPath);
      } catch {
        pauseCloudConnection(err);
      }
    }
  );
}

function detachAllListeners(): void {
  if (workspaceUnsub) {
    workspaceUnsub();
    workspaceUnsub = null;
  }
  if (osdUnsub) {
    osdUnsub();
    osdUnsub = null;
  }
  if (sessionUnsub) {
    sessionUnsub();
    sessionUnsub = null;
  }
  watchedSessionDocId = null;
}

// ============================================================================
// Pull / Push Chunk Helpers
// ============================================================================
interface PullMetaFlags {
  pullUsers?: boolean;
  pullWarehouses?: boolean;
  pullTombstones?: boolean;
  pullOsd?: boolean;
  osdRemoteCount?: number;
  deferAttachmentPreload?: boolean;
}

async function pullMetaFromCloud(
  wsData: WorkspaceManifestDoc,
  fbUser: FirebaseUser,
  flags: PullMetaFlags = {
    pullUsers: true,
    pullWarehouses: true,
    pullTombstones: true,
    pullOsd: true
  }
): Promise<OsdReceipt[]> {
  const pullUsers = flags.pullUsers !== false;
  const pullWarehouses = flags.pullWarehouses !== false;
  const pullTombstones = flags.pullTombstones !== false;
  const pullOsd = flags.pullOsd !== false;
  const osdRemoteCount = Number(flags.osdRemoteCount) || 0;
  const cfg = getCloudFetchConfig();

  type MetaChunkTask = {
    kind: 'tomb' | 'acc' | 'wh' | 'osd';
    idx: number;
    ref: DocumentReference;
    pathLabel: string;
  };
  const tasks: MetaChunkTask[] = [];

  if (pullTombstones) {
    for (let i = 0; i < (Number(wsData.tombstoneChunkCount) || 0); i++) {
      const cid = `tomb_${i}`;
      tasks.push({
        kind: 'tomb',
        idx: i,
        ref: doc(db, 'workspaces', WORKSPACE_ID, 'tombstoneChunks', cid),
        pathLabel: `workspaces/${WORKSPACE_ID}/tombstoneChunks/${cid}`
      });
    }
  }

  if (pullUsers) {
    for (let i = 0; i < (Number(wsData.accountChunkCount) || 0); i++) {
      const cid = `accounts_${i}`;
      tasks.push({
        kind: 'acc',
        idx: i,
        ref: doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', cid),
        pathLabel: `workspaces/${WORKSPACE_ID}/metaChunks/${cid}`
      });
    }
  }

  if (pullWarehouses) {
    for (let i = 0; i < (Number(wsData.warehouseChunkCount) || 0); i++) {
      const cid = `warehouses_${i}`;
      tasks.push({
        kind: 'wh',
        idx: i,
        ref: doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', cid),
        pathLabel: `workspaces/${WORKSPACE_ID}/metaChunks/${cid}`
      });
    }
  }

  if (pullOsd) {
    tasks.push({
      kind: 'osd',
      idx: 0,
      ref: doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', 'osd_0'),
      pathLabel: `workspaces/${WORKSPACE_ID}/metaChunks/osd_0`
    });
    if (osdRemoteCount > CLOUD_CHUNK_SIZE) {
      tasks.push({
        kind: 'osd',
        idx: 1,
        ref: doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', 'osd_1'),
        pathLabel: `workspaces/${WORKSPACE_ID}/metaChunks/osd_1`
      });
    }
  }

  const fetchedSnaps = await runWithConcurrencyLimit(
    tasks,
    cfg.concurrency,
    (t) => safeGetDoc(t.ref, t.pathLabel),
    getSyncAbortOptions()
  );

  const tombSnaps: any[] = [];
  const accSnaps: any[] = [];
  const whSnaps: any[] = [];
  const osdSnaps: any[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const snap = fetchedSnaps[i];
    if (t.kind === 'tomb') tombSnaps[t.idx] = snap;
    else if (t.kind === 'acc') accSnaps[t.idx] = snap;
    else if (t.kind === 'wh') whSnaps[t.idx] = snap;
    else if (t.kind === 'osd') osdSnaps[t.idx] = snap;
  }

  if (pullOsd && osdRemoteCount === 0 && osdSnaps.length === 1 && osdSnaps[0]?.exists()) {
    const osd0Items = Array.isArray(osdSnaps[0].data().items) ? osdSnaps[0].data().items : [];
    if (osd0Items.length >= CLOUD_CHUNK_SIZE) {
      const osd1Snap = await safeGetDoc(
        doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', 'osd_1'),
        `workspaces/${WORKSPACE_ID}/metaChunks/osd_1`
      );
      osdSnaps.push(osd1Snap);
    }
  }

  const remoteOsd: OsdReceipt[] = [];
  if (pullOsd) {
    for (let i = 0; i < osdSnaps.length; i++) {
      const snap = osdSnaps[i];
      if (!snap || !snap.exists()) continue;
      const items = Array.isArray(snap.data().items) ? snap.data().items : [];
      ramChunkDigests[`osd_${i}`] = computeItemsChunkDigest(items);
      for (const raw of items) {
        if (raw && typeof raw === 'object') {
          remoteOsd.push(deserializeOsdPublic(raw));
        }
      }
    }
  }

  const remoteTombstones = createEmptyTombstones();
  if (pullTombstones) {
    for (let i = 0; i < tombSnaps.length; i++) {
      const snap = tombSnaps[i];
      if (!snap || !snap.exists()) continue;
      const items = Array.isArray(snap.data().items) ? snap.data().items : [];
      ramChunkDigests[`tomb_${i}`] = computeItemsChunkDigest(items);
      for (const entry of items) {
        const bucket = entry?.bucket as keyof TombstoneMap;
        const key = String(entry?.key || '');
        const ts = Number(entry?.deletedAtMs) || 0;
        if (key && ts > 0 && remoteTombstones[bucket]) {
          remoteTombstones[bucket][key] = Math.max(remoteTombstones[bucket][key] || 0, ts);
        }
      }
    }
  }

  const existingLocalUsers = pullUsers ? StorageService.getUsers() : [];
  const existingUsersById = new Map<string, User>();
  const existingUsersByUsername = new Map<string, User>();
  for (const lu of existingLocalUsers) {
    if (lu.id) existingUsersById.set(lu.id, lu);
    if (lu.username) existingUsersByUsername.set(normUserKey(lu.username), lu);
  }

  const remoteUsers: User[] = [];
  if (pullUsers) {
    for (let i = 0; i < accSnaps.length; i++) {
      const snap = accSnaps[i];
      if (!snap || !snap.exists()) continue;
      const items = Array.isArray(snap.data().items) ? snap.data().items : [];
      ramChunkDigests[`accounts_${i}`] = computeItemsChunkDigest(items);
      for (const raw of items) {
        if (raw && typeof raw === 'object') {
          remoteUsers.push(deserializeAccountPublic(raw));
        }
      }
    }
  }

  const existingLocalWhs = pullWarehouses ? StorageService.getWarehouses() : [];
  const existingWhsById = new Map<string, Warehouse>();
  const existingWhsByCode = new Map<string, Warehouse>();
  for (const lw of existingLocalWhs) {
    if (lw.id) existingWhsById.set(lw.id, lw);
    if (lw.code) existingWhsByCode.set(normKey(lw.code), lw);
  }

  const remoteWarehouses: Warehouse[] = [];
  if (pullWarehouses) {
    for (let i = 0; i < whSnaps.length; i++) {
      const snap = whSnaps[i];
      if (!snap || !snap.exists()) continue;
      const items = Array.isArray(snap.data().items) ? snap.data().items : [];
      ramChunkDigests[`warehouses_${i}`] = computeItemsChunkDigest(items);
      for (const raw of items) {
        if (raw && typeof raw === 'object') {
          remoteWarehouses.push(deserializeWarehousePublic(raw));
        }
      }
    }
  }

  // Nếu là Admin, chỉ tải PII (email, phone) cho bản ghi mới hoặc có updatedAt khác bản cục bộ
  const targetMetaRev = Number(wsData.metaRevision) || 0;
  if (isCloudAdmin(fbUser) && (pullUsers || pullWarehouses)) {
    const piiTasks: Array<() => Promise<void>> = [];
    if (pullUsers) {
      for (const u of remoteUsers) {
        const localMatch =
          existingUsersById.get(u.id) || existingUsersByUsername.get(normUserKey(u.username));
        const needsPiiFetch =
          !localMatch ||
          Number(localMatch.updatedAt) !== Number(u.updatedAt) ||
          (Boolean(u.emailDigest) && !localMatch.email);
        if (!needsPiiFetch && localMatch) {
          if (localMatch.email) {
            u.email = localMatch.email;
            u.emailDigest = computeEmailAuthDigest(localMatch.email) || u.emailDigest;
          }
          if (localMatch.phone) u.phone = localMatch.phone;
          continue;
        }
        const piiId = makeSafeDocId('accpii', u.id || normUserKey(u.username));
        piiTasks.push(async () => {
          const snap = await safeGetDoc(
            doc(db, 'workspaces', WORKSPACE_ID, 'accountPrivate', piiId),
            `workspaces/${WORKSPACE_ID}/accountPrivate/${piiId}`
          );
          if (snap.exists()) {
            const d = snap.data();
            const email = cleanStr(d.email, 200, '');
            const phone = cleanStr(d.phone, 64, '');
            if (email) {
              u.email = email;
              u.emailDigest = computeEmailAuthDigest(email) || u.emailDigest;
            }
            if (phone) u.phone = phone;
            ramChunkDigests[`accpii_${piiId}`] = computeRecordDigest({ email, phone });
          }
        });
      }
    }

    if (pullWarehouses) {
      for (const w of remoteWarehouses) {
        const localMatch = existingWhsById.get(w.id) || existingWhsByCode.get(normKey(w.code));
        const needsPiiFetch =
          !localMatch || Number(localMatch.updatedAt) !== Number(w.updatedAt);
        if (!needsPiiFetch && localMatch) {
          if (localMatch.phone) w.phone = localMatch.phone;
          continue;
        }
        const piiId = makeSafeDocId('whpii', w.id || normKey(w.code));
        piiTasks.push(async () => {
          const snap = await safeGetDoc(
            doc(db, 'workspaces', WORKSPACE_ID, 'warehousePrivate', piiId),
            `workspaces/${WORKSPACE_ID}/warehousePrivate/${piiId}`
          );
          if (snap.exists()) {
            const d = snap.data();
            const phone = cleanStr(d.phone, 64, '');
            if (phone) w.phone = phone;
            ramChunkDigests[`whpii_${piiId}`] = computeRecordDigest({ phone });
          }
        });
      }
    }

    if (piiTasks.length > 0) {
      await runWithConcurrencyLimit(piiTasks, cfg.concurrency, (fn) => fn());
    }
    if (pullUsers) {
      adminPiiLoadedForMetaRev = targetMetaRev;
    }
  }

  if (pullUsers || pullWarehouses || pullTombstones) {
    StorageService.applyRemoteMeta({
      users: pullUsers ? remoteUsers : undefined,
      warehouses: pullWarehouses ? remoteWarehouses : undefined,
      tombstones: pullTombstones ? remoteTombstones : undefined
    });
  }

  if (pullOsd) {
    StorageService.applyRemoteOsdReceipts(remoteOsd);
    if (!flags.deferAttachmentPreload) {
      void preloadOsdAttachments(remoteOsd);
    }
    externalOnRemoteOsdChange?.(remoteOsd);
  }
  return remoteOsd;
}

interface PushMetaOptions {
  pushUsers?: boolean;
  pushWarehouses?: boolean;
  pushTombstones?: boolean;
  pushOsd?: boolean;
  forceAll?: boolean;
  existingAccountChunkCount?: number;
  existingWarehouseChunkCount?: number;
  existingTombstoneChunkCount?: number;
  existingOsdChunkCount?: number;
}

async function pushMetaToCloud(
  fbUser: FirebaseUser,
  options: PushMetaOptions = {
    pushUsers: true,
    pushWarehouses: true,
    pushTombstones: true,
    pushOsd: true
  }
): Promise<{
  accountChunkCount: number;
  warehouseChunkCount: number;
  tombstoneChunkCount: number;
  metaDigest: string;
}> {
  const pushUsers = options.pushUsers !== false;
  const pushWarehouses = options.pushWarehouses !== false;
  const pushTombstones = options.pushTombstones !== false;
  const pushOsd = options.pushOsd !== false;
  const forceAll = Boolean(options.forceAll);
  const baselineDigests = forceAll ? {} : ramChunkDigests;

  const users = StorageService.getUsers();
  const warehouses = StorageService.getWarehouses();
  const tombstones = StorageService.getTombstones();
  const osdList = StorageService.getOsdReceipts();

  const staged: StagedDocWrite[] = [];
  const committedDigestUpdates: Record<string, string> = {};

  let accountChunkCount = Number(options.existingAccountChunkCount) || 0;
  if (pushUsers) {
    const accChunks = chunkArray(users.map(serializeAccountPublic), CLOUD_CHUNK_SIZE);
    const { dirtyIndices, nextDigests } = diffChunkDigests(
      accChunks,
      baselineDigests,
      'accounts_',
      forceAll ? 0 : accountChunkCount
    );
    Object.assign(committedDigestUpdates, nextDigests);
    for (const i of dirtyIndices) {
      const cid = `accounts_${i}`;
      staged.push({
        ref: doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', cid),
        pathLabel: `workspaces/${WORKSPACE_ID}/metaChunks/${cid}`,
        immutableCreateFields: {
          workspaceId: WORKSPACE_ID,
          chunkType: 'accounts',
          chunkIndex: i
        },
        mutableFields: {
          items: accChunks[i]
        }
      });
    }
    accountChunkCount = accChunks.length;

    if (isCloudAdmin(fbUser)) {
      for (const u of users) {
        if (u.email || u.phone) {
          const piiId = makeSafeDocId('accpii', u.id || normUserKey(u.username));
          const piiMutable = {
            email: cleanStr(u.email, 200, ''),
            phone: cleanStr(u.phone, 64, '')
          };
          const recDigest = computeRecordDigest(piiMutable);
          const recKey = `accpii_${piiId}`;
          if (forceAll || baselineDigests[recKey] !== recDigest) {
            committedDigestUpdates[recKey] = recDigest;
            staged.push({
              ref: doc(db, 'workspaces', WORKSPACE_ID, 'accountPrivate', piiId),
              pathLabel: `workspaces/${WORKSPACE_ID}/accountPrivate/${piiId}`,
              immutableCreateFields: {
                workspaceId: WORKSPACE_ID,
                accountId: piiId
              },
              mutableFields: piiMutable
            });
          }
        }
      }
    }
  }

  let warehouseChunkCount = Number(options.existingWarehouseChunkCount) || 0;
  if (pushWarehouses) {
    const whChunks = chunkArray(warehouses.map(serializeWarehousePublic), CLOUD_CHUNK_SIZE);
    const { dirtyIndices, nextDigests } = diffChunkDigests(
      whChunks,
      baselineDigests,
      'warehouses_',
      forceAll ? 0 : warehouseChunkCount
    );
    Object.assign(committedDigestUpdates, nextDigests);
    for (const i of dirtyIndices) {
      const cid = `warehouses_${i}`;
      staged.push({
        ref: doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', cid),
        pathLabel: `workspaces/${WORKSPACE_ID}/metaChunks/${cid}`,
        immutableCreateFields: {
          workspaceId: WORKSPACE_ID,
          chunkType: 'warehouses',
          chunkIndex: i
        },
        mutableFields: {
          items: whChunks[i]
        }
      });
    }
    warehouseChunkCount = whChunks.length;

    if (isCloudAdmin(fbUser)) {
      for (const w of warehouses) {
        if (w.phone) {
          const piiId = makeSafeDocId('whpii', w.id || normKey(w.code));
          const piiMutable = {
            phone: cleanStr(w.phone, 64, '')
          };
          const recDigest = computeRecordDigest(piiMutable);
          const recKey = `whpii_${piiId}`;
          if (forceAll || baselineDigests[recKey] !== recDigest) {
            committedDigestUpdates[recKey] = recDigest;
            staged.push({
              ref: doc(db, 'workspaces', WORKSPACE_ID, 'warehousePrivate', piiId),
              pathLabel: `workspaces/${WORKSPACE_ID}/warehousePrivate/${piiId}`,
              immutableCreateFields: {
                workspaceId: WORKSPACE_ID,
                warehouseId: piiId
              },
              mutableFields: piiMutable
            });
          }
        }
      }
    }
  }

  if (pushOsd) {
    const osdChunks = chunkArray(osdList.map(serializeOsdPublic), CLOUD_CHUNK_SIZE);
    const effectiveOsdChunks = osdChunks.length > 0 ? osdChunks : [[]];
    const knownOsdChunkCount =
      options.existingOsdChunkCount !== undefined
        ? Number(options.existingOsdChunkCount) || 0
        : effectiveOsdChunks.length;
    const { dirtyIndices, nextDigests } = diffChunkDigests(
      effectiveOsdChunks,
      baselineDigests,
      'osd_',
      forceAll ? 0 : knownOsdChunkCount
    );
    Object.assign(committedDigestUpdates, nextDigests);
    for (const i of dirtyIndices) {
      const cid = `osd_${i}`;
      staged.push({
        ref: doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', cid),
        pathLabel: `workspaces/${WORKSPACE_ID}/metaChunks/${cid}`,
        immutableCreateFields: {
          workspaceId: WORKSPACE_ID,
          chunkType: 'osd',
          chunkIndex: i
        },
        mutableFields: {
          items: effectiveOsdChunks[i]
        }
      });
    }
  }

  let tombstoneChunkCount = Number(options.existingTombstoneChunkCount) || 0;
  if (pushTombstones) {
    const flatTombItems: Array<{ bucket: string; key: string; deletedAtMs: number }> = [];
    const buckets: Array<keyof TombstoneMap> = [
      'inbound',
      'outbound',
      'materials',
      'warehouses',
      'users',
      'osd'
    ];
    for (const b of buckets) {
      const map = tombstones[b] || {};
      for (const [k, ts] of Object.entries(map)) {
        const numTs = Number(ts) || 0;
        if (k && numTs > 0) {
          flatTombItems.push({
            bucket: b,
            key: cleanStr(k, 160, 'k'),
            deletedAtMs: cleanNum(numTs, 1)
          });
        }
      }
    }

    const tombChunks = chunkArray(flatTombItems, CLOUD_CHUNK_SIZE);
    const { dirtyIndices, nextDigests } = diffChunkDigests(
      tombChunks,
      baselineDigests,
      'tomb_',
      forceAll ? 0 : tombstoneChunkCount
    );
    Object.assign(committedDigestUpdates, nextDigests);
    for (const i of dirtyIndices) {
      const cid = `tomb_${i}`;
      staged.push({
        ref: doc(db, 'workspaces', WORKSPACE_ID, 'tombstoneChunks', cid),
        pathLabel: `workspaces/${WORKSPACE_ID}/tombstoneChunks/${cid}`,
        immutableCreateFields: {
          workspaceId: WORKSPACE_ID,
          chunkIndex: i
        },
        mutableFields: {
          items: tombChunks[i]
        }
      });
    }
    tombstoneChunkCount = tombChunks.length;
  }

  if (staged.length > 0) {
    await commitStagedWrites(staged);
  }
  Object.assign(ramChunkDigests, committedDigestUpdates);

  if (pushOsd) {
    lastSyncedOsdDigest = computeOsdOnlyDigest(osdList, tombstones);
    for (const o of osdList) {
      if (o.pdfAttachment?.dataUrl && o.pdfAttachment.dataUrl.length > 50) {
        void pushSingleOsdAttachment(o.id, o.pdfAttachment).catch(() => {});
      }
    }
  }

  return {
    accountChunkCount,
    warehouseChunkCount,
    tombstoneChunkCount,
    metaDigest: cleanStr(
      computeCloudSharedMetaDigest(users, warehouses, tombstones, osdList),
      128,
      'v2:0.0.0|0.0.0|0.0.0|0.0.0|0.0.0|0.0.0'
    )
  };
}

async function pushOsdOnlyChunksToCloud(existingWsData?: WorkspaceManifestDoc | null): Promise<{
  tombstoneChunkCount: number;
  metaDigest: string;
  tombstonesPushed: boolean;
}> {
  const osdList = StorageService.getOsdReceipts();
  const tombstones = StorageService.getTombstones();
  const users = StorageService.getUsers();
  const warehouses = StorageService.getWarehouses();
  const staged: StagedDocWrite[] = [];
  const committedDigestUpdates: Record<string, string> = {};

  const osdChunks = chunkArray(osdList.map(serializeOsdPublic), CLOUD_CHUNK_SIZE);
  const effectiveOsdChunks = osdChunks.length > 0 ? osdChunks : [[]];
  const osdDiff = diffChunkDigests(
    effectiveOsdChunks,
    ramChunkDigests,
    'osd_',
    effectiveOsdChunks.length
  );
  Object.assign(committedDigestUpdates, osdDiff.nextDigests);
  for (const i of osdDiff.dirtyIndices) {
    const cid = `osd_${i}`;
    staged.push({
      ref: doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', cid),
      pathLabel: `workspaces/${WORKSPACE_ID}/metaChunks/${cid}`,
      immutableCreateFields: {
        workspaceId: WORKSPACE_ID,
        chunkType: 'osd',
        chunkIndex: i
      },
      mutableFields: {
        items: effectiveOsdChunks[i]
      }
    });
  }

  let tombstoneChunkCount = Number(existingWsData?.tombstoneChunkCount) || 0;
  let tombstonesPushed = false;
  const remoteV2 = parseMetaDigestV2(existingWsData?.metaDigest);
  const localTombPart = computeTombstonesDomainDigest(tombstones);
  const shouldPushTombstones =
    cloudMetaTombstonesDirty || (remoteV2 !== null && remoteV2.t !== localTombPart);

  if (shouldPushTombstones) {
    const flatTombItems: Array<{ bucket: string; key: string; deletedAtMs: number }> = [];
    const buckets: Array<keyof TombstoneMap> = [
      'inbound',
      'outbound',
      'materials',
      'warehouses',
      'users',
      'osd'
    ];
    for (const b of buckets) {
      const map = tombstones[b] || {};
      for (const [k, ts] of Object.entries(map)) {
        const numTs = Number(ts) || 0;
        if (k && numTs > 0) {
          flatTombItems.push({
            bucket: b,
            key: cleanStr(k, 160, 'k'),
            deletedAtMs: cleanNum(numTs, 1)
          });
        }
      }
    }

    const tombChunks = chunkArray(flatTombItems, CLOUD_CHUNK_SIZE);
    const tombDiff = diffChunkDigests(tombChunks, ramChunkDigests, 'tomb_', tombstoneChunkCount);
    Object.assign(committedDigestUpdates, tombDiff.nextDigests);
    for (const i of tombDiff.dirtyIndices) {
      const cid = `tomb_${i}`;
      staged.push({
        ref: doc(db, 'workspaces', WORKSPACE_ID, 'tombstoneChunks', cid),
        pathLabel: `workspaces/${WORKSPACE_ID}/tombstoneChunks/${cid}`,
        immutableCreateFields: {
          workspaceId: WORKSPACE_ID,
          chunkIndex: i
        },
        mutableFields: {
          items: tombChunks[i]
        }
      });
    }
    tombstoneChunkCount = tombChunks.length;
    tombstonesPushed = tombDiff.dirtyIndices.length > 0;
  }

  if (staged.length > 0) {
    await commitStagedWrites(staged);
  }
  Object.assign(ramChunkDigests, committedDigestUpdates);
  lastSyncedOsdDigest = computeOsdOnlyDigest(osdList, tombstones);

  for (const o of osdList) {
    if (o.pdfAttachment?.dataUrl && o.pdfAttachment.dataUrl.length > 50) {
      void pushSingleOsdAttachment(o.id, o.pdfAttachment).catch(() => {});
    }
  }

  const nextOsdPart = computeOsdDomainDigest(osdList);
  const nextMetaDigest = remoteV2
    ? encodeMetaDigestV2({
        u: remoteV2.u,
        w: remoteV2.w,
        t: shouldPushTombstones ? localTombPart : remoteV2.t,
        o: nextOsdPart,
        in: remoteV2.in,
        out: remoteV2.out
      })
    : cleanStr(
        computeCloudSharedMetaDigest(users, warehouses, tombstones, osdList),
        128,
        'v2:0.0.0|0.0.0|0.0.0|0.0.0|0.0.0|0.0.0'
      );

  return {
    tombstoneChunkCount,
    metaDigest: cleanStr(nextMetaDigest, 128, 'v2:0.0.0|0.0.0|0.0.0|0.0.0|0.0.0|0.0.0'),
    tombstonesPushed
  };
}

async function pullReceiptIndexMap(
  kind: 'inbound' | 'outbound',
  indexChunkCount: number,
  domainDigest = '',
  uid?: string | null
): Promise<{
  entries: Map<string, CloudReceiptIndexEntry>;
  chunkIndexByCode: Map<string, number>;
}> {
  const subcol = kind === 'inbound' ? 'inboundIndex' : 'outboundIndex';
  const digestPrefix = kind === 'inbound' ? 'in_idx_' : 'out_idx_';
  const entries = new Map<string, CloudReceiptIndexEntry>();
  const chunkIndexByCode = new Map<string, number>();
  if (indexChunkCount <= 0) {
    if (uid) {
      const cacheObj: ReceiptIndexCache = {
        uid,
        domainDigest,
        chunkCount: 0,
        entries: new Map(),
        chunkIndexByCode: new Map()
      };
      if (kind === 'inbound') cloudInboundIndexCache = cacheObj;
      else cloudOutboundIndexCache = cacheObj;
    }
    return { entries, chunkIndexByCode };
  }

  const cfg = getCloudFetchConfig();
  const idxIndices = Array.from({ length: indexChunkCount }, (_, idx) => idx);
  const snaps = await runWithConcurrencyLimit(
    idxIndices,
    cfg.concurrency,
    (idx) => {
      const cid = `idx_${idx}`;
      return safeGetDoc(
        doc(db, 'workspaces', WORKSPACE_ID, subcol, cid),
        `workspaces/${WORKSPACE_ID}/${subcol}/${cid}`
      );
    },
    getSyncAbortOptions()
  );

  for (let idx = 0; idx < snaps.length; idx++) {
    const snap = snaps[idx];
    if (!snap.exists()) continue;
    const items = Array.isArray(snap.data().items) ? snap.data().items : [];
    ramChunkDigests[`${digestPrefix}${idx}`] = computeItemsChunkDigest(items);
    for (const raw of items) {
      if (!raw || !raw.code || !raw.docId) continue;
      const code = normKey(raw.code);
      entries.set(code, {
        docId: String(raw.docId),
        code,
        id: String(raw.id || raw.code),
        itemCount: Number(raw.itemCount) || 0,
        chunkCount: Number(raw.chunkCount) || 0,
        appUpdatedAt: Number(raw.appUpdatedAt) || 1,
        itemsReplacedAt: Number(raw.itemsReplacedAt) || 0,
        digest: String(raw.digest || '0:0:0')
      });
      chunkIndexByCode.set(code, idx);
    }
  }

  if (uid) {
    const cacheObj: ReceiptIndexCache = {
      uid,
      domainDigest,
      chunkCount: indexChunkCount,
      entries: new Map(entries),
      chunkIndexByCode: new Map(chunkIndexByCode)
    };
    if (kind === 'inbound') cloudInboundIndexCache = cacheObj;
    else cloudOutboundIndexCache = cacheObj;
  }

  return { entries, chunkIndexByCode };
}

async function pullSingleInboundFromCloud(entry: CloudReceiptIndexEntry): Promise<InboundReceipt | null> {
  const headerRef = doc(db, 'workspaces', WORKSPACE_ID, 'inboundReceipts', entry.docId);
  const headerSnap = await safeGetDoc(
    headerRef,
    `workspaces/${WORKSPACE_ID}/inboundReceipts/${entry.docId}`
  );
  if (!headerSnap.exists()) return null;
  const h = headerSnap.data();
  const cCount = Number(h.chunkCount) || 0;

  const cfg = getCloudFetchConfig();
  const itemIndices = Array.from({ length: cCount }, (_, idx) => idx);
  const itemSnaps = await runWithConcurrencyLimit(
    itemIndices,
    cfg.itemChunkConcurrency,
    (idx) => {
      const cid = `${entry.docId}_c${idx}`;
      return safeGetDoc(
        doc(db, 'workspaces', WORKSPACE_ID, 'inboundItems', cid),
        `workspaces/${WORKSPACE_ID}/inboundItems/${cid}`
      );
    },
    getSyncAbortOptions()
  );

  const allItems: InboundItemDetail[] = [];
  for (const s of itemSnaps) {
    if (!s.exists()) continue;
    const arr = Array.isArray(s.data().items) ? s.data().items : [];
    for (const raw of arr) {
      allItems.push(deserializeInboundItem(raw));
    }
  }

  const sums = sumInboundItems(allItems);
  return {
    id: cleanStr(h.id, 160, entry.id),
    receiptCode: cleanStr(h.receiptCode, 160, entry.code),
    receiptDate: cleanStr(h.receiptDate, 40, ''),
    warehouseId: cleanStr(h.warehouseId, 160, ''),
    warehouseName: cleanStr(h.warehouseName, 300, ''),
    departmentName: cleanStr(h.departmentName, 300, '') || undefined,
    contractNo: cleanStr(h.contractNo, 200, '') || undefined,
    requestNo: cleanStr(h.requestNo, 200, '') || undefined,
    inboundType: h.inboundType === 'return' ? 'return' : 'new',
    amountInWords: cleanStr(h.amountInWords, 500, '') || undefined,
    attachedDocs: cleanStr(h.attachedDocs, 500, '') || undefined,
    supplier: cleanStr(h.supplier, 300, ''),
    manufacturer: cleanStr(h.manufacturer, 300, '') || undefined,
    shipment: cleanStr(h.shipment, 300, ''),
    packingListNo: cleanStr(h.packingListNo, 300, ''),
    delivererName: cleanStr(h.delivererName, 200, ''),
    receiverName: cleanStr(h.receiverName, 200, ''),
    driverVehicleNo: cleanStr(h.driverVehicleNo, 200, '') || undefined,
    notes: cleanStr(h.notes, 2000, '') || undefined,
    items: allItems,
    packageCount: sums.packageCount,
    totalQuantity: sums.totalQuantity,
    totalWeightKg: sums.totalWeightKg,
    totalAmount: sums.totalAmount,
    createdAt: cleanStr(h.createdAtIso, 64, new Date().toISOString()),
    createdBy: cleanStr(h.createdBy, 200, ''),
    updatedAt: Number(h.appUpdatedAt) || 1,
    itemsReplacedAt: Number(h.itemsReplacedAt) > 0 ? Number(h.itemsReplacedAt) : undefined,
    lastEditedBy: cleanStr(h.lastEditedBy, 200, '') || undefined,
    lastEditedAt: cleanStr(h.lastEditedAt, 64, '') || undefined
  };
}

function prepareInboundStagedWrites(rcp: InboundReceipt, isKnownNew = false): {
  entry: CloudReceiptIndexEntry;
  staged: StagedDocWrite[];
} {
  const code = normKey(rcp.receiptCode || rcp.id);
  const docId = makeSafeDocId('in', code);
  const items = Array.isArray(rcp.items) ? rcp.items : [];
  const itemChunks = chunkItemsByCountAndBytes(
    items.map(serializeInboundItem),
    CLOUD_CHUNK_SIZE,
    DOC_PAYLOAD_BYTE_LIMIT
  );
  const sums = sumInboundItems(items);
  const digest = cleanStr(computeInboundReceiptDigest(rcp), 128, '0:0:0');

  const headerFields = {
    id: cleanStr(rcp.id, 160, docId),
    receiptCode: cleanStr(rcp.receiptCode || rcp.id, 160, code || docId),
    receiptDate: cleanStr(rcp.receiptDate, 40, ''),
    warehouseId: cleanStr(rcp.warehouseId, 160, ''),
    warehouseName: cleanStr(rcp.warehouseName, 300, ''),
    departmentName: cleanStr(rcp.departmentName, 300, ''),
    contractNo: cleanStr(rcp.contractNo, 200, ''),
    requestNo: cleanStr(rcp.requestNo, 200, ''),
    inboundType: rcp.inboundType === 'return' ? 'return' : 'new',
    amountInWords: cleanStr(rcp.amountInWords, 500, ''),
    attachedDocs: cleanStr(rcp.attachedDocs, 500, ''),
    supplier: cleanStr(rcp.supplier, 300, ''),
    manufacturer: cleanStr(rcp.manufacturer, 300, ''),
    shipment: cleanStr(rcp.shipment, 300, ''),
    packingListNo: cleanStr(rcp.packingListNo, 300, ''),
    delivererName: cleanStr(rcp.delivererName, 200, ''),
    receiverName: cleanStr(rcp.receiverName, 200, ''),
    driverVehicleNo: cleanStr(rcp.driverVehicleNo, 200, ''),
    notes: cleanStr(rcp.notes, 2000, ''),
    packageCount: cleanNum(sums.packageCount, 0),
    totalQuantity: cleanNum(sums.totalQuantity, -100_000_000_000, 100_000_000_000),
    totalWeightKg: cleanNum(sums.totalWeightKg, -100_000_000_000, 100_000_000_000),
    totalAmount: cleanNum(sums.totalAmount, -100_000_000_000, 100_000_000_000),
    itemCount: items.length,
    chunkCount: itemChunks.length,
    digest,
    createdBy: cleanStr(rcp.createdBy, 200, ''),
    createdAtIso: cleanStr(rcp.createdAt, 64, new Date().toISOString()),
    appUpdatedAt: cleanNum(rcp.updatedAt || Date.now(), 1),
    itemsReplacedAt: cleanNum(rcp.itemsReplacedAt, 0),
    lastEditedBy: cleanStr(rcp.lastEditedBy, 200, ''),
    lastEditedAt: cleanStr(rcp.lastEditedAt, 64, '')
  };

  const staged: StagedDocWrite[] = [
    {
      ref: doc(db, 'workspaces', WORKSPACE_ID, 'inboundReceipts', docId),
      pathLabel: `workspaces/${WORKSPACE_ID}/inboundReceipts/${docId}`,
      immutableCreateFields: {
        workspaceId: WORKSPACE_ID,
        docId
      },
      mutableFields: headerFields,
      isKnownNew
    }
  ];

  for (let i = 0; i < itemChunks.length; i++) {
    const cid = `${docId}_c${i}`;
    staged.push({
      ref: doc(db, 'workspaces', WORKSPACE_ID, 'inboundItems', cid),
      pathLabel: `workspaces/${WORKSPACE_ID}/inboundItems/${cid}`,
      immutableCreateFields: {
        workspaceId: WORKSPACE_ID,
        receiptDocId: docId,
        chunkIndex: i
      },
      mutableFields: {
        items: itemChunks[i]
      },
      isKnownNew
    });
  }

  return {
    entry: {
      docId,
      code,
      id: headerFields.id,
      itemCount: items.length,
      chunkCount: itemChunks.length,
      appUpdatedAt: headerFields.appUpdatedAt,
      itemsReplacedAt: headerFields.itemsReplacedAt,
      digest
    },
    staged
  };
}

async function pushSingleInboundToCloud(rcp: InboundReceipt): Promise<CloudReceiptIndexEntry> {
  const prep = prepareInboundStagedWrites(rcp);
  if (prep.staged.length > 0) {
    await commitStagedWrites(prep.staged.slice(0, 1));
    if (prep.staged.length > 1) {
      await commitStagedWrites(prep.staged.slice(1));
    }
  }
  return prep.entry;
}

async function pushBulkInboundsToCloud(
  receipts: InboundReceipt[],
  existingIndexMap?: Map<string, CloudReceiptIndexEntry>
): Promise<CloudReceiptIndexEntry[]> {
  if (receipts.length === 0) return [];
  const headerStaged: StagedDocWrite[] = [];
  const itemStaged: StagedDocWrite[] = [];
  const entries: CloudReceiptIndexEntry[] = [];

  for (let i = 0; i < receipts.length; i++) {
    const code = normKey(receipts[i].receiptCode || receipts[i].id);
    const isBrandNew = existingIndexMap ? !existingIndexMap.has(code) : false;
    const prep = prepareInboundStagedWrites(receipts[i], isBrandNew);
    entries.push(prep.entry);
    if (prep.staged.length > 0) {
      headerStaged.push(prep.staged[0]);
      for (let k = 1; k < prep.staged.length; k++) {
        itemStaged.push(prep.staged[k]);
      }
    }
  }

  // Luôn ghi toàn bộ header phiếu trước khi ghi các chunk chi tiết vật tư để đảm bảo quy tắc tồn tại phiếu cha trong Firestore Rules
  await commitStagedWrites(headerStaged);
  if (itemStaged.length > 0) {
    await commitStagedWrites(itemStaged);
  }
  return entries;
}

async function pullSingleOutboundFromCloud(entry: CloudReceiptIndexEntry): Promise<OutboundReceipt | null> {
  const headerRef = doc(db, 'workspaces', WORKSPACE_ID, 'outboundReceipts', entry.docId);
  const headerSnap = await safeGetDoc(
    headerRef,
    `workspaces/${WORKSPACE_ID}/outboundReceipts/${entry.docId}`
  );
  if (!headerSnap.exists()) return null;
  const h = headerSnap.data();
  const cCount = Number(h.chunkCount) || 0;

  const cfg = getCloudFetchConfig();
  const itemIndices = Array.from({ length: cCount }, (_, idx) => idx);
  const itemSnaps = await runWithConcurrencyLimit(
    itemIndices,
    cfg.itemChunkConcurrency,
    (idx) => {
      const cid = `${entry.docId}_c${idx}`;
      return safeGetDoc(
        doc(db, 'workspaces', WORKSPACE_ID, 'outboundItems', cid),
        `workspaces/${WORKSPACE_ID}/outboundItems/${cid}`
      );
    },
    getSyncAbortOptions()
  );

  const allItems: OutboundItemDetail[] = [];
  for (const s of itemSnaps) {
    if (!s.exists()) continue;
    const arr = Array.isArray(s.data().items) ? s.data().items : [];
    for (const raw of arr) {
      allItems.push(deserializeOutboundItem(raw));
    }
  }

  const sums = sumOutboundItems(allItems);
  return {
    id: cleanStr(h.id, 160, entry.id),
    issueCode: cleanStr(h.issueCode, 160, entry.code),
    issueDate: cleanStr(h.issueDate, 40, ''),
    warehouseId: cleanStr(h.warehouseId, 160, ''),
    warehouseName: cleanStr(h.warehouseName, 300, ''),
    departmentName: cleanStr(h.departmentName, 300, '') || undefined,
    requestNo: cleanStr(h.requestNo, 200, '') || undefined,
    outboundType: h.outboundType === 'transfer' ? 'transfer' : 'issue',
    projectName: cleanStr(h.projectName, 300, '') || undefined,
    recipientDepartment: cleanStr(h.recipientDepartment, 300, ''),
    recipientName: cleanStr(h.recipientName, 200, ''),
    issuerName: cleanStr(h.issuerName, 200, ''),
    notes: cleanStr(h.notes, 2000, '') || undefined,
    items: allItems,
    packingListSummary: cleanStr(h.packingListSummary, 500, '') || computePackingListSummary(allItems),
    totalQuantity: sums.totalQuantity,
    totalWeightKg: sums.totalWeightKg,
    totalAmount: Number(h.totalAmount) || 0,
    createdAt: cleanStr(h.createdAtIso, 64, new Date().toISOString()),
    createdBy: cleanStr(h.createdBy, 200, ''),
    updatedAt: Number(h.appUpdatedAt) || 1,
    itemsReplacedAt: Number(h.itemsReplacedAt) > 0 ? Number(h.itemsReplacedAt) : undefined,
    lastEditedBy: cleanStr(h.lastEditedBy, 200, '') || undefined,
    lastEditedAt: cleanStr(h.lastEditedAt, 64, '') || undefined
  };
}

function prepareOutboundStagedWrites(rcp: OutboundReceipt, isKnownNew = false): {
  entry: CloudReceiptIndexEntry;
  staged: StagedDocWrite[];
} {
  const code = normKey(rcp.issueCode || rcp.id);
  const docId = makeSafeDocId('out', code);
  const items = Array.isArray(rcp.items) ? rcp.items : [];
  const itemChunks = chunkItemsByCountAndBytes(
    items.map(serializeOutboundItem),
    CLOUD_CHUNK_SIZE,
    DOC_PAYLOAD_BYTE_LIMIT
  );
  const sums = sumOutboundItems(items);
  const digest = cleanStr(computeOutboundReceiptDigest(rcp), 128, '0:0:0');

  const headerFields = {
    id: cleanStr(rcp.id, 160, docId),
    issueCode: cleanStr(rcp.issueCode || rcp.id, 160, code || docId),
    issueDate: cleanStr(rcp.issueDate, 40, ''),
    warehouseId: cleanStr(rcp.warehouseId, 160, ''),
    warehouseName: cleanStr(rcp.warehouseName, 300, ''),
    departmentName: cleanStr(rcp.departmentName, 300, ''),
    requestNo: cleanStr(rcp.requestNo, 200, ''),
    outboundType: rcp.outboundType === 'transfer' ? 'transfer' : 'issue',
    projectName: cleanStr(rcp.projectName, 300, ''),
    recipientDepartment: cleanStr(rcp.recipientDepartment, 300, ''),
    recipientName: cleanStr(rcp.recipientName, 200, ''),
    issuerName: cleanStr(rcp.issuerName, 200, ''),
    notes: cleanStr(rcp.notes, 2000, ''),
    packingListSummary: cleanStr(rcp.packingListSummary || computePackingListSummary(items), 500, ''),
    totalQuantity: cleanNum(sums.totalQuantity, -100_000_000_000, 100_000_000_000),
    totalWeightKg: cleanNum(sums.totalWeightKg, -100_000_000_000, 100_000_000_000),
    totalAmount: cleanNum(rcp.totalAmount, -100_000_000_000, 100_000_000_000),
    itemCount: items.length,
    chunkCount: itemChunks.length,
    digest,
    createdBy: cleanStr(rcp.createdBy, 200, ''),
    createdAtIso: cleanStr(rcp.createdAt, 64, new Date().toISOString()),
    appUpdatedAt: cleanNum(rcp.updatedAt || Date.now(), 1),
    itemsReplacedAt: cleanNum(rcp.itemsReplacedAt, 0),
    lastEditedBy: cleanStr(rcp.lastEditedBy, 200, ''),
    lastEditedAt: cleanStr(rcp.lastEditedAt, 64, '')
  };

  const staged: StagedDocWrite[] = [
    {
      ref: doc(db, 'workspaces', WORKSPACE_ID, 'outboundReceipts', docId),
      pathLabel: `workspaces/${WORKSPACE_ID}/outboundReceipts/${docId}`,
      immutableCreateFields: {
        workspaceId: WORKSPACE_ID,
        docId
      },
      mutableFields: headerFields,
      isKnownNew
    }
  ];

  for (let i = 0; i < itemChunks.length; i++) {
    const cid = `${docId}_c${i}`;
    staged.push({
      ref: doc(db, 'workspaces', WORKSPACE_ID, 'outboundItems', cid),
      pathLabel: `workspaces/${WORKSPACE_ID}/outboundItems/${cid}`,
      immutableCreateFields: {
        workspaceId: WORKSPACE_ID,
        receiptDocId: docId,
        chunkIndex: i
      },
      mutableFields: {
        items: itemChunks[i]
      },
      isKnownNew
    });
  }

  return {
    entry: {
      docId,
      code,
      id: headerFields.id,
      itemCount: items.length,
      chunkCount: itemChunks.length,
      appUpdatedAt: headerFields.appUpdatedAt,
      itemsReplacedAt: headerFields.itemsReplacedAt,
      digest
    },
    staged
  };
}

async function pushSingleOutboundToCloud(rcp: OutboundReceipt): Promise<CloudReceiptIndexEntry> {
  const prep = prepareOutboundStagedWrites(rcp);
  if (prep.staged.length > 0) {
    await commitStagedWrites(prep.staged.slice(0, 1));
    if (prep.staged.length > 1) {
      await commitStagedWrites(prep.staged.slice(1));
    }
  }
  return prep.entry;
}

async function pushBulkOutboundsToCloud(
  receipts: OutboundReceipt[],
  existingIndexMap?: Map<string, CloudReceiptIndexEntry>
): Promise<CloudReceiptIndexEntry[]> {
  if (receipts.length === 0) return [];
  const headerStaged: StagedDocWrite[] = [];
  const itemStaged: StagedDocWrite[] = [];
  const entries: CloudReceiptIndexEntry[] = [];

  for (let i = 0; i < receipts.length; i++) {
    const code = normKey(receipts[i].issueCode || receipts[i].id);
    const isBrandNew = existingIndexMap ? !existingIndexMap.has(code) : false;
    const prep = prepareOutboundStagedWrites(receipts[i], isBrandNew);
    entries.push(prep.entry);
    if (prep.staged.length > 0) {
      headerStaged.push(prep.staged[0]);
      for (let k = 1; k < prep.staged.length; k++) {
        itemStaged.push(prep.staged[k]);
      }
    }
  }

  // Luôn ghi toàn bộ header phiếu xuất trước khi ghi các chunk chi tiết vật tư để đảm bảo quy tắc tồn tại phiếu cha trong Firestore Rules
  await commitStagedWrites(headerStaged);
  if (itemStaged.length > 0) {
    await commitStagedWrites(itemStaged);
  }
  return entries;
}

async function writeReceiptIndexChunks(
  kind: 'inbound' | 'outbound',
  entriesMap: Map<string, CloudReceiptIndexEntry>,
  prevChunkIndexByCode: Map<string, number> = new Map(),
  existingCloudChunkCount = 0,
  forceAll = false
): Promise<{
  chunkCount: number;
  nextChunkIndexByCode: Map<string, number>;
}> {
  const subcol = kind === 'inbound' ? 'inboundIndex' : 'outboundIndex';
  const digestPrefix = kind === 'inbound' ? 'in_idx_' : 'out_idx_';
  const { chunks, nextChunkIndexByCode } = buildStableReceiptIndexChunks(
    entriesMap,
    forceAll ? new Map<string, number>() : prevChunkIndexByCode,
    CLOUD_CHUNK_SIZE
  );

  const { dirtyIndices, nextDigests } = diffChunkDigests(
    chunks,
    forceAll ? {} : ramChunkDigests,
    digestPrefix,
    forceAll ? 0 : existingCloudChunkCount
  );

  const staged: StagedDocWrite[] = [];
  for (const i of dirtyIndices) {
    const cid = `idx_${i}`;
    const ref = doc(db, 'workspaces', WORKSPACE_ID, subcol, cid);
    if (!forceAll && i < existingCloudChunkCount) {
      knownExistingPaths.add(ref.path);
    }
    staged.push({
      ref,
      pathLabel: `workspaces/${WORKSPACE_ID}/${subcol}/${cid}`,
      immutableCreateFields: {
        workspaceId: WORKSPACE_ID,
        receiptKind: kind,
        chunkIndex: i
      },
      mutableFields: {
        items: chunks[i]
      },
      isKnownNew: !forceAll && i >= existingCloudChunkCount && !knownExistingPaths.has(ref.path)
    });
  }

  if (staged.length > 0) {
    await commitStagedWrites(staged);
  }
  Object.assign(ramChunkDigests, nextDigests);
  return {
    chunkCount: chunks.length,
    nextChunkIndexByCode
  };
}

async function pullMaterialsFromCloud(chunkCount: number): Promise<void> {
  if (chunkCount <= 0) return;
  const cfg = getCloudFetchConfig();
  const indices = Array.from({ length: chunkCount }, (_, i) => i);
  const snaps = await runWithConcurrencyLimit(
    indices,
    cfg.concurrency,
    (cIdx) => {
      const cid = `chunk_${cIdx}`;
      return safeGetDoc(
        doc(db, 'workspaces', WORKSPACE_ID, 'materialChunks', cid),
        `workspaces/${WORKSPACE_ID}/materialChunks/${cid}`
      );
    },
    getSyncAbortOptions()
  );

  const allItems: MaterialItem[] = [];
  const nextChunkDigests: Record<string, string> = {};
  for (let idx = 0; idx < snaps.length; idx++) {
    const snap = snaps[idx];
    if (!snap || !snap.exists()) continue;
    const arr = Array.isArray(snap.data().items) ? snap.data().items : [];
    nextChunkDigests[`mat_${idx}`] = computeItemsChunkDigest(arr);
    for (const raw of arr) {
      if (raw && typeof raw === 'object') {
        allItems.push(deserializeMaterial(raw));
      }
    }
  }

  Object.assign(ramChunkDigests, nextChunkDigests);
  if (allItems.length > 0) {
    StorageService.applyRemoteMaterials(allItems);
  }
}

async function pushMaterialsToCloud(
  existingCloudChunkCount = 0,
  forceAll = false
): Promise<{
  materialsCount: number;
  materialsChunkCount: number;
  materialsDigest: string;
}> {
  const mats = StorageService.getMaterials();
  const chunks = chunkItemsByCountAndBytes(
    mats.map(serializeMaterial),
    CLOUD_CHUNK_SIZE,
    DOC_PAYLOAD_BYTE_LIMIT
  );
  const { dirtyIndices, nextDigests } = diffChunkDigests(
    chunks,
    forceAll ? {} : ramChunkDigests,
    'mat_',
    forceAll ? 0 : existingCloudChunkCount
  );

  const staged: StagedDocWrite[] = [];
  for (const i of dirtyIndices) {
    const cid = `chunk_${i}`;
    const ref = doc(db, 'workspaces', WORKSPACE_ID, 'materialChunks', cid);
    if (!forceAll && i < existingCloudChunkCount) {
      knownExistingPaths.add(ref.path);
    }
    staged.push({
      ref,
      pathLabel: `workspaces/${WORKSPACE_ID}/materialChunks/${cid}`,
      immutableCreateFields: {
        workspaceId: WORKSPACE_ID,
        chunkIndex: i
      },
      mutableFields: {
        items: chunks[i]
      },
      isKnownNew: !forceAll && i >= existingCloudChunkCount && !knownExistingPaths.has(ref.path)
    });
  }

  if (staged.length > 0) {
    await commitStagedWrites(staged);
  }
  Object.assign(ramChunkDigests, nextDigests);
  cloudMaterialsDirty = false;
  dirtyMaterialCodes.clear();

  return {
    materialsCount: mats.length,
    materialsChunkCount: chunks.length,
    materialsDigest: cleanStr(computeMaterialsDigest(mats), 128, '0:0:0:0')
  };
}

// ============================================================================
// Public FirestoreSyncService
// ============================================================================
export const FirestoreSyncService = {
  init(callbacks: {
    onRemoteWorkspaceChange: () => void;
    onRemoteSessionSnapshot: (remoteData: Record<string, any>) => void;
    onRemoteOsdChange?: (remoteOsd: OsdReceipt[]) => void;
    isLocalSessionStillActive?: (sessionToken: string) => boolean;
  }): void {
    externalOnRemoteWorkspaceChange = callbacks.onRemoteWorkspaceChange;
    externalOnRemoteSessionSnapshot = callbacks.onRemoteSessionSnapshot;
    externalOnRemoteOsdChange = callbacks.onRemoteOsdChange || null;
    externalIsLocalSessionStillActive = callbacks.isLocalSessionStillActive || null;

    onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        detachAllListeners();
        cloudConnectionPaused = false;
        manualSyncPaused = false;
        writeManualCloudPauseFlag(false);
        cloudPauseReason = null;
        consecutiveCloudFailures = 0;
        resetCloudSessionCaches(false);
        emitCloudState({
          authReady: true,
          status: 'disconnected',
          cloudEmail: null,
          cloudDisplayName: null,
          cloudUid: null,
          connectionPaused: false,
          manualPaused: false,
          pauseReason: null,
          pausedAt: null,
          errorMessage: null
        });
        return;
      }

      if (currentState.cloudUid && currentState.cloudUid !== fbUser.uid) {
        detachAllListeners();
        cloudConnectionPaused = false;
        manualSyncPaused = false;
        writeManualCloudPauseFlag(false);
        cloudPauseReason = null;
        consecutiveCloudFailures = 0;
        resetCloudSessionCaches(false);
      }

      hydrateRamStateFromCheckpoint(fbUser.uid);

      if (cloudConnectionPaused) {
        emitCloudState({
          authReady: true,
          status: 'paused',
          cloudEmail: fbUser.email || null,
          cloudDisplayName: fbUser.displayName || null,
          cloudUid: fbUser.uid,
          connectionPaused: true,
          manualPaused: manualSyncPaused,
          pauseReason: cloudPauseReason,
          errorMessage: manualSyncPaused ? null : currentState.errorMessage
        });
        return;
      }

      emitCloudState({
        authReady: true,
        status: verifiedWorkspaceUid === fbUser.uid ? 'connected' : 'connecting',
        cloudEmail: fbUser.email || null,
        cloudDisplayName: fbUser.displayName || null,
        cloudUid: fbUser.uid,
        errorMessage: null
      });

      // Khi người dùng đang thao tác bấm nút Đăng nhập Google, nhường toàn bộ băng thông cho bước cấp phiên đăng nhập trước
      if (interactiveAuthInFlight) {
        return;
      }
      if (isFirestoreCircuitOpen()) {
        if (isFirestoreQuotaExhausted()) {
          pauseCloudConnection(getLastFirestoreQuotaMessage(), { quotaExceeded: true });
        } else {
          pauseCloudConnection('Kết nối Cloud Firestore đang tạm gián đoạn.');
        }
        return;
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        pauseCloudConnection('offline', { isOnline: false });
        return;
      }

      try {
        const ok = await ensureWorkspaceReady(fbUser, {
          readTimeoutMs: isLikelyMobileDevice() ? 10_000 : 8_000,
          maxRetries: isLikelyMobileDevice() ? 1 : 2
        });
        if (!ok) {
          consecutiveCloudFailures += 1;
          if (
            isFirestoreQuotaExhausted() ||
            consecutiveCloudFailures >= 2 ||
            isLikelyMobileDevice()
          ) {
            pauseCloudConnection(
              currentState.errorMessage || 'Không thể khởi tạo không gian làm việc Google Cloud Firestore.',
              { quotaExceeded: isFirestoreQuotaExhausted() }
            );
          } else {
            settleConnectingStateIfNeeded();
          }
          return;
        }
        if (cloudConnectionPaused) return;
        consecutiveCloudFailures = 0;
        attachWorkspaceRealtimeListener();
        emitCloudState({
          status: 'connected',
          errorMessage: null
        });
        if (fbUser.email) {
          this.watchActiveSession(fbUser.email);
        }
        // Chỉ kích hoạt đối chiếu ngay nếu đang có thay đổi cục bộ chưa đẩy;
        // mọi thay đổi từ Cloud sẽ được onSnapshot của workspace trigger tự động qua SyncService.
        if (this.hasPendingLocalChanges()) {
          externalOnRemoteWorkspaceChange?.();
        }
      } catch (err) {
        console.warn('Cloud workspace bootstrap warning:', err);
        if (isQuotaExceededError(err) || isFirestoreQuotaExhausted()) {
          notifyFirestoreQuotaExceeded(300_000, err);
          pauseCloudConnection(err, { quotaExceeded: true });
        } else {
          consecutiveCloudFailures += 1;
          pauseCloudConnection(err);
        }
      }
    });
  },

  getState(): CloudSyncSnapshotState {
    return currentState;
  },

  isQuotaExhausted(): boolean {
    if (!isFirestoreCircuitOpen()) {
      return false;
    }
    return isFirestoreQuotaExhausted() || Boolean(currentState.quotaExceeded);
  },

  resetCircuitForManualRetry(): void {
    unpauseForManualRetry();
  },

  pauseManually(): string {
    return pauseCloudConnectionManually();
  },

  isManualPaused(): boolean {
    return cloudConnectionPaused && manualSyncPaused;
  },

  isConnectionPaused(): boolean {
    return cloudConnectionPaused;
  },

  hasPendingGoogleRedirect(): boolean {
    return hasPendingGoogleRedirectFlag();
  },

  isCloudConnected(): boolean {
    return Boolean(
      !cloudConnectionPaused &&
        auth.currentUser &&
        auth.currentUser.emailVerified &&
        currentState.status === 'connected'
    );
  },

  hasAuthenticatedCloudUser(): boolean {
    return Boolean(
      auth.currentUser &&
        auth.currentUser.emailVerified &&
        !isFirestoreCircuitOpen() &&
        !cloudConnectionPaused
    );
  },

  canAttemptCloudAuth(): boolean {
    return Boolean(auth.currentUser && auth.currentUser.emailVerified);
  },

  async ensureReadyForAuth(timeoutMs = 5000): Promise<boolean> {
    if (cloudConnectionPaused) {
      return false;
    }
    if (isFirestoreCircuitOpen()) {
      settleConnectingStateIfNeeded();
      return false;
    }
    if (!currentState.authReady) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      await Promise.race([
        new Promise<void>((resolve) => {
          if (currentState.authReady) {
            resolve();
            return;
          }
          authReadyWaiters.add(resolve);
        }),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs);
        })
      ]).finally(() => {
        if (timer) clearTimeout(timer);
      });
    }
    if (isFirestoreCircuitOpen()) {
      settleConnectingStateIfNeeded();
      return false;
    }
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) {
      settleConnectingStateIfNeeded();
      return false;
    }
    if (currentState.status !== 'connected') {
      let readyTimer: ReturnType<typeof setTimeout> | null = null;
      try {
        const tokenOk = await ensureValidFirebaseAuthToken(fbUser, Math.min(timeoutMs, 4000));
        if (!tokenOk) {
          settleConnectingStateIfNeeded();
          return false;
        }
        const ok = await Promise.race<boolean>([
          ensureWorkspaceReady(fbUser, {
            readTimeoutMs: Math.min(timeoutMs, 4500),
            maxRetries: 0
          }),
          new Promise<boolean>((resolve) => {
            readyTimer = setTimeout(() => resolve(false), timeoutMs);
          })
        ]).finally(() => {
          if (readyTimer) clearTimeout(readyTimer);
        });
        if (ok) {
          attachWorkspaceRealtimeListener();
          emitCloudState({ status: 'connected', errorMessage: null });
          return true;
        }
        settleConnectingStateIfNeeded();
      } catch (err) {
        if (isQuotaExceededError(err)) {
          notifyFirestoreQuotaExceeded(300_000, err);
        } else {
          settleConnectingStateIfNeeded(err instanceof Error ? err.message : undefined);
        }
        return false;
      }
    }
    return Boolean(auth.currentUser && auth.currentUser.emailVerified && currentState.status === 'connected');
  },

  markTokenRevoked(sessionToken?: string | null): void {
    rememberRevokedCloudToken(sessionToken);
  },

  getTransferProgress(): SyncTransferProgress {
    return cloudTransferTracker.getSnapshot();
  },

  resetTransferProgressIfIdle(): void {
    cloudTransferTracker.resetIfIdle();
  },

  subscribeTransferProgress(listener: (progress: SyncTransferProgress) => void): () => void {
    return cloudTransferTracker.subscribe(listener);
  },

  subscribeState(listener: (state: CloudSyncSnapshotState) => void): () => void {
    stateListeners.add(listener);
    listener(currentState);
    return () => {
      stateListeners.delete(listener);
    };
  },

  markLocalMutation(
    kind: 'meta' | 'materials' | 'inbound' | 'outbound' | 'osd',
    codes?: string[],
    details?: { users?: boolean; warehouses?: boolean; tombstones?: boolean }
  ): void {
    currentLocalMutationSeq++;
    if (kind === 'meta') {
      cloudMetaDirty = true;
      if (!details || (!details.users && !details.warehouses && !details.tombstones)) {
        cloudMetaUsersDirty = true;
        cloudMetaWarehousesDirty = true;
        cloudMetaTombstonesDirty = true;
      } else {
        if (details.users) cloudMetaUsersDirty = true;
        if (details.warehouses) cloudMetaWarehousesDirty = true;
        if (details.tombstones) cloudMetaTombstonesDirty = true;
      }
      if (Array.isArray(codes)) {
        for (const c of codes) {
          const clean = String(c || '').trim();
          if (!clean) continue;
          if (details?.users) dirtyUserIds.add(clean);
          if (details?.warehouses) dirtyWarehouseIds.add(clean);
        }
      }
    }
    if (kind === 'osd') {
      cloudOsdDirty = true;
      if (details?.tombstones) {
        cloudMetaTombstonesDirty = true;
      }
    }
    if (kind === 'materials') {
      cloudMaterialsDirty = true;
      if (Array.isArray(codes)) {
        for (const c of codes) {
          const k = normKey(c);
          if (k) dirtyMaterialCodes.add(k);
        }
      }
    }
    if (kind === 'inbound') {
      cloudInboundDirty = true;
      if (details?.tombstones) {
        cloudMetaTombstonesDirty = true;
      }
      if (Array.isArray(codes)) {
        for (const c of codes) {
          const k = normKey(c);
          if (k) dirtyInboundCodes.add(k);
        }
      }
    }
    if (kind === 'outbound') {
      cloudOutboundDirty = true;
      if (details?.tombstones) {
        cloudMetaTombstonesDirty = true;
      }
      if (Array.isArray(codes)) {
        for (const c of codes) {
          const k = normKey(c);
          if (k) dirtyOutboundCodes.add(k);
        }
      }
    }
    const nextOutbox = mergePendingOutboxMutation(readPendingOutbox(), kind, codes, details);
    writePendingOutbox(nextOutbox);
  },

  hasPendingOsdPush(): boolean {
    return cloudOsdDirty;
  },

  hasPendingLocalChanges(): boolean {
    if (
      cloudMetaDirty ||
      cloudMetaUsersDirty ||
      cloudMetaWarehousesDirty ||
      cloudMetaTombstonesDirty ||
      cloudOsdDirty ||
      cloudMaterialsDirty ||
      cloudInboundDirty ||
      cloudOutboundDirty
    ) {
      return true;
    }
    return hasAnyPendingOutbox(readPendingOutbox());
  },

  getLatestRemoteUpdatedAtMs(): number {
    return latestObservedRemoteUpdatedAtMs;
  },

  isRealtimeWorkspaceAttached(): boolean {
    return Boolean(workspaceUnsub);
  },

  hasUnappliedRemoteChanges(): boolean {
    if (latestObservedRemoteServerRev < 0) return false;
    return hasRemoteManifestChanged({
      remoteServerRev: latestObservedRemoteServerRev,
      remoteMetaDigest: latestObservedRemoteMetaDigest,
      remoteMaterialsDigest: latestObservedRemoteMaterialsDigest,
      lastAppliedServerRev: lastAppliedCloudServerRev,
      lastAppliedMetaDigest: lastAppliedCloudMetaDigest,
      lastAppliedMaterialsDigest: lastAppliedCloudMaterialsDigest
    });
  },

  isWatchingSession(userKey?: string | null): boolean {
    if (!sessionUnsub) return false;
    if (!userKey) return true;
    const canonicalKey = canonicalUserSessionKey(userKey);
    return watchedSessionDocId === makeSafeDocId('sess', canonicalKey);
  },

  getCurrentFirebaseUser(): FirebaseUser | null {
    return auth.currentUser;
  },

  async consumePendingGoogleRedirect(): Promise<{
    hasResult: boolean;
    fbUser?: FirebaseUser;
    forceLogoutOtherDevice?: boolean;
    redirectMode?: 'login' | 'cloud_connect';
  }> {
    if (isInIframe()) {
      return { hasResult: false };
    }
    const cred = await consumeGoogleRedirectResult();
    const pendingMeta = consumePendingGoogleRedirectLogin();
    const fbUser = cred?.user || (pendingMeta && auth.currentUser ? auth.currentUser : null);
    if (!fbUser || !fbUser.email) {
      return { hasResult: false };
    }
    unpauseForManualRetry();
    emitCloudState({
      authReady: true,
      cloudEmail: fbUser.email,
      cloudDisplayName: fbUser.displayName || null,
      cloudUid: fbUser.uid,
      errorMessage: null
    });
    return {
      hasResult: true,
      fbUser,
      forceLogoutOtherDevice: Boolean(pendingMeta?.forceLogoutOtherDevice),
      redirectMode: pendingMeta?.mode || 'login'
    };
  },

  async authenticateGooglePopup(options?: {
    forceSelectAccount?: boolean;
    reuseExistingIfAvailable?: boolean;
    forceLogoutOtherDevice?: boolean;
    redirectMode?: 'login' | 'cloud_connect';
  }): Promise<{
    success: boolean;
    cloudReady: boolean;
    redirected?: boolean;
    fbUser?: FirebaseUser;
    email?: string | null;
    displayName?: string | null;
    uid?: string | null;
    message: string;
  }> {
    interactiveAuthInFlight = true;
    const shouldForcePicker = Boolean(options?.forceSelectAccount);
    try {
      let fbUser: FirebaseUser | null = null;
      const canReuse =
        Boolean(options?.reuseExistingIfAvailable) &&
        !shouldForcePicker &&
        Boolean(auth.currentUser && auth.currentUser.email && auth.currentUser.emailVerified);

      // Tái sử dụng đồng bộ nếu phiên Firebase hiện tại đã xác minh (không await trước signInWithPopup để tránh Safari/Chrome mobile chặn popup)
      if (canReuse && auth.currentUser) {
        fbUser = auth.currentUser;
      }

      if (!fbUser) {
        emitCloudState({ status: 'connecting', errorMessage: null });
        // Gọi signInWithGooglePopup trực tiếp trong call-stack sự kiện click
        const cred = await signInWithGooglePopup(shouldForcePicker || !auth.currentUser);
        fbUser = cred.user;
      }

      if (!fbUser || !fbUser.email) {
        emitCloudState({
          status: 'disconnected',
          errorMessage: 'Tài khoản Google không cung cấp địa chỉ email hợp lệ.'
        });
        return {
          success: false,
          cloudReady: false,
          message: 'Tài khoản Google không cung cấp địa chỉ email hợp lệ. Vui lòng chọn tài khoản Google khác.'
        };
      }

      emitCloudState({
        authReady: true,
        cloudEmail: fbUser.email,
        cloudDisplayName: fbUser.displayName || null,
        cloudUid: fbUser.uid,
        errorMessage: null
      });
      if (isFirestoreCircuitOpen()) {
        settleConnectingStateIfNeeded();
      }

      return {
        success: true,
        cloudReady: !isFirestoreCircuitOpen(),
        fbUser,
        email: fbUser.email,
        displayName: fbUser.displayName,
        uid: fbUser.uid,
        message: `Đã xác thực tài khoản Google (${fbUser.email}) thành công!`
      };
    } catch (err: any) {
      const code = String(err?.code || '');
      if (
        !isInIframe() &&
        (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment')
      ) {
        try {
          const startedRedirect = await signInWithGoogleRedirectFallback(
            shouldForcePicker || !auth.currentUser,
            Boolean(options?.forceLogoutOtherDevice),
            options?.redirectMode || 'login'
          );
          if (startedRedirect) {
            return {
              success: false,
              cloudReady: false,
              redirected: true,
              message: 'Đang chuyển hướng sang trang đăng nhập Google...'
            };
          }
        } catch {
          // rơi xuống thông báo lỗi popup bên dưới
        }
      }

      let msg =
        'Không thể đăng nhập bằng tài khoản Google. Vui lòng kiểm tra kết nối mạng và thử lại.';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        msg = 'Bạn đã đóng cửa sổ chọn tài khoản Google trước khi hoàn tất đăng nhập.';
      } else if (code === 'auth/popup-blocked') {
        msg =
          'Trình duyệt đã chặn cửa sổ bật lên (Popup). Vui lòng cho phép Popup cho trang web này và thử đăng nhập lại.';
      } else if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'tên miền hiện tại';
        msg = `Tên miền "${host}" chưa được thêm vào Authorized Domains trên Firebase Authentication.`;
      } else if (code === 'auth/billing-not-enabled') {
        msg =
          'Firebase Authentication báo dự án chưa bật gói Blaze/Billing. Vui lòng kiểm tra cấu hình thanh toán trên Firebase Console.';
      } else if (code === 'auth/quota-exceeded') {
        msg =
          'Firebase Authentication tạm vượt hạn mức. Vui lòng thử lại sau ít phút hoặc kiểm tra hạn mức trên Firebase Console.';
      } else if (
        code === 'auth/operation-not-allowed' ||
        code === 'auth/configuration-not-found' ||
        code === 'auth/internal-error'
      ) {
        msg = `Dịch vụ đăng nhập Google Firebase tạm gián đoạn (${code}). Vui lòng thử lại sau giây lát.`;
      } else if (code === 'auth/network-request-failed') {
        msg =
          'Kết nối mạng bị gián đoạn khi xác thực với Google. Vui lòng kiểm tra Internet và thử lại.';
      }
      const isVerifiedConnected = Boolean(
        auth.currentUser && verifiedWorkspaceUid === auth.currentUser.uid
      );
      emitCloudState({
        status: isVerifiedConnected ? 'connected' : 'disconnected',
        errorMessage: code === 'auth/popup-closed-by-user' ? null : msg
      });
      return { success: false, cloudReady: false, message: msg };
    } finally {
      interactiveAuthInFlight = false;
    }
  },

  async autoConnectIfPossible(): Promise<{ success: boolean; email?: string | null }> {
    if (cloudConnectionPaused) {
      return { success: false };
    }
    if (this.isCloudConnected()) {
      if (
        deferredRemoteChangeDuringAuth ||
        this.hasUnappliedRemoteChanges() ||
        this.hasPendingLocalChanges()
      ) {
        deferredRemoteChangeDuringAuth = false;
        externalOnRemoteWorkspaceChange?.();
      }
      return { success: true, email: auth.currentUser?.email };
    }
    // Luôn chờ Firebase Auth khôi phục IndexedDB persistence (trên điện thoại thường mất 150-1200ms)
    const ok = await this.ensureReadyForAuth(isLikelyMobileDevice() ? 8000 : 6000);
    const fbUser = auth.currentUser;
    if (ok && fbUser && fbUser.emailVerified && !cloudConnectionPaused) {
      if (
        deferredRemoteChangeDuringAuth ||
        this.hasUnappliedRemoteChanges() ||
        this.hasPendingLocalChanges() ||
        !readCloudSyncCheckpoint(fbUser.uid)
      ) {
        deferredRemoteChangeDuringAuth = false;
        externalOnRemoteWorkspaceChange?.();
      }
      return { success: true, email: fbUser.email };
    }
    return { success: false };
  },

  async connectGoogleAccount(options?: {
    forceSelectAccount?: boolean;
    reuseExistingIfAvailable?: boolean;
    redirectMode?: 'login' | 'cloud_connect';
  }): Promise<{
    success: boolean;
    redirected?: boolean;
    paused?: boolean;
    email?: string | null;
    displayName?: string | null;
    message: string;
  }> {
    unpauseForManualRetry();
    const shouldForce = options?.forceSelectAccount ?? false;
    const canReuse = options?.reuseExistingIfAvailable ?? true;
    const authRes = await this.authenticateGooglePopup({
      forceSelectAccount: shouldForce,
      reuseExistingIfAvailable: canReuse,
      redirectMode: options?.redirectMode ?? 'cloud_connect'
    });
    if (authRes.redirected) {
      return {
        success: false,
        redirected: true,
        message: authRes.message
      };
    }
    if (!authRes.success || !authRes.fbUser) {
      return {
        success: false,
        message: authRes.message
      };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const pausedMsg = pauseCloudConnection('offline', { isOnline: false });
      return {
        success: false,
        paused: true,
        email: authRes.email,
        displayName: authRes.displayName,
        message: pausedMsg
      };
    }

    const myControlEpoch = cloudControlEpoch;
    const watchdog = createSyncDeadline(CLOUD_SYNC_HARD_TIMEOUT_MS, {
      onTimeout: () => {
        if (myControlEpoch !== cloudControlEpoch) return;
        pauseCloudConnection('timeout_2min', { timedOutOver2Min: true });
      }
    });
    activeCloudWatchdog = watchdog;
    cloudTransferTracker.begin();

    try {
      const tokenOk = await ensureValidFirebaseAuthToken(
        authRes.fbUser,
        getDeadlineStepTimeout(isLikelyMobileDevice() ? 15_000 : 10_000)
      );
      if (myControlEpoch !== cloudControlEpoch) {
        return {
          success: false,
          paused: cloudConnectionPaused,
          email: authRes.email,
          displayName: authRes.displayName,
          message: cloudPauseReason || formatManualCloudPauseNotice()
        };
      }
      if (!tokenOk) {
        const pausedMsg = pauseCloudConnection('auth/user-token-expired');
        return {
          success: false,
          paused: true,
          email: authRes.email,
          displayName: authRes.displayName,
          message: pausedMsg
        };
      }
      throwIfActiveSyncAborted();

      const wsOk = await withAsyncTimeout(
        ensureWorkspaceReady(authRes.fbUser, {
          readTimeoutMs: getDeadlineStepTimeout(isLikelyMobileDevice() ? 15_000 : 10_000),
          maxRetries: isLikelyMobileDevice() ? 1 : 2
        }),
        getDeadlineStepTimeout(isLikelyMobileDevice() ? 45_000 : 25_000),
        'Quá thời gian chờ kết nối không gian làm việc Google Cloud Firestore.',
        getSyncAbortOptions()
      );
      if (myControlEpoch !== cloudControlEpoch) {
        return {
          success: false,
          paused: cloudConnectionPaused,
          email: authRes.email,
          displayName: authRes.displayName,
          message: cloudPauseReason || formatManualCloudPauseNotice()
        };
      }
      if (!wsOk) {
        workspaceReadyPromise = null;
        workspaceReadyUid = null;
        const rawFail =
          (isFirestoreQuotaExhausted() || currentState.quotaExceeded
            ? getLastFirestoreQuotaMessage()
            : null) ||
          (currentState.status === 'error' ? currentState.errorMessage : null) ||
          'Chưa thể kết nối không gian làm việc Google Cloud Firestore.';
        const pausedMsg = pauseCloudConnection(rawFail, {
          quotaExceeded: isFirestoreQuotaExhausted() || currentState.quotaExceeded,
          timedOutOver2Min: watchdog.didTimeOut()
        });
        return {
          success: false,
          paused: true,
          email: authRes.email,
          displayName: authRes.displayName,
          message: pausedMsg
        };
      }
      throwIfActiveSyncAborted();
      attachWorkspaceRealtimeListener();
      emitCloudState({ status: 'connected', errorMessage: null });

      const syncRes = await this.reconcileWithCloudDetailed({
        forceManifestRefresh: true,
        isManualTrigger: true
      });
      if (myControlEpoch !== cloudControlEpoch) {
        return {
          success: false,
          paused: cloudConnectionPaused,
          email: authRes.email,
          displayName: authRes.displayName,
          message: cloudPauseReason || formatManualCloudPauseNotice()
        };
      }
      if (!syncRes.ok) {
        const failReason =
          syncRes.errorMessage ||
          (syncRes.quotaExceeded
            ? getLastFirestoreQuotaMessage()
            : 'Chưa thể đồng bộ dữ liệu từ Google Cloud Firestore.');
        const pausedMsg = cloudConnectionPaused
          ? currentState.errorMessage || currentState.pauseReason || failReason
          : pauseCloudConnection(failReason, {
              quotaExceeded: Boolean(syncRes.quotaExceeded || isFirestoreQuotaExhausted()),
              timedOutOver2Min: watchdog.didTimeOut()
            });
        return {
          success: false,
          paused: true,
          email: authRes.email,
          displayName: authRes.displayName,
          message: pausedMsg
        };
      }
    } catch (err) {
      if (myControlEpoch !== cloudControlEpoch) {
        return {
          success: false,
          paused: cloudConnectionPaused,
          email: authRes.email,
          displayName: authRes.displayName,
          message: cloudPauseReason || formatManualCloudPauseNotice()
        };
      }
      const hitQuota = isQuotaExceededError(err) || isFirestoreQuotaExhausted();
      if (hitQuota) {
        notifyFirestoreQuotaExceeded(300_000, err);
      }
      const timedOut2m =
        watchdog.didTimeOut() || (err instanceof SyncAbortedError && Boolean(err.timedOut));
      const pausedMsg = cloudConnectionPaused
        ? currentState.errorMessage || currentState.pauseReason || (err instanceof Error ? err.message : String(err))
        : pauseCloudConnection(err, {
            quotaExceeded: hitQuota,
            timedOutOver2Min: timedOut2m
          });
      return {
        success: false,
        paused: true,
        email: authRes.email,
        displayName: authRes.displayName,
        message: pausedMsg
      };
    } finally {
      cloudTransferTracker.end();
      if (activeCloudWatchdog === watchdog) {
        activeCloudWatchdog = null;
      }
      watchdog.dispose();
    }
    return {
      success: true,
      email: authRes.email,
      displayName: authRes.displayName,
      message: `Đã kết nối đồng bộ đám mây (${authRes.email || 'Google'}) thành công!`
    };
  },

  async disconnectGoogleAccount(): Promise<void> {
    cloudControlEpoch += 1;
    detachAllListeners();
    cloudConnectionPaused = false;
    manualSyncPaused = false;
    writeManualCloudPauseFlag(false);
    cloudPauseReason = null;
    consecutiveCloudFailures = 0;
    resetCloudSessionCaches(true);
    await signOutAndPurgeFirebaseAuth();
    emitCloudState({
      authReady: true,
      status: 'disconnected',
      cloudEmail: null,
      cloudDisplayName: null,
      cloudUid: null,
      connectionPaused: false,
      manualPaused: false,
      pauseReason: null,
      pausedAt: null,
      errorMessage: null
    });
  },

  watchActiveSession(userKey: string | null): void {
    const fbUser = auth.currentUser;
    if (!userKey || !fbUser || !fbUser.emailVerified) {
      if (sessionUnsub) {
        sessionUnsub();
        sessionUnsub = null;
      }
      watchedSessionDocId = null;
      return;
    }

    const canonicalKey = canonicalUserSessionKey(userKey);
    const sessionDocId = makeSafeDocId('sess', canonicalKey);
    if (sessionUnsub && watchedSessionDocId === sessionDocId) return;

    if (sessionUnsub) {
      sessionUnsub();
      sessionUnsub = null;
    }
    watchedSessionDocId = sessionDocId;
    const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
    const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);

    sessionUnsub = onSnapshot(
      sessRef,
      (snap) => {
        if (!snap.exists()) return;
        knownExistingPaths.add(sessRef.path);
        externalOnRemoteSessionSnapshot?.(snap.data());
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, sessPath);
        } catch {
          // ignore transient session listener error
        }
      }
    );
  },

  async reconcileWithCloud(): Promise<boolean> {
    const res = await this.reconcileWithCloudDetailed();
    return res.ok;
  },

  async reconcileWithCloudDetailed(options?: {
    forceManifestRefresh?: boolean;
    onWorkDetected?: () => void;
    isManualTrigger?: boolean;
  }): Promise<{
    ok: boolean;
    pulledChanges: boolean;
    pushedChanges?: boolean;
    quotaExceeded?: boolean;
    paused?: boolean;
    errorMessage?: string;
  }> {
    const isManual = Boolean(options?.isManualTrigger);
    if (shouldSkipAutoCloudActivity({ connectionPaused: cloudConnectionPaused, isManualTrigger: isManual })) {
      return {
        ok: false,
        pulledChanges: false,
        pushedChanges: false,
        paused: true,
        quotaExceeded: currentState.quotaExceeded,
        errorMessage: currentState.errorMessage || cloudPauseReason || undefined
      };
    }
    if (isManual && cloudConnectionPaused) {
      unpauseForManualRetry();
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const pausedMsg = pauseCloudConnection('offline', { isOnline: false });
      return {
        ok: false,
        pulledChanges: false,
        pushedChanges: false,
        paused: true,
        errorMessage: pausedMsg
      };
    }

    if (isFirestoreCircuitOpen()) {
      if (isFirestoreQuotaExhausted()) {
        const quotaMsg = getLastFirestoreQuotaMessage();
        const pausedMsg = pauseCloudConnection(quotaMsg, { quotaExceeded: true });
        return {
          ok: false,
          pulledChanges: false,
          pushedChanges: false,
          paused: true,
          quotaExceeded: true,
          errorMessage: pausedMsg
        };
      }
      const pausedMsg = pauseCloudConnection('Kết nối Cloud Firestore đang tạm gián đoạn.');
      return {
        ok: false,
        pulledChanges: false,
        pushedChanges: false,
        paused: true,
        errorMessage: pausedMsg
      };
    }
    if (currentState.quotaExceeded) {
      emitCloudState({
        status: auth.currentUser?.emailVerified
          ? verifiedWorkspaceUid === auth.currentUser.uid
            ? 'connected'
            : 'connecting'
          : 'disconnected',
        quotaExceeded: false,
        errorMessage: null
      });
    }
    if (interactiveAuthInFlight) {
      return {
        ok: false,
        pulledChanges: false,
        pushedChanges: false,
        errorMessage: 'Đang hoàn tất xác thực tài khoản Google, vui lòng thử lại sau giây lát.'
      };
    }
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) {
      return {
        ok: false,
        pulledChanges: false,
        pushedChanges: false,
        errorMessage: 'Chưa kết nối tài khoản Google đã xác minh.'
      };
    }

    if (options?.onWorkDetected) {
      activeWorkDetectedCallbacks.add(options.onWorkDetected);
    }

    if (isCloudReconciling && reconcileInFlightPromise) {
      const hasNewLocalMutation = currentLocalMutationSeq !== passStartedLocalMutationSeq;
      const hasNewRemoteChange =
        (activePassServerRev >= 0 && latestObservedRemoteServerRev > activePassServerRev) ||
        (Boolean(activePassMetaDigest) &&
          Boolean(latestObservedRemoteMetaDigest) &&
          latestObservedRemoteMetaDigest !== activePassMetaDigest) ||
        (Boolean(activePassMaterialsDigest) &&
          Boolean(latestObservedRemoteMaterialsDigest) &&
          latestObservedRemoteMaterialsDigest !== activePassMaterialsDigest);
      if (options?.forceManifestRefresh || hasNewLocalMutation || hasNewRemoteChange) {
        pendingCloudReconcile = true;
        if (options?.forceManifestRefresh) {
          pendingForceManifestRefresh = true;
        }
      }
      return await reconcileInFlightPromise;
    }

    isCloudReconciling = true;
    const myControlEpoch = cloudControlEpoch;
    const initialForceRefresh = Boolean(options?.forceManifestRefresh);
    let ownedWatchdog: SyncDeadlineController | null = null;
    if (!activeCloudWatchdog) {
      ownedWatchdog = createSyncDeadline(CLOUD_SYNC_HARD_TIMEOUT_MS, {
        onTimeout: () => {
          if (myControlEpoch !== cloudControlEpoch) return;
          pauseCloudConnection('timeout_2min', { timedOutOver2Min: true });
        }
      });
      activeCloudWatchdog = ownedWatchdog;
    }
    const reconcileStartedAt = Date.now();

    const notifyWorkDetected = () => {
      if (cloudConnectionPaused || myControlEpoch !== cloudControlEpoch) return;
      if (currentState.status === 'error' && !currentState.quotaExceeded) {
        emitCloudState({ status: 'connecting', errorMessage: null });
      }
      activeWorkDetectedCallbacks.forEach((cb) => {
        try {
          cb();
        } catch {
          // ignore
        }
      });
    };

    const runSinglePass = async (forceRefresh: boolean): Promise<{
      ok: boolean;
      pulledChanges: boolean;
      pushedChanges?: boolean;
      manifestConflict?: boolean;
      quotaExceeded?: boolean;
      paused?: boolean;
      errorMessage?: string;
    }> => {
      let pulledChanges = false;
      let pushedChanges = false;
      passStartedLocalMutationSeq = currentLocalMutationSeq;
      activePassServerRev = -1;
      activePassMetaDigest = '';
      activePassMaterialsDigest = '';
      hydrateOutboxIntoRamFlags();
      try {
        throwIfActiveSyncAborted();
        if (!StorageService.isHydratedReady()) {
          await StorageService.init();
        }
        throwIfActiveSyncAborted();
        const ok = await ensureWorkspaceReady(fbUser, {
          readTimeoutMs: getDeadlineStepTimeout(isLikelyMobileDevice() ? 15_000 : 10_000),
          maxRetries: isLikelyMobileDevice() ? 1 : 2
        });
        if (!ok) {
          const failMsg = currentState.errorMessage || 'Không thể kết nối không gian làm việc Cloud Firestore.';
          const pausedMsg = pauseCloudConnection(failMsg, {
            quotaExceeded: isFirestoreQuotaExhausted() || currentState.quotaExceeded,
            timedOutOver2Min: Boolean(activeCloudWatchdog?.didTimeOut())
          });
          return {
            ok: false,
            pulledChanges: false,
            pushedChanges: false,
            paused: true,
            quotaExceeded: isFirestoreQuotaExhausted() || currentState.quotaExceeded,
            errorMessage: pausedMsg
          };
        }
        throwIfActiveSyncAborted();
        attachWorkspaceRealtimeListener();

        const wsPath = `workspaces/${WORKSPACE_ID}`;
        const wsRef = doc(db, 'workspaces', WORKSPACE_ID);
        let wsData: WorkspaceManifestDoc | null = null;
        if (
          !forceRefresh &&
          workspaceUnsub &&
          cachedWsManifest &&
          Date.now() - cachedWsManifest.atMs < 30_000
        ) {
          wsData = cachedWsManifest.data;
        } else {
          const wsSnap = await safeGetDoc(wsRef, wsPath);
          if (!wsSnap.exists()) {
            const pausedMsg = pauseCloudConnection('Không tìm thấy dữ liệu đồng bộ trên Cloud Firestore.');
            return {
              ok: false,
              pulledChanges: false,
              pushedChanges: false,
              paused: true,
              errorMessage: pausedMsg
            };
          }
          wsData = wsSnap.data() as WorkspaceManifestDoc;
          cachedWsManifest = { data: wsData, atMs: Date.now() };
        }

        let remoteServerRev = Number(wsData.serverRevision) || 0;
        const expectedBaseline = {
          serverRevision: remoteServerRev,
          metaDigest: String(wsData.metaDigest || 'v2:0.0.0|0.0.0|0.0.0|0.0.0|0.0.0|0.0.0'),
          materialsDigest: String(wsData.materialsDigest || '0:0:0:0')
        };
        activePassServerRev = remoteServerRev;
        activePassMetaDigest = expectedBaseline.metaDigest;
        activePassMaterialsDigest = expectedBaseline.materialsDigest;
        const remoteMetaRev = Number(wsData.metaRevision) || 0;
        const checkpoint =
          hydrateRamStateFromCheckpoint(fbUser.uid) || readCloudSyncCheckpoint(fbUser.uid);
        if (lastAppliedCloudServerRev < 0 && checkpoint && checkpoint.serverRevision === remoteServerRev) {
          lastAppliedCloudServerRev = checkpoint.serverRevision;
          lastAppliedCloudMetaRev = checkpoint.metaRevision;
        }

        let nextAccountChunkCount = Number(wsData.accountChunkCount) || 0;
        let nextWarehouseChunkCount = Number(wsData.warehouseChunkCount) || 0;
        let nextTombstoneChunkCount = Number(wsData.tombstoneChunkCount) || 0;
        let nextMetaDigest = expectedBaseline.metaDigest;
        let nextMetaRevision = remoteMetaRev;

        let nextMaterialsCount = Number(wsData.materialsCount) || 0;
        let nextMaterialsChunkCount = Number(wsData.materialsChunkCount) || 0;
        let nextMaterialsDigest = expectedBaseline.materialsDigest;
        let nextMaterialsRevision = Number(wsData.materialsRevision) || 0;

        let nextInboundIndexChunkCount = Number(wsData.inboundIndexChunkCount) || 0;
        let nextOutboundIndexChunkCount = Number(wsData.outboundIndexChunkCount) || 0;
        let manifestMutated = false;
        const pushedDomains: TouchedManifestDomains = {};
        const verifiedUnchangedDomains: TouchedManifestDomains = {};

        const localUsers = StorageService.getUsers();
        const localWhs = StorageService.getWarehouses();
        const localTombs = StorageService.getTombstones();
        const localOsd = StorageService.getOsdReceipts();
        const localMats = StorageService.getMaterials();
        const localInbounds = StorageService.getInboundReceipts();
        const localOutbounds = StorageService.getOutboundReceipts();

        const localU = computeUsersDomainDigest(localUsers);
        const localW = computeWarehousesDomainDigest(localWhs);
        const localT = computeTombstonesDomainDigest(localTombs);
        const localO = computeOsdDomainDigest(localOsd);
        const localIn = computeInboundDomainDigest(localInbounds);
        const localOut = computeOutboundDomainDigest(localOutbounds);
        const preMatDigest = computeMaterialsDigest(localMats);
        const preOsdDigest = computeOsdOnlyDigest(localOsd, localTombs);
        const preInTombCount = Object.keys(localTombs.inbound || {}).length;
        const preOutTombCount = Object.keys(localTombs.outbound || {}).length;

        const adminMissingPii =
          isCloudAdmin(fbUser) &&
          adminPiiLoadedForMetaRev !== remoteMetaRev &&
          localUsers.some((u) => Boolean(u.emailDigest) && !u.email);

        const remoteV2 = parseMetaDigestV2(nextMetaDigest);
        const cpV2 = parseMetaDigestV2(checkpoint?.metaDigest);
        const cpRemoteV2 = parseMetaDigestV2(checkpoint?.remoteMetaDigest || checkpoint?.metaDigest);
        const cpRemoteMaterialsDigest = checkpoint?.remoteMaterialsDigest || checkpoint?.materialsDigest;
        const hasV2Checkpoint = Boolean(checkpoint && cpRemoteV2 && remoteV2);

        const dirtyFlags = {
          users: cloudMetaUsersDirty || Boolean(cpV2 && cpV2.u !== localU),
          warehouses: cloudMetaWarehousesDirty || Boolean(cpV2 && cpV2.w !== localW),
          tombstones: cloudMetaTombstonesDirty || Boolean(cpV2 && cpV2.t !== localT),
          osd: cloudOsdDirty || Boolean(checkpoint && preOsdDigest !== checkpoint.osdDigest),
          inbound:
            cloudInboundDirty ||
            Boolean(
              checkpoint &&
                (localIn !== checkpoint.inboundDigest ||
                  (checkpoint.inboundTombCount !== undefined &&
                    preInTombCount !== checkpoint.inboundTombCount))
            ),
          outbound:
            cloudOutboundDirty ||
            Boolean(
              checkpoint &&
                (localOut !== checkpoint.outboundDigest ||
                  (checkpoint.outboundTombCount !== undefined &&
                    preOutTombCount !== checkpoint.outboundTombCount))
            ),
          materials:
            cloudMaterialsDirty ||
            Boolean(checkpoint && preMatDigest !== checkpoint.materialsDigest)
        };

        const checkpointMatchesServer = Boolean(
          checkpoint &&
            checkpoint.serverRevision === remoteServerRev &&
            (lastAppliedCloudServerRev < 0 || remoteServerRev === lastAppliedCloudServerRev)
        );

        const plan = computeDomainSyncPlan({
          remoteMetaDigest: nextMetaDigest,
          remoteMaterialsDigest: nextMaterialsDigest,
          remoteCounts: {
            accountChunkCount: nextAccountChunkCount,
            warehouseChunkCount: nextWarehouseChunkCount,
            tombstoneChunkCount: nextTombstoneChunkCount,
            inboundIndexChunkCount: nextInboundIndexChunkCount,
            outboundIndexChunkCount: nextOutboundIndexChunkCount,
            materialsChunkCount: nextMaterialsChunkCount
          },
          localDigests: {
            u: localU,
            w: localW,
            t: localT,
            o: localO,
            in: localIn,
            out: localOut,
            materials: preMatDigest
          },
          localCounts: {
            users: localUsers.length,
            warehouses: localWhs.length,
            inbound: localInbounds.length,
            outbound: localOutbounds.length,
            materials: localMats.length
          },
          dirty: dirtyFlags,
          adminMissingPii,
          checkpointMatchesServer,
          lastSyncedOsdDigest
        });

        const remoteInCount = remoteV2 ? extractCountFromDigestPart(remoteV2.in) : 0;
        const remoteOutCount = remoteV2 ? extractCountFromDigestPart(remoteV2.out) : 0;
        const remoteMatsCount = Number(wsData.materialsCount) || 0;

        const missingLocalAccounts =
          nextAccountChunkCount > 0 &&
          (localUsers.length === 0 || (localUsers.length <= 1 && (!remoteV2 || remoteV2.u !== localU)));
        const missingLocalWhs = nextWarehouseChunkCount > 0 && localWhs.length === 0;
        const missingLocalInbound =
          (nextInboundIndexChunkCount > 0 && localInbounds.length === 0) ||
          (!dirtyFlags.inbound &&
            !dirtyFlags.tombstones &&
            remoteInCount > localInbounds.length);
        const missingLocalOutbound =
          (nextOutboundIndexChunkCount > 0 && localOutbounds.length === 0) ||
          (!dirtyFlags.outbound &&
            !dirtyFlags.tombstones &&
            remoteOutCount > localOutbounds.length);
        const missingLocalMaterials =
          (nextMaterialsChunkCount > 0 && localMats.length === 0) ||
          (!dirtyFlags.materials &&
            !dirtyFlags.tombstones &&
            remoteMatsCount > localMats.length);

        const effectivePullUsers = hasV2Checkpoint
          ? (remoteV2!.u !== cpRemoteV2!.u && plan.pullUsers) || missingLocalAccounts || adminMissingPii
          : plan.pullUsers;
        const effectivePullWarehouses = hasV2Checkpoint
          ? (remoteV2!.w !== cpRemoteV2!.w && plan.pullWarehouses) || missingLocalWhs
          : plan.pullWarehouses;
        const effectivePullTombstones = hasV2Checkpoint
          ? remoteV2!.t !== cpRemoteV2!.t && plan.pullTombstones
          : plan.pullTombstones;
        const effectivePullOsd = hasV2Checkpoint
          ? (remoteV2!.o !== cpRemoteV2!.o && plan.pullOsd) ||
            (plan.osdRemoteCount > 0 && localOsd.length === 0)
          : plan.pullOsd;
        const effectivePullInbound = hasV2Checkpoint
          ? (remoteV2!.in !== cpRemoteV2!.in && plan.pullInbound) || missingLocalInbound
          : plan.pullInbound || missingLocalInbound;
        const effectivePullOutbound = hasV2Checkpoint
          ? (remoteV2!.out !== cpRemoteV2!.out && plan.pullOutbound) || missingLocalOutbound
          : plan.pullOutbound || missingLocalOutbound;
        const remoteMatsChanged =
          !checkpoint ||
          nextMaterialsDigest !== cpRemoteMaterialsDigest ||
          missingLocalMaterials;
        const effectivePullMaterials =
          remoteMatsChanged &&
          nextMaterialsChunkCount > 0 &&
          (localMats.length === 0 || missingLocalMaterials || preMatDigest !== nextMaterialsDigest);

        const anyWorkNeeded =
          effectivePullUsers ||
          effectivePullWarehouses ||
          effectivePullTombstones ||
          effectivePullOsd ||
          effectivePullMaterials ||
          effectivePullInbound ||
          effectivePullOutbound ||
          plan.pushUsers ||
          plan.pushWarehouses ||
          plan.pushTombstones ||
          plan.pushOsd ||
          plan.pushInbound ||
          plan.pushOutbound ||
          plan.pushMaterials ||
          dirtyFlags.inbound ||
          dirtyFlags.outbound ||
          dirtyFlags.materials;

        // Fast-path: Chỉ đồng bộ khi thực sự có khác biệt theo từng miền dữ liệu
        if (!anyWorkNeeded) {
          clearSyncedOutboxDomains({
            users: true,
            warehouses: true,
            tombstones: true,
            osd: true,
            materials: true,
            inbound: true,
            outbound: true
          });

          lastAppliedCloudServerRev = remoteServerRev;
          lastAppliedCloudMetaRev = nextMetaRevision;
          lastAppliedCloudMetaDigest = expectedBaseline.metaDigest;
          lastAppliedCloudMaterialsDigest = expectedBaseline.materialsDigest;
          lastSyncedOsdDigest = preOsdDigest;
          if (!checkpoint || !cpV2 || !checkpoint.remoteMetaDigest) {
            const localFullMetaDigest = computeCloudSharedMetaDigest(
              localUsers,
              localWhs,
              localTombs,
              localOsd,
              localInbounds,
              localOutbounds
            );
            const converged = resolveConvergedCheckpointDigests({
              manifestMutated: false,
              remoteMetaDigest: expectedBaseline.metaDigest,
              remoteMaterialsDigest: expectedBaseline.materialsDigest,
              finalLocalMetaDigest: localFullMetaDigest,
              finalLocalMaterialsDigest: preMatDigest,
              dirty: dirtyFlags
            });
            writeCloudSyncCheckpoint({
              uid: fbUser.uid,
              serverRevision: remoteServerRev,
              metaRevision: nextMetaRevision,
              metaDigest: converged.localMetaDigest,
              materialsDigest: converged.localMaterialsDigest,
              remoteMetaDigest: converged.remoteSyncedMetaDigest,
              remoteMaterialsDigest: converged.remoteSyncedMaterialsDigest,
              inboundDigest: localIn,
              outboundDigest: localOut,
              osdDigest: preOsdDigest,
              inboundCount: localInbounds.length,
              outboundCount: localOutbounds.length,
              materialsCount: localMats.length,
              inboundTombCount: preInTombCount,
              outboundTombCount: preOutTombCount,
              chunkDigests: { ...ramChunkDigests }
            });
          }
          persistKnownExistingPaths(fbUser.uid);
          emitCloudState({
            status: 'connected',
            lastSyncedAt: Date.now(),
            errorMessage: null
          });
          return { ok: true, pulledChanges: false, pushedChanges: false };
        }

        // Chỉ kích hoạt trạng thái quay vòng biểu tượng tải khi thực sự có dữ liệu cần kéo hoặc đẩy
        notifyWorkDetected();

        // 1. Đồng bộ Meta chọn lọc từng miền (Users / Warehouses / Tombstones / OSD)
        let pulledOsdForAttachments: OsdReceipt[] = [];
        if (
          effectivePullUsers ||
          effectivePullWarehouses ||
          effectivePullTombstones ||
          effectivePullOsd
        ) {
          pulledOsdForAttachments = await pullMetaFromCloud(wsData, fbUser, {
            pullUsers: effectivePullUsers,
            pullWarehouses: effectivePullWarehouses,
            pullTombstones: effectivePullTombstones,
            pullOsd: effectivePullOsd,
            osdRemoteCount: plan.osdRemoteCount,
            deferAttachmentPreload: true
          });
          lastAppliedCloudMetaRev = remoteMetaRev;
          pulledChanges = true;
        }

        const postMetaUsers = StorageService.getUsers();
        const postMetaWhs = StorageService.getWarehouses();
        const postMetaTombs = StorageService.getTombstones();
        const postMetaOsd = StorageService.getOsdReceipts();

        const postMetaU = computeUsersDomainDigest(postMetaUsers);
        const postMetaW = computeWarehousesDomainDigest(postMetaWhs);
        const postMetaT = computeTombstonesDomainDigest(postMetaTombs);
        const postMetaO = computeOsdDomainDigest(postMetaOsd);

        const needPushUsers =
          dirtyFlags.users && (!remoteV2 || postMetaU !== remoteV2.u);
        const needPushWarehouses =
          dirtyFlags.warehouses && (!remoteV2 || postMetaW !== remoteV2.w);
        const needPushTombstones =
          dirtyFlags.tombstones && (!remoteV2 || postMetaT !== remoteV2.t);
        const needPushOsd =
          dirtyFlags.osd && (!remoteV2 || postMetaO !== remoteV2.o);

        if (needPushUsers || needPushWarehouses || needPushTombstones) {
          const pushedMeta = await pushMetaToCloud(fbUser, {
            pushUsers: needPushUsers,
            pushWarehouses: needPushWarehouses,
            pushTombstones: needPushTombstones,
            pushOsd: needPushOsd,
            existingAccountChunkCount: nextAccountChunkCount,
            existingWarehouseChunkCount: nextWarehouseChunkCount,
            existingTombstoneChunkCount: nextTombstoneChunkCount
          });
          nextAccountChunkCount = pushedMeta.accountChunkCount;
          nextWarehouseChunkCount = pushedMeta.warehouseChunkCount;
          nextTombstoneChunkCount = pushedMeta.tombstoneChunkCount;
          nextMetaDigest = pushedMeta.metaDigest;
          nextMetaRevision = remoteMetaRev + 1;
          lastAppliedCloudMetaRev = nextMetaRevision;
          manifestMutated = true;
          if (needPushUsers) pushedDomains.users = true;
          else verifiedUnchangedDomains.users = true;
          if (needPushWarehouses) pushedDomains.warehouses = true;
          else verifiedUnchangedDomains.warehouses = true;
          if (needPushTombstones) pushedDomains.tombstones = true;
          else verifiedUnchangedDomains.tombstones = true;
          if (needPushOsd) pushedDomains.osd = true;
          else verifiedUnchangedDomains.osd = true;
        } else if (needPushOsd) {
          const pushedOsd = await pushOsdOnlyChunksToCloud(wsData);
          nextTombstoneChunkCount = pushedOsd.tombstoneChunkCount;
          nextMetaDigest = pushedOsd.metaDigest;
          nextMetaRevision = remoteMetaRev + 1;
          lastAppliedCloudMetaRev = nextMetaRevision;
          manifestMutated = true;
          pushedDomains.osd = true;
          if (pushedOsd.tombstonesPushed) pushedDomains.tombstones = true;
          else verifiedUnchangedDomains.tombstones = true;
          verifiedUnchangedDomains.users = true;
          verifiedUnchangedDomains.warehouses = true;
        } else {
          verifiedUnchangedDomains.users = true;
          verifiedUnchangedDomains.warehouses = true;
          verifiedUnchangedDomains.tombstones = true;
          verifiedUnchangedDomains.osd = true;
        }

        const tombstones = StorageService.getTombstones();

        // 2 & 3. Tính lại digest Phiếu Nhập / Xuất SAU khi đã áp dụng tombstone từ Cloud
        const curInboundsAfterTomb = StorageService.getInboundReceipts();
        const curOutboundsAfterTomb = StorageService.getOutboundReceipts();
        const postPullInDigest = computeInboundDomainDigest(curInboundsAfterTomb);
        const postPullOutDigest = computeOutboundDomainDigest(curOutboundsAfterTomb);

        const postPullInDiff = !remoteV2 || postPullInDigest !== remoteV2.in;
        const postPullOutDiff = !remoteV2 || postPullOutDigest !== remoteV2.out;

        const shouldPullInbound = !remoteV2
          ? plan.pullInbound || missingLocalInbound
          : (postPullInDiff && (!hasV2Checkpoint || remoteV2.in !== cpRemoteV2!.in)) ||
            missingLocalInbound;
        const shouldPushInbound = !remoteV2
          ? dirtyFlags.inbound || !checkpointMatchesServer
          : dirtyFlags.inbound && postPullInDiff;

        const shouldPullOutbound = !remoteV2
          ? plan.pullOutbound || missingLocalOutbound
          : (postPullOutDiff && (!hasV2Checkpoint || remoteV2.out !== cpRemoteV2!.out)) ||
            missingLocalOutbound;
        const shouldPushOutbound = !remoteV2
          ? dirtyFlags.outbound || !checkpointMatchesServer
          : dirtyFlags.outbound && postPullOutDiff;

        const shouldSyncInbound = shouldPullInbound || shouldPushInbound;
        const shouldSyncOutbound = shouldPullOutbound || shouldPushOutbound;

        const inCacheHit = Boolean(
          shouldSyncInbound &&
            cloudInboundIndexCache &&
            cloudInboundIndexCache.uid === fbUser.uid &&
            remoteV2 &&
            cloudInboundIndexCache.domainDigest === remoteV2.in
        );
        const outCacheHit = Boolean(
          shouldSyncOutbound &&
            cloudOutboundIndexCache &&
            cloudOutboundIndexCache.uid === fbUser.uid &&
            remoteV2 &&
            cloudOutboundIndexCache.domainDigest === remoteV2.out
        );

        const fetchInboundIdx = () =>
          shouldSyncInbound
            ? inCacheHit
              ? Promise.resolve({
                  entries: new Map(cloudInboundIndexCache!.entries),
                  chunkIndexByCode: new Map(cloudInboundIndexCache!.chunkIndexByCode)
                })
              : pullReceiptIndexMap(
                  'inbound',
                  nextInboundIndexChunkCount,
                  remoteV2?.in || '',
                  fbUser.uid
                )
            : Promise.resolve(null);
        const fetchOutboundIdx = () =>
          shouldSyncOutbound
            ? outCacheHit
              ? Promise.resolve({
                  entries: new Map(cloudOutboundIndexCache!.entries),
                  chunkIndexByCode: new Map(cloudOutboundIndexCache!.chunkIndexByCode)
                })
              : pullReceiptIndexMap(
                  'outbound',
                  nextOutboundIndexChunkCount,
                  remoteV2?.out || '',
                  fbUser.uid
                )
            : Promise.resolve(null);

        let inIndexRes: Awaited<ReturnType<typeof fetchInboundIdx>>;
        let outIndexRes: Awaited<ReturnType<typeof fetchOutboundIdx>>;
        if (isLikelyMobileDevice()) {
          inIndexRes = await fetchInboundIdx();
          outIndexRes = await fetchOutboundIdx();
        } else {
          [inIndexRes, outIndexRes] = await Promise.all([fetchInboundIdx(), fetchOutboundIdx()]);
        }

        if (inIndexRes) {
          const cloudInMap = inIndexRes.entries;
          let inChunkIndexByCode = inIndexRes.chunkIndexByCode;
          for (const entry of Array.from(cloudInMap.values())) {
            knownExistingPaths.add(
              doc(db, 'workspaces', WORKSPACE_ID, 'inboundReceipts', entry.docId).path
            );
            for (let c = 0; c < entry.chunkCount; c++) {
              knownExistingPaths.add(
                doc(db, 'workspaces', WORKSPACE_ID, 'inboundItems', `${entry.docId}_c${c}`).path
              );
            }
          }

          const localInMap = new Map<string, InboundReceipt>();
          for (const r of curInboundsAfterTomb) {
            localInMap.set(normKey(r.receiptCode || r.id), r);
          }

          const inEntriesToPull: CloudReceiptIndexEntry[] = [];
          let inboundIndexChanged = false;

          for (const [code, entry] of Array.from(cloudInMap.entries())) {
            if (isRecordDeleted(tombstones.inbound, [entry.id, code, entry.code], entry.appUpdatedAt)) {
              cloudInMap.delete(code);
              inboundIndexChanged = true;
              continue;
            }
            if (!shouldPullInbound) continue;
            const localRcp = localInMap.get(code);
            const localRep = Number(localRcp?.itemsReplacedAt) || 0;
            const cloudRep = Number(entry.itemsReplacedAt) || 0;
            if (!localRcp) {
              inEntriesToPull.push(entry);
            } else if (localRep > cloudRep) {
              continue;
            } else if (
              cloudRep > localRep ||
              localRcp.items.length < entry.itemCount ||
              computeInboundReceiptDigest(localRcp) !== entry.digest
            ) {
              inEntriesToPull.push(entry);
            }
          }

          if (inEntriesToPull.length > 0) {
            const cfg = getCloudFetchConfig();
            const pulled = await runWithConcurrencyLimit(
              inEntriesToPull,
              cfg.concurrency,
              (e) => pullSingleInboundFromCloud(e),
              getSyncAbortOptions()
            );
            const valid = pulled.filter((x): x is InboundReceipt => Boolean(x));
            if (valid.length > 0) {
              StorageService.applyRemoteInboundReceipts(valid);
              pulledChanges = true;
            }
          }

          const refreshedInbounds = StorageService.getInboundReceipts();
          const inboundsToPush: Array<{ code: string; rcp: InboundReceipt }> = [];
          if (
            !shouldPullInbound &&
            inCacheHit &&
            !dirtyFlags.tombstones &&
            dirtyInboundCodes.size > 0
          ) {
            const refreshedByCode = new Map<string, InboundReceipt>();
            for (const r of refreshedInbounds) {
              refreshedByCode.set(normKey(r.receiptCode || r.id), r);
            }
            for (const code of Array.from(dirtyInboundCodes)) {
              const rcp = refreshedByCode.get(code);
              if (!rcp) continue;
              const cloudEntry = cloudInMap.get(code);
              if (!cloudEntry || computeInboundReceiptDigest(rcp) !== cloudEntry.digest) {
                inboundsToPush.push({ code, rcp });
              }
            }
          } else {
            for (const rcp of refreshedInbounds) {
              const code = normKey(rcp.receiptCode || rcp.id);
              const cloudEntry = cloudInMap.get(code);
              const localRep = Number(rcp.itemsReplacedAt) || 0;
              const cloudRep = Number(cloudEntry?.itemsReplacedAt) || 0;
              if (
                !cloudEntry ||
                localRep > cloudRep ||
                (localRep === cloudRep && rcp.items.length > cloudEntry.itemCount) ||
                computeInboundReceiptDigest(rcp) !== cloudEntry.digest
              ) {
                inboundsToPush.push({ code, rcp });
              }
            }
          }

          if (inboundsToPush.length > 0) {
            for (let waveStart = 0; waveStart < inboundsToPush.length; waveStart += RECEIPT_PUSH_WAVE_SIZE) {
              throwIfActiveSyncAborted();
              const wave = inboundsToPush.slice(waveStart, waveStart + RECEIPT_PUSH_WAVE_SIZE);
              const updatedEntries = await pushBulkInboundsToCloud(
                wave.map((x) => x.rcp),
                cloudInMap
              );
              for (let j = 0; j < wave.length; j++) {
                cloudInMap.set(wave[j].code, updatedEntries[j]);
              }
              inboundIndexChanged = true;

              // Nếu còn đợt phiếu tiếp theo, chốt ngay chỉ mục & điểm kiểm tra lên Cloud để bảo toàn tiến độ khi mạng chập chờn
              const hasMoreWaves = waveStart + RECEIPT_PUSH_WAVE_SIZE < inboundsToPush.length;
              if (hasMoreWaves) {
                const waveIdxRes = await writeReceiptIndexChunks(
                  'inbound',
                  cloudInMap,
                  inChunkIndexByCode,
                  nextInboundIndexChunkCount
                );
                nextInboundIndexChunkCount = waveIdxRes.chunkCount;
                inChunkIndexByCode = waveIdxRes.nextChunkIndexByCode;
                const baseV2 = parseMetaDigestV2(expectedBaseline.metaDigest);
                if (baseV2) {
                  const partialInDigest = computeReceiptDomainDigestFromIndexEntries(
                    'inbound',
                    cloudInMap.values()
                  );
                  const waveMetaDigest = encodeMetaDigestV2({
                    ...baseV2,
                    in: partialInDigest
                  });
                  const waveManifest = await commitManifestWithTransaction({
                    fbUser,
                    expectedBaseline,
                    localUpdate: {
                      touched: { inbound: true },
                      metaDigest: waveMetaDigest,
                      inboundIndexChunkCount: nextInboundIndexChunkCount,
                      bumpMetaRevision: false
                    }
                  });
                  remoteServerRev = waveManifest.serverRevision;
                  expectedBaseline.serverRevision = waveManifest.serverRevision;
                  expectedBaseline.metaDigest = waveManifest.metaDigest;
                  expectedBaseline.materialsDigest = waveManifest.materialsDigest;
                  nextMetaDigest = waveManifest.metaDigest;
                  activePassServerRev = waveManifest.serverRevision;
                  activePassMetaDigest = waveManifest.metaDigest;
                  pushedChanges = true;
                  cloudInboundIndexCache = {
                    uid: fbUser.uid,
                    domainDigest: partialInDigest,
                    chunkCount: nextInboundIndexChunkCount,
                    entries: new Map(cloudInMap),
                    chunkIndexByCode: new Map(inChunkIndexByCode)
                  };
                }
                persistKnownExistingPaths(fbUser.uid);
              }
            }
          }

          if (inboundIndexChanged) {
            const idxWriteRes = await writeReceiptIndexChunks(
              'inbound',
              cloudInMap,
              inChunkIndexByCode,
              nextInboundIndexChunkCount
            );
            nextInboundIndexChunkCount = idxWriteRes.chunkCount;
            inChunkIndexByCode = idxWriteRes.nextChunkIndexByCode;
            manifestMutated = true;
            pushedDomains.inbound = true;
          } else {
            verifiedUnchangedDomains.inbound = true;
          }

          cloudInboundIndexCache = {
            uid: fbUser.uid,
            domainDigest: computeInboundDomainDigest(refreshedInbounds),
            chunkCount: nextInboundIndexChunkCount,
            entries: new Map(cloudInMap),
            chunkIndexByCode: new Map(inChunkIndexByCode)
          };
        } else {
          verifiedUnchangedDomains.inbound = true;
        }

        if (outIndexRes) {
          const cloudOutMap = outIndexRes.entries;
          let outChunkIndexByCode = outIndexRes.chunkIndexByCode;
          for (const entry of Array.from(cloudOutMap.values())) {
            knownExistingPaths.add(
              doc(db, 'workspaces', WORKSPACE_ID, 'outboundReceipts', entry.docId).path
            );
            for (let c = 0; c < entry.chunkCount; c++) {
              knownExistingPaths.add(
                doc(db, 'workspaces', WORKSPACE_ID, 'outboundItems', `${entry.docId}_c${c}`).path
              );
            }
          }

          const localOutMap = new Map<string, OutboundReceipt>();
          for (const r of curOutboundsAfterTomb) {
            localOutMap.set(normKey(r.issueCode || r.id), r);
          }

          const outEntriesToPull: CloudReceiptIndexEntry[] = [];
          let outboundIndexChanged = false;

          for (const [code, entry] of Array.from(cloudOutMap.entries())) {
            if (isRecordDeleted(tombstones.outbound, [entry.id, code, entry.code], entry.appUpdatedAt)) {
              cloudOutMap.delete(code);
              outboundIndexChanged = true;
              continue;
            }
            if (!shouldPullOutbound) continue;
            const localRcp = localOutMap.get(code);
            const localRep = Number(localRcp?.itemsReplacedAt) || 0;
            const cloudRep = Number(entry.itemsReplacedAt) || 0;
            if (!localRcp) {
              outEntriesToPull.push(entry);
            } else if (localRep > cloudRep) {
              continue;
            } else if (
              cloudRep > localRep ||
              localRcp.items.length < entry.itemCount ||
              computeOutboundReceiptDigest(localRcp) !== entry.digest
            ) {
              outEntriesToPull.push(entry);
            }
          }

          if (outEntriesToPull.length > 0) {
            const cfg = getCloudFetchConfig();
            const pulled = await runWithConcurrencyLimit(
              outEntriesToPull,
              cfg.concurrency,
              (e) => pullSingleOutboundFromCloud(e),
              getSyncAbortOptions()
            );
            const valid = pulled.filter((x): x is OutboundReceipt => Boolean(x));
            if (valid.length > 0) {
              StorageService.applyRemoteOutboundReceipts(valid);
              pulledChanges = true;
            }
          }

          const refreshedOutbounds = StorageService.getOutboundReceipts();
          const outboundsToPush: Array<{ code: string; rcp: OutboundReceipt }> = [];
          if (
            !shouldPullOutbound &&
            outCacheHit &&
            !dirtyFlags.tombstones &&
            dirtyOutboundCodes.size > 0
          ) {
            const refreshedByCode = new Map<string, OutboundReceipt>();
            for (const r of refreshedOutbounds) {
              refreshedByCode.set(normKey(r.issueCode || r.id), r);
            }
            for (const code of Array.from(dirtyOutboundCodes)) {
              const rcp = refreshedByCode.get(code);
              if (!rcp) continue;
              const cloudEntry = cloudOutMap.get(code);
              if (!cloudEntry || computeOutboundReceiptDigest(rcp) !== cloudEntry.digest) {
                outboundsToPush.push({ code, rcp });
              }
            }
          } else {
            for (const rcp of refreshedOutbounds) {
              const code = normKey(rcp.issueCode || rcp.id);
              const cloudEntry = cloudOutMap.get(code);
              const localRep = Number(rcp.itemsReplacedAt) || 0;
              const cloudRep = Number(cloudEntry?.itemsReplacedAt) || 0;
              if (
                !cloudEntry ||
                localRep > cloudRep ||
                (localRep === cloudRep && rcp.items.length > cloudEntry.itemCount) ||
                computeOutboundReceiptDigest(rcp) !== cloudEntry.digest
              ) {
                outboundsToPush.push({ code, rcp });
              }
            }
          }

          if (outboundsToPush.length > 0) {
            for (let waveStart = 0; waveStart < outboundsToPush.length; waveStart += RECEIPT_PUSH_WAVE_SIZE) {
              throwIfActiveSyncAborted();
              const wave = outboundsToPush.slice(waveStart, waveStart + RECEIPT_PUSH_WAVE_SIZE);
              const updatedEntries = await pushBulkOutboundsToCloud(
                wave.map((x) => x.rcp),
                cloudOutMap
              );
              for (let j = 0; j < wave.length; j++) {
                cloudOutMap.set(wave[j].code, updatedEntries[j]);
              }
              outboundIndexChanged = true;

              const hasMoreWaves = waveStart + RECEIPT_PUSH_WAVE_SIZE < outboundsToPush.length;
              if (hasMoreWaves) {
                const waveIdxRes = await writeReceiptIndexChunks(
                  'outbound',
                  cloudOutMap,
                  outChunkIndexByCode,
                  nextOutboundIndexChunkCount
                );
                nextOutboundIndexChunkCount = waveIdxRes.chunkCount;
                outChunkIndexByCode = waveIdxRes.nextChunkIndexByCode;
                const baseV2 = parseMetaDigestV2(expectedBaseline.metaDigest);
                if (baseV2) {
                  const partialOutDigest = computeReceiptDomainDigestFromIndexEntries(
                    'outbound',
                    cloudOutMap.values()
                  );
                  const waveMetaDigest = encodeMetaDigestV2({
                    ...baseV2,
                    out: partialOutDigest
                  });
                  const waveManifest = await commitManifestWithTransaction({
                    fbUser,
                    expectedBaseline,
                    localUpdate: {
                      touched: { outbound: true },
                      metaDigest: waveMetaDigest,
                      outboundIndexChunkCount: nextOutboundIndexChunkCount,
                      bumpMetaRevision: false
                    }
                  });
                  remoteServerRev = waveManifest.serverRevision;
                  expectedBaseline.serverRevision = waveManifest.serverRevision;
                  expectedBaseline.metaDigest = waveManifest.metaDigest;
                  expectedBaseline.materialsDigest = waveManifest.materialsDigest;
                  nextMetaDigest = waveManifest.metaDigest;
                  activePassServerRev = waveManifest.serverRevision;
                  activePassMetaDigest = waveManifest.metaDigest;
                  pushedChanges = true;
                  cloudOutboundIndexCache = {
                    uid: fbUser.uid,
                    domainDigest: partialOutDigest,
                    chunkCount: nextOutboundIndexChunkCount,
                    entries: new Map(cloudOutMap),
                    chunkIndexByCode: new Map(outChunkIndexByCode)
                  };
                }
                persistKnownExistingPaths(fbUser.uid);
              }
            }
          }

          if (outboundIndexChanged) {
            const idxWriteRes = await writeReceiptIndexChunks(
              'outbound',
              cloudOutMap,
              outChunkIndexByCode,
              nextOutboundIndexChunkCount
            );
            nextOutboundIndexChunkCount = idxWriteRes.chunkCount;
            outChunkIndexByCode = idxWriteRes.nextChunkIndexByCode;
            manifestMutated = true;
            pushedDomains.outbound = true;
          } else {
            verifiedUnchangedDomains.outbound = true;
          }

          cloudOutboundIndexCache = {
            uid: fbUser.uid,
            domainDigest: computeOutboundDomainDigest(refreshedOutbounds),
            chunkCount: nextOutboundIndexChunkCount,
            entries: new Map(cloudOutMap),
            chunkIndexByCode: new Map(outChunkIndexByCode)
          };
        } else {
          verifiedUnchangedDomains.outbound = true;
        }

        throwIfActiveSyncAborted();
        // 4. Đồng bộ Danh Mục Vật Tư (Materials) theo chunk chỉ khi phía Cloud hoặc cục bộ có thay đổi
        const currentMats = StorageService.getMaterials();
        const matDigestBeforePull = computeMaterialsDigest(currentMats);
        if (
          effectivePullMaterials &&
          nextMaterialsChunkCount > 0 &&
          (currentMats.length === 0 || matDigestBeforePull !== nextMaterialsDigest)
        ) {
          await pullMaterialsFromCloud(nextMaterialsChunkCount);
          pulledChanges = true;
        }

        if (dirtyFlags.materials || !remoteV2) {
          throwIfActiveSyncAborted();
          const latestMats = StorageService.getMaterials();
          const latestMatDigest = computeMaterialsDigest(latestMats);
          if (dirtyFlags.materials && latestMatDigest !== nextMaterialsDigest) {
            const pushedMats = await pushMaterialsToCloud(nextMaterialsChunkCount);
            nextMaterialsCount = pushedMats.materialsCount;
            nextMaterialsChunkCount = pushedMats.materialsChunkCount;
            nextMaterialsDigest = pushedMats.materialsDigest;
            nextMaterialsRevision = (Number(wsData.materialsRevision) || 0) + 1;
            manifestMutated = true;
            pushedDomains.materials = true;
          } else {
            verifiedUnchangedDomains.materials = true;
          }
        } else {
          verifiedUnchangedDomains.materials = true;
        }

        const finalUsers = StorageService.getUsers();
        const finalWhs = StorageService.getWarehouses();
        const finalTombs = StorageService.getTombstones();
        const finalOsd = StorageService.getOsdReceipts();
        const finalMats = StorageService.getMaterials();
        const finalIn = StorageService.getInboundReceipts();
        const finalOut = StorageService.getOutboundReceipts();
        const finalMetaDigest = cleanStr(
          computeCloudSharedMetaDigest(
            finalUsers,
            finalWhs,
            finalTombs,
            finalOsd,
            finalIn,
            finalOut
          ),
          128,
          'v2:0.0.0|0.0.0|0.0.0|0.0.0|0.0.0|0.0.0'
        );
        const finalMatDigest = computeMaterialsDigest(finalMats);
        const finalInDigest = computeInboundDomainDigest(finalIn);
        const finalOutDigest = computeOutboundDomainDigest(finalOut);

        if (cloudInboundIndexCache && cloudInboundIndexCache.uid === fbUser.uid) {
          cloudInboundIndexCache.domainDigest = finalInDigest;
        }
        if (cloudOutboundIndexCache && cloudOutboundIndexCache.uid === fbUser.uid) {
          cloudOutboundIndexCache.domainDigest = finalOutDigest;
        }

        // Xóa cờ các miền đã đối chiếu khớp Cloud trước khi giao dịch manifest
        clearSyncedOutboxDomains(verifiedUnchangedDomains);

        // 5. Cập nhật WorkspaceManifest bằng Firestore Transaction chỉ khi có dữ liệu thay đổi mới đẩy lên Cloud
        let finalServerRev = remoteServerRev;
        let committedMetaDigestFromServer: string | undefined;
        let committedMatDigestFromServer: string | undefined;
        if (manifestMutated) {
          throwIfActiveSyncAborted();
          pushedChanges = true;
          const committedManifest = await commitManifestWithTransaction({
            fbUser,
            expectedBaseline,
            localUpdate: {
              touched: pushedDomains,
              metaDigest: finalMetaDigest,
              accountChunkCount: nextAccountChunkCount,
              warehouseChunkCount: nextWarehouseChunkCount,
              tombstoneChunkCount: nextTombstoneChunkCount,
              inboundIndexChunkCount: nextInboundIndexChunkCount,
              outboundIndexChunkCount: nextOutboundIndexChunkCount,
              materialsCount: nextMaterialsCount,
              materialsChunkCount: nextMaterialsChunkCount,
              materialsDigest: nextMaterialsDigest,
              bumpMetaRevision: Boolean(
                pushedDomains.users ||
                  pushedDomains.warehouses ||
                  pushedDomains.tombstones ||
                  pushedDomains.osd
              )
            }
          });
          finalServerRev = committedManifest.serverRevision;
          nextMetaRevision = committedManifest.metaRevision;
          committedMetaDigestFromServer = committedManifest.metaDigest;
          committedMatDigestFromServer = committedManifest.materialsDigest;
          // Chỉ xóa outbox của các miền vừa đẩy SAU KHI giao dịch WorkspaceManifest thành công
          clearSyncedOutboxDomains(pushedDomains);
        } else {
          lastAppliedCloudServerRev = remoteServerRev;
          lastAppliedCloudMetaRev = nextMetaRevision;
          lastAppliedCloudMetaDigest = expectedBaseline.metaDigest;
          lastAppliedCloudMaterialsDigest = expectedBaseline.materialsDigest;
        }

        const converged = resolveConvergedCheckpointDigests({
          manifestMutated,
          committedMetaDigest: committedMetaDigestFromServer,
          committedMaterialsDigest: committedMatDigestFromServer,
          remoteMetaDigest: expectedBaseline.metaDigest,
          remoteMaterialsDigest: expectedBaseline.materialsDigest,
          finalLocalMetaDigest: finalMetaDigest,
          finalLocalMaterialsDigest: finalMatDigest,
          dirty: {
            users: Boolean(dirtyFlags.users && !pushedDomains.users),
            warehouses: Boolean(dirtyFlags.warehouses && !pushedDomains.warehouses),
            tombstones: Boolean(dirtyFlags.tombstones && !pushedDomains.tombstones),
            osd: Boolean(dirtyFlags.osd && !pushedDomains.osd),
            inbound: Boolean(dirtyFlags.inbound && !pushedDomains.inbound),
            outbound: Boolean(dirtyFlags.outbound && !pushedDomains.outbound),
            materials: Boolean(dirtyFlags.materials && !pushedDomains.materials)
          }
        });

        lastSyncedOsdDigest = computeOsdOnlyDigest(finalOsd, finalTombs);
        writeCloudSyncCheckpoint({
          uid: fbUser.uid,
          serverRevision: finalServerRev,
          metaRevision: nextMetaRevision,
          metaDigest: converged.localMetaDigest,
          materialsDigest: converged.localMaterialsDigest,
          remoteMetaDigest: converged.remoteSyncedMetaDigest,
          remoteMaterialsDigest: converged.remoteSyncedMaterialsDigest,
          inboundDigest: finalInDigest,
          outboundDigest: finalOutDigest,
          osdDigest: lastSyncedOsdDigest,
          inboundCount: finalIn.length,
          outboundCount: finalOut.length,
          materialsCount: finalMats.length,
          inboundTombCount: Object.keys(finalTombs.inbound || {}).length,
          outboundTombCount: Object.keys(finalTombs.outbound || {}).length,
          chunkDigests: { ...ramChunkDigests }
        });
        persistKnownExistingPaths(fbUser.uid);

        await StorageService.flush();
        if (myControlEpoch !== cloudControlEpoch || cloudConnectionPaused) {
          return {
            ok: false,
            pulledChanges,
            pushedChanges,
            paused: cloudConnectionPaused,
            errorMessage: cloudPauseReason || undefined
          };
        }
        deferredRemoteChangeDuringAuth = false;
        consecutiveCloudFailures = 0;
        emitCloudState({
          status: 'connected',
          lastSyncedAt: Date.now(),
          errorMessage: null
        });
        if (pulledOsdForAttachments.length > 0) {
          void preloadOsdAttachments(pulledOsdForAttachments);
        }
        return { ok: true, pulledChanges, pushedChanges };
      } catch (err) {
        if (myControlEpoch !== cloudControlEpoch) {
          return {
            ok: false,
            pulledChanges,
            pushedChanges,
            paused: cloudConnectionPaused,
            errorMessage: cloudPauseReason || undefined
          };
        }
        if (
          err instanceof ManifestConflictError &&
          !cloudConnectionPaused &&
          !activeCloudWatchdog?.isAborted()
        ) {
          console.info('Cloud manifest conflict detected, scheduling pull-merge-retry:', err.reason);
          pendingCloudReconcile = true;
          pendingForceManifestRefresh = true;
          return {
            ok: true,
            pulledChanges,
            pushedChanges: false,
            manifestConflict: true
          };
        }
        console.warn('Cloud sync reconcile deferred:', err);
        const hitQuota = isQuotaExceededError(err) || isFirestoreQuotaExhausted();
        if (hitQuota) {
          const msg = notifyFirestoreQuotaExceeded(300_000, err);
          const pausedMsg = pauseCloudConnection(msg, { quotaExceeded: true });
          return {
            ok: false,
            pulledChanges,
            pushedChanges,
            paused: true,
            quotaExceeded: true,
            errorMessage: pausedMsg
          };
        }

        const hasConnectedToCloud = Boolean(activeCloudWatchdog?.isConnected());
        const elapsedMs = Date.now() - reconcileStartedAt;
        const timedOut2m =
          Boolean(activeCloudWatchdog?.didTimeOut()) ||
          (err instanceof SyncAbortedError && Boolean(err.timedOut)) ||
          (!hasConnectedToCloud && elapsedMs >= CLOUD_SYNC_HARD_TIMEOUT_MS);

        if (isSyncAbortedError(err) || cloudConnectionPaused || timedOut2m) {
          const pausedMsg = cloudConnectionPaused
            ? currentState.errorMessage || currentState.pauseReason || (err instanceof Error ? err.message : String(err))
            : pauseCloudConnection(err, { timedOutOver2Min: timedOut2m });
          return {
            ok: false,
            pulledChanges,
            pushedChanges,
            paused: true,
            quotaExceeded: currentState.quotaExceeded,
            errorMessage: pausedMsg
          };
        }

        consecutiveCloudFailures += 1;
        const errMsg = err instanceof Error ? err.message : String(err);
        const shouldPause = shouldPauseCloudOnFailure({
          elapsedMs,
          maxDurationMs: CLOUD_SYNC_HARD_TIMEOUT_MS,
          consecutiveFailures: consecutiveCloudFailures,
          hasConnectedToCloud,
          quotaExceeded: false,
          offline: typeof navigator !== 'undefined' && !navigator.onLine,
          timedOutOver2Min: !hasConnectedToCloud && elapsedMs >= CLOUD_SYNC_HARD_TIMEOUT_MS,
          nonRetryableError:
            isPermissionError(err) ||
            isFirestoreBillingOrPlanError(err) ||
            !isRetryableCloudReadError(err),
          isManualTrigger: isManual
        });

        if (shouldPause) {
          const pausedMsg = pauseCloudConnection(err, {
            isOnline: typeof navigator === 'undefined' || navigator.onLine,
            timedOutOver2Min: !hasConnectedToCloud && elapsedMs >= CLOUD_SYNC_HARD_TIMEOUT_MS
          });
          return {
            ok: false,
            pulledChanges,
            pushedChanges,
            paused: true,
            errorMessage: pausedMsg
          };
        }

        if (currentState.status === 'connecting') {
          settleConnectingStateIfNeeded(errMsg);
        } else {
          emitCloudState({
            status: 'error',
            quotaExceeded: false,
            errorMessage:
              errMsg || 'Đồng bộ Cloud Firestore bị gián đoạn. Vui lòng thử đồng bộ lại.'
          });
        }
        return {
          ok: false,
          pulledChanges,
          pushedChanges,
          errorMessage: errMsg
        };
      }
    };

    let thisReconcilePromise: typeof reconcileInFlightPromise = null;
    thisReconcilePromise = (async () => {
      cloudTransferTracker.begin();
      let anyPulled = false;
      let anyPushed = false;
      let passCount = 0;
      let lastRes: {
        ok: boolean;
        pulledChanges: boolean;
        pushedChanges?: boolean;
        manifestConflict?: boolean;
        quotaExceeded?: boolean;
        paused?: boolean;
        errorMessage?: string;
      } = { ok: false, pulledChanges: false, pushedChanges: false };

      try {
        while (true) {
          passCount += 1;
          const forceThisPass = passCount === 1 ? initialForceRefresh : pendingForceManifestRefresh;
          pendingCloudReconcile = false;
          pendingForceManifestRefresh = false;

          const passRes = await runSinglePass(forceThisPass);
          if (passRes.pulledChanges) anyPulled = true;
          if (passRes.pushedChanges) anyPushed = true;
          lastRes = {
            ...passRes,
            pulledChanges: anyPulled,
            pushedChanges: anyPushed
          };

          if (
            passRes.quotaExceeded ||
            passRes.paused ||
            !passRes.ok ||
            !pendingCloudReconcile ||
            passCount >= 2 ||
            cloudConnectionPaused ||
            myControlEpoch !== cloudControlEpoch ||
            Boolean(activeCloudWatchdog?.isAborted())
          ) {
            pendingCloudReconcile = false;
            pendingForceManifestRefresh = false;
            break;
          }
        }
        if (lastRes.manifestConflict) {
          return {
            ok: false,
            pulledChanges: anyPulled,
            pushedChanges: anyPushed,
            errorMessage:
              'Dữ liệu trên Cloud vừa được thiết bị khác cập nhật đồng thời. Đã giữ lại thay đổi cục bộ để đồng bộ lại.'
          };
        }
        return {
          ok: lastRes.ok,
          pulledChanges: anyPulled,
          pushedChanges: anyPushed,
          quotaExceeded: lastRes.quotaExceeded,
          paused: lastRes.paused,
          errorMessage: lastRes.errorMessage
        };
      } finally {
        cloudTransferTracker.end();
        if (reconcileInFlightPromise === thisReconcilePromise) {
          isCloudReconciling = false;
          reconcileInFlightPromise = null;
          activeWorkDetectedCallbacks.clear();
        }
        if (ownedWatchdog) {
          if (activeCloudWatchdog === ownedWatchdog) {
            activeCloudWatchdog = null;
          }
          ownedWatchdog.dispose();
        }
      }
    })();

    reconcileInFlightPromise = thisReconcilePromise;
    return await thisReconcilePromise;
  },

  // ==========================================================================
  // Cloud Single-Device Session Lock Operations
  // ==========================================================================
  async syncActiveSessionToCloudIfConnected(session: ActiveUserSession): Promise<void> {
    if (!isSessionStillValidLocally(session.sessionToken)) return;
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) return;
    const ok = await ensureWorkspaceReady(fbUser);
    if (!ok || !isSessionStillValidLocally(session.sessionToken)) return;

    attachWorkspaceRealtimeListener();
    emitCloudState({
      status: 'connected',
      errorMessage: null
    });

    const userKey = canonicalUserSessionKey(session.userKey || session.username);
    const sessionDocId = makeSafeDocId('sess', userKey);
    const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
    const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);
    const existingSnap = await safeGetDoc(sessRef, sessPath);
    if (!isSessionStillValidLocally(session.sessionToken)) return;

    const prev = existingSnap.exists() ? existingSnap.data() : null;
    const nowMs = Date.now();
    const prevToken = String(prev?.sessionToken || '');

    // Nếu đám mây đã ghi nhận đúng mã phiên này và nhịp tim còn rất mới thì không cần ghi lặp lại
    if (prevToken === session.sessionToken) {
      if (isSessionHeartbeatFresh(nowMs, Number(prev?.lastSeenAt) || 0, 20_000)) {
        this.watchActiveSession(userKey);
        return;
      }
    }

    // NẾU ĐÁM MÂY ĐANG CÓ MÃ PHIÊN KHÁC:
    if (prev && prevToken && prevToken !== session.sessionToken) {
      // Nếu thiết bị khác đang giữ phiên hoạt động trên đám mây:
      if (prev.deviceId && prev.deviceId !== session.deviceId) {
        externalOnRemoteSessionSnapshot?.(prev);
        return;
      }
      rememberRevokedCloudToken(prevToken);
    }

    const monotonicIssued =
      prevToken === session.sessionToken
        ? Number(prev?.issuedAtMs) || Number(session.issuedAtMs) || nowMs
        : Math.max(
            Number(session.issuedAtMs) || nowMs,
            (Number(prev?.issuedAtMs) || 0) + 1,
            (Number(prev?.revokedBeforeMs) || 0) + 1
          );

    if (!isSessionStillValidLocally(session.sessionToken)) return;

    await writeSingleProtectedDoc(
      sessRef,
      sessPath,
      {
        workspaceId: WORKSPACE_ID,
        sessionDocId,
        userKey: cleanStr(userKey, 160, 'user')
      },
      {
        userId: cleanStr(session.userId, 160, 'user-0'),
        username: cleanStr(session.username, 160, 'user'),
        sessionToken: cleanStr(session.sessionToken, 200, ''),
        issuedAtMs: monotonicIssued,
        deviceId: cleanStr(session.deviceId, 160, ''),
        deviceLabel: cleanStr(session.deviceLabel, 200, 'Thiết bị Web'),
        loginAt: cleanStr(session.loginAt, 64, new Date(nowMs).toISOString()),
        lastSeenAt: nowMs,
        revokedBeforeMs: cleanNum(prev?.revokedBeforeMs, 0),
        forceLogoutDeviceLabel: cleanStr(prev?.forceLogoutDeviceLabel, 200, ''),
        forceLogoutAt: cleanStr(prev?.forceLogoutAt, 64, '')
      }
    );
    if (isSessionStillValidLocally(session.sessionToken)) {
      this.watchActiveSession(userKey);
    }
  },

  async loginWithCloud(
    username: string,
    password: string,
    deviceId: string,
    deviceLabel: string,
    forceLogoutOtherDevice: boolean
  ): Promise<{
    handled: boolean;
    success: boolean;
    conflict?: boolean;
    activeSession?: ActiveUserSession;
    user?: User;
    session?: ActiveUserSession;
    replacedSession?: ActiveUserSession;
    message: string;
  }> {
    try {
      const fbUser = auth.currentUser;
      if (!fbUser || !fbUser.emailVerified) {
        return { handled: false, success: false, message: '' };
      }

      const tokenOk = await ensureValidFirebaseAuthToken(fbUser);
      if (!tokenOk) {
        return { handled: false, success: false, message: '' };
      }

      const ok = await ensureWorkspaceReady(fbUser);
      if (!ok) {
        return { handled: false, success: false, message: '' };
      }

      // Chỉ tải accounts/tombstones từ Cloud khi digest miền người dùng hoặc tombstone có thay đổi
      const wsRef = doc(db, 'workspaces', WORKSPACE_ID);
      const wsSnap = await safeGetDoc(wsRef, `workspaces/${WORKSPACE_ID}`);
      if (wsSnap.exists()) {
        const wsManifest = wsSnap.data() as WorkspaceManifestDoc;
        cachedWsManifest = { data: wsManifest, atMs: Date.now() };
        const loginFlags = computeLoginMetaPullFlags({
          remoteMetaDigest: wsManifest.metaDigest,
          accountChunkCount: wsManifest.accountChunkCount,
          tombstoneChunkCount: wsManifest.tombstoneChunkCount,
          localUsers: StorageService.getUsers(),
          localTombstones: StorageService.getTombstones(),
          isAdmin: isCloudAdmin(fbUser)
        });
        if (loginFlags.pullUsers || loginFlags.pullTombstones) {
          await pullMetaFromCloud(wsManifest, fbUser, {
            pullUsers: loginFlags.pullUsers,
            pullWarehouses: false,
            pullTombstones: loginFlags.pullTombstones,
            pullOsd: false
          });
        }
      }

      const users = StorageService.getUsers();
      const matched = findMatchingUser(users, username);

      if (!matched) {
        return {
          handled: true,
          success: false,
          message: `Tài khoản "${username}" không tồn tại trong hệ thống. Vui lòng kiểm tra lại tên đăng nhập!`
        };
      }

      if (!matched.isActive) {
        return {
          handled: true,
          success: false,
          message: 'Tài khoản này hiện đang bị khóa hoặc ngừng kích hoạt. Vui lòng liên hệ Admin.'
        };
      }

      if (!isPasswordMatch(matched.password, password)) {
        return {
          handled: true,
          success: false,
          message: 'Mật khẩu đăng nhập không chính xác. Vui lòng kiểm tra lại.'
        };
      }

      const userKey = canonicalUserSessionKey(matched);
      const sessionDocId = makeSafeDocId('sess', userKey);
      const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
      const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);
      const sessSnap = await safeGetDoc(sessRef, sessPath);
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      let prevActive: ActiveUserSession | undefined;
      let prevIssued = 0;
      let prevRevoked = Number(matched.sessionRevokedAt) || 0;

      if (sessSnap.exists()) {
        const d = sessSnap.data();
        prevIssued = Number(d.issuedAtMs) || 0;
        prevRevoked = Math.max(prevRevoked, Number(d.revokedBeforeMs) || 0);
        const existingToken = String(d.sessionToken || '');
        const hasToken = Boolean(existingToken) && !revokedCloudSessionTokens.has(existingToken);
        const isFresh = isSessionHeartbeatFresh(
          nowMs,
          Number(d.lastSeenAt) || Number(d.issuedAtMs) || 0,
          ACTIVE_SESSION_TTL_MS
        );
        const isUnrevoked = prevRevoked === 0 || prevIssued > prevRevoked;
        if (hasToken && isFresh && isUnrevoked) {
          prevActive = {
            userId: String(d.userId || matched.id),
            username: String(d.username || matched.username),
            userKey,
            sessionToken: existingToken,
            issuedAtMs: prevIssued,
            deviceId: String(d.deviceId || ''),
            deviceLabel: String(d.deviceLabel || 'Thiết bị khác'),
            loginAt: String(d.loginAt || nowIso),
            lastSeenAt: Number(d.lastSeenAt) || nowMs
          };
        }
      }

      if (prevActive && !forceLogoutOtherDevice && prevActive.deviceId !== deviceId) {
        return {
          handled: true,
          success: false,
          conflict: true,
          activeSession: prevActive,
          message: `Tài khoản "${matched.username}" đang đăng nhập trên ${prevActive.deviceLabel || 'thiết bị khác'}. Không cho phép một tài khoản đăng nhập cùng lúc trên 2 thiết bị. Bạn có muốn đăng xuất thiết bị kia từ xa để đăng nhập tại đây không?`
        };
      }

      if (prevActive?.sessionToken) {
        rememberRevokedCloudToken(prevActive.sessionToken);
      }

      const monotonicIssued = Math.max(nowMs, prevIssued + 2, prevRevoked + 2);
      const newToken = `cloud.${monotonicIssued}.${Math.random().toString(36).slice(2, 12)}`;
      const nextRevokedBefore = forceLogoutOtherDevice ? monotonicIssued - 1 : prevRevoked;

      const newSession: ActiveUserSession = {
        userId: matched.id,
        username: matched.username,
        userKey,
        sessionToken: newToken,
        issuedAtMs: monotonicIssued,
        deviceId,
        deviceLabel,
        loginAt: nowIso,
        lastSeenAt: nowMs
      };

      await writeSingleProtectedDoc(
        sessRef,
        sessPath,
        {
          workspaceId: WORKSPACE_ID,
          sessionDocId,
          userKey: cleanStr(userKey, 160, 'user')
        },
        {
          userKey: cleanStr(userKey, 160, 'user'),
          userId: cleanStr(matched.id, 160, 'user-0'),
          username: cleanStr(matched.username, 160, 'user'),
          sessionToken: newToken,
          issuedAtMs: monotonicIssued,
          deviceId: cleanStr(deviceId, 160, ''),
          deviceLabel: cleanStr(deviceLabel, 200, 'Thiết bị Web'),
          loginAt: nowIso,
          lastSeenAt: nowMs,
          revokedBeforeMs: cleanNum(nextRevokedBefore, 0),
          forceLogoutDeviceLabel: forceLogoutOtherDevice ? cleanStr(deviceLabel, 200, '') : '',
          forceLogoutAt: forceLogoutOtherDevice ? nowIso : ''
        }
      );

      const updatedFromStore =
        StorageService.updateUser(
          matched.id,
          {
            lastLogin: nowIso,
            sessionRevokedAt: forceLogoutOtherDevice
              ? Math.max(Number(matched.sessionRevokedAt) || 0, nextRevokedBefore)
              : matched.sessionRevokedAt
          },
          {
            preserveUpdatedAt: !forceLogoutOtherDevice,
            emitMutation: forceLogoutOtherDevice
          }
        ) || {
          ...matched,
          lastLogin: nowIso
        };

      emitCloudState({ status: 'connected', errorMessage: null });
      this.watchActiveSession(userKey);

      return {
        handled: true,
        success: true,
        user: updatedFromStore,
        session: newSession,
        replacedSession: prevActive && prevActive.deviceId !== deviceId ? prevActive : undefined,
        message: 'Đăng nhập & đồng bộ đám mây thành công!'
      };
    } catch (err) {
      console.warn('Cloud login unavailable, falling back to server authentication:', err);
      return { handled: false, success: false, message: '' };
    }
  },

  async loginWithGoogleIdentityOnCloud(
    fbUser: FirebaseUser,
    deviceId: string,
    deviceLabel: string,
    forceLogoutOtherDevice: boolean,
    timeoutMs = 6000
  ): Promise<{
    handled: boolean;
    success: boolean;
    conflict?: boolean;
    locked?: boolean;
    activeSession?: ActiveUserSession;
    user?: User;
    session?: ActiveUserSession;
    replacedSession?: ActiveUserSession;
    message: string;
  }> {
    if (isFirestoreCircuitOpen() || !fbUser || !fbUser.email || !fbUser.emailVerified) {
      settleConnectingStateIfNeeded();
      return { handled: false, success: false, message: '' };
    }

    let timedOut = false;
    const effectiveTimeoutMs = Math.max(1500, Math.min(timeoutMs, 15000));
    const fastReadTimeoutMs = Math.min(effectiveTimeoutMs, 4500);
    const attemptId = ++activeInteractiveAuthAttemptId;

    const executeFastCloudLogin = async (): Promise<{
      handled: boolean;
      success: boolean;
      conflict?: boolean;
      locked?: boolean;
      activeSession?: ActiveUserSession;
      user?: User;
      session?: ActiveUserSession;
      replacedSession?: ActiveUserSession;
      message: string;
    }> => {
      interactiveAuthInFlight = true;
      try {
        const tokenOk = await ensureValidFirebaseAuthToken(
          fbUser,
          Math.min(effectiveTimeoutMs, 4000)
        );
        if (!tokenOk || timedOut || activeInteractiveAuthAttemptId !== attemptId) {
          settleConnectingStateIfNeeded();
          return { handled: false, success: false, message: '' };
        }
        const ok = await ensureWorkspaceReady(fbUser, {
          readTimeoutMs: fastReadTimeoutMs,
          maxRetries: 0
        });
        if (!ok || !fbUser.email || timedOut || activeInteractiveAuthAttemptId !== attemptId) {
          settleConnectingStateIfNeeded();
          return { handled: false, success: false, message: '' };
        }

        const emailLower = fbUser.email.trim().toLowerCase();
        const emailDigest = computeEmailAuthDigest(emailLower);

        // Chỉ tải accounts_* / tomb_* khi digest người dùng hoặc tombstone thực sự khác cục bộ
        let wsManifest: WorkspaceManifestDoc | null =
          cachedWsManifest && Date.now() - cachedWsManifest.atMs < 10_000
            ? cachedWsManifest.data
            : null;
        if (!wsManifest) {
          try {
            const wsSnap = await safeGetDoc(
              doc(db, 'workspaces', WORKSPACE_ID),
              `workspaces/${WORKSPACE_ID}`,
              fastReadTimeoutMs,
              0
            );
            if (wsSnap.exists()) {
              wsManifest = wsSnap.data() as WorkspaceManifestDoc;
              cachedWsManifest = { data: wsManifest, atMs: Date.now() };
            }
          } catch {
            // fallback using local users
          }
        }
        if (wsManifest) {
          const loginFlags = computeLoginMetaPullFlags({
            remoteMetaDigest: wsManifest.metaDigest,
            accountChunkCount: wsManifest.accountChunkCount,
            tombstoneChunkCount: wsManifest.tombstoneChunkCount,
            localUsers: StorageService.getUsers(),
            localTombstones: StorageService.getTombstones(),
            isAdmin: isCloudAdmin(fbUser)
          });
          if (loginFlags.pullUsers || loginFlags.pullTombstones) {
            await pullMetaFromCloud(wsManifest, fbUser, {
              pullUsers: loginFlags.pullUsers,
              pullWarehouses: false,
              pullTombstones: loginFlags.pullTombstones,
              pullOsd: false
            });
          }
        }
        const localUsers = StorageService.getUsers();

        if (timedOut) {
          return { handled: false, success: false, message: '' };
        }

        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const resolved = resolveGoogleUserRecord(localUsers, {
          email: emailLower,
          displayName: fbUser.displayName,
          uid: fbUser.uid,
          nowMs
        });

        if (!resolved.allowed) {
          await this.disconnectGoogleAccount().catch(() => {});
          return {
            handled: true,
            success: false,
            locked: true,
            user: resolved.user,
            message:
              resolved.message ||
              'Tài khoản Google này chưa được cấp quyền truy cập bởi Quản trị viên.'
          };
        }

        let matched = resolved.user;
        if (resolved.isNew || resolved.mutated) {
          matched = StorageService.upsertGoogleUser(matched);
          this.markLocalMutation('meta', [matched.id], { users: true });
        }

        const userKey = canonicalUserSessionKey(matched);
        const sessionDocId = makeSafeDocId('sess', userKey);
        const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
        const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);
        const sessSnap = await safeGetDoc(sessRef, sessPath, fastReadTimeoutMs, 0);

        if (timedOut) {
          return { handled: false, success: false, message: '' };
        }

        let prevActive: ActiveUserSession | undefined;
        let prevIssued = 0;
        let prevRevoked = Number(matched.sessionRevokedAt) || 0;

        if (sessSnap.exists()) {
          const d = sessSnap.data();
          prevIssued = Number(d.issuedAtMs) || 0;
          prevRevoked = Math.max(prevRevoked, Number(d.revokedBeforeMs) || 0);
          const existingToken = String(d.sessionToken || '');
          const hasToken = Boolean(existingToken) && !revokedCloudSessionTokens.has(existingToken);
          const isFresh = isSessionHeartbeatFresh(
            nowMs,
            Number(d.lastSeenAt) || Number(d.issuedAtMs) || 0,
            ACTIVE_SESSION_TTL_MS
          );
          const isUnrevoked = prevRevoked === 0 || prevIssued > prevRevoked;
          if (hasToken && isFresh && isUnrevoked) {
            prevActive = {
              userId: String(d.userId || matched.id),
              username: String(d.username || matched.username),
              userKey,
              sessionToken: existingToken,
              issuedAtMs: prevIssued,
              deviceId: String(d.deviceId || ''),
              deviceLabel: String(d.deviceLabel || 'Thiết bị khác'),
              loginAt: String(d.loginAt || nowIso),
              lastSeenAt: Number(d.lastSeenAt) || nowMs
            };
          }
        }

        if (prevActive && !forceLogoutOtherDevice && prevActive.deviceId !== deviceId) {
          return {
            handled: true,
            success: false,
            conflict: true,
            activeSession: prevActive,
            message: `Tài khoản Google "${matched.username}" (${matched.email}) đang đăng nhập trên ${prevActive.deviceLabel || 'thiết bị khác'}. Không cho phép một tài khoản đăng nhập cùng lúc trên 2 thiết bị. Bạn có muốn đăng xuất thiết bị kia từ xa để đăng nhập tại đây không?`
          };
        }

        if (timedOut) {
          return { handled: false, success: false, message: '' };
        }

        if (prevActive?.sessionToken) {
          rememberRevokedCloudToken(prevActive.sessionToken);
        }

        const monotonicIssued = Math.max(nowMs, prevIssued + 2, prevRevoked + 2);
        const newToken = `cloud.${monotonicIssued}.${Math.random().toString(36).slice(2, 12)}`;
        const nextRevokedBefore = forceLogoutOtherDevice ? monotonicIssued - 1 : prevRevoked;

        const newSession: ActiveUserSession = {
          userId: matched.id,
          username: matched.username,
          userKey,
          sessionToken: newToken,
          issuedAtMs: monotonicIssued,
          deviceId,
          deviceLabel,
          loginAt: nowIso,
          lastSeenAt: nowMs
        };

        const sessionMutablePayload = {
          userKey: cleanStr(userKey, 160, 'user'),
          userId: cleanStr(matched.id, 160, 'user-0'),
          username: cleanStr(matched.username, 160, 'user'),
          sessionToken: newToken,
          issuedAtMs: monotonicIssued,
          deviceId: cleanStr(deviceId, 160, ''),
          deviceLabel: cleanStr(deviceLabel, 200, 'Thiết bị Web'),
          loginAt: nowIso,
          lastSeenAt: nowMs,
          revokedBeforeMs: cleanNum(nextRevokedBefore, 0),
          forceLogoutDeviceLabel: forceLogoutOtherDevice ? cleanStr(deviceLabel, 200, '') : '',
          forceLogoutAt: forceLogoutOtherDevice ? nowIso : '',
          updatedByUid: fbUser.uid,
          updatedAt: serverTimestamp()
        };

        if (sessSnap.exists()) {
          try {
            await updateDoc(sessRef, sessionMutablePayload);
          } catch {
            await setDoc(sessRef, {
              workspaceId: WORKSPACE_ID,
              sessionDocId,
              ...sessionMutablePayload,
              createdAt: sessSnap.data()?.createdAt || serverTimestamp()
            });
          }
        } else {
          await setDoc(sessRef, {
            workspaceId: WORKSPACE_ID,
            sessionDocId,
            ...sessionMutablePayload,
            createdAt: serverTimestamp()
          });
          knownExistingPaths.add(sessRef.path);
        }

        if (timedOut || activeInteractiveAuthAttemptId !== attemptId) {
          settleConnectingStateIfNeeded();
          return { handled: false, success: false, message: '' };
        }

        const shouldSyncUserMetaToCloud = resolved.isNew || resolved.mutated || forceLogoutOtherDevice;
        const updatedFromStore =
          StorageService.updateUser(
            matched.id,
            {
              email: emailLower,
              lastLogin: nowIso,
              sessionRevokedAt: forceLogoutOtherDevice
                ? Math.max(Number(matched.sessionRevokedAt) || 0, nextRevokedBefore)
                : matched.sessionRevokedAt
            },
            {
              preserveUpdatedAt: !shouldSyncUserMetaToCloud,
              emitMutation: shouldSyncUserMetaToCloud
            }
          ) || {
            ...matched,
            email: emailLower,
            lastLogin: nowIso
          };

        if (shouldSyncUserMetaToCloud) {
          this.markLocalMutation('meta', [matched.id], { users: true });
        }
        attachWorkspaceRealtimeListener();
        emitCloudState({ status: 'connected', errorMessage: null });
        this.watchActiveSession(userKey);

        return {
          handled: true,
          success: true,
          user: updatedFromStore,
          session: newSession,
          replacedSession: prevActive && prevActive.deviceId !== deviceId ? prevActive : undefined,
          message: `Đăng nhập thành công với ${emailLower}!`
        };
      } catch (err) {
        console.warn('Cloud Google identity login deferred to server/local fallback:', err);
        if (isQuotaExceededError(err)) {
          notifyFirestoreQuotaExceeded(300_000, err);
        } else {
          settleConnectingStateIfNeeded();
        }
        return { handled: false, success: false, message: '' };
      } finally {
        if (activeInteractiveAuthAttemptId === attemptId) {
          interactiveAuthInFlight = false;
        }
      }
    };

    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    return Promise.race([
      executeFastCloudLogin(),
      new Promise<{
        handled: boolean;
        success: boolean;
        message: string;
      }>((resolve) => {
        timeoutTimer = setTimeout(() => {
          timedOut = true;
          if (activeInteractiveAuthAttemptId === attemptId) {
            interactiveAuthInFlight = false;
          }
          settleConnectingStateIfNeeded('Kết nối Cloud Firestore phản hồi chậm trên mạng di động.');
          resolve({ handled: false, success: false, message: '' });
        }, effectiveTimeoutMs);
      })
    ]).finally(() => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (activeInteractiveAuthAttemptId === attemptId) {
        interactiveAuthInFlight = false;
      }
    });
  },

  async requestLogoutOtherDeviceByGoogleWithCloud(
    fbUser: FirebaseUser,
    deviceLabel: string
  ): Promise<{ handled: boolean; success: boolean; message: string }> {
    try {
      if (!fbUser || !fbUser.email || !fbUser.emailVerified) {
        return { handled: false, success: false, message: '' };
      }
      const tokenOk = await ensureValidFirebaseAuthToken(fbUser);
      if (!tokenOk) return { handled: false, success: false, message: '' };

      const ok = await ensureWorkspaceReady(fbUser);
      if (!ok) return { handled: false, success: false, message: '' };

      const wsRef = doc(db, 'workspaces', WORKSPACE_ID);
      const wsSnap = await safeGetDoc(wsRef, `workspaces/${WORKSPACE_ID}`);
      if (wsSnap.exists()) {
        const wsManifest = wsSnap.data() as WorkspaceManifestDoc;
        cachedWsManifest = { data: wsManifest, atMs: Date.now() };
        const loginFlags = computeLoginMetaPullFlags({
          remoteMetaDigest: wsManifest.metaDigest,
          accountChunkCount: wsManifest.accountChunkCount,
          tombstoneChunkCount: wsManifest.tombstoneChunkCount,
          localUsers: StorageService.getUsers(),
          localTombstones: StorageService.getTombstones(),
          isAdmin: isCloudAdmin(fbUser)
        });
        if (loginFlags.pullUsers || loginFlags.pullTombstones) {
          await pullMetaFromCloud(wsManifest, fbUser, {
            pullUsers: loginFlags.pullUsers,
            pullWarehouses: false,
            pullTombstones: loginFlags.pullTombstones,
            pullOsd: false
          });
        }
      }

      const resolved = resolveGoogleUserRecord(StorageService.getUsers(), {
        email: fbUser.email,
        displayName: fbUser.displayName,
        uid: fbUser.uid
      });
      if (!resolved.allowed) {
        await this.disconnectGoogleAccount().catch(() => {});
        return {
          handled: true,
          success: false,
          message:
            resolved.message ||
            'Tài khoản Google này chưa được cấp quyền truy cập bởi Quản trị viên.'
        };
      }

      const matched = resolved.user;
      const userKey = canonicalUserSessionKey(matched);
      const sessionDocId = makeSafeDocId('sess', userKey);
      const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
      const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);
      const prevSnap = await safeGetDoc(sessRef, sessPath);
      const prev = prevSnap.exists() ? prevSnap.data() : null;
      if (prev?.sessionToken) {
        rememberRevokedCloudToken(String(prev.sessionToken));
      }
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const revokeMark = Math.max(
        nowMs,
        Number(matched.sessionRevokedAt) || 0,
        Number(prev?.issuedAtMs) || 0,
        Number(prev?.revokedBeforeMs) || 0
      );

      await writeSingleProtectedDoc(
        sessRef,
        sessPath,
        {
          workspaceId: WORKSPACE_ID,
          sessionDocId,
          userKey: cleanStr(userKey, 160, 'user')
        },
        {
          userId: cleanStr(matched.id, 160, 'user-0'),
          username: cleanStr(matched.username, 160, 'user'),
          sessionToken: '',
          issuedAtMs: revokeMark,
          deviceId: '',
          deviceLabel: '',
          loginAt: '',
          lastSeenAt: 0,
          revokedBeforeMs: revokeMark,
          forceLogoutDeviceLabel: cleanStr(deviceLabel, 200, 'Thiết bị khác'),
          forceLogoutAt: nowIso
        }
      );

      if (!resolved.isNew) {
        StorageService.updateUser(matched.id, { sessionRevokedAt: revokeMark });
      }
      void this.reconcileWithCloud();

      return {
        handled: true,
        success: true,
        message: 'Đã đăng xuất phiên trên thiết bị kia thành công! Bạn có thể tiếp tục đăng nhập ngay.'
      };
    } catch (err) {
      console.warn('Cloud Google remote logout fallback to server:', err);
      return { handled: false, success: false, message: '' };
    }
  },

  async verifySessionWithCloud(mySession: ActiveUserSession): Promise<{
    handled: boolean;
    valid: boolean;
    reason?: 'replaced' | 'disabled' | 'force_logout';
    replacedBy?: ActiveUserSession;
    forceLogoutBy?: { deviceLabel?: string; at?: string };
  }> {
    try {
      if (!isSessionStillValidLocally(mySession.sessionToken)) {
        return { handled: false, valid: true };
      }
      const fbUser = auth.currentUser;
      if (!fbUser || !fbUser.emailVerified || isFirestoreCircuitOpen()) {
        return { handled: false, valid: true };
      }

      const users = StorageService.getUsers();
      const matched = users.find(
        (u) => normUserKey(u.username) === normUserKey(mySession.userKey) || u.id === mySession.userId
      );
      if (matched && !matched.isActive) {
        return { handled: true, valid: false, reason: 'disabled' };
      }

      const userKey =
        canonicalUserSessionKey({ username: mySession.username, email: matched?.email }) ||
        canonicalUserSessionKey(mySession.userKey);
      const sessionDocId = makeSafeDocId('sess', userKey);
      const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
      const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);
      const snap = await safeGetDoc(sessRef, sessPath);
      if (!isSessionStillValidLocally(mySession.sessionToken)) {
        return { handled: false, valid: true };
      }

      if (!snap.exists()) {
        await this.syncActiveSessionToCloudIfConnected(mySession);
        return { handled: true, valid: true };
      }

      const d = snap.data();
      const remoteToken = String(d.sessionToken || '');
      const remoteIssued = Number(d.issuedAtMs) || 0;
      const revokedBefore = Number(d.revokedBeforeMs) || 0;
      const myIssued = Number(mySession.issuedAtMs) || 0;

      if (remoteToken === mySession.sessionToken) {
        return { handled: true, valid: true };
      }

      if (!remoteToken) {
        // Tài khoản không có thiết bị nào đang giữ phiên (thiết bị trước đã đăng xuất) -> bảo toàn phiên hiện tại và ghi nhận lên đám mây
        await this.syncActiveSessionToCloudIfConnected(mySession);
        return { handled: true, valid: true };
      }

      if (
        remoteToken &&
        remoteToken !== mySession.sessionToken &&
        d.deviceId &&
        d.deviceId !== mySession.deviceId
      ) {
        // CHỈ ngắt phiên nếu thiết bị khác phát hành phiên MỚI HƠN phiên này!
        if (remoteIssued > myIssued) {
          return {
            handled: true,
            valid: false,
            reason: 'replaced',
            replacedBy: {
              userId: String(d.userId || mySession.userId),
              username: String(d.username || mySession.username),
              userKey,
              sessionToken: remoteToken,
              issuedAtMs: remoteIssued,
              deviceId: String(d.deviceId || ''),
              deviceLabel: String(d.deviceLabel || 'Thiết bị khác'),
              loginAt: String(d.loginAt || ''),
              lastSeenAt: Number(d.lastSeenAt) || Date.now()
            }
          };
        }

        // Nếu phiên của thiết bị này MỚI HƠN hoặc BẰNG phiên trên Cloud (vd thiết bị cũ chưa kịp dọn hoặc độ trễ mạng):
        // Phiên mới của thiết bị này là hợp lệ! Ghi nhận phiên mới lên Cloud và bảo toàn phiên!
        await this.syncActiveSessionToCloudIfConnected(mySession);
        return { handled: true, valid: true };
      }

      if (d.deviceId && d.deviceId !== mySession.deviceId && remoteIssued > myIssued) {
        return { handled: true, valid: false, reason: 'replaced' };
      }

      // Chỉ cập nhật đám mây nếu đúng là phiên của cùng thiết bị này hoặc đám mây chưa có thiết bị nào
      await this.syncActiveSessionToCloudIfConnected(mySession);
      return { handled: true, valid: true };
    } catch {
      return { handled: false, valid: true };
    }
  },

  async requestLogoutOtherDeviceWithCloud(
    username: string,
    password: string,
    deviceLabel: string
  ): Promise<{ handled: boolean; success: boolean; message: string }> {
    try {
      const fbUser = auth.currentUser;
      if (!fbUser || !fbUser.emailVerified) {
        return { handled: false, success: false, message: '' };
      }

      const tokenOk = await ensureValidFirebaseAuthToken(fbUser);
      if (!tokenOk) return { handled: false, success: false, message: '' };

      const ok = await ensureWorkspaceReady(fbUser);
      if (!ok) return { handled: false, success: false, message: '' };

      const wsRef = doc(db, 'workspaces', WORKSPACE_ID);
      const wsSnap = await safeGetDoc(wsRef, `workspaces/${WORKSPACE_ID}`);
      if (wsSnap.exists()) {
        const wsManifest = wsSnap.data() as WorkspaceManifestDoc;
        cachedWsManifest = { data: wsManifest, atMs: Date.now() };
        const loginFlags = computeLoginMetaPullFlags({
          remoteMetaDigest: wsManifest.metaDigest,
          accountChunkCount: wsManifest.accountChunkCount,
          tombstoneChunkCount: wsManifest.tombstoneChunkCount,
          localUsers: StorageService.getUsers(),
          localTombstones: StorageService.getTombstones(),
          isAdmin: isCloudAdmin(fbUser)
        });
        if (loginFlags.pullUsers || loginFlags.pullTombstones) {
          await pullMetaFromCloud(wsManifest, fbUser, {
            pullUsers: loginFlags.pullUsers,
            pullWarehouses: false,
            pullTombstones: loginFlags.pullTombstones,
            pullOsd: false
          });
        }
      }

      const matched = findMatchingUser(StorageService.getUsers(), username);
      if (!matched) {
        return {
          handled: true,
          success: false,
          message: `Tài khoản "${username}" không tồn tại trong hệ thống.`
        };
      }
      if (!isPasswordMatch(matched.password, password)) {
        return {
          handled: true,
          success: false,
          message: 'Mật khẩu xác thực không chính xác.'
        };
      }

      const userKey = canonicalUserSessionKey(matched);
      const sessionDocId = makeSafeDocId('sess', userKey);
      const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
      const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);
      const prevSnap = await safeGetDoc(sessRef, sessPath);
      const prev = prevSnap.exists() ? prevSnap.data() : null;
      if (prev?.sessionToken) {
        rememberRevokedCloudToken(String(prev.sessionToken));
      }
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const revokeMark = Math.max(
        nowMs,
        Number(matched.sessionRevokedAt) || 0,
        Number(prev?.issuedAtMs) || 0,
        Number(prev?.revokedBeforeMs) || 0
      );

      await writeSingleProtectedDoc(
        sessRef,
        sessPath,
        {
          workspaceId: WORKSPACE_ID,
          sessionDocId,
          userKey: cleanStr(userKey, 160, 'user')
        },
        {
          userId: cleanStr(matched.id, 160, 'user-0'),
          username: cleanStr(matched.username, 160, 'user'),
          sessionToken: '',
          issuedAtMs: revokeMark,
          deviceId: '',
          deviceLabel: '',
          loginAt: '',
          lastSeenAt: 0,
          revokedBeforeMs: revokeMark,
          forceLogoutDeviceLabel: cleanStr(deviceLabel, 200, 'Thiết bị khác'),
          forceLogoutAt: nowIso
        }
      );

      StorageService.updateUser(matched.id, { sessionRevokedAt: revokeMark });
      void this.reconcileWithCloud();

      return {
        handled: true,
        success: true,
        message: 'Đã gửi yêu cầu đăng xuất trên thiết bị kia qua Đám mây thành công! Bạn có thể đăng nhập ngay.'
      };
    } catch (err) {
      console.warn('Cloud remote logout fallback to server:', err);
      return { handled: false, success: false, message: '' };
    }
  },

  async forceLogoutOthersKeepCurrentWithCloud(
    current: { user: User; session: ActiveUserSession }
  ): Promise<{ handled: boolean; success: boolean; session?: ActiveUserSession; message: string }> {
    try {
      const fbUser = auth.currentUser;
      if (!fbUser || !fbUser.emailVerified) {
        return { handled: false, success: false, message: '' };
      }

      const tokenOk = await ensureValidFirebaseAuthToken(fbUser);
      if (!tokenOk) return { handled: false, success: false, message: '' };

      const ok = await ensureWorkspaceReady(fbUser);
      if (!ok) return { handled: false, success: false, message: '' };

      const userKey =
        canonicalUserSessionKey(current.user) || canonicalUserSessionKey(current.session.userKey);
      const sessionDocId = makeSafeDocId('sess', userKey);
      const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
      const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);
      const prevSnap = await safeGetDoc(sessRef, sessPath);
      const prev = prevSnap.exists() ? prevSnap.data() : null;
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      const revokeMark = Math.max(
        nowMs,
        Number(current.session.issuedAtMs) || 0,
        Number(prev?.issuedAtMs) || 0,
        Number(prev?.revokedBeforeMs) || 0
      );
      const nextIssued = revokeMark + 1;
      const nextToken = `cloud.${nextIssued}.${Math.random().toString(36).slice(2, 12)}`;
      rememberRevokedCloudToken(current.session.sessionToken);

      const refreshedSession: ActiveUserSession = {
        ...current.session,
        sessionToken: nextToken,
        issuedAtMs: nextIssued,
        lastSeenAt: nowMs
      };

      await writeSingleProtectedDoc(
        sessRef,
        sessPath,
        {
          workspaceId: WORKSPACE_ID,
          sessionDocId,
          userKey: cleanStr(userKey, 160, 'user')
        },
        {
          userId: cleanStr(current.user.id, 160, 'user-0'),
          username: cleanStr(current.user.username, 160, 'user'),
          sessionToken: nextToken,
          issuedAtMs: nextIssued,
          deviceId: cleanStr(current.session.deviceId, 160, ''),
          deviceLabel: cleanStr(current.session.deviceLabel, 200, 'Thiết bị Web'),
          loginAt: cleanStr(current.session.loginAt, 64, nowIso),
          lastSeenAt: nowMs,
          revokedBeforeMs: revokeMark,
          forceLogoutDeviceLabel: cleanStr(current.session.deviceLabel, 200, 'Thiết bị hiện tại'),
          forceLogoutAt: nowIso
        }
      );

      StorageService.updateUser(current.user.id, { sessionRevokedAt: revokeMark });
      void this.reconcileWithCloud();

      return {
        handled: true,
        success: true,
        session: refreshedSession,
        message: 'Đã đăng xuất mọi phiên trên thiết bị khác qua Đám mây thành công!'
      };
    } catch (err) {
      console.warn('Cloud force-logout-keep-current fallback to server:', err);
      return { handled: false, success: false, message: '' };
    }
  },

  async logoutFromCloud(mySession: ActiveUserSession): Promise<void> {
    rememberRevokedCloudToken(mySession.sessionToken);
    this.watchActiveSession(null);
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) return;

    try {
      const userKey = canonicalUserSessionKey(mySession.userKey || mySession.username);
      const sessionDocId = makeSafeDocId('sess', userKey);
      const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
      const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);
      const snap = await safeGetDoc(sessRef, sessPath);
      if (!snap.exists()) return;
      const d = snap.data();
      // Chỉ giải phóng khóa nếu đúng mã phiên của thiết bị này đang giữ khóa (không bao giờ xóa nhầm phiên mới vừa đăng nhập lại)
      if (String(d.sessionToken || '') !== mySession.sessionToken) return;

      await writeSingleProtectedDoc(
        sessRef,
        sessPath,
        {
          workspaceId: WORKSPACE_ID,
          sessionDocId,
          userKey: cleanStr(userKey, 160, 'user')
        },
        {
          userId: cleanStr(d.userId || mySession.userId, 160, 'user-0'),
          username: cleanStr(d.username || mySession.username, 160, 'user'),
          sessionToken: '',
          issuedAtMs: cleanNum(d.issuedAtMs, 0),
          deviceId: '',
          deviceLabel: '',
          loginAt: '',
          lastSeenAt: 0,
          revokedBeforeMs: cleanNum(d.revokedBeforeMs, 0),
          forceLogoutDeviceLabel: cleanStr(d.forceLogoutDeviceLabel, 200, ''),
          forceLogoutAt: cleanStr(d.forceLogoutAt, 64, '')
        }
      );
    } catch {
      // ignore network error during logout
    }
  },

  async pushOsdRealtimeToCloud(): Promise<boolean> {
    if (cloudConnectionPaused || isFirestoreCircuitOpen() || interactiveAuthInFlight) return false;
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) return false;
    const ok = await ensureWorkspaceReady(fbUser);
    if (!ok) return false;

    const osdList = StorageService.getOsdReceipts();
    const tombstones = StorageService.getTombstones();
    const currentOsdDigest = computeOsdOnlyDigest(osdList, tombstones);

    // Chỉ đẩy lên Cloud Firestore khi thực sự có sự thay đổi dữ liệu OSD
    if (!cloudOsdDirty && lastSyncedOsdDigest && currentOsdDigest === lastSyncedOsdDigest) {
      return true;
    }

    if (isPushingOsd) {
      pendingOsdPush = true;
      return true;
    }

    isPushingOsd = true;
    try {
      hydrateRamStateFromCheckpoint(fbUser.uid);

      const wsPath = `workspaces/${WORKSPACE_ID}`;
      const wsRef = doc(db, 'workspaces', WORKSPACE_ID);
      let wsData: WorkspaceManifestDoc | null = null;
      if (workspaceUnsub && cachedWsManifest && Date.now() - cachedWsManifest.atMs < 30_000) {
        wsData = cachedWsManifest.data;
      } else {
        const wsSnap = await safeGetDoc(wsRef, wsPath);
        if (wsSnap.exists()) {
          wsData = wsSnap.data() as WorkspaceManifestDoc;
          cachedWsManifest = { data: wsData, atMs: Date.now() };
        }
      }

      const pushed = await pushOsdOnlyChunksToCloud(wsData);

      if (wsData) {
        try {
          const committed = await commitManifestWithTransaction({
            fbUser,
            expectedBaseline: {
              serverRevision: Number(wsData.serverRevision) || 0,
              metaDigest: String(wsData.metaDigest || 'v2:0.0.0|0.0.0|0.0.0|0.0.0|0.0.0|0.0.0'),
              materialsDigest: String(wsData.materialsDigest || '0:0:0:0')
            },
            localUpdate: {
              touched: {
                osd: true,
                tombstones: pushed.tombstonesPushed
              },
              metaDigest: pushed.metaDigest,
              tombstoneChunkCount: pushed.tombstoneChunkCount,
              bumpMetaRevision: pushed.tombstonesPushed
            }
          });
          clearSyncedOutboxDomains({ osd: true, tombstones: pushed.tombstonesPushed });
          const prevCp = readCloudSyncCheckpoint(fbUser.uid);
          if (prevCp) {
            writeCloudSyncCheckpoint({
              ...prevCp,
              serverRevision: committed.serverRevision,
              metaRevision: committed.metaRevision,
              metaDigest: committed.metaDigest,
              osdDigest: currentOsdDigest,
              chunkDigests: { ...ramChunkDigests }
            });
          }
        } catch (err) {
          if (err instanceof ManifestConflictError) {
            return await this.reconcileWithCloud();
          }
          throw err;
        }
      } else {
        clearSyncedOutboxDomains({ osd: true });
      }
      persistKnownExistingPaths(fbUser.uid);

      emitCloudState({
        status: 'connected',
        lastSyncedAt: Date.now(),
        errorMessage: null
      });

      return true;
    } catch (err) {
      console.warn('pushOsdRealtimeToCloud failed:', err);
      return false;
    } finally {
      isPushingOsd = false;
      if (pendingOsdPush) {
        pendingOsdPush = false;
        void this.pushOsdRealtimeToCloud();
      }
    }
  },

  getOsdPdfAttachment(osdId: string): Promise<string | null> {
    return getOsdPdfAttachment(osdId);
  },

  pushSingleOsdAttachment(osdId: string, pdf: OsdPdfAttachment): Promise<void> {
    return pushSingleOsdAttachment(osdId, pdf);
  },

  async forcePushUsersOnlyToCloud(): Promise<{
    success: boolean;
    message: string;
    count?: number;
  }> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {
        success: false,
        message: 'Thiết bị đang ngoại tuyến. Dữ liệu tài khoản đã lưu an toàn tại máy.'
      };
    }

    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) {
      return {
        success: false,
        message:
          'Chưa kết nối tài khoản Google Cloud. Vui lòng bấm "Đồng Bộ Cloud" trên thanh tiêu đề để đăng nhập Google trước.'
      };
    }

    try {
      const ready = await ensureWorkspaceReady(fbUser);
      if (!ready) {
        return {
          success: false,
          message: 'Không thể kết nối không gian làm việc Cloud Firestore.'
        };
      }
      hydrateRamStateFromCheckpoint(fbUser.uid);

      const wsPath = `workspaces/${WORKSPACE_ID}`;
      const wsRef = doc(db, 'workspaces', WORKSPACE_ID);
      const wsSnap = await safeGetDoc(wsRef, wsPath);
      if (!wsSnap.exists()) {
        return { success: false, message: 'Workspace không tồn tại trên Cloud.' };
      }
      const wsData = wsSnap.data() as WorkspaceManifestDoc;
      const pushWhsToo = cloudMetaWarehousesDirty;

      // Chỉ đẩy phần Accounts + Tombstones (+ Warehouses nếu có sửa kho cùng lúc)
      const pushedMeta = await pushMetaToCloud(fbUser, {
        pushUsers: true,
        pushWarehouses: pushWhsToo,
        pushTombstones: true,
        pushOsd: false,
        existingAccountChunkCount: Number(wsData.accountChunkCount) || 0,
        existingWarehouseChunkCount: Number(wsData.warehouseChunkCount) || 0,
        existingTombstoneChunkCount: Number(wsData.tombstoneChunkCount) || 0
      });

      const remoteV2 = parseMetaDigestV2(wsData.metaDigest);
      const users = StorageService.getUsers();
      const whs = StorageService.getWarehouses();
      const tombs = StorageService.getTombstones();
      const preservedMetaDigest = remoteV2
        ? encodeMetaDigestV2({
            u: computeUsersDomainDigest(users),
            w: pushWhsToo ? computeWarehousesDomainDigest(whs) : remoteV2.w,
            t: computeTombstonesDomainDigest(tombs),
            o: remoteV2.o,
            in: remoteV2.in,
            out: remoteV2.out
          })
        : pushedMeta.metaDigest;

      let committed: WorkspaceManifestDoc;
      try {
        committed = await commitManifestWithTransaction({
          fbUser,
          expectedBaseline: {
            serverRevision: Number(wsData.serverRevision) || 0,
            metaDigest: String(wsData.metaDigest || 'v2:0.0.0|0.0.0|0.0.0|0.0.0|0.0.0|0.0.0'),
            materialsDigest: String(wsData.materialsDigest || '0:0:0:0')
          },
          localUpdate: {
            touched: {
              users: true,
              tombstones: true,
              warehouses: pushWhsToo
            },
            metaDigest: cleanStr(preservedMetaDigest, 128, 'v2:0.0.0|0.0.0|0.0.0|0.0.0|0.0.0|0.0.0'),
            accountChunkCount: pushedMeta.accountChunkCount,
            warehouseChunkCount: pushedMeta.warehouseChunkCount,
            tombstoneChunkCount: pushedMeta.tombstoneChunkCount,
            bumpMetaRevision: true
          }
        });
      } catch (txErr) {
        if (txErr instanceof ManifestConflictError) {
          const rec = await this.reconcileWithCloudDetailed({ forceManifestRefresh: true });
          if (rec.ok) {
            const mergedUsers = StorageService.getUsers();
            return {
              success: true,
              count: mergedUsers.length,
              message: `Đã gộp thay đổi đồng thời và đồng bộ ${mergedUsers.length} tài khoản người dùng lên Cloud Firestore thành công!`
            };
          }
          return {
            success: false,
            message: rec.errorMessage || 'Dữ liệu tài khoản vừa thay đổi đồng thời, vui lòng thử lại.'
          };
        }
        throw txErr;
      }

      clearSyncedOutboxDomains({
        users: true,
        tombstones: true,
        warehouses: pushWhsToo
      });

      const prevCp = readCloudSyncCheckpoint(fbUser.uid);
      if (prevCp) {
        writeCloudSyncCheckpoint({
          ...prevCp,
          serverRevision: committed.serverRevision,
          metaRevision: committed.metaRevision,
          metaDigest: committed.metaDigest,
          chunkDigests: { ...ramChunkDigests }
        });
      }
      persistKnownExistingPaths(fbUser.uid);

      emitCloudState({
        status: 'connected',
        lastSyncedAt: Date.now(),
        errorMessage: null
      });

      return {
        success: true,
        count: users.length,
        message: `Đã đồng bộ ${users.length} tài khoản người dùng lên Cloud Firestore thành công!`
      };
    } catch (err: any) {
      console.error('forcePushUsersOnlyToCloud error:', err);
      if (isQuotaExceededError(err) || isFirestoreQuotaExhausted()) {
        const msg = notifyFirestoreQuotaExceeded(300_000, err);
        return { success: false, message: msg };
      }
      return {
        success: false,
        message: `Lỗi đồng bộ tài khoản lên Cloud: ${err?.message || String(err)}`
      };
    }
  },

  async forcePushAllLocalDataToCloud(): Promise<{
    success: boolean;
    message: string;
    stats?: {
      users: number;
      warehouses: number;
      materials: number;
      inbound: number;
      outbound: number;
      osd: number;
    };
  }> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {
        success: false,
        message: 'Thiết bị đang ngoại tuyến. Vui lòng kết nối Internet để đồng bộ lên Cloud.'
      };
    }

    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) {
      return {
        success: false,
        message:
          'Chưa kết nối tài khoản Google Cloud. Vui lòng bấm "Đồng Bộ Cloud" trên thanh tiêu đề để đăng nhập Google trước.'
      };
    }

    cloudTransferTracker.begin();
    try {
      this.resetCircuitForManualRetry();
      emitCloudState({ status: 'connecting', quotaExceeded: false, errorMessage: null });
      const ready = await ensureWorkspaceReady(fbUser);
      if (!ready) {
        emitCloudState({ status: 'error', errorMessage: 'Không thể kết nối Workspace trên Cloud.' });
        return {
          success: false,
          message: 'Không thể kết nối không gian làm việc Cloud Firestore.'
        };
      }

      const wsPath = `workspaces/${WORKSPACE_ID}`;
      const wsRef = doc(db, 'workspaces', WORKSPACE_ID);
      const wsSnap = await safeGetDoc(wsRef, wsPath);
      if (!wsSnap.exists()) {
        return { success: false, message: 'Workspace không tồn tại trên Cloud.' };
      }
      const wsData = wsSnap.data() as WorkspaceManifestDoc;

      ramChunkDigests = {};
      ramChunkDigestsUid = fbUser.uid;

      // 1. Push Meta (Users + Warehouses + OSD + Tombstones)
      const pushedMeta = await pushMetaToCloud(fbUser, {
        pushUsers: true,
        pushWarehouses: true,
        pushTombstones: true,
        pushOsd: true,
        forceAll: true
      });

      // 2. Push Materials
      const pushedMats = await pushMaterialsToCloud(0, true);

      // 3. Push Inbound Receipts (Bulk Siêu Tốc)
      const localInbounds = StorageService.getInboundReceipts();
      const inMap = new Map<string, CloudReceiptIndexEntry>();
      const updatedInEntries = await pushBulkInboundsToCloud(localInbounds);
      for (let j = 0; j < localInbounds.length; j++) {
        inMap.set(normKey(localInbounds[j].receiptCode || localInbounds[j].id), updatedInEntries[j]);
      }
      const inIdxRes = await writeReceiptIndexChunks('inbound', inMap, new Map(), 0, true);
      const nextInboundIndexChunkCount = inIdxRes.chunkCount;

      // 4. Push Outbound Receipts (Bulk Siêu Tốc)
      const localOutbounds = StorageService.getOutboundReceipts();
      const outMap = new Map<string, CloudReceiptIndexEntry>();
      const updatedOutEntries = await pushBulkOutboundsToCloud(localOutbounds);
      for (let j = 0; j < localOutbounds.length; j++) {
        outMap.set(normKey(localOutbounds[j].issueCode || localOutbounds[j].id), updatedOutEntries[j]);
      }
      const outIdxRes = await writeReceiptIndexChunks('outbound', outMap, new Map(), 0, true);
      const nextOutboundIndexChunkCount = outIdxRes.chunkCount;

      const finalUsers = StorageService.getUsers();
      const finalWhs = StorageService.getWarehouses();
      const finalTombs = StorageService.getTombstones();
      const finalOsd = StorageService.getOsdReceipts();
      const finalMats = StorageService.getMaterials();
      const fullMetaDigest = cleanStr(
        computeCloudSharedMetaDigest(
          finalUsers,
          finalWhs,
          finalTombs,
          finalOsd,
          localInbounds,
          localOutbounds
        ),
        128,
        'v2:0.0.0|0.0.0|0.0.0|0.0.0|0.0.0|0.0.0'
      );
      const finalInDigest = computeInboundDomainDigest(localInbounds);
      const finalOutDigest = computeOutboundDomainDigest(localOutbounds);

      cloudInboundIndexCache = {
        uid: fbUser.uid,
        domainDigest: finalInDigest,
        chunkCount: nextInboundIndexChunkCount,
        entries: new Map(inMap),
        chunkIndexByCode: new Map(inIdxRes.nextChunkIndexByCode)
      };
      cloudOutboundIndexCache = {
        uid: fbUser.uid,
        domainDigest: finalOutDigest,
        chunkCount: nextOutboundIndexChunkCount,
        entries: new Map(outMap),
        chunkIndexByCode: new Map(outIdxRes.nextChunkIndexByCode)
      };

      // 5. Update WorkspaceManifest atomically via Firestore Transaction
      const committed = await commitManifestWithTransaction({
        fbUser,
        expectedBaseline: {
          serverRevision: Number(wsData.serverRevision) || 0,
          metaDigest: String(wsData.metaDigest || 'v2:0.0.0|0.0.0|0.0.0|0.0.0|0.0.0|0.0.0'),
          materialsDigest: String(wsData.materialsDigest || '0:0:0:0')
        },
        localUpdate: {
          touched: {
            users: true,
            warehouses: true,
            tombstones: true,
            osd: true,
            inbound: true,
            outbound: true,
            materials: true
          },
          metaDigest: fullMetaDigest || pushedMeta.metaDigest,
          accountChunkCount: pushedMeta.accountChunkCount,
          warehouseChunkCount: pushedMeta.warehouseChunkCount,
          tombstoneChunkCount: pushedMeta.tombstoneChunkCount,
          inboundIndexChunkCount: nextInboundIndexChunkCount,
          outboundIndexChunkCount: nextOutboundIndexChunkCount,
          materialsCount: pushedMats.materialsCount,
          materialsChunkCount: pushedMats.materialsChunkCount,
          materialsDigest: pushedMats.materialsDigest,
          bumpMetaRevision: true
        },
        allowForceOverwrite: true
      });

      clearSyncedOutboxDomains({
        users: true,
        warehouses: true,
        tombstones: true,
        osd: true,
        materials: true,
        inbound: true,
        outbound: true
      });

      lastSyncedOsdDigest = computeOsdOnlyDigest(finalOsd, finalTombs);
      writeCloudSyncCheckpoint({
        uid: fbUser.uid,
        serverRevision: committed.serverRevision,
        metaRevision: committed.metaRevision,
        metaDigest: committed.metaDigest,
        materialsDigest: committed.materialsDigest,
        inboundDigest: finalInDigest,
        outboundDigest: finalOutDigest,
        osdDigest: lastSyncedOsdDigest,
        inboundCount: localInbounds.length,
        outboundCount: localOutbounds.length,
        materialsCount: finalMats.length,
        inboundTombCount: Object.keys(finalTombs.inbound || {}).length,
        outboundTombCount: Object.keys(finalTombs.outbound || {}).length,
        chunkDigests: { ...ramChunkDigests }
      });
      persistKnownExistingPaths(fbUser.uid);

      await StorageService.flush();
      emitCloudState({
        status: 'connected',
        lastSyncedAt: Date.now(),
        errorMessage: null
      });

      return {
        success: true,
        message: `Đã đồng bộ toàn bộ dữ liệu cục bộ lên Cloud Firestore thành công! (${finalUsers.length} tài khoản, ${finalWhs.length} kho, ${pushedMats.materialsCount} vật tư, ${localInbounds.length} phiếu nhập, ${localOutbounds.length} phiếu xuất, ${finalOsd.length} phiếu OSD)`,
        stats: {
          users: finalUsers.length,
          warehouses: finalWhs.length,
          materials: pushedMats.materialsCount,
          inbound: localInbounds.length,
          outbound: localOutbounds.length,
          osd: finalOsd.length
        }
      };
    } catch (err: any) {
      console.error('forcePushAllLocalDataToCloud error:', err);
      if (isQuotaExceededError(err) || isFirestoreQuotaExhausted()) {
        const msg = notifyFirestoreQuotaExceeded(300_000, err);
        return {
          success: false,
          message: msg
        };
      }
      emitCloudState({
        status: 'error',
        quotaExceeded: false,
        errorMessage: err?.message || 'Lỗi khi đồng bộ lên Cloud Firestore'
      });
      return {
        success: false,
        message: `Đồng bộ lên Cloud Firestore thất bại: ${err?.message || String(err)}`
      };
    } finally {
      cloudTransferTracker.end();
    }
  }
};
