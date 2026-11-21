import React, { useEffect } from 'react';
import { computeStickyHeaderOffset, resolveOpaqueHeaderBg } from '../../utils/stickyTableHeader';

const EXCLUDED_TABLE_SELECTOR = '.vtp-voucher-table, [data-no-sticky-header="true"]';

interface TableStickyMeasurement {
  thead: HTMLTableSectionElement;
  cells: HTMLTableCellElement[];
  cellBgs: string[];
  offset: number;
  isStuck: boolean;
}

function isScrollableOverflow(value: string): boolean {
  return value === 'auto' || value === 'scroll';
}

function isStickyClipOverflow(value: string): boolean {
  return value === 'auto' || value === 'scroll' || value === 'hidden';
}

function findAncestorInfo(table: HTMLTableElement): {
  inFixedOverlay: boolean;
  verticalScrollAncestors: HTMLElement[];
  cssStickyContainer: HTMLElement | null;
} {
  let inFixedOverlay = false;
  const verticalScrollAncestors: HTMLElement[] = [];
  let cssStickyContainer: HTMLElement | null = null;

  let el: HTMLElement | null = table.parentElement;
  while (el && el !== document.body && el !== document.documentElement) {
    const style = window.getComputedStyle(el);

    if (!cssStickyContainer && isStickyClipOverflow(style.overflowY)) {
      cssStickyContainer = el;
    }

    if (
      isScrollableOverflow(style.overflowY) &&
      el.scrollHeight - el.clientHeight > 2
    ) {
      verticalScrollAncestors.push(el);
    }

    if (style.position === 'fixed') {
      inFixedOverlay = true;
      break;
    }

    el = el.parentElement;
  }

  return { inFixedOverlay, verticalScrollAncestors, cssStickyContainer };
}

function getMainNavbarBottom(): number {
  const header = document.querySelector<HTMLElement>('header');
  if (!header) return 0;
  const style = window.getComputedStyle(header);
  if (style.position !== 'sticky' && style.position !== 'fixed') {
    return 0;
  }
  const rect = header.getBoundingClientRect();
  return Math.max(0, rect.bottom);
}

/**
 * Globally pins every data table's <thead> flush underneath the main Navbar (on main tabs)
 * or flush underneath the modal's main header bar (inside modals) while preserving native
 * horizontal scrolling and sticky-right action columns.
 */
export const StickyTableHeadersController: React.FC = () => {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const cachedCellBg = new WeakMap<HTMLTableCellElement, { className: string; bg: string }>();
    const trackedCells = new Set<HTMLTableCellElement>();
    const trackedTheads = new Set<HTMLTableSectionElement>();

    const getOpaqueCellBg = (
      cell: HTMLTableCellElement,
      thead: HTMLTableSectionElement,
      theadBg: string
    ): string => {
      const key = `${thead.className.replace(/\bvtp-thead-stuck\b/g, '').trim()}|${cell.className}`;
      const existing = cachedCellBg.get(cell);
      if (existing && existing.className === key) {
        return existing.bg;
      }

      const thBg = window.getComputedStyle(cell).backgroundColor;
      const resolved = resolveOpaqueHeaderBg(thBg, theadBg, '#f1f5f9');
      cachedCellBg.set(cell, { className: key, bg: resolved });
      return resolved;
    };

    const updateAllTables = () => {
      const tables = document.querySelectorAll<HTMLTableElement>('table');
      if (tables.length === 0) return;

      const navbarBottom = getMainNavbarBottom();
      const measurements: TableStickyMeasurement[] = [];

      // Phase 1: Batch DOM reads to avoid layout thrashing
      tables.forEach((table) => {
        if (table.matches(EXCLUDED_TABLE_SELECTOR)) return;
        if (table.closest('.vtp-print-portal')) return;

        const thead = table.tHead;
        if (!thead) return;

        const cells = Array.from(
          thead.querySelectorAll<HTMLTableCellElement>('th, td')
        );
        if (cells.length === 0) return;

        const tableRect = table.getBoundingClientRect();
        const theadRect = thead.getBoundingClientRect();
        if (tableRect.height <= 0 || theadRect.height <= 0) {
          measurements.push({ thead, cells, cellBgs: [], offset: 0, isStuck: false });
          return;
        }

        const tfootHeight = table.tFoot ? table.tFoot.getBoundingClientRect().height : 0;
        const { inFixedOverlay, verticalScrollAncestors, cssStickyContainer } =
          findAncestorInfo(table);

        const theadStyle = window.getComputedStyle(thead);
        const isNativeStickyActive =
          theadStyle.position === 'sticky' &&
          verticalScrollAncestors.length > 0 &&
          cssStickyContainer === verticalScrollAncestors[0];

        let effectiveStickyTop: number;
        let nativeStickyTop: number | undefined;
        let maxContainerBottom: number | undefined;

        if (verticalScrollAncestors.length > 0) {
          const ancestorRects = verticalScrollAncestors.map((el) =>
            el.getBoundingClientRect()
          );

          // Pin flush below the lowest (most constraining) scrollable ancestor's top edge
          effectiveStickyTop = Math.max(...ancestorRects.map((r) => r.top));
          if (!inFixedOverlay) {
            effectiveStickyTop = Math.max(effectiveStickyTop, navbarBottom);
          }

          maxContainerBottom = Math.min(...ancestorRects.map((r) => r.bottom));

          if (isNativeStickyActive) {
            nativeStickyTop = Math.max(tableRect.top, ancestorRects[0].top);
          }
        } else if (inFixedOverlay) {
          // Inside a modal that is not currently overflowing vertically -> no stick needed
          measurements.push({ thead, cells, cellBgs: [], offset: 0, isStuck: false });
          return;
        } else {
          // Main page tab scrolling inside window -> pin flush below main Navbar
          effectiveStickyTop = navbarBottom;
        }

        const { offset, isStuck } = computeStickyHeaderOffset({
          tableTop: tableRect.top,
          tableBottom: tableRect.bottom,
          theadHeight: theadRect.height,
          tfootHeight,
          effectiveStickyTop,
          nativeStickyTop,
          maxContainerBottom
        });

        // Pre-warm opaque background cache while unstuck (or reuse cached values)
        const theadBg = theadStyle.backgroundColor;
        const cellBgs = isStuck
          ? cells.map((cell) => getOpaqueCellBg(cell, thead, theadBg))
          : [];

        measurements.push({ thead, cells, cellBgs, offset, isStuck });
      });

      // Phase 2: Batch DOM writes (skipping no-op mutations)
      for (const { thead, cells, cellBgs, offset, isStuck } of measurements) {
        if (isStuck) {
          trackedTheads.add(thead);
          const nextTransform = offset > 0 ? `translate3d(0, ${offset}px, 0)` : '';
          for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            const bg = cellBgs[i];
            if (bg && cell.style.getPropertyValue('--vtp-th-bg') !== bg) {
              cell.style.setProperty('--vtp-th-bg', bg);
            }
            if (cell.style.transform !== nextTransform) {
              cell.style.transform = nextTransform;
            }
            trackedCells.add(cell);
          }
          if (!thead.classList.contains('vtp-thead-stuck')) {
            thead.classList.add('vtp-thead-stuck');
          }
        } else {
          if (thead.classList.contains('vtp-thead-stuck')) {
            thead.classList.remove('vtp-thead-stuck');
          }
          for (const cell of cells) {
            if (cell.style.transform) {
              cell.style.transform = '';
            }
          }
        }
      }
    };

    let rafId: number | null = null;
    const scheduleUpdate = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateAllTables();
      });
    };

    // Run synchronously on scroll for zero-lag tracking across window and modal scrollers
    const handleScroll = () => {
      updateAllTables();
    };

    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });

    const mutationObserver = new MutationObserver(() => {
      scheduleUpdate();
    });
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    let headerResizeObserver: ResizeObserver | null = null;
    const headerEl = document.querySelector<HTMLElement>('header');
    if (headerEl && typeof ResizeObserver !== 'undefined') {
      headerResizeObserver = new ResizeObserver(() => {
        scheduleUpdate();
      });
      headerResizeObserver.observe(headerEl);
    }

    scheduleUpdate();

    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', scheduleUpdate);
      mutationObserver.disconnect();
      headerResizeObserver?.disconnect();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      trackedTheads.forEach((thead) => {
        thead.classList.remove('vtp-thead-stuck');
      });
      trackedCells.forEach((cell) => {
        cell.style.transform = '';
        cell.style.removeProperty('--vtp-th-bg');
      });
    };
  }, []);

  return null;
};
