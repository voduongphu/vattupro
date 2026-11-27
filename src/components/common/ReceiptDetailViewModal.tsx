import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Clock, Eye, FileSpreadsheet, Printer, Search } from 'lucide-react';
import {
  InboundItemDetail,
  InboundReceipt,
  OutboundReceipt,
  User
} from '../../types/inventory';
import { roundQty, sumInboundItems, sumOutboundItems } from '../../utils/additiveMerge';
import { buildVoucherLastModifiedSummary } from '../../utils/voucherAudit';
import {
  exportInboundReceiptToExcel,
  exportOutboundReceiptToExcel,
  formatVoucherDateVi
} from '../../services/excelService';
import { ModalCloseButton, ModalGuard } from '../../context/ModalContext';
import { PaginationBar } from './PaginationBar';

interface ReceiptDetailViewModalProps {
  inbound?: InboundReceipt | null;
  outbound?: OutboundReceipt | null;
  users: User[];
  onClose: () => void;
  onPrint?: (target: { inbound?: InboundReceipt; outbound?: OutboundReceipt }) => void;
}

function summarizeStorageLocations(items: InboundItemDetail[]): string {
  const seen = new Set<string>();
  const list: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const raw = (items[i].storageLocation || '').trim();
    if (!raw || raw.toUpperCase() === 'N/A') continue;
    const key = raw.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      list.push(raw);
    }
  }
  return list.join(', ');
}

export const ReceiptDetailViewModal: React.FC<ReceiptDetailViewModalProps> = ({
  inbound,
  outbound,
  users,
  onClose,
  onPrint
}) => {
  const [detailSearch, setDetailSearch] = useState('');
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(50);
  const deferredSearch = useDeferredValue(detailSearch);

  const activeReceiptId = inbound?.id || outbound?.id || '';

  useEffect(() => {
    setDetailSearch('');
    setDetailPage(1);
  }, [activeReceiptId]);

  const isInbound = Boolean(inbound);

  const inboundTotals = useMemo(
    () => (inbound ? sumInboundItems(Array.isArray(inbound.items) ? inbound.items : []) : null),
    [inbound]
  );

  const outboundTotals = useMemo(
    () => (outbound ? sumOutboundItems(Array.isArray(outbound.items) ? outbound.items : []) : null),
    [outbound]
  );

  const auditInfo = useMemo(() => {
    const r = inbound || outbound;
    if (!r) return null;
    return buildVoucherLastModifiedSummary({
      lastEditedBy: r.lastEditedBy,
      lastEditedAt: r.lastEditedAt,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      users
    });
  }, [inbound, outbound, users]);

  const filteredInboundItems = useMemo(() => {
    if (!inbound) return [];
    const items = Array.isArray(inbound.items) ? inbound.items : [];
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        (it.materialCode || '').toLowerCase().includes(q) ||
        (it.materialName || '').toLowerCase().includes(q) ||
        (it.packageNo || '').toLowerCase().includes(q) ||
        (it.batchCode || '').toLowerCase().includes(q) ||
        (it.drawingNo || '').toLowerCase().includes(q) ||
        (it.storageLocation || '').toLowerCase().includes(q) ||
        (it.note || it.conditionNote || '').toLowerCase().includes(q)
    );
  }, [inbound, deferredSearch]);

  const filteredOutboundItems = useMemo(() => {
    if (!outbound) return [];
    const items = Array.isArray(outbound.items) ? outbound.items : [];
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        (it.materialCode || '').toLowerCase().includes(q) ||
        (it.materialName || '').toLowerCase().includes(q) ||
        (it.batchCode || '').toLowerCase().includes(q) ||
        (it.drawingNo || '').toLowerCase().includes(q) ||
        (it.packageNo || '').toLowerCase().includes(q) ||
        (it.note || it.purpose || '').toLowerCase().includes(q)
    );
  }, [outbound, deferredSearch]);

  const filteredInboundTotals = useMemo(
    () => sumInboundItems(filteredInboundItems),
    [filteredInboundItems]
  );

  const filteredOutboundTotals = useMemo(
    () => sumOutboundItems(filteredOutboundItems),
    [filteredOutboundItems]
  );

  const totalItemsCount = isInbound ? filteredInboundItems.length : filteredOutboundItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItemsCount / detailPageSize));
  const safePage = Math.min(detailPage, totalPages);
  const startIdx = (safePage - 1) * detailPageSize;

  const pagedInboundItems = useMemo(
    () => filteredInboundItems.slice(startIdx, startIdx + detailPageSize),
    [filteredInboundItems, startIdx, detailPageSize]
  );

  const pagedOutboundItems = useMemo(
    () => filteredOutboundItems.slice(startIdx, startIdx + detailPageSize),
    [filteredOutboundItems, startIdx, detailPageSize]
  );

  if (!inbound && !outbound) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4 overscroll-contain">
      <ModalGuard
        title={
          inbound
            ? `Chi Tiết Phiếu Nhập Kho: ${inbound.receiptCode}`
            : `Chi Tiết Phiếu Xuất Kho: ${outbound!.issueCode}`
        }
        onClose={onClose}
      />

      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[92vw] 2xl:max-w-[1620px] max-h-[91dvh] flex flex-col overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50 space-y-3 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
                <Eye className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                  {inbound
                    ? `Phiếu Nhập Kho: ${inbound.receiptCode}`
                    : `Phiếu Xuất Kho: ${outbound!.issueCode}`}
                </h3>
                <p className="text-xs text-slate-500 line-clamp-1">
                  <span>Ngày:</span>{' '}
                  <span>
                    {formatVoucherDateVi(inbound ? inbound.receiptDate : outbound!.issueDate)}
                  </span>{' '}
                  | <span>Kho:</span>{' '}
                  <span data-user-content="true">
                    {inbound ? inbound.warehouseName : outbound!.warehouseName}
                  </span>{' '}
                  |{' '}
                  <span>
                    {(inbound ? inbound.items : outbound!.items).length.toLocaleString('vi-VN')} mục hàng
                  </span>{' '}
                  | <span>Tổng SL:</span>{' '}
                  <strong
                    className={`font-mono ${inbound ? 'text-blue-700' : 'text-rose-700'}`}
                  >
                    {(inbound
                      ? inboundTotals!.totalQuantity
                      : outboundTotals!.totalQuantity
                    ).toLocaleString('vi-VN')}
                  </strong>
                </p>
              </div>
            </div>
            <ModalCloseButton onClick={onClose} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (inbound) {
                  exportInboundReceiptToExcel(inbound);
                } else if (outbound) {
                  exportOutboundReceiptToExcel(outbound);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 h-[36px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition whitespace-nowrap"
              title={
                inbound
                  ? 'Xuất phiếu nhập kho ra Excel (.xlsx)'
                  : 'Xuất phiếu xuất kho ra Excel (.xlsx)'
              }
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span>Xuất Excel</span>
            </button>

            {onPrint && (
              <button
                type="button"
                onClick={() => {
                  onPrint(inbound ? { inbound } : { outbound: outbound! });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 h-[36px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition whitespace-nowrap"
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>
                  {inbound ? 'Xem & In Phiếu (FM05.01)' : 'Xem & In Phiếu (FM06)'}
                </span>
              </button>
            )}

            {auditInfo && (
              <div
                className="flex items-center gap-1.5 px-3 min-h-[36px] sm:h-[36px] py-1.5 sm:py-0 rounded-lg bg-amber-50/80 border border-amber-200/90 text-xs text-amber-900 flex-1 min-w-[260px] overflow-hidden"
                title={auditInfo.message}
              >
                <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="leading-snug sm:truncate">{auditInfo.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain space-y-4 flex-1">
          {inbound ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-50 p-3.5 sm:p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 block">Bộ phận:</span>
                <span className="font-bold text-slate-900" data-user-content="true">
                  {inbound.departmentName && inbound.departmentName !== 'DỰ ÁN LTIA-4.9'
                    ? inbound.departmentName
                    : '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Đơn vị giao hàng:</span>
                <span className="font-bold text-slate-900" data-user-content="true">
                  {inbound.delivererName || inbound.supplier}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Hợp đồng:</span>
                <span className="font-semibold text-slate-900" data-user-content="true">
                  {inbound.contractNo || '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Đề xuất số:</span>
                <span className="font-semibold text-slate-900" data-user-content="true">
                  {inbound.requestNo || '-'}
                </span>
              </div>
              <div className="col-span-2 md:col-span-2">
                <span className="text-slate-400 block">Nội dung:</span>
                <span className="font-medium text-slate-800" data-user-content="true">
                  {inbound.notes || '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Vị trí lưu kho/bãi:</span>
                <span className="font-semibold text-emerald-700" data-user-content="true">
                  {summarizeStorageLocations(inbound.items) || '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Loại nhập:</span>
                <span className="font-semibold text-emerald-700">
                  {inbound.inboundType === 'return' ? 'Nhập trả kho' : 'Nhập mới'}
                </span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-50 p-3.5 sm:p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 block">Bộ phận:</span>
                <span className="font-bold text-slate-900" data-user-content="true">
                  {outbound!.departmentName && outbound!.departmentName !== 'DỰ ÁN LTIA-4.9'
                    ? outbound!.departmentName
                    : '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Người nhận:</span>
                <span className="font-bold text-slate-900" data-user-content="true">
                  {outbound!.recipientName}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Đơn vị/Tổ/Nhóm:</span>
                <span className="font-semibold text-slate-900" data-user-content="true">
                  {outbound!.recipientDepartment}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Số PYC/PĐX:</span>
                <span className="font-mono font-semibold text-blue-700" data-user-content="true">
                  {outbound!.requestNo || '-'}
                </span>
              </div>
              <div className="col-span-2 md:col-span-3">
                <span className="text-slate-400 block">Lý do xuất kho:</span>
                <span className="font-medium text-slate-800" data-user-content="true">
                  {outbound!.notes || '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Loại phiếu:</span>
                <span className="font-semibold text-rose-700">
                  {outbound!.outboundType === 'transfer'
                    ? 'Phiếu xuất điều chuyển'
                    : 'Phiếu xuất kho'}
                </span>
              </div>
            </div>
          )}

          {/* Quick Search inside receipt items */}
          <div className="relative">
            <input
              type="text"
              data-quick-search="modal"
              value={detailSearch}
              onChange={(e) => {
                setDetailSearch(e.target.value);
                setDetailPage(1);
              }}
              placeholder={
                inbound
                  ? 'Tìm nhanh Mã vật tư, Tên vật tư, Số kiện, Mã lô, Bản vẽ, Vị trí lưu kho/bãi trong phiếu...'
                  : 'Tìm nhanh Mã vật tư, Tên vật tư, Mã lô, Bản vẽ trong phiếu xuất...'
              }
              className="w-full pl-9 pr-4 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 sm:top-2.5" />
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="max-h-[54dvh] overflow-x-auto overflow-y-auto">
              {inbound ? (
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-2.5 w-12 text-center">STT</th>
                      <th className="p-2.5">Mã Vật Tư</th>
                      <th className="p-2.5">Tên Vật Tư</th>
                      <th className="p-2.5 text-center">Số Kiện (Package No.)</th>
                      <th className="p-2.5 text-center">Mã Lô</th>
                      <th className="p-2.5">Bản vẽ</th>
                      <th className="p-2.5 text-right">Số Lượng</th>
                      <th className="p-2.5 text-center">ĐVT</th>
                      <th className="p-2.5 text-right">Khối Lượng (Kg)</th>
                      <th className="p-2.5 text-right">Thành Tiền (VNĐ)</th>
                      <th className="p-2.5">Vị trí lưu kho/bãi</th>
                      <th className="p-2.5">Ghi Chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedInboundItems.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="p-8 text-center text-slate-400">
                          Không tìm thấy mặt hàng phù hợp từ khóa.
                        </td>
                      </tr>
                    ) : (
                      pagedInboundItems.map((it, idx) => {
                        const globalIdx = startIdx + idx;
                        const pkgText = it.packageNo && it.packageNo !== 'N/A' ? it.packageNo : '-';
                        const batchText = it.batchCode && it.batchCode !== 'N/A' ? it.batchCode : '';
                        const drawingText = it.drawingNo && it.drawingNo !== 'N/A' ? it.drawingNo : '-';
                        const lineTotal =
                          it.totalPrice && it.totalPrice > 0
                            ? it.totalPrice
                            : (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
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
                            <td className="p-2.5 text-center font-mono font-semibold text-indigo-700" data-user-content="true">
                              {pkgText}
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-800" data-user-content="true">
                              {batchText || '-'}
                            </td>
                            <td className="p-2.5 font-mono text-slate-700" data-user-content="true">
                              {drawingText}
                            </td>
                            <td className="p-2.5 text-right font-bold font-mono text-slate-900 tabular-nums">
                              {roundQty(it.quantity) > 0
                                ? roundQty(it.quantity).toLocaleString('vi-VN')
                                : '-'}
                            </td>
                            <td className="p-2.5 text-center" data-user-content="true">
                              {it.unit}
                            </td>
                            <td className="p-2.5 text-right font-bold font-mono text-emerald-700 tabular-nums">
                              {Number(it.weightKg || 0).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-700 tabular-nums">
                              {lineTotal > 0 ? lineTotal.toLocaleString('en-US') : '-'}
                            </td>
                            <td className="p-2.5 text-[11px] font-medium text-emerald-800">
                              {it.storageLocation ? (
                                <span
                                  className="inline-block px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200"
                                  data-user-content="true"
                                >
                                  {it.storageLocation}
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="p-2.5 text-[11px] text-slate-600" data-user-content="true">
                              {it.note ?? it.conditionNote ?? ''}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                    <tr>
                      <td />
                      <td className="p-2.5 text-center uppercase whitespace-nowrap">
                        {deferredSearch.trim() ? 'TỔNG CỘNG (LỌC)' : 'TỔNG CỘNG'}
                      </td>
                      <td />
                      <td />
                      <td />
                      <td />
                      <td className="p-2.5 text-right text-blue-700 font-mono tabular-nums">
                        {filteredInboundTotals.totalQuantity > 0
                          ? filteredInboundTotals.totalQuantity.toLocaleString('vi-VN')
                          : '-'}
                      </td>
                      <td />
                      <td className="p-2.5 text-right text-emerald-700 font-mono tabular-nums">
                        {filteredInboundTotals.totalWeightKg.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums">
                        {filteredInboundTotals.totalAmount > 0
                          ? filteredInboundTotals.totalAmount.toLocaleString('en-US')
                          : '-'}
                      </td>
                      <td />
                      <td />
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <table className="w-full min-w-[860px] text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-2.5 w-12 text-center">STT</th>
                      <th className="p-2.5">Mã Vật Tư</th>
                      <th className="p-2.5">Tên Vật Tư</th>
                      <th className="p-2.5 text-center">Mã Lô</th>
                      <th className="p-2.5">Bản vẽ</th>
                      <th className="p-2.5 text-right">Số Lượng</th>
                      <th className="p-2.5 text-center">ĐVT</th>
                      <th className="p-2.5 text-right">Khối Lượng (Kg)</th>
                      <th className="p-2.5">Ghi Chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedOutboundItems.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-400">
                          Không tìm thấy mặt hàng phù hợp từ khóa.
                        </td>
                      </tr>
                    ) : (
                      pagedOutboundItems.map((it, idx) => {
                        const globalIdx = startIdx + idx;
                        const batchText = it.batchCode && it.batchCode !== 'N/A' ? it.batchCode : '-';
                        const drawingText = it.drawingNo && it.drawingNo !== 'N/A' ? it.drawingNo : '-';
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
                            <td className="p-2.5 font-mono text-slate-700" data-user-content="true">
                              {drawingText}
                            </td>
                            <td className="p-2.5 text-right font-bold font-mono text-slate-900 tabular-nums">
                              {roundQty(it.quantity) > 0
                                ? roundQty(it.quantity).toLocaleString('vi-VN')
                                : '-'}
                            </td>
                            <td className="p-2.5 text-center" data-user-content="true">
                              {it.unit}
                            </td>
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
                      <td />
                      <td className="p-2.5 text-center uppercase whitespace-nowrap">
                        {deferredSearch.trim() ? 'TỔNG CỘNG (LỌC)' : 'TỔNG CỘNG'}
                      </td>
                      <td />
                      <td />
                      <td />
                      <td className="p-2.5 text-right text-blue-700 font-mono tabular-nums">
                        {filteredOutboundTotals.totalQuantity > 0
                          ? filteredOutboundTotals.totalQuantity.toLocaleString('vi-VN')
                          : '-'}
                      </td>
                      <td />
                      <td className="p-2.5 text-right text-rose-700 font-mono tabular-nums">
                        {filteredOutboundTotals.totalWeightKg.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <PaginationBar
              currentPage={safePage}
              totalItems={totalItemsCount}
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
  );
};
