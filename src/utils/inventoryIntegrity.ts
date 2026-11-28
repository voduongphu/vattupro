import {
  InboundItemDetail,
  InboundReceipt,
  InventoryStockRecord,
  OutboundItemDetail,
  OutboundReceipt
} from '../types/inventory';
import { roundQty, sumInboundItems, sumOutboundItems } from './additiveMerge';

export type IntegrityIssueType =
  | 'negative_qty'
  | 'negative_weight'
  | 'qty_zero_weight_nonzero';

export type IntegritySeverity = 'critical' | 'warning';

export interface IntegrityStockIssue {
  record: InventoryStockRecord;
  issueType: IntegrityIssueType;
  severity: IntegritySeverity;
  reason: string;
  suggestedActualQty: number;
  suggestedActualWeightKg: number;
}

export interface VoucherIntegrityWarning {
  voucherType: 'inbound' | 'outbound';
  voucherCode: string;
  voucherDate: string;
  warehouseName: string;
  detail: string;
}

export interface InventoryIntegrityReport {
  totalRecordsChecked: number;
  negativeQtyIssues: IntegrityStockIssue[];
  weightAnomalyIssues: IntegrityStockIssue[];
  allStockIssues: IntegrityStockIssue[];
  voucherWarnings: VoucherIntegrityWarning[];
  totalNegativeQtyDeficit: number;
  isHealthy: boolean;
}

export interface StockReconciliationTarget {
  record: InventoryStockRecord;
  actualQuantity: number;
  actualWeightKg: number;
}

export interface ReconciliationPreviewSummary {
  validItemsCount: number;
  inboundAdjustmentItemsCount: number;
  outboundAdjustmentItemsCount: number;
  totalInboundDeltaQty: number;
  totalOutboundDeltaQty: number;
  warehouseCount: number;
}

export interface GeneratedReconciliationVouchers {
  inboundReceipts: InboundReceipt[];
  outboundReceipts: OutboundReceipt[];
  summary: ReconciliationPreviewSummary;
}

function roundWeight(val: number): number {
  const r = Math.round((Number(val) || 0) * 100) / 100;
  return Object.is(r, -0) || r === 0 ? 0 : r;
}

function normCode(val?: string): string {
  return String(val || '')
    .trim()
    .toUpperCase();
}

/**
 * Audits per-warehouse stock records and raw vouchers for inventory integrity issues:
 * - Negative stock quantity (critical)
 * - Negative stock weight (warning)
 * - Zero quantity with leftover non-zero weight (warning)
 * - Raw voucher lines containing negative item quantities or weights
 */
export function analyzeInventoryIntegrity(
  stockRecords: readonly InventoryStockRecord[],
  inbounds: readonly InboundReceipt[] = [],
  outbounds: readonly OutboundReceipt[] = []
): InventoryIntegrityReport {
  const negativeQtyIssues: IntegrityStockIssue[] = [];
  const weightAnomalyIssues: IntegrityStockIssue[] = [];
  let totalNegativeQtyDeficit = 0;

  for (let i = 0; i < stockRecords.length; i++) {
    const rec = stockRecords[i];
    const qty = roundQty(rec.currentQuantity);
    const weight = roundWeight(rec.currentWeightKg);

    if (qty < 0) {
      totalNegativeQtyDeficit += Math.abs(qty);
      negativeQtyIssues.push({
        record: rec,
        issueType: 'negative_qty',
        severity: 'critical',
        reason: `Số lượng xuất vượt nhập ${Math.abs(qty).toLocaleString('vi-VN')} ${rec.unit || ''}`.trim(),
        suggestedActualQty: 0,
        suggestedActualWeightKg: weight < 0 ? 0 : weight
      });
    } else if (weight < -0.01) {
      weightAnomalyIssues.push({
        record: rec,
        issueType: 'negative_weight',
        severity: 'warning',
        reason: `Khối lượng tồn bị âm (${weight.toLocaleString('vi-VN')} kg)`,
        suggestedActualQty: qty,
        suggestedActualWeightKg: 0
      });
    } else if (qty === 0 && Math.abs(weight) > 0.05) {
      weightAnomalyIssues.push({
        record: rec,
        issueType: 'qty_zero_weight_nonzero',
        severity: 'warning',
        reason: `Số lượng bằng 0 nhưng còn dư khối lượng (${weight.toLocaleString('vi-VN')} kg)`,
        suggestedActualQty: 0,
        suggestedActualWeightKg: 0
      });
    }
  }

  // Sort negative qty issues by largest deficit first
  negativeQtyIssues.sort(
    (a, b) => a.record.currentQuantity - b.record.currentQuantity
  );
  weightAnomalyIssues.sort(
    (a, b) => Math.abs(b.record.currentWeightKg) - Math.abs(a.record.currentWeightKg)
  );

  // Check raw vouchers for corrupted negative lines
  const voucherWarnings: VoucherIntegrityWarning[] = [];
  for (let i = 0; i < inbounds.length; i++) {
    const r = inbounds[i];
    const items = Array.isArray(r.items) ? r.items : [];
    for (let j = 0; j < items.length; j++) {
      const it = items[j];
      if ((Number(it.quantity) || 0) < 0 || (Number(it.weightKg) || 0) < 0) {
        voucherWarnings.push({
          voucherType: 'inbound',
          voucherCode: r.receiptCode,
          voucherDate: r.receiptDate,
          warehouseName: r.warehouseName,
          detail: `Dòng ${j + 1} (${it.materialCode || it.materialName}) có SL=${it.quantity}, KL=${it.weightKg} âm`
        });
      }
    }
  }
  for (let i = 0; i < outbounds.length; i++) {
    const r = outbounds[i];
    const items = Array.isArray(r.items) ? r.items : [];
    for (let j = 0; j < items.length; j++) {
      const it = items[j];
      if ((Number(it.quantity) || 0) < 0 || (Number(it.weightKg) || 0) < 0) {
        voucherWarnings.push({
          voucherType: 'outbound',
          voucherCode: r.issueCode,
          voucherDate: r.issueDate,
          warehouseName: r.warehouseName,
          detail: `Dòng ${j + 1} (${it.materialCode || it.materialName}) có SL=${it.quantity}, KL=${it.weightKg} âm`
        });
      }
    }
  }

  const allStockIssues = [...negativeQtyIssues, ...weightAnomalyIssues];

  return {
    totalRecordsChecked: stockRecords.length,
    negativeQtyIssues,
    weightAnomalyIssues,
    allStockIssues,
    voucherWarnings,
    totalNegativeQtyDeficit: roundQty(totalNegativeQtyDeficit),
    isHealthy: allStockIssues.length === 0 && voucherWarnings.length === 0
  };
}

function generateUniqueVoucherCode(
  prefix: string,
  dateCompact: string,
  usedCodes: Set<string>
): string {
  let seq = 1;
  while (seq < 9999) {
    const candidate = `${prefix}-${dateCompact}-${String(seq).padStart(2, '0')}`;
    const key = normCode(candidate);
    if (!usedCodes.has(key)) {
      usedCodes.add(key);
      return candidate;
    }
    seq++;
  }
  const fallback = `${prefix}-${dateCompact}-${Date.now().toString().slice(-4)}`;
  usedCodes.add(normCode(fallback));
  return fallback;
}

/**
 * Generates auditable inbound/outbound adjustment vouchers grouped by warehouse
 * so every selected stock record reconciles strictly to its target actualQuantity
 * and actualWeightKg without altering historical signed vouchers.
 */
export function buildReconciliationVouchers(params: {
  targets: readonly StockReconciliationTarget[];
  existingInboundCodes?: readonly string[];
  existingOutboundCodes?: readonly string[];
  reason?: string;
  actorUserCode: string;
  actorFullName: string;
  adjustmentDate?: string; // YYYY-MM-DD
  nowMs?: number;
}): GeneratedReconciliationVouchers {
  const nowMs = params.nowMs ?? Date.now();
  const isoNow = new Date(nowMs).toISOString();
  const adjustmentDate =
    params.adjustmentDate && /^\d{4}-\d{2}-\d{2}$/.test(params.adjustmentDate)
      ? params.adjustmentDate
      : isoNow.slice(0, 10);
  const dateCompact = adjustmentDate.replace(/-/g, '');

  const reasonText =
    (params.reason || '').trim() ||
    'Điều chỉnh cân bằng tồn kho theo số dư thực tế (Kiểm kê toàn vẹn)';

  const usedInCodes = new Set<string>(
    (params.existingInboundCodes || []).map((c) => normCode(c)).filter(Boolean)
  );
  const usedOutCodes = new Set<string>(
    (params.existingOutboundCodes || []).map((c) => normCode(c)).filter(Boolean)
  );

  // Group positive deltas (need inbound adjustment) and negative deltas (need outbound adjustment) by warehouse
  const inboundByWh = new Map<
    string,
    { warehouseId: string; warehouseName: string; items: InboundItemDetail[] }
  >();
  const outboundByWh = new Map<
    string,
    { warehouseId: string; warehouseName: string; items: OutboundItemDetail[] }
  >();

  const touchedWarehouses = new Set<string>();
  let totalInboundDeltaQty = 0;
  let totalOutboundDeltaQty = 0;
  let inboundAdjustmentItemsCount = 0;
  let outboundAdjustmentItemsCount = 0;

  for (let i = 0; i < params.targets.length; i++) {
    const t = params.targets[i];
    const rec = t.record;
    const targetQty = Math.max(0, roundQty(Number(t.actualQuantity) || 0));
    const targetWeight = Math.max(0, roundWeight(Number(t.actualWeightKg) || 0));

    const currentQty = roundQty(rec.currentQuantity);
    const currentWeight = roundWeight(rec.currentWeightKg);

    const deltaQty = roundQty(targetQty - currentQty);
    const deltaWeight = roundWeight(targetWeight - currentWeight);

    if (deltaQty === 0 && deltaWeight === 0) continue;

    const whId = rec.warehouseId || 'wh-01';
    const whName = rec.warehouseName || 'Kho mặc định';
    touchedWarehouses.add(whId);

    const cleanField = (val?: string, fallback = 'N/A'): string => {
      const s = String(val || '').trim();
      return s ? s : fallback;
    };

    const noteLine = `Cân bằng tồn: ${currentQty.toLocaleString('vi-VN')} -> ${targetQty.toLocaleString('vi-VN')} ${rec.unit || ''}`.trim();

    // Positive adjustment -> Inbound adjustment voucher
    if (deltaQty > 0 || (deltaQty === 0 && deltaWeight > 0)) {
      let bucket = inboundByWh.get(whId);
      if (!bucket) {
        bucket = { warehouseId: whId, warehouseName: whName, items: [] };
        inboundByWh.set(whId, bucket);
      }

      // If qty increases while weight needs to decrease slightly, handle qty via inbound (weight 0)
      // and handle negative weight delta separately via outbound below
      const inWeight = deltaWeight > 0 ? deltaWeight : 0;

      bucket.items.push({
        id: `adj-in-${nowMs}-${i}`,
        materialCode: cleanField(rec.materialCode, 'N/A'),
        materialName: cleanField(rec.materialName, 'Vật tư'),
        unit: cleanField(rec.unit, 'Bộ'),
        batchCode: '',
        packingListNo: cleanField(rec.packingListNo, 'N/A'),
        shipment: cleanField(rec.shipment, 'N/A'),
        manufacturer: cleanField(rec.manufacturer, 'N/A'),
        supplier: cleanField(rec.supplier, 'N/A'),
        packageNo: cleanField(rec.packageNo, 'N/A'),
        packageName: String(rec.packageName || '').trim(),
        category: cleanField(rec.category, 'N/A'),
        drawingNo: cleanField(rec.drawingNo, 'N/A'),
        quantity: deltaQty,
        weightKg: inWeight,
        storageLocation: String(rec.storageLocation || '').trim(),
        warehouseName: whName,
        conditionNote: reasonText,
        note: noteLine
      });

      totalInboundDeltaQty += deltaQty;
      inboundAdjustmentItemsCount += 1;

      if (deltaWeight < 0) {
        let outBucket = outboundByWh.get(whId);
        if (!outBucket) {
          outBucket = { warehouseId: whId, warehouseName: whName, items: [] };
          outboundByWh.set(whId, outBucket);
        }
        outBucket.items.push({
          id: `adj-out-w-${nowMs}-${i}`,
          materialCode: cleanField(rec.materialCode, 'N/A'),
          materialName: cleanField(rec.materialName, 'Vật tư'),
          unit: cleanField(rec.unit, 'Bộ'),
          batchCode: '',
          warehouseName: whName,
          packingListNo: cleanField(rec.packingListNo, 'N/A'),
          shipment: cleanField(rec.shipment, 'N/A'),
          manufacturer: cleanField(rec.manufacturer, 'N/A'),
          supplier: cleanField(rec.supplier, 'N/A'),
          packageNo: cleanField(rec.packageNo, 'N/A'),
          packageName: String(rec.packageName || '').trim(),
          category: cleanField(rec.category, 'N/A'),
          drawingNo: cleanField(rec.drawingNo, 'N/A'),
          quantity: 0,
          weightKg: Math.abs(deltaWeight),
          purpose: reasonText,
          note: `Cân bằng KL: ${currentWeight} -> ${targetWeight} kg`
        });
        outboundAdjustmentItemsCount += 1;
      }
      continue;
    }

    // Negative adjustment -> Outbound adjustment voucher
    if (deltaQty < 0 || (deltaQty === 0 && deltaWeight < 0)) {
      let bucket = outboundByWh.get(whId);
      if (!bucket) {
        bucket = { warehouseId: whId, warehouseName: whName, items: [] };
        outboundByWh.set(whId, bucket);
      }

      const outWeight = deltaWeight < 0 ? Math.abs(deltaWeight) : 0;

      bucket.items.push({
        id: `adj-out-${nowMs}-${i}`,
        materialCode: cleanField(rec.materialCode, 'N/A'),
        materialName: cleanField(rec.materialName, 'Vật tư'),
        unit: cleanField(rec.unit, 'Bộ'),
        batchCode: '',
        warehouseName: whName,
        packingListNo: cleanField(rec.packingListNo, 'N/A'),
        shipment: cleanField(rec.shipment, 'N/A'),
        manufacturer: cleanField(rec.manufacturer, 'N/A'),
        supplier: cleanField(rec.supplier, 'N/A'),
        packageNo: cleanField(rec.packageNo, 'N/A'),
        packageName: String(rec.packageName || '').trim(),
        category: cleanField(rec.category, 'N/A'),
        drawingNo: cleanField(rec.drawingNo, 'N/A'),
        quantity: Math.abs(deltaQty),
        weightKg: outWeight,
        purpose: reasonText,
        note: noteLine
      });

      totalOutboundDeltaQty += Math.abs(deltaQty);
      outboundAdjustmentItemsCount += 1;

      if (deltaWeight > 0) {
        let inBucket = inboundByWh.get(whId);
        if (!inBucket) {
          inBucket = { warehouseId: whId, warehouseName: whName, items: [] };
          inboundByWh.set(whId, inBucket);
        }
        inBucket.items.push({
          id: `adj-in-w-${nowMs}-${i}`,
          materialCode: cleanField(rec.materialCode, 'N/A'),
          materialName: cleanField(rec.materialName, 'Vật tư'),
          unit: cleanField(rec.unit, 'Bộ'),
          batchCode: '',
          packingListNo: cleanField(rec.packingListNo, 'N/A'),
          shipment: cleanField(rec.shipment, 'N/A'),
          manufacturer: cleanField(rec.manufacturer, 'N/A'),
          supplier: cleanField(rec.supplier, 'N/A'),
          packageNo: cleanField(rec.packageNo, 'N/A'),
          packageName: String(rec.packageName || '').trim(),
          category: cleanField(rec.category, 'N/A'),
          drawingNo: cleanField(rec.drawingNo, 'N/A'),
          quantity: 0,
          weightKg: deltaWeight,
          storageLocation: String(rec.storageLocation || '').trim(),
          warehouseName: whName,
          conditionNote: reasonText,
          note: `Cân bằng KL: ${currentWeight} -> ${targetWeight} kg`
        });
        inboundAdjustmentItemsCount += 1;
      }
    }
  }

  const inboundReceipts: InboundReceipt[] = [];
  let inIdx = 0;
  inboundByWh.forEach((bucket) => {
    const code = generateUniqueVoucherCode('PN-DC', dateCompact, usedInCodes);
    const sums = sumInboundItems(bucket.items);
    const firstPl = bucket.items.find((it) => it.packingListNo !== 'N/A')?.packingListNo || 'N/A';
    const firstShp = bucket.items.find((it) => it.shipment !== 'N/A')?.shipment || 'N/A';
    inboundReceipts.push({
      id: `in-adj-${nowMs}-${inIdx++}`,
      receiptCode: code,
      receiptDate: adjustmentDate,
      warehouseId: bucket.warehouseId,
      warehouseName: bucket.warehouseName,
      departmentName: 'Kiểm kê & Điều chỉnh tồn kho',
      inboundType: 'new',
      supplier: 'Điều chỉnh cân bằng kiểm kê',
      shipment: firstShp,
      packingListNo: firstPl,
      delivererName: 'Biên bản kiểm kê tồn kho',
      receiverName: params.actorFullName || params.actorUserCode,
      notes: reasonText,
      items: bucket.items,
      packageCount: sums.packageCount,
      totalQuantity: sums.totalQuantity,
      totalWeightKg: sums.totalWeightKg,
      totalAmount: 0,
      createdAt: isoNow,
      createdBy: params.actorUserCode
    });
  });

  const outboundReceipts: OutboundReceipt[] = [];
  let outIdx = 0;
  outboundByWh.forEach((bucket) => {
    const code = generateUniqueVoucherCode('PX-DC', dateCompact, usedOutCodes);
    const sums = sumOutboundItems(bucket.items);
    const plSet = Array.from(
      new Set(bucket.items.map((it) => it.packingListNo).filter((v) => v && v !== 'N/A'))
    );
    outboundReceipts.push({
      id: `out-adj-${nowMs}-${outIdx++}`,
      issueCode: code,
      issueDate: adjustmentDate,
      warehouseId: bucket.warehouseId,
      warehouseName: bucket.warehouseName,
      departmentName: 'Kiểm kê & Điều chỉnh tồn kho',
      outboundType: 'issue',
      projectName: 'Điều chỉnh cân bằng tồn kho',
      recipientDepartment: 'Kiểm kê kho bãi',
      recipientName: params.actorFullName || params.actorUserCode,
      issuerName: params.actorFullName || params.actorUserCode,
      notes: reasonText,
      items: bucket.items,
      packingListSummary: plSet.length > 0 ? plSet.join(', ') : 'N/A',
      totalQuantity: sums.totalQuantity,
      totalWeightKg: sums.totalWeightKg,
      createdAt: isoNow,
      createdBy: params.actorUserCode
    });
  });

  return {
    inboundReceipts,
    outboundReceipts,
    summary: {
      validItemsCount: inboundAdjustmentItemsCount + outboundAdjustmentItemsCount,
      inboundAdjustmentItemsCount,
      outboundAdjustmentItemsCount,
      totalInboundDeltaQty: roundQty(totalInboundDeltaQty),
      totalOutboundDeltaQty: roundQty(totalOutboundDeltaQty),
      warehouseCount: touchedWarehouses.size
    }
  };
}
