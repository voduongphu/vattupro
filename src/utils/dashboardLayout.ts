import {
  InboundReceipt,
  InventoryStockRecord,
  OutboundReceipt,
  Warehouse
} from '../types/inventory';
import { roundQty, sumInboundItems, sumOutboundItems } from './additiveMerge';

export type KpiWidgetId =
  | 'kpi_stock_weight'
  | 'kpi_stock_qty'
  | 'kpi_pl_shipment'
  | 'kpi_warehouses'
  | 'kpi_inbound_total'
  | 'kpi_outbound_total'
  | 'kpi_osd_open';

export type MainWidgetId =
  | 'widget_inout_trend'
  | 'widget_warehouse_stock'
  | 'widget_category_breakdown'
  | 'widget_recent_inbounds'
  | 'widget_recent_outbounds';

export interface DashboardLayoutConfig {
  kpiOrder: KpiWidgetId[];
  hiddenKpis: KpiWidgetId[];
  widgetOrder: MainWidgetId[];
  hiddenWidgets: MainWidgetId[];
}

export interface KpiWidgetMeta {
  id: KpiWidgetId;
  labelVi: string;
  labelEn: string;
  defaultHidden?: boolean;
}

export interface MainWidgetMeta {
  id: MainWidgetId;
  labelVi: string;
  labelEn: string;
  preferredSpan: 2 | 3; // out of 6-column desktop grid
  defaultHidden?: boolean;
}

export const KPI_WIDGET_CATALOG: KpiWidgetMeta[] = [
  { id: 'kpi_stock_weight', labelVi: 'Tổng Khối Lượng Tồn', labelEn: 'Total Stock Weight' },
  { id: 'kpi_stock_qty', labelVi: 'Tổng Số Lượng Tồn', labelEn: 'Total Stock Quantity' },
  { id: 'kpi_pl_shipment', labelVi: 'Packing List & Shipment', labelEn: 'Packing Lists & Shipments' },
  { id: 'kpi_warehouses', labelVi: 'Kho Bãi Lưu Trữ', labelEn: 'Storage Warehouses' },
  {
    id: 'kpi_inbound_total',
    labelVi: 'Tổng Nhập Kho',
    labelEn: 'Total Inbound',
    defaultHidden: true
  },
  {
    id: 'kpi_outbound_total',
    labelVi: 'Tổng Xuất Kho',
    labelEn: 'Total Outbound',
    defaultHidden: true
  },
  {
    id: 'kpi_osd_open',
    labelVi: 'Phiếu OSD Đang Mở',
    labelEn: 'Open OSD Cases',
    defaultHidden: true
  }
];

export const MAIN_WIDGET_CATALOG: MainWidgetMeta[] = [
  {
    id: 'widget_inout_trend',
    labelVi: 'Biểu Đồ Nhập - Xuất Theo Tháng',
    labelEn: 'Monthly Inbound vs Outbound Chart',
    preferredSpan: 3
  },
  {
    id: 'widget_warehouse_stock',
    labelVi: 'Biểu Đồ Tồn Kho Theo Kho Bãi',
    labelEn: 'Stock by Warehouse Chart',
    preferredSpan: 3
  },
  {
    id: 'widget_category_breakdown',
    labelVi: 'Phân Bổ Tồn Kho Theo Hạng Mục',
    labelEn: 'Stock Distribution by Category',
    preferredSpan: 2
  },
  {
    id: 'widget_recent_inbounds',
    labelVi: 'Phiếu Nhập Kho Gần Đây',
    labelEn: 'Recent Inbound Receipts',
    preferredSpan: 2
  },
  {
    id: 'widget_recent_outbounds',
    labelVi: 'Phiếu Xuất Kho Gần Đây',
    labelEn: 'Recent Outbound Issues',
    preferredSpan: 2
  }
];

const ALL_KPI_IDS: KpiWidgetId[] = KPI_WIDGET_CATALOG.map((k) => k.id);
const ALL_MAIN_WIDGET_IDS: MainWidgetId[] = MAIN_WIDGET_CATALOG.map((w) => w.id);
const PREFERRED_SPAN_MAP = new Map<MainWidgetId, 2 | 3>(
  MAIN_WIDGET_CATALOG.map((w) => [w.id, w.preferredSpan])
);

const STORAGE_KEY_PREFIX = 'vtp_dashboard_layout_v1_';

export function getDefaultDashboardLayout(): DashboardLayoutConfig {
  return {
    kpiOrder: [...ALL_KPI_IDS],
    hiddenKpis: KPI_WIDGET_CATALOG.filter((k) => k.defaultHidden).map((k) => k.id),
    widgetOrder: [...ALL_MAIN_WIDGET_IDS],
    hiddenWidgets: MAIN_WIDGET_CATALOG.filter((w) => w.defaultHidden).map((w) => w.id)
  };
}

function sanitizeOrder<T extends string>(raw: unknown, validIds: readonly T[]): T[] {
  const validSet = new Set<string>(validIds);
  const result: T[] = [];
  const seen = new Set<string>();

  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      if (typeof item === 'string' && validSet.has(item) && !seen.has(item)) {
        seen.add(item);
        result.push(item as T);
      }
    }
  }

  // Append any missing/newly-introduced IDs in default order
  for (let i = 0; i < validIds.length; i++) {
    const id = validIds[i];
    if (!seen.has(id)) {
      result.push(id);
    }
  }

  return result;
}

function sanitizeHidden<T extends string>(raw: unknown, validIds: readonly T[]): T[] {
  if (!Array.isArray(raw)) return [];
  const validSet = new Set<string>(validIds);
  const result: T[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item === 'string' && validSet.has(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item as T);
    }
  }
  return result;
}

export function sanitizeDashboardLayout(raw: unknown): DashboardLayoutConfig {
  const defaults = getDefaultDashboardLayout();
  if (!raw || typeof raw !== 'object') return defaults;
  const obj = raw as Record<string, unknown>;

  return {
    kpiOrder: sanitizeOrder(obj.kpiOrder, ALL_KPI_IDS),
    hiddenKpis:
      obj.hiddenKpis !== undefined
        ? sanitizeHidden(obj.hiddenKpis, ALL_KPI_IDS)
        : defaults.hiddenKpis,
    widgetOrder: sanitizeOrder(obj.widgetOrder, ALL_MAIN_WIDGET_IDS),
    hiddenWidgets:
      obj.hiddenWidgets !== undefined
        ? sanitizeHidden(obj.hiddenWidgets, ALL_MAIN_WIDGET_IDS)
        : defaults.hiddenWidgets
  };
}

export function loadDashboardLayout(userKey?: string): DashboardLayoutConfig {
  if (typeof window === 'undefined' || !window.localStorage) {
    return getDefaultDashboardLayout();
  }
  try {
    const key = `${STORAGE_KEY_PREFIX}${(userKey || 'default').trim().toLowerCase()}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return getDefaultDashboardLayout();
    return sanitizeDashboardLayout(JSON.parse(raw));
  } catch {
    return getDefaultDashboardLayout();
  }
}

export function saveDashboardLayout(
  config: DashboardLayoutConfig,
  userKey?: string
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const key = `${STORAGE_KEY_PREFIX}${(userKey || 'default').trim().toLowerCase()}`;
    window.localStorage.setItem(key, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function reorderIds<T extends string>(
  list: readonly T[],
  sourceId: T,
  targetId: T
): T[] {
  if (sourceId === targetId) return [...list];
  const fromIdx = list.indexOf(sourceId);
  const toIdx = list.indexOf(targetId);
  if (fromIdx === -1 || toIdx === -1) return [...list];
  const next = [...list];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return next;
}

export function moveIdByStep<T extends string>(
  list: readonly T[],
  id: T,
  delta: -1 | 1,
  visibleSubset?: readonly T[]
): T[] {
  if (!visibleSubset || visibleSubset.length === 0) {
    const idx = list.indexOf(id);
    if (idx === -1) return [...list];
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= list.length) return [...list];
    return reorderIds(list, id, list[targetIdx]);
  }

  const visIdx = visibleSubset.indexOf(id);
  if (visIdx === -1) return [...list];
  const neighborIdx = visIdx + delta;
  if (neighborIdx < 0 || neighborIdx >= visibleSubset.length) return [...list];
  return reorderIds(list, id, visibleSubset[neighborIdx]);
}

export function toggleHiddenId<T extends string>(
  hiddenList: readonly T[],
  id: T
): T[] {
  if (hiddenList.includes(id)) {
    return hiddenList.filter((item) => item !== id);
  }
  return [...hiddenList, id];
}

/**
 * Packs visible main widgets cleanly into 6-column desktop rows so hiding or reordering
 * widgets never leaves awkward half-empty trailing rows.
 */
export function computeWidgetRowSpans(
  visibleWidgetIds: readonly MainWidgetId[]
): Record<MainWidgetId, 2 | 3 | 4 | 6> {
  const spans = {} as Record<MainWidgetId, 2 | 3 | 4 | 6>;
  const rows: MainWidgetId[][] = [];
  let currentRow: MainWidgetId[] = [];
  let currentUsed = 0;

  for (let i = 0; i < visibleWidgetIds.length; i++) {
    const id = visibleWidgetIds[i];
    const pref = PREFERRED_SPAN_MAP.get(id) ?? 2;
    if (currentRow.length > 0 && currentUsed + pref > 6) {
      rows.push(currentRow);
      currentRow = [id];
      currentUsed = pref;
    } else {
      currentRow.push(id);
      currentUsed += pref;
    }
  }
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1) {
      spans[row[0]] = 6;
    } else if (row.length === 2) {
      const p0 = PREFERRED_SPAN_MAP.get(row[0]) ?? 2;
      const p1 = PREFERRED_SPAN_MAP.get(row[1]) ?? 2;
      if (p0 === p1) {
        spans[row[0]] = 3;
        spans[row[1]] = 3;
      } else if (p0 > p1) {
        spans[row[0]] = 4;
        spans[row[1]] = 2;
      } else {
        spans[row[0]] = 2;
        spans[row[1]] = 4;
      }
    } else {
      // 3 items in a row -> 2 + 2 + 2 = 6
      for (let j = 0; j < row.length; j++) {
        spans[row[j]] = 2;
      }
    }
  }

  return spans;
}

export interface MonthlyInOutPoint {
  monthKey: string; // YYYY-MM
  label: string; // T11/26
  inboundQty: number;
  outboundQty: number;
  inboundWeightKg: number;
  outboundWeightKg: number;
  inboundCount: number;
  outboundCount: number;
}

function parseYm(dateStr?: string): { year: number; month: number } | null {
  if (!dateStr) return null;
  const m = dateStr.trim().match(/^(\d{4})-(\d{1,2})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

function formatYmKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function buildMonthlyInOutTrend(
  inbounds: readonly InboundReceipt[],
  outbounds: readonly OutboundReceipt[],
  monthCount = 6,
  fallbackNow = new Date()
): MonthlyInOutPoint[] {
  const bucketMap = new Map<string, MonthlyInOutPoint>();
  let latestYmNum = 0;

  const touchBucket = (dateStr?: string): MonthlyInOutPoint | null => {
    const parsed = parseYm(dateStr);
    if (!parsed) return null;
    const ymNum = parsed.year * 12 + parsed.month;
    if (ymNum > latestYmNum) latestYmNum = ymNum;
    const key = formatYmKey(parsed.year, parsed.month);
    let bucket = bucketMap.get(key);
    if (!bucket) {
      bucket = {
        monthKey: key,
        label: `T${String(parsed.month).padStart(2, '0')}/${String(parsed.year).slice(-2)}`,
        inboundQty: 0,
        outboundQty: 0,
        inboundWeightKg: 0,
        outboundWeightKg: 0,
        inboundCount: 0,
        outboundCount: 0
      };
      bucketMap.set(key, bucket);
    }
    return bucket;
  };

  for (let i = 0; i < inbounds.length; i++) {
    const r = inbounds[i];
    const bucket = touchBucket(r.receiptDate);
    if (!bucket) continue;
    const sums =
      Array.isArray(r.items) && r.items.length > 0
        ? sumInboundItems(r.items)
        : { totalQuantity: Number(r.totalQuantity) || 0, totalWeightKg: Number(r.totalWeightKg) || 0 };
    bucket.inboundQty += sums.totalQuantity;
    bucket.inboundWeightKg += sums.totalWeightKg;
    bucket.inboundCount += 1;
  }

  for (let i = 0; i < outbounds.length; i++) {
    const r = outbounds[i];
    const bucket = touchBucket(r.issueDate);
    if (!bucket) continue;
    const sums =
      Array.isArray(r.items) && r.items.length > 0
        ? sumOutboundItems(r.items)
        : { totalQuantity: Number(r.totalQuantity) || 0, totalWeightKg: Number(r.totalWeightKg) || 0 };
    bucket.outboundQty += sums.totalQuantity;
    bucket.outboundWeightKg += sums.totalWeightKg;
    bucket.outboundCount += 1;
  }

  const anchorYear =
    latestYmNum > 0 ? Math.floor((latestYmNum - 1) / 12) : fallbackNow.getFullYear();
  const anchorMonth =
    latestYmNum > 0 ? ((latestYmNum - 1) % 12) + 1 : fallbackNow.getMonth() + 1;

  const series: MonthlyInOutPoint[] = [];
  for (let offset = monthCount - 1; offset >= 0; offset--) {
    const totalMonths = anchorYear * 12 + (anchorMonth - 1) - offset;
    const y = Math.floor(totalMonths / 12);
    const m = (totalMonths % 12) + 1;
    const key = formatYmKey(y, m);
    const existing = bucketMap.get(key);
    if (existing) {
      series.push({
        ...existing,
        inboundQty: roundQty(existing.inboundQty),
        outboundQty: roundQty(existing.outboundQty),
        inboundWeightKg: Math.round(existing.inboundWeightKg * 100) / 100,
        outboundWeightKg: Math.round(existing.outboundWeightKg * 100) / 100
      });
    } else {
      series.push({
        monthKey: key,
        label: `T${String(m).padStart(2, '0')}/${String(y).slice(-2)}`,
        inboundQty: 0,
        outboundQty: 0,
        inboundWeightKg: 0,
        outboundWeightKg: 0,
        inboundCount: 0,
        outboundCount: 0
      });
    }
  }

  return series;
}

export interface WarehouseStockSummaryItem {
  warehouseId: string;
  warehouseName: string;
  stockQty: number;
  stockWeightKg: number;
  inboundQty: number;
  outboundQty: number;
  materialCount: number;
}

export function buildWarehouseStockBreakdown(
  records: readonly InventoryStockRecord[],
  warehouses: readonly Warehouse[]
): WarehouseStockSummaryItem[] {
  const whNameMap = new Map<string, string>();
  for (let i = 0; i < warehouses.length; i++) {
    whNameMap.set(warehouses[i].id, warehouses[i].name);
  }

  const map = new Map<
    string,
    {
      warehouseId: string;
      warehouseName: string;
      stockQty: number;
      stockWeightKg: number;
      inboundQty: number;
      outboundQty: number;
      materials: Set<string>;
    }
  >();

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const whId = r.warehouseId || r.warehouseName || 'unknown';
    const whName = whNameMap.get(whId) || r.warehouseName || 'Kho mặc định';
    let entry = map.get(whId);
    if (!entry) {
      entry = {
        warehouseId: whId,
        warehouseName: whName,
        stockQty: 0,
        stockWeightKg: 0,
        inboundQty: 0,
        outboundQty: 0,
        materials: new Set<string>()
      };
      map.set(whId, entry);
    }
    entry.stockQty += Number(r.currentQuantity) || 0;
    entry.stockWeightKg += Number(r.currentWeightKg) || 0;
    entry.inboundQty += (Number(r.inboundQuantity) || 0) + (Number(r.returnInboundQuantity) || 0);
    entry.outboundQty +=
      (Number(r.outboundQuantity) || 0) + (Number(r.transferOutboundQuantity) || 0);
    const matKey = (r.materialCode || r.materialName || r.id).trim().toUpperCase();
    if (matKey) entry.materials.add(matKey);
  }

  return Array.from(map.values())
    .map((e) => ({
      warehouseId: e.warehouseId,
      warehouseName: e.warehouseName,
      stockQty: roundQty(e.stockQty),
      stockWeightKg: Math.round(e.stockWeightKg * 100) / 100,
      inboundQty: roundQty(e.inboundQty),
      outboundQty: roundQty(e.outboundQty),
      materialCount: e.materials.size
    }))
    .sort((a, b) => b.stockWeightKg - a.stockWeightKg || b.stockQty - a.stockQty);
}
