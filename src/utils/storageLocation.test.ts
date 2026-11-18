import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseInboundExcel } from '../services/excelService.ts';
import {
  applyStockAttributeFilters,
  buildAggregatedRecords,
  mergeRecordsForInventoryReport
} from '../services/storage.ts';
import type { InboundReceipt, OutboundReceipt } from '../types/inventory.ts';

function buildXlsxFile(aoa: any[][], fileName = 'inbound.xlsx'): File {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'NhapKho');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buf], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

describe('parseInboundExcel storageLocation extraction', () => {
  it('parses the "Vị trí lưu kho/bãi" column accurately and avoids misrouting composite warehouse/location headers', async () => {
    const file = buildXlsxFile([
      [
        'Số phiếu (*)',
        'Kho tiếp nhận (*)',
        'Mã vật tư (*)',
        'Tên vật tư (*)',
        'ĐVT (*)',
        'Số lượng (*)',
        'Khối lượng (Kg) (*)',
        'Vị trí lưu kho / Warehouse location'
      ],
      ['PNK-001', 'Kho Long Phú 1', 'VT-01', 'Ống thép DN100', 'Ống', 2, 400, 'Bãi A - Kệ 01'],
      ['PNK-001', 'Kho Long Phú 1', 'VT-02', 'Van bi DN50', 'Cái', 5, 50, '']
    ]);

    const res = await parseInboundExcel(file);
    assert.equal(res.success, true);
    assert.equal(res.data.length, 2);
    assert.equal(res.data[0].warehouseName, 'Kho Long Phú 1');
    assert.equal(res.data[0].storageLocation, 'Bãi A - Kệ 01');
    assert.equal(res.data[1].warehouseName, 'Kho Long Phú 1');
    assert.equal(res.data[1].storageLocation, undefined);
  });

  it('extracts sheet header metadata "Vị trí lưu kho/bãi:" as fallback while keeping row-level overrides', async () => {
    const file = buildXlsxFile([
      ['PHIẾU NHẬP KHO'],
      ['Số phiếu:', 'PNK26-0099', '', 'Kho tiếp nhận:', 'Kho Cát Lái'],
      ['Vị trí lưu kho/bãi:', 'Khu C - Dãy 04'],
      ['STT', 'Mã vật tư', 'Tên vật tư', 'ĐVT', 'Số lượng', 'Khối lượng', 'Vị trí lưu kho/bãi'],
      [1, 'PIPE-01', 'Ống API 5L', 'Cây', 3, 900, ''],
      [2, 'PIPE-02', 'Co thép 90', 'Cái', 4, 80, 'Kệ B2 - Tầng 1']
    ]);

    const res = await parseInboundExcel(file);
    assert.equal(res.success, true);
    assert.equal(res.data.length, 2);
    assert.equal((res.data[0] as any).receiptCode, 'PNK26-0099');
    assert.equal(res.data[0].warehouseName, 'Kho Cát Lái');
    assert.equal(res.data[0].storageLocation, 'Khu C - Dãy 04');
    assert.equal(res.data[1].storageLocation, 'Kệ B2 - Tầng 1');
  });
});

describe('storageLocation aggregation, cross-warehouse merge, and filtering', () => {
  const whMap = new Map<string, string>([
    ['wh-1', 'Kho Long Phú 1'],
    ['wh-2', 'Kho Cát Lái']
  ]);

  const inbounds: InboundReceipt[] = [
    {
      id: 'in-1',
      receiptCode: 'PN-01',
      receiptDate: '2026-05-01',
      inboundType: 'new',
      warehouseId: 'wh-1',
      warehouseName: 'Kho Long Phú 1',
      supplier: 'PetroSteel',
      shipment: 'SHP-01',
      packingListNo: 'PL-01',
      delivererName: 'Nguyen A',
      receiverName: 'Thu Kho',
      totalQuantity: 10,
      totalWeightKg: 1000,
      createdAt: '2026-05-01T08:00:00Z',
      createdBy: 'admin',
      items: [
        {
          id: 'it-1',
          materialCode: 'VAL-100',
          materialName: 'Van cầu DN100',
          unit: 'Bộ',
          quantity: 6,
          weightKg: 600,
          packingListNo: 'PL-01',
          shipment: 'SHP-01',
          packageNo: 'PKG-01',
          packageName: 'Kiện 1',
          category: 'Piping',
          drawingNo: 'DWG-01',
          manufacturer: 'Kitz',
          supplier: 'PetroSteel',
          storageLocation: 'Bãi A - Khu 01'
        }
      ]
    },
    {
      id: 'in-2',
      receiptCode: 'PN-02',
      receiptDate: '2026-05-02',
      inboundType: 'return',
      warehouseId: 'wh-1',
      warehouseName: 'Kho Long Phú 1',
      supplier: 'PetroSteel',
      shipment: 'SHP-01',
      packingListNo: 'PL-01',
      delivererName: 'Tran B',
      receiverName: 'Thu Kho',
      totalQuantity: 4,
      totalWeightKg: 400,
      createdAt: '2026-05-02T08:00:00Z',
      createdBy: 'admin',
      items: [
        {
          id: 'it-2',
          materialCode: 'VAL-100',
          materialName: 'Van cầu DN100',
          unit: 'Bộ',
          quantity: 4,
          weightKg: 400,
          packingListNo: 'PL-01',
          shipment: 'SHP-01',
          packageNo: 'PKG-01',
          packageName: 'Kiện 1',
          category: 'Piping',
          drawingNo: 'DWG-01',
          manufacturer: 'Kitz',
          supplier: 'PetroSteel',
          storageLocation: 'Kho K2 - Kệ 03'
        }
      ]
    },
    {
      id: 'in-3',
      receiptCode: 'PN-03',
      receiptDate: '2026-05-03',
      inboundType: 'new',
      warehouseId: 'wh-2',
      warehouseName: 'Kho Cát Lái',
      supplier: 'PetroSteel',
      shipment: 'SHP-01',
      packingListNo: 'PL-01',
      delivererName: 'Le C',
      receiverName: 'Thu Kho',
      totalQuantity: 2,
      totalWeightKg: 200,
      createdAt: '2026-05-03T08:00:00Z',
      createdBy: 'admin',
      items: [
        {
          id: 'it-3',
          materialCode: 'VAL-100',
          materialName: 'Van cầu DN100',
          unit: 'Bộ',
          quantity: 2,
          weightKg: 200,
          packingListNo: 'PL-01',
          shipment: 'SHP-01',
          packageNo: 'PKG-01',
          packageName: 'Kiện 1',
          category: 'Piping',
          drawingNo: 'DWG-01',
          manufacturer: 'Kitz',
          supplier: 'PetroSteel',
          storageLocation: 'Bãi A - Khu 01 | Kho K3 - Tầng 2'
        }
      ]
    }
  ];

  const outbounds: OutboundReceipt[] = [
    {
      id: 'out-1',
      issueCode: 'PX-01',
      issueDate: '2026-05-04',
      outboundType: 'issue',
      warehouseId: 'wh-1',
      warehouseName: 'Kho Long Phú 1',
      recipientName: 'Đội 1',
      recipientDepartment: 'Đội 1',
      issuerName: 'Thu Kho',
      projectName: 'Dự án A',
      totalQuantity: 3,
      totalWeightKg: 300,
      createdAt: '2026-05-04T08:00:00Z',
      createdBy: 'admin',
      items: [
        {
          id: 'oit-1',
          materialCode: 'VAL-100',
          materialName: 'Van cầu DN100',
          unit: 'Bộ',
          quantity: 3,
          weightKg: 300,
          packingListNo: 'PL-01',
          shipment: 'SHP-01',
          packageNo: 'PKG-01',
          packageName: 'Kiện 1',
          category: 'Piping',
          drawingNo: 'DWG-01',
          manufacturer: 'Kitz',
          supplier: 'PetroSteel'
        }
      ]
    }
  ];

  it('aggregates distinct storage locations and keeps them intact after outbound deductions', () => {
    const records = buildAggregatedRecords(inbounds, outbounds, whMap);
    const wh1Rec = records.find((r) => r.warehouseId === 'wh-1');
    assert.ok(wh1Rec);
    assert.equal(wh1Rec.currentQuantity, 7);
    assert.equal(wh1Rec.storageLocation, 'Bãi A - Khu 01 | Kho K2 - Kệ 03');

    const merged = mergeRecordsForInventoryReport(records);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].currentQuantity, 9);
    assert.equal(merged[0].storageLocation, 'Bãi A - Khu 01 | Kho K2 - Kệ 03 | Kho K3 - Tầng 2');
  });

  it('filters stock records by dedicated storageLocation filter and global searchQuery', () => {
    const records = buildAggregatedRecords(inbounds, outbounds, whMap);
    assert.equal(applyStockAttributeFilters(records, { storageLocation: 'Kho K3' }).length, 1);
    assert.equal(applyStockAttributeFilters(records, { storageLocation: 'Bãi A' }).length, 2);
    assert.equal(applyStockAttributeFilters(records, { storageLocation: 'Không tồn tại' }).length, 0);
    assert.equal(applyStockAttributeFilters(records, { searchQuery: 'Kệ 03' }).length, 1);
  });
});
