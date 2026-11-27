import { InventoryStockRecord } from '../types/inventory';
import { roundQty } from './additiveMerge';

export const FM09_FORM_CODE = 'QN-OPR-PR11-FM09';
export const FM09_EFFECTIVE_DATE = 'NHL: 02/08/2024';
export const FM09_DEFAULT_MIN_ROWS = 13;

export interface Fm09QuantityRow {
  key: string;
  materialCode: string;
  materialName: string;
  unit: string;
  openingQuantity: number;
  inboundQuantity: number;
  returnInboundQuantity: number;
  outboundQuantity: number;
  transferOutboundQuantity: number;
  closingQuantity: number;
}

export interface Fm09QuantityTotals {
  openingQuantity: number;
  inboundQuantity: number;
  returnInboundQuantity: number;
  outboundQuantity: number;
  transferOutboundQuantity: number;
  closingQuantity: number;
}

export interface Fm09QuantityReport {
  rows: Fm09QuantityRow[];
  totals: Fm09QuantityTotals;
}

export interface BuildFm09Options {
  /** Merge duplicate material rows across Packing Lists / Packages into one row per material (default: true) */
  groupByMaterial?: boolean;
  /** Exclude rows where opening, closing, and all 4 movement quantities are zero (default: true) */
  excludeAllZeroRows?: boolean;
}

function normPart(val?: string): string {
  return String(val || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function cleanDisplayCode(code?: string): string {
  const cleaned = String(code || '').trim();
  if (!cleaned || cleaned.toUpperCase() === 'N/A') return '';
  return cleaned;
}

function cleanDisplayText(val?: string): string {
  const cleaned = String(val || '').trim();
  if (!cleaned || cleaned.toUpperCase() === 'N/A') return '';
  return cleaned;
}

function buildRowKey(r: InventoryStockRecord, groupByMaterial: boolean): string {
  const codeKey = normPart(r.materialCode) || 'N/A';
  const nameKey = normPart(r.materialName) || 'N/A';
  const unitKey = normPart(r.unit) || 'N/A';
  if (groupByMaterial) {
    return `${codeKey}__${nameKey}__${unitKey}`;
  }
  const plKey = normPart(r.packingListNo) || 'N/A';
  const shpKey = normPart(r.shipment) || 'N/A';
  const pkgKey = normPart(r.packageNo) || 'N/A';
  return `${plKey}__${shpKey}__${pkgKey}__${codeKey}__${nameKey}__${unitKey}`;
}

function normalizeSignedZero(val: number): number {
  const rounded = roundQty(val);
  return Object.is(rounded, -0) || rounded === 0 ? 0 : rounded;
}

/**
 * Builds the quantity-only Inventory Summary Report matching official PTSC Quang Ngai form
 * QN-OPR-PR11-FM09 (Báo cáo Nhập Xuất Tồn - Chỉ theo số lượng).
 *
 * Accounting identity per row:
 *   closingQuantity = openingQuantity + inboundQuantity + returnInboundQuantity
 *                     - outboundQuantity - transferOutboundQuantity
 */
export function buildFm09QuantityReport(
  openingRecords: InventoryStockRecord[],
  periodRecords: InventoryStockRecord[],
  options: BuildFm09Options = {}
): Fm09QuantityReport {
  const groupByMaterial = options.groupByMaterial ?? true;
  const excludeAllZeroRows = options.excludeAllZeroRows ?? true;

  const rowMap = new Map<string, Fm09QuantityRow>();

  const getOrCreateRow = (r: InventoryStockRecord): Fm09QuantityRow => {
    const key = buildRowKey(r, groupByMaterial);
    let existing = rowMap.get(key);
    if (!existing) {
      existing = {
        key,
        materialCode: cleanDisplayCode(r.materialCode),
        materialName: cleanDisplayText(r.materialName),
        unit: cleanDisplayText(r.unit),
        openingQuantity: 0,
        inboundQuantity: 0,
        returnInboundQuantity: 0,
        outboundQuantity: 0,
        transferOutboundQuantity: 0,
        closingQuantity: 0
      };
      rowMap.set(key, existing);
    } else {
      if (!existing.materialCode && cleanDisplayCode(r.materialCode)) {
        existing.materialCode = cleanDisplayCode(r.materialCode);
      }
      if (!existing.materialName && cleanDisplayText(r.materialName)) {
        existing.materialName = cleanDisplayText(r.materialName);
      }
      if (!existing.unit && cleanDisplayText(r.unit)) {
        existing.unit = cleanDisplayText(r.unit);
      }
    }
    return existing;
  };

  for (let i = 0; i < openingRecords.length; i++) {
    const rec = openingRecords[i];
    const row = getOrCreateRow(rec);
    row.openingQuantity += Number(rec.currentQuantity) || 0;
  }

  for (let i = 0; i < periodRecords.length; i++) {
    const rec = periodRecords[i];
    const row = getOrCreateRow(rec);
    row.inboundQuantity += Number(rec.inboundQuantity) || 0;
    row.returnInboundQuantity += Number(rec.returnInboundQuantity) || 0;
    row.outboundQuantity += Number(rec.outboundQuantity) || 0;
    row.transferOutboundQuantity += Number(rec.transferOutboundQuantity) || 0;
  }

  const rows: Fm09QuantityRow[] = [];
  let totalOpening = 0;
  let totalInbound = 0;
  let totalReturnInbound = 0;
  let totalOutbound = 0;
  let totalTransferOutbound = 0;
  let totalClosing = 0;

  rowMap.forEach((raw) => {
    const openingQuantity = normalizeSignedZero(raw.openingQuantity);
    const inboundQuantity = normalizeSignedZero(raw.inboundQuantity);
    const returnInboundQuantity = normalizeSignedZero(raw.returnInboundQuantity);
    const outboundQuantity = normalizeSignedZero(raw.outboundQuantity);
    const transferOutboundQuantity = normalizeSignedZero(raw.transferOutboundQuantity);
    const closingQuantity = normalizeSignedZero(
      openingQuantity +
        inboundQuantity +
        returnInboundQuantity -
        outboundQuantity -
        transferOutboundQuantity
    );

    const isAllZero =
      openingQuantity === 0 &&
      inboundQuantity === 0 &&
      returnInboundQuantity === 0 &&
      outboundQuantity === 0 &&
      transferOutboundQuantity === 0 &&
      closingQuantity === 0;

    if (excludeAllZeroRows && isAllZero) {
      return;
    }

    rows.push({
      ...raw,
      openingQuantity,
      inboundQuantity,
      returnInboundQuantity,
      outboundQuantity,
      transferOutboundQuantity,
      closingQuantity
    });

    totalOpening += openingQuantity;
    totalInbound += inboundQuantity;
    totalReturnInbound += returnInboundQuantity;
    totalOutbound += outboundQuantity;
    totalTransferOutbound += transferOutboundQuantity;
    totalClosing += closingQuantity;
  });

  // Sort deterministically by materialCode, then materialName
  rows.sort((a, b) => {
    const codeCmp = a.materialCode.localeCompare(b.materialCode, 'vi', { numeric: true, sensitivity: 'base' });
    if (codeCmp !== 0) return codeCmp;
    return a.materialName.localeCompare(b.materialName, 'vi', { numeric: true, sensitivity: 'base' });
  });

  return {
    rows,
    totals: {
      openingQuantity: normalizeSignedZero(totalOpening),
      inboundQuantity: normalizeSignedZero(totalInbound),
      returnInboundQuantity: normalizeSignedZero(totalReturnInbound),
      outboundQuantity: normalizeSignedZero(totalOutbound),
      transferOutboundQuantity: normalizeSignedZero(totalTransferOutbound),
      closingQuantity: normalizeSignedZero(totalClosing)
    }
  };
}

function parseYmdParts(dateStr?: string): { day: string; month: string; year: string } | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  const ymd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    return {
      day: ymd[3].padStart(2, '0'),
      month: ymd[2].padStart(2, '0'),
      year: ymd[1]
    };
  }
  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    return {
      day: dmy[1].padStart(2, '0'),
      month: dmy[2].padStart(2, '0'),
      year: dmy[3]
    };
  }
  return null;
}

/**
 * Formats the subtitle date range matching QN-OPR-PR11-FM09:
 * "Từ ngày....tháng....năm...... đến ngày....tháng....năm......."
 */
export function formatFm09DateRange(startDate?: string, endDate?: string): string {
  const from = parseYmdParts(startDate);
  const to = parseYmdParts(endDate);

  const fromStr = from
    ? `Từ ngày ${from.day} tháng ${from.month} năm ${from.year}`
    : 'Từ ngày....tháng....năm......';
  const toStr = to
    ? `đến ngày ${to.day} tháng ${to.month} năm ${to.year}`
    : 'đến ngày....tháng....năm.......';

  return `${fromStr} ${toStr}`;
}

/**
 * Formats a quantity number for display in FM09 (Vietnamese locale, clean decimals).
 */
export function formatFm09Qty(val?: number): string {
  const num = normalizeSignedZero(Number(val) || 0);
  if (Number.isInteger(num)) {
    return num.toLocaleString('vi-VN');
  }
  return num.toLocaleString('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  });
}

/**
 * Generates a clean PDF file name for the FM09 report.
 */
export function buildFm09PdfFileName(startDate?: string, endDate?: string, now = new Date()): string {
  const from = parseYmdParts(startDate);
  const to = parseYmdParts(endDate);
  if (from && to) {
    return `BaoCao_NhapXuatTon_FM09_${from.year}-${from.month}-${from.day}_den_${to.year}-${to.month}-${to.day}.pdf`;
  }
  if (from) {
    return `BaoCao_NhapXuatTon_FM09_tu_${from.year}-${from.month}-${from.day}.pdf`;
  }
  if (to) {
    return `BaoCao_NhapXuatTon_FM09_den_${to.year}-${to.month}-${to.day}.pdf`;
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `BaoCao_NhapXuatTon_FM09_${y}-${m}-${d}.pdf`;
}
