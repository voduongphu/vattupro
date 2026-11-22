import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseOutboundExcel } from '../services/excelService.ts';
import type {
  InventoryStockRecord,
  MaterialItem,
  Warehouse
} from '../types/inventory.ts';
import { validateOutboundExcelImport } from './outboundImportValidation.ts';

function buildXlsxFile(aoa: any[][], fileName = 'outbound.xlsx'): File {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'XuatKho');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buf], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

const warehouses: Warehouse[] = [
  {
    id: 'wh-lp1',
    name: 'Kho Long Phú 1',
    code: 'WH-LP1',
    location: 'Sóc Trăng',
    type: 'covered',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'wh-cl',
    name: 'Kho Cát Lái',
    code: 'WH-CL',
    location: 'TP.HCM',
    type: 'covered',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z'
  }
];

const materials: MaterialItem[] = [
  {
    id: 'm-1',
    code: 'VT-VAL-100',
    name: 'Van cầu áp lực cao DN100',
    unit: 'Bộ',
    category: 'Đường ống',
    updatedAt: 100
  },
  {
    id: 'm-2',
    code: 'VT-PIPE-200',
    name: 'Ống thép đúc DN200 SCH40',
    unit: 'Ống',
    category: 'Đường ống',
    updatedAt: 100
  },
  {
    id: 'm-3',
    code: 'VT-ONLY-CAT',
    name: 'Mặt bích chỉ có trong danh mục',
    unit: 'Cái',
    category: 'Đường ống',
    updatedAt: 100
  }
];

const stockRecords: InventoryStockRecord[] = [
  {
    id: 'st-1',
    warehouseId: 'wh-lp1',
    warehouseName: 'Kho Long Phú 1',
    materialCode: 'VT-VAL-100',
    materialName: 'Van cầu áp lực cao DN100',
    unit: 'Bộ',
    packingListNo: 'PL-01',
    shipment: 'SHP-01',
    manufacturer: 'Kitz',
    supplier: 'PetroSteel',
    packageNo: 'PKG-01',
    packageName: 'Kiện 1',
    category: 'Đường ống',
    drawingNo: 'DWG-01',
    storageLocation: 'Bãi A',
    inboundQuantity: 10,
    inboundWeightKg: 1000,
    returnInboundQuantity: 0,
    returnInboundWeightKg: 0,
    outboundQuantity: 2,
    outboundWeightKg: 200,
    transferOutboundQuantity: 0,
    transferOutboundWeightKg: 0,
    currentQuantity: 8,
    currentWeightKg: 800,
    lastUpdated: '2026-05-01'
  },
  {
    id: 'st-2',
    warehouseId: 'wh-lp1',
    warehouseName: 'Kho Long Phú 1',
    materialCode: 'VT-PIPE-200',
    materialName: 'Ống thép đúc DN200 SCH40',
    unit: 'Ống',
    packingListNo: 'PL-02',
    shipment: 'SHP-02',
    manufacturer: 'Posco',
    supplier: 'PetroSteel',
    packageNo: 'LOT-02',
    packageName: 'Kiện 2',
    category: 'Đường ống',
    drawingNo: 'DWG-02',
    storageLocation: 'Bãi B',
    inboundQuantity: 5,
    inboundWeightKg: 2500,
    returnInboundQuantity: 0,
    returnInboundWeightKg: 0,
    outboundQuantity: 0,
    outboundWeightKg: 0,
    transferOutboundQuantity: 0,
    transferOutboundWeightKg: 0,
    currentQuantity: 5,
    currentWeightKg: 2500,
    lastUpdated: '2026-05-02'
  },
  {
    id: 'st-3',
    warehouseId: 'wh-cl',
    warehouseName: 'Kho Cát Lái',
    materialCode: 'VT-VAL-100',
    materialName: 'Van cầu áp lực cao DN100',
    unit: 'Bộ',
    packingListNo: 'PL-CL-01',
    shipment: 'SHP-CL',
    manufacturer: 'Kitz',
    supplier: 'PetroSteel',
    packageNo: 'PKG-CL',
    packageName: 'Kiện CL',
    category: 'Đường ống',
    drawingNo: 'DWG-01',
    storageLocation: 'Kệ 1',
    inboundQuantity: 3,
    inboundWeightKg: 300,
    returnInboundQuantity: 0,
    returnInboundWeightKg: 0,
    outboundQuantity: 0,
    outboundWeightKg: 0,
    transferOutboundQuantity: 0,
    transferOutboundWeightKg: 0,
    currentQuantity: 3,
    currentWeightKg: 300,
    lastUpdated: '2026-05-03'
  }
];

describe('validateOutboundExcelImport', () => {
  it('auto-resolves existing materialCode by materialName when materialCode is left blank and enriches stock metadata', () => {
    const summary = validateOutboundExcelImport({
      rows: [
        {
          issueCode: 'PXK-001',
          warehouseName: 'Kho Long Phú 1',
          materialCode: '',
          materialName: '  van cầu   áp lực cao DN100 ',
          quantity: 8,
          weightKg: 800
        }
      ],
      allWarehouses: warehouses,
      materials,
      stockRecords
    });

    assert.equal(summary.totalCount, 1);
    assert.equal(summary.validCount, 1);
    assert.equal(summary.errorRowCount, 0);
    assert.equal(summary.errorCodeCount, 0);

    const r = summary.results[0];
    assert.equal(r.valid, true);
    assert.equal(r.codeSource, 'catalog_or_stock');
    assert.equal(r.resolvedMaterialCode, 'VT-VAL-100');
    assert.equal(r.availableStockBefore, 8);
    assert.equal(r.availableStockAfter, 0);
    assert.equal(r.matchedStockMetadata?.packingListNo, 'PL-01');
    assert.equal(r.matchedStockMetadata?.packageNo, 'PKG-01');
  });

  it('rejects unstocked/unknown items and reports unique errorCodeCount while keeping only valid rows', () => {
    const summary = validateOutboundExcelImport({
      rows: [
        // 1. Valid: resolved by name, stock 8 >= 5 -> remaining 3
        {
          issueCode: 'PXK-010',
          warehouseName: 'Kho Long Phú 1',
          materialCode: '',
          materialName: 'Van cầu áp lực cao DN100',
          quantity: 5,
          weightKg: 500
        },
        // 2. Error: cumulative stock for VT-VAL-100 now 3 < 4
        {
          issueCode: 'PXK-010',
          warehouseName: 'Kho Long Phú 1',
          materialCode: 'VT-VAL-100',
          materialName: 'Van cầu áp lực cao DN100',
          quantity: 4,
          weightKg: 400
        },
        // 3. Valid: cumulative stock for VT-VAL-100 stayed 3 >= 3 -> remaining 0
        {
          issueCode: 'PXK-010',
          warehouseName: 'Kho Long Phú 1',
          materialCode: '',
          materialName: 'Van cầu áp lực cao DN100',
          quantity: 3,
          weightKg: 300
        },
        // 4. Error: exists in catalog only, never imported into stock (stock = 0)
        {
          issueCode: 'PXK-010',
          warehouseName: 'Kho Long Phú 1',
          materialCode: '',
          materialName: 'Mặt bích chỉ có trong danh mục',
          quantity: 2,
          weightKg: 20
        },
        // 5. Error: completely unknown material name with blank code
        {
          issueCode: 'PXK-010',
          warehouseName: 'Kho Long Phú 1',
          materialCode: '',
          materialName: 'Vật tư chưa từng nhập kho',
          quantity: 1,
          weightKg: 10
        },
        // 6. Error: duplicate error on same unknown material name across another row
        {
          issueCode: 'PXK-011',
          warehouseName: 'Kho Long Phú 1',
          materialCode: '',
          materialName: 'Vật tư chưa từng nhập kho',
          quantity: 2,
          weightKg: 20
        },
        // 7. Error: explicit code that does not exist in Kho Long Phú 1
        {
          issueCode: 'PXK-011',
          warehouseName: 'Kho Long Phú 1',
          materialCode: 'KHONG-TON-TAI',
          materialName: 'Vật tư lạ',
          quantity: 1,
          weightKg: 5
        },
        // 8. Valid: VT-PIPE-200 in Kho Long Phú 1 (stock 5 >= 2)
        {
          issueCode: 'PXK-011',
          warehouseName: 'Kho Long Phú 1',
          materialCode: 'VT-PIPE-200',
          materialName: 'Ống thép đúc DN200 SCH40',
          quantity: 2,
          weightKg: 1000
        }
      ],
      allWarehouses: warehouses,
      materials,
      stockRecords
    });

    assert.equal(summary.totalCount, 8);
    assert.equal(summary.validCount, 3);
    assert.equal(summary.errorRowCount, 5);
    // Distinct failing codes/names: VT-VAL-100, VT-ONLY-CAT, "vật tư chưa từng nhập kho", KHONG-TON-TAI => 4
    assert.equal(summary.errorCodeCount, 4);

    assert.equal(summary.results[0].valid, true);
    assert.equal(summary.results[1].valid, false);
    assert.equal(summary.results[1].errorCode, 'INSUFFICIENT_STOCK');
    assert.equal(summary.results[2].valid, true);
    assert.equal(summary.results[2].availableStockAfter, 0);
    assert.equal(summary.results[3].valid, false);
    assert.equal(summary.results[3].resolvedMaterialCode, 'VT-ONLY-CAT');
    assert.equal(summary.results[3].errorCode, 'NOT_IN_STOCK');
    assert.equal(summary.results[4].valid, false);
    assert.equal(summary.results[4].errorCode, 'MATERIAL_NOT_FOUND');
    assert.equal(summary.results[5].valid, false);
    assert.equal(summary.results[6].valid, false);
    assert.equal(summary.results[6].errorCode, 'NOT_IN_STOCK');
    assert.equal(summary.results[7].valid, true);
  });

  it('tracks stock per warehouse independently and detects unauthorized warehouses for non-admin users', () => {
    const summary = validateOutboundExcelImport({
      rows: [
        // Kho Cát Lái has only 3 of VT-VAL-100 (even though Long Phú 1 has 8) -> error
        {
          issueCode: 'PXK-CL-1',
          warehouseName: 'Kho Cát Lái',
          materialCode: '',
          materialName: 'Van cầu áp lực cao DN100',
          quantity: 5,
          weightKg: 500
        },
        // Kho Long Phú 1 is NOT authorized for this non-admin user -> error
        {
          issueCode: 'PXK-LP-1',
          warehouseName: 'Kho Long Phú 1',
          materialCode: 'VT-PIPE-200',
          materialName: 'Ống thép đúc DN200 SCH40',
          quantity: 1,
          weightKg: 500
        }
      ],
      allWarehouses: warehouses,
      authorizedWarehouses: [warehouses[1]],
      isAdmin: false,
      defaultWarehouseId: 'auto',
      materials,
      stockRecords
    });

    assert.equal(summary.validCount, 0);
    assert.equal(summary.errorRowCount, 2);
    assert.equal(summary.results[0].errorCode, 'INSUFFICIENT_STOCK');
    assert.equal(summary.results[0].availableStockBefore, 3);
    assert.equal(summary.results[1].errorCode, 'UNAUTHORIZED_WAREHOUSE');
  });

  it('parses real outbound Excel rows with blank materialCode and validates against warehouse stock', async () => {
    const file = buildXlsxFile([
      ['Số phiếu (*)', 'Kho xuất (*)', 'Mã vật tư', 'Tên vật tư (*)', 'ĐVT', 'Số lượng (*)', 'Khối lượng (Kg)'],
      ['PX-2026-099', 'Kho Long Phú 1', '', 'Van cầu áp lực cao DN100', 'Bộ', 3, 300],
      ['PX-2026-099', 'Kho Long Phú 1', '', 'Vật tư không tồn tại', 'Cái', 2, 10]
    ]);

    const parsed = await parseOutboundExcel(file);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.length, 2);

    const summary = validateOutboundExcelImport({
      rows: parsed.data,
      allWarehouses: warehouses,
      materials,
      stockRecords
    });

    assert.equal(summary.validCount, 1);
    assert.equal(summary.errorRowCount, 1);
    assert.equal(summary.errorCodeCount, 1);
    assert.equal(summary.validRows[0].validation.resolvedMaterialCode, 'VT-VAL-100');
    assert.equal(summary.errorRows[0].validation.errorCode, 'MATERIAL_NOT_FOUND');
  });
});
