import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyTableAncestor,
  computeFixedHeaderLayout,
  computeStickyHeaderOffset,
  resolveOpaqueHeaderBg
} from './stickyTableHeader';

describe('computeFixedHeaderLayout', () => {
  it('does not pin before table reaches the sticky boundary', () => {
    const res = computeFixedHeaderLayout({
      tableTop: 320,
      tableBottom: 1400,
      tableWidth: 1460,
      theadHeight: 41,
      wrapperLeft: 80,
      wrapperClientWidth: 1180,
      wrapperScrollLeft: 0,
      effectiveStickyTop: 96
    });

    assert.equal(res.shouldPin, false);
  });

  it('pins with constant viewport top while scrolling vertically (zero compositor jitter)', () => {
    const first = computeFixedHeaderLayout({
      tableTop: -50,
      tableBottom: 1030,
      tableWidth: 1460,
      theadHeight: 41,
      wrapperLeft: 80,
      wrapperClientWidth: 1180,
      wrapperScrollLeft: 0,
      effectiveStickyTop: 96
    });

    const second = computeFixedHeaderLayout({
      tableTop: -420,
      tableBottom: 660,
      tableWidth: 1460,
      theadHeight: 41,
      wrapperLeft: 80,
      wrapperClientWidth: 1180,
      wrapperScrollLeft: 0,
      effectiveStickyTop: 96
    });

    assert.equal(first.shouldPin, true);
    assert.equal(second.shouldPin, true);
    assert.equal(first.top, 96);
    assert.equal(second.top, 96);
    assert.equal(first.left, 80);
    assert.equal(first.clipLeft, 0);
    assert.equal(first.clipRight, 280);
    assert.equal(first.stickyRightShift, -280);
  });

  it('tracks horizontal scrollLeft and keeps sticky-right column flush to wrapper right edge', () => {
    const res = computeFixedHeaderLayout({
      tableTop: -120,
      tableBottom: 960,
      tableWidth: 1460,
      theadHeight: 41,
      wrapperLeft: 80,
      wrapperClientWidth: 1180,
      wrapperScrollLeft: 150,
      effectiveStickyTop: 96
    });

    assert.equal(res.shouldPin, true);
    assert.equal(res.left, -70);
    assert.equal(res.clipLeft, 150);
    assert.equal(res.clipRight, 130);
    assert.equal(res.stickyRightShift, -130);
  });

  it('glides out smoothly near the bottom of the table and unpins once past bottom', () => {
    const nearBottom = computeFixedHeaderLayout({
      tableTop: -980,
      tableBottom: 120,
      tableWidth: 1460,
      theadHeight: 41,
      wrapperLeft: 80,
      wrapperClientWidth: 1180,
      wrapperScrollLeft: 0,
      effectiveStickyTop: 96
    });

    assert.equal(nearBottom.shouldPin, true);
    assert.equal(nearBottom.top, 79);

    const pastBottom = computeFixedHeaderLayout({
      tableTop: -1020,
      tableBottom: 90,
      tableWidth: 1460,
      theadHeight: 41,
      wrapperLeft: 80,
      wrapperClientWidth: 1180,
      wrapperScrollLeft: 0,
      effectiveStickyTop: 96
    });

    assert.equal(pastBottom.shouldPin, false);
  });

  it('adjusts coordinates cleanly when inside a transformed fixed containing block', () => {
    const res = computeFixedHeaderLayout({
      tableTop: 40,
      tableBottom: 800,
      tableWidth: 1200,
      theadHeight: 40,
      wrapperLeft: 100,
      wrapperClientWidth: 1000,
      wrapperScrollLeft: 50,
      effectiveStickyTop: 96,
      fixedOriginTop: 32,
      fixedOriginLeft: 24
    });

    assert.equal(res.shouldPin, true);
    assert.equal(res.top, 64);
    assert.equal(res.left, 26);
    assert.equal(res.clipLeft, 50);
    assert.equal(res.clipRight, 150);
  });
});

describe('computeStickyHeaderOffset', () => {
  it('returns offset 0 when table header has not reached the sticky boundary', () => {
    const res = computeStickyHeaderOffset({
      tableTop: 180,
      tableBottom: 900,
      theadHeight: 44,
      effectiveStickyTop: 64
    });

    assert.equal(res.offset, 0);
    assert.equal(res.isStuck, false);
  });

  it('clamps offset at the bottom of the table and never overlaps tfoot', () => {
    const res = computeStickyHeaderOffset({
      tableTop: -500,
      tableBottom: 140,
      theadHeight: 44,
      tfootHeight: 40,
      effectiveStickyTop: 64
    });

    assert.equal(res.offset, 556);
    assert.equal(res.isStuck, true);
  });
});

describe('resolveOpaqueHeaderBg', () => {
  it('makes semi-transparent bg-slate-50/80 fully opaque over white', () => {
    const bg = resolveOpaqueHeaderBg('rgba(0, 0, 0, 0)', 'rgba(248, 250, 252, 0.8)');
    assert.equal(bg, 'rgb(249, 251, 253)');
  });

  it('preserves tinted th colors (e.g. bg-blue-50/50 over bg-slate-50/90) as solid opaque RGB', () => {
    const bg = resolveOpaqueHeaderBg('rgba(239, 246, 255, 0.5)', 'rgba(248, 250, 252, 0.9)');
    assert.equal(bg, 'rgb(244, 249, 254)');
  });

  it('supports modern CSS color(srgb ...) syntax', () => {
    const bg = resolveOpaqueHeaderBg('color(srgb 0.945 0.96 0.976 / 1)', 'transparent');
    assert.equal(bg, 'rgb(241, 245, 249)');
  });
});

describe('classifyTableAncestor', () => {
  it('never marks an explicit overflow-y-auto modal body as a blocking clip ancestor while loading', () => {
    const res = classifyTableAncestor({
      classList: ['overflow-y-auto', 'overscroll-contain', 'flex-1'],
      overflowX: 'auto',
      overflowY: 'auto',
      scrollHeight: 320,
      clientHeight: 600,
      hasVerticalScrollAncestor: false
    });

    assert.equal(res.isExplicitVerticalScroller, true);
    assert.equal(res.isVerticallyScrollable, true);
    assert.equal(res.isBlockingAncestor, false);
    assert.equal(res.isExplicitXWrapper, false);
  });

  it('still converts non-scrolling overflow-x-auto and overflow-hidden card wrappers to clip ancestors', () => {
    const xWrap = classifyTableAncestor({
      classList: ['overflow-x-auto'],
      overflowX: 'auto',
      overflowY: 'auto',
      scrollHeight: 400,
      clientHeight: 400,
      hasVerticalScrollAncestor: false
    });
    assert.equal(xWrap.isExplicitXWrapper, true);
    assert.equal(xWrap.isVerticallyScrollable, false);
    assert.equal(xWrap.isBlockingAncestor, true);

    const card = classifyTableAncestor({
      classList: ['bg-white', 'rounded-xl', 'overflow-hidden'],
      overflowX: 'hidden',
      overflowY: 'hidden',
      scrollHeight: 400,
      clientHeight: 400,
      hasVerticalScrollAncestor: false
    });
    assert.equal(card.isVerticallyScrollable, false);
    assert.equal(card.isBlockingAncestor, true);
  });

  it('recognizes inner table box with both overflow-x-auto and overflow-y-auto as a vertical scroller and xWrapper', () => {
    const innerBox = classifyTableAncestor({
      classList: ['max-h-[54dvh]', 'overflow-x-auto', 'overflow-y-auto'],
      overflowX: 'auto',
      overflowY: 'auto',
      scrollHeight: 200,
      clientHeight: 400,
      hasVerticalScrollAncestor: false
    });
    assert.equal(innerBox.isExplicitVerticalScroller, true);
    assert.equal(innerBox.isExplicitXWrapper, true);
    assert.equal(innerBox.isVerticallyScrollable, true);
    assert.equal(innerBox.isBlockingAncestor, false);
  });
});
