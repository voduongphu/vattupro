import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InventoryStockRecord } from '../types/inventory';
import {
  buildFm09PdfFileName,
  buildFm09QuantityReport,
  formatFm09DateRange,
  formatFm09Qty
} from './inventoryReportFm09';

function makeStockRecord(overrides: Partial<InventoryStockRecord>): InventoryStockRecord {
  return {
    id: 'rec-1',
    warehouseId: 'wh-1',
    warehouseName: 'Kho 1',
    materialCode: 'VT-001',
    materialName: 'Thép tấm A36 10mm',
    unit: 'Tấm',
    packingListNo: 'PL-01',
    shipment: 'SHP-01',
    manufacturer: 'Posco',
    supplier: 'ABC',
    packageNo: 'PKG-01',
    packageName: 'Kiện 1',
    category: 'Kết cấu thép',
    drawingNo: 'DWG-01',
    currentQuantity: 0,
    currentWeightKg: 999,
    inboundQuantity: 0,
    inboundWeightKg: 999,
    returnInboundQuantity: 0,
    returnInboundWeightKg: 50,
    outboundQuantity: 0,
    outboundWeightKg: 200,
    transferOutboundQuantity: 0,
    transferOutboundWeightKg: 100,
    lastUpdated: '2026-03-15',
    ...overrides
  };
}

describe('inventoryReportFm09', () => {
  it('computes opening, period inbound/return/outbound/transfer, and closing quantities strictly without weight fields', () => {
    const openingRecords = [
      makeStockRecord({
        id: 'open-1',
        materialCode: 'VT-001',
        materialName: 'Thép tấm A36 10mm',
        unit: 'Tấm',
        packageNo: 'PKG-01',
        currentQuantity: 40
      }),
      makeStockRecord({
        id: 'open-2',
        materialCode: 'VT-001',
        materialName: 'Thép tấm A36 10mm',
        unit: 'Tấm',
        packageNo: 'PKG-02',
        currentQuantity: 30
      }),
      // Material with opening balance only (no movements during period)
      makeStockRecord({
        id: 'open-3',
        materialCode: 'VT-002',
        materialName: 'Bu lông M20',
        unit: 'Bộ',
        currentQuantity: 15
      }),
      // Dormant zero-stock material from prior period should be omitted
      makeStockRecord({
        id: 'open-zero',
        materialCode: 'VT-ZERO',
        materialName: 'Vật tư đã xuất hết',
        unit: 'Cái',
        currentQuantity: 0
      })
    ];

    const periodRecords = [
      makeStockRecord({
        id: 'per-1',
        materialCode: 'VT-001',
        materialName: 'Thép tấm A36 10mm',
        unit: 'Tấm',
        packageNo: 'PKG-01',
        inboundQuantity: 50,
        returnInboundQuantity: 10,
        outboundQuantity: 20,
        transferOutboundQuantity: 5
      }),
      makeStockRecord({
        id: 'per-2',
        materialCode: 'VT-003',
        materialName: 'Van bi DN50',
        unit: 'Cái',
        inboundQuantity: 12.5,
        returnInboundQuantity: 0,
        outboundQuantity: 2.5,
        transferOutboundQuantity: 0
      })
    ];

    const report = buildFm09QuantityReport(openingRecords, periodRecords, {
      groupByMaterial: true
    });

    assert.equal(report.rows.length, 3);

    const vt1 = report.rows.find((r) => r.materialCode === 'VT-001')!;
    assert.equal(vt1.openingQuantity, 70);
    assert.equal(vt1.inboundQuantity, 50);
    assert.equal(vt1.returnInboundQuantity, 10);
    assert.equal(vt1.outboundQuantity, 20);
    assert.equal(vt1.transferOutboundQuantity, 5);
    assert.equal(vt1.closingQuantity, 105);
    // Ensure strictly quantity-only fields (no weight or money properties)
    assert.equal('currentWeightKg' in vt1, false);
    assert.equal('inboundWeightKg' in vt1, false);

    const vt2 = report.rows.find((r) => r.materialCode === 'VT-002')!;
    assert.equal(vt2.openingQuantity, 15);
    assert.equal(vt2.inboundQuantity, 0);
    assert.equal(vt2.closingQuantity, 15);

    const vt3 = report.rows.find((r) => r.materialCode === 'VT-003')!;
    assert.equal(vt3.openingQuantity, 0);
    assert.equal(vt3.inboundQuantity, 12.5);
    assert.equal(vt3.outboundQuantity, 2.5);
    assert.equal(vt3.closingQuantity, 10);

    // Totals accounting identity
    assert.equal(report.totals.openingQuantity, 85);
    assert.equal(report.totals.inboundQuantity, 62.5);
    assert.equal(report.totals.returnInboundQuantity, 10);
    assert.equal(report.totals.outboundQuantity, 22.5);
    assert.equal(report.totals.transferOutboundQuantity, 5);
    assert.equal(report.totals.closingQuantity, 130);
  });

  it('preserves separate rows per package when groupByMaterial is false', () => {
    const periodRecords = [
      makeStockRecord({
        materialCode: 'VT-001',
        packageNo: 'PKG-01',
        inboundQuantity: 10
      }),
      makeStockRecord({
        materialCode: 'VT-001',
        packageNo: 'PKG-02',
        inboundQuantity: 25
      })
    ];

    const grouped = buildFm09QuantityReport([], periodRecords, { groupByMaterial: true });
    assert.equal(grouped.rows.length, 1);
    assert.equal(grouped.rows[0].inboundQuantity, 35);

    const ungrouped = buildFm09QuantityReport([], periodRecords, { groupByMaterial: false });
    assert.equal(ungrouped.rows.length, 2);
    assert.equal(ungrouped.totals.inboundQuantity, 35);
  });

  it('formats Vietnamese FM09 date ranges, quantities, and PDF filenames accurately', () => {
    assert.equal(
      formatFm09DateRange('2026-01-05', '2026-03-31'),
      'Từ ngày 05 tháng 01 năm 2026 đến ngày 31 tháng 03 năm 2026'
    );
    assert.equal(
      formatFm09DateRange('', ''),
      'Từ ngày....tháng....năm...... đến ngày....tháng....năm.......'
    );
    assert.equal(
      formatFm09DateRange('2026-02-01', ''),
      'Từ ngày 01 tháng 02 năm 2026 đến ngày....tháng....năm.......'
    );

    assert.equal(formatFm09Qty(0), '0');
    assert.equal(formatFm09Qty(-0), '0');
    assert.equal(formatFm09Qty(1250), '1.250');
    assert.equal(formatFm09Qty(12.5), '12,5');

    assert.equal(
      buildFm09PdfFileName('2026-01-01', '2026-03-31'),
      'BaoCao_NhapXuatTon_FM09_2026-01-01_den_2026-03-31.pdf'
    );
    assert.equal(
      buildFm09PdfFileName('', '', new Date(2026, 10, 27)),
      'BaoCao_NhapXuatTon_FM09_2026-11-27.pdf'
    );
  });
});
