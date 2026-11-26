import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { InventoryStockRecord, User } from '../types/inventory';
import {
  buildLoginHistoryEntryId,
  createLoginHistoryEntry,
  deserializeLoginHistoryEntry,
  enrichLoginHistoryEntriesWithUsers,
  filterLoginHistoryEntries,
  formatLoginHistoryGmt7,
  mergeLoginHistoryEntries,
  sanitizeLoginHistoryEntryForCloud
} from './loginHistory';

const SAMPLE_ADMIN: User = {
  id: 'user-admin-01',
  username: 'Võ Dương Phú',
  fullName: 'Võ Dương Phú (Tổng Quản Trị)',
  role: 'admin',
  email: 'voduongphu@gmail.com',
  authUid: 'uid-admin-123',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z'
};

const SAMPLE_STAFF: User = {
  id: 'user-staff-01',
  username: 'nguyenvanan',
  fullName: 'Nguyễn Văn An',
  role: 'staff',
  email: 'an.nv@gmail.com',
  authUid: 'uid-staff-456',
  isActive: true,
  createdAt: '2026-02-01T00:00:00Z'
};

test('createLoginHistoryEntry builds deterministic id and preserves replaced device status', () => {
  const loginAt = '2026-11-26T02:15:00.000Z';
  const loginAtMs = Date.parse(loginAt);

  const e1 = createLoginHistoryEntry({
    user: SAMPLE_STAFF,
    userKey: 'nguyenvanan',
    deviceId: 'dev-chrome-1',
    deviceLabel: 'Chrome • Windows',
    loginAt,
    loginAtMs,
    method: 'google'
  });

  const e2 = createLoginHistoryEntry({
    user: SAMPLE_STAFF,
    userKey: 'nguyenvanan',
    deviceId: 'dev-chrome-1',
    deviceLabel: 'Chrome • Windows',
    loginAt,
    loginAtMs,
    method: 'google',
    replacedDeviceLabel: 'Safari • iPhone'
  });

  assert.equal(e1.id, e2.id);
  assert.equal(e1.status, 'success');
  assert.equal(e2.status, 'replaced_other_device');
  assert.equal(e2.replacedDeviceLabel, 'Safari • iPhone');
  assert.equal(
    e1.id,
    buildLoginHistoryEntryId({
      userKey: 'nguyenvanan',
      deviceId: 'dev-chrome-1',
      loginAtMs,
      method: 'google'
    })
  );
});

test('mergeLoginHistoryEntries deduplicates, enriches, sorts newest-first, and enforces cap', () => {
  const older = createLoginHistoryEntry({
    user: { ...SAMPLE_STAFF, email: undefined },
    userKey: 'nguyenvanan',
    deviceId: 'dev-1',
    deviceLabel: 'Thiết bị Web',
    loginAt: '2026-11-25T01:00:00.000Z',
    loginAtMs: Date.parse('2026-11-25T01:00:00.000Z')
  });

  const olderRicher = createLoginHistoryEntry({
    user: SAMPLE_STAFF,
    userKey: 'nguyenvanan',
    deviceId: 'dev-1',
    deviceLabel: 'Chrome • Windows',
    loginAt: '2026-11-25T01:00:00.000Z',
    loginAtMs: Date.parse('2026-11-25T01:00:00.000Z')
  });

  const newer = createLoginHistoryEntry({
    user: SAMPLE_ADMIN,
    userKey: 'voduongphu@gmail.com',
    deviceId: 'dev-2',
    deviceLabel: 'Edge • Windows',
    loginAt: '2026-11-26T04:00:00.000Z',
    loginAtMs: Date.parse('2026-11-26T04:00:00.000Z')
  });

  const merged = mergeLoginHistoryEntries([older], [olderRicher, newer], 10);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].userId, SAMPLE_ADMIN.id);
  assert.equal(merged[1].email, 'an.nv@gmail.com');
  assert.equal(merged[1].deviceLabel, 'Chrome • Windows');

  const capped = mergeLoginHistoryEntries(merged, [], 1);
  assert.equal(capped.length, 1);
  assert.equal(capped[0].userId, SAMPLE_ADMIN.id);
});

test('sanitizeLoginHistoryEntryForCloud and deserializeLoginHistoryEntry round-trip cleanly', () => {
  const entry = createLoginHistoryEntry({
    user: SAMPLE_STAFF,
    userKey: 'nguyenvanan',
    deviceId: 'dev-9',
    deviceLabel: 'Chrome • macOS',
    loginAt: '2026-11-26T03:00:00.000Z',
    loginAtMs: Date.parse('2026-11-26T03:00:00.000Z'),
    replacedDeviceLabel: 'Chrome • Android'
  });

  const cloudMap = sanitizeLoginHistoryEntryForCloud(entry);
  assert.ok(Object.keys(cloudMap).length <= 24);
  const restored = deserializeLoginHistoryEntry(cloudMap);
  assert.ok(restored);
  assert.equal(restored.id, entry.id);
  assert.equal(restored.email, 'an.nv@gmail.com');
  assert.equal(restored.status, 'replaced_other_device');
  assert.equal(restored.replacedDeviceLabel, 'Chrome • Android');
});

test('formatLoginHistoryGmt7 converts UTC timestamps to GMT+7 accurately', () => {
  // 2026-11-25 18:30 UTC -> 2026-11-26 01:30 GMT+7
  const res = formatLoginHistoryGmt7('2026-11-25T18:30:00.000Z');
  assert.equal(res.time, '01:30');
  assert.equal(res.date, '26/11/2026');
  assert.equal(res.full, '01:30 (GMT+7), 26/11/2026');
});

test('filterLoginHistoryEntries filters by search, role, userId, and GMT+7 date range', () => {
  const e1 = createLoginHistoryEntry({
    user: SAMPLE_ADMIN,
    userKey: 'voduongphu@gmail.com',
    deviceId: 'dev-a',
    deviceLabel: 'Chrome • Windows',
    loginAt: '2026-11-25T18:30:00.000Z' // 2026-11-26 01:30 GMT+7
  });
  const e2 = createLoginHistoryEntry({
    user: SAMPLE_STAFF,
    userKey: 'nguyenvanan',
    deviceId: 'dev-s',
    deviceLabel: 'Safari • iPhone',
    loginAt: '2026-11-24T10:00:00.000Z' // 2026-11-24 17:00 GMT+7
  });

  const all = enrichLoginHistoryEntriesWithUsers([e1, e2], [SAMPLE_ADMIN, SAMPLE_STAFF]);
  assert.equal(filterLoginHistoryEntries(all, { search: 'iphone' }).length, 1);
  assert.equal(filterLoginHistoryEntries(all, { role: 'admin' }).length, 1);
  assert.equal(filterLoginHistoryEntries(all, { userId: SAMPLE_STAFF.id }).length, 1);
  assert.equal(filterLoginHistoryEntries(all, { startDate: '2026-11-26', endDate: '2026-11-26' }).length, 1);
  assert.equal(filterLoginHistoryEntries(all, { startDate: '2026-11-24', endDate: '2026-11-25' }).length, 1);
});

test('InventoryReport hides drawing name in table rows while keeping drawing search UI', () => {
  const reportContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/reports/InventoryReport.tsx'),
    'utf8'
  );
  assert.equal(reportContent.includes('<span>Bản vẽ:</span>'), false);
  assert.equal(reportContent.includes('list="dwg-list"'), true);
  assert.equal(reportContent.includes('Bản vẽ (DWG No)'), true);
  assert.equal(reportContent.includes('drawingNo: defDrawingNo || undefined'), true);

  // Also verify stock attribute filtering matches drawingNo directly
  const sampleRecord: InventoryStockRecord = {
    id: 'rec-1',
    warehouseId: 'wh-1',
    warehouseName: 'Kho LP1',
    materialCode: 'VT-01',
    materialName: 'Van bi DN100',
    unit: 'Cái',
    packingListNo: 'PL-01',
    shipment: 'SHP-01',
    manufacturer: 'Kitz',
    supplier: 'ABC',
    packageNo: 'PKG-01',
    packageName: 'Kiện 1',
    category: 'Đường ống',
    drawingNo: 'DWG-PID-9988',
    currentQuantity: 10,
    currentWeightKg: 50,
    inboundQuantity: 10,
    inboundWeightKg: 50,
    returnInboundQuantity: 0,
    returnInboundWeightKg: 0,
    outboundQuantity: 0,
    outboundWeightKg: 0,
    transferOutboundQuantity: 0,
    transferOutboundWeightKg: 0,
    lastUpdated: '2026-11-26'
  };
  assert.equal(sampleRecord.drawingNo.toLowerCase().includes('pid-9988'), true);
});
