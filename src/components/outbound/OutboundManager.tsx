import React, { useState, useEffect, useMemo, useDeferredValue, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  OutboundReceipt,
  OutboundItemDetail,
  Warehouse,
  InventoryStockRecord,
  MaterialItem
} from '../../types/inventory';
import { StorageService } from '../../services/storage';
import { SyncService } from '../../services/syncService';
import { ExcelImportModal } from '../common/ExcelImportModal';
import { ReceiptPrintModal } from '../common/ReceiptPrintModal';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { PaginationBar } from '../common/PaginationBar';
import { ModalGuard, ModalCloseButton } from '../../context/ModalContext';
import {
  downloadOutboundTemplate,
  exportOutboundReceiptToExcel,
  exportOutboundReceiptsToExcel,
  formatExcelDate,
  formatVoucherDateVi
} from '../../services/excelService';
import {
  normKey,
  normUserKey,
  roundQty,
  sumOutboundItems,
  buildDeterministicItemId,
  generateNextOutboundVoucherCode,
  resolveEditedOutboundVoucherCode,
  voucherCodeHasDatePrecision,
  deriveWarehouseAbbrev,
  collectUsedMaterialCodeKeys,
  generateUniqueMaterialCode,
  getAuthorizedWarehouses,
  isWarehouseAuthorized
} from '../../utils/additiveMerge';
import {
  ArrowUpRight,
  Plus,
  FileSpreadsheet,
  Download,
  Search,
  Calendar,
  Eye,
  Printer,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Package,
  Check,
  ShieldAlert
} from 'lucide-react';

export type ReceiptSortField = 'date' | 'code';
export type SortOrder = 'asc' | 'desc';

const FORM_ITEM_PAGE_SIZE = 100;

function buildPackingListSummary(items: OutboundItemDetail[]): string {
  const seen = new Set<string>();
  const sample: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const code = items[i].batchCode || items[i].packageNo || items[i].packingListNo;
    if (code && code !== 'N/A' && !seen.has(code)) {
      seen.add(code);
      if (sample.length < 4) sample.push(code);
    }
  }
  if (seen.size === 0) return 'N/A';
  if (seen.size <= sample.length) return sample.join(', ');
  return `${sample.join(', ')} (+${(seen.size - sample.length).toLocaleString('vi-VN')} lô)`;
}

function getStockItemMatchKey(item: {
  packingListNo?: string;
  shipment?: string;
  materialCode?: string;
  materialName?: string;
  packageNo?: string;
  batchCode?: string;
  drawingNo?: string;
  category?: string;
}): string {
  const norm = (v?: string) => {
    const trimmed = (v || '').trim();
    return !trimmed || trimmed.toUpperCase() === 'N/A' ? 'N/A' : trimmed.toUpperCase();
  };
  const pl = norm(item.packingListNo);
  const shp = norm(item.shipment);
  const code = norm(item.materialCode);
  const name = norm(item.materialName);
  const pkg = norm(item.packageNo || item.batchCode);
  const dwg = norm(item.drawingNo);
  const cat = norm(item.category);
  return `${pl}__${shp}__${code}__${name}__${pkg}__${dwg}__${cat}`;
}

function buildOutboundItemFromStock(st: InventoryStockRecord, idxOffset = 0): OutboundItemDetail {
  const defaultQty = st.currentQuantity > 0 ? roundQty(st.currentQuantity) : 0;
  const defaultWeight = Math.max(0, Math.round((Number(st.currentWeightKg) || 0) * 100) / 100);
  const defaultBatch =
    st.packageNo && st.packageNo !== 'N/A'
      ? st.packageNo
      : st.shipment && st.shipment !== 'N/A'
        ? st.shipment
        : '';

  return {
    id: `out-item-${Date.now()}-${idxOffset}-${Math.random().toString(36).substring(2, 6)}`,
    materialCode: st.materialCode,
    materialName: st.materialName,
    unit: st.unit,
    batchCode: defaultBatch,
    packingListNo: st.packingListNo,
    shipment: st.shipment,
    packageNo: st.packageNo,
    packageName: st.packageName,
    category: st.category,
    drawingNo: st.drawingNo,
    manufacturer: st.manufacturer,
    supplier: st.supplier,
    quantity: defaultQty,
    weightKg: defaultWeight,
    purpose: '',
    note: ''
  };
}

export const OutboundManager: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const [receipts, setReceipts] = useState<OutboundReceipt[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockRecords, setStockRecords] = useState<InventoryStockRecord[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortField, setSortField] = useState<ReceiptSortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Pagination cho bảng phiếu xuất
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [selectedReceiptForPrint, setSelectedReceiptForPrint] = useState<OutboundReceipt | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<OutboundReceipt | null>(null);
  const [detailSearch, setDetailSearch] = useState('');
  const deferredDetailSearch = useDeferredValue(detailSearch);
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(100);

  const [receiptToDelete, setReceiptToDelete] = useState<OutboundReceipt | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleteSelectedModalOpen, setIsDeleteSelectedModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form New Outbound (Theo mẫu QN-OPR-PR11-FM06)
  const [issueCode, setIssueCode] = useState('');
  const [isCodeManuallyEdited, setIsCodeManuallyEdited] = useState(false);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [formDepartmentName, setFormDepartmentName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientDepartment, setRecipientDepartment] = useState('');
  const [formRequestNo, setFormRequestNo] = useState('');
  const [formNotes, setFormNotes] = useState('');
  // Chế độ chỉnh sửa phiếu xuất kho (chỉ dành cho Admin; null = lập phiếu mới)
  const [editingReceipt, setEditingReceipt] = useState<OutboundReceipt | null>(null);
  const lastEditScopeRef = useRef<{
    year: string;
    whId: string;
    date: string;
    origWhId: string;
  } | null>(null);

  const [formOutboundType, setFormOutboundType] = useState<'issue' | 'transfer'>('issue');
  const [formItems, setFormItems] = useState<OutboundItemDetail[]>([]);
  const [formItemSearch, setFormItemSearch] = useState('');
  const [formItemPage, setFormItemPage] = useState(1);
  const [formError, setFormError] = useState('');

  // Hộp thoại chọn từ tồn kho (lazy-loaded & phân trang)
  const [isPickStockOpen, setIsPickStockOpen] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const deferredStockSearch = useDeferredValue(stockSearch);
  const [stockPickerWarehouseFilter, setStockPickerWarehouseFilter] = useState<string>('all');
  const [stockPage, setStockPage] = useState(1);
  const [stockPageSize, setStockPageSize] = useState(50);

  // Thanh tìm kiếm nhanh từ tồn kho trực tiếp trong Form lập phiếu
  const [quickStockQuery, setQuickStockQuery] = useState('');
  const [isQuickStockOpen, setIsQuickStockOpen] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = () => {
    setReceipts(StorageService.getOutboundReceipts());
    setWarehouses(StorageService.getWarehouses());
    setMaterials(StorageService.getMaterials());
  };

  useEffect(() => {
    loadData();
    return StorageService.subscribe(loadData);
  }, []);

  const authorizedWarehouses = useMemo(
    () => getAuthorizedWarehouses(warehouses, currentUser),
    [warehouses, currentUser]
  );

  const allowedWarehouseIds = useMemo(
    () => (isAdmin ? undefined : authorizedWarehouses.map((w) => w.id)),
    [isAdmin, authorizedWarehouses]
  );

  const authorizedReceipts = useMemo(
    () =>
      isAdmin
        ? receipts
        : receipts.filter((r) =>
            isWarehouseAuthorized(r.warehouseId, r.warehouseName, warehouses, currentUser)
          ),
    [receipts, warehouses, currentUser, isAdmin]
  );

  useEffect(() => {
    if (
      !isAdmin &&
      filterWarehouse !== 'all' &&
      !authorizedWarehouses.some((w) => w.id === filterWarehouse)
    ) {
      setFilterWarehouse('all');
    }
  }, [isAdmin, authorizedWarehouses, filterWarehouse]);

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, filterWarehouse, startDate, endDate]);

  // Đồng bộ làm sạch danh sách checkbox nếu có phiếu xuất vừa bị xóa hoặc đổi quyền user
  useEffect(() => {
    if (!isAdmin) {
      setSelectedIds((prev) => (prev.size > 0 ? new Set() : prev));
      return;
    }
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(receipts.map((r) => r.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [receipts, isAdmin]);

  const materialMap = useMemo(() => {
    const map = new Map<string, MaterialItem>();
    for (let i = 0; i < materials.length; i++) {
      map.set(materials[i].code.toLowerCase(), materials[i]);
    }
    return map;
  }, [materials]);

  const generateNextPxkCode = (
    existingList: OutboundReceipt[],
    targetDateStr?: string,
    targetWh?: Warehouse | null
  ): string => {
    return generateNextOutboundVoucherCode(existingList, targetDateStr, targetWh);
  };

  // Tự động nhảy sang số phiếu kế tiếp theo Kho đang chọn & Ngày/Tháng/Năm lập phiếu (cả khi lập mới và khi sửa phiếu)
  useEffect(() => {
    if (!isCreateModalOpen || isCodeManuallyEdited) return;
    const normDate = formatExcelDate(issueDate) || issueDate;
    const parsedYear = parseInt((normDate || '').slice(0, 4), 10);
    if (!normDate || isNaN(parsedYear) || parsedYear < 1990 || parsedYear > 2099) return;

    const activeWhList = isAdmin ? warehouses : authorizedWarehouses;
    const targetWh = activeWhList.find((w) => w.id === selectedWarehouseId) || activeWhList[0];
    const curYear = String(parsedYear);
    const curWhId = targetWh?.id || selectedWarehouseId || '';

    if (!editingReceipt) {
      const nextCode = generateNextPxkCode(receipts, normDate, targetWh);
      setIssueCode((prev) => (prev !== nextCode ? nextCode : prev));
      return;
    }

    const prevScope = lastEditScopeRef.current;
    const isDateGranular = voucherCodeHasDatePrecision(editingReceipt.issueCode);
    if (prevScope) {
      const sameRelevantScope = isDateGranular
        ? prevScope.date === normDate && prevScope.whId === curWhId
        : prevScope.year === curYear && prevScope.whId === curWhId;
      if (sameRelevantScope) return;
    }

    const origWhId = prevScope?.origWhId || curWhId;
    lastEditScopeRef.current = {
      year: curYear,
      whId: curWhId,
      date: normDate,
      origWhId
    };
    const nextCode = resolveEditedOutboundVoucherCode(
      receipts,
      editingReceipt,
      normDate,
      targetWh,
      origWhId
    );
    setIssueCode((prev) => (prev !== nextCode ? nextCode : prev));
  }, [
    receipts,
    warehouses,
    authorizedWarehouses,
    isAdmin,
    selectedWarehouseId,
    isCreateModalOpen,
    editingReceipt,
    isCodeManuallyEdited,
    issueDate
  ]);

  const openStockPicker = () => {
    const baseStock = StorageService.calculateInventoryRecords(
      isAdmin ? undefined : { allowedWarehouseIds }
    ).map((r) => ({ ...r }));
    // Khi Admin đang sửa một phiếu xuất cũ, cộng hoàn tạm thời số lượng/khối lượng của chính phiếu đó
    // để mặt hàng đã xuất bởi phiếu này vẫn hiển thị đúng tồn kho khả dụng trước khi xuất
    if (editingReceipt) {
      const stockIndexMap = new Map<string, number>();
      for (let i = 0; i < baseStock.length; i++) {
        const s = baseStock[i];
        const key = `${s.warehouseId}__${s.packingListNo}__${s.shipment}__${s.materialCode}__${s.materialName}__${s.packageNo}__${s.drawingNo}__${s.category}`;
        stockIndexMap.set(key, i);
      }
      for (let j = 0; j < editingReceipt.items.length; j++) {
        const it = editingReceipt.items[j];
        const key = `${editingReceipt.warehouseId}__${it.packingListNo || 'N/A'}__${it.shipment || 'N/A'}__${it.materialCode || 'N/A'}__${it.materialName || 'N/A'}__${it.packageNo || it.batchCode || 'N/A'}__${it.drawingNo || 'N/A'}__${it.category || 'N/A'}`;
        const idx = stockIndexMap.get(key);
        if (idx !== undefined) {
          baseStock[idx].currentQuantity = roundQty(
            baseStock[idx].currentQuantity + roundQty(it.quantity)
          );
          baseStock[idx].currentWeightKg =
            Math.round((baseStock[idx].currentWeightKg + (Number(it.weightKg) || 0)) * 100) / 100;
        }
      }
    }
    setStockRecords(baseStock);
    setStockPickerWarehouseFilter(selectedWarehouseId || 'all');
    setStockSearch('');
    setStockPage(1);
    setIsPickStockOpen(true);
  };

  const openCreateModal = () => {
    const currentReceipts = StorageService.getOutboundReceipts();
    const whList = StorageService.getWarehouses();
    const allowedWhList = getAuthorizedWarehouses(whList, currentUser);
    if (!isAdmin && allowedWhList.length === 0) {
      showToast('Tài khoản của bạn chưa được Admin phân quyền thao tác trên kho bãi nào.', 'error');
      return;
    }
    const defaultWhObj = allowedWhList[0] || null;
    const todayDate = new Date().toISOString().slice(0, 10);
    lastEditScopeRef.current = null;
    setReceipts(currentReceipts);
    setWarehouses(whList);
    setEditingReceipt(null);
    setMaterials(StorageService.getMaterials());
    setStockRecords(
      StorageService.calculateInventoryRecords(
        isAdmin ? undefined : { allowedWarehouseIds: allowedWhList.map((w) => w.id) }
      ).map((r) => ({ ...r }))
    );
    setIsCodeManuallyEdited(false);
    setSelectedWarehouseId(defaultWhObj?.id || '');
    setIssueDate(todayDate);
    setIssueCode(generateNextPxkCode(currentReceipts, todayDate, defaultWhObj));

    setFormDepartmentName('');
    setRecipientName('');
    setRecipientDepartment('');
    setFormRequestNo('');
    setFormNotes('');
    setFormOutboundType('issue');
    setFormError('');
    setFormItemSearch('');
    setFormItemPage(1);
    setFormItems([]);
    setQuickStockQuery('');
    setIsQuickStockOpen(false);
    setIsCreateModalOpen(true);
  };

  const openEditModal = (rcp: OutboundReceipt) => {
    if (!isAdmin) {
      showToast('Chỉ tài khoản Quản trị viên (Admin) mới có quyền sửa phiếu xuất kho.', 'error');
      return;
    }

    const currentReceipts = StorageService.getOutboundReceipts();
    const whList = StorageService.getWarehouses();
    const matchedWh =
      whList.find((w) => w.id === rcp.warehouseId) ||
      whList.find((w) => normUserKey(w.name) === normUserKey(rcp.warehouseName)) ||
      whList[0] ||
      null;
    const initialWhId = matchedWh?.id || rcp.warehouseId || '';
    const initialDate = formatExcelDate(rcp.issueDate) || new Date().toISOString().slice(0, 10);

    lastEditScopeRef.current = {
      year: initialDate.slice(0, 4),
      whId: initialWhId,
      date: initialDate,
      origWhId: initialWhId
    };
    setReceipts(currentReceipts);
    setWarehouses(whList);
    setMaterials(StorageService.getMaterials());
    setEditingReceipt(rcp);
    setIsCodeManuallyEdited(false);
    setIssueCode(rcp.issueCode || '');
    setIssueDate(initialDate);
    setSelectedWarehouseId(initialWhId);

    // Chuẩn bị sẵn tồn kho cho Quick Combobox khi sửa
    const baseStock = StorageService.calculateInventoryRecords().map((r) => ({ ...r }));
    const stockIndexMap = new Map<string, number>();
    for (let i = 0; i < baseStock.length; i++) {
      const s = baseStock[i];
      const key = `${s.warehouseId}__${s.packingListNo}__${s.shipment}__${s.materialCode}__${s.materialName}__${s.packageNo}__${s.drawingNo}__${s.category}`;
      stockIndexMap.set(key, i);
    }
    for (let j = 0; j < (rcp.items || []).length; j++) {
      const it = rcp.items[j];
      const key = `${rcp.warehouseId}__${it.packingListNo || 'N/A'}__${it.shipment || 'N/A'}__${it.materialCode || 'N/A'}__${it.materialName || 'N/A'}__${it.packageNo || it.batchCode || 'N/A'}__${it.drawingNo || 'N/A'}__${it.category || 'N/A'}`;
      const idx = stockIndexMap.get(key);
      if (idx !== undefined) {
        baseStock[idx].currentQuantity = roundQty(
          baseStock[idx].currentQuantity + roundQty(it.quantity)
        );
        baseStock[idx].currentWeightKg =
          Math.round((baseStock[idx].currentWeightKg + (Number(it.weightKg) || 0)) * 100) / 100;
      }
    }
    setStockRecords(baseStock);

    const savedDept =
      rcp.departmentName && rcp.departmentName !== 'DỰ ÁN LTIA-4.9'
        ? rcp.departmentName
        : rcp.projectName &&
            rcp.projectName !== 'DỰ ÁN LTIA-4.9' &&
            !rcp.projectName.includes('(Import Excel)')
          ? rcp.projectName
          : '';
    setFormDepartmentName(savedDept);
    setRecipientName(rcp.recipientName || '');
    setRecipientDepartment(rcp.recipientDepartment || '');
    setFormRequestNo(rcp.requestNo || '');
    setFormNotes(rcp.notes && !rcp.notes.startsWith('Import thành công ') ? rcp.notes : '');
    setFormOutboundType(rcp.outboundType || 'issue');
    setFormError('');
    setFormItemSearch('');
    setFormItemPage(1);
    setQuickStockQuery('');
    setIsQuickStockOpen(false);

    setFormItems(
      (rcp.items || []).map((it, idx) => ({
        ...it,
        id: it.id || `out-edit-${Date.now()}-${idx}`,
        note: it.note ?? it.purpose ?? ''
      }))
    );
    setIsCreateModalOpen(true);
  };

  const handleExportReceiptExcel = (rcp: OutboundReceipt) => {
    try {
      exportOutboundReceiptToExcel(rcp);
      showToast(`Đã xuất file Excel cho phiếu xuất "${rcp.issueCode}"!`);
    } catch (err) {
      console.error('Export Outbound Excel error:', err);
      showToast('Không thể xuất file Excel. Vui lòng thử lại.', 'error');
    }
  };

  const handleExportAllOutboundExcel = () => {
    const selectedFiltered =
      selectedIds.size > 0 ? filteredReceipts.filter((r) => selectedIds.has(r.id)) : [];
    const targetReceipts =
      selectedIds.size > 0
        ? selectedFiltered.length > 0
          ? selectedFiltered
          : receipts.filter((r) => selectedIds.has(r.id))
        : filteredReceipts;

    if (targetReceipts.length === 0) {
      showToast('Không có dữ liệu phiếu xuất kho để xuất ra Excel.', 'error');
      return;
    }

    try {
      const { receiptCount, itemCount } = exportOutboundReceiptsToExcel(targetReceipts);
      showToast(
        `Đã export ${receiptCount.toLocaleString('vi-VN')} phiếu xuất kho (${itemCount.toLocaleString('vi-VN')} dòng vật tư) ra file Excel!`
      );
    } catch (err) {
      console.error('Export all Outbound Excel error:', err);
      showToast('Không thể xuất file Excel danh sách phiếu xuất kho.', 'error');
    }
  };

  const addManualItemRow = () => {
    setFormItemSearch('');
    setFormItems((prev) => {
      const next: OutboundItemDetail[] = [
        ...prev,
        {
          id: `out-item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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
        }
      ];
      setFormItemPage(Math.max(1, Math.ceil(next.length / FORM_ITEM_PAGE_SIZE)));
      return next;
    });
  };

  const selectSingleStockItem = (st: InventoryStockRecord, closePicker = true) => {
    if (st.currentQuantity <= 0 && st.currentWeightKg <= 0) {
      showToast('Mặt hàng này hiện không còn tồn kho khả dụng!', 'error');
      return;
    }

    // Nếu phiếu chưa chọn kho hoặc đang trống, tự động đồng bộ theo kho của mặt hàng
    if (!selectedWarehouseId || formItems.length === 0) {
      if (st.warehouseId && st.warehouseId !== selectedWarehouseId) {
        setSelectedWarehouseId(st.warehouseId);
      }
    }

    const targetKey = getStockItemMatchKey(st);
    const existingIndex = formItems.findIndex((it) => getStockItemMatchKey(it) === targetKey);

    setFormItemSearch('');
    // Luôn đưa vật tư được chọn vào phiếu xuất để không bao giờ chặn thao tác của người dùng
    setFormItems((prev) => {
      const next = [...prev, buildOutboundItemFromStock(st, prev.length)];
      setFormItemPage(Math.max(1, Math.ceil(next.length / FORM_ITEM_PAGE_SIZE)));
      return next;
    });

    const itemLabel = st.materialCode
      ? `${st.materialCode} - ${st.materialName}`
      : st.materialName || 'Vật tư';

    if (existingIndex !== -1) {
      showToast(`Đã thêm dòng xuất mới cho "${itemLabel}"!`, 'success');
    } else {
      showToast(`Đã thêm "${itemLabel}" vào phiếu xuất kho!`, 'success');
    }

    setQuickStockQuery('');
    setIsQuickStockOpen(false);
    setFormError('');
    if (closePicker) {
      setIsPickStockOpen(false);
    }
  };

  const toggleStockItemSelection = (st: InventoryStockRecord) => {
    const targetKey = getStockItemMatchKey(st);
    const alreadySelected = formItems.some((it) => getStockItemMatchKey(it) === targetKey);

    if (alreadySelected) {
      setFormItems((prev) => prev.filter((it) => getStockItemMatchKey(it) !== targetKey));
      return;
    }

    if (st.currentQuantity <= 0 && st.currentWeightKg <= 0) {
      setFormError('Mặt hàng này hiện không còn tồn kho khả dụng!');
      return;
    }

    // Tự động gán kho phiếu xuất nếu chưa chọn
    if (!selectedWarehouseId && st.warehouseId) {
      setSelectedWarehouseId(st.warehouseId);
    }

    setFormItemSearch('');
    setFormItems((prev) => {
      if (prev.some((it) => getStockItemMatchKey(it) === targetKey)) return prev;
      const next: OutboundItemDetail[] = [...prev, buildOutboundItemFromStock(st, prev.length)];
      setFormItemPage(Math.max(1, Math.ceil(next.length / FORM_ITEM_PAGE_SIZE)));
      return next;
    });
    setFormError('');
  };

  const removeItemRow = (idx: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItemRow = (idx: number, field: keyof OutboundItemDetail, val: any) => {
    setFormItems((prev) => {
      const copy = [...prev];
      const prevRow = prev[idx];
      copy[idx] = { ...prevRow, [field]: val };

      if (field === 'materialCode') {
        const found = materialMap.get(String(val).trim().toLowerCase());
        if (found) {
          copy[idx].materialName = found.name;
          copy[idx].unit = found.unit;
          if (found.packageNo && !copy[idx].batchCode) {
            copy[idx].batchCode = found.packageNo;
            copy[idx].packageNo = found.packageNo;
          }
          if (found.category) copy[idx].category = found.category;
          if (found.unitWeightKg && copy[idx].quantity) {
            copy[idx].weightKg = Math.round(found.unitWeightKg * roundQty(copy[idx].quantity) * 100) / 100;
          }
        }
      }

      if (field === 'quantity') {
        const nextQty = Math.max(0, roundQty(val));
        const prevQty = roundQty(prevRow.quantity);
        const currW = Number(prevRow.weightKg) || 0;
        const found = materialMap.get(String(copy[idx].materialCode || '').trim().toLowerCase());
        if (found && found.unitWeightKg && found.unitWeightKg > 0) {
          const prevAutoW = Math.round(found.unitWeightKg * prevQty * 100) / 100;
          if (currW === 0 || Math.abs(currW - prevAutoW) < 0.05) {
            copy[idx].weightKg = Math.round(found.unitWeightKg * nextQty * 100) / 100;
          } else if (prevQty > 0 && currW > 0 && nextQty > 0) {
            copy[idx].weightKg = Math.round((currW / prevQty) * nextQty * 100) / 100;
          }
        } else if (prevQty > 0 && currW > 0 && nextQty > 0) {
          copy[idx].weightKg = Math.round((currW / prevQty) * nextQty * 100) / 100;
        }
      }

      if (field === 'batchCode' && (!copy[idx].packingListNo || copy[idx].packingListNo === 'N/A')) {
        copy[idx].packageNo = String(val);
      }

      return copy;
    });
  };

  // Import từ file Excel xuất kho tối ưu O(N) cho trên 100.000 dòng
  const handleExcelImportSuccess = async (
    imported: Partial<OutboundItemDetail>[],
    defaultWhId?: string
  ) => {
    if (imported.length === 0) return;

    const allWh = StorageService.getWarehouses();
    const scopedWhList = getAuthorizedWarehouses(allWh, currentUser);
    if (!isAdmin && scopedWhList.length === 0) {
      showToast('Tài khoản của bạn chưa được Admin phân quyền thao tác trên kho bãi nào.', 'error');
      return;
    }

    const fallbackWh: Warehouse = scopedWhList[0] || {
      id: 'wh-01',
      name: 'Kho Tổng Trung Tâm',
      code: 'WH-01',
      location: 'Khu dự án',
      type: 'covered',
      status: 'active',
      createdAt: new Date().toISOString()
    };

    const selectedDefaultWh =
      defaultWhId && defaultWhId !== 'auto'
        ? scopedWhList.find((w) => w.id === defaultWhId) || fallbackWh
        : fallbackWh;

    const whResolveCache = new Map<string, Warehouse>();
    let unauthorizedWarehouseName: string | null = null;
    const resolveWarehouse = (itemWhName?: string): Warehouse => {
      if (!itemWhName) return selectedDefaultWh;
      const trimmed = itemWhName.trim().toLowerCase();
      if (!trimmed) return selectedDefaultWh;

      const cached = whResolveCache.get(trimmed);
      if (cached) return cached;

      const matchedAllowed = scopedWhList.find((w) => {
        const wName = w.name.toLowerCase();
        const wCode = w.code.toLowerCase();
        return (
          wName === trimmed ||
          wCode === trimmed ||
          wName.includes(trimmed) ||
          trimmed.includes(wName)
        );
      });

      if (!matchedAllowed && !isAdmin) {
        const matchesOtherWh = allWh.find((w) => {
          const wName = w.name.toLowerCase();
          const wCode = w.code.toLowerCase();
          return (
            wName === trimmed ||
            wCode === trimmed ||
            wName.includes(trimmed) ||
            trimmed.includes(wName)
          );
        });
        if (matchesOtherWh) {
          unauthorizedWarehouseName = matchesOtherWh.name;
        }
      }

      const matched = matchedAllowed || selectedDefaultWh;
      whResolveCache.set(trimmed, matched);
      return matched;
    };

    const groups = new Map<
      string,
      {
        warehouse: Warehouse;
        issueCode?: string;
        issueDate?: string;
        outboundType?: 'issue' | 'transfer';
        departmentName?: string;
        projectName?: string;
        recipientName?: string;
        recipientDepartment?: string;
        requestNo?: string;
        notes?: string;
        items: Partial<OutboundItemDetail>[];
      }
    >();

    for (let i = 0; i < imported.length; i++) {
      const item = imported[i] as any;
      const wh = resolveWarehouse(item.warehouseName);
      if (unauthorizedWarehouseName) {
        showToast(
          `Bạn không có quyền import phiếu xuất cho kho "${unauthorizedWarehouseName}". Vui lòng kiểm tra lại file Excel hoặc liên hệ Admin.`,
          'error'
        );
        return;
      }
      const rawCode = (item.issueCode || '').trim();
      const customCode = rawCode || (item.packingListNo ? `PXK-${item.packingListNo.trim()}` : '');
      const rowType: 'issue' | 'transfer' = item.outboundType === 'transfer' ? 'transfer' : 'issue';
      const groupKey = rawCode
        ? `ISSUE_${rawCode.toUpperCase()}`
        : `${wh.id}__${rowType}__${customCode || 'AUTO'}`;

      let currentGroup = groups.get(groupKey);
      if (!currentGroup) {
        currentGroup = {
          warehouse: wh,
          issueCode: rawCode || customCode,
          issueDate: item.issueDate,
          outboundType: item.outboundType === 'transfer' ? 'transfer' : item.outboundType === 'issue' ? 'issue' : undefined,
          departmentName: item.departmentName,
          projectName: item.projectName,
          recipientName: item.recipientName,
          recipientDepartment: item.recipientDepartment,
          requestNo: item.requestNo,
          notes: item.issueNotes,
          items: []
        };
        groups.set(groupKey, currentGroup);
      } else {
        if (!currentGroup.issueDate && item.issueDate) currentGroup.issueDate = item.issueDate;
        if (item.outboundType === 'transfer') {
          currentGroup.outboundType = 'transfer';
        } else if (!currentGroup.outboundType && item.outboundType) {
          currentGroup.outboundType = item.outboundType;
        }
        if (!currentGroup.departmentName && item.departmentName) currentGroup.departmentName = item.departmentName;
        if (!currentGroup.projectName && item.projectName) currentGroup.projectName = item.projectName;
        if (!currentGroup.recipientName && item.recipientName) currentGroup.recipientName = item.recipientName;
        if (!currentGroup.recipientDepartment && item.recipientDepartment) {
          currentGroup.recipientDepartment = item.recipientDepartment;
        }
        if (!currentGroup.requestNo && item.requestNo) currentGroup.requestNo = item.requestNo;
        if (!currentGroup.notes && item.issueNotes) currentGroup.notes = item.issueNotes;
      }
      currentGroup.items.push(item);
    }

    const todayIso = new Date().toISOString();
    const todayDate = todayIso.slice(0, 10);
    const baseTs = Date.now();
    const batchSalt = Math.random().toString(36).slice(2, 6);
    const userFullName = currentUser?.fullName || 'Võ Dương Phú';
    let createdCount = 0;
    const existingForAutoNumber = StorageService.getOutboundReceipts();
    const usedMaterialCodes = collectUsedMaterialCodeKeys({
      materials: StorageService.getMaterials(),
      inbounds: StorageService.getInboundReceipts(),
      outbounds: existingForAutoNumber,
      osd: StorageService.getOsdReceipts(),
      extraCodes: imported.map((x: any) => x?.materialCode)
    });
    const newReceipts: OutboundReceipt[] = [];

    groups.forEach(
      ({
        warehouse: targetWh,
        issueCode: customCode,
        issueDate: customDate,
        outboundType: customOutboundType,
        departmentName: customDeptHeader,
        projectName: customProj,
        recipientName: customRecipient,
        recipientDepartment: customDept,
        requestNo: customReqNo,
        notes: customNotes,
        items: whItems
      }) => {
        const first = whItems[0] as any;
        const normalizedGroupDate = formatExcelDate(customDate) || todayDate;
        const generatedCode = customCode?.trim()
          ? customCode.trim()
          : generateNextOutboundVoucherCode(
              [...newReceipts, ...existingForAutoNumber],
              normalizedGroupDate,
              targetWh
            );

        const len = whItems.length;
        const fullItems: OutboundItemDetail[] = new Array(len);
        const occurrenceMap = new Map<string, number>();

        for (let idx = 0; idx < len; idx++) {
          const item = whItems[idx] as any;
          const qty = Math.max(0, roundQty(item.quantity));
          const weight = Math.max(0, Math.round((Number(item.weightKg) || 0) * 100) / 100);
          const batchVal = String(item.batchCode || item.packageNo || '').trim();
          const pkgNo = String(item.packageNo || batchVal || `PKG-${idx + 1}`).trim();
          const rawMatCode = String(item.materialCode || '').trim();
          const matCode = rawMatCode
            ? rawMatCode.toUpperCase()
            : generateUniqueMaterialCode(usedMaterialCodes, item.materialName, 'VT');
          const plNo = String(item.packingListNo || 'PL-EXCEL-01').trim();
          const dwgNo = String(item.drawingNo || 'N/A').trim();

          const sigSeed = `${matCode}|${batchVal}|${plNo}|${pkgNo}|${dwgNo}|${qty}|${weight}`;
          const occ = (occurrenceMap.get(sigSeed) || 0) + 1;
          occurrenceMap.set(sigSeed, occ);

          fullItems[idx] = {
            id: buildDeterministicItemId('out', generatedCode, sigSeed, occ),
            materialCode: matCode,
            materialName: item.materialName || 'Vật tư xuất kho',
            unit: item.unit || 'Ống',
            batchCode: batchVal,
            packingListNo: plNo,
            shipment: item.shipment || 'SHP-EXCEL',
            packageNo: pkgNo,
            packageName: item.packageName || '',
            category: item.category || 'Hạng mục lắp đặt',
            drawingNo: dwgNo,
            manufacturer: item.manufacturer || 'N/A',
            supplier: item.supplier || 'N/A',
            warehouseName: targetWh.name,
            weightKg: weight,
            quantity: qty,
            purpose: item.purpose || '',
            note: item.note ?? item.purpose ?? ''
          };
        }

        const sums = sumOutboundItems(fullItems);
        const normalizedIssueDate = formatExcelDate(customDate) || todayDate;
        const effectiveDeptHeader = customDeptHeader || customProj || '';

        newReceipts.push({
          id: `out-rcp-${baseTs}-${batchSalt}-${createdCount}`,
          issueCode: generatedCode,
          issueDate: normalizedIssueDate,
          warehouseId: targetWh.id,
          warehouseName: targetWh.name,
          departmentName: effectiveDeptHeader,
          requestNo: customReqNo || '',
          outboundType: customOutboundType === 'transfer' ? 'transfer' : 'issue',
          projectName: customProj || effectiveDeptHeader,
          recipientDepartment: customDept || first?.recipientDepartment || 'Tổ thi công',
          recipientName: customRecipient || first?.recipientName || '',
          issuerName: userFullName,
          notes: customNotes || '',
          items: fullItems,
          packingListSummary: buildPackingListSummary(fullItems),
          totalQuantity: sums.totalQuantity,
          totalWeightKg: sums.totalWeightKg,
          createdAt: todayIso,
          createdBy: userFullName
        });
        createdCount++;
      }
    );

    StorageService.addOutboundReceipts(newReceipts);

    setSearchTerm('');
    setFilterWarehouse('all');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);

    loadData();
    showToast(
      `Đã import thành công ${newReceipts.length.toLocaleString('vi-VN')} phiếu xuất kho (${imported.length.toLocaleString('vi-VN')} mục hàng)!`
    );
    void SyncService.syncNow();
  };

  const handleSaveCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = issueCode.trim();
    if (!trimmedCode) {
      setFormError('Số phiếu xuất không được để trống.');
      return;
    }
    if (!editingReceipt && !recipientName.trim()) {
      setFormError('Vui lòng nhập họ tên Người nhận.');
      return;
    }
    if (formItems.length === 0) {
      setFormError('Vui lòng chọn từ tồn kho hoặc thêm ít nhất một dòng vật tư xuất.');
      return;
    }

    if (editingReceipt && !isAdmin) {
      setFormError('Chỉ tài khoản Quản trị viên (Admin) mới có quyền sửa phiếu xuất kho.');
      return;
    }

    const existingDuplicate = receipts.find(
      (r) =>
        (!editingReceipt || r.id !== editingReceipt.id) &&
        normKey(r.issueCode) === normKey(trimmedCode)
    );
    if (existingDuplicate) {
      setFormError(
        `Số phiếu "${trimmedCode}" đã tồn tại trong hệ thống. Vui lòng nhập số phiếu khác.`
      );
      return;
    }

    for (let i = 0; i < formItems.length; i++) {
      const it = formItems[i];
      if (!it.materialName.trim()) {
        setFormError(`Dòng số ${i + 1}: Vui lòng nhập Tên vật tư.`);
        return;
      }
      const q = roundQty(it.quantity);
      const w = Number(it.weightKg) || 0;
      if (q < 0 || w < 0) {
        setFormError(`Dòng số ${i + 1}: Số lượng và Khối lượng xuất không được là số âm.`);
        return;
      }
      if (q <= 0 && w <= 0) {
        setFormError(`Dòng số ${i + 1}: Vui lòng nhập Số lượng xuất (> 0) hoặc Khối lượng (> 0).`);
        return;
      }
    }

    const availableWhList = isAdmin ? warehouses : authorizedWarehouses;
    const wh = availableWhList.find((w) => w.id === selectedWarehouseId) || availableWhList[0];
    if (!wh && !isAdmin) {
      setFormError('Tài khoản của bạn chưa được phân quyền thao tác trên kho bãi này.');
      return;
    }
    const usedMaterialCodes = collectUsedMaterialCodeKeys({
      materials: StorageService.getMaterials(),
      inbounds: StorageService.getInboundReceipts(),
      outbounds: receipts,
      osd: StorageService.getOsdReceipts(),
      extraCodes: formItems.map((it) => it.materialCode)
    });
    const normalizedItems: OutboundItemDetail[] = formItems.map((it) => {
      const batch = (it.batchCode || it.packageNo || '').trim();
      const noteText = (it.note ?? it.purpose ?? '').trim();
      const rawMatCode = it.materialCode.trim();
      return {
        ...it,
        materialCode: rawMatCode
          ? rawMatCode
          : generateUniqueMaterialCode(usedMaterialCodes, it.materialName, 'VT'),
        materialName: it.materialName.trim(),
        unit: it.unit.trim() || 'Ống',
        batchCode: batch,
        packageNo: it.packageNo || batch || 'N/A',
        warehouseName: wh?.name || it.warehouseName || 'Kho Dự Án',
        quantity: Math.max(0, roundQty(it.quantity)),
        weightKg: Math.max(0, Math.round((Number(it.weightKg) || 0) * 100) / 100),
        purpose: noteText,
        note: noteText
      };
    });

    const sums = sumOutboundItems(normalizedItems);
    const deptHeader = formDepartmentName.trim();
    const editorName = currentUser?.fullName || 'Võ Dương Phú';

    if (editingReceipt) {
      const updatedReceipt: OutboundReceipt = {
        ...editingReceipt,
        issueCode: trimmedCode,
        issueDate,
        warehouseId: wh?.id || editingReceipt.warehouseId || 'wh-01',
        warehouseName: wh?.name || editingReceipt.warehouseName || 'Kho Dự Án',
        departmentName: deptHeader,
        requestNo: formRequestNo.trim(),
        outboundType: formOutboundType,
        projectName: deptHeader || editingReceipt.projectName || '',
        recipientDepartment:
          recipientDepartment.trim() || editingReceipt.recipientDepartment || 'Tổ thi công',
        recipientName: recipientName.trim(),
        issuerName: editingReceipt.issuerName || editorName,
        notes: formNotes.trim(),
        items: normalizedItems,
        packingListSummary: buildPackingListSummary(normalizedItems),
        totalQuantity: sums.totalQuantity,
        totalWeightKg: sums.totalWeightKg,
        lastEditedBy: editorName,
        lastEditedAt: new Date().toISOString()
      };

      StorageService.updateOutboundReceipt(editingReceipt.id, updatedReceipt);
      loadData();
      setIsCreateModalOpen(false);
      setEditingReceipt(null);
      if (viewingReceipt?.id === editingReceipt.id) {
        const refreshed = StorageService.getOutboundReceipts().find(
          (r) => normKey(r.issueCode) === normKey(trimmedCode)
        );
        if (refreshed) setViewingReceipt(refreshed);
      }
      showToast(`Đã cập nhật phiếu xuất kho "${trimmedCode}" thành công!`);
      return;
    }

    const newReceipt: OutboundReceipt = {
      id: `out-rcp-${Date.now()}`,
      issueCode: trimmedCode,
      issueDate,
      warehouseId: wh?.id || 'wh-01',
      warehouseName: wh?.name || 'Kho Dự Án',
      departmentName: deptHeader,
      requestNo: formRequestNo.trim(),
      outboundType: formOutboundType,
      projectName: deptHeader,
      recipientDepartment: recipientDepartment.trim() || 'Tổ thi công',
      recipientName: recipientName.trim(),
      issuerName: editorName,
      notes: formNotes.trim(),
      items: normalizedItems,
      packingListSummary: buildPackingListSummary(normalizedItems),
      totalQuantity: sums.totalQuantity,
      totalWeightKg: sums.totalWeightKg,
      createdAt: new Date().toISOString(),
      createdBy: editorName
    };

    StorageService.addOutboundReceipt(newReceipt);
    loadData();
    setIsCreateModalOpen(false);
    showToast(`Đã lập phiếu xuất kho "${trimmedCode}" thành công!`);
  };

  const handleDeleteReceipt = (rcp: OutboundReceipt) => {
    if (!isAdmin) {
      showToast('Chỉ tài khoản Quản trị viên (Admin) mới có quyền xóa phiếu xuất kho.', 'error');
      return;
    }
    setReceiptToDelete(rcp);
  };

  const confirmDeleteOutbound = () => {
    if (!receiptToDelete) return;
    const targetId = receiptToDelete.id;
    const targetCode = receiptToDelete.issueCode;

    StorageService.deleteOutboundReceipt(targetId);
    setReceipts((prev) => prev.filter((r) => r.id !== targetId));
    setSelectedIds((prev) => {
      if (!prev.has(targetId)) return prev;
      const next = new Set(prev);
      next.delete(targetId);
      return next;
    });
    loadData();
    showToast(`Đã xóa phiếu xuất "${targetCode}" thành công!`);
    setReceiptToDelete(null);

    if (viewingReceipt?.id === targetId) {
      setViewingReceipt(null);
    }
  };

  const confirmDeleteSelectedOutbound = () => {
    if (!isAdmin || selectedIds.size === 0) return;
    const idsToDelete = Array.from(selectedIds);
    const deletedCount = StorageService.deleteOutboundReceipts(idsToDelete);

    if (viewingReceipt && selectedIds.has(viewingReceipt.id)) {
      setViewingReceipt(null);
    }

    setSelectedIds(new Set());
    setIsDeleteSelectedModalOpen(false);
    loadData();
    showToast(
      `Đã xóa thành công ${deletedCount.toLocaleString('vi-VN')} phiếu xuất kho đã chọn!`
    );
  };

  const openDetailModal = (rcp: OutboundReceipt) => {
    setDetailSearch('');
    setDetailPage(1);
    setViewingReceipt(rcp);
  };

  // Lọc phiếu xuất tối ưu O(N)
  const filteredReceipts = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const checkWh = filterWarehouse !== 'all';

    const filtered =
      !q && !checkWh && !startDate && !endDate
        ? authorizedReceipts
        : authorizedReceipts.filter((r) => {
            if (checkWh && r.warehouseId !== filterWarehouse) return false;
            const normDate = formatExcelDate(r.issueDate);
            if (startDate && normDate < startDate) return false;
            if (endDate && normDate > endDate) return false;

            if (q) {
              const headerMatch =
                r.issueCode.toLowerCase().includes(q) ||
                r.recipientDepartment.toLowerCase().includes(q) ||
                r.recipientName.toLowerCase().includes(q) ||
                (r.requestNo && r.requestNo.toLowerCase().includes(q)) ||
                (r.departmentName && r.departmentName.toLowerCase().includes(q)) ||
                (r.notes && r.notes.toLowerCase().includes(q)) ||
                (r.projectName && r.projectName.toLowerCase().includes(q)) ||
                (r.packingListSummary && r.packingListSummary.toLowerCase().includes(q));

              if (headerMatch) return true;

              const items = r.items;
              for (let i = 0; i < items.length; i++) {
                const it = items[i];
                if (
                  it.materialName.toLowerCase().includes(q) ||
                  it.materialCode.toLowerCase().includes(q) ||
                  (it.batchCode && it.batchCode.toLowerCase().includes(q)) ||
                  it.packingListNo.toLowerCase().includes(q) ||
                  it.shipment.toLowerCase().includes(q) ||
                  it.packageNo.toLowerCase().includes(q)
                ) {
                  return true;
                }
              }
              return false;
            }

            return true;
          });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortField === 'date') {
        const dateA = formatExcelDate(a.issueDate) || a.issueDate || '';
        const dateB = formatExcelDate(b.issueDate) || b.issueDate || '';
        if (dateA !== dateB) {
          return sortOrder === 'desc'
            ? dateB.localeCompare(dateA)
            : dateA.localeCompare(dateB);
        }
        return sortOrder === 'desc'
          ? (b.issueCode || '').localeCompare(a.issueCode || '', 'vi', { numeric: true })
          : (a.issueCode || '').localeCompare(b.issueCode || '', 'vi', { numeric: true });
      } else {
        const codeA = a.issueCode || '';
        const codeB = b.issueCode || '';
        const cmp = codeA.localeCompare(codeB, 'vi', { numeric: true });
        if (cmp !== 0) {
          return sortOrder === 'desc' ? -cmp : cmp;
        }
        const dateA = formatExcelDate(a.issueDate) || a.issueDate || '';
        const dateB = formatExcelDate(b.issueDate) || b.issueDate || '';
        return dateB.localeCompare(dateA);
      }
    });

    return sorted;
  }, [authorizedReceipts, deferredSearch, filterWarehouse, startDate, endDate, sortField, sortOrder]);

  const pagedReceipts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredReceipts.slice(start, start + pageSize);
  }, [filteredReceipts, currentPage, pageSize]);

  // Thao tác chọn checkbox xóa nhiều phiếu xuất (chỉ dành cho Admin, O(pageSize) trên mỗi trang)
  const toggleSelectReceipt = (id: string) => {
    if (!isAdmin) return;
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

  const isAllPageSelected =
    isAdmin && pagedReceipts.length > 0 && pagedReceipts.every((r) => selectedIds.has(r.id));
  const isSomePageSelected =
    isAdmin && pagedReceipts.some((r) => selectedIds.has(r.id)) && !isAllPageSelected;

  const toggleSelectCurrentPage = () => {
    if (!isAdmin) return;
    if (isAllPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = 0; i < pagedReceipts.length; i++) {
          next.delete(pagedReceipts[i].id);
        }
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = 0; i < pagedReceipts.length; i++) {
          next.add(pagedReceipts[i].id);
        }
        return next;
      });
    }
  };

  const selectAllFiltered = () => {
    if (!isAdmin) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (let i = 0; i < filteredReceipts.length; i++) {
        next.add(filteredReceipts[i].id);
      }
      return next;
    });
  };

  const selectAllTotal = () => {
    if (!isAdmin) return;
    setSelectedIds(new Set(receipts.map((r) => r.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const selectedReceiptsSummary = useMemo(() => {
    if (selectedIds.size === 0) return '';
    const sampleCodes: string[] = [];
    for (let i = 0; i < receipts.length; i++) {
      if (selectedIds.has(receipts[i].id)) {
        sampleCodes.push(receipts[i].issueCode);
        if (sampleCodes.length >= 4) break;
      }
    }
    const extra = selectedIds.size - sampleCodes.length;
    if (extra > 0) {
      return `${sampleCodes.join(', ')} và ${extra.toLocaleString('vi-VN')} phiếu xuất khác`;
    }
    return sampleCodes.join(', ');
  }, [receipts, selectedIds]);

  // Tồn kho lọc cho modal chọn vật tư xuất
  const availableStockForPicker = useMemo(() => {
    if (!isPickStockOpen) return [];
    const q = deferredStockSearch.trim().toLowerCase();
    return stockRecords.filter((st) => {
      if (stockPickerWarehouseFilter !== 'all' && st.warehouseId !== stockPickerWarehouseFilter) {
        return false;
      }
      if (st.currentQuantity <= 0 && st.currentWeightKg <= 0) return false;
      if (q) {
        return (
          st.materialName.toLowerCase().includes(q) ||
          st.materialCode.toLowerCase().includes(q) ||
          st.packingListNo.toLowerCase().includes(q) ||
          st.shipment.toLowerCase().includes(q) ||
          st.packageNo.toLowerCase().includes(q) ||
          st.drawingNo.toLowerCase().includes(q) ||
          (st.storageLocation && st.storageLocation.toLowerCase().includes(q)) ||
          (st.warehouseName && st.warehouseName.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [isPickStockOpen, stockRecords, stockPickerWarehouseFilter, deferredStockSearch]);

  // Danh sách gợi ý tồn kho khả dụng cho Quick Combobox trên Form lập phiếu xuất
  const quickStockSuggestions = useMemo(() => {
    if (!isCreateModalOpen) return [];
    const q = quickStockQuery.trim().toLowerCase();
    const records =
      stockRecords.length > 0
        ? stockRecords
        : StorageService.calculateInventoryRecords(
            isAdmin ? undefined : { allowedWarehouseIds }
          );
    return records
      .filter((st) => {
        if (!isAdmin && !isWarehouseAuthorized(st.warehouseId, st.warehouseName, warehouses, currentUser)) {
          return false;
        }
        if (selectedWarehouseId && st.warehouseId !== selectedWarehouseId) return false;
        if (st.currentQuantity <= 0 && st.currentWeightKg <= 0) return false;
        if (!q) return true;
        return (
          st.materialCode.toLowerCase().includes(q) ||
          st.materialName.toLowerCase().includes(q) ||
          st.packageNo.toLowerCase().includes(q) ||
          st.packingListNo.toLowerCase().includes(q) ||
          st.shipment.toLowerCase().includes(q) ||
          st.drawingNo.toLowerCase().includes(q) ||
          (st.storageLocation && st.storageLocation.toLowerCase().includes(q))
        );
      })
      .slice(0, 10);
  }, [isCreateModalOpen, quickStockQuery, stockRecords, selectedWarehouseId, isAdmin, allowedWarehouseIds, warehouses, currentUser]);

  const pagedStockForPicker = useMemo(() => {
    const start = (stockPage - 1) * stockPageSize;
    return availableStockForPicker.slice(start, start + stockPageSize);
  }, [availableStockForPicker, stockPage, stockPageSize]);

  // Tập khóa O(1) đối chiếu các dòng vật tư đã được tích chọn trong danh sách xuất kho
  const selectedStockKeySet = useMemo(() => {
    if (!isPickStockOpen) return new Set<string>();
    const set = new Set<string>();
    for (let i = 0; i < formItems.length; i++) {
      set.add(getStockItemMatchKey(formItems[i]));
    }
    return set;
  }, [isPickStockOpen, formItems]);

  const isAllStockPageSelected =
    pagedStockForPicker.length > 0 &&
    pagedStockForPicker.every((st) => selectedStockKeySet.has(getStockItemMatchKey(st)));

  const isSomeStockPageSelected =
    pagedStockForPicker.some((st) => selectedStockKeySet.has(getStockItemMatchKey(st))) &&
    !isAllStockPageSelected;

  const selectedFilteredStockCount = useMemo(() => {
    if (!isPickStockOpen || availableStockForPicker.length === 0) return 0;
    let count = 0;
    for (let i = 0; i < availableStockForPicker.length; i++) {
      if (selectedStockKeySet.has(getStockItemMatchKey(availableStockForPicker[i]))) {
        count++;
      }
    }
    return count;
  }, [isPickStockOpen, availableStockForPicker, selectedStockKeySet]);

  const toggleSelectStockPage = () => {
    if (pagedStockForPicker.length === 0) return;

    if (isAllStockPageSelected) {
      const pageKeys = new Set<string>();
      for (let i = 0; i < pagedStockForPicker.length; i++) {
        pageKeys.add(getStockItemMatchKey(pagedStockForPicker[i]));
      }
      setFormItems((prev) => prev.filter((it) => !pageKeys.has(getStockItemMatchKey(it))));
    } else {
      setFormItemSearch('');
      setFormItems((prev) => {
        const existingKeys = new Set<string>();
        for (let i = 0; i < prev.length; i++) {
          existingKeys.add(getStockItemMatchKey(prev[i]));
        }
        const additions: OutboundItemDetail[] = [];
        for (let i = 0; i < pagedStockForPicker.length; i++) {
          const st = pagedStockForPicker[i];
          if (st.currentQuantity <= 0 && st.currentWeightKg <= 0) continue;
          const k = getStockItemMatchKey(st);
          if (!existingKeys.has(k)) {
            existingKeys.add(k);
            additions.push(buildOutboundItemFromStock(st, prev.length + additions.length));
          }
        }
        if (additions.length === 0) return prev;
        const next = [...prev, ...additions];
        setFormItemPage(Math.max(1, Math.ceil(next.length / FORM_ITEM_PAGE_SIZE)));
        return next;
      });
      setFormError('');
    }
  };

  const selectAllFilteredStock = () => {
    if (availableStockForPicker.length === 0) return;
    setFormItemSearch('');
    setFormItems((prev) => {
      const existingKeys = new Set<string>();
      for (let i = 0; i < prev.length; i++) {
        existingKeys.add(getStockItemMatchKey(prev[i]));
      }
      const additions: OutboundItemDetail[] = [];
      for (let i = 0; i < availableStockForPicker.length; i++) {
        const st = availableStockForPicker[i];
        if (st.currentQuantity <= 0 && st.currentWeightKg <= 0) continue;
        const k = getStockItemMatchKey(st);
        if (!existingKeys.has(k)) {
          existingKeys.add(k);
          additions.push(buildOutboundItemFromStock(st, prev.length + additions.length));
        }
      }
      if (additions.length === 0) return prev;
      const next = [...prev, ...additions];
      setFormItemPage(Math.max(1, Math.ceil(next.length / FORM_ITEM_PAGE_SIZE)));
      return next;
    });
    setFormError('');
  };

  const clearSelectedFilteredStock = () => {
    if (availableStockForPicker.length === 0) return;
    const filterKeys = new Set<string>();
    for (let i = 0; i < availableStockForPicker.length; i++) {
      filterKeys.add(getStockItemMatchKey(availableStockForPicker[i]));
    }
    setFormItems((prev) => prev.filter((it) => !filterKeys.has(getStockItemMatchKey(it))));
  };

  // Chi tiết phiếu xuất phân trang
  const filteredDetailItems = useMemo(() => {
    if (!viewingReceipt) return [];
    const q = deferredDetailSearch.trim().toLowerCase();
    if (!q) return viewingReceipt.items;
    return viewingReceipt.items.filter(
      (it) =>
        it.materialName.toLowerCase().includes(q) ||
        it.materialCode.toLowerCase().includes(q) ||
        (it.batchCode && it.batchCode.toLowerCase().includes(q)) ||
        it.packingListNo.toLowerCase().includes(q) ||
        it.shipment.toLowerCase().includes(q) ||
        it.packageNo.toLowerCase().includes(q) ||
        it.drawingNo.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q)
    );
  }, [viewingReceipt, deferredDetailSearch]);

  const pagedDetailItems = useMemo(() => {
    const start = (detailPage - 1) * detailPageSize;
    return filteredDetailItems.slice(start, start + detailPageSize);
  }, [filteredDetailItems, detailPage, detailPageSize]);

  const detailTotals = useMemo(
    () => sumOutboundItems(filteredDetailItems),
    [filteredDetailItems]
  );

  const viewingReceiptTotals = useMemo(
    () =>
      viewingReceipt
        ? sumOutboundItems(viewingReceipt.items)
        : { totalQuantity: 0, totalWeightKg: 0 },
    [viewingReceipt]
  );

  // Lọc & phân trang các dòng vật tư trong form Lập / Sửa Phiếu Xuất
  const indexedFormItems = useMemo(() => {
    const q = formItemSearch.trim().toLowerCase();
    const out: { item: OutboundItemDetail; realIdx: number }[] = [];
    for (let i = 0; i < formItems.length; i++) {
      const it = formItems[i];
      if (q) {
        const hit =
          (it.materialCode || '').toLowerCase().includes(q) ||
          (it.materialName || '').toLowerCase().includes(q) ||
          (it.batchCode || '').toLowerCase().includes(q) ||
          (it.packageNo || '').toLowerCase().includes(q) ||
          (it.note || '').toLowerCase().includes(q);
        if (!hit) continue;
      }
      out.push({ item: it, realIdx: i });
    }
    return out;
  }, [formItems, formItemSearch]);

  const totalFormItemPages = Math.max(1, Math.ceil(indexedFormItems.length / FORM_ITEM_PAGE_SIZE));
  const safeFormItemPage = Math.min(formItemPage, totalFormItemPages);

  const visibleFormItems = useMemo(() => {
    const start = (safeFormItemPage - 1) * FORM_ITEM_PAGE_SIZE;
    return indexedFormItems.slice(start, start + FORM_ITEM_PAGE_SIZE);
  }, [indexedFormItems, safeFormItemPage]);

  const formTotals = useMemo(() => sumOutboundItems(formItems), [formItems]);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 border shadow-md animate-in slide-in-from-top-2 ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl shrink-0">
            <ArrowUpRight className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">
              Quản Lý Phiếu Xuất Kho (QN-OPR-PR11-FM06)
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">
              Lập & in Phiếu Xuất Kho chuẩn PTSC Quảng Ngãi QLVT theo Người nhận, Đơn vị/Tổ/Nhóm, Số PYC/PĐX, Mã lô & Khối lượng (Kg)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:flex sm:items-center gap-2 sm:gap-2.5 sm:flex-wrap w-full md:w-auto">
          {isAdmin && selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => setIsDeleteSelectedModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold text-xs shadow-md shadow-rose-600/20 transition active:scale-95 min-h-[42px]"
              title="Xóa các phiếu xuất kho đã đánh dấu chọn"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>Xóa Đã Chọn ({selectedIds.size.toLocaleString('vi-VN')})</span>
            </button>
          )}

          <button
            onClick={downloadOutboundTemplate}
            title="Tải tệp Excel mẫu chuẩn để chuẩn bị xuất kho"
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition min-h-[42px]"
          >
            <Download className="w-4 h-4 text-slate-500 shrink-0" />
            <span>Tải Mẫu Excel Xuất Kho</span>
          </button>

          <button
            type="button"
            onClick={handleExportAllOutboundExcel}
            title="Xuất danh sách phiếu xuất kho ra file Excel"
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-semibold text-xs shadow-xs transition active:scale-95 min-h-[42px]"
          >
            <Download className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Export ra Excel</span>
          </button>

          <button
            onClick={() => {
              if (!isAdmin && authorizedWarehouses.length === 0) {
                showToast('Tài khoản của bạn chưa được Admin phân quyền thao tác trên kho bãi nào.', 'error');
                return;
              }
              setIsExcelModalOpen(true);
            }}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-semibold text-xs shadow-md shadow-emerald-700/20 transition active:scale-95 min-h-[42px]"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Import Xuất Từ File Excel</span>
          </button>

          <button
            onClick={openCreateModal}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs shadow-md shadow-blue-500/20 transition active:scale-95 min-h-[42px]"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Lập Phiếu Xuất Kho Mới</span>
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
                ? 'Vui lòng nhấn nút "Đồng Bộ Cloud" trên thanh tiêu đề để tải danh mục kho và phiếu xuất kho mới nhất.'
                : 'Vui lòng liên hệ Admin để cấp quyền các kho bãi bạn được phép xem và thao tác.'}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo Số phiếu (PXK...), Người nhận, Đơn vị/Tổ/Nhóm, Số PYC/PĐX, Mã lô, Mã/Tên vật tư..."
            className="w-full pl-9 pr-4 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[42px]"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 sm:top-3" />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          <select
            value={filterWarehouse}
            onChange={(e) => setFilterWarehouse(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[40px]"
          >
            <option value="all">Tất cả kho xuất ({authorizedWarehouses.length})</option>
            {authorizedWarehouses.map((w) => (
              <option key={w.id} value={w.id} data-user-content="true">
                {w.name}
              </option>
            ))}
          </select>

          <div className="flex-1 sm:flex-initial flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs min-h-[40px]">
            <span className="text-slate-400 shrink-0">Từ:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-transparent text-slate-700 outline-none text-xs"
            />
          </div>

          <div className="flex-1 sm:flex-initial flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs min-h-[40px]">
            <span className="text-slate-400 shrink-0">Đến:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-transparent text-slate-700 outline-none text-xs"
            />
          </div>

          <div className="flex-1 sm:flex-initial flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs min-h-[40px]">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-slate-500 font-medium shrink-0">Sắp xếp:</span>
            <select
              value={`${sortField}_${sortOrder}`}
              onChange={(e) => {
                const [f, o] = e.target.value.split('_') as [ReceiptSortField, SortOrder];
                setSortField(f);
                setSortOrder(o);
                setCurrentPage(1);
              }}
              className="bg-transparent text-slate-800 font-semibold outline-none cursor-pointer text-xs"
            >
              <option value="date_desc">Ngày: Mới nhất trước (Mặc định)</option>
              <option value="date_asc">Ngày: Cũ nhất trước</option>
              <option value="code_desc">Số phiếu: Giảm dần (Z-A / 9-0)</option>
              <option value="code_asc">Số phiếu: Tăng dần (A-Z / 0-9)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Thanh thao tác chọn xóa nhiều phiếu xuất (chỉ hiển thị cho Admin khi có chọn checkbox) */}
      {isAdmin && selectedIds.size > 0 && (
        <div className="bg-blue-50/90 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="min-w-8 px-2 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs tabular-nums">
              {selectedIds.size.toLocaleString('vi-VN')}
            </div>
            <div>
              <div className="text-sm font-bold text-blue-950 flex flex-wrap items-center gap-1.5">
                <span>
                  Đã chọn {selectedIds.size.toLocaleString('vi-VN')} /{' '}
                  {receipts.length.toLocaleString('vi-VN')} phiếu xuất kho
                </span>
                <span aria-hidden="true" className="text-blue-400">
                  ·
                </span>
                <span className="text-xs font-medium text-blue-700">
                  {selectedIds.size === receipts.length
                    ? 'Đã chọn tất cả'
                    : `${filteredReceipts.length.toLocaleString('vi-VN')} kết quả lọc`}
                </span>
              </div>
              <div className="text-xs text-blue-700">
                Xóa các phiếu xuất kho đã đánh dấu sẽ tự động hoàn trả lại tồn kho tương ứng và đồng bộ trên toàn hệ thống.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            {filteredReceipts.length < receipts.length &&
              selectedIds.size < filteredReceipts.length && (
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="px-3 py-1.5 bg-white hover:bg-blue-100 text-blue-700 border border-blue-300 rounded-xl text-xs font-semibold transition min-h-[36px]"
                >
                  Chọn kết quả lọc ({filteredReceipts.length.toLocaleString('vi-VN')})
                </button>
              )}

            {selectedIds.size < receipts.length && (
              <button
                type="button"
                onClick={selectAllTotal}
                className="px-3 py-1.5 bg-white hover:bg-blue-100 text-blue-700 border border-blue-300 rounded-xl text-xs font-semibold transition min-h-[36px]"
              >
                Chọn tất cả ({receipts.length.toLocaleString('vi-VN')})
              </button>
            )}

            <button
              type="button"
              onClick={clearSelection}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition min-h-[36px]"
            >
              Bỏ chọn
            </button>

            <button
              type="button"
              onClick={() => setIsDeleteSelectedModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition active:scale-95 min-h-[36px]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa {selectedIds.size.toLocaleString('vi-VN')} phiếu đã chọn</span>
            </button>
          </div>
        </div>
      )}

      {/* Outbound Receipts Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider">
              <tr>
                {isAdmin && (
                  <th className="w-12 px-4 py-3.5 text-center">
                    <input
                      type="checkbox"
                      checked={isAllPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isSomePageSelected;
                      }}
                      onChange={toggleSelectCurrentPage}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                      title={
                        isAllPageSelected
                          ? 'Bỏ chọn các phiếu xuất trên trang này'
                          : 'Chọn tất cả các phiếu xuất trên trang này'
                      }
                    />
                  </th>
                )}
                <th className="px-5 py-3.5 select-none">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>Số Phiếu Xuất & Ngày</span>
                    <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-xs">
                      <button
                        type="button"
                        onClick={() => {
                          if (sortField === 'code') {
                            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                          } else {
                            setSortField('code');
                            setSortOrder('asc');
                          }
                          setCurrentPage(1);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[11px] font-medium inline-flex items-center gap-0.5 transition ${
                          sortField === 'code'
                            ? 'bg-blue-600 text-white font-bold'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                        title="Bấm để sắp xếp theo Số phiếu xuất"
                      >
                        <span>Số phiếu</span>
                        {sortField === 'code' ? (
                          sortOrder === 'asc' ? (
                            <ArrowUp className="w-3 h-3" />
                          ) : (
                            <ArrowDown className="w-3 h-3" />
                          )
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (sortField === 'date') {
                            setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                          } else {
                            setSortField('date');
                            setSortOrder('desc');
                          }
                          setCurrentPage(1);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[11px] font-medium inline-flex items-center gap-0.5 transition ${
                          sortField === 'date'
                            ? 'bg-blue-600 text-white font-bold'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                        title="Bấm để sắp xếp theo Ngày xuất"
                      >
                        <span>Ngày</span>
                        {sortField === 'date' ? (
                          sortOrder === 'desc' ? (
                            <ArrowDown className="w-3 h-3" />
                          ) : (
                            <ArrowUp className="w-3 h-3" />
                          )
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                        )}
                      </button>
                    </div>
                  </div>
                </th>
                <th className="px-5 py-3.5">Người Nhận & Đơn Vị/Tổ/Nhóm</th>
                <th className="px-5 py-3.5">Bộ Phận & Kho Xuất</th>
                <th className="px-5 py-3.5">Số PYC/PĐX & Lý Do Xuất</th>
                <th className="px-5 py-3.5 text-right">Tổng Số Lượng</th>
                <th className="px-5 py-3.5 text-right">Tổng Khối Lượng (Kg)</th>
                <th className="px-5 py-3.5 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedReceipts.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-6 py-12 text-center text-slate-400">
                    Chưa có phiếu xuất kho nào phù hợp điều kiện lọc.
                  </td>
                </tr>
              ) : (
                pagedReceipts.map((r) => {
                  const plDisplay =
                    r.packingListSummary || buildPackingListSummary(r.items.slice(0, 50));
                  const rowSums = sumOutboundItems(r.items);
                  const isRowSelected = isAdmin && selectedIds.has(r.id);
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-50/60 transition ${
                        isRowSelected ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      {isAdmin && (
                        <td className="w-12 px-4 py-4 text-center">
                          <input
                            type="checkbox"
                            checked={isRowSelected}
                            onChange={() => toggleSelectReceipt(r.id)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                            title={`Chọn phiếu xuất ${r.issueCode}`}
                          />
                        </td>
                      )}
                      <td className="px-5 py-4">
                        <div>
                          <span className="font-mono font-bold text-xs text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 inline-block mb-1" data-user-content="true">
                            {r.issueCode}
                          </span>
                          <div className="text-xs text-slate-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{formatVoucherDateVi(r.issueDate)}</span>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            {r.recipientName ? (
                              <span data-user-content="true">{r.recipientName}</span>
                            ) : (
                              <span>Chưa ghi tên</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600" data-user-content="true">{r.recipientDepartment}</div>
                          <div className="text-[11px] text-slate-400">
                            {r.outboundType === 'transfer'
                              ? 'Phiếu xuất điều chuyển'
                              : 'Phiếu xuất kho'}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {r.departmentName && r.departmentName !== 'DỰ ÁN LTIA-4.9' ? (
                          <div className="text-xs font-semibold text-slate-800" data-user-content="true">{r.departmentName}</div>
                        ) : (
                          <div className="text-xs font-medium text-slate-500">Bộ phận: —</div>
                        )}
                        <div className="text-[11px] text-slate-500">
                          <span>Kho:</span> <span data-user-content="true">{r.warehouseName}</span>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="text-xs space-y-0.5">
                          {r.requestNo ? (
                            <div className="font-mono font-semibold text-blue-700">
                              <span>PYC/PĐX:</span> <span data-user-content="true">{r.requestNo}</span>
                            </div>
                          ) : (
                            <div className="font-mono font-semibold text-blue-700 line-clamp-1" data-user-content="true">
                              {plDisplay}
                            </div>
                          )}
                          {r.notes && !r.notes.startsWith('Import thành công ') && (
                            <div className="text-xs text-slate-700 line-clamp-1" data-user-content="true">{r.notes}</div>
                          )}
                          <div className="text-[11px] text-slate-500">
                            ({r.items.length.toLocaleString('vi-VN')} mục hàng)
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="font-bold text-slate-900 font-mono text-sm tabular-nums">
                          {rowSums.totalQuantity.toLocaleString('vi-VN')}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right font-mono font-bold text-rose-700 tabular-nums">
                        {rowSums.totalWeightKg.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}{' '}
                        Kg
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openDetailModal(r)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition"
                            title="Xem chi tiết phiếu xuất kho"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setSelectedReceiptForPrint(r)}
                            className="p-1.5 text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
                            title="In Phiếu Xuất Kho (Mẫu QN-OPR-PR11-FM06)"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleExportReceiptExcel(r)}
                            className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg border border-emerald-200 transition"
                            title="Xuất phiếu xuất kho ra Excel (.xlsx)"
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => openEditModal(r)}
                              className="p-1.5 text-amber-700 hover:bg-amber-50 rounded-lg border border-amber-200 transition"
                              title="Sửa phiếu xuất kho (Admin)"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteReceipt(r)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition"
                              title="Xóa phiếu xuất kho"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          currentPage={currentPage}
          totalItems={filteredReceipts.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[25, 50, 100]}
          itemLabel="phiếu xuất"
        />
      </div>

      {/* Modal Lập / Chỉnh Sửa Phiếu Xuất Kho (Chuẩn QN-OPR-PR11-FM06) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4 lg:p-5 overscroll-contain">
          <ModalGuard
            title={
              editingReceipt
                ? `Chỉnh Sửa Phiếu Xuất Kho: ${editingReceipt.issueCode}`
                : 'Lập Phiếu Xuất Kho Mới'
            }
            onClose={() => {
              setIsCreateModalOpen(false);
              setEditingReceipt(null);
            }}
          />
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[96vw] 2xl:max-w-[1760px] max-h-[94dvh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`p-2 rounded-xl shrink-0 ${
                    editingReceipt ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {editingReceipt ? (
                    <Pencil className="w-5 h-5" />
                  ) : (
                    <ArrowUpRight className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                    {editingReceipt
                      ? `Chỉnh Sửa Phiếu Xuất Kho: ${editingReceipt.issueCode} (Mẫu QN-OPR-PR11-FM06)`
                      : 'Lập Phiếu Xuất Kho (Mẫu QN-OPR-PR11-FM06)'}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-1">
                    {editingReceipt
                      ? 'Quyền Quản trị viên (Admin) — Mọi thay đổi số lượng/khối lượng xuất sẽ tự động cập nhật tồn kho & đồng bộ thiết bị'
                      : 'CÔNG TY CỔ PHẦN DỊCH VỤ DẦU KHÍ QUẢNG NGÃI PTSC — Chọn từ tồn kho hoặc thêm dòng vật tư xuất'}
                  </p>
                </div>
              </div>
              <ModalCloseButton
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setEditingReceipt(null);
                }}
              />
            </div>

            <form onSubmit={handleSaveCreate} className="p-4 sm:p-6 space-y-4 overflow-y-auto overscroll-contain flex-1">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Thông tin đầu phiếu theo mẫu QN-OPR-PR11-FM06 */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <label className="block font-semibold text-slate-700 uppercase">
                        Số phiếu (*)
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const latest = StorageService.getOutboundReceipts().filter(
                            (r) => !editingReceipt || r.id !== editingReceipt.id
                          );
                          const activeWh =
                            warehouses.find((w) => w.id === selectedWarehouseId) || warehouses[0];
                          const normDate = formatExcelDate(issueDate) || issueDate;
                          if (editingReceipt) {
                            lastEditScopeRef.current = {
                              year: normDate.slice(0, 4),
                              whId: activeWh?.id || selectedWarehouseId || '',
                              date: normDate,
                              origWhId:
                                lastEditScopeRef.current?.origWhId ||
                                activeWh?.id ||
                                selectedWarehouseId ||
                                ''
                            };
                          }
                          setIsCodeManuallyEdited(false);
                          setIssueCode(generateNextPxkCode(latest, normDate, activeWh));
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 transition"
                        title="Tự động lấy số phiếu xuất kế tiếp theo kho và năm lập phiếu"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Số kế tiếp</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      value={issueCode}
                      onChange={(e) => {
                        setIsCodeManuallyEdited(true);
                        setIssueCode(e.target.value);
                      }}
                      placeholder={`PX-${deriveWarehouseAbbrev(warehouses.find((w) => w.id === selectedWarehouseId) || warehouses[0])}-${(issueDate || '').slice(0, 4) || new Date().getFullYear()}-0001`}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-rose-700 outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Ngày lập phiếu (*)
                    </label>
                    <input
                      type="date"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Bộ phận
                    </label>
                    <input
                      type="text"
                      value={formDepartmentName}
                      onChange={(e) => setFormDepartmentName(e.target.value)}
                      placeholder="Để trống sẽ in BỘ PHẬN:"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Kho xuất hàng (*)
                    </label>
                    <select
                      value={selectedWarehouseId}
                      onChange={(e) => setSelectedWarehouseId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                    >
                      {authorizedWarehouses.map((w) => (
                        <option key={w.id} value={w.id} data-user-content="true">
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Người nhận {!editingReceipt && '(*)'}
                    </label>
                    <input
                      type="text"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="Ví dụ: Nguyễn Văn Long"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold outline-none focus:border-blue-500"
                      required={!editingReceipt}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Đơn vị/Tổ/Nhóm {!editingReceipt && '(*)'}
                    </label>
                    <input
                      type="text"
                      value={recipientDepartment}
                      onChange={(e) => setRecipientDepartment(e.target.value)}
                      placeholder="Ví dụ: Tổ thi công"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                      required={!editingReceipt}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Số PYC/PĐX
                    </label>
                    <input
                      type="text"
                      value={formRequestNo}
                      onChange={(e) => setFormRequestNo(e.target.value)}
                      placeholder="Ví dụ: PYC25-0001"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div className="md:col-span-2">
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Lý do xuất kho
                    </label>
                    <input
                      type="text"
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Ví dụ: Phục vụ công tác thi công UG piping"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="flex items-center gap-4 py-1.5 px-3 bg-white rounded-lg border border-slate-300">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800">
                      <input
                        type="radio"
                        name="outboundType"
                        checked={formOutboundType === 'issue'}
                        onChange={() => setFormOutboundType('issue')}
                        className="text-blue-600"
                      />
                      <span>Phiếu xuất kho</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800">
                      <input
                        type="radio"
                        name="outboundType"
                        checked={formOutboundType === 'transfer'}
                        onChange={() => setFormOutboundType('transfer')}
                        className="text-blue-600"
                      />
                      <span>Xuất điều chuyển</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Danh sách 8 cột vật tư xuất theo mẫu PXK QLVT */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">
                      Chi Tiết Vật Tư Xuất Kho ({formItems.length.toLocaleString('vi-VN')} mục hàng)
                    </h4>
                    <p className="text-xs text-slate-500">
                      Tìm & chọn nhanh từ tồn kho bên dưới hoặc thêm dòng thủ công
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {formItems.length > 15 && (
                      <div className="relative">
                        <input
                          type="text"
                          value={formItemSearch}
                          onChange={(e) => {
                            setFormItemSearch(e.target.value);
                            setFormItemPage(1);
                          }}
                          placeholder="Lọc dòng vật tư..."
                          className="pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:bg-white focus:border-blue-500"
                        />
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={addManualItemRow}
                      className="flex items-center gap-1 px-3 py-2 sm:py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-semibold border border-slate-200 transition min-h-[38px]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm Dòng Thủ Công</span>
                    </button>
                  </div>
                </div>

                {/* Thanh tìm kiếm & chọn nhanh từ tồn kho trực tiếp */}
                <div className="relative bg-blue-50/70 p-2.5 rounded-xl border border-blue-200/80">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={quickStockQuery}
                        onFocus={() => setIsQuickStockOpen(true)}
                        onChange={(e) => {
                          setQuickStockQuery(e.target.value);
                          setIsQuickStockOpen(true);
                        }}
                        placeholder="🔍 Tìm nhanh vật tư từ Tồn kho (gõ Mã VT, Tên VT, Vị trí lưu kho/bãi, Mã lô / Số kiện, Packing List...)"
                        className="w-full pl-9 pr-9 py-2 bg-white border border-blue-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none shadow-xs"
                      />
                      <Search className="w-4 h-4 text-blue-600 absolute left-3 top-2.5" />
                      {quickStockQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setQuickStockQuery('');
                            setIsQuickStockOpen(false);
                          }}
                          className="p-1 hover:bg-slate-200 rounded absolute right-2.5 top-1.5 text-slate-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={openStockPicker}
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded-xl text-xs font-semibold shadow-xs transition whitespace-nowrap min-h-[36px]"
                    >
                      <Package className="w-3.5 h-3.5" />
                      <span>Chọn nhiều mục</span>
                    </button>
                  </div>

                  {/* Dropdown gợi ý tồn kho khả dụng */}
                  {isQuickStockOpen && (
                    <div className="absolute left-2.5 right-2.5 top-full mt-1.5 bg-white rounded-xl shadow-2xl border border-slate-200 z-30 max-h-80 overflow-y-auto animate-in fade-in slide-in-from-top-1">
                      <div className="p-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-600 font-semibold sticky top-0 bg-slate-50/95 backdrop-blur-xs z-10">
                        <span>
                          Gợi ý tồn kho khả dụng ({quickStockSuggestions.length} kết quả
                          {quickStockQuery ? ` cho "${quickStockQuery}"` : ''})
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsQuickStockOpen(false)}
                          className="text-slate-400 hover:text-slate-700 p-1 rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {quickStockSuggestions.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          {quickStockQuery
                            ? `Không tìm thấy vật tư nào trong tồn kho khớp với từ khóa "${quickStockQuery}".`
                            : 'Không có mặt hàng tồn kho khả dụng nào trong kho này.'}
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {quickStockSuggestions.map((st) => {
                            const isAdded = formItems.some(
                              (it) => getStockItemMatchKey(it) === getStockItemMatchKey(st)
                            );
                            return (
                              <div
                                key={st.id}
                                onClick={() => {
                                  selectSingleStockItem(st, false);
                                  setIsQuickStockOpen(false);
                                }}
                                className={`p-3 hover:bg-blue-50/70 cursor-pointer transition flex items-center justify-between gap-3 text-xs ${
                                  isAdded ? 'bg-blue-50/30' : ''
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-mono font-bold text-blue-700 text-xs" data-user-content="true">
                                      {st.materialCode}
                                    </span>
                                    {st.packageNo && st.packageNo !== 'N/A' && (
                                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-mono font-semibold">
                                        <span>Kiện:</span> <span data-user-content="true">{st.packageNo}</span>
                                      </span>
                                    )}
                                    {st.packingListNo && st.packingListNo !== 'N/A' && (
                                      <span className="text-slate-400 text-[10px] font-mono">
                                        PL: <span data-user-content="true">{st.packingListNo}</span>
                                      </span>
                                    )}
                                    {isAdded && (
                                      <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold">
                                        ✓ Đã có trong phiếu
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-slate-800 font-semibold truncate mt-1" data-user-content="true">
                                    {st.materialName}
                                  </div>
                                  <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                                    <span>
                                      <span>Kho:</span>{' '}
                                      {st.warehouseName ? (
                                        <span data-user-content="true">{st.warehouseName}</span>
                                      ) : (
                                        <span>Hiện tại</span>
                                      )}
                                    </span>
                                    {st.storageLocation && (
                                      <>
                                        <span>•</span>
                                        <span className="text-emerald-700 font-semibold">
                                          <span>Vị trí:</span> <span data-user-content="true">{st.storageLocation}</span>
                                        </span>
                                      </>
                                    )}
                                    <span>•</span>
                                    <span>
                                      <span>ĐVT:</span> <span data-user-content="true">{st.unit}</span>
                                    </span>
                                    {st.drawingNo && st.drawingNo !== 'N/A' && (
                                      <>
                                        <span>•</span>
                                        <span className="font-mono text-[10px]">
                                          <span>Bản vẽ:</span> <span data-user-content="true">{st.drawingNo}</span>
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="font-bold text-slate-900 font-mono text-sm tabular-nums">
                                    {st.currentQuantity.toLocaleString('vi-VN')}{' '}
                                    <span data-user-content="true">{st.unit}</span>
                                  </div>
                                  <div className="text-[11px] font-mono text-emerald-700 tabular-nums">
                                    {st.currentWeightKg.toLocaleString('en-US', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2
                                    })}{' '}
                                    kg
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      selectSingleStockItem(st, false);
                                      setIsQuickStockOpen(false);
                                    }}
                                    className="mt-1.5 px-2.5 py-1 rounded-lg font-bold text-[11px] transition shadow-xs inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>{isAdded ? '+ Thêm dòng' : '+ Chọn xuất'}</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[1200px]">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-2 w-11 text-center">STT</th>
                        <th className="p-2 min-w-[220px]">Mã vật tư</th>
                        <th className="p-2 min-w-[320px]">Tên vật tư (*)</th>
                        <th className="p-2 min-w-[200px]">Mã lô / Số kiện</th>
                        <th className="p-2 min-w-[130px] text-right">Số lượng (cây/tấm)</th>
                        <th className="p-2 min-w-[90px] text-center">ĐVT</th>
                        <th className="p-2 min-w-[140px] text-right">Khối lượng (Kg)</th>
                        <th className="p-2 min-w-[210px]">Ghi chú</th>
                        <th className="p-2 w-14 text-center sticky right-0 bg-slate-100 z-10 shadow-[-2px_0_4px_rgba(0,0,0,0.06)] border-l border-slate-200">
                          Xóa
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formItems.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-400">
                            Chưa có vật tư xuất. Bấm <strong>"Chọn Từ Tồn Kho Hiện Tại"</strong> hoặc{' '}
                            <strong>"Thêm Dòng Thủ Công"</strong> để lập phiếu xuất kho.
                          </td>
                        </tr>
                      ) : visibleFormItems.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-6 text-center text-slate-400">
                            Không có dòng vật tư nào khớp từ khóa lọc.
                          </td>
                        </tr>
                      ) : (
                        visibleFormItems.map(({ item, realIdx }) => (
                          <tr key={item.id || realIdx} className="hover:bg-slate-50/70">
                            <td className="p-2 text-center text-slate-500 font-mono">
                              {realIdx + 1}
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={item.materialCode}
                                onChange={(e) =>
                                  updateItemRow(realIdx, 'materialCode', e.target.value)
                                }
                                placeholder="PI-P.AA.S..."
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono outline-none text-xs"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={item.materialName}
                                onChange={(e) =>
                                  updateItemRow(realIdx, 'materialName', e.target.value)
                                }
                                placeholder='20"x12m PIPE, API 5L B...'
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-medium outline-none text-xs"
                              />
                              {item.packingListNo && item.packingListNo !== 'N/A' && (
                                <span className="text-[10px] text-slate-400 font-mono block mt-0.5 truncate">
                                  PL: {item.packingListNo}
                                  {item.shipment && item.shipment !== 'N/A' ? ` • Sh: ${item.shipment}` : ''}
                                </span>
                              )}
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={item.batchCode ?? item.packageNo ?? ''}
                                onChange={(e) =>
                                  updateItemRow(realIdx, 'batchCode', e.target.value)
                                }
                                placeholder="76C-061.35"
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono outline-none text-xs"
                              />
                              {item.packageNo && item.packageNo !== 'N/A' && item.batchCode !== item.packageNo && (
                                <span className="text-[10px] text-slate-400 font-mono block mt-0.5 truncate">
                                  <span>Kiện:</span> <span data-user-content="true">{item.packageNo}</span>
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={item.quantity === 0 ? '' : item.quantity}
                                placeholder="0"
                                onChange={(e) =>
                                  updateItemRow(
                                    realIdx,
                                    'quantity',
                                    e.target.value === '' ? 0 : roundQty(e.target.value)
                                  )
                                }
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-right font-bold outline-none text-xs tabular-nums"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <input
                                type="text"
                                value={item.unit}
                                onChange={(e) => updateItemRow(realIdx, 'unit', e.target.value)}
                                placeholder="Ống"
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-center outline-none text-xs"
                              />
                            </td>
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.weightKg === 0 ? '' : item.weightKg}
                                placeholder="0"
                                onChange={(e) =>
                                  updateItemRow(
                                    realIdx,
                                    'weightKg',
                                    e.target.value === '' ? 0 : Number(e.target.value)
                                  )
                                }
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-right font-mono font-medium outline-none text-xs tabular-nums"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={item.note ?? item.purpose ?? ''}
                                onChange={(e) => updateItemRow(realIdx, 'note', e.target.value)}
                                placeholder="Ghi chú..."
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded outline-none text-xs"
                              />
                            </td>
                            <td className="p-2 text-center sticky right-0 bg-white/95 backdrop-blur-[2px] z-10 shadow-[-2px_0_4px_rgba(0,0,0,0.06)] border-l border-slate-100">
                              <button
                                type="button"
                                onClick={() => removeItemRow(realIdx)}
                                className="p-1.5 text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 rounded-lg transition inline-flex items-center justify-center shadow-xs"
                                title={`Xóa dòng vật tư ${realIdx + 1}`}
                                aria-label={`Xóa dòng vật tư ${realIdx + 1}`}
                              >
                                <Trash2 className="w-4 h-4 text-rose-600" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                  {totalFormItemPages > 1 && (
                    <PaginationBar
                      currentPage={safeFormItemPage}
                      totalItems={indexedFormItems.length}
                      pageSize={FORM_ITEM_PAGE_SIZE}
                      onPageChange={setFormItemPage}
                      itemLabel="dòng vật tư"
                    />
                  )}
                </div>

                {formItems.length > 0 && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-xs font-semibold">
                    <span>TỔNG CỘNG: {formItems.length.toLocaleString('vi-VN')} mục hàng</span>
                    <div className="flex flex-wrap gap-4">
                      <span>
                        Tổng số lượng xuất:{' '}
                        <strong className="text-rose-700 tabular-nums">
                          {formTotals.totalQuantity.toLocaleString('vi-VN')}
                        </strong>
                      </span>
                      <span>
                        Tổng khối lượng xuất:{' '}
                        <strong className="text-rose-700 tabular-nums">
                          {formTotals.totalWeightKg.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}{' '}
                          Kg
                        </strong>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className={`flex-1 py-2.5 text-white font-semibold text-sm rounded-xl transition shadow-md ${
                    editingReceipt
                      ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                      : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                  }`}
                >
                  {editingReceipt ? 'Lưu Cập Nhật Phiếu Xuất Kho' : 'Lưu Phiếu Xuất Kho'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setEditingReceipt(null);
                  }}
                  className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Chọn Từ Tồn Kho (Phân trang mượt cho 100.000+ bản ghi, tích chọn nhanh bằng Checkbox) */}
      {isPickStockOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4 overscroll-contain">
          <ModalGuard
            title="Chọn Hàng Hóa Từ Tồn Kho Khả Dụng"
            priority={60}
            onClose={() => setIsPickStockOpen(false)}
          />
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[95vw] 2xl:max-w-[1680px] max-h-[92dvh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-3.5 sm:p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                  Chọn Hàng Hóa Từ Tồn Kho Khả Dụng
                </h4>
                <p className="text-xs text-slate-500 line-clamp-1">
                  Tích chọn nhanh nhiều vật tư cần xuất kho — Tìm theo Mã vật tư, Tên vật tư, Mã lô / Số kiện, Packing List
                </p>
              </div>
              <ModalCloseButton onClick={() => setIsPickStockOpen(false)} />
            </div>

            <div className="p-3.5 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={stockSearch}
                  onChange={(e) => {
                    setStockSearch(e.target.value);
                    setStockPage(1);
                  }}
                  placeholder="Gõ tìm nhanh Mã vật tư, Tên vật tư, Vị trí lưu kho/bãi, Mã lô / Số kiện, Packing List..."
                  className="w-full pl-9 pr-4 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 sm:top-2.5" />
              </div>
              <div className="w-full sm:w-72">
                <select
                  value={stockPickerWarehouseFilter}
                  onChange={(e) => {
                    setStockPickerWarehouseFilter(e.target.value);
                    setStockPage(1);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="all">
                    {isAdmin
                      ? '🌐 Tất cả các kho'
                      : `Tất cả kho được phép (${authorizedWarehouses.length})`}
                  </option>
                  {authorizedWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      Kho: {w.name} {w.id === selectedWarehouseId ? ' (Đang chọn)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 overflow-y-auto overscroll-contain flex-1">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-[58dvh] overflow-x-auto overflow-y-auto overscroll-contain">
                  <table className="w-full min-w-[1080px] text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="p-3 whitespace-nowrap min-w-[140px]">Mã Vật Tư</th>
                        <th className="p-3 min-w-[280px]">Tên Vật Tư</th>
                        <th className="p-3 whitespace-nowrap min-w-[160px]">Mã Lô / Số Kiện</th>
                        <th className="p-3 whitespace-nowrap min-w-[170px]">Packing List / Shipment</th>
                        <th className="p-3 min-w-[170px]">Kho hàng</th>
                        <th className="p-3 text-right whitespace-nowrap w-24">Tồn SL</th>
                        <th className="p-3 text-right whitespace-nowrap w-28">Tồn KL (Kg)</th>
                        <th className="p-3 w-20 text-center whitespace-nowrap">
                          <label
                            className="inline-flex items-center justify-center gap-1.5 cursor-pointer select-none"
                            title={
                              isAllStockPageSelected
                                ? 'Bỏ chọn tất cả vật tư trên trang này'
                                : 'Chọn tất cả vật tư trên trang này'
                            }
                          >
                            <input
                              type="checkbox"
                              checked={isAllStockPageSelected}
                              disabled={pagedStockForPicker.length === 0}
                              ref={(el) => {
                                if (el) el.indeterminate = isSomeStockPageSelected;
                              }}
                              onChange={toggleSelectStockPage}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer disabled:opacity-40"
                            />
                            <span>Chọn</span>
                          </label>
                        </th>
                        <th className="p-3 w-28 text-center whitespace-nowrap">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedStockForPicker.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-400">
                            Không tìm thấy mặt hàng tồn kho nào phù hợp.
                          </td>
                        </tr>
                      ) : (
                        pagedStockForPicker.map((st) => {
                          const isChecked = selectedStockKeySet.has(getStockItemMatchKey(st));
                          return (
                            <tr
                              key={st.id}
                              onDoubleClick={() => selectSingleStockItem(st, true)}
                              onClick={() => toggleStockItemSelection(st)}
                              className={`cursor-pointer select-none transition-colors ${
                                isChecked
                                  ? 'bg-blue-50/70 hover:bg-blue-100/60'
                                  : 'hover:bg-slate-50'
                              }`}
                              title="Bấm 'Chọn' hoặc Nhấp đúp chuột để đưa ngay vào phiếu xuất"
                            >
                              <td className="p-3 font-mono font-bold text-blue-700 whitespace-nowrap" data-user-content="true">
                                {st.materialCode}
                              </td>
                              <td className="p-3">
                                <span className="font-semibold text-slate-900 block leading-snug" data-user-content="true">
                                  {st.materialName}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  <span>ĐVT:</span> <span data-user-content="true">{st.unit}</span>
                                </span>
                              </td>
                              <td className="p-3 font-mono font-semibold text-slate-800 break-words" data-user-content="true">
                                {st.packageNo}
                              </td>
                              <td className="p-3">
                                <span className="font-mono text-slate-700 block" data-user-content="true">
                                  {st.packingListNo}
                                </span>
                                <span className="font-mono text-slate-400 text-[11px]" data-user-content="true">
                                  {st.shipment}
                                </span>
                              </td>
                              <td className="p-3">
                                <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded inline-block">
                                  {st.warehouseName ? (
                                    <span data-user-content="true">{st.warehouseName}</span>
                                  ) : (
                                    <span>Kho hiện tại</span>
                                  )}
                                </span>
                                {st.storageLocation && (
                                  <span className="block mt-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                    <span>Vị trí:</span> <span data-user-content="true">{st.storageLocation}</span>
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-right font-bold text-slate-900 font-mono tabular-nums whitespace-nowrap">
                                {st.currentQuantity.toLocaleString('vi-VN')}
                              </td>
                              <td className="p-3 text-right font-mono font-medium text-emerald-700 tabular-nums whitespace-nowrap">
                                {st.currentWeightKg.toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                })}
                              </td>
                              <td
                                className="p-2.5 text-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleStockItemSelection(st)}
                                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                                  title={
                                    isChecked
                                      ? `Bỏ chọn vật tư ${st.materialCode}`
                                      : `Chọn xuất kho vật tư ${st.materialCode}`
                                  }
                                />
                              </td>
                              <td
                                className="p-2.5 text-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => selectSingleStockItem(st, true)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition shadow-xs inline-flex items-center gap-1 ${
                                    isChecked
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                                  }`}
                                  title="Đưa ngay vào phiếu xuất và đóng hộp thoại"
                                >
                                  {isChecked ? (
                                    <>
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Đã chọn</span>
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>Chọn</span>
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <PaginationBar
                  currentPage={stockPage}
                  totalItems={availableStockForPicker.length}
                  pageSize={stockPageSize}
                  onPageChange={setStockPage}
                  onPageSizeChange={setStockPageSize}
                  pageSizeOptions={[50, 100, 200]}
                  itemLabel="mặt hàng tồn"
                />
              </div>
            </div>

            <div className="p-3.5 sm:p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="text-xs text-slate-600 flex flex-wrap items-center gap-1.5">
                <span>
                  Đã chọn trong phiếu xuất:{' '}
                  <strong className="text-blue-700 font-bold tabular-nums">
                    {formItems.length.toLocaleString('vi-VN')}
                  </strong>{' '}
                  mục hàng
                </span>
                {availableStockForPicker.length > 0 && (
                  <span className="text-slate-400">
                    ({selectedFilteredStockCount.toLocaleString('vi-VN')}/
                    {availableStockForPicker.length.toLocaleString('vi-VN')} mục khả dụng đang hiển thị)
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {availableStockForPicker.length > pagedStockForPicker.length &&
                  selectedFilteredStockCount < availableStockForPicker.length && (
                    <button
                      type="button"
                      onClick={selectAllFilteredStock}
                      className="px-3 py-2 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold transition min-h-[38px]"
                    >
                      Chọn hết {availableStockForPicker.length.toLocaleString('vi-VN')} kết quả lọc
                    </button>
                  )}

                {selectedFilteredStockCount > 0 && (
                  <button
                    type="button"
                    onClick={clearSelectedFilteredStock}
                    className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition min-h-[38px]"
                  >
                    Bỏ chọn ({selectedFilteredStockCount.toLocaleString('vi-VN')})
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsPickStockOpen(false);
                    setFormItemSearch('');
                    if (formItems.length > 0) {
                      setFormItemPage(Math.max(1, Math.ceil(formItems.length / FORM_ITEM_PAGE_SIZE)));
                      showToast(`Đã cập nhật ${formItems.length.toLocaleString('vi-VN')} mục vào phiếu xuất kho!`);
                    }
                  }}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-blue-500/20 transition active:scale-95 min-h-[38px]"
                >
                  Xong ({formItems.length.toLocaleString('vi-VN')} mục)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xem Chi Tiết Phiếu Xuất (Phân trang mượt cho phiếu >100.000 dòng) */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4 overscroll-contain">
          <ModalGuard
            title={`Chi Tiết Phiếu Xuất Kho: ${viewingReceipt.issueCode}`}
            onClose={() => setViewingReceipt(null)}
          />
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92dvh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex flex-wrap items-center justify-between gap-2.5 flex-1 min-w-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
                    <Eye className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                      Phiếu Xuất Kho: {viewingReceipt.issueCode}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-1">
                      <span>Ngày:</span> <span>{formatVoucherDateVi(viewingReceipt.issueDate)}</span> |{' '}
                      <span>Kho:</span> <span data-user-content="true">{viewingReceipt.warehouseName}</span> |{' '}
                      <span>{viewingReceipt.items.length.toLocaleString('vi-VN')} mục hàng</span> |{' '}
                      <span>Tổng SL:</span>{' '}
                      <strong className="text-rose-700 font-mono">
                        {viewingReceiptTotals.totalQuantity.toLocaleString('vi-VN')}
                      </strong>
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleExportReceiptExcel(viewingReceipt)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition min-h-[36px]"
                    title="Xuất phiếu xuất kho ra Excel (.xlsx)"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Xuất Excel</span>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedReceiptForPrint(viewingReceipt);
                      setViewingReceipt(null);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition min-h-[36px]"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Xem & In Phiếu (FM06)</span>
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => {
                        const target = viewingReceipt;
                        setViewingReceipt(null);
                        openEditModal(target);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold transition min-h-[36px]"
                      title="Sửa phiếu xuất kho này (Admin)"
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Sửa Phiếu</span>
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => {
                        const toDelete = viewingReceipt;
                        setViewingReceipt(null);
                        setReceiptToDelete(toDelete);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition min-h-[36px]"
                      title="Xóa phiếu xuất kho này"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Xóa Phiếu</span>
                    </button>
                  )}
                </div>
              </div>
              <ModalCloseButton onClick={() => setViewingReceipt(null)} />
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain space-y-4 flex-1">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-50 p-3.5 sm:p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block">Bộ phận:</span>
                  <span className="font-bold text-slate-900" data-user-content="true">
                    {viewingReceipt.departmentName && viewingReceipt.departmentName !== 'DỰ ÁN LTIA-4.9'
                      ? viewingReceipt.departmentName
                      : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Người nhận:</span>
                  <span className="font-bold text-slate-900" data-user-content="true">{viewingReceipt.recipientName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Đơn vị/Tổ/Nhóm:</span>
                  <span className="font-semibold text-slate-900" data-user-content="true">
                    {viewingReceipt.recipientDepartment}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Số PYC/PĐX:</span>
                  <span className="font-mono font-semibold text-blue-700" data-user-content="true">
                    {viewingReceipt.requestNo || '-'}
                  </span>
                </div>
                <div className="col-span-2 md:col-span-3">
                  <span className="text-slate-400 block">Lý do xuất kho:</span>
                  <span className="font-medium text-slate-800" data-user-content="true">
                    {viewingReceipt.notes || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Loại phiếu:</span>
                  <span className="font-semibold text-rose-700">
                    {viewingReceipt.outboundType === 'transfer'
                      ? 'Phiếu xuất điều chuyển'
                      : 'Phiếu xuất kho'}
                  </span>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={detailSearch}
                  onChange={(e) => {
                    setDetailSearch(e.target.value);
                    setDetailPage(1);
                  }}
                  placeholder="Tìm nhanh Mã vật tư, Tên vật tư, Mã lô trong phiếu xuất..."
                  className="w-full pl-9 pr-4 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 sm:top-2.5" />
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-96 overflow-x-auto overflow-y-auto">
                  <table className="w-full min-w-[740px] text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="p-2.5 w-12 text-center">STT</th>
                        <th className="p-2.5">Mã Vật Tư</th>
                        <th className="p-2.5">Tên Vật Tư</th>
                        <th className="p-2.5 text-center">Mã Lô</th>
                        <th className="p-2.5 text-right">Số Lượng</th>
                        <th className="p-2.5 text-center">ĐVT</th>
                        <th className="p-2.5 text-right">Khối Lượng (Kg)</th>
                        <th className="p-2.5">Ghi Chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedDetailItems.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400">
                            Không tìm thấy mặt hàng phù hợp từ khóa.
                          </td>
                        </tr>
                      ) : (
                        pagedDetailItems.map((it, idx) => {
                          const globalIdx = (detailPage - 1) * detailPageSize + idx;
                          const batchText =
                            it.batchCode ||
                            (it.packageNo && it.packageNo !== 'N/A' ? it.packageNo : '');
                          return (
                            <tr key={it.id || globalIdx} className="hover:bg-slate-50">
                              <td className="p-2.5 text-center font-mono text-slate-400">
                                {(globalIdx + 1).toLocaleString('vi-VN')}
                              </td>
                              <td className="p-2.5 font-mono font-semibold text-blue-700" data-user-content="true">
                                {it.materialCode}
                              </td>
                              <td className="p-2.5 font-medium text-slate-900" data-user-content="true">
                                {it.materialName}
                              </td>
                              <td className="p-2.5 text-center font-mono text-slate-800" data-user-content="true">
                                {batchText}
                              </td>
                              <td className="p-2.5 text-right font-bold font-mono text-slate-900 tabular-nums">
                                {roundQty(it.quantity) > 0
                                  ? roundQty(it.quantity).toLocaleString('vi-VN')
                                  : '-'}
                              </td>
                              <td className="p-2.5 text-center" data-user-content="true">{it.unit}</td>
                              <td className="p-2.5 text-right font-bold font-mono text-rose-700 tabular-nums">
                                {Number(it.weightKg || 0).toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                })}
                              </td>
                              <td className="p-2.5 text-[11px] text-slate-600" data-user-content="true">
                                {it.note ?? it.purpose ?? ''}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                      <tr>
                        <td></td>
                        <td className="p-2.5 text-center uppercase whitespace-nowrap">
                          {deferredDetailSearch.trim() ? 'TỔNG CỘNG (LỌC)' : 'TỔNG CỘNG'}
                        </td>
                        <td></td>
                        <td></td>
                        <td className="p-2.5 text-right text-blue-700 font-mono tabular-nums">
                          {detailTotals.totalQuantity > 0
                            ? detailTotals.totalQuantity.toLocaleString('vi-VN')
                            : '-'}
                        </td>
                        <td></td>
                        <td className="p-2.5 text-right text-rose-700 font-mono tabular-nums">
                          {detailTotals.totalWeightKg.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <PaginationBar
                  currentPage={detailPage}
                  totalItems={filteredDetailItems.length}
                  pageSize={detailPageSize}
                  onPageChange={setDetailPage}
                  onPageSizeChange={setDetailPageSize}
                  pageSizeOptions={[50, 100, 200]}
                  itemLabel="mục hàng"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Import Excel */}
      <ExcelImportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        type="outbound"
        warehouses={authorizedWarehouses}
        onImportSuccess={handleExcelImportSuccess}
      />

      {/* Modal In Phiếu */}
      <ReceiptPrintModal
        isOpen={Boolean(selectedReceiptForPrint)}
        onClose={() => setSelectedReceiptForPrint(null)}
        outbound={selectedReceiptForPrint}
      />

      {/* Modal Xác Nhận Xóa 1 Phiếu Xuất */}
      <ConfirmDeleteModal
        isOpen={Boolean(receiptToDelete)}
        onClose={() => setReceiptToDelete(null)}
        onConfirm={confirmDeleteOutbound}
        title="Xác Nhận Xóa Phiếu Xuất Kho"
        itemName={
          receiptToDelete
            ? `Phiếu ${receiptToDelete.issueCode} (${receiptToDelete.recipientName || receiptToDelete.recipientDepartment})`
            : ''
        }
        itemType="phiếu xuất kho"
        warningText="Xóa phiếu xuất kho sẽ tự động hoàn trả lại số lượng và khối lượng tồn kho cho các kiện hàng liên quan. Bạn có chắc chắn muốn xóa không?"
      />

      {/* Modal Xác Nhận Xóa Nhiều Phiếu Xuất Đã Chọn */}
      <ConfirmDeleteModal
        isOpen={isDeleteSelectedModalOpen}
        onClose={() => setIsDeleteSelectedModalOpen(false)}
        onConfirm={confirmDeleteSelectedOutbound}
        title="Xác Nhận Xóa Nhiều Phiếu Xuất Kho"
        itemName={`${selectedIds.size.toLocaleString('vi-VN')} phiếu xuất đã chọn (${selectedReceiptsSummary})`}
        itemType="danh sách phiếu xuất kho"
        warningText="Toàn bộ các phiếu xuất kho đã đánh dấu sẽ bị xóa vĩnh viễn và tự động hoàn trả lại số lượng, khối lượng tồn kho cho các mặt hàng liên quan trên toàn hệ thống."
      />
    </div>
  );
};
