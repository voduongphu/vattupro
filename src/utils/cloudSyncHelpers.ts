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

  const missingAccounts = remoteCounts.accountChunkCount > 0 && localCounts.users <= 1;
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
