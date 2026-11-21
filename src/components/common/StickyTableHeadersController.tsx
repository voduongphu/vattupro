import React, { useEffect } from 'react';
import { computeFixedHeaderLayout, resolveOpaqueHeaderBg } from '../../utils/stickyTableHeader';

const EXCLUDED_TABLE_SELECTOR = '.vtp-voucher-table, [data-no-sticky-header="true"]';
const SPACER_ATTR = 'data-vtp-sticky-spacer';

interface FixedPinRecord {
  thead: HTMLTableSectionElement;
  headerRow: HTMLTableRowElement;
  cells: HTMLTableCellElement[];
  spacerRow: HTMLTableRowElement;
  theadHeight: number;
  tableWidth: number;
  xWrapper: HTMLElement;
  prevTableLayout: string;
  prevTableWidth: string;
}

interface AncestorScan {
  inFixedOverlay: boolean;
  /** Vertically scrollable ancestors (scrollHeight > clientHeight), innermost first */
  verticalScrollAncestors: HTMLElement[];
  /** Non-scrolling overflow-hidden / overflow-x-auto ancestors between table and its scroll container */
  blockingAncestors: HTMLElement[];
  /** Nearest horizontal scroll wrapper (`overflow-x: auto | scroll`, or previously clipped by us) */
  xWrapper: HTMLElement | null;
  /** Whether table sits inside an inner max-height vertical scrollbox (e.g. max-h-96) */
  hasInnerVerticalBox: boolean;
}

function isScrollableValue(val: string): boolean {
  return val === 'auto' || val === 'scroll';
}

function getMainNavbarBottom(): number {
  const header = document.querySelector<HTMLElement>('header');
  if (!header) return 0;
  const style = window.getComputedStyle(header);
  if (style.position !== 'sticky' && style.position !== 'fixed') {
    return 0;
  }
  const rect = header.getBoundingClientRect();
  return Math.max(0, Math.round(rect.bottom * 100) / 100);
}

/**
 * Checks if any ancestor creates a containing block for `position: fixed`
 * (e.g. via CSS transform/filter/perspective) and returns its viewport origin.
 */
function getFixedContainingBlockOrigin(el: HTMLElement): { top: number; left: number } {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const hasTransform = style.transform && style.transform !== 'none';
    const hasPerspective = style.perspective && style.perspective !== 'none';
    const hasFilter = style.filter && style.filter !== 'none';
    const hasWillChange =
      style.willChange &&
      (style.willChange.includes('transform') || style.willChange.includes('filter'));

    if (hasTransform || hasPerspective || hasFilter || hasWillChange) {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, left: rect.left };
    }
    node = node.parentElement;
  }
  return { top: 0, left: 0 };
}

function scanTableAncestors(table: HTMLTableElement): AncestorScan {
  let inFixedOverlay = false;
  const verticalScrollAncestors: HTMLElement[] = [];
  const blockingAncestors: HTMLElement[] = [];
  let xWrapper: HTMLElement | null = null;

  let el: HTMLElement | null = table.parentElement;
  while (el && el !== document.body && el !== document.documentElement) {
    const style = window.getComputedStyle(el);

    const isExplicitXWrapper =
      el.classList.contains('overflow-x-auto') ||
      el.classList.contains('vtp-sticky-clip-x') ||
      isScrollableValue(style.overflowX);

    if (!xWrapper && isExplicitXWrapper) {
      xWrapper = el;
    }

    const isVerticallyScrollable =
      isScrollableValue(style.overflowY) &&
      !el.classList.contains('vtp-sticky-clip-x') &&
      el.scrollHeight - el.clientHeight > 2;

    if (isVerticallyScrollable) {
      verticalScrollAncestors.push(el);
    } else if (
      verticalScrollAncestors.length === 0 &&
      (style.overflowX === 'hidden' ||
        style.overflowY === 'hidden' ||
        isScrollableValue(style.overflowX) ||
        isScrollableValue(style.overflowY) ||
        el.classList.contains('vtp-sticky-clip-ancestor') ||
        el.classList.contains('vtp-sticky-clip-x'))
    ) {
      blockingAncestors.push(el);
    }

    if (style.position === 'fixed') {
      inFixedOverlay = true;
      break;
    }

    el = el.parentElement;
  }

  // An inner vertical scrollbox is a vertical scroller that is also the table's direct xWrapper
  // or has an explicit max-height (e.g. max-h-96, max-h-[58dvh], max-h-80)
  const firstScroller = verticalScrollAncestors[0];
  const hasInnerVerticalBox = Boolean(
    firstScroller &&
      (firstScroller === xWrapper ||
        (window.getComputedStyle(firstScroller).maxHeight !== 'none' &&
          !firstScroller.classList.contains('flex-1')))
  );

  return {
    inFixedOverlay,
    verticalScrollAncestors,
    blockingAncestors,
    xWrapper,
    hasInnerVerticalBox
  };
}

/**
 * Zero-jitter, compositor-thread sticky table headers across all main tabs and modals:
 *
 * - Tier 1 (Native CSS `position: sticky`): Used whenever a table fits horizontally
 *   (or sits inside an inner `max-h-*` scrollbox). Converts non-scrolling ancestor
 *   `overflow: hidden` / `overflow-x: auto` wrappers to `overflow: clip` so native
 *   CSS `position: sticky` runs 100% on the browser compositor thread with ZERO scroll jitter.
 *
 * - Tier 2 (Compositor-thread `position: fixed`): Automatically used ONLY when a table
 *   genuinely overflows horizontally (`scrollWidth > clientWidth`) without an inner vertical
 *   scrollbox (e.g. wide Create/Edit Inbound form on desktop or narrow viewports). Locks
 *   the real `<thead>` row at a constant viewport `top` with `clip-path` horizontal clipping
 *   so vertical mouse-wheel scrolling has ZERO bounce/jitter while preserving all interactive
 *   React controls, horizontal scrolling, and right-pinned `Xóa` columns.
 */
export const StickyTableHeadersController: React.FC = () => {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const cachedCellBg = new WeakMap<HTMLTableCellElement, { key: string; bg: string }>();
    const activeFixedPins = new Map<HTMLTableElement, FixedPinRecord>();
    const trackedNativeTheads = new Set<HTMLTableSectionElement>();
    const trackedClipAncestors = new Set<HTMLElement>();
    const observedElements = new WeakSet<Element>();
    let isMutatingDom = false;

    const getHeaderRows = (thead: HTMLTableSectionElement): HTMLTableRowElement[] =>
      Array.from(thead.rows).filter((r) => !r.hasAttribute(SPACER_ATTR));

    const getHeaderCells = (row: HTMLTableRowElement): HTMLTableCellElement[] =>
      Array.from(row.cells);

    const resolveCellOpaqueBg = (
      cell: HTMLTableCellElement,
      thead: HTMLTableSectionElement
    ): string => {
      const cleanTheadClass = thead.className
        .replace(/\b(vtp-thead-native-sticky|vtp-thead-stuck)\b/g, '')
        .trim();
      const key = `${cleanTheadClass}|${cell.className}`;
      const existing = cachedCellBg.get(cell);
      if (existing && existing.key === key) {
        return existing.bg;
      }

      // Read natural computed colors without our sticky background override
      const hadNative = thead.classList.contains('vtp-thead-native-sticky');
      const parentRow = cell.parentElement;
      const hadFixed = Boolean(parentRow?.classList.contains('vtp-thead-fixed-row'));
      if (hadNative) thead.classList.remove('vtp-thead-native-sticky');
      if (hadFixed && parentRow) parentRow.classList.remove('vtp-thead-fixed-row');

      const thBg = window.getComputedStyle(cell).backgroundColor;
      const theadBg = window.getComputedStyle(thead).backgroundColor;

      if (hadNative) thead.classList.add('vtp-thead-native-sticky');
      if (hadFixed && parentRow) parentRow.classList.add('vtp-thead-fixed-row');

      const resolved = resolveOpaqueHeaderBg(thBg, theadBg, '#f1f5f9');
      cachedCellBg.set(cell, { key, bg: resolved });
      return resolved;
    };

    const unpinFixedTable = (table: HTMLTableElement) => {
      const pin = activeFixedPins.get(table);
      if (!pin) return;

      isMutatingDom = true;
      try {
        pin.spacerRow.remove();
        table.style.tableLayout = pin.prevTableLayout;
        table.style.width = pin.prevTableWidth;
        pin.headerRow.classList.remove('vtp-thead-fixed-row');
        pin.headerRow.style.top = '';
        pin.headerRow.style.left = '';
        pin.headerRow.style.width = '';
        pin.headerRow.style.clipPath = '';
        pin.thead.classList.remove('vtp-thead-stuck');

        for (const cell of pin.cells) {
          cell.style.width = '';
          cell.style.minWidth = '';
          cell.style.maxWidth = '';
          cell.style.boxSizing = '';
          cell.style.transform = '';
        }
        activeFixedPins.delete(table);
      } finally {
        isMutatingDom = false;
      }
    };

    const clearNativeSticky = (
      thead: HTMLTableSectionElement,
      blockingAncestors: HTMLElement[]
    ) => {
      if (thead.classList.contains('vtp-thead-native-sticky')) {
        thead.classList.remove('vtp-thead-native-sticky', 'vtp-thead-stuck');
        thead.style.removeProperty('--vtp-sticky-top');
      }
      for (const el of blockingAncestors) {
        el.classList.remove('vtp-sticky-clip-ancestor', 'vtp-sticky-clip-x');
        trackedClipAncestors.delete(el);
      }
    };

    const ensureCellBackgrounds = (
      thead: HTMLTableSectionElement,
      cells: HTMLTableCellElement[]
    ) => {
      for (const cell of cells) {
        const bg = resolveCellOpaqueBg(cell, thead);
        if (cell.style.getPropertyValue('--vtp-th-bg') !== bg) {
          cell.style.setProperty('--vtp-th-bg', bg);
        }
      }
    };

    const applyFixedPin = (
      table: HTMLTableElement,
      thead: HTMLTableSectionElement,
      headerRow: HTMLTableRowElement,
      xWrapper: HTMLElement,
      effectiveStickyTop: number
    ) => {
      const cells = getHeaderCells(headerRow);
      if (cells.length === 0) return;

      const tfootHeight = table.tFoot ? table.tFoot.getBoundingClientRect().height : 0;
      const existingPin = activeFixedPins.get(table);
      const tableRect = table.getBoundingClientRect();
      const wrapperRect = xWrapper.getBoundingClientRect();

      const theadHeight = existingPin
        ? existingPin.theadHeight
        : headerRow.getBoundingClientRect().height;
      const tableWidth = existingPin ? existingPin.tableWidth : tableRect.width;

      const fixedOrigin = getFixedContainingBlockOrigin(headerRow);
      const layout = computeFixedHeaderLayout({
        tableTop: tableRect.top,
        tableBottom: tableRect.bottom,
        tableWidth,
        theadHeight,
        tfootHeight,
        wrapperLeft: wrapperRect.left,
        wrapperClientWidth: xWrapper.clientWidth,
        wrapperScrollLeft: xWrapper.scrollLeft,
        effectiveStickyTop,
        fixedOriginTop: fixedOrigin.top,
        fixedOriginLeft: fixedOrigin.left
      });

      if (!layout.shouldPin) {
        if (existingPin) {
          unpinFixedTable(table);
        }
        return;
      }

      isMutatingDom = true;
      try {
        let pin = existingPin;
        let activeLayout = layout;
        if (!pin) {
          // Measure exact column widths BEFORE promoting headerRow to position: fixed
          const colWidths = cells.map((c) => c.getBoundingClientRect().width);
          const measuredTableWidth =
            Math.round(colWidths.reduce((sum, w) => sum + w, 0) * 100) / 100 || tableWidth;
          ensureCellBackgrounds(thead, cells);

          // Build a per-column spacer row with exact measured widths so tbody columns
          // NEVER shrink or shift when headerRow leaves normal table flow
          const spacerRow = document.createElement('tr');
          spacerRow.setAttribute(SPACER_ATTR, 'true');
          spacerRow.setAttribute('aria-hidden', 'true');
          for (let i = 0; i < cells.length; i++) {
            const w = `${Math.round(colWidths[i] * 100) / 100}px`;
            const spacerCell = document.createElement('th');
            if (cells[i].colSpan > 1) {
              spacerCell.colSpan = cells[i].colSpan;
            }
            spacerCell.style.width = w;
            spacerCell.style.minWidth = w;
            spacerCell.style.maxWidth = w;
            spacerCell.style.height = `${theadHeight}px`;
            spacerCell.style.padding = '0';
            spacerCell.style.border = '0';
            spacerCell.style.boxSizing = 'border-box';
            spacerCell.style.visibility = 'hidden';
            spacerCell.style.pointerEvents = 'none';
            spacerRow.appendChild(spacerCell);
          }

          const prevTableLayout = table.style.tableLayout;
          const prevTableWidth = table.style.width;

          // Insert spacerRow as first row so table-layout: fixed sizes every tbody column from it
          thead.insertBefore(spacerRow, headerRow);
          table.style.tableLayout = 'fixed';
          table.style.width = `${measuredTableWidth}px`;

          for (let i = 0; i < cells.length; i++) {
            const w = `${Math.round(colWidths[i] * 100) / 100}px`;
            cells[i].style.width = w;
            cells[i].style.minWidth = w;
            cells[i].style.maxWidth = w;
            cells[i].style.boxSizing = 'border-box';
          }

          headerRow.classList.add('vtp-thead-fixed-row');
          thead.classList.add('vtp-thead-stuck');

          pin = {
            thead,
            headerRow,
            cells,
            spacerRow,
            theadHeight,
            tableWidth: measuredTableWidth,
            xWrapper,
            prevTableLayout,
            prevTableWidth
          };
          activeFixedPins.set(table, pin);

          activeLayout = computeFixedHeaderLayout({
            tableTop: tableRect.top,
            tableBottom: tableRect.bottom,
            tableWidth: measuredTableWidth,
            theadHeight,
            tfootHeight,
            wrapperLeft: wrapperRect.left,
            wrapperClientWidth: xWrapper.clientWidth,
            wrapperScrollLeft: xWrapper.scrollLeft,
            effectiveStickyTop,
            fixedOriginTop: fixedOrigin.top,
            fixedOriginLeft: fixedOrigin.left
          });
        }

        const nextTop = `${activeLayout.top}px`;
        const nextLeft = `${activeLayout.left}px`;
        const nextWidth = `${activeLayout.width}px`;
        const nextClip = `inset(0px ${activeLayout.clipRight}px -14px ${activeLayout.clipLeft}px)`;

        if (pin.headerRow.style.top !== nextTop) {
          pin.headerRow.style.top = nextTop;
        }
        if (pin.headerRow.style.left !== nextLeft) {
          pin.headerRow.style.left = nextLeft;
        }
        if (pin.headerRow.style.width !== nextWidth) {
          pin.headerRow.style.width = nextWidth;
        }
        if (pin.headerRow.style.clipPath !== nextClip) {
          pin.headerRow.style.clipPath = nextClip;
        }

        for (const cell of pin.cells) {
          if (cell.classList.contains('sticky')) {
            const nextTransform =
              activeLayout.stickyRightShift < -0.25
                ? `translate3d(${activeLayout.stickyRightShift}px, 0, 0)`
                : '';
            if (cell.style.transform !== nextTransform) {
              cell.style.transform = nextTransform;
            }
          }
        }
      } finally {
        isMutatingDom = false;
      }
    };

    const syncTable = (
      table: HTMLTableElement,
      navbarBottom: number,
      forceRemeasureFixed: boolean
    ) => {
      if (table.matches(EXCLUDED_TABLE_SELECTOR) || table.closest('.vtp-print-portal')) {
        unpinFixedTable(table);
        return;
      }

      const thead = table.tHead;
      if (!thead) return;

      const headerRows = getHeaderRows(thead);
      if (headerRows.length === 0) return;

      const allHeaderCells = headerRows.flatMap(getHeaderCells);
      if (allHeaderCells.length === 0) return;

      if (forceRemeasureFixed && activeFixedPins.has(table)) {
        unpinFixedTable(table);
      }

      const {
        inFixedOverlay,
        verticalScrollAncestors,
        blockingAncestors,
        xWrapper,
        hasInnerVerticalBox
      } = scanTableAncestors(table);

      // Observe table and wrapper for width changes (window resize / sidebar toggle / data changes)
      if (resizeObserver) {
        if (!observedElements.has(table)) {
          resizeObserver.observe(table);
          observedElements.add(table);
        }
        if (xWrapper && !observedElements.has(xWrapper)) {
          resizeObserver.observe(xWrapper);
          observedElements.add(xWrapper);
        }
      }

      // Case 1: Table is inside an inner `max-h-*` vertical scrollbox (e.g. Detail Modals, Stock Picker, Excel Preview)
      // Native CSS `position: sticky; top: 0` handles BOTH vertical sticky & horizontal scroll natively!
      if (hasInnerVerticalBox && verticalScrollAncestors.length > 0) {
        unpinFixedTable(table);
        ensureCellBackgrounds(thead, allHeaderCells);
        thead.style.setProperty('--vtp-sticky-top', '0px');
        thead.classList.add('vtp-thead-native-sticky');
        trackedNativeTheads.add(thead);

        const innerRect = verticalScrollAncestors[0].getBoundingClientRect();
        const tableRect = table.getBoundingClientRect();
        const isStuck = tableRect.top < innerRect.top - 0.5;
        thead.classList.toggle('vtp-thead-stuck', isStuck);
        return;
      }

      // Check whether the table currently needs horizontal scrolling
      const hasHorizontalOverflow = Boolean(
        xWrapper && table.offsetWidth > xWrapper.clientWidth + 1
      );

      // Case 2: Table fits horizontally -> Tier 1: 100% Native CSS `position: sticky` (ZERO jitter!)
      if (!hasHorizontalOverflow) {
        unpinFixedTable(table);

        // Inside a modal: stick flush at 0px below modal header (top of modal's overflow-y-auto body)
        // On main tabs: stick flush below the live main Navbar (`navbarBottom`)
        const stickyTopValue = inFixedOverlay ? 0 : navbarBottom;

        // Convert blocking `overflow: hidden` / `overflow-x: auto` ancestors to `overflow: clip`
        for (const el of blockingAncestors) {
          if (el === xWrapper) {
            el.classList.add('vtp-sticky-clip-x');
          } else {
            el.classList.add('vtp-sticky-clip-ancestor');
          }
          trackedClipAncestors.add(el);
        }

        ensureCellBackgrounds(thead, allHeaderCells);
        const topCss = `${stickyTopValue}px`;
        if (thead.style.getPropertyValue('--vtp-sticky-top') !== topCss) {
          thead.style.setProperty('--vtp-sticky-top', topCss);
        }
        if (!thead.classList.contains('vtp-thead-native-sticky')) {
          thead.classList.add('vtp-thead-native-sticky');
        }
        trackedNativeTheads.add(thead);

        // Toggle shadow class purely visually when stuck
        const tableRect = table.getBoundingClientRect();
        const scrollBoundaryTop =
          verticalScrollAncestors.length > 0
            ? Math.max(...verticalScrollAncestors.map((a) => a.getBoundingClientRect().top))
            : stickyTopValue;
        const isStuck =
          tableRect.top < scrollBoundaryTop - 0.5 &&
          tableRect.bottom > scrollBoundaryTop + 1;
        thead.classList.toggle('vtp-thead-stuck', isStuck);
        return;
      }

      // Case 3: Table genuinely overflows horizontally (`scrollWidth > clientWidth`) without an inner max-h box
      // Tier 2: Compositor-thread `position: fixed` pinning with horizontal clip-path & sticky-right support
      clearNativeSticky(thead, blockingAncestors);

      if (!xWrapper || headerRows.length !== 1) {
        unpinFixedTable(table);
        return;
      }

      let effectiveStickyTop: number;
      if (verticalScrollAncestors.length > 0) {
        effectiveStickyTop = Math.max(
          ...verticalScrollAncestors.map((el) => el.getBoundingClientRect().top)
        );
        if (!inFixedOverlay) {
          effectiveStickyTop = Math.max(effectiveStickyTop, navbarBottom);
        }
      } else if (inFixedOverlay) {
        // Modal is not vertically scrollable
        unpinFixedTable(table);
        return;
      } else {
        effectiveStickyTop = navbarBottom;
      }

      applyFixedPin(table, thead, headerRows[0], xWrapper, effectiveStickyTop);
    };

    const syncAllTables = (forceRemeasureFixed = false) => {
      if (isMutatingDom) return;

      // Clean up any pins whose table was unmounted from DOM
      for (const table of Array.from(activeFixedPins.keys())) {
        if (!table.isConnected) {
          unpinFixedTable(table);
        }
      }

      const navbarBottom = getMainNavbarBottom();
      const tables = document.querySelectorAll<HTMLTableElement>('table');
      tables.forEach((table) => {
        syncTable(table, navbarBottom, forceRemeasureFixed);
      });
    };

    let rafId: number | null = null;
    let pendingRemeasure = false;
    const scheduleSync = (remeasureFixed = false) => {
      if (remeasureFixed) pendingRemeasure = true;
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const shouldRemeasure = pendingRemeasure;
        pendingRemeasure = false;
        syncAllTables(shouldRemeasure);
      });
    };

    // On scroll: update Tier 2 fixed pins & Tier 1 shadow state immediately
    const handleScroll = () => {
      syncAllTables(false);
    };

    const handleResize = () => {
      scheduleSync(true);
    };

    const resizeObserver: ResizeObserver | null =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            scheduleSync(true);
          })
        : null;

    const headerEl = document.querySelector<HTMLElement>('header');
    if (headerEl && resizeObserver) {
      resizeObserver.observe(headerEl);
      observedElements.add(headerEl);
    }

    const mutationObserver = new MutationObserver((mutations) => {
      if (isMutatingDom) return;
      // Ignore pure spacer mutations
      const hasRelevantMutation = mutations.some((m) => {
        const targetEl = m.target as HTMLElement | null;
        return !targetEl?.hasAttribute?.(SPACER_ATTR);
      });
      if (hasRelevantMutation) {
        scheduleSync(true);
      }
    });
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    window.addEventListener('resize', handleResize, { passive: true });

    scheduleSync(false);

    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      for (const table of Array.from(activeFixedPins.keys())) {
        unpinFixedTable(table);
      }
      trackedNativeTheads.forEach((thead) => {
        thead.classList.remove('vtp-thead-native-sticky', 'vtp-thead-stuck');
        thead.style.removeProperty('--vtp-sticky-top');
      });
      trackedClipAncestors.forEach((el) => {
        el.classList.remove('vtp-sticky-clip-ancestor', 'vtp-sticky-clip-x');
      });
    };
  }, []);

  return null;
};
