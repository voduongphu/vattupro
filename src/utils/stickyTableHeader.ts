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
  /**
   * When the browser's native CSS `position: sticky; top: 0` is already active against
   * an inner vertical scroll container, pass `Math.max(tableTop, innerScrollerTop)` here
   * so JS only adds the extra offset needed if an outer scroll container pushes the inner box
   * above `effectiveStickyTop`. Omit when native CSS sticky is not active.
   */
  nativeStickyTop?: number;
  /** Optional lower viewport clamp (e.g. inner vertical scroll container bottom) */
  maxContainerBottom?: number;
}

export interface StickyHeaderOffsetResult {
  /** Vertical translateY offset in px to apply to header cells */
  offset: number;
  /** Whether the header is visually pinned/stuck (either via transform or native CSS sticky) */
  isStuck: boolean;
}

const STICKY_EPSILON = 0.5;

/**
 * Computes the clamped vertical translation offset required to keep a table's <thead>
 * pinned flush below the active sticky boundary (main Navbar or modal header bar)
 * without overflowing past the bottom of the table or overlapping <tfoot>.
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

  // Never let the header push past the bottom of the table body
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

  // Matches rgb(r, g, b), rgba(r, g, b, a), rgb(r g b / a)
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

  // Matches modern CSS Color 4: color(srgb r g b / a)
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

function compositeOver(fg: ParsedRgba, bg: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
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
 * This guarantees scrolled rows never bleed through semi-transparent headers (e.g. bg-slate-50/80,
 * bg-blue-50/50) while preserving tinted column colors.
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
