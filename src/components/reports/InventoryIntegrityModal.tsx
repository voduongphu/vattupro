import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileWarning,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wrench
} from 'lucide-react';
import { InventoryStockRecord, User } from '../../types/inventory';
import { StorageService } from '../../services/storage';
import { exportToExcel } from '../../services/excelService';
import { ModalCloseButton, ModalGuard } from '../../context/ModalContext';
import { roundQty } from '../../utils/additiveMerge';
import {
  analyzeInventoryIntegrity,
  buildReconciliationVouchers,
  IntegrityStockIssue,
  StockReconciliationTarget
} from '../../utils/inventoryIntegrity';
import { getCurrentUserIdentifier } from '../../utils/voucherAudit';
import { PaginationBar } from '../common/PaginationBar';

interface InventoryIntegrityModalProps {
  isOpen: boolean;
  onClose: () => void;
  allowedWarehouseIds?: string[];
  selectedWarehouseId?: string;
  currentUser: User | null;
  isAdmin: boolean;
  syncTick: number;
}

type IntegrityTab = 'negative_qty' | 'weight_anomalies' | 'all_stock';

interface ActualDraft {
  qtyStr: string;
  weightStr: string;
}

interface TableRowEntry {
  record: InventoryStockRecord;
  issue?: IntegrityStockIssue;
}

function parseNonNegativeNumber(raw: string): number {
  const normalized = String(raw || '').replace(/,/g, '.').trim();
  if (!normalized) return 0;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return 0;
  return num;
}

function roundWeight(val: number): number {
  const r = Math.round((Number(val) || 0) * 100) / 100;
  return Object.is(r, -0) || r === 0 ? 0 : r;
}

export const InventoryIntegrityModal: React.FC<InventoryIntegrityModalProps> = ({
  isOpen,
  onClose,
  allowedWarehouseIds,
  selectedWarehouseId,
  currentUser,
  isAdmin,
  syncTick
}) => {
  const [activeTab, setActiveTab] = useState<IntegrityTab>('negative_qty');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, ActualDraft>>({});
  const [adjustmentDate, setAdjustmentDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [adjustmentReason, setAdjustmentReason] = useState(
    'Điều chỉnh cân bằng tồn kho theo số dư thực tế (Kiểm kê toàn vẹn)'
  );
  const [showConfirmPanel, setShowConfirmPanel] = useState(false);
  const [showVoucherWarnings, setShowVoucherWarnings] = useState(false);
  const [successResult, setSuccessResult] = useState<{
    inboundCodes: string[];
    outboundCodes: string[];
    balancedCount: number;
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const canReconcile =
    isAdmin ||
    currentUser?.role === 'manager' ||
    currentUser?.role === 'staff';

  // Scoped per-warehouse stock records & raw vouchers
  const { perWarehouseRecords, scopedInbounds, scopedOutbounds, integrityReport } = useMemo(() => {
    if (!isOpen) {
      return {
        perWarehouseRecords: [] as InventoryStockRecord[],
        scopedInbounds: [],
        scopedOutbounds: [],
        integrityReport: analyzeInventoryIntegrity([], [], [])
      };
    }

    const whFilter =
      selectedWarehouseId && selectedWarehouseId !== 'all'
        ? selectedWarehouseId
        : undefined;

    const records = StorageService.calculateInventoryRecords({
      allowedWarehouseIds,
      warehouseId: whFilter
    });

    const allowedSet = allowedWarehouseIds ? new Set(allowedWarehouseIds) : null;
    const filterByScope = (whId?: string) => {
      if (whFilter && whId !== whFilter) return false;
      if (allowedSet && (!whId || !allowedSet.has(whId))) return false;
      return true;
    };

    const inbounds = StorageService.getInboundReceipts().filter((r) =>
      filterByScope(r.warehouseId)
    );
    const outbounds = StorageService.getOutboundReceipts().filter((r) =>
      filterByScope(r.warehouseId)
    );

    const report = analyzeInventoryIntegrity(records, inbounds, outbounds);
    return {
      perWarehouseRecords: records,
      scopedInbounds: inbounds,
      scopedOutbounds: outbounds,
      integrityReport: report
    };
  }, [isOpen, allowedWarehouseIds, selectedWarehouseId, syncTick]);

  const recordMap = useMemo(() => {
    const map = new Map<string, InventoryStockRecord>();
    for (let i = 0; i < perWarehouseRecords.length; i++) {
      map.set(perWarehouseRecords[i].id, perWarehouseRecords[i]);
    }
    return map;
  }, [perWarehouseRecords]);

  const issueMap = useMemo(() => {
    const map = new Map<string, IntegrityStockIssue>();
    for (let i = 0; i < integrityReport.allStockIssues.length; i++) {
      const iss = integrityReport.allStockIssues[i];
      map.set(iss.record.id, iss);
    }
    return map;
  }, [integrityReport]);

  // Initialize drafts & default selection when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery('');
    setShowConfirmPanel(false);
    setSuccessResult(null);
    setCurrentPage(1);
    setAdjustmentDate(new Date().toISOString().slice(0, 10));

    if (
      integrityReport.negativeQtyIssues.length === 0 &&
      integrityReport.weightAnomalyIssues.length > 0
    ) {
      setActiveTab('weight_anomalies');
    } else {
      setActiveTab('negative_qty');
    }

    const initialSelected = new Set<string>();
    const initialDrafts: Record<string, ActualDraft> = {};

    for (let i = 0; i < integrityReport.negativeQtyIssues.length; i++) {
      const iss = integrityReport.negativeQtyIssues[i];
      initialSelected.add(iss.record.id);
      initialDrafts[iss.record.id] = {
        qtyStr: String(iss.suggestedActualQty),
        weightStr: String(iss.suggestedActualWeightKg)
      };
    }
    for (let i = 0; i < integrityReport.weightAnomalyIssues.length; i++) {
      const iss = integrityReport.weightAnomalyIssues[i];
      initialDrafts[iss.record.id] = {
        qtyStr: String(iss.suggestedActualQty),
        weightStr: String(iss.suggestedActualWeightKg)
      };
    }

    setSelectedIds(initialSelected);
    setDrafts(initialDrafts);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper to get effective draft values for any stock record
  const getDraftForRecord = (rec: InventoryStockRecord): ActualDraft => {
    const existing = drafts[rec.id];
    if (existing) return existing;
    const iss = issueMap.get(rec.id);
    if (iss) {
      return {
        qtyStr: String(iss.suggestedActualQty),
        weightStr: String(iss.suggestedActualWeightKg)
      };
    }
    return {
      qtyStr: String(Math.max(0, roundQty(rec.currentQuantity))),
      weightStr: String(Math.max(0, roundWeight(rec.currentWeightKg)))
    };
  };

  // Build rows for active tab + search
  const filteredRows = useMemo<TableRowEntry[]>(() => {
    let source: TableRowEntry[];
    if (activeTab === 'negative_qty') {
      source = integrityReport.negativeQtyIssues.map((issue) => ({
        record: issue.record,
        issue
      }));
    } else if (activeTab === 'weight_anomalies') {
      source = integrityReport.weightAnomalyIssues.map((issue) => ({
        record: issue.record,
        issue
      }));
    } else {
      source = perWarehouseRecords.map((record) => ({
        record,
        issue: issueMap.get(record.id)
      }));
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return source;
    return source.filter(({ record }) => {
      return (
        (record.materialCode || '').toLowerCase().includes(q) ||
        (record.materialName || '').toLowerCase().includes(q) ||
        (record.warehouseName || '').toLowerCase().includes(q) ||
        (record.packingListNo || '').toLowerCase().includes(q) ||
        (record.packageNo || '').toLowerCase().includes(q) ||
        (record.shipment || '').toLowerCase().includes(q) ||
        (record.drawingNo || '').toLowerCase().includes(q)
      );
    });
  }, [activeTab, integrityReport, perWarehouseRecords, issueMap, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIdx = (safePage - 1) * pageSize;
  const pagedRows = useMemo(
    () => filteredRows.slice(pageStartIdx, pageStartIdx + pageSize),
    [filteredRows, pageStartIdx, pageSize]
  );

  // Build preview of reconciliation vouchers for all currently selected records
  const reconciliationPreview = useMemo(() => {
    const targets: StockReconciliationTarget[] = [];
    selectedIds.forEach((id) => {
      const rec = recordMap.get(id);
      if (!rec) return;
      const d = drafts[id];
      const iss = issueMap.get(id);
      const actualQuantity = d
        ? parseNonNegativeNumber(d.qtyStr)
        : iss
          ? iss.suggestedActualQty
          : Math.max(0, roundQty(rec.currentQuantity));
      const actualWeightKg = d
        ? parseNonNegativeNumber(d.weightStr)
        : iss
          ? iss.suggestedActualWeightKg
          : Math.max(0, roundWeight(rec.currentWeightKg));

      const dQty = roundQty(actualQuantity - roundQty(rec.currentQuantity));
      const dW = roundWeight(actualWeightKg - roundWeight(rec.currentWeightKg));
      if (dQty !== 0 || dW !== 0) {
        targets.push({
          record: rec,
          actualQuantity,
          actualWeightKg
        });
      }
    });

    const allInbounds = StorageService.getInboundReceipts();
    const allOutbounds = StorageService.getOutboundReceipts();

    return buildReconciliationVouchers({
      targets,
      existingInboundCodes: allInbounds.map((r) => r.receiptCode),
      existingOutboundCodes: allOutbounds.map((r) => r.issueCode),
      reason: adjustmentReason,
      actorUserCode: getCurrentUserIdentifier(currentUser) || 'system',
      actorFullName: currentUser?.fullName || currentUser?.username || 'Hệ thống',
      adjustmentDate
    });
  }, [selectedIds, recordMap, drafts, issueMap, adjustmentReason, currentUser, adjustmentDate]);

  const handleToggleSelect = (id: string) => {
    setShowConfirmPanel(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const allVisibleSelected =
    pagedRows.length > 0 && pagedRows.every((r) => selectedIds.has(r.record.id));

  const handleToggleSelectVisible = () => {
    setShowConfirmPanel(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        pagedRows.forEach((r) => next.delete(r.record.id));
      } else {
        pagedRows.forEach((r) => next.add(r.record.id));
      }
      return next;
    });
  };

  const handleDraftChange = (
    rec: InventoryStockRecord,
    field: 'qtyStr' | 'weightStr',
    value: string
  ) => {
    setShowConfirmPanel(false);
    const currentDraft = getDraftForRecord(rec);
    const nextDraft: ActualDraft = {
      ...currentDraft,
      [field]: value
    };
    setDrafts((prev) => ({
      ...prev,
      [rec.id]: nextDraft
    }));

    const nextQty = parseNonNegativeNumber(nextDraft.qtyStr);
    const nextWeight = parseNonNegativeNumber(nextDraft.weightStr);
    const hasDelta =
      roundQty(nextQty - roundQty(rec.currentQuantity)) !== 0 ||
      roundWeight(nextWeight - roundWeight(rec.currentWeightKg)) !== 0;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (hasDelta) {
        next.add(rec.id);
      } else {
        next.delete(rec.id);
      }
      return next;
    });
  };

  const handleSetAllNegativeToZero = () => {
    setShowConfirmPanel(false);
    setActiveTab('negative_qty');
    const nextDrafts = { ...drafts };
    const nextSelected = new Set(selectedIds);
    for (let i = 0; i < integrityReport.negativeQtyIssues.length; i++) {
      const iss = integrityReport.negativeQtyIssues[i];
      nextDrafts[iss.record.id] = {
        qtyStr: '0',
        weightStr: String(iss.suggestedActualWeightKg)
      };
      nextSelected.add(iss.record.id);
    }
    setDrafts(nextDrafts);
    setSelectedIds(nextSelected);
  };

  const handleClearSelection = () => {
    setShowConfirmPanel(false);
    setSelectedIds(new Set());
  };

  const handleExecuteReconciliation = () => {
    if (!canReconcile || reconciliationPreview.summary.validItemsCount === 0) return;

    const { inboundReceipts, outboundReceipts, summary } = reconciliationPreview;
    if (inboundReceipts.length > 0) {
      StorageService.addInboundReceipts(inboundReceipts);
    }
    if (outboundReceipts.length > 0) {
      StorageService.addOutboundReceipts(outboundReceipts);
    }

    setSuccessResult({
      inboundCodes: inboundReceipts.map((r) => r.receiptCode),
      outboundCodes: outboundReceipts.map((r) => r.issueCode),
      balancedCount: summary.validItemsCount
    });
    setShowConfirmPanel(false);
    setSelectedIds(new Set());
    setDrafts({});
  };

  const handleExportAuditExcel = () => {
    const rowsToExport =
      filteredRows.length > 0
        ? filteredRows
        : integrityReport.allStockIssues.map((issue) => ({
            record: issue.record,
            issue
          }));

    const exportData = rowsToExport.map(({ record, issue }, idx) => {
      const d = getDraftForRecord(record);
      const targetQty = parseNonNegativeNumber(d.qtyStr);
      const targetWeight = parseNonNegativeNumber(d.weightStr);
      const deltaQty = roundQty(targetQty - roundQty(record.currentQuantity));
      const deltaWeight = roundWeight(targetWeight - roundWeight(record.currentWeightKg));

      return {
        STT: idx + 1,
        'Kho Bãi': record.warehouseName,
        'Trạng Thái Toàn Vẹn': issue
          ? issue.severity === 'critical'
            ? 'Tồn SL âm (Nghiêm trọng)'
            : 'Cảnh báo khối lượng'
          : 'Bình thường',
        'Chi Tiết Bất Thường': issue?.reason || 'Đạt chuẩn',
        'Packing List': record.packingListNo,
        Shipment: record.shipment,
        'PACKAGE No.': record.packageNo,
        'Mã Vật Tư': record.materialCode,
        'Tên Vật Tư Thiết Bị': record.materialName,
        ĐVT: record.unit,
        'Tổng Nhập (SL)': roundQty(
          record.inboundQuantity + (record.returnInboundQuantity || 0)
        ),
        'Tổng Xuất (SL)': roundQty(
          record.outboundQuantity + (record.transferOutboundQuantity || 0)
        ),
        'Tồn Hệ Thống (SL)': roundQty(record.currentQuantity),
        'Tồn Hệ Thống (kg)': roundWeight(record.currentWeightKg),
        'Số Dư Thực Tế (SL)': targetQty,
        'Số Dư Thực Tế (kg)': targetWeight,
        'Chênh Lệch Cân Bằng (SL)': deltaQty,
        'Chênh Lệch Cân Bằng (kg)': deltaWeight
      };
    });

    exportToExcel(
      exportData,
      `KiemTra_ToanVen_TonKho_${new Date().toISOString().slice(0, 10)}`,
      'ToanVen_TonKho'
    );
  };

  if (!isOpen) return null;

  const validAdjustmentCount = reconciliationPreview.summary.validItemsCount;
  const totalVouchersToCreate =
    reconciliationPreview.inboundReceipts.length +
    reconciliationPreview.outboundReceipts.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inventory-integrity-modal-title"
      className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overscroll-contain animate-in fade-in duration-150"
    >
      <ModalGuard
        title="Kiểm Tra Toàn Vẹn & Cân Bằng Tồn Kho"
        onClose={onClose}
        priority={60}
        isOpen={isOpen}
      />

      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-7xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 bg-slate-50/90 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                integrityReport.negativeQtyIssues.length > 0
                  ? 'bg-rose-50 text-rose-600 border-rose-200'
                  : integrityReport.weightAnomalyIssues.length > 0 ||
                      integrityReport.voucherWarnings.length > 0
                    ? 'bg-amber-50 text-amber-600 border-amber-200'
                    : 'bg-emerald-50 text-emerald-600 border-emerald-200'
              }`}
            >
              {integrityReport.negativeQtyIssues.length > 0 ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h2
                id="inventory-integrity-modal-title"
                className="text-sm sm:text-base font-bold text-slate-900 truncate"
              >
                Kiểm Tra Tính Toàn Vẹn &amp; Cân Bằng Tồn Kho
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                Quét toàn bộ bản ghi tồn theo từng kho, phát hiện số lượng âm và lập phiếu điều chỉnh theo số dư thực tế
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportAuditExcel}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Xuất Excel</span>
            </button>
            <ModalCloseButton onClick={onClose} />
          </div>
        </div>

        {/* Summary KPI Strip + Controls (non-scrolling top panel) */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200 bg-white space-y-3 shrink-0">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Bản ghi đã kiểm tra
              </span>
              <div className="mt-0.5 text-lg font-extrabold text-slate-900 font-mono tabular-nums">
                {integrityReport.totalRecordsChecked.toLocaleString('vi-VN')}
              </div>
              <span className="text-[10px] text-slate-500">
                {scopedInbounds.length} phiếu nhập · {scopedOutbounds.length} phiếu xuất
              </span>
            </div>

            <div
              className={`rounded-xl border px-3 py-2.5 ${
                integrityReport.negativeQtyIssues.length > 0
                  ? 'border-rose-200 bg-rose-50/80'
                  : 'border-emerald-200 bg-emerald-50/60'
              }`}
            >
              <span
                className={`text-[10px] font-bold uppercase tracking-wider block ${
                  integrityReport.negativeQtyIssues.length > 0
                    ? 'text-rose-700'
                    : 'text-emerald-700'
                }`}
              >
                Mặt hàng tồn SL âm
              </span>
              <div
                className={`mt-0.5 text-lg font-extrabold font-mono tabular-nums ${
                  integrityReport.negativeQtyIssues.length > 0
                    ? 'text-rose-700'
                    : 'text-emerald-700'
                }`}
              >
                {integrityReport.negativeQtyIssues.length.toLocaleString('vi-VN')}
              </div>
              <span
                className={`text-[10px] ${
                  integrityReport.negativeQtyIssues.length > 0
                    ? 'text-rose-600 font-medium'
                    : 'text-emerald-600'
                }`}
              >
                {integrityReport.negativeQtyIssues.length > 0
                  ? `Tổng thiếu hụt: -${integrityReport.totalNegativeQtyDeficit.toLocaleString('vi-VN')} SL`
                  : 'Không có mặt hàng âm số lượng'}
              </span>
            </div>

            <div
              className={`rounded-xl border px-3 py-2.5 ${
                integrityReport.weightAnomalyIssues.length > 0 ||
                integrityReport.voucherWarnings.length > 0
                  ? 'border-amber-200 bg-amber-50/80'
                  : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
                Lệch khối lượng / Chứng từ
              </span>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="text-lg font-extrabold text-amber-700 font-mono tabular-nums">
                  {integrityReport.weightAnomalyIssues.length.toLocaleString('vi-VN')}
                </span>
                {integrityReport.voucherWarnings.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowVoucherWarnings((v) => !v)}
                    className="text-[10px] font-semibold text-amber-800 underline hover:text-amber-950 cursor-pointer"
                  >
                    +{integrityReport.voucherWarnings.length} lỗi dòng phiếu
                  </button>
                )}
              </div>
              <span className="text-[10px] text-slate-500">
                KL âm hoặc SL = 0 nhưng còn dư KL
              </span>
            </div>

            <div
              className={`rounded-xl border px-3 py-2.5 ${
                integrityReport.isHealthy
                  ? 'border-emerald-200 bg-emerald-50/70'
                  : 'border-indigo-200 bg-indigo-50/60'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
                Trạng thái toàn vẹn
              </span>
              <div className="mt-1 flex items-center gap-1.5">
                {integrityReport.isHealthy ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span className="text-sm font-bold text-emerald-800">
                      Đạt chuẩn 100%
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                    <span className="text-sm font-bold text-rose-800">
                      Cần điều chỉnh cân bằng
                    </span>
                  </>
                )}
              </div>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Lập phiếu PN-DC / PX-DC giữ nguyên chứng từ gốc
              </span>
            </div>
          </div>

          {/* Success notification after balancing */}
          {successResult && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 flex items-start justify-between gap-3 text-xs text-emerald-950">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">
                    Đã cân bằng thành công {successResult.balancedCount} dòng tồn kho theo số dư thực tế!
                  </span>
                  <div className="mt-0.5 text-emerald-800 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px]">
                    {successResult.inboundCodes.length > 0 && (
                      <span>
                        Phiếu nhập điều chỉnh: <strong>{successResult.inboundCodes.join(', ')}</strong>
                      </span>
                    )}
                    {successResult.outboundCodes.length > 0 && (
                      <span>
                        Phiếu xuất điều chỉnh: <strong>{successResult.outboundCodes.join(', ')}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSuccessResult(null)}
                className="text-emerald-700 hover:text-emerald-900 font-semibold text-[11px] shrink-0 cursor-pointer"
              >
                Ẩn
              </button>
            </div>
          )}

          {/* Read-only notice for viewer role */}
          {!canReconcile && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 flex items-center gap-2 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Tài khoản quyền <strong>Chỉ xem (Viewer)</strong> chỉ có thể tra cứu và xuất Excel kiểm tra. Liên hệ Nhân viên kho / Quản lý / Admin để lập phiếu điều chỉnh cân bằng.
              </span>
            </div>
          )}

          {/* Raw voucher anomalies collapsible alert */}
          {showVoucherWarnings && integrityReport.voucherWarnings.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-3 text-xs text-amber-950 space-y-1.5 max-h-32 overflow-y-auto">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <FileWarning className="w-4 h-4 text-amber-600" />
                <span>
                  Phát hiện {integrityReport.voucherWarnings.length} dòng phiếu gốc chứa số lượng/khối lượng âm:
                </span>
              </div>
              <ul className="space-y-1 pl-5 list-disc text-[11px]">
                {integrityReport.voucherWarnings.slice(0, 20).map((w, idx) => (
                  <li key={`${w.voucherCode}-${idx}`}>
                    <span className="font-mono font-bold">{w.voucherCode}</span> ({w.warehouseName} · {w.voucherDate}): {w.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tabs + Search + Quick Action Row */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('negative_qty')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'negative_qty'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>Tồn SL Âm</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                    activeTab === 'negative_qty'
                      ? 'bg-white/20 text-white'
                      : integrityReport.negativeQtyIssues.length > 0
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {integrityReport.negativeQtyIssues.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('weight_anomalies')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'weight_anomalies'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>Lệch Khối Lượng</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                    activeTab === 'weight_anomalies'
                      ? 'bg-white/20 text-white'
                      : integrityReport.weightAnomalyIssues.length > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {integrityReport.weightAnomalyIssues.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('all_stock')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'all_stock'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>Kiểm Kê Toàn Bộ</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                    activeTab === 'all_stock'
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {perWarehouseRecords.length}
                </span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:w-64 min-w-[180px]">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm mã VT, tên vật tư, PL, kiện, kho..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              </div>

              {canReconcile && integrityReport.negativeQtyIssues.length > 0 && (
                <button
                  type="button"
                  onClick={handleSetAllNegativeToZero}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Đặt tất cả dòng âm về 0</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Table Container (zero padding so sticky thead pins flush) */}
        <div className="flex-1 min-h-0 overflow-auto bg-white">
          <table className="w-full text-left text-xs min-w-[1160px] border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px] shadow-2xs">
              <tr>
                <th className="p-2.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    disabled={!canReconcile || pagedRows.length === 0}
                    onChange={handleToggleSelectVisible}
                    aria-label="Chọn tất cả dòng đang hiển thị"
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                  />
                </th>
                <th className="p-2.5 w-36">Kho Bãi</th>
                <th className="p-2.5 w-36">Mã Vật Tư</th>
                <th className="p-2.5 w-56">Vật Tư Thiết Bị</th>
                <th className="p-2.5 w-32">PL / Số Kiện</th>
                <th className="p-2.5 w-14 text-center">ĐVT</th>
                <th className="p-2.5 w-24 text-right">Nhập / Xuất</th>
                <th className="p-2.5 w-28 text-right bg-slate-200/70">Tồn Hệ Thống</th>
                <th className="p-2.5 w-28 text-right bg-blue-50/80 text-blue-900">
                  SL Thực Tế
                </th>
                <th className="p-2.5 w-28 text-right bg-blue-50/80 text-blue-900">
                  KL Thực Tế (kg)
                </th>
                <th className="p-2.5 w-32 text-right bg-emerald-50/80 text-emerald-900">
                  Chênh Lệch Cân Bằng
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-14 px-6 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div className="font-bold text-slate-900 text-sm">
                        {activeTab === 'negative_qty'
                          ? 'Không có mặt hàng nào bị âm số lượng!'
                          : activeTab === 'weight_anomalies'
                            ? 'Không phát hiện cảnh báo lệch khối lượng.'
                            : 'Không tìm thấy bản ghi tồn kho phù hợp.'}
                      </div>
                      <p className="text-xs text-slate-500">
                        {activeTab === 'negative_qty'
                          ? 'Dữ liệu số lượng tồn kho đang đồng nhất. Bạn có thể chuyển sang tab "Kiểm Kê Toàn Bộ" để đối chiếu và điều chỉnh theo số dư kiểm kê thực tế bất kỳ mặt hàng nào.'
                          : 'Thử xóa từ khóa tìm kiếm hoặc chuyển sang tab khác.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedRows.map(({ record, issue }) => {
                  const isSelected = selectedIds.has(record.id);
                  const draft = getDraftForRecord(record);
                  const targetQty = parseNonNegativeNumber(draft.qtyStr);
                  const targetWeight = parseNonNegativeNumber(draft.weightStr);

                  const sysQty = roundQty(record.currentQuantity);
                  const sysWeight = roundWeight(record.currentWeightKg);
                  const deltaQty = roundQty(targetQty - sysQty);
                  const deltaWeight = roundWeight(targetWeight - sysWeight);
                  const hasDelta = deltaQty !== 0 || deltaWeight !== 0;

                  const totalIn = roundQty(
                    record.inboundQuantity + (record.returnInboundQuantity || 0)
                  );
                  const totalOut = roundQty(
                    record.outboundQuantity + (record.transferOutboundQuantity || 0)
                  );

                  return (
                    <tr
                      key={record.id}
                      className={`transition ${
                        isSelected
                          ? 'bg-blue-50/40'
                          : sysQty < 0
                            ? 'bg-rose-50/25 hover:bg-rose-50/50'
                            : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!canReconcile}
                          onChange={() => handleToggleSelect(record.id)}
                          aria-label={`Chọn ${record.materialName}`}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                        />
                      </td>

                      <td className="p-2.5">
                        <div
                          className="font-semibold text-slate-800 truncate max-w-[136px]"
                          title={record.warehouseName}
                          data-user-content="true"
                        >
                          {record.warehouseName}
                        </div>
                        {issue && (
                          <span
                            className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              issue.severity === 'critical'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {issue.issueType === 'negative_qty'
                              ? 'Âm SL'
                              : issue.issueType === 'negative_weight'
                                ? 'Âm KL'
                                : 'Dư KL'}
                          </span>
                        )}
                      </td>

                      <td
                        className="p-2.5 font-mono font-semibold text-slate-800"
                        data-user-content="true"
                      >
                        {record.materialCode || 'N/A'}
                      </td>

                      <td className="p-2.5">
                        <div
                          className="font-semibold text-slate-900 line-clamp-2"
                          title={record.materialName}
                          data-user-content="true"
                        >
                          {record.materialName}
                        </div>
                        {issue && (
                          <div className="text-[10px] text-rose-600 mt-0.5">
                            {issue.reason}
                          </div>
                        )}
                      </td>

                      <td className="p-2.5 font-mono text-[11px] text-slate-600">
                        <div className="truncate max-w-[120px]" title={record.packingListNo}>
                          PL: <span className="text-blue-700 font-semibold">{record.packingListNo}</span>
                        </div>
                        <div className="truncate max-w-[120px] text-[10px] text-slate-500">
                          Kiện: {record.packageNo}
                        </div>
                      </td>

                      <td className="p-2.5 text-center font-medium text-slate-600">
                        {record.unit}
                      </td>

                      <td className="p-2.5 text-right font-mono text-[11px]">
                        <div className="text-blue-700">+{totalIn.toLocaleString('vi-VN')}</div>
                        <div className="text-rose-600">-{totalOut.toLocaleString('vi-VN')}</div>
                      </td>

                      <td className="p-2.5 text-right bg-slate-50/80 font-mono">
                        <div
                          className={`font-bold text-xs ${
                            sysQty < 0 ? 'text-rose-700' : 'text-slate-900'
                          }`}
                        >
                          {sysQty.toLocaleString('vi-VN')}
                        </div>
                        <div
                          className={`text-[10px] ${
                            sysWeight < 0 ? 'text-rose-600 font-semibold' : 'text-slate-500'
                          }`}
                        >
                          {sysWeight.toLocaleString('vi-VN')} kg
                        </div>
                      </td>

                      <td className="p-2 text-right bg-blue-50/30">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          disabled={!canReconcile}
                          value={draft.qtyStr}
                          onChange={(e) =>
                            handleDraftChange(record, 'qtyStr', e.target.value)
                          }
                          aria-label={`Số lượng thực tế của ${record.materialName}`}
                          className="w-24 px-2 py-1.5 text-right font-mono font-bold text-xs bg-white border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </td>

                      <td className="p-2 text-right bg-blue-50/30">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          disabled={!canReconcile}
                          value={draft.weightStr}
                          onChange={(e) =>
                            handleDraftChange(record, 'weightStr', e.target.value)
                          }
                          aria-label={`Khối lượng thực tế của ${record.materialName}`}
                          className="w-24 px-2 py-1.5 text-right font-mono text-xs bg-white border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </td>

                      <td className="p-2.5 text-right bg-emerald-50/20 font-mono">
                        {!hasDelta ? (
                          <span className="text-[11px] text-slate-400">Không đổi</span>
                        ) : (
                          <div className="space-y-0.5">
                            {deltaQty !== 0 && (
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded font-bold text-[11px] ${
                                  deltaQty > 0
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {deltaQty > 0 ? `+${deltaQty.toLocaleString('vi-VN')}` : deltaQty.toLocaleString('vi-VN')}{' '}
                                {record.unit}
                              </span>
                            )}
                            {deltaWeight !== 0 && (
                              <div
                                className={`text-[10px] font-semibold ${
                                  deltaWeight > 0 ? 'text-emerald-700' : 'text-amber-700'
                                }`}
                              >
                                {deltaWeight > 0
                                  ? `+${deltaWeight.toLocaleString('vi-VN')}`
                                  : deltaWeight.toLocaleString('vi-VN')}{' '}
                                kg
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination if needed */}
        {filteredRows.length > pageSize && (
          <div className="border-t border-slate-200 bg-white shrink-0">
            <PaginationBar
              currentPage={safePage}
              totalItems={filteredRows.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[50, 100, 200]}
              itemLabel="mặt hàng"
            />
          </div>
        )}

        {/* Inline Confirmation Drawer before creating adjustment vouchers */}
        {showConfirmPanel && canReconcile && validAdjustmentCount > 0 && (
          <div className="px-4 sm:px-6 py-3.5 border-t-2 border-indigo-200 bg-indigo-50/90 shrink-0 space-y-2.5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 text-xs text-indigo-950">
                <Scale className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-sm text-indigo-950">
                    Xác nhận lập {totalVouchersToCreate} phiếu điều chỉnh cân bằng tồn kho
                  </div>
                  <p className="mt-0.5 text-indigo-900">
                    Hệ thống sẽ tự động tạo chứng từ điều chỉnh cho{' '}
                    <strong>{validAdjustmentCount} dòng vật tư</strong> thuộc{' '}
                    <strong>{reconciliationPreview.summary.warehouseCount} kho</strong> (không sửa đổi phiếu lịch sử đã ký):
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2 font-mono text-[11px]">
                    {reconciliationPreview.inboundReceipts.map((r) => (
                      <span
                        key={r.receiptCode}
                        className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-200 font-semibold"
                      >
                        + {r.receiptCode} ({r.warehouseName}: +{r.totalQuantity.toLocaleString('vi-VN')} SL)
                      </span>
                    ))}
                    {reconciliationPreview.outboundReceipts.map((r) => (
                      <span
                        key={r.issueCode}
                        className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200 font-semibold"
                      >
                        - {r.issueCode} ({r.warehouseName}: -{r.totalQuantity.toLocaleString('vi-VN')} SL)
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowConfirmPanel(false)}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleExecuteReconciliation}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/25 transition cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Xác Nhận Lập Phiếu Cân Bằng</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer Action Bar */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <label
                htmlFor="integrity-adj-date"
                className="text-[11px] font-semibold text-slate-600 whitespace-nowrap"
              >
                Ngày điều chỉnh:
              </label>
              <input
                id="integrity-adj-date"
                type="date"
                disabled={!canReconcile}
                value={adjustmentDate}
                onChange={(e) => setAdjustmentDate(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
              />
            </div>

            <input
              type="text"
              disabled={!canReconcile}
              value={adjustmentReason}
              onChange={(e) => setAdjustmentReason(e.target.value)}
              placeholder="Lý do điều chỉnh cân bằng tồn kho..."
              className="flex-1 min-w-[200px] px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-xl transition cursor-pointer"
              >
                Bỏ chọn ({selectedIds.size})
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold transition cursor-pointer"
            >
              Đóng
            </button>

            <button
              type="button"
              disabled={!canReconcile || validAdjustmentCount === 0}
              onClick={() => setShowConfirmPanel(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 text-white text-xs font-bold shadow-md shadow-blue-600/20 disabled:shadow-none transition cursor-pointer disabled:cursor-not-allowed"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>
                Cân Bằng Đã Chọn ({validAdjustmentCount})
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
