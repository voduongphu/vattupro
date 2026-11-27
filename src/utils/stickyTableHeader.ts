export interface StickyHeaderOffsetInput {
  /** Current viewport top of the <table> element (from getBoundingClientRect().top) */
  tableTop: number;
  /** Current viewport bottom of the <table> element (from getBoundingClientRect().bottom) */
  tableBottom: number;
  /** Height of the <thead> element in px */
  theadHeight: number;
  /** Height of the <tfoot> element in px (0 if absent) */
  tfootHeight?: number;
  /** Viewport Y coordinate where the sticky header should pin (e.g. Navbar bottom or modal scroll body top) */
  effectiveStickyTop: number;
  /** Optional native CSS sticky position when an inner vertical scroller handles sticky */
  nativeStickyTop?: number;
  /** Optional lower viewport clamp */
  maxContainerBottom?: number;
}

export interface StickyHeaderOffsetResult {
  offset: number;
  isStuck: boolean;
}

export interface FixedHeaderLayoutInput {
  tableTop: number;
  tableBottom: number;
  tableWidth: number;
  theadHeight: number;
  tfootHeight?: number;
  wrapperLeft: number;
  wrapperClientWidth: number;
  wrapperScrollLeft: number;
  effectiveStickyTop: number;
  /** Top offset of containing block if an ancestor creates a fixed containing block (usually 0) */
  fixedOriginTop?: number;
  /** Left offset of containing block if an ancestor creates a fixed containing block (usually 0) */
  fixedOriginLeft?: number;
}

export interface FixedHeaderLayoutResult {
  shouldPin: boolean;
  top: number;
  left: number;
  width: number;
  clipLeft: number;
  clipRight: number;
  /** Negative translateX offset (<= 0) to keep a right-pinned sticky column flush to wrapper right edge */
  stickyRightShift: number;
}

const STICKY_EPSILON = 0.5;

/**
 * Computes whether a horizontally scrollable table header should be pinned with
 * compositor-thread `position: fixed`, along with exact viewport coordinates,
 * horizontal clip-path bounds, and sticky-right column alignment.
 */
export function computeFixedHeaderLayout(
  input: FixedHeaderLayoutInput
): FixedHeaderLayoutResult {
  const {
    tableTop,
    tableBottom,
    tableWidth,
    theadHeight,
    tfootHeight = 0,
    wrapperLeft,
    wrapperClientWidth,
    wrapperScrollLeft,
    effectiveStickyTop,
    fixedOriginTop = 0,
    fixedOriginLeft = 0
  } = input;

  const empty: FixedHeaderLayoutResult = {
    shouldPin: false,
    top: 0,
    left: 0,
    width: 0,
    clipLeft: 0,
    clipRight: 0,
    stickyRightShift: 0
  };

  if (
    !Number.isFinite(tableTop) ||
    !Number.isFinite(tableBottom) ||
    !Number.isFinite(tableWidth) ||
    !Number.isFinite(theadHeight) ||
    !Number.isFinite(wrapperLeft) ||
    !Number.isFinite(wrapperClientWidth) ||
    !Number.isFinite(effectiveStickyTop) ||
    theadHeight <= 0 ||
    tableWidth <= 0 ||
    wrapperClientWidth <= 0
  ) {
    return empty;
  }

  const effectiveBottom = tableBottom - Math.max(0, tfootHeight);
  // Table must be taller than just its header + footer to warrant pinning
  if (effectiveBottom - tableTop <= theadHeight + 1) {
    return empty;
  }

  const shouldPin =
    tableTop < effectiveStickyTop - STICKY_EPSILON &&
    effectiveBottom > effectiveStickyTop + STICKY_EPSILON;

  if (!shouldPin) {
    return empty;
  }

  const maxTop = effectiveBottom - theadHeight;
  const viewportTop = Math.min(effectiveStickyTop, maxTop);
  const clampedScrollLeft = Math.max(0, wrapperScrollLeft);
  const maxScrollLeft = Math.max(0, tableWidth - wrapperClientWidth);
  const clipLeft = clampedScrollLeft;
  const clipRight = Math.max(0, maxScrollLeft - clampedScrollLeft);
  const stickyRightShift = -clipRight;

  return {
    shouldPin: true,
    top: Math.round((viewportTop - fixedOriginTop) * 100) / 100,
    left: Math.round((wrapperLeft - clampedScrollLeft - fixedOriginLeft) * 100) / 100,
    width: Math.round(tableWidth * 100) / 100,
    clipLeft: Math.round(clipLeft * 100) / 100,
    clipRight: Math.round(clipRight * 100) / 100,
    stickyRightShift: Math.round(stickyRightShift * 100) / 100
  };
}

/**
 * Legacy/utility clamped vertical offset helper (used for computing stuck state & bounds).
 */
export function computeStickyHeaderOffset(
  input: StickyHeaderOffsetInput
): StickyHeaderOffsetResult {
  const {
    tableTop,
    tableBottom,
    theadHeight,
    tfootHeight = 0,
    effectiveStickyTop,
    nativeStickyTop,
    maxContainerBottom
  } = input;

  if (
    !Number.isFinite(tableTop) ||
    !Number.isFinite(tableBottom) ||
    !Number.isFinite(theadHeight) ||
    !Number.isFinite(effectiveStickyTop) ||
    theadHeight <= 0
  ) {
    return { offset: 0, isStuck: false };
  }

  const baseTop =
    nativeStickyTop !== undefined && Number.isFinite(nativeStickyTop)
      ? nativeStickyTop
      : tableTop;

  const isNativeStuck =
    nativeStickyTop !== undefined &&
    Number.isFinite(nativeStickyTop) &&
    tableTop < nativeStickyTop - STICKY_EPSILON;

  const effectiveBottom =
    maxContainerBottom !== undefined && Number.isFinite(maxContainerBottom)
      ? Math.min(tableBottom - Math.max(0, tfootHeight), maxContainerBottom)
      : tableBottom - Math.max(0, tfootHeight);

  const maxOffset = Math.max(0, effectiveBottom - theadHeight - baseTop);
  const rawOffset = effectiveStickyTop - baseTop;

  if (rawOffset <= STICKY_EPSILON || maxOffset <= STICKY_EPSILON) {
    return { offset: 0, isStuck: isNativeStuck };
  }

  const clamped = Math.min(rawOffset, maxOffset);
  const rounded = Math.round(clamped * 100) / 100;

  return {
    offset: rounded,
    isStuck: rounded > STICKY_EPSILON || isNativeStuck
  };
}

interface ParsedRgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColorString(color: string | null | undefined): ParsedRgba | null {
  if (!color) return null;
  const trimmed = color.trim().toLowerCase();
  if (!trimmed || trimmed === 'transparent' || trimmed === 'none') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/
  );
  if (rgbMatch) {
    const r = Math.max(0, Math.min(255, Number(rgbMatch[1])));
    const g = Math.max(0, Math.min(255, Number(rgbMatch[2])));
    const b = Math.max(0, Math.min(255, Number(rgbMatch[3])));
    let a = 1;
    if (rgbMatch[4] !== undefined) {
      a = rgbMatch[4].endsWith('%')
        ? Number(rgbMatch[4].slice(0, -1)) / 100
        : Number(rgbMatch[4]);
    }
    if ([r, g, b, a].every(Number.isFinite)) {
      return { r, g, b, a: Math.max(0, Math.min(1, a)) };
    }
  }

  const srgbMatch = trimmed.match(
    /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/
  );
  if (srgbMatch) {
    const r = Math.max(0, Math.min(255, Number(srgbMatch[1]) * 255));
    const g = Math.max(0, Math.min(255, Number(srgbMatch[2]) * 255));
    const b = Math.max(0, Math.min(255, Number(srgbMatch[3]) * 255));
    let a = 1;
    if (srgbMatch[4] !== undefined) {
      a = srgbMatch[4].endsWith('%')
        ? Number(srgbMatch[4].slice(0, -1)) / 100
        : Number(srgbMatch[4]);
    }
    if ([r, g, b, a].every(Number.isFinite)) {
      return { r, g, b, a: Math.max(0, Math.min(1, a)) };
    }
  }

  return null;
}

function compositeOver(
  fg: ParsedRgba,
  bg: { r: number; g: number; b: number }
): { r: number; g: number; b: number } {
  const alpha = fg.a;
  return {
    r: Math.round(fg.r * alpha + bg.r * (1 - alpha)),
    g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
    b: Math.round(fg.b * alpha + bg.b * (1 - alpha))
  };
}

/**
 * Resolves a solid opaque RGB color string for a stuck <th> cell by compositing
 * the cell's computed background over its <thead> background and a white table base.
 */
export function resolveOpaqueHeaderBg(
  thBg: string | null | undefined,
  theadBg: string | null | undefined,
  fallback = '#f1f5f9'
): string {
  const whiteBase = { r: 255, g: 255, b: 255 };
  const parsedThead = parseColorString(theadBg);
  const parsedTh = parseColorString(thBg);

  const hasTheadColor = parsedThead !== null && parsedThead.a > 0;
  const hasThColor = parsedTh !== null && parsedTh.a > 0;

  if (!hasTheadColor && !hasThColor) {
    return fallback;
  }

  let current = whiteBase;
  if (hasTheadColor && parsedThead) {
    current = compositeOver(parsedThead, current);
  }
  if (hasThColor && parsedTh) {
    current = compositeOver(parsedTh, current);
  }

  return `rgb(${current.r}, ${current.g}, ${current.b})`;
}

export interface ScrollAncestorCheckInput {
  classList: Iterable<string>;
  overflowX: string;
  overflowY: string;
  scrollHeight: number;
  clientHeight: number;
  hasVerticalScrollAncestor: boolean;
}

export interface ScrollAncestorCheckResult {
  isExplicitVerticalScroller: boolean;
  isExplicitXWrapper: boolean;
  isVerticallyScrollable: boolean;
  isBlockingAncestor: boolean;
}

function isScrollableOverflowValue(val: string): boolean {
  return val === 'auto' || val === 'scroll';
}

/**
 * Classifies an ancestor element of a table for sticky-header management.
 * Explicit vertical scroll containers (`overflow-y-auto`, `overflow-y-scroll`, `overflow-auto`)
 * MUST always be treated as vertical scroll ancestors and NEVER turned into `overflow: clip`
 * blocking ancestors, even when temporarily short during initial async data loading.
 */
export function classifyTableAncestor(input: ScrollAncestorCheckInput): ScrollAncestorCheckResult {
  const classes = new Set<string>(input.classList);
  const hasClipX = classes.has('vtp-sticky-clip-x');
  const hasClipAncestor = classes.has('vtp-sticky-clip-ancestor');

  const isExplicitVerticalScroller =
    classes.has('overflow-y-auto') ||
    classes.has('overflow-y-scroll') ||
    classes.has('overflow-auto');

  const isExplicitXWrapper =
    classes.has('overflow-x-auto') ||
    hasClipX ||
    (!isExplicitVerticalScroller && isScrollableOverflowValue(input.overflowX));

  const isVerticallyScrollable =
    isExplicitVerticalScroller ||
    (isScrollableOverflowValue(input.overflowY) &&
      !hasClipX &&
      input.scrollHeight - input.clientHeight > 2);

  const isBlockingAncestor =
    !isVerticallyScrollable &&
    !input.hasVerticalScrollAncestor &&
    (input.overflowX === 'hidden' ||
      input.overflowY === 'hidden' ||
      isScrollableOverflowValue(input.overflowX) ||
      isScrollableOverflowValue(input.overflowY) ||
      hasClipAncestor ||
      hasClipX);

  return {
    isExplicitVerticalScroller,
    isExplicitXWrapper,
    isVerticallyScrollable,
    isBlockingAncestor
  };
}

