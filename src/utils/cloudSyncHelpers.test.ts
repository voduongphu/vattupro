import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeUsersDomainDigest,
  computeWarehousesDomainDigest,
  computeTombstonesDomainDigest,
  computeOsdDomainDigest,
  computeInboundDomainDigest,
  computeOutboundDomainDigest,
  encodeMetaDigestV2,
  parseMetaDigestV2,
  buildStableReceiptIndexChunks,
  diffChunkDigests,
  computeDomainSyncPlan
} from './cloudSyncHelpers.ts';
import type { User, InboundReceipt } from '../types/inventory.ts';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    username: 'staff1',
    fullName: 'Nhân viên 1',
    role: 'staff',
    password: 'hash',
    department: 'Kho',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: 1000,
    ...overrides
  };
}

function makeInbound(index: number, note = ''): InboundReceipt {
  return {
    id: `in-${index}`,
    receiptCode: `PN-LP-2026-${String(index).padStart(4, '0')}`,
    receiptDate: '2026-03-01',
    warehouseId: 'wh-1',
    warehouseName: 'Kho Long Phú',
    supplier: 'NCC A',
    shipment: 'SH-1',
    packingListNo: 'PL-1',
    delivererName: 'A',
    receiverName: 'B',
    items: [],
    packageCount: 1,
    totalQuantity: 10,
    totalWeightKg: 5,
    totalAmount: 1000,
    notes: note,
    createdAt: '2026-03-01T00:00:00Z',
    createdBy: 'admin',
    updatedAt: 1000 + index
  };
}

describe('cloudSyncHelpers', () => {
  it('encodeMetaDigestV2 fits <= 128 chars and round-trips cleanly', () => {
    const users = [makeUser({ id: 'u1', username: 'admin', role: 'admin', allowedWarehouseIds: ['wh-1'] })];
    const parts = {
      u: computeUsersDomainDigest(users),
      w: computeWarehousesDomainDigest([]),
      t: computeTombstonesDomainDigest({
        inbound: {},
        outbound: {},
        materials: {},
        warehouses: {},
        users: {},
        osd: {}
      }),
      o: computeOsdDomainDigest([]),
      in: computeInboundDomainDigest([makeInbound(1)]),
      out: computeOutboundDomainDigest([])
    };

    const encoded = encodeMetaDigestV2(parts);
    assert.ok(encoded.startsWith('v2:'), 'must start with v2:');
    assert.ok(encoded.length <= 128, `length ${encoded.length} exceeds 128`);

    const parsed = parseMetaDigestV2(encoded);
    assert.deepEqual(parsed, parts);
    assert.equal(parseMetaDigestV2('1.0.0:0:0:0'), null);
  });

  it('converges users digest regardless of PII fields or warehouse array ordering', () => {
    const adminStaffView = makeUser({
      id: 'u2',
      username: 'nv_a',
      emailDigest: 'abc123',
      allowedWarehouseIds: ['wh-2', 'wh-1']
    });
    const adminFullView = makeUser({
      id: 'u2',
      username: 'nv_a',
      email: 'nva@example.com',
      phone: '0909123456',
      emailDigest: 'abc123',
      allowedWarehouseIds: ['wh-1', 'wh-2']
    });

    assert.equal(
      computeUsersDomainDigest([adminStaffView]),
      computeUsersDomainDigest([adminFullView])
    );
  });

  it('computeDomainSyncPlan isolates pulls/pushes to only the changed domain', () => {
    const baseDigests = {
      u: '3.a1.b1',
      w: '2.a2.b2',
      t: '5.a3.b3',
      o: '10.a4.b4',
      in: '50.a5.b5',
      out: '40.a6.b6',
      materials: '200:c1:c2:c3'
    };
    const remoteMetaDigest = encodeMetaDigestV2({
      u: baseDigests.u,
      w: baseDigests.w,
      t: baseDigests.t,
      o: '11.changed.osd',
      in: baseDigests.in,
      out: baseDigests.out
    });

    const plan = computeDomainSyncPlan({
      remoteMetaDigest,
      remoteMaterialsDigest: baseDigests.materials,
      remoteCounts: {
        accountChunkCount: 1,
        warehouseChunkCount: 1,
        tombstoneChunkCount: 1,
        inboundIndexChunkCount: 1,
        outboundIndexChunkCount: 1,
        materialsChunkCount: 1
      },
      localDigests: baseDigests,
      localCounts: {
        users: 3,
        warehouses: 2,
        inbound: 50,
        outbound: 40,
        materials: 200
      },
      dirty: {
        users: false,
        warehouses: false,
        tombstones: false,
        osd: false,
        inbound: false,
        outbound: false,
        materials: false
      },
      adminMissingPii: false,
      checkpointMatchesServer: false
    });

    assert.equal(plan.isLegacyRemoteDigest, false);
    assert.equal(plan.pullOsd, true);
    assert.equal(plan.osdRemoteCount, 11);
    assert.equal(plan.pullUsers, false);
    assert.equal(plan.pullWarehouses, false);
    assert.equal(plan.pullTombstones, false);
    assert.equal(plan.pullInbound, false);
    assert.equal(plan.pullOutbound, false);
    assert.equal(plan.pullMaterials, false);
    assert.equal(plan.anyWorkNeeded, true);

    const idlePlan = computeDomainSyncPlan({
      remoteMetaDigest: encodeMetaDigestV2(baseDigests),
      remoteMaterialsDigest: baseDigests.materials,
      remoteCounts: {
        accountChunkCount: 1,
        warehouseChunkCount: 1,
        tombstoneChunkCount: 1,
        inboundIndexChunkCount: 1,
        outboundIndexChunkCount: 1,
        materialsChunkCount: 1
      },
      localDigests: baseDigests,
      localCounts: {
        users: 3,
        warehouses: 2,
        inbound: 50,
        outbound: 40,
        materials: 200
      },
      dirty: {
        users: false,
        warehouses: false,
        tombstones: false,
        osd: false,
        inbound: false,
        outbound: false,
        materials: false
      },
      adminMissingPii: false,
      checkpointMatchesServer: true
    });
    assert.equal(idlePlan.anyWorkNeeded, false);
  });

  it('buildStableReceiptIndexChunks + diffChunkDigests only dirties 1 chunk on single edit or tail append', () => {
    const entries = new Map<string, { code: string; appUpdatedAt: number; digest: string }>();
    for (let i = 0; i < 500; i++) {
      const code = `PN-${String(i).padStart(4, '0')}`;
      entries.set(code, { code, appUpdatedAt: 1000 + i, digest: `d-${i}` });
    }

    const initial = buildStableReceiptIndexChunks(entries, new Map(), 200);
    assert.equal(initial.chunks.length, 3);
    const baseline = diffChunkDigests(initial.chunks, {}, 'in_idx_', 0);
    assert.deepEqual(baseline.dirtyIndices, [0, 1, 2]);

    // Edit 1 entry located in chunk 0
    const firstCode = initial.chunks[0][5].code;
    entries.set(firstCode, { code: firstCode, appUpdatedAt: 9999, digest: 'd-edited' });
    const afterEdit = buildStableReceiptIndexChunks(entries, initial.nextChunkIndexByCode, 200);
    const editDiff = diffChunkDigests(afterEdit.chunks, baseline.nextDigests, 'in_idx_', 3);
    assert.deepEqual(editDiff.dirtyIndices, [0]);

    // Append 1 brand new entry -> only tail chunk (index 2) is dirty
    entries.set('PN-9999', { code: 'PN-9999', appUpdatedAt: 10000, digest: 'd-new' });
    const afterAdd = buildStableReceiptIndexChunks(entries, afterEdit.nextChunkIndexByCode, 200);
    const addDiff = diffChunkDigests(afterAdd.chunks, editDiff.nextDigests, 'in_idx_', 3);
    assert.deepEqual(addDiff.dirtyIndices, [2]);
  });

  it('diffChunkDigests for 600 materials only dirties 1 chunk when 1 item changes', () => {
    const makeChunks = (modifiedIdx: number) => {
      const items = Array.from({ length: 600 }, (_, i) => ({
        id: `m-${i}`,
        code: `VT-${i}`,
        name: i === modifiedIdx ? 'Edited Material' : `Material ${i}`
      }));
      return [items.slice(0, 200), items.slice(200, 400), items.slice(400, 600)];
    };

    const chunksA = makeChunks(-1);
    const base = diffChunkDigests(chunksA, {}, 'mat_', 0);
    assert.deepEqual(base.dirtyIndices, [0, 1, 2]);

    const chunksB = makeChunks(250); // inside chunk 1
    const diff = diffChunkDigests(chunksB, base.nextDigests, 'mat_', 3);
    assert.deepEqual(diff.dirtyIndices, [1]);
  });
});
