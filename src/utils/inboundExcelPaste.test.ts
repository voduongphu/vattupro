import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  InboundItemDetail,
  InventoryStockRecord,
  MaterialItem,
  OutboundItemDetail
} from '../types/inventory.ts';
import {
  applyExcelPasteToInboundItems,
  applyExcelPasteToOutboundItems,
  parseExcelClipboardGrid,
  parsePastedNumber,
  shouldHandleBulkExcelPaste
} from './inboundExcelPaste.ts';

function makeBlankRow(idx: number): InboundItemDetail {
  return {
    id: `row-${idx}`,
    materialCode: '',
    materialName: '',
    unit: 'Ống',
    batchCode: '',
    packingListNo: 'PL-2026-01',
    shipment: 'SHP-01',
    packageNo: '',
    packageName: '',
    category: '',
    drawingNo: '',
    manufacturer: '',
    supplier: '',
    weightKg: 0,
    quantity: 1,
    unitPrice: 0,
    totalPrice: 0,
    storageLocation: 'Bãi A',
    conditionNote: '',
    note: ''
  };
}

const SAMPLE_CATALOG: MaterialItem[] = [
  {
    id: 'm1',
    code: 'VT-001',
    name: 'Ống thép đúc DN200 SCH40',
    unit: 'Cây',
    category: 'Đường ống',
    packageNo: 'PKG-01',
    drawingNo: 'DWG-001',
    manufacturer: 'Nippon Steel',
    supplier: 'PetroSupply',
    unitWeightKg: 120.5
  },
  {
    id: 'm2',
    code: 'VT-002',
    name: 'Mặt bích hàn cổ 8 inch 150#',
    unit: 'Cái',
    category: 'Phụ kiện',
    packageNo: 'PKG-02',
    drawingNo: 'DWG-002',
    manufacturer: 'Kitz',
    supplier: 'PetroSupply',
    unitWeightKg: 18
  }
];

const byCode = (code: string) =>
  SAMPLE_CATALOG.find((m) => m.code.toLowerCase() === code.trim().toLowerCase());
const byName = (name: string) =>
  SAMPLE_CATALOG.find(
    (m) => m.name.normalize('NFC').trim().toLowerCase() === name.normalize('NFC').trim().toLowerCase()
  );

describe('inboundExcelPaste', () => {
  it('parses Excel TSV clipboard data including quoted multiline cells and trailing newlines', () => {
    const raw = 'VT-001\t"20""x12m PIPE\r\nAPI 5L B"\tPKG-01\r\nVT-002\tMặt bích 8"\tPKG-02\r\n';
    const grid = parseExcelClipboardGrid(raw);
    assert.deepEqual(grid, [
      ['VT-001', '20"x12m PIPE API 5L B', 'PKG-01'],
      ['VT-002', 'Mặt bích 8"', 'PKG-02']
    ]);

    assert.equal(shouldHandleBulkExcelPaste('VT-001'), false);
    assert.equal(shouldHandleBulkExcelPaste('VT-001\r\n'), false);
    assert.equal(shouldHandleBulkExcelPaste('VT-001\r\nVT-002\r\n'), true);
    assert.equal(shouldHandleBulkExcelPaste('VT-001\tỐng thép'), true);
  });

  it('auto-adds rows and fills catalog metadata when pasting multiple material codes from Excel', () => {
    const grid = parseExcelClipboardGrid('VT-001\r\nVT-002\r\nVT-NEW-03\r\nVT-NEW-04\r\n');
    const result = applyExcelPasteToInboundItems({
      existingItems: [makeBlankRow(0)],
      startRowIndex: 0,
      startField: 'materialCode',
      grid,
      createBlankRow: makeBlankRow,
      findMaterialByCode: byCode,
      findMaterialByName: byName
    });

    assert.equal(result.items.length, 4);
    assert.equal(result.pastedRowCount, 4);
    assert.equal(result.addedRowCount, 3);
    assert.equal(result.matchedCatalogCount, 2);

    assert.equal(result.items[0].materialCode, 'VT-001');
    assert.equal(result.items[0].materialName, 'Ống thép đúc DN200 SCH40');
    assert.equal(result.items[0].unit, 'Cây');
    assert.equal(result.items[0].packageNo, 'PKG-01');
    assert.equal(result.items[0].weightKg, 120.5);

    assert.equal(result.items[1].materialCode, 'VT-002');
    assert.equal(result.items[1].materialName, 'Mặt bích hàn cổ 8 inch 150#');
    assert.equal(result.items[1].unit, 'Cái');
    assert.equal(result.items[1].weightKg, 18);

    assert.equal(result.items[2].materialCode, 'VT-NEW-03');
    assert.equal(result.items[2].materialName, '');
    assert.equal(result.items[2].storageLocation, 'Bãi A');

    assert.equal(result.items[3].materialCode, 'VT-NEW-04');
  });

  it('auto-adds rows and resolves material codes when pasting multiple material names from Excel', () => {
    const grid = parseExcelClipboardGrid(
      'Ống thép đúc DN200 SCH40\nMặt bích hàn cổ 8 inch 150#\nVan bi inox DN50\n'
    );
    const result = applyExcelPasteToInboundItems({
      existingItems: [makeBlankRow(0)],
      startRowIndex: 0,
      startField: 'materialName',
      grid,
      createBlankRow: makeBlankRow,
      findMaterialByCode: byCode,
      findMaterialByName: byName
    });

    assert.equal(result.items.length, 3);
    assert.equal(result.addedRowCount, 2);
    assert.equal(result.matchedCatalogCount, 2);

    assert.equal(result.items[0].materialCode, 'VT-001');
    assert.equal(result.items[0].materialName, 'Ống thép đúc DN200 SCH40');
    assert.equal(result.items[0].unit, 'Cây');

    assert.equal(result.items[1].materialCode, 'VT-002');
    assert.equal(result.items[1].unit, 'Cái');

    assert.equal(result.items[2].materialCode, '');
    assert.equal(result.items[2].materialName, 'Van bi inox DN50');
  });

  it('supports multi-column Excel paste (code + name + packageNo + batch + qty + unit + weight + price) and computes totalPrice', () => {
    const raw =
      'VT-001\tỐng thép tùy chỉnh\tPKG-99\tLOT-A\t10\tCây\t1,250.5\t500,000\tKệ C1\tHàng gấp\r\n' +
      'VT-002\t\tPKG-88\tLOT-B\t5\t\t\t200.000\tKệ C2\t\r\n';
    const grid = parseExcelClipboardGrid(raw);
    const result = applyExcelPasteToInboundItems({
      existingItems: [makeBlankRow(0)],
      startRowIndex: 0,
      startField: 'materialCode',
      grid,
      createBlankRow: makeBlankRow,
      findMaterialByCode: byCode,
      findMaterialByName: byName
    });

    assert.equal(result.items.length, 2);
    assert.equal(result.addedRowCount, 1);

    // Row 0: explicit pasted values take precedence over catalog defaults
    assert.equal(result.items[0].materialCode, 'VT-001');
    assert.equal(result.items[0].materialName, 'Ống thép tùy chỉnh');
    assert.equal(result.items[0].packageNo, 'PKG-99');
    assert.equal(result.items[0].batchCode, 'LOT-A');
    assert.equal(result.items[0].quantity, 10);
    assert.equal(result.items[0].weightKg, 1250.5);
    assert.equal(result.items[0].unitPrice, 500000);
    assert.equal(result.items[0].totalPrice, 5000000);
    assert.equal(result.items[0].storageLocation, 'Kệ C1');
    assert.equal(result.items[0].note, 'Hàng gấp');

    // Row 1: blank name/unit/weight auto-filled from catalog (5 * 18kg = 90kg)
    assert.equal(result.items[1].materialName, 'Mặt bích hàn cổ 8 inch 150#');
    assert.equal(result.items[1].unit, 'Cái');
    assert.equal(result.items[1].quantity, 5);
    assert.equal(result.items[1].weightKg, 90);
    assert.equal(result.items[1].unitPrice, 200);
    assert.equal(result.items[1].totalPrice, 1000);
  });

  it('parses localized Excel numbers reliably', () => {
    assert.equal(parsePastedNumber('1,250.5'), 1250.5);
    assert.equal(parsePastedNumber('1.250,5'), 1250.5);
    assert.equal(parsePastedNumber('12,5'), 12.5);
    assert.equal(parsePastedNumber('1,500'), 1500);
    assert.equal(parsePastedNumber('1.250.000 VNĐ'), 1250000);
    assert.equal(parsePastedNumber(''), null);
    assert.equal(parsePastedNumber('abc'), null);
  });
});

function makeBlankOutboundRow(idx: number): OutboundItemDetail {
  return {
    id: `out-row-${idx}`,
    materialCode: '',
    materialName: '',
    unit: 'Ống',
    batchCode: '',
    packingListNo: 'N/A',
    shipment: 'N/A',
    packageNo: '',
    packageName: '',
    category: 'Vật tư dự án',
    drawingNo: 'N/A',
    manufacturer: 'N/A',
    supplier: 'N/A',
    quantity: 1,
    weightKg: 0,
    purpose: '',
    note: ''
  };
}

const SAMPLE_STOCK: InventoryStockRecord[] = [
  {
    id: 'st-1',
    warehouseId: 'wh-1',
    warehouseName: 'Kho Dung Quất',
    packingListNo: 'PL-2026-88',
    shipment: 'SHP-88',
    packageNo: 'PKG-STK-01',
    packageName: 'Kiện PKG-STK-01',
    materialCode: 'VT-001',
    materialName: 'Ống thép đúc DN200 SCH40',
    unit: 'Cây',
    category: 'Đường ống',
    drawingNo: 'DWG-001',
    manufacturer: 'Nippon Steel',
    supplier: 'PetroSupply',
    storageLocation: 'Bãi A1',
    currentQuantity: 8,
    currentWeightKg: 800,
    inboundQuantity: 10,
    inboundWeightKg: 1000,
    returnInboundQuantity: 0,
    returnInboundWeightKg: 0,
    outboundQuantity: 2,
    outboundWeightKg: 200,
    transferOutboundQuantity: 0,
    transferOutboundWeightKg: 0,
    lastUpdated: '2026-11-24T00:00:00.000Z'
  }
];

const stockByCode = (code: string) =>
  SAMPLE_STOCK.find((s) => s.materialCode.toLowerCase() === code.trim().toLowerCase());
const stockByName = (name: string) =>
  SAMPLE_STOCK.find(
    (s) => s.materialName.normalize('NFC').trim().toLowerCase() === name.normalize('NFC').trim().toLowerCase()
  );

describe('outboundExcelPaste', () => {
  it('auto-adds rows into an empty outbound table and matches stock first then catalog fallback', () => {
    const grid = parseExcelClipboardGrid('VT-001\r\nVT-002\r\nVT-MANUAL-03\r\n');
    const result = applyExcelPasteToOutboundItems({
      existingItems: [],
      startRowIndex: 0,
      startField: 'materialCode',
      grid,
      createBlankRow: makeBlankOutboundRow,
      findStockByCode: stockByCode,
      findStockByName: stockByName,
      findMaterialByCode: byCode,
      findMaterialByName: byName
    });

    assert.equal(result.items.length, 3);
    assert.equal(result.addedRowCount, 3);
    assert.equal(result.matchedStockCount, 1);
    assert.equal(result.matchedCatalogCount, 1);

    // Row 0: matched from stock (800kg / 8 = 100kg per unit * qty 1 = 100kg)
    assert.equal(result.items[0].materialCode, 'VT-001');
    assert.equal(result.items[0].materialName, 'Ống thép đúc DN200 SCH40');
    assert.equal(result.items[0].batchCode, 'PKG-STK-01');
    assert.equal(result.items[0].packingListNo, 'PL-2026-88');
    assert.equal(result.items[0].shipment, 'SHP-88');
    assert.equal(result.items[0].unit, 'Cây');
    assert.equal(result.items[0].weightKg, 100);

    // Row 1: matched from catalog fallback (18kg * 1)
    assert.equal(result.items[1].materialCode, 'VT-002');
    assert.equal(result.items[1].materialName, 'Mặt bích hàn cổ 8 inch 150#');
    assert.equal(result.items[1].batchCode, 'PKG-02');
    assert.equal(result.items[1].unit, 'Cái');
    assert.equal(result.items[1].weightKg, 18);

    // Row 2: unmatched manual code preserved cleanly
    assert.equal(result.items[2].materialCode, 'VT-MANUAL-03');
    assert.equal(result.items[2].materialName, '');
  });

  it('auto-adds rows and resolves codes when pasting multiple material names into outbound', () => {
    const grid = parseExcelClipboardGrid(
      'Ống thép đúc DN200 SCH40\nMặt bích hàn cổ 8 inch 150#\nBu lông neo M24\n'
    );
    const result = applyExcelPasteToOutboundItems({
      existingItems: [makeBlankOutboundRow(0)],
      startRowIndex: 0,
      startField: 'materialName',
      grid,
      createBlankRow: makeBlankOutboundRow,
      findStockByCode: stockByCode,
      findStockByName: stockByName,
      findMaterialByCode: byCode,
      findMaterialByName: byName
    });

    assert.equal(result.items.length, 3);
    assert.equal(result.addedRowCount, 2);
    assert.equal(result.matchedStockCount, 1);
    assert.equal(result.matchedCatalogCount, 1);

    assert.equal(result.items[0].materialCode, 'VT-001');
    assert.equal(result.items[0].packingListNo, 'PL-2026-88');
    assert.equal(result.items[1].materialCode, 'VT-002');
    assert.equal(result.items[1].unit, 'Cái');
    assert.equal(result.items[2].materialCode, '');
    assert.equal(result.items[2].materialName, 'Bu lông neo M24');
  });

  it('supports multi-column outbound paste where explicit pasted values override defaults', () => {
    const raw =
      'VT-001\tỐng thép cắt ngắn\tLOT-CUSTOM\t4\tCây\t420.5\tXuất tổ lắp ống\r\n' +
      'VT-002\t\t\t5\t\t\tXuất dự phòng\r\n';
    const grid = parseExcelClipboardGrid(raw);
    const result = applyExcelPasteToOutboundItems({
      existingItems: [],
      startRowIndex: 0,
      startField: 'materialCode',
      grid,
      createBlankRow: makeBlankOutboundRow,
      findStockByCode: stockByCode,
      findStockByName: stockByName,
      findMaterialByCode: byCode,
      findMaterialByName: byName
    });

    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].materialName, 'Ống thép cắt ngắn');
    assert.equal(result.items[0].batchCode, 'LOT-CUSTOM');
    assert.equal(result.items[0].quantity, 4);
    assert.equal(result.items[0].weightKg, 420.5);
    assert.equal(result.items[0].note, 'Xuất tổ lắp ống');

    // Row 1: blank name/batch/unit/weight auto-filled from catalog (5 * 18kg = 90kg)
    assert.equal(result.items[1].materialName, 'Mặt bích hàn cổ 8 inch 150#');
    assert.equal(result.items[1].batchCode, 'PKG-02');
    assert.equal(result.items[1].unit, 'Cái');
    assert.equal(result.items[1].quantity, 5);
    assert.equal(result.items[1].weightKg, 90);
    assert.equal(result.items[1].note, 'Xuất dự phòng');
  });
});
