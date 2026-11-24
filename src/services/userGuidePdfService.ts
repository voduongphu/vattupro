import { jsPDF } from 'jspdf';
import type { AppLanguage } from '../context/LanguageContext';
import {
  buildUserGuidePdfFileName,
  type UserGuideSection
} from '../utils/userGuideData';

const PAGE_W = 1240;
const PAGE_H = 1754;
const MARGIN_X = 84;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const TOP_CONTENT_Y = 108;
const BOTTOM_LIMIT_Y = PAGE_H - 96;
const FONT_FAMILY = '"Plus Jakarta Sans", "Segoe UI", system-ui, -apple-system, sans-serif';

interface PageCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [''];
  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
        current = '';
      }
      if (ctx.measureText(word).width <= maxWidth) {
        current = word;
      } else {
        // Fallback split for extra-long unbroken tokens
        let chunk = '';
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width <= maxWidth) {
            chunk += ch;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export async function exportUserGuidePdf(
  sections: UserGuideSection[],
  language: AppLanguage,
  exportedBy?: string
): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error('PDF export is only supported in a browser environment.');
  }

  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Proceed with fallback system fonts if font readiness check fails
    }
  }

  const pages: PageCanvas[] = [];
  let currentPage: PageCanvas | null = null;
  let cursorY = TOP_CONTENT_Y;

  const docTitle =
    language === 'en'
      ? 'USER GUIDE — LOGISTICS & INVENTORY MANAGEMENT'
      : 'HƯỚNG DẪN SỬ DỤNG HỆ THỐNG QUẢN LÝ KHO VẬT TƯ';

  const createNewPage = (isFirstPage: boolean) => {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to initialize canvas context for PDF export.');
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    if (isFirstPage) {
      // Clean dark slate cover header band
      drawRoundedRect(ctx, MARGIN_X, 56, CONTENT_W, 178, 16);
      ctx.fillStyle = '#0F172A';
      ctx.fill();

      ctx.fillStyle = '#93C5FD';
      ctx.font = `600 18px ${FONT_FAMILY}`;
      ctx.fillText(
        language === 'en'
          ? 'LOGISTICS & INVENTORY · OPERATIONS MANUAL'
          : 'LOGISTICS & INVENTORY · TÀI LIỆU NGHIỆP VỤ',
        MARGIN_X + 36,
        102
      );

      ctx.fillStyle = '#FFFFFF';
      ctx.font = `700 32px ${FONT_FAMILY}`;
      ctx.fillText(
        language === 'en'
          ? 'Application User Guide'
          : 'Hướng Dẫn Sử Dụng Ứng Dụng',
        MARGIN_X + 36,
        150
      );

      const dateStr = new Date().toLocaleDateString(
        language === 'en' ? 'en-US' : 'vi-VN'
      );
      const metaParts = [
        language === 'en'
          ? `${sections.length} Operational Chapters`
          : `${sections.length} Chương nghiệp vụ`,
        language === 'en' ? `Exported ${dateStr}` : `Xuất ngày ${dateStr}`
      ];
      if (exportedBy) {
        metaParts.push(exportedBy);
      }

      ctx.fillStyle = '#CBD5E1';
      ctx.font = `400 18px ${FONT_FAMILY}`;
      ctx.fillText(metaParts.join('  ·  '), MARGIN_X + 36, 198);

      cursorY = 266;
    } else {
      ctx.fillStyle = '#64748B';
      ctx.font = `600 16px ${FONT_FAMILY}`;
      ctx.fillText(docTitle, MARGIN_X, 64);

      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X, 82);
      ctx.lineTo(PAGE_W - MARGIN_X, 82);
      ctx.stroke();

      cursorY = TOP_CONTENT_Y;
    }

    const pageObj: PageCanvas = { canvas, ctx };
    pages.push(pageObj);
    currentPage = pageObj;
    return pageObj;
  };

  const ensureSpace = (neededH: number): PageCanvas => {
    if (!currentPage) {
      return createNewPage(true);
    }
    if (cursorY + neededH > BOTTOM_LIMIT_Y) {
      return createNewPage(false);
    }
    return currentPage;
  };

  createNewPage(true);

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const section = sections[sIdx];
    const measureCtx = currentPage!.ctx;

    measureCtx.font = `700 24px ${FONT_FAMILY}`;
    const titleLines = wrapLines(
      measureCtx,
      `${section.chapter}. ${section.title}`,
      CONTENT_W - 20
    );
    measureCtx.font = `400 19px ${FONT_FAMILY}`;
    const summaryLines = wrapLines(measureCtx, section.summary, CONTENT_W);

    const headerHeight =
      26 +
      titleLines.length * 32 +
      10 +
      summaryLines.length * 27 +
      18;

    const { ctx } = ensureSpace(Math.min(headerHeight + 80, 420));

    if (sIdx > 0 && cursorY > TOP_CONTENT_Y + 10) {
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X, cursorY);
      ctx.lineTo(PAGE_W - MARGIN_X, cursorY);
      ctx.stroke();
      cursorY += 26;
    }

    // Audience metadata line
    ctx.fillStyle = '#2563EB';
    ctx.font = `600 16px ${FONT_FAMILY}`;
    ctx.fillText(
      `${language === 'en' ? 'Scope' : 'Phạm vi'}: ${section.audienceLabel}`,
      MARGIN_X,
      cursorY
    );
    cursorY += 30;

    // Section title
    ctx.fillStyle = '#0F172A';
    ctx.font = `700 24px ${FONT_FAMILY}`;
    for (const line of titleLines) {
      ctx.fillText(line, MARGIN_X, cursorY);
      cursorY += 32;
    }
    cursorY += 6;

    // Section summary
    ctx.fillStyle = '#334155';
    ctx.font = `400 19px ${FONT_FAMILY}`;
    for (const line of summaryLines) {
      ctx.fillText(line, MARGIN_X, cursorY);
      cursorY += 27;
    }
    cursorY += 14;

    // Numbered steps
    for (let stIdx = 0; stIdx < section.steps.length; stIdx++) {
      const step = section.steps[stIdx];
      const activeCtx = currentPage!.ctx;
      const textLeft = MARGIN_X + 38;
      const textMaxW = CONTENT_W - 44;

      activeCtx.font = `600 19px ${FONT_FAMILY}`;
      const stepTitleLines = wrapLines(activeCtx, step.title, textMaxW);
      activeCtx.font = `400 18px ${FONT_FAMILY}`;
      const stepDescLines = wrapLines(activeCtx, step.description, textMaxW);

      const stepH =
        stepTitleLines.length * 26 + stepDescLines.length * 25 + 18;
      const pageForStep = ensureSpace(stepH);
      const sCtx = pageForStep.ctx;

      // Step number badge
      sCtx.fillStyle = '#EFF6FF';
      drawRoundedRect(sCtx, MARGIN_X, cursorY - 18, 28, 28, 7);
      sCtx.fill();
      sCtx.fillStyle = '#1D4ED8';
      sCtx.font = `700 16px ${FONT_FAMILY}`;
      const numStr = String(stIdx + 1);
      const numW = sCtx.measureText(numStr).width;
      sCtx.fillText(numStr, MARGIN_X + (28 - numW) / 2, cursorY + 2);

      sCtx.fillStyle = '#0F172A';
      sCtx.font = `600 19px ${FONT_FAMILY}`;
      for (const line of stepTitleLines) {
        sCtx.fillText(line, textLeft, cursorY);
        cursorY += 26;
      }

      sCtx.fillStyle = '#475569';
      sCtx.font = `400 18px ${FONT_FAMILY}`;
      for (const line of stepDescLines) {
        sCtx.fillText(line, textLeft, cursorY);
        cursorY += 25;
      }
      cursorY += 12;
    }

    // Key rules
    if (section.rules && section.rules.length > 0) {
      for (const rule of section.rules) {
        const activeCtx = currentPage!.ctx;
        activeCtx.font = `600 18px ${FONT_FAMILY}`;
        const labelLines = wrapLines(activeCtx, rule.label, CONTENT_W - 40);
        activeCtx.font = `400 17.5px ${FONT_FAMILY}`;
        const detailLines = wrapLines(activeCtx, rule.detail, CONTENT_W - 40);

        const boxH = 22 + labelLines.length * 25 + detailLines.length * 24 + 16;
        const pageForRule = ensureSpace(boxH + 10);
        const rCtx = pageForRule.ctx;

        drawRoundedRect(rCtx, MARGIN_X, cursorY - 14, CONTENT_W, boxH, 10);
        rCtx.fillStyle = '#F8FAFC';
        rCtx.fill();
        rCtx.strokeStyle = '#CBD5E1';
        rCtx.lineWidth = 1.25;
        rCtx.stroke();

        let innerY = cursorY + 12;
        rCtx.fillStyle = '#0F172A';
        rCtx.font = `600 18px ${FONT_FAMILY}`;
        for (const line of labelLines) {
          rCtx.fillText(line, MARGIN_X + 20, innerY);
          innerY += 25;
        }
        rCtx.fillStyle = '#475569';
        rCtx.font = `400 17.5px ${FONT_FAMILY}`;
        for (const line of detailLines) {
          rCtx.fillText(line, MARGIN_X + 20, innerY);
          innerY += 24;
        }

        cursorY += boxH + 10;
      }
    }

    // Structured reference table
    if (section.table && section.table.rows.length > 0) {
      const colCount = section.table.headers.length;
      const colWidths =
        colCount === 2
          ? [Math.round(CONTENT_W * 0.36), CONTENT_W - Math.round(CONTENT_W * 0.36)]
          : colCount === 3
            ? [
                Math.round(CONTENT_W * 0.32),
                Math.round(CONTENT_W * 0.34),
                CONTENT_W - Math.round(CONTENT_W * 0.32) - Math.round(CONTENT_W * 0.34)
              ]
            : Array(colCount).fill(Math.floor(CONTENT_W / colCount));

      const drawTableHeader = (tCtx: CanvasRenderingContext2D) => {
        tCtx.font = `700 17px ${FONT_FAMILY}`;
        const wrappedHeaders = section.table!.headers.map((h, idx) =>
          wrapLines(tCtx, h, colWidths[idx] - 24)
        );
        const maxLines = Math.max(...wrappedHeaders.map((l) => l.length));
        const headerH = maxLines * 24 + 20;

        tCtx.fillStyle = '#F1F5F9';
        tCtx.fillRect(MARGIN_X, cursorY, CONTENT_W, headerH);
        tCtx.strokeStyle = '#CBD5E1';
        tCtx.lineWidth = 1;
        tCtx.strokeRect(MARGIN_X, cursorY, CONTENT_W, headerH);

        let colX = MARGIN_X;
        tCtx.fillStyle = '#0F172A';
        for (let c = 0; c < colCount; c++) {
          if (c > 0) {
            tCtx.beginPath();
            tCtx.moveTo(colX, cursorY);
            tCtx.lineTo(colX, cursorY + headerH);
            tCtx.stroke();
          }
          let ty = cursorY + 25;
          for (const line of wrappedHeaders[c]) {
            tCtx.fillText(line, colX + 12, ty);
            ty += 24;
          }
          colX += colWidths[c];
        }
        cursorY += headerH;
      };

      const firstPageForTable = ensureSpace(120);
      cursorY += 4;
      drawTableHeader(firstPageForTable.ctx);

      for (const row of section.table.rows) {
        const measureTableCtx = currentPage!.ctx;
        measureTableCtx.font = `400 17px ${FONT_FAMILY}`;
        const wrappedCells = row.map((cell, idx) =>
          wrapLines(measureTableCtx, cell, colWidths[idx] - 24)
        );
        const maxLines = Math.max(...wrappedCells.map((l) => l.length));
        const rowH = maxLines * 24 + 18;

        if (cursorY + rowH > BOTTOM_LIMIT_Y) {
          const nextPage = createNewPage(false);
          drawTableHeader(nextPage.ctx);
        }

        const rCtx = currentPage!.ctx;
        rCtx.fillStyle = '#FFFFFF';
        rCtx.fillRect(MARGIN_X, cursorY, CONTENT_W, rowH);
        rCtx.strokeStyle = '#E2E8F0';
        rCtx.lineWidth = 1;
        rCtx.strokeRect(MARGIN_X, cursorY, CONTENT_W, rowH);

        let colX = MARGIN_X;
        for (let c = 0; c < colCount; c++) {
          if (c > 0) {
            rCtx.beginPath();
            rCtx.moveTo(colX, cursorY);
            rCtx.lineTo(colX, cursorY + rowH);
            rCtx.stroke();
          }
          rCtx.fillStyle = c === 0 ? '#0F172A' : '#334155';
          rCtx.font = `${c === 0 ? 600 : 400} 17px ${FONT_FAMILY}`;
          let ty = cursorY + 24;
          for (const line of wrappedCells[c]) {
            rCtx.fillText(line, colX + 12, ty);
            ty += 24;
          }
          colX += colWidths[c];
        }
        cursorY += rowH;
      }
      cursorY += 14;
    }

    cursorY += 16;
  }

  // Stamp page numbers & clean footers across all generated pages
  const totalPages = pages.length;
  for (let i = 0; i < totalPages; i++) {
    const { ctx } = pages[i];
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, PAGE_H - 68);
    ctx.lineTo(PAGE_W - MARGIN_X, PAGE_H - 68);
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = `400 16px ${FONT_FAMILY}`;
    ctx.fillText(docTitle, MARGIN_X, PAGE_H - 38);

    const pageLabel =
      language === 'en'
        ? `Page ${i + 1} / ${totalPages}`
        : `Trang ${i + 1} / ${totalPages}`;
    const labelW = ctx.measureText(pageLabel).width;
    ctx.fillText(pageLabel, PAGE_W - MARGIN_X - labelW, PAGE_H - 38);
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  pdf.setProperties({
    title: docTitle,
    subject: 'Logistics & Inventory Management User Guide',
    creator: 'Logistics & Inventory System'
  });

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage('a4', 'portrait');
    const imgData = pages[i].canvas.toDataURL('image/jpeg', 0.92);
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  }

  const fileName = buildUserGuidePdfFileName(language);
  pdf.save(fileName);
  return fileName;
}
