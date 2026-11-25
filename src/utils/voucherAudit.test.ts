import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '../types/inventory.ts';
import {
  buildVoucherLastModifiedSummary,
  formatGmt7TimeAndDate,
  getCurrentUserIdentifier,
  resolveActorUserCode
} from './voucherAudit.ts';

const SAMPLE_USERS: User[] = [
  {
    id: 'u-1',
    username: '@phu.vduong',
    fullName: 'Võ Dương Phú',
    email: 'phu.vduong@ptsc.com.vn',
    role: 'admin',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'u-2',
    username: '@kho.dungquat',
    fullName: 'Nguyễn Văn Kho',
    email: 'kho@ptsc.com.vn',
    role: 'staff',
    isActive: true,
    createdAt: '2026-01-02T00:00:00.000Z'
  }
];

describe('voucherAudit', () => {
  it('prefers username identifier when recording current user', () => {
    assert.equal(getCurrentUserIdentifier(SAMPLE_USERS[0]), '@phu.vduong');
    assert.equal(getCurrentUserIdentifier(null), '');
  });

  it('resolves legacy fullName, email, or id back to internal user code', () => {
    assert.equal(resolveActorUserCode('Võ Dương Phú', SAMPLE_USERS), '@phu.vduong');
    assert.equal(resolveActorUserCode('kho@ptsc.com.vn', SAMPLE_USERS), '@kho.dungquat');
    assert.equal(resolveActorUserCode('@kho.dungquat', SAMPLE_USERS), '@kho.dungquat');
    assert.equal(resolveActorUserCode('', SAMPLE_USERS), 'Hệ thống');
  });

  it('formats timestamps strictly in GMT+7 regardless of system timezone', () => {
    // 2026-11-25T01:35:00.000Z -> 08:35 on 25/11/2026 in GMT+7
    assert.deepEqual(formatGmt7TimeAndDate('2026-11-25T01:35:00.000Z'), {
      time: '08:35',
      date: '25/11/2026'
    });
    // Cross-day boundary: 2026-11-25T18:05:00.000Z -> 01:05 on 26/11/2026 in GMT+7
    assert.deepEqual(formatGmt7TimeAndDate('2026-11-25T18:05:00.000Z'), {
      time: '01:05',
      date: '26/11/2026'
    });
  });

  it('builds last-modified summary preferring lastEditedAt over createdAt', () => {
    const edited = buildVoucherLastModifiedSummary({
      createdBy: '@kho.dungquat',
      createdAt: '2026-11-24T01:00:00.000Z',
      lastEditedBy: 'Võ Dương Phú',
      lastEditedAt: '2026-11-25T02:15:00.000Z',
      users: SAMPLE_USERS
    });
    assert.ok(edited);
    assert.equal(edited.isEdited, true);
    assert.equal(edited.userCode, '@phu.vduong');
    assert.equal(
      edited.message,
      'Lần sửa đổi gần nhất từ @phu.vduong, vào lúc: 09:15 (GMT+7), 25/11/2026'
    );

    const createdOnly = buildVoucherLastModifiedSummary({
      createdBy: 'Nguyễn Văn Kho',
      createdAt: '2026-11-24T01:05:00.000Z',
      users: SAMPLE_USERS
    });
    assert.ok(createdOnly);
    assert.equal(createdOnly.isEdited, false);
    assert.equal(
      createdOnly.message,
      'Lần sửa đổi gần nhất từ @kho.dungquat, vào lúc: 08:05 (GMT+7), 24/11/2026'
    );
  });
});
