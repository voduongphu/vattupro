import React, { useState, useEffect, useRef } from 'react';
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
import { formatVoucherDateVi } from '../../services/excelService';
import { ReceiptDetailViewModal } from '../common/ReceiptDetailViewModal';
import { ReceiptPrintModal } from '../common/ReceiptPrintModal';
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
  Eye
} from 'lucide-react';

interface DashboardOverviewProps {
  onNavigate: (tab: string) => void;
}

const MAX_RECENT_POOL = 24;
const MIN_RECENT_ITEMS = 4;

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ onNavigate }) => {
  const { currentUser, isAdmin } = useAuth();
  const { language, t } = useLanguage();
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
    totalPLCount: 0,
    totalShipmentCount: 0,
    totalWarehouseCount: 0,
    totalMaterialCount: 0,
    noAssignedWarehouses: false,
    hasSystemWarehouses: false,
    recentInbounds: [] as InboundReceipt[],
    recentOutbounds: [] as OutboundReceipt[],
    categoryBreakdown: [] as { name: string; count: number; weight: number }[]
  });

  useEffect(() => {
    const computeStats = () => {
      const allInbounds = StorageService.getInboundReceipts();
      const allOutbounds = StorageService.getOutboundReceipts();
      const allWarehouses = StorageService.getWarehouses();
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

      const records = StorageService.calculateInventoryRecords(
        isAdmin ? undefined : { allowedWarehouseIds }
      );
      const filterOpts = StorageService.getInventoryFilterOptions(allowedWarehouseIds);

      let totalWeight = 0;
      let totalQty = 0;
      const catMap = new Map<string, { count: number; weight: number }>();
      const uniqueMaterialKeys = new Set<string>();

      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        totalWeight += r.currentWeightKg;
        totalQty += r.currentQuantity;
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

      setStats({
        totalStockWeightKg: Math.round(totalWeight * 100) / 100,
        totalStockQty: roundQty(totalQty),
        totalPLCount: filterOpts.totalPLCount,
        totalShipmentCount: filterOpts.totalShipmentCount,
        totalWarehouseCount: authorizedWarehouses.length,
        totalMaterialCount: isAdmin ? materials.length : uniqueMaterialKeys.size,
        noAssignedWarehouses: !isAdmin && authorizedWarehouses.length === 0,
        hasSystemWarehouses: allWarehouses.length > 0,
        recentInbounds: inbounds.slice(0, MAX_RECENT_POOL),
        recentOutbounds: outbounds.slice(0, MAX_RECENT_POOL),
        categoryBreakdown
      });
    };

    computeStats();
    return StorageService.subscribe(computeStats);
  }, [currentUser, isAdmin]);

  // Dynamically match the height of Recent Inbound & Outbound cards to the Category Breakdown column
  useEffect(() => {
    const syncCounts = () => {
      const catCount = stats.categoryBreakdown.length;
      const isDesktopThreeCol = typeof window !== 'undefined' && window.innerWidth >= 1024;
      if (!isDesktopThreeCol) {
        const mobileTarget = Math.max(MIN_RECENT_ITEMS, Math.min(6, catCount || MIN_RECENT_ITEMS));
        setRecentCounts((prev) =>
          prev.inbound === mobileTarget && prev.outbound === mobileTarget
            ? prev
            : { inbound: mobileTarget, outbound: mobileTarget }
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
  }, [stats.categoryBreakdown.length, stats.recentInbounds.length, stats.recentOutbounds.length]);

  const displayedInbounds = stats.recentInbounds.slice(0, recentCounts.inbound);
  const displayedOutbounds = stats.recentOutbounds.slice(0, recentCounts.outbound);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-950 p-4 sm:p-6 md:p-8 text-white shadow-xl">
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-200 border border-blue-400/20 text-[11px] sm:text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>{t('Hệ Thống Quản Lý Nhập Xuất Tồn Vật Tư Dự Án')}</span>
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
                The system is currently managing <strong className="text-white font-semibold tabular-nums">{stats.totalPLCount.toLocaleString('en-US')} Packing Lists</strong> and{' '}
                <strong className="text-white font-semibold tabular-nums">{stats.totalShipmentCount.toLocaleString('en-US')} Shipments</strong> across{' '}
                <strong className="text-white font-semibold tabular-nums">{stats.totalWarehouseCount} warehouses</strong>.
              </>
            ) : (
              <>
                Hệ thống đang quản lý <strong className="text-white font-semibold tabular-nums">{stats.totalPLCount.toLocaleString('vi-VN')} Packing List</strong> và{' '}
                <strong className="text-white font-semibold tabular-nums">{stats.totalShipmentCount.toLocaleString('vi-VN')} Shipment</strong> trên{' '}
                <strong className="text-white font-semibold tabular-nums">{stats.totalWarehouseCount} kho bãi</strong> trọng điểm.
              </>
            )}
          </p>

          <div className="pt-2.5 grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => onNavigate('inbound')}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold shadow-md transition min-h-[42px] whitespace-nowrap"
            >
              <ArrowDownLeft className="w-4 h-4 shrink-0" />
              <span>{t('Nhập Kho Mới / Import Excel')}</span>
            </button>
            <button
              onClick={() => onNavigate('outbound')}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold border border-white/20 transition min-h-[42px] whitespace-nowrap"
            >
              <ArrowUpRight className="w-4 h-4 shrink-0" />
              <span>{t('Lập Phiếu Xuất Kho')}</span>
            </button>
            <button
              onClick={() => onNavigate('report')}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow transition min-h-[42px] whitespace-nowrap"
            >
              <TrendingUp className="w-4 h-4 shrink-0" />
              <span>{t('Xem Báo Cáo NXT Đa Chiều')}</span>
            </button>
            <button
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
                ? t('Vui lòng liên hệ Quản trị viên (Admin) để cấp quyền truy cập cho các kho bãi bạn phụ trách trong mục Quản Lý Người Dùng.')
                : t('Vui lòng nhấn nút "Đồng Bộ Cloud" trên thanh tiêu đề để tải danh mục kho và dữ liệu mới nhất từ Cloud Firestore.')}
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Khối lượng tồn */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              {t('Tổng Khối Lượng Tồn')}
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-slate-900 font-mono tabular-nums">
                {(stats.totalStockWeightKg / 1000).toFixed(2)}
              </span>
              <span className="text-xs font-semibold text-slate-500">{language === 'en' ? 'Tons' : 'Tấn'}</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block tabular-nums">
              ({stats.totalStockWeightKg.toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')} kg)
            </span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-700 rounded-2xl shrink-0">
            <Scale className="w-6 h-6" />
          </div>
        </div>

        {/* Số lượng tồn */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              {t('Tổng Số Lượng Tồn')}
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-emerald-700 font-mono tabular-nums">
                {stats.totalStockQty.toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')}
              </span>
              <span className="text-xs font-semibold text-slate-500">{language === 'en' ? 'Units / Pkgs' : 'Đơn vị / Kiện'}</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block tabular-nums">
              {stats.totalMaterialCount.toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')} {language === 'en' ? 'material items' : 'mã vật tư thiết bị'}
            </span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl shrink-0">
            <Package className="w-6 h-6" />
          </div>
        </div>

        {/* Số Packing List & Shipment */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              {t('Packing List & Shipment')}
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-indigo-700 font-mono tabular-nums">
                {stats.totalPLCount.toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')}
              </span>
              <span className="text-xs text-slate-500 font-medium tabular-nums">
                PL / {stats.totalShipmentCount.toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')} {language === 'en' ? 'Shipments' : 'Lô'}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {language === 'en' ? '100% Traceability' : 'Truy xuất nguồn gốc chuẩn 100%'}
            </span>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-700 rounded-2xl shrink-0">
            <Truck className="w-6 h-6" />
          </div>
        </div>

        {/* Hệ thống kho bãi */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              {language === 'en' ? 'Storage Warehouses' : 'Kho Bãi Lưu Trữ'}
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-amber-700 font-mono tabular-nums">
                {stats.totalWarehouseCount}
              </span>
              <span className="text-xs font-semibold text-slate-500">{language === 'en' ? 'Active yards & stores' : 'Khu bãi & kho'}</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {language === 'en' ? 'Cat Lai, Phu My Ports...' : 'Kho Cát Lái, Cảng Phú Mỹ...'}
            </span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-700 rounded-2xl shrink-0">
            <WarehouseIcon className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Grid: Cơ cấu hạng mục & Lịch sử nhập xuất gần nhất */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Phân bổ hạng mục dự án */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 shrink-0">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{t('Phân Bổ Tồn Kho Theo Hạng Mục')}</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('report')}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold whitespace-nowrap shrink-0"
            >
              {t('Xem chi tiết')}
            </button>
          </div>

          <div ref={categoryListRef} className="space-y-3">
            {stats.categoryBreakdown.map((cat, i) => {
              const pct = stats.totalStockWeightKg > 0 ? (cat.weight / stats.totalStockWeightKg) * 100 : 0;
              return (
                <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
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
                      {cat.weight.toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')} kg
                    </span>
                  </div>
                  <progress
                    value={Math.min(100, Math.max(8, Math.round(pct)))}
                    max={100}
                    className="w-full h-1.5 rounded-full overflow-hidden block [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:bg-blue-600 [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:bg-blue-600"
                  />
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>{language === 'en' ? 'Quantity:' : 'Số lượng:'} {cat.count.toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')}</span>
                    <span>{language === 'en' ? 'Ratio:' : 'Tỷ trọng:'} {pct.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hoạt động Nhập kho gần đây */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 shrink-0">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{t('Phiếu Nhập Kho Gần Đây')}</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('inbound')}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold whitespace-nowrap shrink-0"
            >
              {language === 'en' ? 'All Vouchers' : 'Tất cả phiếu'}
            </button>
          </div>

          <div ref={inboundListRef} className="space-y-2.5">
            {displayedInbounds.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs">
                {language === 'en' ? 'No recent inbound receipts' : 'Chưa có phiếu nhập kho nào gần đây'}
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
                        +{inSums.totalQuantity.toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')} {language === 'en' ? 'Qty' : 'SL'}
                      </span>
                    </div>
                    <div className="mt-1.5 flex justify-between items-center gap-2 text-[11px] text-slate-500 border-t border-slate-200/60 pt-1.5">
                      <span className="truncate min-w-0" data-user-content="true">{inb.warehouseName}</span>
                      <span className="whitespace-nowrap shrink-0">{formatVoucherDateVi(inb.receiptDate)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Hoạt động Xuất kho gần đây */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 shrink-0">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{t('Phiếu Xuất Kho Gần Đây')}</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('outbound')}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold whitespace-nowrap shrink-0"
            >
              {language === 'en' ? 'All Vouchers' : 'Tất cả phiếu'}
            </button>
          </div>

          <div ref={outboundListRef} className="space-y-2.5">
            {displayedOutbounds.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs">
                {language === 'en' ? 'No recent outbound issues' : 'Chưa có phiếu xuất kho nào gần đây'}
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
                        -{outSums.totalQuantity.toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')} {language === 'en' ? 'Qty' : 'SL'}
                      </span>
                    </div>
                    <div className="mt-1.5 flex justify-between items-center gap-2 text-[11px] text-slate-500 border-t border-slate-200/60 pt-1.5">
                      <span className="truncate min-w-0" data-user-content="true">{outb.warehouseName}</span>
                      <span className="whitespace-nowrap shrink-0">{formatVoucherDateVi(outb.issueDate)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

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
