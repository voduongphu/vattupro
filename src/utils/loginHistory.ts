import type {
  LoginHistoryEntry,
  LoginHistoryMethod,
  LoginHistoryStatus,
  User,
  UserRole
} from '../types/inventory';
import { formatGmt7TimeAndDate } from './voucherAudit';

export const MAX_LOGIN_HISTORY_PER_USER = 100;
export const MAX_LOCAL_LOGIN_HISTORY = 500;

function cleanBoundedText(val: unknown, maxLen: number, fallback = ''): string {
  const s = val === null || val === undefined ? '' : String(val).normalize('NFC').trim();
  if (!s && fallback) return fallback.slice(0, maxLen);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function hashFnvPair(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + ((i & 0xff) << 8);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

export function buildLoginHistoryEntryId(params: {
  userKey: string;
  deviceId: string;
  loginAtMs: number;
  method: LoginHistoryMethod;
}): string {
  const normKey = cleanBoundedText(params.userKey, 160, 'user').toLowerCase();
  const normDevice = cleanBoundedText(params.deviceId, 160, 'web');
  const ms = Math.max(0, Math.floor(Number(params.loginAtMs) || 0));
  const hash = hashFnvPair(`${normKey}|${normDevice}|${ms}|${params.method}`);
  return `lh_${ms.toString(36)}_${hash}`.slice(0, 120);
}

export function createLoginHistoryEntry(params: {
  user: User;
  userKey: string;
  deviceId: string;
  deviceLabel: string;
  loginAt: string;
  loginAtMs?: number;
  authUid?: string;
  method?: LoginHistoryMethod;
  replacedDeviceLabel?: string;
}): LoginHistoryEntry {
  const parsedMs = Number(params.loginAtMs) || Date.parse(params.loginAt) || Date.now();
  const loginAtMs = Number.isFinite(parsedMs) && parsedMs > 0 ? Math.floor(parsedMs) : Date.now();
  const loginAt = cleanBoundedText(params.loginAt, 64) || new Date(loginAtMs).toISOString();
  const method: LoginHistoryMethod = params.method === 'account' ? 'account' : 'google';
  const replacedDeviceLabel = cleanBoundedText(params.replacedDeviceLabel, 200);
  const status: LoginHistoryStatus = replacedDeviceLabel ? 'replaced_other_device' : 'success';
  const userKey = cleanBoundedText(params.userKey || params.user.username || params.user.email, 160, 'user');
  const deviceId = cleanBoundedText(params.deviceId, 160, 'web');
  const deviceLabel = cleanBoundedText(params.deviceLabel, 200, 'Thiết bị Web');

  return {
    id: buildLoginHistoryEntryId({
      userKey,
      deviceId,
      loginAtMs,
      method
    }),
    userId: cleanBoundedText(params.user.id, 160, 'user-0'),
    username: cleanBoundedText(params.user.username, 160, 'user'),
    fullName: cleanBoundedText(params.user.fullName || params.user.username, 200, 'Người dùng'),
    email: cleanBoundedText(params.user.email, 200).toLowerCase() || undefined,
    role: normalizeRole(params.user.role),
    authUid: cleanBoundedText(params.authUid || params.user.authUid, 128) || undefined,
    userKey,
    deviceId,
    deviceLabel,
    loginAt,
    loginAtMs,
    method,
    status,
    replacedDeviceLabel: replacedDeviceLabel || undefined
  };
}

function normalizeRole(role: unknown): UserRole {
  return role === 'admin' || role === 'manager' || role === 'staff' || role === 'viewer'
    ? role
    : 'staff';
}

export function sanitizeLoginHistoryEntryForCloud(entry: LoginHistoryEntry): Record<string, unknown> {
  const loginAtMs = Number(entry.loginAtMs) > 0
    ? Math.floor(Number(entry.loginAtMs))
    : Math.max(0, Date.parse(entry.loginAt) || Date.now());
  return {
    id: cleanBoundedText(entry.id, 120, `lh_${loginAtMs.toString(36)}`),
    userId: cleanBoundedText(entry.userId, 160, 'user-0'),
    username: cleanBoundedText(entry.username, 160, 'user'),
    fullName: cleanBoundedText(entry.fullName || entry.username, 200, 'Người dùng'),
    email: cleanBoundedText(entry.email, 200).toLowerCase(),
    role: normalizeRole(entry.role),
    authUid: cleanBoundedText(entry.authUid, 128),
    userKey: cleanBoundedText(entry.userKey, 160, 'user'),
    deviceId: cleanBoundedText(entry.deviceId, 160, ''),
    deviceLabel: cleanBoundedText(entry.deviceLabel, 200, 'Thiết bị Web'),
    loginAt: cleanBoundedText(entry.loginAt, 64, new Date(loginAtMs).toISOString()),
    loginAtMs,
    method: entry.method === 'account' ? 'account' : 'google',
    status: entry.status === 'replaced_other_device' ? 'replaced_other_device' : 'success',
    replacedDeviceLabel: cleanBoundedText(entry.replacedDeviceLabel, 200)
  };
}

export function deserializeLoginHistoryEntry(
  raw: Record<string, unknown> | null | undefined,
  fallbackAuthUid?: string
): LoginHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const rawLoginAt = cleanBoundedText(raw.loginAt, 64);
  const parsedMs = Number(raw.loginAtMs) || Date.parse(rawLoginAt);
  if (!Number.isFinite(parsedMs) || parsedMs <= 0) return null;

  const loginAtMs = Math.floor(parsedMs);
  const loginAt = rawLoginAt || new Date(loginAtMs).toISOString();
  const userKey = cleanBoundedText(raw.userKey || raw.username, 160, 'user');
  const deviceId = cleanBoundedText(raw.deviceId, 160, '');
  const method: LoginHistoryMethod = raw.method === 'account' ? 'account' : 'google';
  const id =
    cleanBoundedText(raw.id, 120) ||
    buildLoginHistoryEntryId({ userKey, deviceId, loginAtMs, method });
  const replacedDeviceLabel = cleanBoundedText(raw.replacedDeviceLabel, 200) || undefined;
  const status: LoginHistoryStatus =
    raw.status === 'replaced_other_device' || Boolean(replacedDeviceLabel)
      ? 'replaced_other_device'
      : 'success';
  const email = cleanBoundedText(raw.email, 200).toLowerCase() || undefined;
  const authUid = cleanBoundedText(raw.authUid || fallbackAuthUid, 128) || undefined;

  return {
    id,
    userId: cleanBoundedText(raw.userId, 160, 'user-0'),
    username: cleanBoundedText(raw.username, 160, userKey),
    fullName: cleanBoundedText(raw.fullName || raw.username, 200, 'Người dùng'),
    email,
    role: normalizeRole(raw.role),
    authUid,
    userKey,
    deviceId,
    deviceLabel: cleanBoundedText(raw.deviceLabel, 200, 'Thiết bị Web'),
    loginAt,
    loginAtMs,
    method,
    status,
    replacedDeviceLabel
  };
}

function buildLoginDedupSignature(e: LoginHistoryEntry): string {
  const actor = (e.authUid || e.email || e.userKey || e.userId).toLowerCase().trim();
  return `${actor}|${e.deviceId.trim()}|${Math.floor(e.loginAtMs / 1000)}`;
}

export function mergeLoginHistoryEntries(
  existing: readonly LoginHistoryEntry[],
  incoming: readonly LoginHistoryEntry[],
  maxItems = MAX_LOCAL_LOGIN_HISTORY
): LoginHistoryEntry[] {
  const byId = new Map<string, LoginHistoryEntry>();
  const bySig = new Map<string, string>();

  const upsert = (entry: LoginHistoryEntry) => {
    if (!entry || !entry.id || !Number.isFinite(entry.loginAtMs) || entry.loginAtMs <= 0) return;
    const sig = buildLoginDedupSignature(entry);
    const existingIdForSig = bySig.get(sig);
    const targetKey = byId.has(entry.id) ? entry.id : existingIdForSig || entry.id;
    const prev = byId.get(targetKey);
    if (!prev) {
      byId.set(targetKey, entry);
      bySig.set(sig, targetKey);
      return;
    }

    const preferIncoming = entry.loginAtMs >= prev.loginAtMs;
    const merged: LoginHistoryEntry = {
      id: preferIncoming ? entry.id : prev.id,
      userId: (preferIncoming ? entry.userId : prev.userId) || prev.userId || entry.userId,
      username: (preferIncoming ? entry.username : prev.username) || prev.username || entry.username,
      fullName: (preferIncoming ? entry.fullName : prev.fullName) || prev.fullName || entry.fullName,
      email: entry.email || prev.email,
      role: preferIncoming ? entry.role : prev.role,
      authUid: entry.authUid || prev.authUid,
      userKey: (preferIncoming ? entry.userKey : prev.userKey) || prev.userKey || entry.userKey,
      deviceId: entry.deviceId || prev.deviceId,
      deviceLabel:
        (entry.deviceLabel && entry.deviceLabel !== 'Thiết bị Web' ? entry.deviceLabel : prev.deviceLabel) ||
        entry.deviceLabel ||
        'Thiết bị Web',
      loginAt: preferIncoming ? entry.loginAt : prev.loginAt,
      loginAtMs: Math.max(prev.loginAtMs, entry.loginAtMs),
      method: entry.method === 'google' || prev.method === 'google' ? 'google' : 'account',
      status:
        entry.status === 'replaced_other_device' || prev.status === 'replaced_other_device'
          ? 'replaced_other_device'
          : 'success',
      replacedDeviceLabel: entry.replacedDeviceLabel || prev.replacedDeviceLabel
    };

    if (targetKey !== merged.id) {
      byId.delete(targetKey);
    }
    byId.set(merged.id, merged);
    bySig.set(sig, merged.id);
  };

  for (let i = 0; i < existing.length; i++) {
    upsert(existing[i]);
  }
  for (let i = 0; i < incoming.length; i++) {
    upsert(incoming[i]);
  }

  return Array.from(byId.values())
    .sort((a, b) => b.loginAtMs - a.loginAtMs)
    .slice(0, Math.max(1, maxItems));
}

export function getGmt7IsoDate(isoOrMs: string | number): string {
  const ms = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(String(isoOrMs));
  if (!Number.isFinite(ms)) return '';
  const gmt7 = new Date(ms + 7 * 60 * 60 * 1000);
  const yyyy = gmt7.getUTCFullYear();
  const mm = String(gmt7.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(gmt7.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatLoginHistoryGmt7(isoOrMs: string | number): {
  time: string;
  date: string;
  full: string;
} {
  const formatted = formatGmt7TimeAndDate(isoOrMs);
  if (!formatted) {
    return { time: '--:--', date: '--/--/----', full: '-' };
  }
  return {
    time: formatted.time,
    date: formatted.date,
    full: `${formatted.time} (GMT+7), ${formatted.date}`
  };
}

export function enrichLoginHistoryEntriesWithUsers(
  entries: readonly LoginHistoryEntry[],
  users: readonly User[]
): LoginHistoryEntry[] {
  if (entries.length === 0 || users.length === 0) return [...entries];
  return entries.map((e) => {
    const matched = users.find(
      (u) =>
        (e.authUid && u.authUid && u.authUid === e.authUid) ||
        (e.userId && u.id === e.userId) ||
        (e.email && u.email && u.email.trim().toLowerCase() === e.email.trim().toLowerCase()) ||
        (e.username && u.username.normalize('NFC').toLowerCase() === e.username.normalize('NFC').toLowerCase())
    );
    if (!matched) return e;
    return {
      ...e,
      fullName: matched.fullName || e.fullName,
      username: matched.username || e.username,
      email: e.email || matched.email,
      role: matched.role || e.role,
      authUid: e.authUid || matched.authUid
    };
  });
}

export interface LoginHistoryFilterParams {
  search?: string;
  role?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}

export function filterLoginHistoryEntries(
  entries: readonly LoginHistoryEntry[],
  filter: LoginHistoryFilterParams
): LoginHistoryEntry[] {
  const q = (filter.search || '').normalize('NFC').trim().toLowerCase();
  const role = filter.role && filter.role !== 'all' ? filter.role : '';
  const userId = filter.userId && filter.userId !== 'all' ? filter.userId : '';
  const startDate = (filter.startDate || '').trim();
  const endDate = (filter.endDate || '').trim();

  return entries.filter((e) => {
    if (role && e.role !== role) return false;
    if (userId) {
      const sameUser =
        e.userId === userId ||
        e.userKey === userId ||
        (e.email && e.email.toLowerCase() === userId.toLowerCase());
      if (!sameUser) return false;
    }
    if (startDate || endDate) {
      const d = getGmt7IsoDate(e.loginAtMs || e.loginAt);
      if (!d) return false;
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
    }
    if (q) {
      const hit =
        e.fullName.normalize('NFC').toLowerCase().includes(q) ||
        e.username.normalize('NFC').toLowerCase().includes(q) ||
        (e.email || '').toLowerCase().includes(q) ||
        e.deviceLabel.normalize('NFC').toLowerCase().includes(q) ||
        (e.replacedDeviceLabel || '').normalize('NFC').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
}
