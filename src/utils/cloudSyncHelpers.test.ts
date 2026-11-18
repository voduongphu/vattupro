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
  computeDomainSyncPlan,
  createEmptyPendingOutbox,
  sanitizePendingOutbox,
  mergePendingOutboxMutation,
  clearPendingOutboxDomains,
  hasAnyPendingOutbox,
  hasRemoteManifestChanged,
  computeLoginMetaPullFlags,
  resolveManifestTransactionUpdate,
  withAsyncTimeout,
  shouldRunLocalBridgeAfterCloud,
  shouldQueueReconcileDuringAuthTransition,
  evaluatePreSyncCheck,
  resolveConvergedCheckpointDigests,
  type ManifestSnapshotLike
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

  it('persistent outbox helpers merge, sanitize, check, and selectively clear domains', () => {
    const empty = createEmptyPendingOutbox();
    assert.equal(hasAnyPendingOutbox(empty), false);

    let outbox = mergePendingOutboxMutation(empty, 'meta', ['wh-1'], { warehouses: true }, 1000);
    outbox = mergePendingOutboxMutation(outbox, 'inbound', ['pn-01'], { tombstones: true }, 2000);
    outbox = mergePendingOutboxMutation(outbox, 'materials', ['vt-01'], undefined, 3000);

    assert.equal(hasAnyPendingOutbox(outbox), true);
    assert.equal(outbox.warehouses, true);
    assert.equal(outbox.users, false);
    assert.equal(outbox.inbound, true);
    assert.equal(outbox.tombstones, true);
    assert.equal(outbox.materials, true);
    assert.deepEqual(outbox.warehouseIds, ['wh-1']);
    assert.deepEqual(outbox.inboundCodes, ['PN-01']);
    assert.deepEqual(outbox.materialCodes, ['VT-01']);
    assert.equal(outbox.updatedAtMs, 3000);

    const sanitized = sanitizePendingOutbox(JSON.parse(JSON.stringify(outbox)));
    assert.deepEqual(sanitized, outbox);
    assert.deepEqual(sanitizePendingOutbox(null), empty);

    const partiallyCleared = clearPendingOutboxDomains(
      outbox,
      { warehouses: true, tombstones: true },
      4000
    );
    assert.equal(partiallyCleared.warehouses, false);
    assert.deepEqual(partiallyCleared.warehouseIds, []);
    assert.equal(partiallyCleared.tombstones, false);
    assert.equal(partiallyCleared.inbound, true);
    assert.equal(partiallyCleared.materials, true);
    assert.equal(hasAnyPendingOutbox(partiallyCleared), true);

    const fullyCleared = clearPendingOutboxDomains(
      partiallyCleared,
      { inbound: true, materials: true },
      5000
    );
    assert.equal(hasAnyPendingOutbox(fullyCleared), false);
  });

  it('hasRemoteManifestChanged detects both revision and same-revision digest drift', () => {
    assert.equal(
      hasRemoteManifestChanged({
        remoteServerRev: 5,
        remoteMetaDigest: 'v2:u1|w1|t1|o1|in1|out1',
        remoteMaterialsDigest: '10:a:b:c',
        lastAppliedServerRev: 5,
        lastAppliedMetaDigest: 'v2:u1|w1|t1|o1|in1|out1',
        lastAppliedMaterialsDigest: '10:a:b:c'
      }),
      false
    );

    assert.equal(
      hasRemoteManifestChanged({
        remoteServerRev: 6,
        remoteMetaDigest: 'v2:u1|w1|t1|o1|in1|out1',
        remoteMaterialsDigest: '10:a:b:c',
        lastAppliedServerRev: 5,
        lastAppliedMetaDigest: 'v2:u1|w1|t1|o1|in1|out1',
        lastAppliedMaterialsDigest: '10:a:b:c'
      }),
      true
    );

    // Same serverRevision (e.g. concurrent bump to same number) but metaDigest changed
    assert.equal(
      hasRemoteManifestChanged({
        remoteServerRev: 5,
        remoteMetaDigest: 'v2:u2|w1|t1|o1|in1|out1',
        remoteMaterialsDigest: '10:a:b:c',
        lastAppliedServerRev: 5,
        lastAppliedMetaDigest: 'v2:u1|w1|t1|o1|in1|out1',
        lastAppliedMaterialsDigest: '10:a:b:c'
      }),
      true
    );

    // Same serverRevision & metaDigest, materialsDigest changed
    assert.equal(
      hasRemoteManifestChanged({
        remoteServerRev: 5,
        remoteMetaDigest: 'v2:u1|w1|t1|o1|in1|out1',
        remoteMaterialsDigest: '11:x:y:z',
        lastAppliedServerRev: 5,
        lastAppliedMetaDigest: 'v2:u1|w1|t1|o1|in1|out1',
        lastAppliedMaterialsDigest: '10:a:b:c'
      }),
      true
    );
  });

  it('computeLoginMetaPullFlags skips unchanged accounts and tombstones on login', () => {
    const users = [
      makeUser({ id: 'admin-1', username: 'admin', role: 'admin', email: 'a@b.com', emailDigest: 'ed1' }),
      makeUser({ id: 'staff-1', username: 'staff1', role: 'staff', email: 's@b.com', emailDigest: 'ed2' })
    ];
    const emptyTombs = {
      inbound: {},
      outbound: {},
      materials: {},
      warehouses: {},
      users: {},
      osd: {}
    };
    const uDigest = computeUsersDomainDigest(users);
    const tDigest = computeTombstonesDomainDigest(emptyTombs);
    const matchingMetaDigest = encodeMetaDigestV2({
      u: uDigest,
      w: '0.0.0',
      t: tDigest,
      o: '0.0.0',
      in: '0.0.0',
      out: '0.0.0'
    });

    assert.deepEqual(
      computeLoginMetaPullFlags({
        remoteMetaDigest: matchingMetaDigest,
        accountChunkCount: 1,
        tombstoneChunkCount: 1,
        localUsers: users,
        localTombstones: emptyTombs,
        isAdmin: true
      }),
      { pullUsers: false, pullTombstones: false }
    );

    // Only tombstones changed remotely
    const tombChangedDigest = encodeMetaDigestV2({
      u: uDigest,
      w: '0.0.0',
      t: '1.abc.def',
      o: '0.0.0',
      in: '0.0.0',
      out: '0.0.0'
    });
    assert.deepEqual(
      computeLoginMetaPullFlags({
        remoteMetaDigest: tombChangedDigest,
        accountChunkCount: 1,
        tombstoneChunkCount: 1,
        localUsers: users,
        localTombstones: emptyTombs,
        isAdmin: false
      }),
      { pullUsers: false, pullTombstones: true }
    );

    // Admin missing PII triggers user pull even if digest matches
    const usersMissingPii = [
      makeUser({ id: 'admin-1', username: 'admin', role: 'admin', emailDigest: 'ed1' }),
      makeUser({ id: 'staff-1', username: 'staff1', role: 'staff', emailDigest: 'ed2' })
    ];
    assert.deepEqual(
      computeLoginMetaPullFlags({
        remoteMetaDigest: matchingMetaDigest,
        accountChunkCount: 1,
        tombstoneChunkCount: 1,
        localUsers: usersMissingPii,
        localTombstones: emptyTombs,
        isAdmin: true
      }),
      { pullUsers: true, pullTombstones: false }
    );
  });

  it('resolveManifestTransactionUpdate merges concurrent unrelated domains and rejects same-domain conflicts', () => {
    const baseManifest: ManifestSnapshotLike = {
      serverRevision: 10,
      metaRevision: 4,
      materialsRevision: 2,
      materialsCount: 50,
      materialsChunkCount: 1,
      materialsDigest: '50:m1:m2:m3',
      metaDigest: encodeMetaDigestV2({
        u: 'u1',
        w: 'w1',
        t: 't1',
        o: 'o1',
        in: 'in1',
        out: 'out1'
      }),
      accountChunkCount: 1,
      warehouseChunkCount: 1,
      tombstoneChunkCount: 1,
      inboundIndexChunkCount: 1,
      outboundIndexChunkCount: 1
    };

    // Case 1: Remote concurrently updated `outbound` (rev 10 -> 11), local only touched `inbound`
    const remoteOutboundUpdated: ManifestSnapshotLike = {
      ...baseManifest,
      serverRevision: 11,
      outboundIndexChunkCount: 2,
      metaDigest: encodeMetaDigestV2({
        u: 'u1',
        w: 'w1',
        t: 't1',
        o: 'o1',
        in: 'in1',
        out: 'out2'
      })
    };
    const mergedOutcome = resolveManifestTransactionUpdate({
      latestRemote: remoteOutboundUpdated,
      expectedBaseline: {
        serverRevision: 10,
        metaDigest: baseManifest.metaDigest,
        materialsDigest: baseManifest.materialsDigest
      },
      localUpdate: {
        touched: { inbound: true },
        metaDigest: encodeMetaDigestV2({
          u: 'u1',
          w: 'w1',
          t: 't1',
          o: 'o1',
          in: 'in2',
          out: 'out1'
        }),
        inboundIndexChunkCount: 3,
        bumpMetaRevision: false
      }
    });

    assert.equal(mergedOutcome.conflict, false);
    if (!mergedOutcome.conflict) {
      assert.equal(mergedOutcome.manifest.serverRevision, 12);
      assert.equal(mergedOutcome.manifest.inboundIndexChunkCount, 3);
      assert.equal(mergedOutcome.manifest.outboundIndexChunkCount, 2);
      const parsed = parseMetaDigestV2(mergedOutcome.manifest.metaDigest);
      assert.equal(parsed?.in, 'in2');
      assert.equal(parsed?.out, 'out2'); // Preserved remote concurrent outbound change
    }

    // Case 2: Remote concurrently updated `inbound` as well -> conflict!
    const remoteInboundUpdated: ManifestSnapshotLike = {
      ...baseManifest,
      serverRevision: 11,
      metaDigest: encodeMetaDigestV2({
        u: 'u1',
        w: 'w1',
        t: 't1',
        o: 'o1',
        in: 'in_remote',
        out: 'out1'
      })
    };
    const conflictOutcome = resolveManifestTransactionUpdate({
      latestRemote: remoteInboundUpdated,
      expectedBaseline: {
        serverRevision: 10,
        metaDigest: baseManifest.metaDigest,
        materialsDigest: baseManifest.materialsDigest
      },
      localUpdate: {
        touched: { inbound: true },
        metaDigest: encodeMetaDigestV2({
          u: 'u1',
          w: 'w1',
          t: 't1',
          o: 'o1',
          in: 'in_local',
          out: 'out1'
        }),
        inboundIndexChunkCount: 2
      }
    });
    assert.deepEqual(conflictOutcome, {
      conflict: true,
      reason: 'inbound_changed_remotely'
    });

    // Case 3: Remote concurrently updated `materials` -> conflict when local touches materials
    const matConflict = resolveManifestTransactionUpdate({
      latestRemote: {
        ...baseManifest,
        serverRevision: 11,
        materialsDigest: '51:m_new'
      },
      expectedBaseline: {
        serverRevision: 10,
        metaDigest: baseManifest.metaDigest,
        materialsDigest: baseManifest.materialsDigest
      },
      localUpdate: {
        touched: { materials: true },
        metaDigest: baseManifest.metaDigest,
        materialsDigest: '51:m_local',
        materialsCount: 51,
        materialsChunkCount: 1
      }
    });
    assert.deepEqual(matConflict, {
      conflict: true,
      reason: 'materials_changed_remotely'
    });
  });

  it('does not treat a single-user workspace with matching digest as missing local accounts', () => {
    const emptyTombs = {
      inbound: {},
      outbound: {},
      materials: {},
      warehouses: {},
      users: {},
      osd: {}
    };
    const soloAdmin = makeUser({
      id: 'user-admin',
      username: 'admin',
      role: 'admin',
      email: 'admin@example.com'
    });
    const localU = computeUsersDomainDigest([soloAdmin]);
    const remoteDigest = encodeMetaDigestV2({
      u: localU,
      w: computeWarehousesDomainDigest([]),
      t: computeTombstonesDomainDigest(emptyTombs),
      o: computeOsdDomainDigest([]),
      in: computeInboundDomainDigest([]),
      out: computeOutboundDomainDigest([])
    });

    const plan = computeDomainSyncPlan({
      remoteMetaDigest: remoteDigest,
      remoteMaterialsDigest: '0:0:0:0',
      remoteCounts: {
        accountChunkCount: 1,
        warehouseChunkCount: 0,
        tombstoneChunkCount: 0,
        inboundIndexChunkCount: 0,
        outboundIndexChunkCount: 0,
        materialsChunkCount: 0
      },
      localDigests: {
        u: localU,
        w: computeWarehousesDomainDigest([]),
        t: computeTombstonesDomainDigest(emptyTombs),
        o: computeOsdDomainDigest([]),
        in: computeInboundDomainDigest([]),
        out: computeOutboundDomainDigest([]),
        materials: '0:0:0:0'
      },
      localCounts: {
        users: 1,
        warehouses: 0,
        inbound: 0,
        outbound: 0,
        materials: 0
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
      checkpointMatchesServer: true,
      lastSyncedOsdDigest: `${computeOsdDomainDigest([])}|${computeTombstonesDomainDigest(emptyTombs)}`
    });
    assert.equal(plan.pullUsers, false);
    assert.equal(plan.anyWorkNeeded, false);

    const loginFlags = computeLoginMetaPullFlags({
      remoteMetaDigest: remoteDigest,
      accountChunkCount: 1,
      tombstoneChunkCount: 0,
      localUsers: [soloAdmin],
      localTombstones: emptyTombs,
      isAdmin: true
    });
    assert.equal(loginFlags.pullUsers, false);
  });

  it('withAsyncTimeout resolves before deadline and rejects stalled promises', async () => {
    const fast = await withAsyncTimeout(Promise.resolve('ok'), 200, 'timed out');
    assert.equal(fast, 'ok');

    const never = new Promise<string>(() => {});
    await assert.rejects(
      () => withAsyncTimeout(never, 20, 'stalled_mobile_socket'),
      /stalled_mobile_socket/
    );
  });

  it('shouldRunLocalBridgeAfterCloud skips local /api/sync when Cloud succeeds with 0 delta', () => {
    assert.equal(
      shouldRunLocalBridgeAfterCloud({
        skipLocalServer: false,
        cloudSuccess: true,
        pulledChanges: false,
        pushedChanges: false,
        hasCompletedInitialLocalSync: false
      }),
      false
    );
    assert.equal(
      shouldRunLocalBridgeAfterCloud({
        skipLocalServer: false,
        cloudSuccess: true,
        pulledChanges: true,
        pushedChanges: false,
        hasCompletedInitialLocalSync: true
      }),
      true
    );
    assert.equal(
      shouldRunLocalBridgeAfterCloud({
        skipLocalServer: true,
        cloudSuccess: true,
        pulledChanges: true,
        pushedChanges: true,
        hasCompletedInitialLocalSync: false
      }),
      false
    );
    assert.equal(
      shouldRunLocalBridgeAfterCloud({
        skipLocalServer: false,
        cloudSuccess: false,
        pulledChanges: false,
        pushedChanges: false,
        hasCompletedInitialLocalSync: false
      }),
      true
    );
  });

  it('shouldQueueReconcileDuringAuthTransition queues only local mutations or forced refreshes', () => {
    assert.equal(shouldQueueReconcileDuringAuthTransition({ trigger: 'remote' }), false);
    assert.equal(shouldQueueReconcileDuringAuthTransition({ trigger: 'startup' }), false);
    assert.equal(shouldQueueReconcileDuringAuthTransition({ trigger: 'mutation' }), true);
    assert.equal(
      shouldQueueReconcileDuringAuthTransition({ trigger: 'remote', forceManifestRefresh: true }),
      true
    );
  });

  it('evaluatePreSyncCheck gates sync cycle and spinner using lastSyncTimestamp', () => {
    // 1. Neither local nor remote changed since lastSyncTimestamp -> skip without spinning
    const idleRes = evaluatePreSyncCheck({
      lastSyncTimestamp: 5000,
      lastLocalMutationTimestamp: 4500,
      hasLocalDirtyFlags: false,
      hasRemoteManifestChanges: false,
      remoteUpdatedAtMs: 4900,
      forceCheckRemote: false
    });
    assert.equal(idleRes.shouldProceedWithSync, false);
    assert.equal(idleRes.shouldSpinImmediately, false);
    assert.equal(idleRes.reason, 'no_changes_since_last_sync');

    // 2. Manual/startup forced check with no known diff -> check silently without spinning upfront
    const forcedQuiet = evaluatePreSyncCheck({
      lastSyncTimestamp: 5000,
      lastLocalMutationTimestamp: 5000,
      hasLocalDirtyFlags: false,
      hasRemoteManifestChanges: false,
      remoteUpdatedAtMs: 5000,
      forceCheckRemote: true
    });
    assert.equal(forcedQuiet.shouldProceedWithSync, true);
    assert.equal(forcedQuiet.shouldSpinImmediately, false);
    assert.equal(forcedQuiet.reason, 'forced_remote_check_silently');

    // 3. Initial sync (lastSyncTimestamp === 0) -> proceed silently until actual diff is detected
    const initialQuiet = evaluatePreSyncCheck({
      lastSyncTimestamp: 0,
      lastLocalMutationTimestamp: 0,
      hasLocalDirtyFlags: false,
      hasRemoteManifestChanges: false
    });
    assert.equal(initialQuiet.shouldProceedWithSync, true);
    assert.equal(initialQuiet.shouldSpinImmediately, false);
    assert.equal(initialQuiet.reason, 'initial_sync_check_silently');

    // 4. Local mutation newer than lastSyncTimestamp -> proceed AND spin immediately
    const localMutated = evaluatePreSyncCheck({
      lastSyncTimestamp: 5000,
      lastLocalMutationTimestamp: 5200,
      hasLocalDirtyFlags: false
    });
    assert.equal(localMutated.shouldProceedWithSync, true);
    assert.equal(localMutated.shouldSpinImmediately, true);
    assert.equal(localMutated.localChangedSinceLastSync, true);
    assert.equal(localMutated.reason, 'local_mutation_after_last_sync');

    // 5. Dirty flags set -> proceed AND spin immediately
    const dirtyRes = evaluatePreSyncCheck({
      lastSyncTimestamp: 5000,
      lastLocalMutationTimestamp: 4000,
      hasLocalDirtyFlags: true
    });
    assert.equal(dirtyRes.shouldProceedWithSync, true);
    assert.equal(dirtyRes.shouldSpinImmediately, true);
    assert.equal(dirtyRes.reason, 'local_dirty');

    // 6. Remote server updatedAt newer than lastSyncTimestamp -> proceed AND spin immediately
    const remoteNewer = evaluatePreSyncCheck({
      lastSyncTimestamp: 5000,
      lastLocalMutationTimestamp: 4000,
      hasLocalDirtyFlags: false,
      remoteUpdatedAtMs: 5500
    });
    assert.equal(remoteNewer.shouldProceedWithSync, true);
    assert.equal(remoteNewer.shouldSpinImmediately, true);
    assert.equal(remoteNewer.remoteChangedSinceLastSync, true);
    assert.equal(remoteNewer.reason, 'remote_newer_than_last_sync');

    // 7. Remote manifest revision/digest drift -> proceed AND spin immediately
    const manifestDrift = evaluatePreSyncCheck({
      lastSyncTimestamp: 5000,
      lastLocalMutationTimestamp: 4000,
      hasLocalDirtyFlags: false,
      hasRemoteManifestChanges: true
    });
    assert.equal(manifestDrift.shouldProceedWithSync, true);
    assert.equal(manifestDrift.shouldSpinImmediately, true);
    assert.equal(manifestDrift.reason, 'remote_manifest_changed');
  });

  it('resolveConvergedCheckpointDigests prevents infinite pull loops while preserving accurate local dirty detection', () => {
    const remoteMeta = encodeMetaDigestV2({
      u: 'u_remote',
      w: 'w_remote',
      t: 't_remote',
      o: 'o_remote',
      in: 'in_remote',
      out: 'out_remote'
    });
    const localMetaAfterAdditiveMerge = encodeMetaDigestV2({
      u: 'u_local_plus_extra',
      w: 'w_remote',
      t: 't_remote',
      o: 'o_local_plus_extra',
      in: 'in_local_extra',
      out: 'out_remote'
    });

    // Case 1: manifest did NOT mutate (additive merge left local slightly different from remote),
    // non-dirty domains must converge remoteSyncedMetaDigest/remoteSyncedMaterialsDigest to remote
    // so next reconcile pass won't detect false remote diffs and loop forever, while localMetaDigest
    // remains the true local snapshot so offline local changes are still detected accurately.
    const noMutateConverged = resolveConvergedCheckpointDigests({
      manifestMutated: false,
      remoteMetaDigest: remoteMeta,
      remoteMaterialsDigest: '50:mat_remote',
      finalLocalMetaDigest: localMetaAfterAdditiveMerge,
      finalLocalMaterialsDigest: '52:mat_local_merged',
      dirty: {
        users: false,
        warehouses: false,
        tombstones: false,
        osd: false,
        inbound: false,
        outbound: false,
        materials: false
      }
    });
    assert.equal(noMutateConverged.localMetaDigest, localMetaAfterAdditiveMerge);
    assert.equal(noMutateConverged.localMaterialsDigest, '52:mat_local_merged');
    assert.equal(noMutateConverged.remoteSyncedMetaDigest, remoteMeta);
    assert.equal(noMutateConverged.remoteSyncedMaterialsDigest, '50:mat_remote');

    // Case 2: manifest DID mutate on push -> both local & remoteSynced use committed digests
    const committedMeta = encodeMetaDigestV2({
      u: 'u_committed',
      w: 'w_committed',
      t: 't_committed',
      o: 'o_committed',
      in: 'in_committed',
      out: 'out_committed'
    });
    const mutatedConverged = resolveConvergedCheckpointDigests({
      manifestMutated: true,
      committedMetaDigest: committedMeta,
      committedMaterialsDigest: '60:mat_committed',
      remoteMetaDigest: remoteMeta,
      remoteMaterialsDigest: '50:mat_remote',
      finalLocalMetaDigest: committedMeta,
      finalLocalMaterialsDigest: '60:mat_committed',
      dirty: {
        users: false,
        warehouses: false,
        tombstones: false,
        osd: false,
        inbound: true,
        outbound: false,
        materials: true
      }
    });
    assert.equal(mutatedConverged.localMetaDigest, committedMeta);
    assert.equal(mutatedConverged.remoteSyncedMetaDigest, committedMeta);
    assert.equal(mutatedConverged.remoteSyncedMaterialsDigest, '60:mat_committed');
  });
});

