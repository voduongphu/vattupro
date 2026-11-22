import type {
  InboundReceipt,
  InventoryStockRecord,
  MaterialItem,
  OutboundItemDetail,
  Warehouse
} from '../types/inventory.ts';
import {
  foldVietnameseAscii,
  normalizeMaterialNameLookupKey,
  normKey,
  roundQty
} from './additiveMerge.ts';

export type OutboundCodeSource = 'explicit' | 'catalog_or_stock' | 'not_found';

export type OutboundValidationErrorCode =
  | 'UNAUTHORIZED_WAREHOUSE'
  | 'INVALID_QUANTITY'
  | 'MATERIAL_NOT_FOUND'
  | 'NOT_IN_STOCK'
  | 'INSUFFICIENT_STOCK';

export interface OutboundMatchedStockMetadata {
  packingListNo?: string;
  shipment?: string;
  packageNo?: string;
  packageName?: string;
  unit?: string;
  category?: string;
  drawingNo?: string;
  manufacturer?: string;
  supplier?: string;
}

export interface OutboundRowValidationResult {
  rowIndex: number;
  valid: boolean;
  resolvedWarehouse: Warehouse;
  unauthorizedWarehouseName?: string;
  resolvedMaterialCode: string;
  resolvedMaterialName: string;
  codeSource: OutboundCodeSource;
  requestedQty: number;
  requestedWeightKg: number;
  availableStockBefore: number;
  availableStockAfter: number;
  otherWarehouseStockTotal: number;
  matchedStockMetadata?: OutboundMatchedStockMetadata;
  errorCode?: OutboundValidationErrorCode;
  errorMessage?: string;
}

export interface OutboundValidatedRowEntry {
  rowIndex: number;
  row: Partial<OutboundItemDetail> & Record<string, any>;
  validation: OutboundRowValidationResult;
}

export interface OutboundImportValidationSummary {
  results: OutboundRowValidationResult[];
  validRows: OutboundValidatedRowEntry[];
  errorRows: OutboundValidatedRowEntry[];
  totalCount: number;
  validCount: number;
  errorRowCount: number;
  errorCodeCount: number;
  validCodeCount: number;
  errorCodes: string[];
}

export interface OutboundImportValidationParams {
  rows: Array<Partial<OutboundItemDetail> & Record<string, any>>;
  allWarehouses: Warehouse[];
  authorizedWarehouses?: Warehouse[];
  isAdmin?: boolean;
  defaultWarehouseId?: string;
  materials: MaterialItem[];
  stockRecords: InventoryStockRecord[];
  inbounds?: InboundReceipt[];
}

const DEFAULT_FALLBACK_WAREHOUSE: Warehouse = {
  id: 'wh-01',
  name: 'Kho Tổng Trung Tâm',
  code: 'WH-01',
  location: 'Khu dự án',
  type: 'covered',
  status: 'active',
  createdAt: '1970-01-01T00:00:00.000Z'
};

export function isBlankOutboundField(raw?: string | null): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return true;
  const upper = s.toUpperCase();
  return (
    upper === 'N/A' ||
    upper === 'NA' ||
    upper === '-' ||
    upper === '--' ||
    upper === 'NULL' ||
    upper === 'NONE'
  );
}

function fmtNum(val: number): string {
  return roundQty(val).toLocaleString('vi-VN');
}

function matchWarehouseByQuery(list: Warehouse[], rawName: string): Warehouse | undefined {
  const trimmed = rawName.trim().toLowerCase();
  if (!trimmed) return undefined;

  const exact = list.find(
    (w) => w.name.toLowerCase() === trimmed || w.code.toLowerCase() === trimmed
  );
  if (exact) return exact;

  const folded = foldVietnameseAscii(rawName);
  if (folded) {
    const foldedExact = list.find(
      (w) =>
        foldVietnameseAscii(w.name) === folded || foldVietnameseAscii(w.code) === folded
    );
    if (foldedExact) return foldedExact;
  }

  const partial = list.find((w) => {
    const wName = w.name.toLowerCase();
    return wName.includes(trimmed) || trimmed.includes(wName);
  });
  if (partial) return partial;

  if (folded) {
    return list.find((w) => {
      const wFolded = foldVietnameseAscii(w.name);
      return Boolean(wFolded) && (wFolded.includes(folded) || folded.includes(wFolded));
    });
  }

  return undefined;
}

function extractBucketMetadata(rec: InventoryStockRecord): OutboundMatchedStockMetadata {
  return {
    packingListNo: !isBlankOutboundField(rec.packingListNo) ? rec.packingListNo : undefined,
    shipment: !isBlankOutboundField(rec.shipment) ? rec.shipment : undefined,
    packageNo: !isBlankOutboundField(rec.packageNo) ? rec.packageNo : undefined,
    packageName: !isBlankOutboundField(rec.packageName) ? rec.packageName : undefined,
    unit: !isBlankOutboundField(rec.unit) ? rec.unit : undefined,
    category: !isBlankOutboundField(rec.category) ? rec.category : undefined,
    drawingNo: !isBlankOutboundField(rec.drawingNo) ? rec.drawingNo : undefined,
    manufacturer: !isBlankOutboundField(rec.manufacturer) ? rec.manufacturer : undefined,
    supplier: !isBlankOutboundField(rec.supplier) ? rec.supplier : undefined
  };
}

interface StockNameCandidate {
  warehouseId: string;
  code: string;
  name: string;
  currentQuantity: number;
  packageNo: string;
  packingListNo: string;
}

export function validateOutboundExcelImport(
  params: OutboundImportValidationParams
): OutboundImportValidationSummary {
  const {
    rows,
    allWarehouses,
    authorizedWarehouses,
    isAdmin = true,
    defaultWarehouseId = 'auto',
    materials,
    stockRecords,
    inbounds
  } = params;

  const safeAllWh = Array.isArray(allWarehouses) ? allWarehouses : [];
  const scopedWhList =
    isAdmin || !Array.isArray(authorizedWarehouses)
      ? safeAllWh.length > 0
        ? safeAllWh
        : Array.isArray(authorizedWarehouses)
          ? authorizedWarehouses
          : []
      : authorizedWarehouses;

  const fallbackWh: Warehouse =
    scopedWhList[0] || safeAllWh[0] || DEFAULT_FALLBACK_WAREHOUSE;

  const selectedDefaultWh: Warehouse =
    defaultWarehouseId && defaultWarehouseId !== 'auto'
      ? scopedWhList.find((w) => w.id === defaultWarehouseId) || fallbackWh
      : fallbackWh;

  const whResolveCache = new Map<
    string,
    { warehouse: Warehouse; unauthorizedWarehouseName?: string }
  >();

  const resolveRowWarehouse = (
    itemWhName?: string
  ): { warehouse: Warehouse; unauthorizedWarehouseName?: string } => {
    const raw = String(itemWhName ?? '').trim();
    if (!raw) {
      return { warehouse: selectedDefaultWh };
    }
    const cacheKey = raw.toLowerCase();
    const cached = whResolveCache.get(cacheKey);
    if (cached) return cached;

    const matchedAllowed = matchWarehouseByQuery(scopedWhList, raw);
    if (matchedAllowed) {
      const resolved = { warehouse: matchedAllowed };
      whResolveCache.set(cacheKey, resolved);
      return resolved;
    }

    if (!isAdmin) {
      const matchedOther = matchWarehouseByQuery(safeAllWh, raw);
      if (matchedOther) {
        const resolved = {
          warehouse: matchedOther,
          unauthorizedWarehouseName: matchedOther.name
        };
        whResolveCache.set(cacheKey, resolved);
        return resolved;
      }
    }

    const resolved = { warehouse: selectedDefaultWh };
    whResolveCache.set(cacheKey, resolved);
    return resolved;
  };

  // 1. Tổng hợp tồn kho thực tế theo (warehouseId, materialCode)
  const stockQtyByWhCode = new Map<string, number>();
  const stockWeightByWhCode = new Map<string, number>();
  const hasInboundByWhCode = new Set<string>();
  const totalPositiveStockByCode = new Map<string, number>();
  const bucketsByWhCode = new Map<string, InventoryStockRecord[]>();

  // Tra cứu Tên -> Mã từ tồn kho (ưu tiên cao nhất khi người dùng bỏ trống Mã vật tư)
  const stockExactNameMap = new Map<string, StockNameCandidate[]>();
  const stockFoldedNameMap = new Map<string, StockNameCandidate[]>();
  const bestNameByCode = new Map<string, string>();

  const pushStockNameCandidate = (
    map: Map<string, StockNameCandidate[]>,
    key: string,
    cand: StockNameCandidate
  ) => {
    if (!key) return;
    let list = map.get(key);
    if (!list) {
      list = [];
      map.set(key, list);
    }
    list.push(cand);
  };

  for (let i = 0; i < stockRecords.length; i++) {
    const rec = stockRecords[i];
    if (!rec) continue;
    const codeKey = normKey(rec.materialCode);
    if (!codeKey || codeKey === 'N/A') continue;

    const whCodeKey = `${rec.warehouseId}__${codeKey}`;
    const qty = Number(rec.currentQuantity) || 0;
    const weight = Number(rec.currentWeightKg) || 0;

    stockQtyByWhCode.set(whCodeKey, (stockQtyByWhCode.get(whCodeKey) || 0) + qty);
    stockWeightByWhCode.set(whCodeKey, (stockWeightByWhCode.get(whCodeKey) || 0) + weight);

    if ((Number(rec.inboundQuantity) || 0) > 0 || (Number(rec.returnInboundQuantity) || 0) > 0) {
      hasInboundByWhCode.add(whCodeKey);
    }
    if (qty > 0) {
      totalPositiveStockByCode.set(
        codeKey,
        (totalPositiveStockByCode.get(codeKey) || 0) + qty
      );
    }

    let buckets = bucketsByWhCode.get(whCodeKey);
    if (!buckets) {
      buckets = [];
      bucketsByWhCode.set(whCodeKey, buckets);
    }
    buckets.push(rec);

    const recName = String(rec.materialName || '').trim();
    if (recName && recName !== 'Vật tư' && recName !== 'N/A') {
      if (!bestNameByCode.has(codeKey)) {
        bestNameByCode.set(codeKey, recName);
      }
      const cand: StockNameCandidate = {
        warehouseId: rec.warehouseId,
        code: codeKey,
        name: recName,
        currentQuantity: qty,
        packageNo: String(rec.packageNo || '').trim(),
        packingListNo: String(rec.packingListNo || '').trim()
      };
      pushStockNameCandidate(stockExactNameMap, normalizeMaterialNameLookupKey(recName), cand);
      pushStockNameCandidate(stockFoldedNameMap, foldVietnameseAscii(recName), cand);
    }
  }

  bucketsByWhCode.forEach((list) => {
    list.sort((a, b) => (Number(b.currentQuantity) || 0) - (Number(a.currentQuantity) || 0));
  });

  // 2. Tra cứu Tên -> Mã từ Danh mục vật tư (fallback khi kho xuất chưa có tồn hoặc mới tạo danh mục)
  const catalogExactNameMap = new Map<string, { code: string; name: string; updatedAt: number }>();
  const catalogFoldedNameMap = new Map<string, { code: string; name: string; updatedAt: number }>();
  const materialByCode = new Map<string, MaterialItem>();

  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    if (!m) continue;
    const codeKey = normKey(m.code);
    if (!codeKey || codeKey === 'N/A') continue;
    materialByCode.set(codeKey, m);
    if (m.name && !bestNameByCode.has(codeKey)) {
      bestNameByCode.set(codeKey, m.name);
    }

    const exactKey = normalizeMaterialNameLookupKey(m.name);
    const ts = Number(m.updatedAt) || 0;
    if (exactKey) {
      const prev = catalogExactNameMap.get(exactKey);
      if (!prev || ts >= prev.updatedAt) {
        catalogExactNameMap.set(exactKey, { code: codeKey, name: m.name, updatedAt: ts });
      }
    }

    const foldedKey = foldVietnameseAscii(m.name);
    if (foldedKey) {
      const prev = catalogFoldedNameMap.get(foldedKey);
      if (!prev || ts >= prev.updatedAt) {
        catalogFoldedNameMap.set(foldedKey, { code: codeKey, name: m.name, updatedAt: ts });
      }
    }
  }

  // 3. Bổ sung tra cứu từ Inbounds trực tiếp (trong trường hợp caller chỉ truyền inbounds)
  const inboundExactNameMap = new Map<string, { code: string; name: string; warehouseId: string }>();
  const inboundFoldedNameMap = new Map<string, { code: string; name: string; warehouseId: string }>();
  if (Array.isArray(inbounds)) {
    for (let i = 0; i < inbounds.length; i++) {
      const rcp = inbounds[i];
      const items = rcp?.items;
      if (!Array.isArray(items)) continue;
      for (let j = 0; j < items.length; j++) {
        const it = items[j];
        const codeKey = normKey(it?.materialCode);
        const name = String(it?.materialName || '').trim();
        if (!codeKey || codeKey === 'N/A' || !name) continue;
        if (!bestNameByCode.has(codeKey)) {
          bestNameByCode.set(codeKey, name);
        }
        const exactKey = normalizeMaterialNameLookupKey(name);
        if (exactKey && !inboundExactNameMap.has(exactKey)) {
          inboundExactNameMap.set(exactKey, {
            code: codeKey,
            name,
            warehouseId: rcp.warehouseId
          });
        }
        const foldedKey = foldVietnameseAscii(name);
        if (foldedKey && !inboundFoldedNameMap.has(foldedKey)) {
          inboundFoldedNameMap.set(foldedKey, {
            code: codeKey,
            name,
            warehouseId: rcp.warehouseId
          });
        }
      }
    }
  }

  const remainingQtyPool = new Map<string, number>();
  const remainingWeightPool = new Map<string, number>();

  const getRemainingQty = (whCodeKey: string): number => {
    if (remainingQtyPool.has(whCodeKey)) {
      return remainingQtyPool.get(whCodeKey)!;
    }
    return roundQty(stockQtyByWhCode.get(whCodeKey) ?? 0);
  };

  const getRemainingWeight = (whCodeKey: string): number => {
    if (remainingWeightPool.has(whCodeKey)) {
      return remainingWeightPool.get(whCodeKey)!;
    }
    return Math.round((stockWeightByWhCode.get(whCodeKey) ?? 0) * 100) / 100;
  };

  const pickBestStockCandidate = (
    candidates: StockNameCandidate[] | undefined,
    targetWarehouseId: string,
    rowPkg: string,
    rowPl: string
  ): StockNameCandidate | undefined => {
    if (!candidates || candidates.length === 0) return undefined;
    let best: StockNameCandidate | undefined;
    let bestScore = -Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const whCodeKey = `${targetWarehouseId}__${c.code}`;
      const avail = c.warehouseId === targetWarehouseId ? getRemainingQty(whCodeKey) : c.currentQuantity;

      let score = 0;
      if (c.warehouseId === targetWarehouseId) score += 10000;
      if (avail > 0) score += 1000;
      if (rowPkg && c.packageNo && normKey(c.packageNo) === normKey(rowPkg)) score += 200;
      if (rowPl && c.packingListNo && normKey(c.packingListNo) === normKey(rowPl)) score += 100;
      score += Math.min(avail, 99);

      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    return best;
  };

  const resolveCodeByMaterialName = (
    rawName: string,
    targetWarehouseId: string,
    rowPkg: string,
    rowPl: string
  ): { code: string; name?: string } | null => {
    const exactKey = normalizeMaterialNameLookupKey(rawName);
    if (exactKey) {
      const fromStock = pickBestStockCandidate(
        stockExactNameMap.get(exactKey),
        targetWarehouseId,
        rowPkg,
        rowPl
      );
      if (fromStock) return { code: fromStock.code, name: fromStock.name };

      const fromCatalog = catalogExactNameMap.get(exactKey);
      if (fromCatalog) return { code: fromCatalog.code, name: fromCatalog.name };

      const fromInbound = inboundExactNameMap.get(exactKey);
      if (fromInbound) return { code: fromInbound.code, name: fromInbound.name };
    }

    const foldedKey = foldVietnameseAscii(rawName);
    if (foldedKey) {
      const fromStockFolded = pickBestStockCandidate(
        stockFoldedNameMap.get(foldedKey),
        targetWarehouseId,
        rowPkg,
        rowPl
      );
      if (fromStockFolded) return { code: fromStockFolded.code, name: fromStockFolded.name };

      const fromCatalogFolded = catalogFoldedNameMap.get(foldedKey);
      if (fromCatalogFolded) return { code: fromCatalogFolded.code, name: fromCatalogFolded.name };

      const fromInboundFolded = inboundFoldedNameMap.get(foldedKey);
      if (fromInboundFolded) return { code: fromInboundFolded.code, name: fromInboundFolded.name };
    }

    return null;
  };

  const pickBestBucketForExport = (
    whCodeKey: string,
    requestedQty: number,
    rowPkg: string,
    rowPl: string
  ): OutboundMatchedStockMetadata | undefined => {
    const buckets = bucketsByWhCode.get(whCodeKey);
    if (!buckets || buckets.length === 0) return undefined;

    if (rowPkg || rowPl) {
      const exactMatch = buckets.find((b) => {
        const pkgOk = !rowPkg || normKey(b.packageNo) === normKey(rowPkg);
        const plOk = !rowPl || normKey(b.packingListNo) === normKey(rowPl);
        return pkgOk && plOk && (Number(b.currentQuantity) || 0) > 0;
      });
      if (exactMatch) return extractBucketMetadata(exactMatch);
    }

    const sufficientBucket = buckets.find(
      (b) => roundQty(b.currentQuantity) >= requestedQty && (Number(b.currentQuantity) || 0) > 0
    );
    if (sufficientBucket) return extractBucketMetadata(sufficientBucket);

    const positiveBucket = buckets.find((b) => (Number(b.currentQuantity) || 0) > 0);
    if (positiveBucket) return extractBucketMetadata(positiveBucket);

    return extractBucketMetadata(buckets[0]);
  };

  const results: OutboundRowValidationResult[] = new Array(rows.length);
  const validRows: OutboundValidatedRowEntry[] = [];
  const errorRows: OutboundValidatedRowEntry[] = [];
  const errorCodeSet = new Set<string>();
  const validCodeSet = new Set<string>();
  const errorCodes: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i] || {};
    const { warehouse: resolvedWh, unauthorizedWarehouseName } = resolveRowWarehouse(
      item.warehouseName
    );

    const rawCode = isBlankOutboundField(item.materialCode)
      ? ''
      : normKey(item.materialCode);
    const rawName = String(item.materialName ?? '').trim();
    const rowPkg = !isBlankOutboundField(item.packageNo)
      ? String(item.packageNo).trim()
      : !isBlankOutboundField(item.batchCode)
        ? String(item.batchCode).trim()
        : '';
    const rowPl = !isBlankOutboundField(item.packingListNo)
      ? String(item.packingListNo).trim()
      : '';

    let resolvedMaterialCode = rawCode;
    let codeSource: OutboundCodeSource = rawCode ? 'explicit' : 'not_found';
    let resolvedMaterialName = rawName;

    if (!rawCode) {
      const matched = resolveCodeByMaterialName(
        rawName,
        resolvedWh.id,
        rowPkg,
        rowPl
      );
      if (matched) {
        resolvedMaterialCode = matched.code;
        codeSource = 'catalog_or_stock';
        if (!resolvedMaterialName && matched.name) {
          resolvedMaterialName = matched.name;
        }
      }
    } else if (
      !resolvedMaterialName ||
      normKey(resolvedMaterialName) === resolvedMaterialCode
    ) {
      const knownName = bestNameByCode.get(resolvedMaterialCode);
      if (knownName) {
        resolvedMaterialName = knownName;
      }
    }

    if (!resolvedMaterialName) {
      resolvedMaterialName = resolvedMaterialCode || 'Vật tư xuất kho';
    }

    const rawQtyNum = Number(item.quantity);
    const rawWeightNum = Number(item.weightKg);
    const requestedQty = Number.isFinite(rawQtyNum) ? Math.max(0, roundQty(rawQtyNum)) : 0;
    const requestedWeightKg = Number.isFinite(rawWeightNum)
      ? Math.max(0, Math.round(rawWeightNum * 100) / 100)
      : 0;

    const recordError = (
      errorCode: OutboundValidationErrorCode,
      errorMessage: string,
      availableBefore: number,
      otherWhTotal: number
    ) => {
      const res: OutboundRowValidationResult = {
        rowIndex: i,
        valid: false,
        resolvedWarehouse: resolvedWh,
        unauthorizedWarehouseName,
        resolvedMaterialCode,
        resolvedMaterialName,
        codeSource,
        requestedQty,
        requestedWeightKg,
        availableStockBefore: availableBefore,
        availableStockAfter: availableBefore,
        otherWarehouseStockTotal: otherWhTotal,
        errorCode,
        errorMessage
      };
      results[i] = res;
      errorRows.push({ rowIndex: i, row: item, validation: res });

      const errKey = resolvedMaterialCode
        ? `CODE:${resolvedMaterialCode}`
        : `NAME:${normalizeMaterialNameLookupKey(resolvedMaterialName) || `ROW_${i}`}`;
      if (!errorCodeSet.has(errKey)) {
        errorCodeSet.add(errKey);
        errorCodes.push(resolvedMaterialCode || resolvedMaterialName);
      }
    };

    if (unauthorizedWarehouseName) {
      recordError(
        'UNAUTHORIZED_WAREHOUSE',
        `Không có quyền xuất kho "${unauthorizedWarehouseName}".`,
        0,
        0
      );
      continue;
    }

    if (
      (Number.isFinite(rawQtyNum) && rawQtyNum < 0) ||
      (Number.isFinite(rawWeightNum) && rawWeightNum < 0) ||
      (requestedQty <= 0 && requestedWeightKg <= 0)
    ) {
      const whCodeKey = resolvedMaterialCode ? `${resolvedWh.id}__${resolvedMaterialCode}` : '';
      const curAvail = whCodeKey ? getRemainingQty(whCodeKey) : 0;
      recordError(
        'INVALID_QUANTITY',
        'Số lượng xuất phải lớn hơn 0.',
        curAvail,
        0
      );
      continue;
    }

    if (!resolvedMaterialCode || codeSource === 'not_found') {
      recordError(
        'MATERIAL_NOT_FOUND',
        `Không tìm thấy mã vật tư cho "${resolvedMaterialName}" (chưa được nhập kho).`,
        0,
        0
      );
      continue;
    }

    const whCodeKey = `${resolvedWh.id}__${resolvedMaterialCode}`;
    const availableBefore = getRemainingQty(whCodeKey);
    const availableWeightBefore = getRemainingWeight(whCodeKey);
    const totalAllPositive = totalPositiveStockByCode.get(resolvedMaterialCode) || 0;
    const otherWhStockTotal = Math.max(
      0,
      roundQty(totalAllPositive - Math.max(0, availableBefore))
    );

    const isStockEnough =
      requestedQty > 0
        ? availableBefore >= requestedQty
        : availableBefore >= 0 &&
          availableWeightBefore >= requestedWeightKg &&
          (availableBefore > 0 || availableWeightBefore > 0);

    if (!isStockEnough) {
      const neverImportedToWh = !hasInboundByWhCode.has(whCodeKey) && availableBefore <= 0;
      if (neverImportedToWh) {
        const hint =
          otherWhStockTotal > 0
            ? ` (đang có ${fmtNum(otherWhStockTotal)} ở kho khác)`
            : '';
        recordError(
          'NOT_IN_STOCK',
          `Chưa nhập kho tại "${resolvedWh.name}" (Tồn: 0 < Xuất: ${fmtNum(requestedQty)})${hint}.`,
          availableBefore,
          otherWhStockTotal
        );
      } else {
        recordError(
          'INSUFFICIENT_STOCK',
          `Tồn kho không đủ tại "${resolvedWh.name}" (Tồn: ${fmtNum(Math.max(0, availableBefore))} < Xuất: ${fmtNum(requestedQty)}).`,
          availableBefore,
          otherWhStockTotal
        );
      }
      continue;
    }

    const afterQty = roundQty(availableBefore - requestedQty);
    const afterWeight = Math.round((availableWeightBefore - requestedWeightKg) * 100) / 100;
    remainingQtyPool.set(whCodeKey, afterQty);
    remainingWeightPool.set(whCodeKey, afterWeight);

    const matchedStockMetadata = pickBestBucketForExport(
      whCodeKey,
      requestedQty,
      rowPkg,
      rowPl
    );

    const catFallback = materialByCode.get(resolvedMaterialCode);
    const mergedMeta: OutboundMatchedStockMetadata | undefined = matchedStockMetadata
      ? {
          ...matchedStockMetadata,
          unit: matchedStockMetadata.unit || catFallback?.unit,
          category: matchedStockMetadata.category || catFallback?.category,
          drawingNo: matchedStockMetadata.drawingNo || catFallback?.drawingNo,
          manufacturer: matchedStockMetadata.manufacturer || catFallback?.manufacturer,
          supplier: matchedStockMetadata.supplier || catFallback?.supplier
        }
      : catFallback
        ? {
            unit: catFallback.unit,
            category: catFallback.category,
            drawingNo: catFallback.drawingNo,
            manufacturer: catFallback.manufacturer,
            supplier: catFallback.supplier
          }
        : undefined;

    const res: OutboundRowValidationResult = {
      rowIndex: i,
      valid: true,
      resolvedWarehouse: resolvedWh,
      resolvedMaterialCode,
      resolvedMaterialName,
      codeSource,
      requestedQty,
      requestedWeightKg,
      availableStockBefore: availableBefore,
      availableStockAfter: afterQty,
      otherWarehouseStockTotal: otherWhStockTotal,
      matchedStockMetadata: mergedMeta
    };
    results[i] = res;
    validRows.push({ rowIndex: i, row: item, validation: res });
    validCodeSet.add(`CODE:${resolvedMaterialCode}`);
  }

  return {
    results,
    validRows,
    errorRows,
    totalCount: rows.length,
    validCount: validRows.length,
    errorRowCount: errorRows.length,
    errorCodeCount: errorCodeSet.size,
    validCodeCount: validCodeSet.size,
    errorCodes
  };
}
