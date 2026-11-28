import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useAuth } from '../../context/AuthContext';
import { StockFilterParams, Warehouse } from '../../types/inventory';
import { StorageService } from '../../services/storage';
import { exportToExcel } from '../../services/excelService';
import { getAuthorizedWarehouses, roundQty } from '../../utils/additiveMerge';
import { PaginationBar } from '../common/PaginationBar';
import { InventoryReportPrintModal } from './InventoryReportPrintModal';
import { InventoryIntegrityModal } from './InventoryIntegrityModal';
import { analyzeInventoryIntegrity } from '../../utils/inventoryIntegrity';
import { 
  BarChart3, 
  Download, 
  FileText,
  Search, 
  Filter, 
  RotateCcw,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';

export const InventoryReport: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // Filter States
  const [warehouseId, setWarehouseId] = useState('all');
  const [packingListNo, setPackingListNo] = useState('');
  const [shipment, setShipment] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [supplier, setSupplier] = useState('');
  const [packageNo, setPackageNo] = useState('');
  const [category, setCategory] = useState('');
  const [drawingNo, setDrawingNo] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Deferred text inputs so typing remains 60fps even with 100,000+ stock records
  const defPackingListNo = useDeferredValue(packingListNo);
  const defShipment = useDeferredValue(shipment);
  const defManufacturer = useDeferredValue(manufacturer);
  const defSupplier = useDeferredValue(supplier);
  const defPackageNo = useDeferredValue(packageNo);
  const defCategory = useDeferredValue(category);
  const defDrawingNo = useDeferredValue(drawingNo);
  const defStorageLocation = useDeferredValue(storageLocation);
  const defSearchQuery = useDeferredValue(searchQuery);

  const [syncTick, setSyncTick] = useState(0);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isIntegrityModalOpen, setIsIntegrityModalOpen] = useState(false);

  useEffect(() => {
    setWarehouses(StorageService.getWarehouses());
    return StorageService.subscribe(() => {
      setWarehouses(StorageService.getWarehouses());
      setSyncTick((t) => t + 1);
    });
  }, []);

  const authorizedWarehouses = useMemo(
    () => getAuthorizedWarehouses(warehouses, currentUser),
    [warehouses, currentUser]
  );

  const allowedWarehouseIds = useMemo(
    () => (isAdmin ? undefined : authorizedWarehouses.map((w) => w.id)),
    [isAdmin, authorizedWarehouses]
  );

  useEffect(() => {
    if (!isAdmin && warehouseId !== 'all' && !authorizedWarehouses.some((w) => w.id === warehouseId)) {
      setWarehouseId('all');
    }
  }, [isAdmin, authorizedWarehouses, warehouseId]);

  const currentFilter = useMemo<StockFilterParams>(
    () => ({
      warehouseId: warehouseId === 'all' ? undefined : warehouseId,
      allowedWarehouseIds,
      packingListNo: defPackingListNo || undefined,
      shipment: defShipment || undefined,
      manufacturer: defManufacturer || undefined,
      supplier: defSupplier || undefined,
      packageNo: defPackageNo || undefined,
      category: defCategory || undefined,
      drawingNo: defDrawingNo || undefined,
      storageLocation: defStorageLocation || undefined,
      searchQuery: defSearchQuery || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined
    }),
    [
      warehouseId,
      allowedWarehouseIds,
      defPackingListNo,
      defShipment,
      defManufacturer,
      defSupplier,
      defPackageNo,
      defCategory,
      defDrawingNo,
      defStorageLocation,
      defSearchQuery,
      startDate,
      endDate
    ]
  );

  const records = useMemo(() => {
    return StorageService.calculateMergedInventoryReport(currentFilter);
  }, [syncTick, currentFilter]);

  const integritySummary = useMemo(() => {
    const whFilter = warehouseId === 'all' ? undefined : warehouseId;
    const perWhRecords = StorageService.calculateInventoryRecords({
      allowedWarehouseIds,
      warehouseId: whFilter
    });
    return analyzeInventoryIntegrity(perWhRecords);
  }, [syncTick, allowedWarehouseIds, warehouseId]);

  const selectedWarehouseName = useMemo(() => {
    if (warehouseId === 'all') return '';
    return authorizedWarehouses.find((w) => w.id === warehouseId)?.name || '';
  }, [warehouseId, authorizedWarehouses]);

  // Lấy danh sách gợi ý đã được cache O(1) từ StorageService (giới hạn 150 mục/loại)
  const {
    availablePLs,
    availableShipments,
    availableMakers,
    availableSuppliers,
    availableCategories,
    availableDrawings,
    availableLocations
  } = useMemo(
    () => StorageService.getInventoryFilterOptions(allowedWarehouseIds),
    [records, allowedWarehouseIds]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [records]);

  const handleResetFilter = () => {
    setWarehouseId('all');
    setPackingListNo('');
    setShipment('');
    setManufacturer('');
    setSupplier('');
    setPackageNo('');
    setCategory('');
    setDrawingNo('');
    setStorageLocation('');
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
  };

  const handleExportExcel = () => {
    const dataToExport = records.map((r, index) => ({
      'STT': index + 1,
      'Packing List': r.packingListNo,
      'Shipment': r.shipment,
      'PACKAGE No.': r.packageNo,
      'Mã Vật Tư': r.materialCode,
      'Vật Tư Thiết Bị': r.materialName,
      'ĐVT': r.unit,
      'Tổng Nhập (SL)': r.inboundQuantity,
      'Tổng Nhập (kg)': r.inboundWeightKg,
      'Tổng SL Nhập Trả Kho': r.returnInboundQuantity,
      'Tổng KL Nhập Trả Kho (kg)': r.returnInboundWeightKg,
      'Tổng Xuất (SL)': r.outboundQuantity,
      'Tổng Xuất (kg)': r.outboundWeightKg,
      'Tổng SL Tái Xuất': r.transferOutboundQuantity,
      'Tổng KL Tái Xuất (kg)': r.transferOutboundWeightKg,
      'Tồn SL': r.currentQuantity,
      'Tồn KL (kg)': r.currentWeightKg,
      'Kho Bãi': r.warehouseName,
      'Vị trí lưu kho/bãi': r.storageLocation || '-',
      'Hạng Mục': r.category,
      'Bản Vẽ Kỹ Thuật': r.drawingNo,
      'Nhà Sản Xuất': r.manufacturer,
      'Nhà Cung Cấp': r.supplier,
      'Ngày Cập Nhật': r.lastUpdated
    }));

    exportToExcel(
      dataToExport, 
      `BaoCao_NhapXuatTon_${new Date().toISOString().slice(0, 10)}`, 
      'NXT_VatTu_ThietBi'
    );
  };

  // Tính tổng 1 lượt duy nhất O(N) cho toàn bộ bản ghi lọc được
  const {
    totalInboundQty,
    totalInboundWeight,
    totalReturnInboundQty,
    totalReturnInboundWeight,
    totalOutboundQty,
    totalOutboundWeight,
    totalTransferOutboundQty,
    totalTransferOutboundWeight,
    totalStockQty,
    totalStockWeight
  } = useMemo(() => {
    let inQty = 0;
    let inW = 0;
    let retInQty = 0;
    let retInW = 0;
    let outQty = 0;
    let outW = 0;
    let transOutQty = 0;
    let transOutW = 0;
    let stkQty = 0;
    let stkW = 0;
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      inQty += r.inboundQuantity;
      inW += r.inboundWeightKg;
      retInQty += r.returnInboundQuantity || 0;
      retInW += r.returnInboundWeightKg || 0;
      outQty += r.outboundQuantity;
      outW += r.outboundWeightKg;
      transOutQty += r.transferOutboundQuantity || 0;
      transOutW += r.transferOutboundWeightKg || 0;
      stkQty += r.currentQuantity;
      stkW += r.currentWeightKg;
    }
    return {
      totalInboundQty: roundQty(inQty),
      totalInboundWeight: Math.round(inW * 100) / 100,
      totalReturnInboundQty: roundQty(retInQty),
      totalReturnInboundWeight: Math.round(retInW * 100) / 100,
      totalOutboundQty: roundQty(outQty),
      totalOutboundWeight: Math.round(outW * 100) / 100,
      totalTransferOutboundQty: roundQty(transOutQty),
      totalTransferOutboundWeight: Math.round(transOutW * 100) / 100,
      totalStockQty: roundQty(stkQty),
      totalStockWeight: Math.round(stkW * 100) / 100
    };
  }, [records]);

  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIdx = (safePage - 1) * pageSize;

  const pagedRecords = useMemo(() => {
    return records.slice(pageStartIdx, pageStartIdx + pageSize);
  }, [records, pageStartIdx, pageSize]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl shrink-0">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">Báo Cáo Nhập - Xuất - Tồn Vật Tư Thiết Bị</h1>
            <p className="text-slate-500 text-xs mt-0.5">
              Tra cứu đa điều kiện: Packing List, Shipment, Bản vẽ, Hạng mục, Package No., NSX, NCC, Khối lượng & Số lượng
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setIsIntegrityModalOpen(true)}
            className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition active:scale-95 min-h-[42px] cursor-pointer ${
              integritySummary.negativeQtyIssues.length > 0
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 shadow-xs'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 shadow-xs'
            }`}
          >
            {integritySummary.negativeQtyIssues.length > 0 ? (
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
            ) : (
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
            )}
            <span>Kiểm Tra Toàn Vẹn</span>
            {integritySummary.negativeQtyIssues.length > 0 ? (
              <span className="px-1.5 py-0.5 rounded-md bg-rose-600 text-white font-mono text-[10px] font-bold">
                {integritySummary.negativeQtyIssues.length} âm
              </span>
            ) : integritySummary.weightAnomalyIssues.length > 0 ? (
              <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-white font-mono text-[10px] font-bold">
                {integritySummary.weightAnomalyIssues.length} KL
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setIsPrintModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-rose-600/20 transition active:scale-95 min-h-[42px] cursor-pointer"
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>Xuất PDF / In A4 (FM09)</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-700/20 transition active:scale-95 min-h-[42px] cursor-pointer"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Xuất Báo Cáo Ra Excel</span>
          </button>
        </div>
      </div>

      {!isAdmin && authorizedWarehouses.length === 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-950 shadow-xs">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-sm text-amber-900">
              {warehouses.length === 0
                ? 'Chưa tải được dữ liệu kho từ Cloud Firestore'
                : 'Tài khoản chưa được phân quyền thao tác kho nào'}
            </div>
            <p className="mt-1 text-amber-800 leading-relaxed">
              {warehouses.length === 0
                ? 'Vui lòng nhấn nút "Đồng Bộ Cloud" trên thanh tiêu đề để tải danh mục kho và số liệu tồn kho mới nhất.'
                : 'Vui lòng liên hệ Admin để cấp quyền các kho bãi bạn được phép xem và thao tác.'}
            </p>
          </div>
        </div>
      )}

      {/* Bộ Lọc Đa Điều Kiện (Multi-criteria Filter Panel) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Bộ Lọc Điều Kiện Chuyên Sâu</span>
          </div>
          <button
            onClick={handleResetFilter}
            className="text-xs font-medium text-slate-500 hover:text-blue-700 flex items-center gap-1 transition py-1 px-2 rounded-lg hover:bg-slate-100"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Đặt lại bộ lọc</span>
          </button>
        </div>

        {/* Search bar */}
        <div className="relative">
          <input
            type="text"
            data-quick-search="primary"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm tổng hợp (mã vật tư, Package No., vị trí lưu kho/bãi, hạng mục, bản vẽ, packing list, shipment...)"
            className="w-full pl-9 pr-16 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[42px] sm:min-h-0"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 sm:top-2.5" />
          {!searchQuery && (
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              Ctrl+K
            </kbd>
          )}
        </div>

        {/* Grid các điều kiện cụ thể */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          {/* Kho bãi */}
          <div className="min-w-0">
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Kho bãi</label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="w-full min-w-0 max-w-full px-2.5 py-2 sm:py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none min-h-[38px] sm:min-h-0 truncate"
            >
              <option value="all">Tất cả kho ({authorizedWarehouses.length})</option>
              {authorizedWarehouses.map(w => (
                <option key={w.id} value={w.id} data-user-content="true">{w.name}</option>
              ))}
            </select>
          </div>

          {/* Packing List */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Số Packing List</label>
            <input
              type="text"
              value={packingListNo}
              onChange={(e) => setPackingListNo(e.target.value)}
              placeholder="VD: PL-2026..."
              list="pl-list"
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono outline-none"
            />
            <datalist id="pl-list">
              {availablePLs.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>

          {/* Shipment */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Shipment / Vận đơn</label>
            <input
              type="text"
              value={shipment}
              onChange={(e) => setShipment(e.target.value)}
              placeholder="VD: SHP-PACIFIC..."
              list="shipment-list"
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono outline-none"
            />
            <datalist id="shipment-list">
              {availableShipments.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>

          {/* Hạng mục */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Hạng mục dự án</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Đường ống, Kết cấu..."
              list="cat-list"
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            />
            <datalist id="cat-list">
              {availableCategories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          {/* Bản vẽ */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Bản vẽ (DWG No)</label>
            <input
              type="text"
              value={drawingNo}
              onChange={(e) => setDrawingNo(e.target.value)}
              placeholder="DWG-PID..."
              list="dwg-list"
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono outline-none"
            />
            <datalist id="dwg-list">
              {availableDrawings.map(d => <option key={d} value={d} />)}
            </datalist>
          </div>

          {/* PACKAGE No. (Số kiện) */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">PACKAGE No. (Số kiện)</label>
            <input
              type="text"
              value={packageNo}
              onChange={(e) => setPackageNo(e.target.value)}
              placeholder="PKG-01..."
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono outline-none"
            />
          </div>

          {/* Nhà sản xuất */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Nhà sản xuất</label>
            <input
              type="text"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder="Siemens, Kitz..."
              list="maker-list"
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            />
            <datalist id="maker-list">
              {availableMakers.map(m => <option key={m} value={m} />)}
            </datalist>
          </div>

          {/* Nhà cung cấp */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Nhà cung cấp</label>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Hòa Phát, Petro..."
              list="sup-list"
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            />
            <datalist id="sup-list">
              {availableSuppliers.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>

          {/* Vị trí lưu kho/bãi */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-semibold text-emerald-700 uppercase mb-1">Vị trí lưu kho/bãi</label>
            <input
              type="text"
              value={storageLocation}
              onChange={(e) => setStorageLocation(e.target.value)}
              placeholder="Bãi A, Kệ B2..."
              list="loc-list"
              className="w-full px-2.5 py-1.5 bg-emerald-50/40 border border-emerald-200 rounded-lg outline-none focus:border-emerald-500"
            />
            <datalist id="loc-list">
              {availableLocations.map(l => <option key={l} value={l} />)}
            </datalist>
          </div>

          {/* Từ ngày */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Từ ngày</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none text-[11px]"
            />
          </div>

          {/* Đến ngày */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Đến ngày</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none text-[11px]"
            />
          </div>
        </div>
      </div>

      {/* KPI Cards Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 block uppercase">Tổng Nhập (SL / kg)</span>
          <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
            <span className="text-base sm:text-lg font-bold text-blue-700 font-mono tabular-nums">
              {totalInboundQty.toLocaleString('vi-VN')}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              ({totalInboundWeight.toLocaleString('vi-VN')} kg)
            </span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">Phiếu nhập kho chuẩn</span>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-indigo-200/80 shadow-sm bg-gradient-to-br from-indigo-50/40 to-white">
          <span className="text-[11px] font-semibold text-indigo-700 block uppercase">Nhập Trả Kho (SL / kg)</span>
          <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
            <span className="text-base sm:text-lg font-bold text-indigo-700 font-mono tabular-nums">
              {totalReturnInboundQty.toLocaleString('vi-VN')}
            </span>
            <span className="text-xs text-indigo-500 font-mono">
              ({totalReturnInboundWeight.toLocaleString('vi-VN')} kg)
            </span>
          </div>
          <span className="text-[10px] text-indigo-500 block mt-0.5">Phiếu tick Nhập trả kho</span>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 block uppercase">Tổng Xuất Kho (SL / kg)</span>
          <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
            <span className="text-base sm:text-lg font-bold text-rose-700 font-mono tabular-nums">
              {totalOutboundQty.toLocaleString('vi-VN')}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              ({totalOutboundWeight.toLocaleString('vi-VN')} kg)
            </span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">Phiếu xuất công trình</span>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-amber-200/80 shadow-sm bg-gradient-to-br from-amber-50/40 to-white">
          <span className="text-[11px] font-semibold text-amber-700 block uppercase">Tái Xuất / Đ.Chuyển (SL / kg)</span>
          <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
            <span className="text-base sm:text-lg font-bold text-amber-700 font-mono tabular-nums">
              {totalTransferOutboundQty.toLocaleString('vi-VN')}
            </span>
            <span className="text-xs text-amber-600 font-mono">
              ({totalTransferOutboundWeight.toLocaleString('vi-VN')} kg)
            </span>
          </div>
          <span className="text-[10px] text-amber-600 block mt-0.5">Phiếu tick Xuất điều chuyển</span>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-emerald-200/80 shadow-sm bg-gradient-to-br from-emerald-50/50 to-white">
          <span className="text-[11px] font-semibold text-emerald-800 block uppercase">TỒN KHO (SL)</span>
          <span className="text-lg sm:text-xl font-extrabold text-emerald-700 font-mono tabular-nums mt-1 block truncate">
            {totalStockQty.toLocaleString('vi-VN')}
          </span>
          <span className="text-[10px] text-emerald-600 block mt-0.5 font-medium">Nhập + Trả - Xuất - Tái xuất</span>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-emerald-200/80 shadow-sm bg-gradient-to-br from-emerald-50/50 to-white">
          <span className="text-[11px] font-semibold text-emerald-800 block uppercase">TỒN KHO (kg)</span>
          <span className="text-lg sm:text-xl font-extrabold text-emerald-700 font-mono tabular-nums mt-1 block truncate">
            {totalStockWeight.toLocaleString('vi-VN')}
          </span>
          <span className="text-[10px] text-emerald-600 block mt-0.5 font-medium">Tổng khối lượng tồn bãi</span>
        </div>
      </div>

      {/* Main Stock Report Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-3.5 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-bold text-slate-900 text-sm">
              Bảng Chi Tiết Nhập - Xuất - Tồn Sau Gộp ({records.length.toLocaleString('vi-VN')} vật tư gộp)
            </div>
            {defDrawingNo.trim() && (
              <span className="px-2.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-semibold font-mono">
                {`Bản vẽ "${defDrawingNo.trim()}": ${records.length.toLocaleString('vi-VN')} vật tư`}
              </span>
            )}
          </div>
          <span className="text-xs text-slate-500">
            Tự động gộp theo Packing List, Shipment, Package No., Mã vật tư &amp; Tên vật tư | Tồn = (Nhập + Nhập trả) - (Xuất + Tái xuất)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[1250px]">
            <thead className="bg-slate-50/90 text-slate-700 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-3 w-10 text-center">STT</th>
                <th className="p-3 w-32">PACKING LIST</th>
                <th className="p-3 w-28">SHIPMENT</th>
                <th className="p-3 w-32 normal-case">PACKAGE No.</th>
                <th className="p-3 w-32">MÃ VẬT TƯ</th>
                <th className="p-3 w-56">VẬT TƯ THIẾT BỊ</th>
                <th className="p-3 w-36">VỊ TRÍ LƯU KHO/BÃI</th>
                <th className="p-3 w-16 text-center">ĐVT</th>
                <th className="p-3 text-right bg-blue-50/50 text-blue-900">TỔNG NHẬP</th>
                <th className="p-3 text-right bg-indigo-50/60 text-indigo-900">NHẬP TRẢ KHO</th>
                <th className="p-3 text-right bg-rose-50/50 text-rose-900">TỔNG XUẤT</th>
                <th className="p-3 text-right bg-amber-50/60 text-amber-900">TÁI XUẤT</th>
                <th className="p-3 text-right bg-emerald-50 text-emerald-950 font-bold">TỒN SL</th>
                <th className="p-3 text-right bg-emerald-50 text-emerald-950 font-bold">TỒN KL (KG)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedRecords.length === 0 ? (
                <tr>
                  <td colSpan={14} className="p-12 text-center text-slate-400 text-sm">
                    Không có bản ghi tồn kho nào khớp với các điều kiện lọc đã chọn.
                  </td>
                </tr>
              ) : (
                pagedRecords.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 text-center text-slate-400">{(pageStartIdx + idx + 1).toLocaleString('vi-VN')}</td>
                    <td className="p-3 font-mono font-bold text-blue-700" data-user-content="true">{r.packingListNo}</td>
                    <td className="p-3 font-mono text-slate-700" data-user-content="true">{r.shipment}</td>
                    <td className="p-3 font-mono font-bold text-slate-900">
                      {r.packageNo && r.packageNo !== 'N/A' ? (
                        <span data-user-content="true">{r.packageNo}</span>
                      ) : (
                        <span className="text-slate-400 font-normal">N/A</span>
                      )}
                    </td>
                    <td className="p-3 font-mono font-semibold text-slate-800">
                      {r.materialCode && r.materialCode !== 'N/A' ? (
                        <span data-user-content="true">{r.materialCode}</span>
                      ) : (
                        <span className="text-slate-400 font-normal">N/A</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-slate-900 block text-xs" data-user-content="true">{r.materialName}</span>
                    </td>
                    <td className="p-3">
                      {r.storageLocation ? (
                        <span
                          className="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-medium"
                          title={r.storageLocation}
                          data-user-content="true"
                        >
                          {r.storageLocation}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="p-3 text-center font-medium text-slate-600" data-user-content="true">{r.unit}</td>
                    
                    {/* Nhập chuẩn */}
                    <td className="p-3 text-right bg-blue-50/30 font-mono">
                      <div className="font-semibold text-blue-700">{r.inboundQuantity.toLocaleString('vi-VN')}</div>
                      <div className="text-[10px] text-slate-500">{r.inboundWeightKg.toLocaleString('vi-VN')} kg</div>
                    </td>

                    {/* Nhập trả kho */}
                    <td className="p-3 text-right bg-indigo-50/30 font-mono">
                      <div className="font-semibold text-indigo-700">{(r.returnInboundQuantity || 0).toLocaleString('vi-VN')}</div>
                      <div className="text-[10px] text-slate-500">{(r.returnInboundWeightKg || 0).toLocaleString('vi-VN')} kg</div>
                    </td>

                    {/* Xuất kho chuẩn */}
                    <td className="p-3 text-right bg-rose-50/30 font-mono">
                      <div className="font-semibold text-rose-700">{r.outboundQuantity.toLocaleString('vi-VN')}</div>
                      <div className="text-[10px] text-slate-500">{r.outboundWeightKg.toLocaleString('vi-VN')} kg</div>
                    </td>

                    {/* Tái xuất / Xuất điều chuyển */}
                    <td className="p-3 text-right bg-amber-50/30 font-mono">
                      <div className="font-semibold text-amber-700">{(r.transferOutboundQuantity || 0).toLocaleString('vi-VN')}</div>
                      <div className="text-[10px] text-slate-500">{(r.transferOutboundWeightKg || 0).toLocaleString('vi-VN')} kg</div>
                    </td>

                    {/* Tồn số lượng = (Nhập + Nhập trả) - (Xuất + Tái xuất) */}
                    <td
                      className={`p-3 text-right font-mono font-bold text-sm ${
                        r.currentQuantity < 0
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-emerald-50/50 text-emerald-800'
                      }`}
                    >
                      {r.currentQuantity.toLocaleString('vi-VN')}
                    </td>

                    {/* Tồn khối lượng */}
                    <td
                      className={`p-3 text-right font-mono font-bold text-sm ${
                        r.currentWeightKg < -0.01
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-emerald-50/50 text-emerald-800'
                      }`}
                    >
                      {r.currentWeightKg.toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-slate-100/90 font-bold border-t-2 border-slate-300">
              <tr>
                <td colSpan={8} className="p-3 text-right uppercase text-slate-700 text-xs">
                  Tổng Cộng Báo Cáo:
                </td>
                <td className="p-3 text-right font-mono text-blue-700">
                  <div>{totalInboundQty.toLocaleString('vi-VN')}</div>
                  <div className="text-[10px]">{totalInboundWeight.toLocaleString('vi-VN')} kg</div>
                </td>
                <td className="p-3 text-right font-mono text-indigo-700">
                  <div>{totalReturnInboundQty.toLocaleString('vi-VN')}</div>
                  <div className="text-[10px]">{totalReturnInboundWeight.toLocaleString('vi-VN')} kg</div>
                </td>
                <td className="p-3 text-right font-mono text-rose-700">
                  <div>{totalOutboundQty.toLocaleString('vi-VN')}</div>
                  <div className="text-[10px]">{totalOutboundWeight.toLocaleString('vi-VN')} kg</div>
                </td>
                <td className="p-3 text-right font-mono text-amber-700">
                  <div>{totalTransferOutboundQty.toLocaleString('vi-VN')}</div>
                  <div className="text-[10px]">{totalTransferOutboundWeight.toLocaleString('vi-VN')} kg</div>
                </td>
                <td className="p-3 text-right font-mono text-emerald-800 text-sm">
                  {totalStockQty.toLocaleString('vi-VN')}
                </td>
                <td className="p-3 text-right font-mono text-emerald-800 text-sm">
                  {totalStockWeight.toLocaleString('vi-VN')} kg
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <PaginationBar
          currentPage={safePage}
          totalItems={records.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[50, 100, 200]}
          itemLabel="bản ghi tồn kho"
        />
      </div>

      <InventoryReportPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        baseFilter={currentFilter}
        defaultDepartmentName={selectedWarehouseName || currentUser?.department || ''}
        defaultReporterName=""
      />

      <InventoryIntegrityModal
        isOpen={isIntegrityModalOpen}
        onClose={() => setIsIntegrityModalOpen(false)}
        allowedWarehouseIds={allowedWarehouseIds}
        selectedWarehouseId={warehouseId}
        currentUser={currentUser}
        isAdmin={isAdmin}
        syncTick={syncTick}
      />
    </div>
  );
};
