import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { StorageService } from '../../services/storage';
import { InboundReceipt, OutboundReceipt, User } from '../../types/inventory';
import {
  getAuthorizedWarehouses,
  isWarehouseAuthorized,
  roundQty,
  sumInboundItems,
  sumOutboundItems
} from '../../utils/additiveMerge';
import {
  DashboardLayoutConfig,
  KPI_WIDGET_CATALOG,
  KpiWidgetId,
  MAIN_WIDGET_CATALOG,
  MainWidgetId,
  MonthlyInOutPoint,
  WarehouseStockSummaryItem,
  buildMonthlyInOutTrend,
  buildWarehouseStockBreakdown,
  computeWidgetRowSpans,
  getDefaultDashboardLayout,
  loadDashboardLayout,
  moveIdByStep,
  reorderIds,
  saveDashboardLayout,
  toggleHiddenId
} from '../../utils/dashboardLayout';
import { formatVoucherDateVi } from '../../services/excelService';
import { ReceiptDetailViewModal } from '../common/ReceiptDetailViewModal';
import { ReceiptPrintModal } from '../common/ReceiptPrintModal';
import { MonthlyInOutTrendChart, WarehouseStockChart } from './DashboardCharts';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Package,
  Scale,
  Warehouse as WarehouseIcon,
  Layers,
  Truck,
  ShieldCheck,
  TrendingUp,
  FileWarning,
  ShieldAlert,
  Eye,
  EyeOff,
  GripVertical,
  SlidersHorizontal,
  RotateCcw,
  Check,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface DashboardOverviewProps {
  onNavigate: (tab: string) => void;
}

const MAX_RECENT_POOL = 24;
const MIN_RECENT_ITEMS = 4;

const WIDGET_SPAN_CLASS: Record<2 | 3 | 4 | 6, string> = {
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  6: 'lg:col-span-6'
};

function getKpiGridColsClass(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2';
  if (count === 3) return 'grid-cols-1 sm:grid-cols-3';
  if (count === 5 || count === 6) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ onNavigate }) => {
  const { currentUser, isAdmin } = useAuth();
  const { language, t } = useLanguage();
  const locale = language === 'en' ? 'en-US' : 'vi-VN';

  const userLayoutKey = currentUser?.id || currentUser?.username || 'default';
  const [layout, setLayout] = useState<DashboardLayoutConfig>(() =>
    loadDashboardLayout(userLayoutKey)
  );
  const [isCustomizing, setIsCustomizing] = useState(false);

  // Drag & Drop state (KPI cards and Main widgets are reordered within their respective zones)
  const [armedKpiDrag, setArmedKpiDrag] = useState<KpiWidgetId | null>(null);
  const [draggingKpi, setDraggingKpi] = useState<KpiWidgetId | null>(null);
  const [dragOverKpi, setDragOverKpi] = useState<KpiWidgetId | null>(null);

  const [armedWidgetDrag, setArmedWidgetDrag] = useState<MainWidgetId | null>(null);
  const [draggingWidget, setDraggingWidget] = useState<MainWidgetId | null>(null);
  const [dragOverWidget, setDragOverWidget] = useState<MainWidgetId | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [viewingInbound, setViewingInbound] = useState<InboundReceipt | null>(null);
  const [viewingOutbound, setViewingOutbound] = useState<OutboundReceipt | null>(null);
  const [printingInbound, setPrintingInbound] = useState<InboundReceipt | null>(null);
  const [printingOutbound, setPrintingOutbound] = useState<OutboundReceipt | null>(null);

  const categoryListRef = useRef<HTMLDivElement | null>(null);
  const inboundListRef = useRef<HTMLDivElement | null>(null);
  const outboundListRef = useRef<HTMLDivElement | null>(null);

  const [recentCounts, setRecentCounts] = useState<{ inbound: number; outbound: number }>({
    inbound: MIN_RECENT_ITEMS,
    outbound: MIN_RECENT_ITEMS
  });

  const [stats, setStats] = useState({
    totalStockWeightKg: 0,
    totalStockQty: 0,
    totalInboundQty: 0,
    totalInboundWeightKg: 0,
    totalInboundVoucherCount: 0,
    totalOutboundQty: 0,
    totalOutboundWeightKg: 0,
    totalOutboundVoucherCount: 0,
    openOsdCount: 0,
    totalOsdCount: 0,
    totalPLCount: 0,
    totalShipmentCount: 0,
    totalWarehouseCount: 0,
    totalMaterialCount: 0,
    noAssignedWarehouses: false,
    hasSystemWarehouses: false,
    recentInbounds: [] as InboundReceipt[],
    recentOutbounds: [] as OutboundReceipt[],
    categoryBreakdown: [] as { name: string; count: number; weight: number }[],
    monthlyTrend: [] as MonthlyInOutPoint[],
    warehouseBreakdown: [] as WarehouseStockSummaryItem[]
  });

  // Reload per-user layout when switching accounts
  useEffect(() => {
    setLayout(loadDashboardLayout(userLayoutKey));
  }, [userLayoutKey]);

  const updateLayout = (
    updater: (prev: DashboardLayoutConfig) => DashboardLayoutConfig
  ) => {
    setLayout((prev) => {
      const next = updater(prev);
      saveDashboardLayout(next, userLayoutKey);
      return next;
    });
  };

  useEffect(() => {
    const computeStats = () => {
      const allInbounds = StorageService.getInboundReceipts();
      const allOutbounds = StorageService.getOutboundReceipts();
      const allWarehouses = StorageService.getWarehouses();
      const allOsds = StorageService.getOsdReceipts();
      const materials = StorageService.getMaterials();
      setUsers(StorageService.getUsers());

      const authorizedWarehouses = getAuthorizedWarehouses(allWarehouses, currentUser);
      const allowedWarehouseIds = isAdmin ? undefined : authorizedWarehouses.map((w) => w.id);
      const inbounds = isAdmin
        ? allInbounds
        : allInbounds.filter((r) =>
            isWarehouseAuthorized(r.warehouseId, r.warehouseName, allWarehouses, currentUser)
          );
      const outbounds = isAdmin
        ? allOutbounds
        : allOutbounds.filter((r) =>
            isWarehouseAuthorized(r.warehouseId, r.warehouseName, allWarehouses, currentUser)
          );
      const osds = isAdmin
        ? allOsds
        : allOsds.filter((r) =>
            isWarehouseAuthorized(r.warehouseId, r.warehouseName, allWarehouses, currentUser)
          );

      const records = StorageService.calculateInventoryRecords(
        isAdmin ? undefined : { allowedWarehouseIds }
      );
      const filterOpts = StorageService.getInventoryFilterOptions(allowedWarehouseIds);

      let totalWeight = 0;
      let totalQty = 0;
      let totalInboundQty = 0;
      let totalInboundWeight = 0;
      let totalOutboundQty = 0;
      let totalOutboundWeight = 0;
      const catMap = new Map<string, { count: number; weight: number }>();
      const uniqueMaterialKeys = new Set<string>();

      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        totalWeight += r.currentWeightKg;
        totalQty += r.currentQuantity;
        totalInboundQty += (r.inboundQuantity || 0) + (r.returnInboundQuantity || 0);
        totalInboundWeight += (r.inboundWeightKg || 0) + (r.returnInboundWeightKg || 0);
        totalOutboundQty += (r.outboundQuantity || 0) + (r.transferOutboundQuantity || 0);
        totalOutboundWeight += (r.outboundWeightKg || 0) + (r.transferOutboundWeightKg || 0);

        const matKey = (r.materialCode || r.materialName || r.id).trim().toUpperCase();
        if (matKey) uniqueMaterialKeys.add(matKey);
        const cat = r.category || 'Khác';
        const curr = catMap.get(cat);
        if (curr) {
          curr.count += r.currentQuantity;
          curr.weight += r.currentWeightKg;
        } else {
          catMap.set(cat, { count: r.currentQuantity, weight: r.currentWeightKg });
        }
      }

      const sortedCats = Array.from(catMap.entries())
        .map(([name, data]) => ({
          name,
          count: roundQty(data.count),
          weight: Math.round(data.weight)
        }))
        .sort((a, b) => b.weight - a.weight);

      const MAX_DISPLAY_CATS = 8;
      let categoryBreakdown = sortedCats;
      if (sortedCats.length > MAX_DISPLAY_CATS) {
        const topCats = sortedCats.slice(0, MAX_DISPLAY_CATS);
        let restCount = 0;
        let restWeight = 0;
        for (let i = MAX_DISPLAY_CATS; i < sortedCats.length; i++) {
          restCount += sortedCats[i].count;
          restWeight += sortedCats[i].weight;
        }
        categoryBreakdown = [
          ...topCats,
          {
            name: `Các hạng mục khác (${sortedCats.length - MAX_DISPLAY_CATS})`,
            count: roundQty(restCount),
            weight: restWeight
          }
        ];
      }

      const monthlyTrend = buildMonthlyInOutTrend(inbounds, outbounds, 6);
      const warehouseBreakdown = buildWarehouseStockBreakdown(records, authorizedWarehouses);
      const openOsdCount = osds.filter((o) => o.status === 'open').length;

      setStats({
        totalStockWeightKg: Math.round(totalWeight * 100) / 100,
        totalStockQty: roundQty(totalQty),
        totalInboundQty: roundQty(totalInboundQty),
        totalInboundWeightKg: Math.round(totalInboundWeight * 100) / 100,
        totalInboundVoucherCount: inbounds.length,
        totalOutboundQty: roundQty(totalOutboundQty),
        totalOutboundWeightKg: Math.round(totalOutboundWeight * 100) / 100,
        totalOutboundVoucherCount: outbounds.length,
        openOsdCount,
        totalOsdCount: osds.length,
        totalPLCount: filterOpts.totalPLCount,
        totalShipmentCount: filterOpts.totalShipmentCount,
        totalWarehouseCount: authorizedWarehouses.length,
        totalMaterialCount: isAdmin ? materials.length : uniqueMaterialKeys.size,
        noAssignedWarehouses: !isAdmin && authorizedWarehouses.length === 0,
        hasSystemWarehouses: allWarehouses.length > 0,
        recentInbounds: inbounds.slice(0, MAX_RECENT_POOL),
        recentOutbounds: outbounds.slice(0, MAX_RECENT_POOL),
        categoryBreakdown,
        monthlyTrend,
        warehouseBreakdown
      });
    };

    computeStats();
    return StorageService.subscribe(computeStats);
  }, [currentUser, isAdmin]);

  const visibleKpis = useMemo(
    () => layout.kpiOrder.filter((id) => !layout.hiddenKpis.includes(id)),
    [layout.kpiOrder, layout.hiddenKpis]
  );

  const visibleMainWidgets = useMemo(
    () => layout.widgetOrder.filter((id) => !layout.hiddenWidgets.includes(id)),
    [layout.widgetOrder, layout.hiddenWidgets]
  );

  const mainWidgetSpans = useMemo(
    () => computeWidgetRowSpans(visibleMainWidgets),
    [visibleMainWidgets]
  );

  const isCategoryVisible = visibleMainWidgets.includes('widget_category_breakdown');

  // Dynamically match the height of Recent Inbound & Outbound cards to the Category Breakdown column
  useEffect(() => {
    const syncCounts = () => {
      const catCount = stats.categoryBreakdown.length;
      const isDesktopThreeCol =
        typeof window !== 'undefined' && window.innerWidth >= 1024 && isCategoryVisible;

      if (!isDesktopThreeCol) {
        const defaultTarget = Math.max(MIN_RECENT_ITEMS, Math.min(6, catCount || 5));
        setRecentCounts((prev) =>
          prev.inbound === defaultTarget && prev.outbound === defaultTarget
            ? prev
            : { inbound: defaultTarget, outbound: defaultTarget }
        );
        return;
      }

      const catHeight = categoryListRef.current?.clientHeight || 0;
      if (catHeight <= 0) {
        const fallback = Math.max(MIN_RECENT_ITEMS, Math.min(MAX_RECENT_POOL, catCount));
        setRecentCounts((prev) =>
          prev.inbound === fallback && prev.outbound === fallback
            ? prev
            : { inbound: fallback, outbound: fallback }
        );
        return;
      }

      const measureCardStep = (container: HTMLDivElement | null, fallbackStep: number): number => {
        if (!container || container.children.length === 0) return fallbackStep;
        const children = Array.from(container.children) as HTMLElement[];
        let totalH = 0;
        let valid = 0;
        for (let i = 0; i < Math.min(children.length, 6); i++) {
          const h = children[i].getBoundingClientRect().height;
          if (h > 20) {
            totalH += h;
            valid++;
          }
        }
        if (valid === 0) return fallbackStep;
        return totalH / valid + 10; // space-y-2.5 === 10px
      };

      const inStep = measureCardStep(inboundListRef.current, 96);
      const outStep = measureCardStep(outboundListRef.current, 96);

      const nextIn = Math.max(
        MIN_RECENT_ITEMS,
        Math.min(MAX_RECENT_POOL, Math.round((catHeight + 10) / inStep))
      );
      const nextOut = Math.max(
        MIN_RECENT_ITEMS,
        Math.min(MAX_RECENT_POOL, Math.round((catHeight + 10) / outStep))
      );

      setRecentCounts((prev) =>
        prev.inbound === nextIn && prev.outbound === nextOut
          ? prev
          : { inbound: nextIn, outbound: nextOut }
      );
    };

    syncCounts();
    const rafId = window.requestAnimationFrame(syncCounts);

    const observer =
      typeof ResizeObserver !== 'undefined' && categoryListRef.current
        ? new ResizeObserver(() => syncCounts())
        : null;
    if (observer && categoryListRef.current) {
      observer.observe(categoryListRef.current);
    }

    window.addEventListener('resize', syncCounts);
    return () => {
      window.cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener('resize', syncCounts);
    };
  }, [
    isCategoryVisible,
    stats.categoryBreakdown.length,
    stats.recentInbounds.length,
    stats.recentOutbounds.length,
    visibleMainWidgets.length
  ]);

  const displayedInbounds = stats.recentInbounds.slice(0, recentCounts.inbound);
  const displayedOutbounds = stats.recentOutbounds.slice(0, recentCounts.outbound);

  const handleToggleKpi = (id: KpiWidgetId) => {
    updateLayout((prev) => ({
      ...prev,
      hiddenKpis: toggleHiddenId(prev.hiddenKpis, id)
    }));
  };

  const handleToggleWidget = (id: MainWidgetId) => {
    updateLayout((prev) => ({
      ...prev,
      hiddenWidgets: toggleHiddenId(prev.hiddenWidgets, id)
    }));
  };

  const handleResetLayout = () => {
    updateLayout(() => getDefaultDashboardLayout());
  };

  const renderKpiCardContent = (id: KpiWidgetId) => {
    switch (id) {
      case 'kpi_stock_weight':
        return (
          <>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                {t('Tổng Khối Lượng Tồn')}
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-slate-900 font-mono tabular-nums">
                  {(stats.totalStockWeightKg / 1000).toFixed(2)}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  {language === 'en' ? 'Tons' : 'Tấn'}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block tabular-nums">
                ({stats.totalStockWeightKg.toLocaleString(locale)} kg)
              </span>
            </div>
            <div className="p-3 bg-blue-50 text-blue-700 rounded-2xl shrink-0">
              <Scale className="w-6 h-6" />
            </div>
          </>
        );
      case 'kpi_stock_qty':
        return (
          <>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                {t('Tổng Số Lượng Tồn')}
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-emerald-700 font-mono tabular-nums">
                  {stats.totalStockQty.toLocaleString(locale)}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  {language === 'en' ? 'Units / Pkgs' : 'Đơn vị / Kiện'}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block tabular-nums">
                {stats.totalMaterialCount.toLocaleString(locale)}{' '}
                {language === 'en' ? 'material items' : 'mã vật tư thiết bị'}
              </span>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl shrink-0">
              <Package className="w-6 h-6" />
            </div>
          </>
        );
      case 'kpi_pl_shipment':
        return (
          <>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                {t('Packing List & Shipment')}
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-indigo-700 font-mono tabular-nums">
                  {stats.totalPLCount.toLocaleString(locale)}
                </span>
                <span className="text-xs text-slate-500 font-medium tabular-nums">
                  PL / {stats.totalShipmentCount.toLocaleString(locale)}{' '}
                  {language === 'en' ? 'Shipments' : 'Lô'}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                {language === 'en' ? '100% Traceability' : 'Truy xuất nguồn gốc chuẩn 100%'}
              </span>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-700 rounded-2xl shrink-0">
              <Truck className="w-6 h-6" />
            </div>
          </>
        );
      case 'kpi_warehouses':
        return (
          <>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                {language === 'en' ? 'Storage Warehouses' : 'Kho Bãi Lưu Trữ'}
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-amber-700 font-mono tabular-nums">
                  {stats.totalWarehouseCount}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  {language === 'en' ? 'Active yards & stores' : 'Khu bãi & kho'}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                {language === 'en' ? 'Authorized storage locations' : 'Kho bãi trong phạm vi quản lý'}
              </span>
            </div>
            <div className="p-3 bg-amber-50 text-amber-700 rounded-2xl shrink-0">
              <WarehouseIcon className="w-6 h-6" />
            </div>
          </>
        );
      case 'kpi_inbound_total':
        return (
          <>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                {language === 'en' ? 'Total Inbound' : 'Tổng Nhập Kho'}
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-emerald-700 font-mono tabular-nums">
                  +{stats.totalInboundQty.toLocaleString(locale)}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  {language === 'en' ? 'Qty' : 'SL'}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block tabular-nums">
                {stats.totalInboundVoucherCount.toLocaleString(locale)}{' '}
                {language === 'en' ? 'receipts' : 'phiếu nhập'} ·{' '}
                {Math.round(stats.totalInboundWeightKg).toLocaleString(locale)} kg
              </span>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl shrink-0">
              <ArrowDownLeft className="w-6 h-6" />
            </div>
          </>
        );
      case 'kpi_outbound_total':
        return (
          <>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                {language === 'en' ? 'Total Outbound' : 'Tổng Xuất Kho'}
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-rose-700 font-mono tabular-nums">
                  -{stats.totalOutboundQty.toLocaleString(locale)}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  {language === 'en' ? 'Qty' : 'SL'}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block tabular-nums">
                {stats.totalOutboundVoucherCount.toLocaleString(locale)}{' '}
                {language === 'en' ? 'vouchers' : 'phiếu xuất'} ·{' '}
                {Math.round(stats.totalOutboundWeightKg).toLocaleString(locale)} kg
              </span>
            </div>
            <div className="p-3 bg-rose-50 text-rose-700 rounded-2xl shrink-0">
              <ArrowUpRight className="w-6 h-6" />
            </div>
          </>
        );
      case 'kpi_osd_open':
        return (
          <>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                {language === 'en' ? 'Open OSD Cases' : 'Phiếu OSD Đang Mở'}
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-amber-700 font-mono tabular-nums">
                  {stats.openOsdCount.toLocaleString(locale)}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  / {stats.totalOsdCount.toLocaleString(locale)}{' '}
                  {language === 'en' ? 'cases' : 'biên bản'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('osd')}
                className="text-[11px] text-amber-700 hover:underline font-semibold mt-0.5 block"
              >
                {language === 'en' ? 'Open OSD Manager →' : 'Mở Quản lý OSD →'}
              </button>
            </div>
            <div className="p-3 bg-amber-50 text-amber-700 rounded-2xl shrink-0">
              <FileWarning className="w-6 h-6" />
            </div>
          </>
        );
    }
  };

  const renderWidgetHeaderControls = (widgetId: MainWidgetId, visibleIdx: number) => {
    const canMovePrev = visibleIdx > 0;
    const canMoveNext = visibleIdx < visibleMainWidgets.length - 1;
    return (
      <div className="flex items-center gap-0.5 shrink-0">
        {isCustomizing && (
          <>
            <button
              type="button"
              disabled={!canMovePrev}
              onClick={() =>
                updateLayout((prev) => ({
                  ...prev,
                  widgetOrder: moveIdByStep(prev.widgetOrder, widgetId, -1, visibleMainWidgets)
                }))
              }
              title={language === 'en' ? 'Move earlier' : 'Di chuyển lên trước'}
              className="p-1 rounded-md text-slate-500 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-30 transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={!canMoveNext}
              onClick={() =>
                updateLayout((prev) => ({
                  ...prev,
                  widgetOrder: moveIdByStep(prev.widgetOrder, widgetId, 1, visibleMainWidgets)
                }))
              }
              title={language === 'en' ? 'Move later' : 'Di chuyển ra sau'}
              className="p-1 rounded-md text-slate-500 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-30 transition"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleToggleWidget(widgetId)}
              title={language === 'en' ? 'Hide widget' : 'Ẩn khối này'}
              className="p-1 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        <span
          onPointerDown={() => setArmedWidgetDrag(widgetId)}
          onPointerUp={() => setArmedWidgetDrag(null)}
          title={language === 'en' ? 'Drag to reorder widget' : 'Kéo để đổi vị trí khối'}
          className={`p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 cursor-grab active:cursor-grabbing transition ${
            isCustomizing ? 'opacity-100' : 'opacity-0 group-hover/widget:opacity-100'
          }`}
        >
          <GripVertical className="w-4 h-4" />
        </span>
      </div>
    );
  };

  const renderMainWidgetBody = (widgetId: MainWidgetId, visibleIdx: number) => {
    const controls = renderWidgetHeaderControls(widgetId, visibleIdx);

    switch (widgetId) {
      case 'widget_inout_trend':
        return (
          <MonthlyInOutTrendChart
            data={stats.monthlyTrend}
            language={language}
            headerControls={controls}
          />
        );

      case 'widget_warehouse_stock':
        return (
          <WarehouseStockChart
            data={stats.warehouseBreakdown}
            language={language}
            headerControls={controls}
          />
        );

      case 'widget_category_breakdown':
        return (
          <div className="flex flex-col gap-4 h-full">
            <div className="flex items-center justify-between gap-2 shrink-0">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 min-w-0">
                <Layers className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="truncate">{t('Phân Bổ Tồn Kho Theo Hạng Mục')}</span>
              </h3>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate('report')}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold whitespace-nowrap"
                >
                  {t('Xem chi tiết')}
                </button>
                {controls}
              </div>
            </div>

            <div ref={categoryListRef} className="space-y-3">
              {stats.categoryBreakdown.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  {language === 'en' ? 'No stock categories yet' : 'Chưa có dữ liệu hạng mục tồn kho'}
                </div>
              ) : (
                stats.categoryBreakdown.map((cat, i) => {
                  const pct =
                    stats.totalStockWeightKg > 0
                      ? (cat.weight / stats.totalStockWeightKg) * 100
                      : 0;
                  return (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5"
                    >
                      <div className="flex justify-between items-center gap-2 text-xs">
                        <span
                          className="font-semibold text-slate-800 line-clamp-1 min-w-0"
                          title={cat.name}
                          data-user-content={
                            cat.name !== 'Khác' && !cat.name.startsWith('Các hạng mục khác')
                              ? 'true'
                              : undefined
                          }
                        >
                          {cat.name === 'Khác' || cat.name.startsWith('Các hạng mục khác')
                            ? t(cat.name)
                            : cat.name}
                        </span>
                        <span className="font-mono font-bold text-slate-700 whitespace-nowrap shrink-0">
                          {cat.weight.toLocaleString(locale)} kg
                        </span>
                      </div>
                      <progress
                        value={Math.min(100, Math.max(8, Math.round(pct)))}
                        max={100}
                        className="w-full h-1.5 rounded-full overflow-hidden block [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:bg-blue-600 [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:bg-blue-600"
                      />
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>
                          {language === 'en' ? 'Quantity:' : 'Số lượng:'}{' '}
                          {cat.count.toLocaleString(locale)}
                        </span>
                        <span>
                          {language === 'en' ? 'Ratio:' : 'Tỷ trọng:'} {pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );

      case 'widget_recent_inbounds':
        return (
          <div className="flex flex-col gap-4 h-full">
            <div className="flex items-center justify-between gap-2 shrink-0">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 min-w-0">
                <ArrowDownLeft className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="truncate">{t('Phiếu Nhập Kho Gần Đây')}</span>
              </h3>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate('inbound')}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold whitespace-nowrap"
                >
                  {language === 'en' ? 'All Vouchers' : 'Tất cả phiếu'}
                </button>
                {controls}
              </div>
            </div>

            <div ref={inboundListRef} className="space-y-2.5">
              {displayedInbounds.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  {language === 'en'
                    ? 'No recent inbound receipts'
                    : 'Chưa có phiếu nhập kho nào gần đây'}
                </div>
              ) : (
                displayedInbounds.map((inb) => {
                  const inSums = sumInboundItems(Array.isArray(inb.items) ? inb.items : []);
                  const plSummary = `PL: ${inb.packingListNo || 'N/A'} | ${inb.shipment || 'N/A'}`;
                  return (
                    <button
                      key={inb.id}
                      type="button"
                      onClick={() => {
                        setViewingOutbound(null);
                        setViewingInbound(inb);
                      }}
                      title={
                        language === 'en'
                          ? `Click to view inbound receipt ${inb.receiptCode}`
                          : `Nhấn để xem chi tiết phiếu nhập kho ${inb.receiptCode}`
                      }
                      className="group w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-blue-50/70 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition border border-slate-100 text-xs block"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="font-mono font-bold text-blue-700 group-hover:underline truncate"
                              data-user-content="true"
                            >
                              {inb.receiptCode}
                            </span>
                            <Eye className="w-3.5 h-3.5 text-blue-500 opacity-0 group-hover:opacity-100 transition shrink-0" />
                          </div>
                          <div
                            className="text-[11px] text-slate-500 font-mono truncate mt-0.5"
                            title={plSummary}
                            data-user-content="true"
                          >
                            {plSummary}
                          </div>
                        </div>
                        <span className="font-mono font-bold text-emerald-700 whitespace-nowrap shrink-0">
                          +{inSums.totalQuantity.toLocaleString(locale)}{' '}
                          {language === 'en' ? 'Qty' : 'SL'}
                        </span>
                      </div>
                      <div className="mt-1.5 flex justify-between items-center gap-2 text-[11px] text-slate-500 border-t border-slate-200/60 pt-1.5">
                        <span className="truncate min-w-0" data-user-content="true">
                          {inb.warehouseName}
                        </span>
                        <span className="whitespace-nowrap shrink-0">
                          {formatVoucherDateVi(inb.receiptDate)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );

      case 'widget_recent_outbounds':
        return (
          <div className="flex flex-col gap-4 h-full">
            <div className="flex items-center justify-between gap-2 shrink-0">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 min-w-0">
                <ArrowUpRight className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="truncate">{t('Phiếu Xuất Kho Gần Đây')}</span>
              </h3>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate('outbound')}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold whitespace-nowrap"
                >
                  {language === 'en' ? 'All Vouchers' : 'Tất cả phiếu'}
                </button>
                {controls}
              </div>
            </div>

            <div ref={outboundListRef} className="space-y-2.5">
              {displayedOutbounds.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  {language === 'en'
                    ? 'No recent outbound issues'
                    : 'Chưa có phiếu xuất kho nào gần đây'}
                </div>
              ) : (
                displayedOutbounds.map((outb) => {
                  const outSums = sumOutboundItems(Array.isArray(outb.items) ? outb.items : []);
                  return (
                    <button
                      key={outb.id}
                      type="button"
                      onClick={() => {
                        setViewingInbound(null);
                        setViewingOutbound(outb);
                      }}
                      title={
                        language === 'en'
                          ? `Click to view outbound issue ${outb.issueCode}`
                          : `Nhấn để xem chi tiết phiếu xuất kho ${outb.issueCode}`
                      }
                      className="group w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-rose-50/70 hover:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500/40 transition border border-slate-100 text-xs block"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="font-mono font-bold text-rose-700 group-hover:underline truncate"
                              data-user-content="true"
                            >
                              {outb.issueCode}
                            </span>
                            <Eye className="w-3.5 h-3.5 text-rose-500 opacity-0 group-hover:opacity-100 transition shrink-0" />
                          </div>
                          <div
                            className="text-[11px] text-slate-600 truncate font-medium mt-0.5"
                            title={outb.recipientDepartment}
                            data-user-content="true"
                          >
                            {outb.recipientDepartment}
                          </div>
                        </div>
                        <span className="font-mono font-bold text-rose-700 whitespace-nowrap shrink-0">
                          -{outSums.totalQuantity.toLocaleString(locale)}{' '}
                          {language === 'en' ? 'Qty' : 'SL'}
                        </span>
                      </div>
                      <div className="mt-1.5 flex justify-between items-center gap-2 text-[11px] text-slate-500 border-t border-slate-200/60 pt-1.5">
                        <span className="truncate min-w-0" data-user-content="true">
                          {outb.warehouseName}
                        </span>
                        <span className="whitespace-nowrap shrink-0">
                          {formatVoucherDateVi(outb.issueDate)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-950 p-4 sm:p-6 md:p-8 text-white shadow-xl">
        <div className="relative z-10 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-200 border border-blue-400/20 text-[11px] sm:text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>{t('Hệ Thống Quản Lý Nhập Xuất Tồn Vật Tư Dự Án')}</span>
            </div>

            <button
              type="button"
              onClick={() => setIsCustomizing((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                isCustomizing
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md'
                  : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
              }`}
            >
              {isCustomizing ? (
                <>
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>{language === 'en' ? 'Done Customizing' : 'Hoàn Tất Tùy Biến'}</span>
                </>
              ) : (
                <>
                  <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                  <span>{language === 'en' ? 'Customize Widgets' : 'Tùy Biến Giao Diện'}</span>
                </>
              )}
            </button>
          </div>

          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight">
            {language === 'en' ? 'Welcome, ' : 'Xin chào, '}
            <span data-user-content={currentUser?.fullName ? 'true' : undefined}>
              {currentUser?.fullName || (language === 'en' ? 'User' : 'Người dùng')}
            </span>
            !
          </h1>
          <p className="text-slate-300 text-xs md:text-sm leading-relaxed max-w-2xl">
            {language === 'en' ? (
              <>
                The system is currently managing{' '}
                <strong className="text-white font-semibold tabular-nums">
                  {stats.totalPLCount.toLocaleString('en-US')} Packing Lists
                </strong>{' '}
                and{' '}
                <strong className="text-white font-semibold tabular-nums">
                  {stats.totalShipmentCount.toLocaleString('en-US')} Shipments
                </strong>{' '}
                across{' '}
                <strong className="text-white font-semibold tabular-nums">
                  {stats.totalWarehouseCount} warehouses
                </strong>
                .
              </>
            ) : (
              <>
                Hệ thống đang quản lý{' '}
                <strong className="text-white font-semibold tabular-nums">
                  {stats.totalPLCount.toLocaleString('vi-VN')} Packing List
                </strong>{' '}
                và{' '}
                <strong className="text-white font-semibold tabular-nums">
                  {stats.totalShipmentCount.toLocaleString('vi-VN')} Shipment
                </strong>{' '}
                trên{' '}
                <strong className="text-white font-semibold tabular-nums">
                  {stats.totalWarehouseCount} kho bãi
                </strong>{' '}
                trọng điểm.
              </>
            )}
          </p>

          <div className="pt-2.5 grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => onNavigate('inbound')}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold shadow-md transition min-h-[42px] whitespace-nowrap"
            >
              <ArrowDownLeft className="w-4 h-4 shrink-0" />
              <span>{t('Nhập Kho Mới / Import Excel')}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('outbound')}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold border border-white/20 transition min-h-[42px] whitespace-nowrap"
            >
              <ArrowUpRight className="w-4 h-4 shrink-0" />
              <span>{t('Lập Phiếu Xuất Kho')}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('report')}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow transition min-h-[42px] whitespace-nowrap"
            >
              <TrendingUp className="w-4 h-4 shrink-0" />
              <span>{t('Xem Báo Cáo NXT Đa Chiều')}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('osd')}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-semibold shadow transition min-h-[42px] whitespace-nowrap"
            >
              <FileWarning className="w-4 h-4 shrink-0" />
              <span>{t('Quản Lý Vật Tư OSD')}</span>
            </button>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-blue-500/10 to-transparent pointer-events-none" />
      </div>

      {/* Inline Widget Customization Bar */}
      {isCustomizing && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-blue-200 shadow-md space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  {language === 'en'
                    ? 'Customize Dashboard Widgets & KPI Cards'
                    : 'Tùy Biến Thẻ KPI & Biểu Đồ Theo Dõi Nhập - Xuất - Tồn'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {language === 'en'
                  ? 'Toggle items below to show/hide, or drag and drop any KPI card or chart directly to rearrange. Preferences are saved automatically.'
                  : 'Nhấn để ẩn/hiện từng thẻ thông số hoặc kéo thả trực tiếp các thẻ KPI và biểu đồ bên dưới để sắp xếp vị trí. Cấu hình tự động lưu cho tài khoản của bạn.'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetLayout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{language === 'en' ? 'Reset Default' : 'Mặc định'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsCustomizing(false)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{language === 'en' ? 'Done' : 'Hoàn tất'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Toggle KPI Cards */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {language === 'en' ? 'KPI Summary Cards' : 'Thẻ Thông Số KPI'} ({visibleKpis.length}/
                {KPI_WIDGET_CATALOG.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {KPI_WIDGET_CATALOG.map((meta) => {
                  const isVisible = !layout.hiddenKpis.includes(meta.id);
                  return (
                    <button
                      key={meta.id}
                      type="button"
                      onClick={() => handleToggleKpi(meta.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                        isVisible
                          ? 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100'
                          : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-700'
                      }`}
                    >
                      {isVisible ? (
                        <Eye className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{language === 'en' ? meta.labelEn : meta.labelVi}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Toggle Main Charts & Lists */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {language === 'en' ? 'Charts & Monitoring Panels' : 'Biểu Đồ & Bảng Theo Dõi'} (
                {visibleMainWidgets.length}/{MAIN_WIDGET_CATALOG.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {MAIN_WIDGET_CATALOG.map((meta) => {
                  const isVisible = !layout.hiddenWidgets.includes(meta.id);
                  return (
                    <button
                      key={meta.id}
                      type="button"
                      onClick={() => handleToggleWidget(meta.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                        isVisible
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                          : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-700'
                      }`}
                    >
                      {isVisible ? (
                        <Eye className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{language === 'en' ? meta.labelEn : meta.labelVi}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {stats.noAssignedWarehouses && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-950 shadow-xs">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-sm text-amber-900">
              {stats.hasSystemWarehouses
                ? t('Tài khoản chưa được phân quyền thao tác kho nào')
                : t('Chưa tải được dữ liệu kho từ Cloud Firestore')}
            </div>
            <p className="mt-1 text-amber-800 leading-relaxed">
              {stats.hasSystemWarehouses
                ? t(
                    'Vui lòng liên hệ Quản trị viên (Admin) để cấp quyền truy cập cho các kho bãi bạn phụ trách trong mục Quản Lý Người Dùng.'
                  )
                : t(
                    'Vui lòng nhấn nút "Đồng Bộ Cloud" trên thanh tiêu đề để tải danh mục kho và dữ liệu mới nhất từ Cloud Firestore.'
                  )}
            </p>
          </div>
        </div>
      )}

      {/* Draggable & Toggleable KPI Cards Grid */}
      {visibleKpis.length > 0 && (
        <div className={`grid ${getKpiGridColsClass(visibleKpis.length)} gap-3 sm:gap-4`}>
          {visibleKpis.map((kpiId, idx) => {
            const isDragging = draggingKpi === kpiId;
            const isDropTarget = dragOverKpi === kpiId && draggingKpi && draggingKpi !== kpiId;
            const canMovePrev = idx > 0;
            const canMoveNext = idx < visibleKpis.length - 1;

            return (
              <div
                key={kpiId}
                draggable={isCustomizing || armedKpiDrag === kpiId}
                onDragStart={(e) => {
                  setDraggingKpi(kpiId);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', kpiId);
                }}
                onDragOver={(e) => {
                  if (!draggingKpi || draggingKpi === kpiId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverKpi !== kpiId) setDragOverKpi(kpiId);
                }}
                onDragLeave={() => {
                  if (dragOverKpi === kpiId) setDragOverKpi(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggingKpi && draggingKpi !== kpiId) {
                    updateLayout((prev) => ({
                      ...prev,
                      kpiOrder: reorderIds(prev.kpiOrder, draggingKpi, kpiId)
                    }));
                  }
                  setDraggingKpi(null);
                  setDragOverKpi(null);
                  setArmedKpiDrag(null);
                }}
                onDragEnd={() => {
                  setDraggingKpi(null);
                  setDragOverKpi(null);
                  setArmedKpiDrag(null);
                }}
                className={`group/kpi relative bg-white p-4 sm:p-5 rounded-2xl border shadow-sm transition ${
                  isDragging
                    ? 'opacity-45 border-blue-400 scale-[0.98]'
                    : isDropTarget
                      ? 'border-blue-500 ring-2 ring-blue-500/40 bg-blue-50/30 scale-[1.01]'
                      : isCustomizing
                        ? 'border-dashed border-blue-300 hover:border-blue-500 cursor-grab active:cursor-grabbing'
                        : 'border-slate-200/80'
                }`}
              >
                {/* Floating drag/reorder controls */}
                <div
                  className={`absolute top-2 right-2 flex items-center gap-0.5 bg-white/95 rounded-lg border border-slate-200/80 px-1 py-0.5 shadow-xs transition ${
                    isCustomizing ? 'opacity-100' : 'opacity-0 group-hover/kpi:opacity-100'
                  }`}
                >
                  {isCustomizing && (
                    <>
                      <button
                        type="button"
                        disabled={!canMovePrev}
                        onClick={() =>
                          updateLayout((prev) => ({
                            ...prev,
                            kpiOrder: moveIdByStep(prev.kpiOrder, kpiId, -1, visibleKpis)
                          }))
                        }
                        title={language === 'en' ? 'Move left' : 'Di chuyển sang trái'}
                        className="p-0.5 rounded text-slate-500 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-30"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={!canMoveNext}
                        onClick={() =>
                          updateLayout((prev) => ({
                            ...prev,
                            kpiOrder: moveIdByStep(prev.kpiOrder, kpiId, 1, visibleKpis)
                          }))
                        }
                        title={language === 'en' ? 'Move right' : 'Di chuyển sang phải'}
                        className="p-0.5 rounded text-slate-500 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-30"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleKpi(kpiId)}
                        title={language === 'en' ? 'Hide card' : 'Ẩn thẻ này'}
                        className="p-0.5 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <span
                    onPointerDown={() => setArmedKpiDrag(kpiId)}
                    onPointerUp={() => setArmedKpiDrag(null)}
                    title={language === 'en' ? 'Drag to reorder KPI card' : 'Kéo để đổi vị trí thẻ'}
                    className="p-0.5 rounded text-slate-400 hover:text-blue-600 cursor-grab active:cursor-grabbing"
                  >
                    <GripVertical className="w-3.5 h-3.5" />
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  {renderKpiCardContent(kpiId)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Draggable & Toggleable Main Charts and Monitoring Widgets (Adaptive 6-column grid) */}
      {visibleMainWidgets.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-5 items-stretch">
          {visibleMainWidgets.map((widgetId, idx) => {
            const span = mainWidgetSpans[widgetId] ?? 2;
            const isDragging = draggingWidget === widgetId;
            const isDropTarget =
              dragOverWidget === widgetId && draggingWidget && draggingWidget !== widgetId;

            return (
              <div
                key={widgetId}
                draggable={isCustomizing || armedWidgetDrag === widgetId}
                onDragStart={(e) => {
                  setDraggingWidget(widgetId);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', widgetId);
                }}
                onDragOver={(e) => {
                  if (!draggingWidget || draggingWidget === widgetId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverWidget !== widgetId) setDragOverWidget(widgetId);
                }}
                onDragLeave={() => {
                  if (dragOverWidget === widgetId) setDragOverWidget(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggingWidget && draggingWidget !== widgetId) {
                    updateLayout((prev) => ({
                      ...prev,
                      widgetOrder: reorderIds(prev.widgetOrder, draggingWidget, widgetId)
                    }));
                  }
                  setDraggingWidget(null);
                  setDragOverWidget(null);
                  setArmedWidgetDrag(null);
                }}
                onDragEnd={() => {
                  setDraggingWidget(null);
                  setDragOverWidget(null);
                  setArmedWidgetDrag(null);
                }}
                className={`group/widget ${WIDGET_SPAN_CLASS[span]} bg-white rounded-2xl p-5 border shadow-sm transition ${
                  isDragging
                    ? 'opacity-45 border-blue-400 scale-[0.99]'
                    : isDropTarget
                      ? 'border-blue-500 ring-2 ring-blue-500/40 bg-blue-50/20'
                      : isCustomizing
                        ? 'border-dashed border-blue-300 hover:border-blue-500'
                        : 'border-slate-200/80'
                }`}
              >
                {renderMainWidgetBody(widgetId, idx)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-8 border border-dashed border-slate-300 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-700">
            {language === 'en'
              ? 'All charts & monitoring widgets are currently hidden.'
              : 'Tất cả biểu đồ và bảng theo dõi đang được ẩn.'}
          </p>
          <button
            type="button"
            onClick={() => setIsCustomizing(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{language === 'en' ? 'Show Widgets' : 'Mở Tùy Biến Để Hiện Lại'}</span>
          </button>
        </div>
      )}

      {/* Modal Xem Chi Tiết Phiếu Nhập / Xuất mở trực tiếp từ Tổng Quan */}
      <ReceiptDetailViewModal
        inbound={viewingInbound}
        outbound={viewingOutbound}
        users={users}
        onClose={() => {
          setViewingInbound(null);
          setViewingOutbound(null);
        }}
        onPrint={({ inbound, outbound }) => {
          setViewingInbound(null);
          setViewingOutbound(null);
          setPrintingInbound(inbound || null);
          setPrintingOutbound(outbound || null);
        }}
      />

      {/* Modal Xem Trước & In A4 trực tiếp từ hộp thoại Xem Phiếu */}
      <ReceiptPrintModal
        isOpen={Boolean(printingInbound || printingOutbound)}
        onClose={() => {
          setPrintingInbound(null);
          setPrintingOutbound(null);
        }}
        inbound={printingInbound}
        outbound={printingOutbound}
      />
    </div>
  );
};
