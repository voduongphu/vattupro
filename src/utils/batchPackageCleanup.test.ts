import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanupLegacyInboundReceipts,
  cleanupLegacyOutboundReceipts
} from './batchPackageCleanup.ts';
import {
  buildAggregatedRecords,
  mergeRecordsForInventoryReport
} from '../services/storage.ts';
import type { InboundReceipt, OutboundReceipt } from '../types/inventory.ts';

function makeInbound(overrides: Partial<InboundReceipt> = {}): InboundReceipt {
  return {
    id: 'in-1',
    receiptCode: 'PN-2026-0001',
    receiptDate: '2026-05-01',
    inboundType: 'new',
    warehouseId: 'wh-1',
    warehouseName: 'Kho Long Phú 1',
    supplier: 'NCC A',
    shipment: 'SHP-01',
    packingListNo: 'PL-01',
    delivererName: 'Nguyen A',
    receiverName: 'Thu Kho',
    totalQuantity: 0,
    totalWeightKg: 0,
    createdAt: '2026-05-01T08:00:00Z',
    createdBy: 'admin',
    lastEditedBy: 'Võ Dương Phú',
    lastEditedAt: '2026-05-02T10:00:00Z',
    items: [],
    ...overrides
  };
}

function makeOutbound(overrides: Partial<OutboundReceipt> = {}): OutboundReceipt {
  return {
    id: 'out-1',
    issueCode: 'PX-2026-0001',
    issueDate: '2026-05-05',
    outboundType: 'issue',
    warehouseId: 'wh-1',
    warehouseName: 'Kho Long Phú 1',
    recipientName: 'Đội 1',
    recipientDepartment: 'Đội thi công',
    issuerName: 'Thu Kho',
    projectName: 'Dự án LP1',
    totalQuantity: 0,
    totalWeightKg: 0,
    createdAt: '2026-05-05T08:00:00Z',
    createdBy: 'admin',
    items: [],
    ...overrides
  };
}

describe('batchPackageCleanup legacy data cleanup', () => {
  it('clears polluted batchCode copied from packageNo or N/A while keeping genuine batchCodes and audit metadata intact', () => {
    const inbounds: InboundReceipt[] = [
      makeInbound({
        items: [
          {
            id: 'it-1',
            materialCode: 'VT-56',
            materialName: 'M12 x 30L HEX BOLT',
            unit: 'PCS',
            packageNo: 'S09-HUK-2026',
            packageName: 'Kiện S09-HUK-2026',
            batchCode: 'S09-HUK-2026', // copied from packageNo by legacy app
            packingListNo: 'PL-01',
            shipment: 'SHP-01',
            manufacturer: 'N/A',
            supplier: 'NCC A',
            category: 'Bolts',
            drawingNo: 'N/A',
            quantity: 32,
            weightKg: 10
          },
          {
            id: 'it-2',
            materialCode: 'VT-90',
            materialName: 'M12 SELF LOCKING NUT',
            unit: 'Pcs',
            packageNo: 'S09-HUK-2090',
            packageName: 'Kiện S09-HUK-2090',
            batchCode: 'N/A', // placeholder
            packingListNo: 'PL-01',
            shipment: 'SHP-01',
            manufacturer: 'N/A',
            supplier: 'NCC A',
            category: 'Nuts',
            drawingNo: 'N/A',
            quantity: 336,
            weightKg: 20
          },
          {
            id: 'it-3',
            materialCode: 'VT-100',
            materialName: 'Ống thép đúc DN200',
            unit: 'Cây',
            packageNo: 'PKG-01',
            packageName: 'Kiện PKG-01',
            batchCode: 'HEAT-8821', // genuine distinct heat/lot code -> MUST keep!
            packingListNo: 'PL-01',
            shipment: 'SHP-01',
            manufacturer: 'Nippon',
            supplier: 'NCC A',
            category: 'Piping',
            drawingNo: 'DWG-01',
            quantity: 10,
            weightKg: 500
          },
          {
            id: 'it-4',
            materialCode: 'VT-101',
            materialName: 'Mặt bích 8 inch',
            unit: 'Cái',
            packageNo: '',
            packageName: 'Lô 183A0108', // legacy auto-generated lot label in packageName
            batchCode: '183A0108', // genuine lot code with empty packageNo -> MUST keep batchCode, clear packageName!
            packingListNo: 'PL-01',
            shipment: 'SHP-01',
            manufacturer: 'Nippon',
            supplier: 'NCC A',
            category: 'Piping',
            drawingNo: 'DWG-02',
            quantity: 5,
            weightKg: 50
          }
        ]
      })
    ];

    const res = cleanupLegacyInboundReceipts(inbounds, { bumpTimestamp: 999999 });
    assert.equal(res.changed, true);
    assert.equal(res.cleanedItemCount, 3);
    assert.deepEqual(res.changedCodes, ['PN-2026-0001']);

    const cleanedItems = res.receipts[0].items;
    assert.equal(cleanedItems[0].batchCode, '');
    assert.equal(cleanedItems[0].packageNo, 'S09-HUK-2026');

    assert.equal(cleanedItems[1].batchCode, '');
    assert.equal(cleanedItems[1].packageNo, 'S09-HUK-2090');

    assert.equal(cleanedItems[2].batchCode, 'HEAT-8821');
    assert.equal(cleanedItems[2].packageNo, 'PKG-01');

    assert.equal(cleanedItems[3].batchCode, '183A0108');
    assert.equal(cleanedItems[3].packageNo, '');
    assert.equal(cleanedItems[3].packageName, '');

    // Audit metadata must never be overwritten by automatic migration
    assert.equal(res.receipts[0].lastEditedBy, 'Võ Dương Phú');
    assert.equal(res.receipts[0].lastEditedAt, '2026-05-02T10:00:00Z');
    assert.equal(res.receipts[0].itemsReplacedAt, 999999);

    // Strictly idempotent on second pass
    const secondPass = cleanupLegacyInboundReceipts(res.receipts);
    assert.equal(secondPass.changed, false);
    assert.equal(secondPass.cleanedItemCount, 0);
  });

  it('cleans polluted outbound batchCode and restores packageNo when legacy outbound stored Package No. inside batchCode', () => {
    const inbounds: InboundReceipt[] = [
      makeInbound({
        items: [
          {
            id: 'it-1',
            materialCode: 'VT-56',
            materialName: 'M12 x 30L HEX BOLT',
            unit: 'PCS',
            packageNo: 'S09-HUK-2026',
            packageName: 'Kiện S09-HUK-2026',
            batchCode: '',
            packingListNo: 'PL-01',
            shipment: 'SHP-01',
            manufacturer: 'N/A',
            supplier: 'NCC A',
            category: 'Bolts',
            drawingNo: 'N/A',
            quantity: 32,
            weightKg: 32
          }
        ]
      })
    ];

    const outbounds: OutboundReceipt[] = [
      makeOutbound({
        items: [
          {
            id: 'oit-1',
            materialCode: 'VT-56',
            materialName: 'M12 x 30L HEX BOLT',
            unit: 'PCS',
            packageNo: 'N/A',
            packageName: '',
            batchCode: 'S09-HUK-2026', // old outbound stored packageNo in batchCode!
            packingListNo: 'PL-01',
            shipment: 'SHP-01',
            manufacturer: 'N/A',
            supplier: 'NCC A',
            category: 'Bolts',
            drawingNo: 'N/A',
            quantity: 12,
            weightKg: 12
          },
          {
            id: 'oit-2',
            materialCode: 'VT-56',
            materialName: 'M12 x 30L HEX BOLT',
            unit: 'PCS',
            packageNo: 'S09-HUK-2026',
            packageName: 'Kiện S09-HUK-2026',
            batchCode: 'S09-HUK-2026', // duplicated from packageNo
            packingListNo: 'PL-01',
            shipment: 'SHP-01',
            manufacturer: 'N/A',
            supplier: 'NCC A',
            category: 'Bolts',
            drawingNo: 'N/A',
            quantity: 8,
            weightKg: 8
          },
          {
            id: 'oit-3',
            materialCode: 'VT-56',
            materialName: 'M12 x 30L HEX BOLT',
            unit: 'PCS',
            packageNo: 'N/A',
            packageName: '',
            batchCode: 'HEAT-REAL-99', // genuine lot code (not a packageNo) -> keep!
            packingListNo: 'PL-01',
            shipment: 'SHP-01',
            manufacturer: 'N/A',
            supplier: 'NCC A',
            category: 'Bolts',
            drawingNo: 'N/A',
            quantity: 2,
            weightKg: 2
          }
        ]
      })
    ];

    const res = cleanupLegacyOutboundReceipts(outbounds, inbounds);
    assert.equal(res.changed, true);
    assert.equal(res.cleanedItemCount, 2);

    const items = res.receipts[0].items;
    assert.equal(items[0].packageNo, 'S09-HUK-2026');
    assert.equal(items[0].batchCode, '');

    assert.equal(items[1].packageNo, 'S09-HUK-2026');
    assert.equal(items[1].batchCode, '');

    assert.equal(items[2].packageNo, 'N/A');
    assert.equal(items[2].batchCode, 'HEAT-REAL-99');

    // Strictly idempotent
    const secondPass = cleanupLegacyOutboundReceipts(res.receipts, inbounds);
    assert.equal(secondPass.changed, false);
  });
});

describe('Inventory report reconciliation prevents negative balances from legacy packageNo/batchCode mismatches', () => {
  const whMap = new Map<string, string>([
    ['wh-1', 'Kho Long Phú 1'],
    ['wh-2', 'Kho Cát Lái']
  ]);

  it('reconciles legacy outbound (packageNo N/A, batchCode S09-HUK-2026 or blank) against inbound S09-HUK-2026 without negative rows', () => {
    const inbounds: InboundReceipt[] = [
      makeInbound({
        items: [
          {
            id: 'it-1',
            materialCode: 'VT-56',
            materialName: 'M12 x 30L HEX BOLT',
            unit: 'PCS',
            packageNo: 'S09-HUK-2026',
            packageName: 'Kiện S09-HUK-2026',
            batchCode: 'S09-HUK-2026',
            packingListNo: 'PL-01',
            shipment: 'SHP-01',
            manufacturer: 'N/A',
            supplier: 'NCC A',
            category: 'Bolts',
            drawingNo: 'N/A',
            quantity: 32,
            weightKg: 320
          }
        ]
      })
    ];

    const outbounds: OutboundReceipt[] = [
      makeOutbound({
        items: [
          {
            id: 'oit-1',
            materialCode: 'VT-56',
            materialName: 'M12 x 30L HEX BOLT',
            unit: 'PCS',
            packageNo: 'N/A',
            packageName: '',
            batchCode: 'S09-HUK-2026',
            packingListNo: 'PL-01',
            shipment: 'SHP-01',
            manufacturer: 'N/A',
            supplier: 'NCC A',
            category: 'Bolts',
            drawingNo: 'N/A',
            quantity: 12,
            weightKg: 120
          },
          {
            id: 'oit-2',
            materialCode: 'VT-56',
            materialName: 'M12 x 30L HEX BOLT',
            unit: 'PCS',
            packageNo: 'N/A',
            packageName: '',
            batchCode: '',
            packingListNo: 'PL-01',
            shipment: 'SHP-01',
            manufacturer: 'N/A',
            supplier: 'NCC A',
            category: 'Bolts',
            drawingNo: 'N/A',
            quantity: 8,
            weightKg: 80
          }
        ]
      })
    ];

    const records = buildAggregatedRecords(inbounds, outbounds, whMap);
    assert.equal(records.length, 1);
    assert.equal(records[0].packageNo, 'S09-HUK-2026');
    assert.equal(records[0].inboundQuantity, 32);
    assert.equal(records[0].outboundQuantity, 20);
    assert.equal(records[0].currentQuantity, 12);
    assert.equal(records[0].currentWeightKg, 120);
  });

  it('ignores legacy "Lô ..." in packageName so inbound without packageNo matches outbound cleanly', () => {
    const inbounds: InboundReceipt[] = [
      makeInbound({
        items: [
          {
            id: 'it-1',
            materialCode: 'VT-LOT',
            materialName: 'Ống thép API 5L',
            unit: 'Cây',
            packageNo: '',
            packageName: 'Lô 183A0108',
            batchCode: '183A0108',
            packingListNo: 'PL-02',
            shipment: 'SHP-02',
            manufacturer: 'Nippon',
            supplier: 'NCC A',
            category: 'Piping',
            drawingNo: 'N/A',
            quantity: 50,
            weightKg: 500
          }
        ]
      })
    ];

    const outbounds: OutboundReceipt[] = [
      makeOutbound({
        items: [
          {
            id: 'oit-1',
            materialCode: 'VT-LOT',
            materialName: 'Ống thép API 5L',
            unit: 'Cây',
            packageNo: 'N/A',
            packageName: '',
            batchCode: '',
            packingListNo: 'PL-02',
            shipment: 'SHP-02',
            manufacturer: 'Nippon',
            supplier: 'NCC A',
            category: 'Piping',
            drawingNo: 'N/A',
            quantity: 20,
            weightKg: 200
          }
        ]
      })
    ];

    const records = buildAggregatedRecords(inbounds, outbounds, whMap);
    assert.equal(records.length, 1);
    assert.equal(records[0].currentQuantity, 30);
    assert.equal(records[0].currentWeightKg, 300);
  });

  it('deducts FIFO across multiple inbound packages when outbound lacks packageNo and conserves total weight', () => {
    const inbounds: InboundReceipt[] = [
      makeInbound({
        items: [
          {
            id: 'it-1',
            materialCode: 'PIPE-01',
            materialName: 'Ống thép DN100',
            unit: 'Cây',
            packageNo: 'PKG-01',
            packageName: 'Kiện PKG-01',
            batchCode: '',
            packingListNo: 'PL-01',
            shipment: 'SHP-01',
            manufacturer: 'Nippon',
            supplier: 'NCC A',
            category: 'Piping',
            drawingNo: 'N/A',
            quantity: 20,
            weightKg: 200
          },
          {
            id: 'it-2',
            materialCode: 'PIPE-01',
            materialName: 'Ống thép DN100',
            unit: 'Cây',
            packageNo: 'PKG-02',
            packageName: 'Kiện PKG-02',
            batchCode: '',
            packingListNo: 'PL-01',
            shipment: 'SHP-01',
            manufacturer: 'Nippon',
            supplier: 'NCC A',
            category: 'Piping',
            drawingNo: 'N/A',
            quantity: 30,
            weightKg: 300
          }
        ]
      })
    ];

    const outbounds: OutboundReceipt[] = [
      makeOutbound({
        items: [
          {
            id: 'oit-1',
            materialCode: 'PIPE-01',
            materialName: 'Ống thép DN100',
            unit: 'Cây',
            packageNo: 'N/A',
            packageName: '',
            batchCode: '',
            packingListNo: 'PL-01',
            shipment: 'SHP-01',
            manufacturer: 'Nippon',
            supplier: 'NCC A',
            category: 'Piping',
            drawingNo: 'N/A',
            quantity: 35,
            weightKg: 350
          }
        ]
      })
    ];

    const records = buildAggregatedRecords(inbounds, outbounds, whMap);
    assert.equal(records.length, 2);
    assert.equal(records.every((r) => r.currentQuantity >= 0), true);
    const pkg1 = records.find((r) => r.packageNo === 'PKG-01')!;
    const pkg2 = records.find((r) => r.packageNo === 'PKG-02')!;
    assert.equal(pkg1.currentQuantity, 0);
    assert.equal(pkg1.outboundWeightKg, 200);
    assert.equal(pkg2.currentQuantity, 15);
    assert.equal(pkg2.outboundWeightKg, 150);
  });

  it('reconciles cross-warehouse package mismatches in mergeRecordsForInventoryReport while preserving genuine over-issue', () => {
    const inbounds: InboundReceipt[] = [
      makeInbound({
        warehouseId: 'wh-1',
        warehouseName: 'Kho Long Phú 1',
        items: [
          {
            id: 'it-1',
            materialCode: 'VAL-01',
            materialName: 'Van cổng DN150',
            unit: 'Cái',
            packageNo: 'PKG-A1',
            packageName: 'Kiện PKG-A1',
            batchCode: '',
            packingListNo: 'PL-10',
            shipment: 'SHP-10',
            manufacturer: 'Kitz',
            supplier: 'NCC A',
            category: 'Valves',
            drawingNo: 'N/A',
            quantity: 20,
            weightKg: 200
          }
        ]
      })
    ];

    const outbounds: OutboundReceipt[] = [
      makeOutbound({
        warehouseId: 'wh-2',
        warehouseName: 'Kho Cát Lái',
        items: [
          {
            id: 'oit-1',
            materialCode: 'VAL-01',
            materialName: 'Van cổng DN150',
            unit: 'Cái',
            packageNo: 'N/A',
            packageName: '',
            batchCode: '',
            packingListNo: 'PL-10',
            shipment: 'SHP-10',
            manufacturer: 'Kitz',
            supplier: 'NCC A',
            category: 'Valves',
            drawingNo: 'N/A',
            quantity: 10,
            weightKg: 100
          }
        ]
      })
    ];

    const perWh = buildAggregatedRecords(inbounds, outbounds, whMap);
    const merged = mergeRecordsForInventoryReport(perWh);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].inboundQuantity, 20);
    assert.equal(merged[0].outboundQuantity, 10);
    assert.equal(merged[0].currentQuantity, 10);
    assert.equal(merged[0].currentWeightKg, 100);

    // Genuine over-issue (out 25 > in 20) still reports -5 truthfully
    const overOutbounds: OutboundReceipt[] = [
      makeOutbound({
        warehouseId: 'wh-1',
        warehouseName: 'Kho Long Phú 1',
        items: [
          {
            id: 'oit-over',
            materialCode: 'VAL-01',
            materialName: 'Van cổng DN150',
            unit: 'Cái',
            packageNo: 'PKG-A1',
            packageName: 'Kiện PKG-A1',
            batchCode: '',
            packingListNo: 'PL-10',
            shipment: 'SHP-10',
            manufacturer: 'Kitz',
            supplier: 'NCC A',
            category: 'Valves',
            drawingNo: 'N/A',
            quantity: 25,
            weightKg: 250
          }
        ]
      })
    ];

    const overRecords = buildAggregatedRecords(inbounds, overOutbounds, whMap);
    assert.equal(overRecords.length, 1);
    assert.equal(overRecords[0].currentQuantity, -5);
  });
});
