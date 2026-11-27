import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  FileDown,
  Loader2,
  Printer,
  SlidersHorizontal
} from 'lucide-react';
import { StockFilterParams } from '../../types/inventory';
import { StorageService } from '../../services/storage';
import { ModalCloseButton, ModalGuard } from '../../context/ModalContext';
import {
  FM09_DEFAULT_MIN_ROWS,
  FM09_EFFECTIVE_DATE,
  FM09_FORM_CODE,
  buildFm09QuantityReport,
  formatFm09DateRange,
  formatFm09Qty
} from '../../utils/inventoryReportFm09';
import { exportInventoryReportFm09Pdf } from '../../services/inventoryReportPdfService';

interface InventoryReportPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseFilter: StockFilterParams;
  defaultDepartmentName?: string;
  defaultReporterName?: string;
}

export const InventoryReportPrintModal: React.FC<InventoryReportPrintModalProps> = ({
  isOpen,
  onClose,
  baseFilter,
  defaultDepartmentName = '',
  defaultReporterName = ''
}) => {
  const [showCustomize, setShowCustomize] = useState(false);
  const [departmentName, setDepartmentName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [departmentHeadName, setDepartmentHeadName] = useState('');
  const [groupByMaterial, setGroupByMaterial] = useState(true);
  const [showTotalsRow, setShowTotalsRow] = useState(true);
  const [extraBlankRows, setExtraBlankRows] = useState(0);

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setShowCustomize(false);
    setDepartmentName(defaultDepartmentName);
    setStartDate(baseFilter.startDate || '');
    setEndDate(baseFilter.endDate || '');
    setReporterName(defaultReporterName);
    setDepartmentHeadName('');
    setGroupByMaterial(true);
    setShowTotalsRow(true);
    setExtraBlankRows(0);
    setExportFeedback(null);
  }, [isOpen, defaultDepartmentName, defaultReporterName, baseFilter.startDate, baseFilter.endDate]);

  const effectiveFilter = useMemo<StockFilterParams>(
    () => ({
      ...baseFilter,
      startDate: startDate || undefined,
      endDate: endDate || undefined
    }),
    [baseFilter, startDate, endDate]
  );

  const report = useMemo(() => {
    if (!isOpen) {
      return {
        rows: [],
        totals: {
          openingQuantity: 0,
          inboundQuantity: 0,
          returnInboundQuantity: 0,
          outboundQuantity: 0,
          transferOutboundQuantity: 0,
          closingQuantity: 0
        }
      };
    }
    const { openingRecords, periodRecords } =
      StorageService.calculateFm09PeriodRecords(effectiveFilter);
    return buildFm09QuantityReport(openingRecords, periodRecords, {
      groupByMaterial,
      excludeAllZeroRows: true
    });
  }, [isOpen, effectiveFilter, groupByMaterial]);

  const blankRowsArray = useMemo(() => {
    const padded =
      report.rows.length < FM09_DEFAULT_MIN_ROWS
        ? FM09_DEFAULT_MIN_ROWS - report.rows.length + extraBlankRows
        : extraBlankRows;
    return Array.from({ length: Math.max(0, padded) }, (_, i) => i);
  }, [report.rows.length, extraBlankRows]);

  if (!isOpen) return null;

  const trimmedDept = departmentName.trim();
  const dateRangeText = formatFm09DateRange(startDate, endDate);

  const handleDownloadPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    setExportFeedback(null);
    try {
      const fileName = await exportInventoryReportFm09Pdf(report, {
        departmentName: trimmedDept,
        startDate,
        endDate,
        reporterName: reporterName.trim(),
        departmentHeadName: departmentHeadName.trim(),
        showTotalsRow,
        extraBlankRows,
        minDisplayRows: FM09_DEFAULT_MIN_ROWS
      });
      setExportFeedback({
        type: 'success',
        message: `Đã tải xuống ${fileName}`
      });
    } catch (err) {
      setExportFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Không thể xuất file PDF. Vui lòng thử lại.'
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrintA4 = () => {
    window.print();
  };

  const modalContent = (
    <div className="vtp-print-portal vtp-print-landscape fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto overscroll-contain">
      {/* Ensure browser Print dialog defaults strictly to A4 Landscape while this modal is open */}
      <style media="print">{`
        @page {
          size: A4 landscape;
          margin: 10mm 10mm;
        }
      `}</style>

      <ModalGuard
        title={`Xem Trước & Xuất PDF Báo Cáo Nhập Xuất Tồn (${FM09_FORM_CODE})`}
        onClose={onClose}
      />

      <div className="vtp-print-shell bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[1320px] max-h-[94dvh] flex flex-col overflow-hidden">
        {/* Top Toolbar (hidden on print) */}
        <div className="border-b border-slate-200 bg-slate-50 shrink-0 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="font-bold text-slate-800 text-xs sm:text-sm">
                Báo Cáo Nhập Xuất Tồn (Chỉ Số Lượng)
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs font-mono font-semibold text-blue-700">
                {FM09_FORM_CODE}
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs font-semibold text-slate-600">
                A4 Ngang · {report.rows.length.toLocaleString('vi-VN')} vật tư
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => setShowCustomize((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition min-h-[40px] ${
                  showCustomize
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Hiệu chỉnh thông tin in</span>
              </button>

              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                disabled={isExportingPdf}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-sm transition min-h-[40px] disabled:opacity-60"
                title="Tải trực tiếp file PDF khổ giấy A4 ngang theo mẫu QN-OPR-PR11-FM09"
              >
                {isExportingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4" />
                )}
                <span>{isExportingPdf ? 'Đang tạo PDF...' : 'Tải File PDF (A4)'}</span>
              </button>

              <button
                type="button"
                onClick={handlePrintA4}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md transition min-h-[40px]"
              >
                <Printer className="w-4 h-4" />
                <span>In Bản A4</span>
              </button>

              <ModalCloseButton onClick={onClose} className="w-10 h-10" />
            </div>
          </div>

          {exportFeedback && (
            <div
              className={`mx-3 sm:mx-4 mb-3 px-3 py-2 rounded-xl text-xs flex items-center gap-2 border ${
                exportFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {exportFeedback.type === 'success' && (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <span className="truncate">{exportFeedback.message}</span>
            </div>
          )}

          {/* Collapsible Customization Panel */}
          {showCustomize && (
            <div className="px-3 sm:px-4 pb-3.5 pt-2.5 bg-slate-100/80 border-t border-slate-200/80 space-y-2.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    Bộ phận (để trống sẽ in dấu chấm "Bộ phận:..........")
                  </label>
                  <input
                    type="text"
                    value={departmentName}
                    onChange={(e) => setDepartmentName(e.target.value)}
                    placeholder="VD: Ban QLDA / Kho vật tư..."
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    Từ ngày (tính Tồn đầu kỳ)
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    Đến ngày
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    Người báo cáo (tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={reporterName}
                    onChange={(e) => setReporterName(e.target.value)}
                    placeholder="Để trống để ký tay"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    Trưởng Bộ phận (tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={departmentHeadName}
                    onChange={(e) => setDepartmentHeadName(e.target.value)}
                    placeholder="Để trống để ký tay"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={groupByMaterial}
                    onChange={(e) => setGroupByMaterial(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Gộp các dòng trùng Mã &amp; Tên vật tư</span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={showTotalsRow}
                    onChange={(e) => setShowTotalsRow(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Hiển thị dòng Tổng cộng cuối bảng</span>
                </label>

                <div className="inline-flex items-center gap-2">
                  <label className="text-slate-600 font-medium">Dòng trống bổ sung:</label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={extraBlankRows}
                    onChange={(e) =>
                      setExtraBlankRows(
                        Math.max(0, Math.min(20, parseInt(e.target.value, 10) || 0))
                      )
                    }
                    className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500 text-center"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* A4 Landscape Sheet Preview (matches QN-OPR-PR11-FM09) */}
        <div className="vtp-print-paper p-3 sm:p-6 overflow-y-auto overscroll-contain flex-1 bg-slate-100/70 print:bg-white">
          <div className="bg-white mx-auto max-w-[297mm] min-h-[195mm] p-5 sm:p-8 print:p-0 print:max-w-none print:min-h-0 shadow-sm print:shadow-none border border-slate-200 print:border-none text-black font-['Times_New_Roman',Times,serif]">
            {/* 1. Top-Right Form Control Block */}
            <div className="text-right text-[11px] leading-snug mb-2">
              <div>{FM09_FORM_CODE}</div>
              <div>{FM09_EFFECTIVE_DATE}</div>
            </div>

            {/* 2. Company & National Motto Row */}
            <div className="grid grid-cols-12 gap-2 items-start text-[13px] leading-snug mb-3">
              <div className="col-span-6 text-center">
                <div className="uppercase">
                  CÔNG TY CỔ PHẦN DỊCH VỤ DẦU KHÍ QUẢNG NGÃI PTSC
                </div>
                <div className="font-bold mt-0.5">
                  {trimmedDept ? (
                    <>
                      Bộ phận: <span data-user-content="true">{trimmedDept}</span>
                    </>
                  ) : (
                    'Bộ phận:....................'
                  )}
                </div>
              </div>
              <div className="col-span-6 text-center font-bold">
                <div>Cộng Hòa Xã Hội Chủ Nghĩa Việt Nam</div>
                <div className="mt-0.5">Độc lập - Tự do - Hạnh phúc</div>
              </div>
            </div>

            {/* 3. Report Title & Date Range */}
            <div className="text-center mb-3.5">
              <h1 className="text-[17px] font-bold uppercase tracking-normal text-black leading-tight">
                BÁO CÁO NHẬP XUẤT TỒN
              </h1>
              <div className="text-[13px] font-bold italic mt-1" data-user-content="true">
                {dateRangeText}
              </div>
            </div>

            {/* 4. 10-Column Quantity-Only Table matching QN-OPR-PR11-FM09 */}
            <div className="overflow-x-auto print:overflow-visible">
              <table className="vtp-voucher-table w-full min-w-[900px] print:min-w-0 border-collapse border-[1.5px] border-black text-[12px] leading-snug">
                <thead>
                  <tr className="font-bold text-center">
                    <th
                      rowSpan={2}
                      className="border border-black px-1 py-1.5 w-[3.8%] align-middle"
                    >
                      STT
                    </th>
                    <th
                      rowSpan={2}
                      className="border border-black px-1.5 py-1.5 w-[10.5%] align-middle"
                    >
                      MÃ VẬT TƯ
                    </th>
                    <th
                      rowSpan={2}
                      className="border border-black px-2 py-1.5 w-[24.2%] align-middle"
                    >
                      TÊN VẬT TƯ
                    </th>
                    <th
                      rowSpan={2}
                      className="border border-black px-1 py-1.5 w-[5.5%] align-middle"
                    >
                      ĐVT
                    </th>
                    <th
                      colSpan={6}
                      className="border border-black px-2 py-1 align-middle"
                    >
                      SỐ LƯỢNG
                    </th>
                  </tr>
                  <tr className="font-bold text-center border-b-[1.5px] border-black">
                    <th className="border border-black px-1.5 py-1.5 w-[8.8%] align-middle">
                      TỒN ĐẦU KỲ
                    </th>
                    <th className="border border-black px-1.5 py-1.5 w-[8.8%] align-middle">
                      TỔNG NHẬP
                    </th>
                    <th className="border border-black px-1.5 py-1.5 w-[9.5%] align-middle">
                      TỔNG NHẬP TRẢ
                    </th>
                    <th className="border border-black px-1.5 py-1.5 w-[8.8%] align-middle">
                      TỔNG XUẤT
                    </th>
                    <th className="border border-black px-1.5 py-1.5 w-[11.3%] align-middle">
                      TỔNG XUẤT ĐIỀU CHUYỂN
                    </th>
                    <th className="border border-black px-1.5 py-1.5 w-[8.8%] align-middle">
                      TỒN CUỐI KỲ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, idx) => (
                    <tr key={row.key} className="min-h-[24px]">
                      <td className="border border-black px-1 py-1 text-center align-middle">
                        {idx + 1}
                      </td>
                      <td
                        className="border border-black px-1.5 py-1 text-center align-middle break-all"
                        data-user-content="true"
                      >
                        {row.materialCode}
                      </td>
                      <td
                        className="border border-black px-2 py-1 text-left align-middle"
                        data-user-content="true"
                      >
                        {row.materialName}
                      </td>
                      <td
                        className="border border-black px-1 py-1 text-center align-middle"
                        data-user-content="true"
                      >
                        {row.unit}
                      </td>
                      <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                        {formatFm09Qty(row.openingQuantity)}
                      </td>
                      <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                        {formatFm09Qty(row.inboundQuantity)}
                      </td>
                      <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                        {formatFm09Qty(row.returnInboundQuantity)}
                      </td>
                      <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                        {formatFm09Qty(row.outboundQuantity)}
                      </td>
                      <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                        {formatFm09Qty(row.transferOutboundQuantity)}
                      </td>
                      <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                        {formatFm09Qty(row.closingQuantity)}
                      </td>
                    </tr>
                  ))}

                  {blankRowsArray.map((bIdx) => (
                    <tr key={`blank-fm09-${bIdx}`} className="h-[24px]">
                      <td className="border border-black px-1 py-0.5 text-center align-middle">
                        {report.rows.length + bIdx + 1}
                      </td>
                      <td className="border border-black px-1.5 py-0.5" />
                      <td className="border border-black px-2 py-0.5" />
                      <td className="border border-black px-1 py-0.5" />
                      <td className="border border-black px-1.5 py-0.5" />
                      <td className="border border-black px-1.5 py-0.5" />
                      <td className="border border-black px-1.5 py-0.5" />
                      <td className="border border-black px-1.5 py-0.5" />
                      <td className="border border-black px-1.5 py-0.5" />
                      <td className="border border-black px-1.5 py-0.5" />
                    </tr>
                  ))}

                  {showTotalsRow && report.rows.length > 0 && (
                    <tr className="font-bold border-t-[1.5px] border-black bg-slate-50/70 print:bg-transparent h-[28px]">
                      <td
                        colSpan={4}
                        className="border border-black px-2 py-1 text-center uppercase align-middle"
                      >
                        TỔNG CỘNG
                      </td>
                      <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                        {formatFm09Qty(report.totals.openingQuantity)}
                      </td>
                      <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                        {formatFm09Qty(report.totals.inboundQuantity)}
                      </td>
                      <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                        {formatFm09Qty(report.totals.returnInboundQuantity)}
                      </td>
                      <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                        {formatFm09Qty(report.totals.outboundQuantity)}
                      </td>
                      <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                        {formatFm09Qty(report.totals.transferOutboundQuantity)}
                      </td>
                      <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                        {formatFm09Qty(report.totals.closingQuantity)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 5. Signature Block */}
            <div className="vtp-signature-block grid grid-cols-2 gap-8 text-center text-[13px] mt-7 pb-4">
              <div>
                <div className="font-bold">Người báo cáo</div>
                <div className="italic text-[12px]">(Ký, ghi rõ họ tên)</div>
                <div className="h-20" />
                {reporterName.trim() && (
                  <div className="font-bold" data-user-content="true">
                    {reporterName.trim()}
                  </div>
                )}
              </div>
              <div>
                <div className="font-bold">Trưởng Bộ phận</div>
                <div className="italic text-[12px]">(Ký, ghi rõ họ tên)</div>
                <div className="h-20" />
                {departmentHeadName.trim() && (
                  <div className="font-bold" data-user-content="true">
                    {departmentHeadName.trim()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
