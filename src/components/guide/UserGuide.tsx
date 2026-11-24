import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Download,
  Search,
  RotateCcw,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  filterUserGuideSections,
  getUserGuideSections
} from '../../utils/userGuideData';
import { exportUserGuidePdf } from '../../services/userGuidePdfService';

interface UserGuideProps {
  onNavigate: (tab: string) => void;
}

export const UserGuide: React.FC<UserGuideProps> = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const { language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSectionId, setActiveSectionId] = useState<string>('overview-auth');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const allSections = useMemo(() => getUserGuideSections(language), [language]);
  const filteredSections = useMemo(
    () => filterUserGuideSections(allSections, searchQuery),
    [allSections, searchQuery]
  );

  const isEn = language === 'en';

  const handleSelectSection = (id: string) => {
    setActiveSectionId(id);
    const el = document.getElementById(`guide-section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleDownloadPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    setToast(null);
    try {
      const exportSections = filteredSections.length > 0 ? filteredSections : allSections;
      const exportedBy = currentUser?.fullName || currentUser?.email || undefined;
      const fileName = await exportUserGuidePdf(exportSections, language, exportedBy);
      setToast({
        type: 'success',
        message: isEn
          ? `Downloaded user guide PDF: ${fileName}`
          : `Đã tải xuống tài liệu PDF: ${fileName}`
      });
    } catch (err: any) {
      setToast({
        type: 'error',
        message: isEn
          ? `Unable to generate PDF: ${err?.message || String(err)}`
          : `Không thể tạo file PDF: ${err?.message || String(err)}`
      });
    } finally {
      setIsExportingPdf(false);
      window.setTimeout(() => {
        setToast(null);
      }, 4500);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">
              {isEn ? 'System User Guide & Operations Manual' : 'Hướng Dẫn Sử Dụng Hệ Thống'}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
              <span>{isEn ? '9 operational chapters' : '9 chương nghiệp vụ đầy đủ'}</span>
              <span aria-hidden="true">·</span>
              <span>{isEn ? 'Admin & Staff workflows' : 'Dành cho Quản trị viên & Nhân viên'}</span>
              <span aria-hidden="true">·</span>
              <span>{isEn ? 'Offline PDF download supported' : 'Hỗ trợ tải về file PDF'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isExportingPdf}
            className="w-full md:w-auto min-h-[42px] flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-65 text-white rounded-xl text-xs font-semibold transition whitespace-nowrap shrink-0"
          >
            {isExportingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <Download className="w-4 h-4 shrink-0" />
            )}
            <span>
              {isExportingPdf
                ? isEn
                  ? 'Generating PDF...'
                  : 'Đang tạo file PDF...'
                : isEn
                  ? 'Download PDF Guide'
                  : 'Tải Hướng Dẫn PDF'}
            </span>
          </button>
        </div>
      </div>

      {toast && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-medium flex items-center gap-2.5 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span className="break-words">{toast.message}</span>
        </div>
      )}

      {/* Quick Filter Search */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            data-quick-search="primary"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isEn
                ? 'Search workflows, Excel import, PACKAGE No., shortcuts, Cloud Sync...'
                : 'Tìm nhanh hướng dẫn (nhập kho, xuất kho, OSD, Excel, PACKAGE No., phím tắt, Cloud Sync...)'
            }
            className="w-full pl-9 pr-16 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[42px] sm:min-h-0"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 sm:top-2.5" />
          {!searchQuery && (
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              Ctrl+K
            </kbd>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-slate-500 shrink-0">
          <span className="tabular-nums">
            {isEn
              ? `Showing ${filteredSections.length}/${allSections.length} chapters`
              : `Hiển thị ${filteredSections.length}/${allSections.length} chương`}
          </span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="min-h-[36px] px-2.5 py-1.5 rounded-lg text-slate-600 hover:text-blue-700 hover:bg-slate-100 font-medium flex items-center gap-1 transition whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>{isEn ? 'Reset' : 'Xóa lọc'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main 2-column Documentation Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5 items-start">
        {/* Sticky Chapter Navigation */}
        <aside className="bg-white rounded-2xl border border-slate-200 p-3.5 lg:sticky lg:top-20">
          <div className="px-2.5 pb-2.5 mb-2 border-b border-slate-100 text-xs font-bold text-slate-800">
            {isEn ? 'Table of Contents' : 'Mục Lục Nhanh'}
          </div>
          {filteredSections.length === 0 ? (
            <p className="px-2.5 py-3 text-xs text-slate-400">
              {isEn ? 'No matching chapters' : 'Không có chương phù hợp'}
            </p>
          ) : (
            <nav className="space-y-1">
              {filteredSections.map((sec) => {
                const isActive = activeSectionId === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => handleSelectSection(sec.id)}
                    className={`w-full min-h-[40px] px-2.5 py-2 rounded-xl text-left text-xs font-medium flex items-center gap-2.5 transition ${
                      isActive
                        ? 'bg-blue-50 text-blue-800 font-semibold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className="font-mono tabular-nums text-[11px] text-slate-400 shrink-0">
                      {sec.chapter}
                    </span>
                    <span className="truncate">{sec.title}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </aside>

        {/* Readable Documentation Sections */}
        <div className="space-y-5 min-w-0">
          {filteredSections.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
              <p className="text-sm font-medium text-slate-700">
                {isEn
                  ? 'No user guide sections match your search keyword.'
                  : 'Không tìm thấy nội dung hướng dẫn phù hợp với từ khóa vừa nhập.'}
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isEn ? 'Show all chapters' : 'Hiển thị toàn bộ hướng dẫn'}</span>
              </button>
            </div>
          ) : (
            filteredSections.map((section) => (
              <section
                key={section.id}
                id={`guide-section-${section.id}`}
                className="scroll-mt-20 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5"
              >
                {/* Section Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono tabular-nums font-semibold text-blue-700">
                        {isEn ? `Chapter ${section.chapter}` : `Chương ${section.chapter}`}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{section.audienceLabel}</span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900">
                      {section.title}
                    </h2>
                    <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed max-w-3xl">
                      {section.summary}
                    </p>
                  </div>

                  {section.targetTab && section.targetTabLabel && (
                    <button
                      type="button"
                      onClick={() => onNavigate(section.targetTab!)}
                      className="min-h-[38px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 self-start"
                    >
                      <span>{section.targetTabLabel}</span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  )}
                </div>

                {/* Ordered Workflow Steps */}
                <div className="pt-4 border-t border-slate-100 space-y-3.5">
                  {section.steps.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-700 font-mono tabular-nums text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 space-y-0.5">
                        <h3 className="text-xs sm:text-[13px] font-semibold text-slate-900">
                          {step.title}
                        </h3>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Business Rules (separated by clean hairline divider, no nested card borders) */}
                {section.rules && section.rules.length > 0 && (
                  <div className="pt-4 border-t border-slate-100 space-y-2.5">
                    {section.rules.map((rule, rIdx) => (
                      <div key={rIdx} className="text-xs leading-relaxed">
                        <span className="font-semibold text-slate-900 mr-1.5">
                          {rule.label}:
                        </span>
                        <span className="text-slate-600">{rule.detail}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Structured Reference Table */}
                {section.table && (
                  <div className="pt-2 overflow-x-auto">
                    <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
                      <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                        <tr>
                          {section.table.headers.map((head, hIdx) => (
                            <th key={hIdx} className="px-3.5 py-2.5">
                              {head}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {section.table.rows.map((row, rowIdx) => (
                          <tr key={rowIdx} className="hover:bg-slate-50/70">
                            {row.map((cell, cIdx) => (
                              <td
                                key={cIdx}
                                className={`px-3.5 py-2.5 align-top ${
                                  cIdx === 0
                                    ? 'font-semibold text-slate-900 whitespace-nowrap'
                                    : 'text-slate-600'
                                }`}
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
