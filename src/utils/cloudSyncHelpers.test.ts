import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
  isLocalTimeoutError,
  shouldRunLocalBridgeAfterCloud,
  shouldQueueReconcileDuringAuthTransition,
  shouldUpdateLastSyncTimestamp,
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
  isTransientResourceExhaustedError,
  isFirestoreQuotaExceededError,
  isFirestoreBillingOrPlanError,
  isFirestoreCloudRestrictedError,
  formatFirestoreQuotaMessage,
  evaluatePreSyncCheck,
  resolveConvergedCheckpointDigests,
  CLOUD_SYNC_HARD_TIMEOUT_MS,
  SyncAbortedError,
  isSyncAbortedError,
  createSyncDeadline,
  getEffectiveStepTimeoutMs,
  classifyCloudPauseReason,
  formatCloudPauseNotice,
  shouldPauseCloudOnFailure,
  shouldSkipAutoCloudActivity,
  formatSyncByteSize,
  mergeSyncTransferProgress,
  createSyncTransferTracker,
  type ManifestSnapshotLike
} from './cloudSyncHelpers.ts';
import {
  computeInboundReceiptDigest,
  computeOutboundReceiptDigest,
  normKey
} from './additiveMerge.ts';
import type { User, InboundReceipt, OutboundReceipt } from '../types/inventory.ts';

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

  it('shouldQueueReconcileDuringAuthTransition queues startup, manual, mutation, and forced refreshes', () => {
    assert.equal(shouldQueueReconcileDuringAuthTransition({ trigger: 'remote' }), false);
    assert.equal(shouldQueueReconcileDuringAuthTransition(undefined), false);
    assert.equal(shouldQueueReconcileDuringAuthTransition({ trigger: 'startup' }), true);
    assert.equal(shouldQueueReconcileDuringAuthTransition({ trigger: 'manual' }), true);
    assert.equal(shouldQueueReconcileDuringAuthTransition({ trigger: 'mutation' }), true);
    assert.equal(
      shouldQueueReconcileDuringAuthTransition({ trigger: 'remote', forceManifestRefresh: true }),
      true
    );
  });

  it('shouldUpdateLastSyncTimestamp never lets local bridge mask a failed Cloud pull', () => {
    assert.equal(
      shouldUpdateLastSyncTimestamp({
        isCloudSession: true,
        cloudSuccess: false,
        localSuccess: true,
        cloudQuotaExceeded: false
      }),
      false
    );
    assert.equal(
      shouldUpdateLastSyncTimestamp({
        isCloudSession: true,
        cloudSuccess: true,
        localSuccess: false,
        cloudQuotaExceeded: false
      }),
      true
    );
    assert.equal(
      shouldUpdateLastSyncTimestamp({
        isCloudSession: true,
        cloudSuccess: true,
        localSuccess: true,
        cloudQuotaExceeded: true
      }),
      false
    );
    assert.equal(
      shouldUpdateLastSyncTimestamp({
        isCloudSession: false,
        cloudSuccess: false,
        localSuccess: true,
        cloudQuotaExceeded: false
      }),
      true
    );
  });

  it('getAdaptiveCloudFetchConfig bounds mobile concurrency and increases timeout/retries vs desktop', () => {
    const mobileCfg = getAdaptiveCloudFetchConfig(true);
    const desktopCfg = getAdaptiveCloudFetchConfig(false);

    assert.ok(mobileCfg.concurrency <= 4);
    assert.ok(mobileCfg.itemChunkConcurrency <= 4);
    assert.ok(mobileCfg.readTimeoutMs > desktopCfg.readTimeoutMs);
    assert.ok(mobileCfg.maxReadRetries >= 2);
    assert.ok(desktopCfg.concurrency > mobileCfg.concurrency);
  });

  it('isRetryableCloudReadError retries timeouts/transient errors but aborts on quota or permission errors', () => {
    assert.equal(isRetryableCloudReadError(new Error('timeout reading manifest')), true);
    assert.equal(isRetryableCloudReadError({ code: 'unavailable', message: 'Service unavailable' }), true);
    assert.equal(isRetryableCloudReadError({ code: 'permission-denied', message: 'Denied' }), false);
    assert.equal(isRetryableCloudReadError({ code: 'resource-exhausted', message: 'Quota exceeded' }), false);
    assert.equal(isRetryableCloudReadError(new Error('Quota limit exceeded for project')), false);
  });

  it('retryAsyncWithBackoff retries transient errors with exponential backoff and stops on fatal errors', async () => {
    let attempts = 0;
    const delays: number[] = [];
    const value = await retryAsyncWithBackoff(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error('timeout');
        }
        return 'ok';
      },
      {
        maxRetries: 2,
        baseDelayMs: 100,
        sleepFn: async (ms) => {
          delays.push(ms);
        }
      }
    );
    assert.equal(value, 'ok');
    assert.equal(attempts, 3);
    assert.deepEqual(delays, [100, 200]);

    let fatalAttempts = 0;
    await assert.rejects(
      retryAsyncWithBackoff(
        async () => {
          fatalAttempts += 1;
          const err = new Error('Quota limit exceeded');
          (err as any).code = 'resource-exhausted';
          throw err;
        },
        {
          maxRetries: 2,
          baseDelayMs: 100,
          sleepFn: async () => {}
        }
      ),
      /Quota limit exceeded/
    );
    assert.equal(fatalAttempts, 1);
  });

  it('runWithConcurrencyLimit preserves order and never exceeds the configured worker cap', async () => {
    const items = [10, 20, 30, 40, 50, 60, 70];
    let active = 0;
    let maxActive = 0;

    const results = await runWithConcurrencyLimit(items, 3, async (item, idx) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, (items.length - idx) * 2));
      active -= 1;
      return item * 2;
    });

    assert.equal(maxActive <= 3, true);
    assert.equal(maxActive >= 2, true);
    assert.deepEqual(results, [20, 40, 60, 80, 100, 120, 140]);
    assert.deepEqual(await runWithConcurrencyLimit([], 3, async () => 1), []);
  });

  it('estimates UTF-8 Vietnamese payload bytes accurately and partitions writeBatches under byte budget', () => {
    assert.equal(estimateUtf8ByteLength('abc'), 3);
    assert.equal(estimateUtf8ByteLength('Vật tư'), Buffer.byteLength('Vật tư', 'utf8'));

    const bigDocBytes = estimateStagedWritePayloadBytes(
      'workspaces/vtp_main/inboundItems/in_1_c0',
      { workspaceId: 'vtp_main', receiptDocId: 'in_1', chunkIndex: 0 },
      { items: Array.from({ length: 10 }, (_, i) => ({ code: `VT-${i}`, note: 'Ghi chú tiếng Việt dài'.repeat(10) })) }
    );
    assert.ok(bigDocBytes > 2500);

    // 10 staged docs of 700 KB each (~7 MB total) with 2.5 MB batch limit must split into 4 batches (max 3 docs/batch)
    const docs = Array.from({ length: 10 }, (_, idx) => ({ id: idx, bytes: 700_000 }));
    const batches = partitionStagedWritesIntoBatches(docs, (d) => d.bytes, {
      maxOpsPerBatch: 200,
      maxBytesPerBatch: 2_500_000
    });
    assert.equal(batches.length, 4);
    assert.deepEqual(
      batches.map((b) => b.length),
      [3, 3, 3, 1]
    );
    assert.deepEqual(
      batches.flat().map((d) => d.id),
      docs.map((d) => d.id)
    );

    // Also enforces maxOpsPerBatch even when documents are tiny
    const tinyDocs = Array.from({ length: 5 }, (_, idx) => ({ id: idx, bytes: 300 }));
    const opBatches = partitionStagedWritesIntoBatches(tinyDocs, (d) => d.bytes, {
      maxOpsPerBatch: 2,
      maxBytesPerBatch: 2_500_000
    });
    assert.deepEqual(
      opBatches.map((b) => b.length),
      [2, 2, 1]
    );

    // Also enforces default 3-op cap (keeps batch within Firestore's 20 get/exists Security Rules limit)
    const defaultBatches = partitionStagedWritesIntoBatches(tinyDocs, (d) => d.bytes);
    assert.deepEqual(
      defaultBatches.map((b) => b.length),
      [3, 2]
    );

    // Deduplicates repeated document paths while preserving the latest write payload
    const dupes = [
      { path: 'a', v: 1 },
      { path: 'b', v: 2 },
      { path: 'a', v: 3 },
      { path: 'c', v: 4 }
    ];
    assert.deepEqual(
      deduplicateStagedWritesByPath(dupes, (x) => x.path),
      [
        { path: 'a', v: 3 },
        { path: 'b', v: 2 },
        { path: 'c', v: 4 }
      ]
    );
  });

  it('chunkItemsByCountAndBytes respects both item count and per-document byte cap and detects payload errors', () => {
    const heavyItems = Array.from({ length: 12 }, (_, idx) => ({
      id: `item-${idx}`,
      description: 'Mô tả kỹ thuật chi tiết vật tư thiết bị dự án '.repeat(60)
    }));
    const singleSize = estimateFirestoreValueBytes(heavyItems[0]);
    assert.ok(singleSize > 3000);

    const chunks = chunkItemsByCountAndBytes(heavyItems, 200, 12_000);
    assert.ok(chunks.length >= 3);
    assert.equal(chunks.flat().length, 12);

    assert.equal(
      isPayloadSizeExceededError(
        new Error('Request payload size exceeds the limit: 18874368 bytes.')
      ),
      true
    );
    assert.equal(
      isPayloadSizeExceededError(new Error('Document exceeds the maximum allowed size')),
      true
    );
    assert.equal(isPayloadSizeExceededError(new Error('Quota limit exceeded')), false);
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

  it('computeReceiptDomainDigestFromIndexEntries matches full receipt domain digests regardless of order', () => {
    const inList = [makeInbound(1, 'a'), makeInbound(2, 'b'), makeInbound(3, 'c')];
    const inEntriesReversed = [...inList].reverse().map((r) => ({
      code: normKey(r.receiptCode || r.id),
      digest: computeInboundReceiptDigest(r)
    }));
    assert.equal(
      computeReceiptDomainDigestFromIndexEntries('inbound', inEntriesReversed),
      computeInboundDomainDigest(inList)
    );

    const outList: OutboundReceipt[] = [1, 2].map((idx) => ({
      id: `out-${idx}`,
      issueCode: `PX-2026-000${idx}`,
      issueDate: '2026-03-02',
      warehouseId: 'wh-1',
      warehouseName: 'Kho Long Phú',
      recipientDepartment: 'BQL',
      recipientName: 'Nguyen Van A',
      issuerName: 'Thu kho',
      items: [],
      totalQuantity: 5 * idx,
      totalWeightKg: 10 * idx,
      totalAmount: 500 * idx,
      createdAt: '2026-03-02T00:00:00Z',
      createdBy: 'admin',
      updatedAt: 2000 + idx
    }));
    const outEntriesReversed = [...outList].reverse().map((r) => ({
      code: normKey(r.issueCode || r.id),
      digest: computeOutboundReceiptDigest(r)
    }));
    assert.equal(
      computeReceiptDomainDigestFromIndexEntries('outbound', outEntriesReversed),
      computeOutboundDomainDigest(outList)
    );
  });

  it('isLocalTimeoutError detects withAsyncTimeout errors and getAdaptiveBatchWriteConfig prevents WriteStream congestion', async () => {
    let caught: unknown = null;
    try {
      await withAsyncTimeout(new Promise(() => {}), 10, 'Custom slow error');
    } catch (err) {
      caught = err;
    }
    assert.equal(isLocalTimeoutError(caught), true);
    assert.equal(isLocalTimeoutError(new Error('Ghi dữ liệu lên Cloud Firestore phản hồi quá chậm.')), true);
    assert.equal(isLocalTimeoutError({ code: 'unavailable', message: 'Network unavailable' }), false);

    const staffCfg = getAdaptiveBatchWriteConfig({
      isMobile: false,
      isAdmin: false,
      allKnownExisting: false,
      avgPayloadBytes: 5000
    });
    assert.equal(staffCfg.maxOpsPerBatch, 3);
    assert.ok(staffCfg.maxBytesPerBatch <= 400_000);
    assert.ok(staffCfg.commitTimeoutMs >= 60_000);

    const adminHeavyCfg = getAdaptiveBatchWriteConfig({
      isMobile: false,
      isAdmin: true,
      allKnownExisting: false,
      avgPayloadBytes: 260_000
    });
    assert.equal(adminHeavyCfg.maxOpsPerBatch, 6);
    assert.equal(adminHeavyCfg.batchConcurrency, 1);

    const adminLightUpdateCfg = getAdaptiveBatchWriteConfig({
      isMobile: false,
      isAdmin: true,
      allKnownExisting: true,
      avgPayloadBytes: 4000
    });
    assert.equal(adminLightUpdateCfg.maxOpsPerBatch, 16);
    assert.equal(adminLightUpdateCfg.batchConcurrency, 2);

    const mobileCfg = getAdaptiveBatchWriteConfig({
      isMobile: true,
      isAdmin: true,
      allKnownExisting: true,
      avgPayloadBytes: 4000
    });
    assert.equal(mobileCfg.batchConcurrency, 1);
  });

  it('distinguishes transient Blaze resource-exhausted errors from daily/free-tier quota exhaustion and preserves Google error detail', () => {
    const writeStreamErr = Object.assign(
      new Error('Write stream exhausted maximum allowed queued writes.'),
      { code: 'resource-exhausted' }
    );
    assert.equal(isTransientResourceExhaustedError(writeStreamErr), true);
    assert.equal(isFirestoreQuotaExceededError(writeStreamErr), false);
    assert.equal(isRetryableCloudReadError(writeStreamErr), true);

    const contentionErr = Object.assign(
      new Error('Too much contention on these documents. Please try again.'),
      { code: 'resource-exhausted' }
    );
    assert.equal(isTransientResourceExhaustedError(contentionErr), true);
    assert.equal(isFirestoreQuotaExceededError(contentionErr), false);
    assert.equal(isRetryableCloudReadError(contentionErr), true);

    const payloadErr = Object.assign(
      new Error('Request payload size exceeds the limit: 18874368 bytes.'),
      { code: 'resource-exhausted' }
    );
    assert.equal(isFirestoreQuotaExceededError(payloadErr), false);

    const freeTierDbErr = Object.assign(
      new Error(
        "Quota exceeded for quota metric 'Free daily read/write units per project (free tier database)'."
      ),
      { code: 'resource-exhausted' }
    );
    assert.equal(isTransientResourceExhaustedError(freeTierDbErr), false);
    assert.equal(isFirestoreQuotaExceededError(freeTierDbErr), true);
    assert.equal(isRetryableCloudReadError(freeTierDbErr), false);

    const freeTierMsg = formatFirestoreQuotaMessage(freeTierDbErr);
    assert.ok(freeTierMsg.includes('Free tier database'));
    assert.ok(freeTierMsg.includes('Chi tiết từ Google:'));
    assert.ok(freeTierMsg.includes('Free daily read/write units'));

    const wrappedJsonErr = new Error(
      JSON.stringify({
        error: 'Quota limit exceeded for project divine-particle-2zbz0',
        operationType: 'write',
        path: 'workspaces/vtp_main'
      })
    );
    assert.equal(isFirestoreQuotaExceededError(wrappedJsonErr), true);
    const wrappedMsg = formatFirestoreQuotaMessage(wrappedJsonErr);
    assert.ok(wrappedMsg.includes('Quota limit exceeded for project divine-particle-2zbz0'));
  });

  it('detects Blaze-to-Spark billing/plan-disabled errors, skips retries, and formats clear Vietnamese local-safe guidance', () => {
    const billingErr = Object.assign(
      new Error('PERMISSION_DENIED: Billing must be enabled for activation of service firestore.googleapis.com'),
      { code: 'permission-denied' }
    );
    assert.equal(isFirestoreBillingOrPlanError(billingErr), true);
    assert.equal(isFirestoreCloudRestrictedError(billingErr), true);
    assert.equal(isTransientResourceExhaustedError(billingErr), false);
    assert.equal(isRetryableCloudReadError(billingErr), false);

    const billingMsg = formatFirestoreQuotaMessage(billingErr);
    assert.ok(billingMsg.includes('Spark'));
    assert.ok(billingMsg.includes('Blaze'));
    assert.ok(billingMsg.includes('cục bộ'));
    assert.ok(billingMsg.includes('Billing must be enabled'));

    const namedDbDisabledErr = Object.assign(
      new Error('Database ai-studio-test does not exist or is disabled on the Spark plan.'),
      { code: 'failed-precondition' }
    );
    assert.equal(isFirestoreBillingOrPlanError(namedDbDisabledErr), true);
    assert.equal(isFirestoreCloudRestrictedError(namedDbDisabledErr), true);
    assert.equal(isRetryableCloudReadError(namedDbDisabledErr), false);

    const authBillingErr = Object.assign(new Error('Billing not enabled'), {
      code: 'auth/billing-not-enabled'
    });
    assert.equal(isFirestoreBillingOrPlanError(authBillingErr), true);
    assert.equal(isRetryableCloudReadError(authBillingErr), false);

    const normalPermErr = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied'
    });
    assert.equal(isFirestoreBillingOrPlanError(normalPermErr), false);
  });

  it('enforces a 2-minute (120_000 ms) sync deadline watchdog and aborts backoff/concurrency loops cleanly', async () => {
    assert.equal(CLOUD_SYNC_HARD_TIMEOUT_MS, 120_000);

    let fakeNow = 10_000;
    let timedOutCallbackFired = 0;
    const deadline = createSyncDeadline(CLOUD_SYNC_HARD_TIMEOUT_MS, {
      nowFn: () => fakeNow,
      onTimeout: () => {
        timedOutCallbackFired += 1;
      }
    });

    assert.equal(deadline.isAborted(), false);
    assert.equal(deadline.remainingMs(), 120_000);
    assert.equal(getEffectiveStepTimeoutMs(15_000, deadline.remainingMs()), 15_000);

    fakeNow += 116_000;
    assert.equal(deadline.isAborted(), false);
    assert.equal(deadline.remainingMs(), 4_000);
    assert.equal(getEffectiveStepTimeoutMs(15_000, deadline.remainingMs()), 4_000);

    fakeNow += 4_500;
    assert.equal(deadline.isAborted(), true);
    assert.equal(deadline.didTimeOut(), true);
    assert.equal(timedOutCallbackFired, 1);
    assert.throws(() => deadline.throwIfAborted(), (err: unknown) => isSyncAbortedError(err));
    assert.throws(
      () => getEffectiveStepTimeoutMs(10_000, deadline.remainingMs()),
      (err: unknown) => isSyncAbortedError(err) && (err as SyncAbortedError).timedOut === true
    );
    deadline.dispose();

    // Once connected to Cloud server (markConnected), 2-minute limit is disarmed so large data sync runs to completion
    let connectedNow = 50_000;
    let connectedTimeoutFired = 0;
    const connectedDeadline = createSyncDeadline(CLOUD_SYNC_HARD_TIMEOUT_MS, {
      nowFn: () => connectedNow,
      onTimeout: () => {
        connectedTimeoutFired += 1;
      }
    });
    assert.equal(connectedDeadline.isConnected(), false);
    connectedNow += 3_000;
    connectedDeadline.markConnected();
    assert.equal(connectedDeadline.isConnected(), true);
    // Simulate a 10-minute large dataset sync after connecting
    connectedNow += 600_000;
    assert.equal(connectedDeadline.isAborted(), false);
    assert.equal(connectedDeadline.isExpired(), false);
    assert.equal(connectedDeadline.didTimeOut(), false);
    assert.equal(connectedDeadline.remainingMs(), Number.POSITIVE_INFINITY);
    assert.equal(getEffectiveStepTimeoutMs(15_000, connectedDeadline.remainingMs()), 15_000);
    assert.doesNotThrow(() => connectedDeadline.throwIfAborted());
    assert.equal(connectedTimeoutFired, 0);

    // retryAsyncWithBackoff must keep retrying (not abort) when remainingMs is Infinity
    let connectedRetryAttempts = 0;
    const retryOutcome = await retryAsyncWithBackoff(
      async () => {
        connectedRetryAttempts += 1;
        if (connectedRetryAttempts < 2) {
          throw Object.assign(new Error('transient'), { code: 'unavailable' });
        }
        return 'ok-after-retry';
      },
      {
        maxRetries: 2,
        baseDelayMs: 1,
        sleepFn: async () => {},
        isAborted: () => connectedDeadline.isAborted(),
        getRemainingMs: () => connectedDeadline.remainingMs()
      }
    );
    assert.equal(retryOutcome, 'ok-after-retry');
    assert.equal(connectedRetryAttempts, 2);

    // Explicit abort (e.g. quota exceeded / offline) still stops a connected sync cleanly
    connectedDeadline.abort('offline', false);
    assert.equal(connectedDeadline.isAborted(), true);
    assert.equal(connectedDeadline.didTimeOut(), false);
    assert.equal(connectedDeadline.remainingMs(), 0);
    connectedDeadline.dispose();

    // retryAsyncWithBackoff stops immediately without retrying once aborted
    let retryAttempts = 0;
    let abortedFlag = false;
    await assert.rejects(
      async () =>
        retryAsyncWithBackoff(
          async () => {
            retryAttempts += 1;
            abortedFlag = true;
            throw Object.assign(new Error('transient'), { code: 'unavailable' });
          },
          {
            maxRetries: 5,
            baseDelayMs: 500,
            isAborted: () => abortedFlag,
            getAbortError: () => new SyncAbortedError('aborted mid-retry', { timedOut: true })
          }
        ),
      (err: unknown) => isSyncAbortedError(err)
    );
    assert.equal(retryAttempts, 1);

    // runWithConcurrencyLimit stops launching remaining items once aborted
    let processedCount = 0;
    let stopMidPool = false;
    await assert.rejects(
      async () =>
        runWithConcurrencyLimit([1, 2, 3, 4, 5, 6], 1, async (n) => {
          processedCount += 1;
          if (n === 2) stopMidPool = true;
          return n;
        }, {
          isAborted: () => stopMidPool,
          getAbortError: () => new SyncAbortedError('aborted pool')
        }),
      (err: unknown) => isSyncAbortedError(err)
    );
    assert.equal(processedCount, 2);
  });

  it('classifies pause reasons, formats clear reconnect notices, and blocks auto sync while paused', () => {
    const timeoutNotice = formatCloudPauseNotice(
      classifyCloudPauseReason('timeout', { timedOutOver2Min: true, isOnline: true })
    );
    assert.match(timeoutNotice, /^Tạm dừng kết nối Cloud vì lý do: .+\. Vui lòng nhấn nút "Đồng Bộ Cloud" để chủ động kết nối lại\.$/);
    assert.ok(timeoutNotice.includes('2 phút'));

    const offlineNotice = formatCloudPauseNotice(
      classifyCloudPauseReason('any', { isOnline: false })
    );
    assert.ok(offlineNotice.includes('ngoại tuyến'));

    const sparkReason = classifyCloudPauseReason(
      Object.assign(new Error('Database disabled on Spark plan'), { code: 'failed-precondition' })
    );
    assert.ok(sparkReason.includes('Spark'));
    assert.ok(sparkReason.includes('Blaze'));

    const networkReason = classifyCloudPauseReason(
      Object.assign(new Error('network unavailable'), { code: 'unavailable' })
    );
    assert.ok(networkReason.includes('mạng di động'));

    // Auto vs manual pause thresholds
    assert.equal(
      shouldPauseCloudOnFailure({
        elapsedMs: 120_000,
        maxDurationMs: 120_000,
        consecutiveFailures: 1,
        hasConnectedToCloud: false
      }),
      true
    );
    assert.equal(
      shouldPauseCloudOnFailure({
        elapsedMs: 600_000,
        maxDurationMs: 120_000,
        consecutiveFailures: 1,
        hasConnectedToCloud: true,
        isManualTrigger: false
      }),
      false
    );
    assert.equal(
      shouldPauseCloudOnFailure({
        elapsedMs: 10_000,
        maxDurationMs: 120_000,
        consecutiveFailures: 1,
        isManualTrigger: false
      }),
      false
    );
    assert.equal(
      shouldPauseCloudOnFailure({
        elapsedMs: 10_000,
        maxDurationMs: 120_000,
        consecutiveFailures: 2,
        isManualTrigger: false
      }),
      true
    );
    assert.equal(
      shouldPauseCloudOnFailure({
        elapsedMs: 10_000,
        maxDurationMs: 120_000,
        consecutiveFailures: 1,
        isManualTrigger: true
      }),
      true
    );

    // Paused gate blocks automatic syncs but allows manual sync
    assert.equal(shouldSkipAutoCloudActivity({ connectionPaused: true, isManualTrigger: false }), true);
    assert.equal(shouldSkipAutoCloudActivity({ connectionPaused: true, isManualTrigger: true }), false);
    assert.equal(shouldSkipAutoCloudActivity({ connectionPaused: false, isManualTrigger: false }), false);
  });

  it('formats sync byte sizes concisely and tracks nested transfer sessions cleanly', () => {
    assert.equal(formatSyncByteSize(0), '0 B');
    assert.equal(formatSyncByteSize(-10), '0 B');
    assert.equal(formatSyncByteSize(Number.NaN), '0 B');
    assert.equal(formatSyncByteSize(512), '512 B');
    assert.equal(formatSyncByteSize(1024), '1.0 KB');
    assert.equal(formatSyncByteSize(4.25 * 1024), '4.3 KB');
    assert.equal(formatSyncByteSize(128 * 1024), '128 KB');
    assert.equal(formatSyncByteSize(1.45 * 1024 * 1024), '1.45 MB');
    assert.equal(formatSyncByteSize(25.4 * 1024 * 1024), '25.4 MB');
    assert.equal(formatSyncByteSize(1.25 * 1024 * 1024 * 1024), '1.25 GB');

    let fakeNow = 1000;
    const tracker = createSyncTransferTracker({ throttleMs: 50, nowFn: () => fakeNow });
    const events: Array<{ active: boolean; totalBytes: number }> = [];
    const unsub = tracker.subscribe((p) => events.push({ active: p.active, totalBytes: p.totalBytes }));

    // Ignore transfers recorded while idle
    tracker.recordDownload(999);
    assert.equal(tracker.getSnapshot().totalBytes, 0);

    // Nested sessions reset only on outermost begin and deactivate only on outermost end
    tracker.begin();
    assert.equal(tracker.isActive(), true);
    tracker.recordDownload(2048);
    tracker.begin();
    fakeNow += 60;
    tracker.recordUpload(1024);
    tracker.end();
    assert.equal(tracker.isActive(), true);
    assert.deepEqual(tracker.getSnapshot(), {
      active: true,
      totalBytes: 3072,
      downloadedBytes: 2048,
      uploadedBytes: 1024
    });

    tracker.end();
    assert.deepEqual(tracker.getSnapshot(), {
      active: false,
      totalBytes: 3072,
      downloadedBytes: 2048,
      uploadedBytes: 1024
    });

    tracker.resetIfIdle();
    assert.deepEqual(tracker.getSnapshot(), {
      active: false,
      totalBytes: 0,
      downloadedBytes: 0,
      uploadedBytes: 0
    });

    const merged = mergeSyncTransferProgress(
      { active: true, totalBytes: 300, downloadedBytes: 200, uploadedBytes: 100 },
      { active: false, totalBytes: 700, downloadedBytes: 500, uploadedBytes: 200 }
    );
    assert.deepEqual(merged, {
      active: true,
      totalBytes: 1000,
      downloadedBytes: 700,
      uploadedBytes: 300
    });

    assert.ok(events.length >= 4);
    unsub();
  });
});
