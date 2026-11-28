import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InboundReceipt, InventoryStockRecord, OutboundReceipt } from '../types/inventory';
import { buildAggregatedRecords } from '../services/storage';
import {
  analyzeInventoryIntegrity,
  buildReconciliationVouchers
} from './inventoryIntegrity';

describe('inventoryIntegrity', () => {
  it('detects negative quantity, negative weight, and qty=0 weight mismatch accurately', () => {
    const records: InventoryStockRecord[] = [
      {
        id: 'neg-1',
        warehouseId: 'wh-1',
        warehouseName: 'Kho Long Phú 1',
        materialCode: 'VT-STEEL-01',
        materialName: 'Thép tấm 10mm',
        unit: 'Tấm',
        packingListNo: 'PL-01',
        shipment: 'SHP-01',
        manufacturer: 'Posco',
        supplier: 'ABC',
        packageNo: 'PKG-01',
        packageName: 'Kiện 1',
        category: 'Kết cấu',
        drawingNo: 'DWG-01',
        currentQuantity: -12,
        currentWeightKg: -600,
        inboundQuantity: 8,
        inboundWeightKg: 400,
        returnInboundQuantity: 0,
        returnInboundWeightKg: 0,
        outboundQuantity: 20,
        outboundWeightKg: 1000,
        transferOutboundQuantity: 0,
        transferOutboundWeightKg: 0,
        lastUpdated: '2026-11-20'
      },
      {
        id: 'ok-1',
        warehouseId: 'wh-1',
        warehouseName: 'Kho Long Phú 1',
        materialCode: 'VT-BOLT-01',
        materialName: 'Bu lông M20',
        unit: 'Bộ',
        packingListNo: 'PL-01',
        shipment: 'SHP-01',
        manufacturer: 'M',
        supplier: 'S',
        packageNo: 'PKG-02',
        packageName: '',
        category: 'Phụ kiện',
        drawingNo: 'N/A',
        currentQuantity: 25,
        currentWeightKg: 12.5,
        inboundQuantity: 30,
        inboundWeightKg: 15,
        returnInboundQuantity: 0,
        returnInboundWeightKg: 0,
        outboundQuantity: 5,
        outboundWeightKg: 2.5,
        transferOutboundQuantity: 0,
        transferOutboundWeightKg: 0,
        lastUpdated: '2026-11-20'
      },
      {
        id: 'warn-w',
        warehouseId: 'wh-1',
        warehouseName: 'Kho Long Phú 1',
        materialCode: 'VT-PIPE-01',
        materialName: 'Ống thép DN100',
        unit: 'Cây',
        packingListNo: 'PL-02',
        shipment: 'SHP-02',
        manufacturer: 'M',
        supplier: 'S',
        packageNo: 'PKG-03',
        packageName: '',
        category: 'Đường ống',
        drawingNo: 'N/A',
        currentQuantity: 0,
        currentWeightKg: 45.5,
        inboundQuantity: 10,
        inboundWeightKg: 545.5,
        returnInboundQuantity: 0,
        returnInboundWeightKg: 0,
        outboundQuantity: 10,
        outboundWeightKg: 500,
        transferOutboundQuantity: 0,
        transferOutboundWeightKg: 0,
        lastUpdated: '2026-11-20'
      }
    ];

    const report = analyzeInventoryIntegrity(records);
    assert.equal(report.isHealthy, false);
    assert.equal(report.totalRecordsChecked, 3);
    assert.equal(report.negativeQtyIssues.length, 1);
    assert.equal(report.negativeQtyIssues[0].record.materialCode, 'VT-STEEL-01');
    assert.equal(report.negativeQtyIssues[0].suggestedActualQty, 0);
    assert.equal(report.negativeQtyIssues[0].suggestedActualWeightKg, 0);
    assert.equal(report.totalNegativeQtyDeficit, 12);
    assert.equal(report.weightAnomalyIssues.length, 1);
    assert.equal(report.weightAnomalyIssues[0].issueType, 'qty_zero_weight_nonzero');
  });

  it('generates reconciliation vouchers that balance negative and actual stock exactly when re-aggregated', () => {
    const whMap = new Map<string, string>([['wh-1', 'Kho Long Phú 1']]);

    // Initial state: imported 10 pcs (500 kg), issued 18 pcs (900 kg) -> -8 pcs, -400 kg
    // Also a second item imported 50 pcs (100 kg), issued 10 pcs (20 kg) -> +40 pcs, +80 kg (actual count is 35 pcs, 70 kg)
    const initialInbounds: InboundReceipt[] = [
      {
        id: 'in-1',
        receiptCode: 'PN-001',
        receiptDate: '2026-11-01',
        warehouseId: 'wh-1',
        warehouseName: 'Kho Long Phú 1',
        supplier: 'NCC A',
        shipment: 'SHP-A',
        packingListNo: 'PL-A',
        delivererName: 'Giao A',
        receiverName: 'Thu kho',
        items: [
          {
            id: 'i1',
            materialCode: 'VT-NEG',
            materialName: 'Van công nghiệp DN80',
            unit: 'Cái',
            packingListNo: 'PL-A',
            shipment: 'SHP-A',
            manufacturer: 'Kitz',
            supplier: 'NCC A',
            packageNo: 'PKG-01',
            packageName: 'Kiện van',
            category: 'Đường ống',
            drawingNo: 'DWG-1',
            weightKg: 500,
            quantity: 10
          },
          {
            id: 'i2',
            materialCode: 'VT-OVER',
            materialName: 'Mặt bích DN80',
            unit: 'Cái',
            packingListNo: 'PL-A',
            shipment: 'SHP-A',
            manufacturer: 'Kitz',
            supplier: 'NCC A',
            packageNo: 'PKG-02',
            packageName: 'Kiện bích',
            category: 'Đường ống',
            drawingNo: 'DWG-1',
            weightKg: 100,
            quantity: 50
          }
        ],
        totalQuantity: 60,
        totalWeightKg: 600,
        createdAt: '2026-11-01',
        createdBy: 'admin'
      }
    ];

    const initialOutbounds: OutboundReceipt[] = [
      {
        id: 'out-1',
        issueCode: 'PX-001',
        issueDate: '2026-11-05',
        warehouseId: 'wh-1',
        warehouseName: 'Kho Long Phú 1',
        recipientDepartment: 'Tổ thi công',
        recipientName: 'Nguyễn A',
        issuerName: 'Thu kho',
        items: [
          {
            id: 'o1',
            materialCode: 'VT-NEG',
            materialName: 'Van công nghiệp DN80',
            unit: 'Cái',
            packingListNo: 'PL-A',
            shipment: 'SHP-A',
            manufacturer: 'Kitz',
            supplier: 'NCC A',
            packageNo: 'PKG-01',
            packageName: 'Kiện van',
            category: 'Đường ống',
            drawingNo: 'DWG-1',
            weightKg: 900,
            quantity: 18
          },
          {
            id: 'o2',
            materialCode: 'VT-OVER',
            materialName: 'Mặt bích DN80',
            unit: 'Cái',
            packingListNo: 'PL-A',
            shipment: 'SHP-A',
            manufacturer: 'Kitz',
            supplier: 'NCC A',
            packageNo: 'PKG-02',
            packageName: 'Kiện bích',
            category: 'Đường ống',
            drawingNo: 'DWG-1',
            weightKg: 20,
            quantity: 10
          }
        ],
        totalQuantity: 28,
        totalWeightKg: 920,
        createdAt: '2026-11-05',
        createdBy: 'admin'
      }
    ];

    const beforeRecords = buildAggregatedRecords(initialInbounds, initialOutbounds, whMap);
    const negRec = beforeRecords.find((r) => r.materialCode === 'VT-NEG')!;
    const overRec = beforeRecords.find((r) => r.materialCode === 'VT-OVER')!;
    assert.equal(negRec.currentQuantity, -8);
    assert.equal(negRec.currentWeightKg, -400);
    assert.equal(overRec.currentQuantity, 40);

    // Reconcile VT-NEG to actual 2 pcs / 100 kg (needs +10 pcs / +500 kg inbound)
    // Reconcile VT-OVER to actual 35 pcs / 70 kg (needs -5 pcs / -10 kg outbound)
    const generated = buildReconciliationVouchers({
      targets: [
        { record: negRec, actualQuantity: 2, actualWeightKg: 100 },
        { record: overRec, actualQuantity: 35, actualWeightKg: 70 }
      ],
      existingInboundCodes: ['PN-001', 'PN-DC-20261127-01'],
      existingOutboundCodes: ['PX-001'],
      actorUserCode: 'admin',
      actorFullName: 'Quản trị viên',
      adjustmentDate: '2026-11-27',
      nowMs: 1795770000000
    });

    assert.equal(generated.inboundReceipts.length, 1);
    assert.equal(generated.inboundReceipts[0].receiptCode, 'PN-DC-20261127-02');
    assert.equal(generated.outboundReceipts.length, 1);
    assert.equal(generated.outboundReceipts[0].issueCode, 'PX-DC-20261127-01');

    // Re-aggregate with generated adjustment vouchers and verify exact target balances!
    const afterRecords = buildAggregatedRecords(
      [...initialInbounds, ...generated.inboundReceipts],
      [...initialOutbounds, ...generated.outboundReceipts],
      whMap
    );
    const afterNeg = afterRecords.find((r) => r.materialCode === 'VT-NEG')!;
    const afterOver = afterRecords.find((r) => r.materialCode === 'VT-OVER')!;
    assert.equal(afterNeg.currentQuantity, 2);
    assert.equal(afterNeg.currentWeightKg, 100);
    assert.equal(afterOver.currentQuantity, 35);
    assert.equal(afterOver.currentWeightKg, 70);

    const postAudit = analyzeInventoryIntegrity(afterRecords);
    assert.equal(postAudit.isHealthy, true);
    assert.equal(postAudit.negativeQtyIssues.length, 0);
  });
});
