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

export function computeReceiptDomainDigestFromIndexEntries(
  kind: 'inbound' | 'outbound',
  entries: Iterable<{ code: string; digest: string }>
): string {
  let sum1 = 0;
  let sum2 = 0;
  let xor1 = 0;
  let count = 0;
  const prefix = kind === 'inbound' ? 'IN' : 'OUT';
  for (const entry of entries) {
    const code = normKey(entry.code);
    if (!code) continue;
    const [h1, h2] = fnvPair(`${prefix}|${code}|${entry.digest || '0:0:0'}`);
    sum1 = (sum1 + h1) >>> 0;
    sum2 = (sum2 + h2) >>> 0;
    xor1 = (xor1 ^ (kind === 'inbound' ? h1 : h2)) >>> 0;
    count += 1;
  }
  return compactHashPair(sum1, sum2, xor1, count);
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
      const err = new Error(timeoutMessage);
      err.name = 'LocalTimeoutError';
      reject(err);
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

export function isLocalTimeoutError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'LocalTimeoutError') return true;
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  return msg.includes('phản hồi quá chậm') || msg.includes('quá thời gian chờ');
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
  return (
    options?.trigger === 'mutation' ||
    options?.trigger === 'startup' ||
    options?.trigger === 'manual' ||
    Boolean(options?.forceManifestRefresh)
  );
}

export function shouldUpdateLastSyncTimestamp(params: {
  isCloudSession: boolean;
  cloudSuccess: boolean;
  localSuccess: boolean;
  cloudQuotaExceeded: boolean;
}): boolean {
  if (params.cloudQuotaExceeded) return false;
  if (params.isCloudSession) return params.cloudSuccess;
  return params.cloudSuccess || params.localSuccess;
}

export interface AdaptiveCloudFetchConfig {
  concurrency: number;
  itemChunkConcurrency: number;
  readTimeoutMs: number;
  maxReadRetries: number;
  retryBaseDelayMs: number;
}

export function getAdaptiveCloudFetchConfig(isMobile: boolean): AdaptiveCloudFetchConfig {
  return isMobile
    ? {
        concurrency: 3,
        itemChunkConcurrency: 3,
        readTimeoutMs: 25_000,
        maxReadRetries: 2,
        retryBaseDelayMs: 450
      }
    : {
        concurrency: 8,
        itemChunkConcurrency: 6,
        readTimeoutMs: 18_000,
        maxReadRetries: 1,
        retryBaseDelayMs: 300
      };
}

export interface AdaptiveBatchWriteConfig {
  maxOpsPerBatch: number;
  maxBytesPerBatch: number;
  batchConcurrency: number;
  commitTimeoutMs: number;
}

export function getAdaptiveBatchWriteConfig(params: {
  isMobile: boolean;
  isAdmin: boolean;
  allKnownExisting: boolean;
  avgPayloadBytes: number;
}): AdaptiveBatchWriteConfig {
  // Firestore Web SDK dùng 1 luồng ghi tuần tự duy nhất (WriteStream).
  // Gửi batch nhỏ gọn (<= 400 KB) và giới hạn độ đồng thời (1 trên mobile/dữ liệu nặng, 2 trên máy tính cho header nhẹ)
  // giúp tránh nghẽn cổ chai hàng đợi WriteStream gây lỗi timeout hàng loạt.
  const maxBytesPerBatch = 400_000;
  // Firestore Rules giới hạn cứng 20 lệnh get()/exists() trên MỖI writeBatch:
  // - Admin update: 0 lệnh get/exists -> an toàn tới 16 doc/batch
  // - Admin create (hoặc trộn): tối đa 3 lệnh/doc (2 workspace + 1 phiếu cha) -> 6 x 3 = 18 <= 20
  // - Nhân sự (non-admin): tối đa 6 lệnh/doc -> 3 x 6 = 18 <= 20
  const maxOpsPerBatch = params.isAdmin ? (params.allKnownExisting ? 16 : 6) : 3;
  const isHeavyPayload = Number(params.avgPayloadBytes) > 120_000;
  const batchConcurrency = params.isMobile || isHeavyPayload ? 1 : 2;
  const commitTimeoutMs = 60_000;

  return {
    maxOpsPerBatch,
    maxBytesPerBatch,
    batchConcurrency,
    commitTimeoutMs
  };
}

export function isRetryableCloudReadError(err: unknown): boolean {
  if (isTransientResourceExhaustedError(err)) {
    return true;
  }
  if (isFirestoreBillingOrPlanError(err) || isFirestoreQuotaExceededError(err)) {
    return false;
  }
  const code = String((err as any)?.code || '').toLowerCase();
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  if (
    code === 'permission-denied' ||
    code === 'resource-exhausted' ||
    code === 'unauthenticated' ||
    code === 'invalid-argument' ||
    code === 'failed-precondition' ||
    code === 'not-found' ||
    code.includes('permission-denied') ||
    code.includes('resource-exhausted') ||
    msg.includes('missing or insufficient permissions') ||
    msg.includes('permission_denied') ||
    msg.includes('quota limit exceeded') ||
    msg.includes('quota exceeded')
  ) {
    return false;
  }
  return true;
}

export async function retryAsyncWithBackoff<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    baseDelayMs?: number;
    shouldRetry?: (err: unknown, attempt: number) => boolean;
    sleepFn?: (ms: number) => Promise<void>;
    isAborted?: () => boolean;
    getAbortError?: () => Error;
    getRemainingMs?: () => number;
  }
): Promise<T> {
  const maxRetries = Math.max(0, Math.floor(Number(options?.maxRetries ?? 1)));
  const baseDelayMs = Math.max(0, Math.floor(Number(options?.baseDelayMs ?? 300)));
  const shouldRetry = options?.shouldRetry ?? ((err: unknown) => isRetryableCloudReadError(err));
  const sleepFn =
    options?.sleepFn ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const buildAbortErr = () =>
    options?.getAbortError
      ? options.getAbortError()
      : new SyncAbortedError('Đã tạm dừng đồng bộ Cloud.', { timedOut: true });

  let attempt = 0;
  while (true) {
    if (options?.isAborted?.()) {
      throw buildAbortErr();
    }
    try {
      return await fn();
    } catch (err) {
      if (isSyncAbortedError(err) || options?.isAborted?.()) {
        throw isSyncAbortedError(err) ? err : buildAbortErr();
      }
      if (attempt >= maxRetries || !shouldRetry(err, attempt)) {
        throw err;
      }
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      if (options?.getRemainingMs) {
        const rem = options.getRemainingMs();
        if (!Number.isFinite(rem) || rem <= 0 || delayMs >= rem) {
          throw buildAbortErr();
        }
      }
      attempt += 1;
      if (delayMs > 0) {
        await sleepFn(delayMs);
        if (options?.isAborted?.()) {
          throw buildAbortErr();
        }
      }
    }
  }
}

export async function runWithConcurrencyLimit<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  options?: {
    isAborted?: () => boolean;
    getAbortError?: () => Error;
  }
): Promise<R[]> {
  if (!Array.isArray(items) || items.length === 0) return [];
  const limit = Math.max(1, Math.min(items.length, Math.floor(Number(concurrency) || 1)));
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const buildAbortErr = () =>
    options?.getAbortError
      ? options.getAbortError()
      : new SyncAbortedError('Đã tạm dừng đồng bộ Cloud.', { timedOut: true });

  const runWorker = async () => {
    while (true) {
      if (options?.isAborted?.()) {
        throw buildAbortErr();
      }
      const idx = nextIndex;
      if (idx >= items.length) return;
      nextIndex = idx + 1;
      results[idx] = await worker(items[idx], idx);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}

export function estimateUtf8ByteLength(str: string): number {
  if (!str) return 0;
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

export function estimateFirestoreValueBytes(value: unknown): number {
  if (value === null || value === undefined) return 4;
  const t = typeof value;
  if (t === 'boolean') return 4;
  if (t === 'number') return 12;
  if (t === 'string') return estimateUtf8ByteLength(value as string) + 8;
  if (Array.isArray(value)) {
    let total = 16;
    for (let i = 0; i < value.length; i++) {
      total += estimateFirestoreValueBytes(value[i]) + 8;
    }
    return total;
  }
  if (t === 'object') {
    let total = 24;
    const obj = value as Record<string, unknown>;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        total += estimateUtf8ByteLength(key) + 16 + estimateFirestoreValueBytes(obj[key]);
      }
    }
    return total;
  }
  return 16;
}

export function estimateStagedWritePayloadBytes(
  docPath: string,
  immutableFields: Record<string, unknown>,
  mutableFields: Record<string, unknown>
): number {
  const raw =
    512 +
    estimateUtf8ByteLength(docPath || '') * 2 +
    estimateFirestoreValueBytes(immutableFields) +
    estimateFirestoreValueBytes(mutableFields);
  // Hệ số bù đóng gói JSON/Protobuf WebChannel để luôn nằm an toàn dưới giới hạn 10 MiB / 18 MiB của Firestore
  return Math.ceil(raw * 1.25);
}

export function deduplicateStagedWritesByPath<T>(
  writes: readonly T[],
  getPath: (item: T) => string
): T[] {
  if (!Array.isArray(writes) || writes.length <= 1) {
    return Array.isArray(writes) ? [...writes] : [];
  }
  const indexByPath = new Map<string, number>();
  const deduped: T[] = [];
  for (let i = 0; i < writes.length; i++) {
    const item = writes[i];
    const path = getPath(item);
    const existingIdx = indexByPath.get(path);
    if (existingIdx !== undefined) {
      deduped[existingIdx] = item;
    } else {
      indexByPath.set(path, deduped.length);
      deduped.push(item);
    }
  }
  return deduped;
}

export function partitionStagedWritesIntoBatches<T>(
  writes: readonly T[],
  estimateBytes: (item: T) => number,
  limits?: {
    maxOpsPerBatch?: number;
    maxBytesPerBatch?: number;
  }
): T[][] {
  if (!Array.isArray(writes) || writes.length === 0) return [];
  const maxOps = Math.max(1, Math.floor(Number(limits?.maxOpsPerBatch ?? 3)));
  const maxBytes = Math.max(16_384, Math.floor(Number(limits?.maxBytesPerBatch ?? 2_500_000)));

  const batches: T[][] = [];
  let current: T[] = [];
  let currentBytes = 0;

  for (let i = 0; i < writes.length; i++) {
    const item = writes[i];
    const itemBytes = Math.max(256, Math.ceil(Number(estimateBytes(item)) || 256));

    if (
      current.length > 0 &&
      (current.length >= maxOps || currentBytes + itemBytes > maxBytes)
    ) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push(item);
    currentBytes += itemBytes;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

export function chunkItemsByCountAndBytes<T>(
  items: readonly T[],
  maxItemsPerChunk = 200,
  maxBytesPerChunk = 500_000
): T[][] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const maxCount = Math.max(1, Math.floor(Number(maxItemsPerChunk) || 1));
  const maxBytes = Math.max(8_192, Math.floor(Number(maxBytesPerChunk) || 500_000));

  const chunks: T[][] = [];
  let current: T[] = [];
  let currentBytes = 512;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemBytes = estimateFirestoreValueBytes(item) + 16;

    if (
      current.length > 0 &&
      (current.length >= maxCount || currentBytes + itemBytes > maxBytes)
    ) {
      chunks.push(current);
      current = [];
      currentBytes = 512;
    }

    current.push(item);
    currentBytes += itemBytes;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

export function isPayloadSizeExceededError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  return (
    msg.includes('request payload size exceeds the limit') ||
    msg.includes('payload size exceeds') ||
    msg.includes('exceeds the maximum allowed size') ||
    msg.includes('maximum size of') ||
    msg.includes('entity too large') ||
    msg.includes('request entity too large') ||
    msg.includes('batch write size exceeds')
  );
}

export const DEFAULT_FIRESTORE_QUOTA_MESSAGE =
  'Cloud Firestore báo vượt hạn mức đọc/ghi (hoặc cơ sở dữ liệu vẫn đang ở chế độ Free tier). Hệ thống đang tạm sử dụng lưu trữ cục bộ; nếu bạn đã nâng cấp gói Blaze, hãy kiểm tra mục nâng cấp riêng cho database Firestore trên Firebase Console rồi thử đồng bộ lại.';

export const DEFAULT_FIRESTORE_BILLING_DISABLED_MESSAGE =
  'Cloud Firestore đang tạm dừng do dự án Firebase vừa chuyển từ gói Blaze về gói miễn phí Spark (cơ sở dữ liệu định danh hoặc dịch vụ Cloud cần tài khoản thanh toán Blaze). Dữ liệu cục bộ trên thiết bị vẫn an toàn và bạn vẫn làm việc bình thường ở chế độ cục bộ.';

export function extractRawFirestoreErrorMessage(err: unknown): string {
  if (!err) return '';
  let raw = err instanceof Error ? err.message : String(err);
  raw = raw.trim();
  if (!raw) return '';
  // Nếu là JSON FirestoreErrorInfo do handleFirestoreError bọc lại, bóc trường "error" gốc ra
  if (raw.startsWith('{') && raw.includes('"error"')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
        raw = parsed.error.trim();
      }
    } catch {
      // giữ nguyên chuỗi raw
    }
  }
  return raw.replace(/\s+/g, ' ').trim();
}

export function isFirestoreBillingOrPlanError(err: unknown): boolean {
  if (!err) return false;
  const code = String((err as any)?.code || '').toLowerCase();
  const rawMessage = extractRawFirestoreErrorMessage(err);
  const lower = rawMessage.toLowerCase();
  if (!lower && !code) return false;
  return (
    code === 'billing-not-enabled' ||
    code === 'auth/billing-not-enabled' ||
    lower.includes('billing must be enabled') ||
    lower.includes('billing_disabled') ||
    lower.includes('billing not enabled') ||
    lower.includes('requires billing') ||
    lower.includes('billing account is closed') ||
    lower.includes('billing account is disabled') ||
    lower.includes('billing account not found') ||
    lower.includes('requires the blaze plan') ||
    lower.includes('upgrade to the blaze plan') ||
    lower.includes('not available on the spark plan') ||
    lower.includes('spark plan') ||
    lower.includes('service_disabled') ||
    lower.includes('cloud firestore api has not been used') ||
    lower.includes('firestore.googleapis.com') && lower.includes('disabled') ||
    (lower.includes('database') &&
      (lower.includes('does not exist') ||
        lower.includes('is disabled') ||
        lower.includes('has been disabled') ||
        lower.includes('not found')))
  );
}

export function isTransientResourceExhaustedError(err: unknown): boolean {
  if (!err) return false;
  if (isFirestoreBillingOrPlanError(err)) return false;
  const raw = extractRawFirestoreErrorMessage(err);
  const lower = raw.toLowerCase();
  // Nếu Google nêu rõ hết hạn mức ngày / free tier thì là quota cứng, không phải quá tải tốc độ tạm thời
  if (
    lower.includes('quota exceeded') ||
    lower.includes('quota limit exceeded') ||
    lower.includes('free daily') ||
    lower.includes('free tier') ||
    lower.includes('daily limit') ||
    lower.includes('billing')
  ) {
    return false;
  }
  return (
    lower.includes('write stream exhausted') ||
    lower.includes('maximum write rate') ||
    lower.includes('sustained write rate') ||
    lower.includes('too much contention') ||
    lower.includes('too many requests') ||
    lower.includes('too many outstanding') ||
    lower.includes('rate limit') ||
    lower.includes('backoff') ||
    lower.includes('bandwidth') ||
    lower.includes('throttl')
  );
}

export function isFirestoreQuotaExceededError(err: unknown): boolean {
  if (!err) return false;
  if (isPayloadSizeExceededError(err) || isTransientResourceExhaustedError(err)) {
    return false;
  }
  const code = String((err as any)?.code || '').toLowerCase();
  const rawMessage = extractRawFirestoreErrorMessage(err);
  const lowerMsg = rawMessage.toLowerCase();
  return (
    code === 'resource-exhausted' ||
    code.includes('resource-exhausted') ||
    lowerMsg.includes('quota limit exceeded') ||
    lowerMsg.includes('quota exceeded') ||
    lowerMsg.includes('free daily') ||
    lowerMsg.includes('resource-exhausted')
  );
}

export function isFirestoreCloudRestrictedError(err: unknown): boolean {
  return isFirestoreQuotaExceededError(err) || isFirestoreBillingOrPlanError(err);
}

export function formatFirestoreQuotaMessage(err?: unknown): string {
  const raw = extractRawFirestoreErrorMessage(err);
  if (isFirestoreBillingOrPlanError(err)) {
    if (!raw) return DEFAULT_FIRESTORE_BILLING_DISABLED_MESSAGE;
    const clipped = raw.length > 220 ? `${raw.slice(0, 217)}...` : raw;
    return `${DEFAULT_FIRESTORE_BILLING_DISABLED_MESSAGE} (Chi tiết từ Google: ${clipped})`;
  }
  if (!raw || raw === DEFAULT_FIRESTORE_QUOTA_MESSAGE) {
    return DEFAULT_FIRESTORE_QUOTA_MESSAGE;
  }
  const lower = raw.toLowerCase();
  const clipped = raw.length > 220 ? `${raw.slice(0, 217)}...` : raw;
  if (
    lower.includes('free tier') ||
    lower.includes('free daily') ||
    lower.includes('free-tier') ||
    lower.includes('free_tier')
  ) {
    return `Cơ sở dữ liệu Cloud Firestore vẫn đang chạy ở chế độ miễn phí (Free tier database) nên bị giới hạn lượt đọc/ghi trong ngày ngay cả khi dự án đã bật gói Blaze. Hãy nâng cấp riêng database Firestore trong Firebase Console (và chờ 5–15 phút để Google áp dụng). (Chi tiết từ Google: ${clipped})`;
  }
  return `Cloud Firestore báo vượt hạn mức (resource-exhausted). Nếu bạn vừa nâng cấp lên gói Blaze, hãy kiểm tra lại đã nâng cấp đúng dự án & đúng cơ sở dữ liệu Firestore (thoát chế độ Free tier) và chờ 5–15 phút rồi bấm đồng bộ lại. (Chi tiết từ Google: ${clipped})`;
}

export interface PreSyncCheckInput {
  lastSyncTimestamp: number;
  lastLocalMutationTimestamp: number;
  hasLocalDirtyFlags: boolean;
  hasRemoteManifestChanges?: boolean;
  remoteUpdatedAtMs?: number;
  forceCheckRemote?: boolean;
}

export interface PreSyncCheckResult {
  shouldProceedWithSync: boolean;
  shouldSpinImmediately: boolean;
  localChangedSinceLastSync: boolean;
  remoteChangedSinceLastSync: boolean;
  reason:
    | 'local_dirty'
    | 'local_mutation_after_last_sync'
    | 'remote_newer_than_last_sync'
    | 'remote_manifest_changed'
    | 'initial_sync_check_silently'
    | 'forced_remote_check_silently'
    | 'no_changes_since_last_sync';
}

export function evaluatePreSyncCheck(input: PreSyncCheckInput): PreSyncCheckResult {
  const lastSync = Math.max(0, Number(input.lastSyncTimestamp) || 0);
  const lastLocalMutation = Math.max(0, Number(input.lastLocalMutationTimestamp) || 0);
  const remoteUpdatedAt = Math.max(0, Number(input.remoteUpdatedAtMs) || 0);

  const localMutationNewer = lastLocalMutation > 0 && lastLocalMutation > lastSync;
  const localChangedSinceLastSync = Boolean(input.hasLocalDirtyFlags) || localMutationNewer;
  const remoteTimestampNewer = lastSync > 0 && remoteUpdatedAt > 0 && remoteUpdatedAt > lastSync;
  const remoteChangedSinceLastSync =
    Boolean(input.hasRemoteManifestChanges) || remoteTimestampNewer;

  if (localChangedSinceLastSync) {
    return {
      shouldProceedWithSync: true,
      shouldSpinImmediately: true,
      localChangedSinceLastSync: true,
      remoteChangedSinceLastSync,
      reason: input.hasLocalDirtyFlags ? 'local_dirty' : 'local_mutation_after_last_sync'
    };
  }

  if (remoteChangedSinceLastSync) {
    return {
      shouldProceedWithSync: true,
      shouldSpinImmediately: true,
      localChangedSinceLastSync: false,
      remoteChangedSinceLastSync: true,
      reason: input.hasRemoteManifestChanges
        ? 'remote_manifest_changed'
        : 'remote_newer_than_last_sync'
    };
  }

  if (lastSync <= 0) {
    return {
      shouldProceedWithSync: true,
      shouldSpinImmediately: false,
      localChangedSinceLastSync: false,
      remoteChangedSinceLastSync: false,
      reason: 'initial_sync_check_silently'
    };
  }

  if (input.forceCheckRemote) {
    return {
      shouldProceedWithSync: true,
      shouldSpinImmediately: false,
      localChangedSinceLastSync: false,
      remoteChangedSinceLastSync: false,
      reason: 'forced_remote_check_silently'
    };
  }

  return {
    shouldProceedWithSync: false,
    shouldSpinImmediately: false,
    localChangedSinceLastSync: false,
    remoteChangedSinceLastSync: false,
    reason: 'no_changes_since_last_sync'
  };
}

export interface ConvergedCheckpointInput {
  manifestMutated: boolean;
  committedMetaDigest?: string;
  committedMaterialsDigest?: string;
  remoteMetaDigest: string;
  remoteMaterialsDigest: string;
  finalLocalMetaDigest: string;
  finalLocalMaterialsDigest: string;
  dirty: {
    users: boolean;
    warehouses: boolean;
    tombstones: boolean;
    osd: boolean;
    inbound: boolean;
    outbound: boolean;
    materials: boolean;
  };
}

export interface ConvergedCheckpointOutput {
  localMetaDigest: string;
  localMaterialsDigest: string;
  remoteSyncedMetaDigest: string;
  remoteSyncedMaterialsDigest: string;
}

export function resolveConvergedCheckpointDigests(
  input: ConvergedCheckpointInput
): ConvergedCheckpointOutput {
  const localMetaDigest = input.finalLocalMetaDigest;
  const localMaterialsDigest = input.finalLocalMaterialsDigest;

  if (input.manifestMutated) {
    return {
      localMetaDigest,
      localMaterialsDigest,
      remoteSyncedMetaDigest: input.committedMetaDigest || localMetaDigest,
      remoteSyncedMaterialsDigest: input.committedMaterialsDigest || localMaterialsDigest
    };
  }

  const remoteV2 = parseMetaDigestV2(input.remoteMetaDigest);
  const localV2 = parseMetaDigestV2(localMetaDigest);
  let remoteSyncedMetaDigest = input.remoteMetaDigest || localMetaDigest;
  if (remoteV2 && localV2) {
    remoteSyncedMetaDigest = encodeMetaDigestV2({
      u: input.dirty.users ? localV2.u : remoteV2.u,
      w: input.dirty.warehouses ? localV2.w : remoteV2.w,
      t: input.dirty.tombstones ? localV2.t : remoteV2.t,
      o: input.dirty.osd ? localV2.o : remoteV2.o,
      in: input.dirty.inbound ? localV2.in : remoteV2.in,
      out: input.dirty.outbound ? localV2.out : remoteV2.out
    });
  }

  const remoteSyncedMaterialsDigest = input.dirty.materials
    ? localMaterialsDigest
    : input.remoteMaterialsDigest || localMaterialsDigest;

  return {
    localMetaDigest,
    localMaterialsDigest,
    remoteSyncedMetaDigest,
    remoteSyncedMaterialsDigest
  };
}

export const CLOUD_SYNC_HARD_TIMEOUT_MS = 120_000;

export class SyncAbortedError extends Error {
  reason: string;
  timedOut: boolean;

  constructor(
    message = 'Đã tạm dừng đồng bộ Cloud do quá thời gian chờ.',
    options?: { reason?: string; timedOut?: boolean }
  ) {
    super(message);
    this.name = 'SyncAbortedError';
    this.reason = options?.reason || message;
    this.timedOut = Boolean(options?.timedOut);
  }
}

export function isSyncAbortedError(err: unknown): boolean {
  return err instanceof SyncAbortedError || (err instanceof Error && err.name === 'SyncAbortedError');
}

export interface SyncDeadlineController {
  readonly startedAtMs: number;
  readonly deadlineMs: number;
  isAborted: () => boolean;
  isExpired: () => boolean;
  remainingMs: () => number;
  elapsedMs: () => number;
  getAbortReason: () => string | null;
  didTimeOut: () => boolean;
  abort: (reason?: string, timedOut?: boolean) => void;
  throwIfAborted: () => void;
  dispose: () => void;
}

export function createSyncDeadline(
  timeoutMs = CLOUD_SYNC_HARD_TIMEOUT_MS,
  options?: {
    nowFn?: () => number;
    onTimeout?: () => void;
  }
): SyncDeadlineController {
  const nowFn = options?.nowFn ?? Date.now;
  const effectiveTimeoutMs = Math.max(1000, Math.floor(Number(timeoutMs) || CLOUD_SYNC_HARD_TIMEOUT_MS));
  const startedAtMs = nowFn();
  const deadlineMs = startedAtMs + effectiveTimeoutMs;
  let aborted = false;
  let timedOut = false;
  let abortReason: string | null = null;
  let disposed = false;
  let notifiedTimeout = false;

  const triggerTimeout = () => {
    if (disposed) return;
    if (!aborted) {
      aborted = true;
      timedOut = true;
      abortReason =
        abortReason ||
        'Quá thời gian chờ kết nối/đồng bộ (> 2 phút) do mạng di động phản hồi chậm hoặc không thể liên hệ máy chủ Cloud';
    }
    clearTimeout(timer);
    if (!notifiedTimeout) {
      notifiedTimeout = true;
      try {
        options?.onTimeout?.();
      } catch {
        // ignore timeout callback error
      }
    }
  };

  const timer = setTimeout(() => {
    if (disposed || aborted) return;
    triggerTimeout();
  }, effectiveTimeoutMs);

  const checkExpired = (): boolean => {
    if (aborted) return true;
    if (nowFn() >= deadlineMs) {
      triggerTimeout();
      return true;
    }
    return false;
  };

  return {
    startedAtMs,
    deadlineMs,
    isAborted: () => checkExpired(),
    isExpired: () => checkExpired(),
    remainingMs: () => Math.max(0, deadlineMs - nowFn()),
    elapsedMs: () => Math.max(0, nowFn() - startedAtMs),
    getAbortReason: () => {
      checkExpired();
      return abortReason;
    },
    didTimeOut: () => {
      checkExpired();
      return timedOut;
    },
    abort: (reason?: string, isTimeout = false) => {
      if (aborted) return;
      aborted = true;
      timedOut = Boolean(isTimeout);
      abortReason = reason || 'Đã tạm dừng kết nối Cloud.';
      clearTimeout(timer);
    },
    throwIfAborted: () => {
      if (checkExpired()) {
        throw new SyncAbortedError(
          abortReason || 'Quá thời gian chờ kết nối/đồng bộ Cloud (> 2 phút).',
          { reason: abortReason || undefined, timedOut }
        );
      }
    },
    dispose: () => {
      disposed = true;
      clearTimeout(timer);
    }
  };
}

export function getEffectiveStepTimeoutMs(
  requestedTimeoutMs: number,
  remainingMs: number
): number {
  const req = Math.max(1000, Math.floor(Number(requestedTimeoutMs) || 10_000));
  if (!Number.isFinite(remainingMs)) return req;
  if (remainingMs <= 0) {
    throw new SyncAbortedError(
      'Quá thời gian chờ kết nối/đồng bộ Cloud (> 2 phút).',
      {
        reason:
          'Quá thời gian chờ kết nối/đồng bộ (> 2 phút) do mạng di động phản hồi chậm hoặc không thể liên hệ máy chủ Cloud',
        timedOut: true
      }
    );
  }
  return Math.max(1000, Math.min(req, Math.floor(remainingMs)));
}

export function classifyCloudPauseReason(
  errOrMsg: unknown,
  ctx?: { isOnline?: boolean; timedOutOver2Min?: boolean }
): string {
  if (ctx?.isOnline === false) {
    return 'Thiết bị đang mất kết nối mạng Internet (ngoại tuyến)';
  }
  if (
    ctx?.timedOutOver2Min ||
    (errOrMsg instanceof SyncAbortedError && errOrMsg.timedOut)
  ) {
    return 'Quá thời gian chờ kết nối/đồng bộ (> 2 phút) do mạng di động phản hồi chậm hoặc không thể liên hệ máy chủ Cloud';
  }
  if (isFirestoreBillingOrPlanError(errOrMsg)) {
    return 'Dự án Firebase đang ở gói Spark hoặc dịch vụ Cloud Firestore chưa bật thanh toán Blaze';
  }
  if (isFirestoreQuotaExceededError(errOrMsg)) {
    return 'Cloud Firestore tạm vượt hạn mức đọc/ghi miễn phí trong ngày';
  }

  const code = String((errOrMsg as any)?.code || '').toLowerCase();
  const raw = extractRawFirestoreErrorMessage(errOrMsg);
  const lower = raw.toLowerCase();

  if (lower.includes('ngoại tuyến') || lower.includes('offline')) {
    return 'Thiết bị đang mất kết nối mạng Internet (ngoại tuyến)';
  }
  if (
    lower.includes('> 2 phút') ||
    lower.includes('2 phút') ||
    lower.includes('quá thời gian chờ kết nối')
  ) {
    return 'Quá thời gian chờ kết nối/đồng bộ (> 2 phút) do mạng di động phản hồi chậm hoặc không thể liên hệ máy chủ Cloud';
  }
  if (
    code === 'auth/popup-blocked' ||
    lower.includes('popup-blocked') ||
    lower.includes('chặn cửa sổ')
  ) {
    return 'Trình duyệt trên thiết bị đang chặn cửa sổ xác thực Google';
  }
  if (
    code === 'auth/user-token-expired' ||
    code === 'auth/invalid-user-token' ||
    code === 'unauthenticated' ||
    lower.includes('hết hạn') ||
    lower.includes('token') ||
    lower.includes('unauthenticated')
  ) {
    return 'Phiên xác thực tài khoản Google đã hết hạn hoặc cần đăng nhập lại';
  }
  if (
    code === 'permission-denied' ||
    code.includes('permission-denied') ||
    lower.includes('missing or insufficient permissions') ||
    lower.includes('permission_denied') ||
    lower.includes('thu hồi') ||
    lower.includes('quyền truy cập')
  ) {
    return 'Tài khoản Google chưa được cấp quyền hoặc đã bị thu hồi quyền truy cập Cloud';
  }
  if (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'aborted' ||
    code === 'auth/network-request-failed' ||
    lower.includes('network') ||
    lower.includes('unavailable') ||
    lower.includes('failed to fetch') ||
    lower.includes('transport') ||
    lower.includes('mạng') ||
    lower.includes('kết nối') ||
    isLocalTimeoutError(errOrMsg)
  ) {
    return 'Kết nối mạng di động yếu, chập chờn hoặc không thể liên hệ máy chủ Google Cloud';
  }
  if (raw) {
    return raw.length > 160 ? `${raw.slice(0, 157)}...` : raw;
  }
  return 'Không thể kết nối tới máy chủ Google Cloud Firestore';
}

export function formatCloudPauseNotice(reason: string): string {
  const cleanReason = String(reason || '').trim().replace(/\.+$/, '') || 'Không thể kết nối Cloud Firestore';
  return `Tạm dừng kết nối Cloud vì lý do: ${cleanReason}. Vui lòng nhấn nút "Đồng Bộ Cloud" để chủ động kết nối lại.`;
}

export function shouldPauseCloudOnFailure(params: {
  elapsedMs: number;
  maxDurationMs: number;
  consecutiveFailures: number;
  quotaExceeded?: boolean;
  offline?: boolean;
  timedOutOver2Min?: boolean;
  nonRetryableError?: boolean;
  isManualTrigger?: boolean;
}): boolean {
  if (params.timedOutOver2Min) return true;
  if (params.elapsedMs >= params.maxDurationMs) return true;
  if (params.quotaExceeded || params.offline || params.nonRetryableError) return true;
  if (params.isManualTrigger && params.consecutiveFailures >= 1) return true;
  return params.consecutiveFailures >= 2;
}

export function shouldSkipAutoCloudActivity(params: {
  connectionPaused: boolean;
  isManualTrigger: boolean;
}): boolean {
  return Boolean(params.connectionPaused && !params.isManualTrigger);
}



