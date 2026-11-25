import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Package,
  FileWarning,
  CornerDownLeft,
  X
} from 'lucide-react';
import { StorageService } from '../../services/storage';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { ModalGuard, ModalCloseButton } from '../../context/ModalContext';
import { isWarehouseAuthorized } from '../../utils/additiveMerge';

export interface QuickSearchSelection {
  tab: 'inbound' | 'outbound' | 'materials' | 'osd';
  query: string;
}

interface QuickSearchEntry {
  id: string;
  section: 'inbound' | 'outbound' | 'materials' | 'osd';
  code: string;
  title: string;
  subtitle: string;
  query: string;
}

export const QuickGlobalSearchModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selection: QuickSearchSelection) => void;
}> = ({ isOpen, onClose, onSelect }) => {
  const { currentUser } = useAuth();
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIndex(0);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const results = useMemo<QuickSearchEntry[]>(() => {
    if (!isOpen) return [];
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];

    const matches: QuickSearchEntry[] = [];
    const maxPerSection = 6;
    const warehouses = StorageService.getWarehouses();

    // 1. Phiếu nhập kho
    const inbounds = StorageService.getInboundReceipts();
    let inboundCount = 0;
    for (let i = 0; i < inbounds.length && inboundCount < maxPerSection; i++) {
      const r = inbounds[i];
      if (!isWarehouseAuthorized(r.warehouseId, r.warehouseName, warehouses, currentUser)) continue;
      const hitHeader =
        r.receiptCode.toLowerCase().includes(trimmed) ||
        (r.warehouseName || '').toLowerCase().includes(trimmed) ||
        (r.delivererName || '').toLowerCase().includes(trimmed) ||
        (r.supplier || '').toLowerCase().includes(trimmed) ||
        (r.contractNo || '').toLowerCase().includes(trimmed) ||
        (r.packingListNo || '').toLowerCase().includes(trimmed);
      const hitItem = !hitHeader && Array.isArray(r.items) && r.items.some(
        (it) =>
          (it.materialCode || '').toLowerCase().includes(trimmed) ||
          (it.materialName || '').toLowerCase().includes(trimmed) ||
          (it.batchCode || '').toLowerCase().includes(trimmed) ||
          (it.packageNo || '').toLowerCase().includes(trimmed) ||
          (it.drawingNo || '').toLowerCase().includes(trimmed)
      );
      if (hitHeader || hitItem) {
        matches.push({
          id: `in-${r.id}`,
          section: 'inbound',
          code: r.receiptCode,
          title: r.warehouseName || r.supplier || r.delivererName || r.receiptCode,
          subtitle: [r.receiptDate, r.delivererName || r.supplier].filter(Boolean).join(' • '),
          query: r.receiptCode
        });
        inboundCount++;
      }
    }

    // 2. Phiếu xuất kho
    const outbounds = StorageService.getOutboundReceipts();
    let outboundCount = 0;
    for (let i = 0; i < outbounds.length && outboundCount < maxPerSection; i++) {
      const r = outbounds[i];
      if (!isWarehouseAuthorized(r.warehouseId, r.warehouseName, warehouses, currentUser)) continue;
      const hitHeader =
        r.issueCode.toLowerCase().includes(trimmed) ||
        (r.warehouseName || '').toLowerCase().includes(trimmed) ||
        (r.recipientName || '').toLowerCase().includes(trimmed) ||
        (r.recipientDepartment || '').toLowerCase().includes(trimmed) ||
        (r.requestNo || '').toLowerCase().includes(trimmed);
      const hitItem = !hitHeader && Array.isArray(r.items) && r.items.some(
        (it) =>
          (it.materialCode || '').toLowerCase().includes(trimmed) ||
          (it.materialName || '').toLowerCase().includes(trimmed) ||
          (it.batchCode || '').toLowerCase().includes(trimmed) ||
          (it.packageNo || '').toLowerCase().includes(trimmed) ||
          (it.drawingNo || '').toLowerCase().includes(trimmed)
      );
      if (hitHeader || hitItem) {
        matches.push({
          id: `out-${r.id}`,
          section: 'outbound',
          code: r.issueCode,
          title: r.warehouseName || r.recipientName || r.issueCode,
          subtitle: [r.issueDate, r.recipientName || r.recipientDepartment].filter(Boolean).join(' • '),
          query: r.issueCode
        });
        outboundCount++;
      }
    }

    // 3. Danh mục vật tư
    const materials = StorageService.getMaterials();
    let matCount = 0;
    for (let i = 0; i < materials.length && matCount < maxPerSection; i++) {
      const m = materials[i];
      const hit =
        (m.code || '').toLowerCase().includes(trimmed) ||
        (m.name || '').toLowerCase().includes(trimmed) ||
        (m.packageNo || '').toLowerCase().includes(trimmed) ||
        (m.drawingNo || '').toLowerCase().includes(trimmed) ||
        (m.packingListNo || '').toLowerCase().includes(trimmed) ||
        (m.supplier || '').toLowerCase().includes(trimmed);
      if (hit) {
        matches.push({
          id: `mat-${m.id}`,
          section: 'materials',
          code: m.code,
          title: m.name,
          subtitle: [
            m.category,
            m.unit,
            m.packageNo,
            m.drawingNo && m.drawingNo !== 'N/A' ? m.drawingNo : null
          ]
            .filter(Boolean)
            .join(' • '),
          query: m.code || m.name
        });
        matCount++;
      }
    }

    // 4. Vật tư OSD
    const osds = StorageService.getOsdReceipts();
    let osdCount = 0;
    for (let i = 0; i < osds.length && osdCount < maxPerSection; i++) {
      const o = osds[i];
      if (!isWarehouseAuthorized(o.warehouseId, o.warehouseName, warehouses, currentUser)) continue;
      const hit =
        (o.osdCode || '').toLowerCase().includes(trimmed) ||
        (o.inboundReceiptCode || '').toLowerCase().includes(trimmed) ||
        (o.supplier || '').toLowerCase().includes(trimmed) ||
        (o.warehouseName || '').toLowerCase().includes(trimmed);
      if (hit) {
        matches.push({
          id: `osd-${o.id}`,
          section: 'osd',
          code: o.osdCode,
          title: o.inboundReceiptCode || o.warehouseName || o.osdCode,
          subtitle: [o.osdDate, o.supplier].filter(Boolean).join(' • '),
          query: o.osdCode
        });
        osdCount++;
      }
    }

    return matches;
  }, [isOpen, query, currentUser]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleChoose = (entry: QuickSearchEntry) => {
    onSelect({ tab: entry.section, query: entry.query });
    onClose();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length > 0) {
        setActiveIndex((prev) => (prev + 1) % results.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length > 0) {
        setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
      }
    } else if (e.key === 'Enter') {
      if (results.length > 0) {
        e.preventDefault();
        const target = results[Math.min(activeIndex, results.length - 1)];
        if (target) handleChoose(target);
      }
    }
  };

  const sectionLabel = (section: QuickSearchEntry['section']) => {
    switch (section) {
      case 'inbound':
        return t('quickSearchSectionInbound');
      case 'outbound':
        return t('quickSearchSectionOutbound');
      case 'materials':
        return t('quickSearchSectionMaterials');
      case 'osd':
        return t('quickSearchSectionOsd');
    }
  };

  const sectionIcon = (section: QuickSearchEntry['section']) => {
    switch (section) {
      case 'inbound':
        return <ArrowDownLeft className="w-4 h-4 text-blue-600 shrink-0" />;
      case 'outbound':
        return <ArrowUpRight className="w-4 h-4 text-amber-600 shrink-0" />;
      case 'materials':
        return <Package className="w-4 h-4 text-emerald-600 shrink-0" />;
      case 'osd':
        return <FileWarning className="w-4 h-4 text-rose-600 shrink-0" />;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('quickSearchModalTitle')}
      onClick={onClose}
      className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-6 pt-[8vh] sm:pt-[12vh] overscroll-contain animate-in fade-in duration-150"
    >
      <ModalGuard
        title={t('quickSearchModalTitle')}
        onClose={onClose}
        priority={90}
        confirmOnEsc={false}
      />

      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-150"
      >
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-center gap-3">
          <Search className="w-5 h-5 text-blue-600 shrink-0" />
          <input
            ref={inputRef}
            data-quick-search="modal"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={t('quickSearchModalPlaceholder')}
            className="flex-1 bg-transparent text-sm sm:text-base text-slate-900 placeholder:text-slate-400 outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {!query.trim() ? (
            <div className="px-4 py-8 text-center text-xs sm:text-sm text-slate-500">
              {t('quickSearchEmptyHint')}
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs sm:text-sm text-slate-500">
              {t('quickSearchNoResults')}
            </div>
          ) : (
            <div className="space-y-1">
              {results.map((entry, idx) => {
                const isSelected = idx === activeIndex;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleChoose(entry)}
                    className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 border border-blue-200 text-slate-900'
                        : 'border border-transparent hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        {sectionIcon(entry.section)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="font-mono font-bold text-xs sm:text-sm text-slate-900 truncate"
                            data-user-content="true"
                          >
                            {entry.code}
                          </span>
                          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                            {sectionLabel(entry.section)}
                          </span>
                        </div>
                        <div
                          className="text-xs text-slate-600 truncate mt-0.5"
                          data-user-content="true"
                        >
                          {entry.title}
                          {entry.subtitle ? ` — ${entry.subtitle}` : ''}
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <CornerDownLeft className="w-4 h-4 text-blue-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>{t('quickSearchFooterHint')}</span>
          <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-slate-600 font-mono text-[10px]">
            Ctrl+K
          </kbd>
        </div>
      </div>
    </div>
  );
};

export const QuickNewVoucherModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCreateInbound: () => void;
  onCreateOutbound: () => void;
}> = ({ isOpen, onClose, onCreateInbound, onCreateOutbound }) => {
  const { t } = useLanguage();
  const [selectedIdx, setSelectedIdx] = useState<0 | 1>(0);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIdx(0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === '1') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        onCreateInbound();
      } else if (event.key === '2') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        onCreateOutbound();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        setSelectedIdx((prev) => (prev === 0 ? 1 : 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        if (selectedIdx === 0) {
          onCreateInbound();
        } else {
          onCreateOutbound();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, selectedIdx, onClose, onCreateInbound, onCreateOutbound]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('quickNewVoucherTitle')}
      onClick={onClose}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overscroll-contain animate-in fade-in duration-150"
    >
      <ModalGuard
        title={t('quickNewVoucherTitle')}
        onClose={onClose}
        priority={90}
        confirmOnEsc={false}
      />

      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150"
      >
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">
              {t('quickNewVoucherTitle')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('quickNewVoucherSubtitle')}
            </p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="p-4 space-y-2.5">
          <button
            type="button"
            onMouseEnter={() => setSelectedIdx(0)}
            onClick={() => {
              onClose();
              onCreateInbound();
            }}
            className={`w-full p-4 rounded-xl border text-left flex items-center justify-between gap-3 transition cursor-pointer ${
              selectedIdx === 0
                ? 'border-blue-500 bg-blue-50/80 shadow-xs'
                : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-blue-600/20">
                <ArrowDownLeft className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-sm text-slate-900">
                  {t('quickNewInboundTitle')}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 leading-snug">
                  {t('quickNewInboundDesc')}
                </div>
              </div>
            </div>
            <kbd className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 font-mono text-xs font-bold shrink-0">
              1
            </kbd>
          </button>

          <button
            type="button"
            onMouseEnter={() => setSelectedIdx(1)}
            onClick={() => {
              onClose();
              onCreateOutbound();
            }}
            className={`w-full p-4 rounded-xl border text-left flex items-center justify-between gap-3 transition cursor-pointer ${
              selectedIdx === 1
                ? 'border-amber-500 bg-amber-50/80 shadow-xs'
                : 'border-slate-200 hover:border-amber-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-amber-600/20">
                <ArrowUpRight className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-sm text-slate-900">
                  {t('quickNewOutboundTitle')}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 leading-snug">
                  {t('quickNewOutboundDesc')}
                </div>
              </div>
            </div>
            <kbd className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 font-mono text-xs font-bold shrink-0">
              2
            </kbd>
          </button>
        </div>

        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500">
          {t('quickNewVoucherFooterHint')}
        </div>
      </div>
    </div>
  );
};
