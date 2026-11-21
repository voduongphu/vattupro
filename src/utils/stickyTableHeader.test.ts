import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeStickyHeaderOffset, resolveOpaqueHeaderBg } from './stickyTableHeader';

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

  it('sticks flush right below the main Navbar when scrolling a tab table', () => {
    const res = computeStickyHeaderOffset({
      tableTop: -120,
      tableBottom: 700,
      theadHeight: 44,
      effectiveStickyTop: 64
    });

    assert.equal(res.offset, 184);
    assert.equal(res.isStuck, true);
  });

  it('sticks flush right below the modal header even when modal body has top padding', () => {
    // Modal header ends at y=96; user scrolled form so tableTop is now at y=36
    const res = computeStickyHeaderOffset({
      tableTop: 36,
      tableBottom: 680,
      theadHeight: 40,
      effectiveStickyTop: 96
    });

    assert.equal(res.offset, 60);
    assert.equal(res.isStuck, true);
  });

  it('clamps offset at the bottom of the table and never overlaps tfoot', () => {
    const res = computeStickyHeaderOffset({
      tableTop: -500,
      tableBottom: 140,
      theadHeight: 44,
      tfootHeight: 40,
      effectiveStickyTop: 64
    });

    // effectiveBottom = 100; maxOffset = 100 - 44 - (-500) = 556
    assert.equal(res.offset, 556);
    assert.equal(res.isStuck, true);
  });

  it('returns 0 when table is too short to scroll past header + footer', () => {
    const res = computeStickyHeaderOffset({
      tableTop: 20,
      tableBottom: 60,
      theadHeight: 40,
      effectiveStickyTop: 64
    });

    assert.equal(res.offset, 0);
    assert.equal(res.isStuck, false);
  });

  it('avoids double-shifting when native CSS sticky is active inside an inner scrollbox', () => {
    // Inner max-h-96 box is at y=300 (below modal header at y=120), scrolled down by 100px
    const res = computeStickyHeaderOffset({
      tableTop: 200,
      tableBottom: 800,
      theadHeight: 40,
      effectiveStickyTop: 300,
      nativeStickyTop: 300,
      maxContainerBottom: 680
    });

    assert.equal(res.offset, 0);
    assert.equal(res.isStuck, true);
  });

  it('adds only the outer delta when outer modal body scrolls a CSS-sticky inner box past modal header', () => {
    // Modal header ends at y=120; inner max-h-96 box scrolled up to y=50, inner box also scrolled 100px
    const res = computeStickyHeaderOffset({
      tableTop: -50,
      tableBottom: 600,
      theadHeight: 40,
      effectiveStickyTop: 120,
      nativeStickyTop: 50,
      maxContainerBottom: 430
    });

    assert.equal(res.offset, 70);
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

  it('preserves solid rgb backgrounds verbatim', () => {
    const bg = resolveOpaqueHeaderBg('rgb(236, 253, 245)', 'rgba(248, 250, 252, 0.9)');
    assert.equal(bg, 'rgb(236, 253, 245)');
  });

  it('supports modern CSS color(srgb ...) syntax', () => {
    const bg = resolveOpaqueHeaderBg('color(srgb 0.945 0.96 0.976 / 1)', 'transparent');
    assert.equal(bg, 'rgb(241, 245, 249)');
  });

  it('returns fallback when both th and thead backgrounds are transparent', () => {
    const bg = resolveOpaqueHeaderBg('transparent', 'rgba(0, 0, 0, 0)', '#f1f5f9');
    assert.equal(bg, '#f1f5f9');
  });
});
