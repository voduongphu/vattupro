import type {
  User,
  Warehouse,
  InboundReceipt,
  OutboundReceipt,
  OsdReceipt,
  TombstoneMap
} from '../types/inventory.ts';
import {
  normKey,
  normUserKey,
  computeEmailAuthDigest,
  computeInboundReceiptDigest,
  computeOutboundReceiptDigest,
  computeOsdDigest,
  normalizeAllowedWarehouseIds
} from './additiveMerge.ts';

function fnvPair(str: string): [number, number] {
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

function compactHashPair(sum1: number, sum2: number, xor1: number, count: number): string {
  const combined = ((sum1 ^ xor1) >>> 0).toString(36);
  return `${count}.${sum2.toString(36)}.${combined}`;
}

export function computeUsersDomainDigest(users: User[]): string {
  let sum1 = 0;
  let sum2 = 0;
  let xor1 = 0;
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    const emDigest = u.emailDigest || computeEmailAuthDigest(u.email) || '';
    const allowedWhStr =
      u.allowedWarehouseIds !== undefined
        ? [...normalizeAllowedWarehouseIds(u.allowedWarehouseIds)].sort().join(',')
        : '';
    const [h1, h2] = fnvPair(
      `CU|${normUserKey(u.username)}|${u.id}|${u.fullName}|${u.role}|${u.password || ''}|${emDigest}|${u.isActive ? 1 : 0}|${u.department || ''}|${allowedWhStr}|${Number(u.updatedAt) || 0}|${Number(u.sessionRevokedAt) || 0}`
    );
    sum1 = (sum1 + h1) >>> 0;
    sum2 = (sum2 + h2) >>> 0;
    xor1 = (xor1 ^ h1) >>> 0;
  }
  return compactHashPair(sum1, sum2, xor1, users.length);
}

export function computeWarehousesDomainDigest(warehouses: Warehouse[]): string {
  let sum1 = 0;
  let sum2 = 0;
  let xor1 = 0;
  for (let i = 0; i < warehouses.length; i++) {
    const w = warehouses[i];
    const [h1, h2] = fnvPair(
      `CW|${normKey(w.code)}|${w.shortCode || ''}|${w.id}|${w.name}|${w.location || ''}|${w.type}|${w.capacityAreaM2 || 0}|${w.capacityTons || 0}|${w.keeperName || ''}|${w.status}|${w.notes || ''}|${Number(w.updatedAt) || 0}`
    );
    sum1 = (sum1 + h1) >>> 0;
    sum2 = (sum2 + h2) >>> 0;
    xor1 = (xor1 ^ h2) >>> 0;
  }
  return compactHashPair(sum1, sum2, xor1, warehouses.length);
}

export function computeTombstonesDomainDigest(tombstones: TombstoneMap): string {
  let sum1 = 0;
  let sum2 = 0;
  let xor1 = 0;
  let tombCount = 0;
  const buckets: Array<keyof TombstoneMap> = [
    'inbound',
    'outbound',
    'materials',
    'warehouses',
    'users',
    'osd'
  ];
  for (let b = 0; b < buckets.length; b++) {
    const bucketName = buckets[b];
    const map = tombstones[bucketName] || {};
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const ts = Number(map[k]) || 0;
      if (ts <= 0) continue;
      tombCount++;
      const [h1, h2] = fnvPair(`CT|${bucketName}|${k}|${ts}`);
      sum1 = (sum1 + h1) >>> 0;
      sum2 = (sum2 + h2) >>> 0;
      xor1 = (xor1 ^ (h1 ^ h2)) >>> 0;
    }
  }
  return compactHashPair(sum1, sum2, xor1, tombCount);
}

export function computeOsdDomainDigest(osdList: OsdReceipt[]): string {
  const base = computeOsdDigest(osdList);
  const [h1, h2] = fnvPair(`OSD|${base}`);
  return `${osdList.length}.${h1.toString(36)}.${h2.toString(36)}`;
}

export function computeInboundDomainDigest(list: InboundReceipt[]): string {
  let sum1 = 0;
  let sum2 = 0;
  let xor1 = 0;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const d = computeInboundReceiptDigest(r);
    const [h1, h2] = fnvPair(`IN|${normKey(r.receiptCode || r.id)}|${d}`);
    sum1 = (sum1 + h1) >>> 0;
    sum2 = (sum2 + h2) >>> 0;
    xor1 = (xor1 ^ h1) >>> 0;
  }
  return compactHashPair(sum1, sum2, xor1, list.length);
}

export function computeOutboundDomainDigest(list: OutboundReceipt[]): string {
  let sum1 = 0;
  let sum2 = 0;
  let xor1 = 0;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const d = computeOutboundReceiptDigest(r);
    const [h1, h2] = fnvPair(`OUT|${normKey(r.issueCode || r.id)}|${d}`);
    sum1 = (sum1 + h1) >>> 0;
    sum2 = (sum2 + h2) >>> 0;
    xor1 = (xor1 ^ h2) >>> 0;
  }
  return compactHashPair(sum1, sum2, xor1, list.length);
}

export interface DomainDigestParts {
  u: string;
  w: string;
  t: string;
  o: string;
  in: string;
  out: string;
}

export function encodeMetaDigestV2(parts: DomainDigestParts): string {
  const raw = `v2:${parts.u}|${parts.w}|${parts.t}|${parts.o}|${parts.in}|${parts.out}`;
  return raw.length <= 128 ? raw : raw.slice(0, 128);
}

export function parseMetaDigestV2(digest?: string | null): DomainDigestParts | null {
  if (!digest || typeof digest !== 'string' || !digest.startsWith('v2:')) {
    return null;
  }
  const body = digest.slice(3);
  const segs = body.split('|');
  if (segs.length !== 6) return null;
  if (segs.some((s) => !s)) return null;
  return {
    u: segs[0],
    w: segs[1],
    t: segs[2],
    o: segs[3],
    in: segs[4],
    out: segs[5]
  };
}

export function extractCountFromDigestPart(part?: string | null): number {
  if (!part) return 0;
  const dotIdx = part.indexOf('.');
  if (dotIdx <= 0) return 0;
  const n = Number(part.slice(0, dotIdx));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function stableStringifyValue(val: unknown): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'string') return JSON.stringify(val);
  if (Array.isArray(val)) {
    return `[${val.map((item) => stableStringifyValue(item)).join(',')}]`;
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringifyValue(obj[k])}`).join(',')}}`;
  }
  return String(val);
}

export function computeItemsChunkDigest(items: unknown[]): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < items.length; i++) {
    const s = `${i}:${stableStringifyValue(items[i])}|`;
    for (let j = 0; j < s.length; j++) {
      const c = s.charCodeAt(j);
      h1 ^= c;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= c + ((j & 0xff) << 8);
      h2 = Math.imul(h2, 0x85ebca6b);
    }
  }
  return `${items.length}.${(h1 >>> 0).toString(36)}.${(h2 >>> 0).toString(36)}`;
}

export function computeRecordDigest(record: Record<string, unknown>): string {
  const [h1, h2] = fnvPair(stableStringifyValue(record));
  return `${h1.toString(36)}.${h2.toString(36)}`;
}

export interface StableChunkResult<T> {
  chunks: T[][];
  nextChunkIndexByCode: Map<string, number>;
  chunkDigests: string[];
}

export function buildStableReceiptIndexChunks<
  T extends { code: string; appUpdatedAt: number }
>(
  entriesMap: Map<string, T>,
  prevChunkIndexByCode: Map<string, number>,
  chunkSize = 200
): StableChunkResult<T> {
  if (entriesMap.size === 0) {
    return {
      chunks: [],
      nextChunkIndexByCode: new Map<string, number>(),
      chunkDigests: []
    };
  }

  // Giữ nguyên các phiếu vào đúng chunk cũ nếu đã biết vị trí để tránh dịch chuyển hàng loạt chunk
  const buckets = new Map<number, T[]>();
  const newEntries: T[] = [];

  for (const [rawCode, entry] of entriesMap.entries()) {
    const code = normKey(entry.code || rawCode);
    const prevIdx = prevChunkIndexByCode.get(code);
    if (prevIdx !== undefined && prevIdx >= 0) {
      let arr = buckets.get(prevIdx);
      if (!arr) {
        arr = [];
        buckets.set(prevIdx, arr);
      }
      arr.push(entry);
    } else {
      newEntries.push(entry);
    }
  }

  const orderedBucketIndices = Array.from(buckets.keys()).sort((a, b) => a - b);
  const chunks: T[][] = [];
  const overflow: T[] = [];

  for (const idx of orderedBucketIndices) {
    const bucketItems = buckets.get(idx) || [];
    if (bucketItems.length === 0) continue;
    bucketItems.sort((a, b) => normKey(a.code).localeCompare(normKey(b.code)));
    for (let start = 0; start < bucketItems.length; start += chunkSize) {
      const slice = bucketItems.slice(start, start + chunkSize);
      if (start === 0) {
        chunks.push(slice);
      } else {
        overflow.push(...slice);
      }
    }
  }

  const pendingToAppend = [...overflow, ...newEntries].sort(
    (a, b) => a.appUpdatedAt - b.appUpdatedAt || normKey(a.code).localeCompare(normKey(b.code))
  );

  for (let i = 0; i < pendingToAppend.length; i++) {
    const item = pendingToAppend[i];
    const lastChunk = chunks.length > 0 ? chunks[chunks.length - 1] : null;
    if (lastChunk && lastChunk.length < chunkSize) {
      lastChunk.push(item);
    } else {
      chunks.push([item]);
    }
  }

  const nextChunkIndexByCode = new Map<string, number>();
  const chunkDigests: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const ch = chunks[i];
    for (let j = 0; j < ch.length; j++) {
      nextChunkIndexByCode.set(normKey(ch[j].code), i);
    }
    chunkDigests.push(computeItemsChunkDigest(ch));
  }

  return {
    chunks,
    nextChunkIndexByCode,
    chunkDigests
  };
}

export function diffChunkDigests(
  newChunks: unknown[][],
  prevDigests: Record<string, string>,
  keyPrefix: string,
  existingCloudChunkCount: number
): { dirtyIndices: number[]; nextDigests: Record<string, string> } {
  const dirtyIndices: number[] = [];
  const nextDigests: Record<string, string> = {};

  for (let i = 0; i < newChunks.length; i++) {
    const d = computeItemsChunkDigest(newChunks[i]);
    const k = `${keyPrefix}${i}`;
    nextDigests[k] = d;
    const existsOnCloud = i < existingCloudChunkCount;
    if (!existsOnCloud || prevDigests[k] !== d) {
      dirtyIndices.push(i);
    }
  }

  return { dirtyIndices, nextDigests };
}

export interface DomainSyncPlanInput {
  remoteMetaDigest?: string | null;
  remoteMaterialsDigest?: string | null;
  remoteCounts: {
    accountChunkCount: number;
    warehouseChunkCount: number;
    tombstoneChunkCount: number;
    inboundIndexChunkCount: number;
    outboundIndexChunkCount: number;
    materialsChunkCount: number;
  };
  localDigests: DomainDigestParts & { materials: string };
  localCounts: {
    users: number;
    warehouses: number;
    inbound: number;
    outbound: number;
    materials: number;
  };
  dirty: {
    users: boolean;
    warehouses: boolean;
    tombstones: boolean;
    osd: boolean;
    inbound: boolean;
    outbound: boolean;
    materials: boolean;
  };
  adminMissingPii: boolean;
  checkpointMatchesServer: boolean;
  lastSyncedOsdDigest?: string;
}

export interface DomainSyncPlan {
  isLegacyRemoteDigest: boolean;
  pullUsers: boolean;
  pullWarehouses: boolean;
  pullTombstones: boolean;
  pullOsd: boolean;
  osdRemoteCount: number;
  pullInbound: boolean;
  pullOutbound: boolean;
  pullMaterials: boolean;
  pushUsers: boolean;
  pushWarehouses: boolean;
  pushTombstones: boolean;
  pushOsd: boolean;
  pushInbound: boolean;
  pushOutbound: boolean;
  pushMaterials: boolean;
  anyWorkNeeded: boolean;
}

export function computeDomainSyncPlan(input: DomainSyncPlanInput): DomainSyncPlan {
  const remoteV2 = parseMetaDigestV2(input.remoteMetaDigest);
  const { remoteCounts, localDigests, localCounts, dirty } = input;

  const missingAccounts =
    remoteCounts.accountChunkCount > 0 &&
    (localCounts.users === 0 ||
      (localCounts.users <= 1 && (!remoteV2 || remoteV2.u !== localDigests.u)));
  const missingWarehouses = remoteCounts.warehouseChunkCount > 0 && localCounts.warehouses === 0;
  const missingInbound = remoteCounts.inboundIndexChunkCount > 0 && localCounts.inbound === 0;
  const missingOutbound = remoteCounts.outboundIndexChunkCount > 0 && localCounts.outbound === 0;
  const missingMaterials = remoteCounts.materialsChunkCount > 0 && localCounts.materials === 0;

  const remoteMatDigest = String(input.remoteMaterialsDigest || '');
  const matMismatch = Boolean(remoteMatDigest) && remoteMatDigest !== localDigests.materials;
  const pullMaterials =
    missingMaterials || (remoteCounts.materialsChunkCount > 0 && matMismatch);
  const pushMaterials = dirty.materials && matMismatch;

  if (!remoteV2) {
    // Fallback an toàn cho workspace manifest đời cũ (sẽ tự động nâng cấp lên v2 khi có ghi mới)
    const serverChanged = !input.checkpointMatchesServer;
    const pullUsers = serverChanged || missingAccounts || input.adminMissingPii;
    const pullWarehouses = serverChanged || missingWarehouses;
    const pullTombstones = serverChanged;
    const pullOsd = serverChanged && localDigests.o !== input.lastSyncedOsdDigest;
    const pullInbound = serverChanged || missingInbound || dirty.inbound;
    const pullOutbound = serverChanged || missingOutbound || dirty.outbound;

    const pushUsers = dirty.users;
    const pushWarehouses = dirty.warehouses;
    const pushTombstones = dirty.tombstones;
    const pushOsd = dirty.osd;
    const pushInbound = dirty.inbound || serverChanged;
    const pushOutbound = dirty.outbound || serverChanged;

    const anyWorkNeeded =
      pullUsers ||
      pullWarehouses ||
      pullTombstones ||
      pullOsd ||
      pullInbound ||
      pullOutbound ||
      pullMaterials ||
      pushUsers ||
      pushWarehouses ||
      pushTombstones ||
      pushOsd ||
      dirty.inbound ||
      dirty.outbound ||
      dirty.materials;

    return {
      isLegacyRemoteDigest: true,
      pullUsers,
      pullWarehouses,
      pullTombstones,
      pullOsd,
      osdRemoteCount: 0,
      pullInbound,
      pullOutbound,
      pullMaterials,
      pushUsers,
      pushWarehouses,
      pushTombstones,
      pushOsd,
      pushInbound,
      pushOutbound,
      pushMaterials,
      anyWorkNeeded
    };
  }

  const usersDiff = remoteV2.u !== localDigests.u;
  const warehousesDiff = remoteV2.w !== localDigests.w;
  const tombstonesDiff = remoteV2.t !== localDigests.t;
  const osdDiff = remoteV2.o !== localDigests.o;
  const inboundDiff = remoteV2.in !== localDigests.in;
  const outboundDiff = remoteV2.out !== localDigests.out;

  const pullUsers = usersDiff || missingAccounts || input.adminMissingPii;
  const pullWarehouses = warehousesDiff || missingWarehouses;
  const pullTombstones = tombstonesDiff;
  const pullOsd = osdDiff;
  const osdRemoteCount = extractCountFromDigestPart(remoteV2.o);
  const pullInbound = inboundDiff || missingInbound;
  const pullOutbound = outboundDiff || missingOutbound;

  const pushUsers = dirty.users && usersDiff;
  const pushWarehouses = dirty.warehouses && warehousesDiff;
  const pushTombstones = dirty.tombstones && tombstonesDiff;
  const pushOsd = dirty.osd && osdDiff;
  const pushInbound = dirty.inbound && inboundDiff;
  const pushOutbound = dirty.outbound && outboundDiff;

  const anyWorkNeeded =
    pullUsers ||
    pullWarehouses ||
    pullTombstones ||
    pullOsd ||
    pullInbound ||
    pullOutbound ||
    pullMaterials ||
    pushUsers ||
    pushWarehouses ||
    pushTombstones ||
    pushOsd ||
    pushInbound ||
    pushOutbound ||
    pushMaterials;

  return {
    isLegacyRemoteDigest: false,
    pullUsers,
    pullWarehouses,
    pullTombstones,
    pullOsd,
    osdRemoteCount,
    pullInbound,
    pullOutbound,
    pullMaterials,
    pushUsers,
    pushWarehouses,
    pushTombstones,
    pushOsd,
    pushInbound,
    pushOutbound,
    pushMaterials,
    anyWorkNeeded
  };
}

export interface CloudPendingOutbox {
  users: boolean;
  warehouses: boolean;
  tombstones: boolean;
  osd: boolean;
  materials: boolean;
  inbound: boolean;
  outbound: boolean;
  userIds: string[];
  warehouseIds: string[];
  materialCodes: string[];
  inboundCodes: string[];
  outboundCodes: string[];
  updatedAtMs: number;
}

const MAX_OUTBOX_KEYS = 2000;

function mergeUniqueStrings(existing: string[], incoming: string[]): string[] {
  if (incoming.length === 0) return existing;
  const set = new Set<string>(existing);
  for (let i = 0; i < incoming.length; i++) {
    const val = String(incoming[i] || '').trim();
    if (val) set.add(val);
  }
  const arr = Array.from(set);
  return arr.length > MAX_OUTBOX_KEYS ? arr.slice(arr.length - MAX_OUTBOX_KEYS) : arr;
}

export function createEmptyPendingOutbox(): CloudPendingOutbox {
  return {
    users: false,
    warehouses: false,
    tombstones: false,
    osd: false,
    materials: false,
    inbound: false,
    outbound: false,
    userIds: [],
    warehouseIds: [],
    materialCodes: [],
    inboundCodes: [],
    outboundCodes: [],
    updatedAtMs: 0
  };
}

export function sanitizePendingOutbox(raw: unknown): CloudPendingOutbox {
  const empty = createEmptyPendingOutbox();
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as Record<string, unknown>;
  const strArr = (val: unknown): string[] =>
    Array.isArray(val)
      ? val
          .map((x) => (typeof x === 'string' ? x.trim() : ''))
          .filter(Boolean)
          .slice(-MAX_OUTBOX_KEYS)
      : [];
  return {
    users: Boolean(obj.users),
    warehouses: Boolean(obj.warehouses),
    tombstones: Boolean(obj.tombstones),
    osd: Boolean(obj.osd),
    materials: Boolean(obj.materials),
    inbound: Boolean(obj.inbound),
    outbound: Boolean(obj.outbound),
    userIds: strArr(obj.userIds),
    warehouseIds: strArr(obj.warehouseIds),
    materialCodes: strArr(obj.materialCodes),
    inboundCodes: strArr(obj.inboundCodes),
    outboundCodes: strArr(obj.outboundCodes),
    updatedAtMs: Number(obj.updatedAtMs) || 0
  };
}

export function mergePendingOutboxMutation(
  prev: CloudPendingOutbox,
  kind: 'meta' | 'materials' | 'inbound' | 'outbound' | 'osd',
  codes?: string[],
  details?: { users?: boolean; warehouses?: boolean; tombstones?: boolean },
  nowMs = Date.now()
): CloudPendingOutbox {
  const next: CloudPendingOutbox = {
    ...prev,
    userIds: [...prev.userIds],
    warehouseIds: [...prev.warehouseIds],
    materialCodes: [...prev.materialCodes],
    inboundCodes: [...prev.inboundCodes],
    outboundCodes: [...prev.outboundCodes],
    updatedAtMs: nowMs
  };
  const cleanCodes = Array.isArray(codes)
    ? codes.map((c) => String(c || '').trim()).filter(Boolean)
    : [];

  if (kind === 'meta') {
    if (!details || (!details.users && !details.warehouses && !details.tombstones)) {
      next.users = true;
      next.warehouses = true;
      next.tombstones = true;
    } else {
      if (details.users) next.users = true;
      if (details.warehouses) next.warehouses = true;
      if (details.tombstones) next.tombstones = true;
    }
    if (details?.users && cleanCodes.length > 0) {
      next.userIds = mergeUniqueStrings(next.userIds, cleanCodes);
    }
    if (details?.warehouses && cleanCodes.length > 0) {
      next.warehouseIds = mergeUniqueStrings(next.warehouseIds, cleanCodes);
    }
  } else if (kind === 'osd') {
    next.osd = true;
    if (details?.tombstones) next.tombstones = true;
  } else if (kind === 'materials') {
    next.materials = true;
    if (cleanCodes.length > 0) {
      next.materialCodes = mergeUniqueStrings(
        next.materialCodes,
        cleanCodes.map((c) => normKey(c)).filter(Boolean)
      );
    }
  } else if (kind === 'inbound') {
    next.inbound = true;
    if (details?.tombstones) next.tombstones = true;
    if (cleanCodes.length > 0) {
      next.inboundCodes = mergeUniqueStrings(
        next.inboundCodes,
        cleanCodes.map((c) => normKey(c)).filter(Boolean)
      );
    }
  } else if (kind === 'outbound') {
    next.outbound = true;
    if (details?.tombstones) next.tombstones = true;
    if (cleanCodes.length > 0) {
      next.outboundCodes = mergeUniqueStrings(
        next.outboundCodes,
        cleanCodes.map((c) => normKey(c)).filter(Boolean)
      );
    }
  }
  return next;
}

export function clearPendingOutboxDomains(
  prev: CloudPendingOutbox,
  cleared: Partial<Record<'users' | 'warehouses' | 'tombstones' | 'osd' | 'materials' | 'inbound' | 'outbound', boolean>>,
  nowMs = Date.now()
): CloudPendingOutbox {
  return {
    users: cleared.users ? false : prev.users,
    warehouses: cleared.warehouses ? false : prev.warehouses,
    tombstones: cleared.tombstones ? false : prev.tombstones,
    osd: cleared.osd ? false : prev.osd,
    materials: cleared.materials ? false : prev.materials,
    inbound: cleared.inbound ? false : prev.inbound,
    outbound: cleared.outbound ? false : prev.outbound,
    userIds: cleared.users ? [] : [...prev.userIds],
    warehouseIds: cleared.warehouses ? [] : [...prev.warehouseIds],
    materialCodes: cleared.materials ? [] : [...prev.materialCodes],
    inboundCodes: cleared.inbound ? [] : [...prev.inboundCodes],
    outboundCodes: cleared.outbound ? [] : [...prev.outboundCodes],
    updatedAtMs: nowMs
  };
}

export function hasAnyPendingOutbox(outbox: CloudPendingOutbox): boolean {
  return Boolean(
    outbox.users ||
      outbox.warehouses ||
      outbox.tombstones ||
      outbox.osd ||
      outbox.materials ||
      outbox.inbound ||
      outbox.outbound
  );
}

export function hasRemoteManifestChanged(params: {
  remoteServerRev: number;
  remoteMetaDigest: string;
  remoteMaterialsDigest: string;
  lastAppliedServerRev: number;
  lastAppliedMetaDigest: string;
  lastAppliedMaterialsDigest: string;
}): boolean {
  if (params.remoteServerRev !== params.lastAppliedServerRev) return true;
  if (
    params.lastAppliedMetaDigest &&
    params.remoteMetaDigest &&
    params.remoteMetaDigest !== params.lastAppliedMetaDigest
  ) {
    return true;
  }
  if (
    params.lastAppliedMaterialsDigest &&
    params.remoteMaterialsDigest &&
    params.remoteMaterialsDigest !== params.lastAppliedMaterialsDigest
  ) {
    return true;
  }
  return false;
}

export function computeLoginMetaPullFlags(params: {
  remoteMetaDigest?: string | null;
  accountChunkCount?: number;
  tombstoneChunkCount?: number;
  localUsers: User[];
  localTombstones: TombstoneMap;
  isAdmin: boolean;
}): { pullUsers: boolean; pullTombstones: boolean } {
  const remoteV2 = parseMetaDigestV2(params.remoteMetaDigest);
  const accCount = Number(params.accountChunkCount) || 0;
  const tombCount = Number(params.tombstoneChunkCount) || 0;
  const missingLocalAccounts = accCount > 0 && params.localUsers.length <= 1;
  const adminMissingPii =
    params.isAdmin && params.localUsers.some((u) => Boolean(u.emailDigest) && !u.email);

  if (!remoteV2) {
    return {
      pullUsers: accCount > 0 || missingLocalAccounts || adminMissingPii,
      pullTombstones: tombCount > 0
    };
  }

  const localU = computeUsersDomainDigest(params.localUsers);
  const localT = computeTombstonesDomainDigest(params.localTombstones);
  const missingLocalUsers =
    accCount > 0 &&
    (params.localUsers.length === 0 || (params.localUsers.length <= 1 && remoteV2.u !== localU));
  return {
    pullUsers: remoteV2.u !== localU || missingLocalUsers || adminMissingPii,
    pullTombstones: remoteV2.t !== localT
  };
}

export interface TouchedManifestDomains {
  users?: boolean;
  warehouses?: boolean;
  tombstones?: boolean;
  osd?: boolean;
  inbound?: boolean;
  outbound?: boolean;
  materials?: boolean;
}

export interface ManifestSnapshotLike {
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

export type ManifestTransactionOutcome =
  | { conflict: true; reason: string }
  | { conflict: false; manifest: ManifestSnapshotLike };

export function resolveManifestTransactionUpdate(params: {
  latestRemote: ManifestSnapshotLike;
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
}): ManifestTransactionOutcome {
  const { latestRemote, expectedBaseline, localUpdate } = params;
  const { touched } = localUpdate;
  const latestRev = Number(latestRemote.serverRevision) || 0;
  const expectedRev = Number(expectedBaseline.serverRevision) || 0;

  const latestV2 = parseMetaDigestV2(latestRemote.metaDigest);
  const expectedV2 = parseMetaDigestV2(expectedBaseline.metaDigest);
  const localV2 = parseMetaDigestV2(localUpdate.metaDigest);

  if (latestRev !== expectedRev) {
    if (!latestV2 || !expectedV2 || !localV2) {
      return { conflict: true, reason: 'legacy_revision_changed' };
    }
    if (touched.users && latestV2.u !== expectedV2.u) {
      return { conflict: true, reason: 'users_changed_remotely' };
    }
    if (touched.warehouses && latestV2.w !== expectedV2.w) {
      return { conflict: true, reason: 'warehouses_changed_remotely' };
    }
    if (touched.tombstones && latestV2.t !== expectedV2.t) {
      return { conflict: true, reason: 'tombstones_changed_remotely' };
    }
    if (touched.osd && latestV2.o !== expectedV2.o) {
      return { conflict: true, reason: 'osd_changed_remotely' };
    }
    if (touched.inbound && latestV2.in !== expectedV2.in) {
      return { conflict: true, reason: 'inbound_changed_remotely' };
    }
    if (touched.outbound && latestV2.out !== expectedV2.out) {
      return { conflict: true, reason: 'outbound_changed_remotely' };
    }
    if (
      touched.materials &&
      String(latestRemote.materialsDigest || '') !== String(expectedBaseline.materialsDigest || '')
    ) {
      return { conflict: true, reason: 'materials_changed_remotely' };
    }
  }

  const mergedMetaDigest =
    latestV2 && localV2
      ? encodeMetaDigestV2({
          u: touched.users ? localV2.u : latestV2.u,
          w: touched.warehouses ? localV2.w : latestV2.w,
          t: touched.tombstones ? localV2.t : latestV2.t,
          o: touched.osd ? localV2.o : latestV2.o,
          in: touched.inbound ? localV2.in : latestV2.in,
          out: touched.outbound ? localV2.out : latestV2.out
        })
      : localUpdate.metaDigest;

  const metaTouched =
    localUpdate.bumpMetaRevision !== undefined
      ? Boolean(localUpdate.bumpMetaRevision)
      : Boolean(touched.users || touched.warehouses || touched.tombstones || touched.osd);

  return {
    conflict: false,
    manifest: {
      serverRevision: latestRev + 1,
      metaRevision: (Number(latestRemote.metaRevision) || 0) + (metaTouched ? 1 : 0),
      materialsRevision:
        (Number(latestRemote.materialsRevision) || 0) + (touched.materials ? 1 : 0),
      materialsCount:
        touched.materials && localUpdate.materialsCount !== undefined
          ? localUpdate.materialsCount
          : Number(latestRemote.materialsCount) || 0,
      materialsChunkCount:
        touched.materials && localUpdate.materialsChunkCount !== undefined
          ? localUpdate.materialsChunkCount
          : Number(latestRemote.materialsChunkCount) || 0,
      materialsDigest:
        touched.materials && localUpdate.materialsDigest !== undefined
          ? localUpdate.materialsDigest
          : String(latestRemote.materialsDigest || '0:0:0:0'),
      metaDigest: mergedMetaDigest,
      accountChunkCount:
        touched.users && localUpdate.accountChunkCount !== undefined
          ? localUpdate.accountChunkCount
          : Number(latestRemote.accountChunkCount) || 0,
      warehouseChunkCount:
        touched.warehouses && localUpdate.warehouseChunkCount !== undefined
          ? localUpdate.warehouseChunkCount
          : Number(latestRemote.warehouseChunkCount) || 0,
      tombstoneChunkCount:
        touched.tombstones && localUpdate.tombstoneChunkCount !== undefined
          ? localUpdate.tombstoneChunkCount
          : Number(latestRemote.tombstoneChunkCount) || 0,
      inboundIndexChunkCount:
        touched.inbound && localUpdate.inboundIndexChunkCount !== undefined
          ? localUpdate.inboundIndexChunkCount
          : Number(latestRemote.inboundIndexChunkCount) || 0,
      outboundIndexChunkCount:
        touched.outbound && localUpdate.outboundIndexChunkCount !== undefined
          ? localUpdate.outboundIndexChunkCount
          : Number(latestRemote.outboundIndexChunkCount) || 0
    }
  };
}

export function withAsyncTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export function shouldRunLocalBridgeAfterCloud(params: {
  skipLocalServer?: boolean;
  cloudSuccess: boolean;
  pulledChanges: boolean;
  pushedChanges: boolean;
  hasCompletedInitialLocalSync: boolean;
}): boolean {
  if (params.skipLocalServer) return false;
  if (params.pulledChanges || params.pushedChanges) return true;
  if (params.cloudSuccess) return false;
  return !params.hasCompletedInitialLocalSync;
}

export function shouldQueueReconcileDuringAuthTransition(options?: {
  trigger?: 'mutation' | 'remote' | 'startup' | 'manual';
  forceManifestRefresh?: boolean;
}): boolean {
  return options?.trigger === 'mutation' || Boolean(options?.forceManifestRefresh);
}
