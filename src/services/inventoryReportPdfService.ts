import { jsPDF } from 'jspdf';
import {
  FM09_DEFAULT_MIN_ROWS,
  FM09_EFFECTIVE_DATE,
  FM09_FORM_CODE,
  Fm09QuantityReport,
  buildFm09PdfFileName,
  formatFm09DateRange,
  formatFm09Qty
} from '../utils/inventoryReportFm09';

export interface Fm09PdfExportOptions {
  departmentName?: string;
  startDate?: string;
  endDate?: string;
  reporterName?: string;
  departmentHeadName?: string;
  showTotalsRow?: boolean;
  extraBlankRows?: number;
  minDisplayRows?: number;
}

// A4 Landscape at 200 DPI (297mm × 210mm)
const PAGE_W = 2339;
const PAGE_H = 1654;
const MARGIN_X = 78; // ~10mm left/right
const MARGIN_TOP = 64; // ~8mm top
const MARGIN_BOTTOM = 76; // ~9.5mm bottom
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const BOTTOM_LIMIT_Y = PAGE_H - MARGIN_BOTTOM;

const SERIF_FONT = '"Times New Roman", "Liberation Serif", Times, Georgia, serif';

// 10 columns totaling 100% of CONTENT_W matching QN-OPR-PR11-FM09 proportions
const COL_WEIGHTS = [
  0.038, // 0: STT
  0.105, // 1: MÃ VẬT TƯ
  0.242, // 2: TÊN VẬT TƯ
  0.055, // 3: ĐVT
  0.088, // 4: TỒN ĐẦU KỲ
  0.088, // 5: TỔNG NHẬP
  0.095, // 6: TỔNG NHẬP TRẢ
  0.088, // 7: TỔNG XUẤT
  0.113, // 8: TỔNG XUẤT ĐIỀU CHUYỂN
  0.088 // 9: TỒN CUỐI KỲ
];

interface PageCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

function computeColWidths(totalWidth: number): number[] {
  const widths = COL_WEIGHTS.map((w) => Math.floor(totalWidth * w));
  const used = widths.reduce((sum, w) => sum + w, 0);
  // Assign rounding remainder to TÊN VẬT TƯ column
  widths[2] += totalWidth - used;
  return widths;
}

function wrapCellText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const cleaned = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!cleaned) return [''];

  const paragraphs = cleaned.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

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
          // Break long unbroken codes cleanly at character boundary
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
  }

  return lines.length > 0 ? lines : [''];
}

function drawCenteredTextBlock(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  w: number,
  h: number,
  lineHeight: number
) {
  const totalTextH = lines.length * lineHeight;
  let drawY = y + (h - totalTextH) / 2 + lineHeight * 0.78;
  ctx.textAlign = 'center';
  for (const line of lines) {
    ctx.fillText(line, x + w / 2, drawY);
    drawY += lineHeight;
  }
}

function drawAlignedCellText(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  w: number,
  h: number,
  lineHeight: number,
  align: 'left' | 'center' | 'right',
  padX: number
) {
  const totalTextH = lines.length * lineHeight;
  let drawY = y + (h - totalTextH) / 2 + lineHeight * 0.78;
  ctx.textAlign = align;
  const anchorX =
    align === 'center' ? x + w / 2 : align === 'right' ? x + w - padX : x + padX;

  for (const line of lines) {
    ctx.fillText(line, anchorX, drawY);
    drawY += lineHeight;
  }
}

/**
 * Generates and downloads an A4 Landscape PDF matching official PTSC Quang Ngai
 * form QN-OPR-PR11-FM09 (Báo cáo Nhập Xuất Tồn - Số lượng).
 */
export async function exportInventoryReportFm09Pdf(
  report: Fm09QuantityReport,
  options: Fm09PdfExportOptions = {}
): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error('Xuất PDF chỉ hỗ trợ trên trình duyệt.');
  }

  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Fall back smoothly if font readiness rejects
    }
  }

  const colWidths = computeColWidths(CONTENT_W);
  const colXs: number[] = [];
  let runningX = MARGIN_X;
  for (let i = 0; i < colWidths.length; i++) {
    colXs.push(runningX);
    runningX += colWidths[i];
  }

  const showTotalsRow = options.showTotalsRow ?? true;
  const minDisplayRows = Math.max(0, options.minDisplayRows ?? FM09_DEFAULT_MIN_ROWS);
  const extraBlankRows = Math.max(0, Math.min(30, options.extraBlankRows ?? 0));
  const paddedBlankCount =
    report.rows.length < minDisplayRows
      ? minDisplayRows - report.rows.length + extraBlankRows
      : extraBlankRows;

  const trimmedDept = (options.departmentName || '').trim();
  const departmentLine = trimmedDept
    ? `Bộ phận: ${trimmedDept}`
    : 'Bộ phận:....................';
  const dateRangeLine = formatFm09DateRange(options.startDate, options.endDate);

  const pages: PageCanvas[] = [];
  let currentPage: PageCanvas | null = null;
  let cursorY = MARGIN_TOP;

  const HEADER_TOP_ROW_H = 54;
  const HEADER_SUB_ROW_H = 82;
  const TOTAL_THEAD_H = HEADER_TOP_ROW_H + HEADER_SUB_ROW_H;
  const DATA_LINE_H = 31;
  const MIN_DATA_ROW_H = 44;
  const CELL_PAD_X = 12;
  const CELL_PAD_Y = 8;

  const drawTableHeader = (ctx: CanvasRenderingContext2D, topY: number): number => {
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#000000';

    // Outer thick header frame
    ctx.lineWidth = 2.4;
    ctx.strokeRect(MARGIN_X, topY, CONTENT_W, TOTAL_THEAD_H);

    // Inner grid lines
    ctx.lineWidth = 1.4;

    // Vertical dividers for columns 1..4 (full height of thead)
    for (let c = 1; c <= 4; c++) {
      ctx.beginPath();
      ctx.moveTo(colXs[c], topY);
      ctx.lineTo(colXs[c], topY + TOTAL_THEAD_H);
      ctx.stroke();
    }

    // Horizontal divider under "SỐ LƯỢNG" spanning columns 4..9
    const qtyStartX = colXs[4];
    const qtyEndX = MARGIN_X + CONTENT_W;
    ctx.beginPath();
    ctx.moveTo(qtyStartX, topY + HEADER_TOP_ROW_H);
    ctx.lineTo(qtyEndX, topY + HEADER_TOP_ROW_H);
    ctx.stroke();

    // Vertical dividers between the 6 sub-columns under "SỐ LƯỢNG"
    for (let c = 5; c < 10; c++) {
      ctx.beginPath();
      ctx.moveTo(colXs[c], topY + HEADER_TOP_ROW_H);
      ctx.lineTo(colXs[c], topY + TOTAL_THEAD_H);
      ctx.stroke();
    }

    // Subtle double-line bottom separator under header matching FM09 template
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, topY + TOTAL_THEAD_H);
    ctx.lineTo(MARGIN_X + CONTENT_W, topY + TOTAL_THEAD_H);
    ctx.stroke();

    // Header labels
    ctx.font = `700 24px ${SERIF_FONT}`;
    drawCenteredTextBlock(ctx, ['STT'], colXs[0], topY, colWidths[0], TOTAL_THEAD_H, 28);
    drawCenteredTextBlock(ctx, ['MÃ VẬT TƯ'], colXs[1], topY, colWidths[1], TOTAL_THEAD_H, 28);
    drawCenteredTextBlock(ctx, ['TÊN VẬT TƯ'], colXs[2], topY, colWidths[2], TOTAL_THEAD_H, 28);
    drawCenteredTextBlock(ctx, ['ĐVT'], colXs[3], topY, colWidths[3], TOTAL_THEAD_H, 28);

    const qtyGroupW = qtyEndX - qtyStartX;
    drawCenteredTextBlock(ctx, ['SỐ LƯỢNG'], qtyStartX, topY, qtyGroupW, HEADER_TOP_ROW_H, 28);

    ctx.font = `700 23px ${SERIF_FONT}`;
    const subHeaders: string[][] = [
      ['TỒN ĐẦU KỲ'],
      ['TỔNG NHẬP'],
      ['TỔNG NHẬP TRẢ'],
      ['TỔNG XUẤT'],
      ['TỔNG XUẤT ĐIỀU', 'CHUYỂN'],
      ['TỒN CUỐI KỲ']
    ];
    for (let i = 0; i < subHeaders.length; i++) {
      const colIdx = 4 + i;
      drawCenteredTextBlock(
        ctx,
        subHeaders[i],
        colXs[colIdx],
        topY + HEADER_TOP_ROW_H,
        colWidths[colIdx],
        HEADER_SUB_ROW_H,
        29
      );
    }

    ctx.restore();
    return topY + TOTAL_THEAD_H;
  };

  const createNewPage = (isFirstPage: boolean): PageCanvas => {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Không thể khởi tạo khung vẽ PDF.');
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'alphabetic';

    if (isFirstPage) {
      // 1. Top-right Form Control Code
      ctx.font = `400 22px ${SERIF_FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(FM09_FORM_CODE, MARGIN_X + CONTENT_W, MARGIN_TOP + 16);
      ctx.fillText(FM09_EFFECTIVE_DATE, MARGIN_X + CONTENT_W, MARGIN_TOP + 44);

      // 2. Company & National Motto row
      const orgTopY = MARGIN_TOP + 92;
      const leftCenterX = MARGIN_X + CONTENT_W * 0.27;
      const rightCenterX = MARGIN_X + CONTENT_W * 0.77;

      ctx.textAlign = 'center';
      ctx.font = `400 25px ${SERIF_FONT}`;
      ctx.fillText(
        'CÔNG TY CỔ PHẦN DỊCH VỤ DẦU KHÍ QUẢNG NGÃI PTSC',
        leftCenterX,
        orgTopY
      );

      ctx.font = `700 25px ${SERIF_FONT}`;
      ctx.fillText(departmentLine, leftCenterX, orgTopY + 36);

      ctx.font = `700 25px ${SERIF_FONT}`;
      ctx.fillText('Cộng Hòa Xã Hội Chủ Nghĩa Việt Nam', rightCenterX, orgTopY);
      ctx.fillText('Độc lập - Tự do - Hạnh phúc', rightCenterX, orgTopY + 36);

      // 3. Report Title & Date Range
      const titleY = orgTopY + 106;
      ctx.textAlign = 'center';
      ctx.font = `700 32px ${SERIF_FONT}`;
      ctx.fillText('BÁO CÁO NHẬP XUẤT TỒN', PAGE_W / 2, titleY);

      ctx.font = `italic 700 25px ${SERIF_FONT}`;
      ctx.fillText(dateRangeLine, PAGE_W / 2, titleY + 36);

      cursorY = titleY + 68;
    } else {
      // Compact continuation header on page 2+
      ctx.font = `400 20px ${SERIF_FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`BÁO CÁO NHẬP XUẤT TỒN (${dateRangeLine})`, MARGIN_X, MARGIN_TOP + 14);
      ctx.textAlign = 'right';
      ctx.fillText(`${FM09_FORM_CODE} · ${FM09_EFFECTIVE_DATE}`, MARGIN_X + CONTENT_W, MARGIN_TOP + 14);
      cursorY = MARGIN_TOP + 34;
    }

    const pageObj: PageCanvas = { canvas, ctx };
    pages.push(pageObj);
    currentPage = pageObj;
    cursorY = drawTableHeader(ctx, cursorY);
    return pageObj;
  };

  const drawTableRow = (
    cells: string[],
    alignments: Array<'left' | 'center' | 'right'>,
    optionsRow: { isBold?: boolean; isTotals?: boolean } = {}
  ) => {
    const activeCtx = currentPage!.ctx;
    const fontSpec = `${optionsRow.isBold ? 700 : 400} 23px ${SERIF_FONT}`;
    activeCtx.font = fontSpec;

    const wrapped = cells.map((text, idx) =>
      wrapCellText(activeCtx, text, Math.max(24, colWidths[idx] - CELL_PAD_X * 2))
    );
    const maxLines = Math.max(1, ...wrapped.map((l) => l.length));
    const rowH = Math.max(MIN_DATA_ROW_H, maxLines * DATA_LINE_H + CELL_PAD_Y * 2);

    if (cursorY + rowH > BOTTOM_LIMIT_Y) {
      createNewPage(false);
    }

    const ctx = currentPage!.ctx;
    ctx.save();

    if (optionsRow.isTotals) {
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(MARGIN_X, cursorY, CONTENT_W, rowH);
    }

    // Horizontal & outer borders
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = optionsRow.isTotals ? 2.0 : 1.3;
    ctx.strokeRect(MARGIN_X, cursorY, CONTENT_W, rowH);

    // Outer left/right crisp borders
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, cursorY);
    ctx.lineTo(MARGIN_X, cursorY + rowH);
    ctx.moveTo(MARGIN_X + CONTENT_W, cursorY);
    ctx.lineTo(MARGIN_X + CONTENT_W, cursorY + rowH);
    ctx.stroke();

    // Inner column vertical lines
    ctx.lineWidth = 1.3;
    if (optionsRow.isTotals) {
      // Merge columns 0..3 for "TỔNG CỘNG" label, separate columns 4..9
      for (let c = 4; c < 10; c++) {
        ctx.beginPath();
        ctx.moveTo(colXs[c], cursorY);
        ctx.lineTo(colXs[c], cursorY + rowH);
        ctx.stroke();
      }
    } else {
      for (let c = 1; c < 10; c++) {
        ctx.beginPath();
        ctx.moveTo(colXs[c], cursorY);
        ctx.lineTo(colXs[c], cursorY + rowH);
        ctx.stroke();
      }
    }

    // Cell text
    ctx.fillStyle = '#000000';
    ctx.font = fontSpec;
    if (optionsRow.isTotals) {
      const mergedW = colXs[4] - MARGIN_X;
      drawAlignedCellText(
        ctx,
        ['TỔNG CỘNG'],
        MARGIN_X,
        cursorY,
        mergedW,
        rowH,
        DATA_LINE_H,
        'center',
        CELL_PAD_X
      );
      for (let c = 4; c < 10; c++) {
        drawAlignedCellText(
          ctx,
          wrapped[c],
          colXs[c],
          cursorY,
          colWidths[c],
          rowH,
          DATA_LINE_H,
          alignments[c],
          CELL_PAD_X
        );
      }
    } else {
      for (let c = 0; c < 10; c++) {
        drawAlignedCellText(
          ctx,
          wrapped[c],
          colXs[c],
          cursorY,
          colWidths[c],
          rowH,
          DATA_LINE_H,
          alignments[c],
          CELL_PAD_X
        );
      }
    }

    ctx.restore();
    cursorY += rowH;
  };

  // Start page 1
  createNewPage(true);

  const dataAlignments: Array<'left' | 'center' | 'right'> = [
    'center',
    'center',
    'left',
    'center',
    'right',
    'right',
    'right',
    'right',
    'right',
    'right'
  ];

  // Draw all quantity rows
  for (let i = 0; i < report.rows.length; i++) {
    const row = report.rows[i];
    drawTableRow(
      [
        String(i + 1),
        row.materialCode,
        row.materialName,
        row.unit,
        formatFm09Qty(row.openingQuantity),
        formatFm09Qty(row.inboundQuantity),
        formatFm09Qty(row.returnInboundQuantity),
        formatFm09Qty(row.outboundQuantity),
        formatFm09Qty(row.transferOutboundQuantity),
        formatFm09Qty(row.closingQuantity)
      ],
      dataAlignments
    );
  }

  // Draw numbered blank padding rows (matching 1..13 template look)
  for (let b = 0; b < paddedBlankCount; b++) {
    drawTableRow(
      [
        String(report.rows.length + b + 1),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        ''
      ],
      dataAlignments
    );
  }

  // Optional bold totals row
  if (showTotalsRow && report.rows.length > 0) {
    drawTableRow(
      [
        '',
        '',
        '',
        '',
        formatFm09Qty(report.totals.openingQuantity),
        formatFm09Qty(report.totals.inboundQuantity),
        formatFm09Qty(report.totals.returnInboundQuantity),
        formatFm09Qty(report.totals.outboundQuantity),
        formatFm09Qty(report.totals.transferOutboundQuantity),
        formatFm09Qty(report.totals.closingQuantity)
      ],
      dataAlignments,
      { isBold: true, isTotals: true }
    );
  }

  // Reinforce bottom crisp outer border of the table on the current page
  {
    const ctx = currentPage!.ctx;
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, cursorY);
    ctx.lineTo(MARGIN_X + CONTENT_W, cursorY);
    ctx.stroke();
    ctx.restore();
  }

  // Draw signature block (move to fresh page if not enough vertical room)
  const SIGNATURE_BLOCK_H = 225;
  if (cursorY + SIGNATURE_BLOCK_H > BOTTOM_LIMIT_Y) {
    // Add clean continuation page without repeating empty table header for signatures
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Không thể khởi tạo trang chữ ký PDF.');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.fillStyle = '#000000';
    ctx.font = `400 20px ${SERIF_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`BÁO CÁO NHẬP XUẤT TỒN (${dateRangeLine})`, MARGIN_X, MARGIN_TOP + 14);
    ctx.textAlign = 'right';
    ctx.fillText(`${FM09_FORM_CODE} · ${FM09_EFFECTIVE_DATE}`, MARGIN_X + CONTENT_W, MARGIN_TOP + 14);
    const sigPage: PageCanvas = { canvas, ctx };
    pages.push(sigPage);
    currentPage = sigPage;
    cursorY = MARGIN_TOP + 70;
  }

  {
    const ctx = currentPage!.ctx;
    const sigTopY = cursorY + 62;
    const leftSigX = MARGIN_X + CONTENT_W * 0.16;
    const rightSigX = MARGIN_X + CONTENT_W * 0.82;

    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';

    ctx.font = `700 25px ${SERIF_FONT}`;
    ctx.fillText('Người báo cáo', leftSigX, sigTopY);
    ctx.fillText('Trưởng Bộ phận', rightSigX, sigTopY);

    ctx.font = `italic 400 24px ${SERIF_FONT}`;
    ctx.fillText('(Ký, ghi rõ họ tên)', leftSigX, sigTopY + 34);
    ctx.fillText('(Ký, ghi rõ họ tên)', rightSigX, sigTopY + 34);

    const reporterName = (options.reporterName || '').trim();
    const deptHeadName = (options.departmentHeadName || '').trim();
    if (reporterName || deptHeadName) {
      ctx.font = `700 24px ${SERIF_FONT}`;
      if (reporterName) {
        ctx.fillText(reporterName, leftSigX, sigTopY + 178);
      }
      if (deptHeadName) {
        ctx.fillText(deptHeadName, rightSigX, sigTopY + 178);
      }
    }
    ctx.restore();
  }

  // Stamp subtle page numbers when spanning multiple pages
  if (pages.length > 1) {
    for (let i = 0; i < pages.length; i++) {
      const { ctx } = pages[i];
      ctx.save();
      ctx.fillStyle = '#334155';
      ctx.font = `italic 400 20px ${SERIF_FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(`Trang ${i + 1} / ${pages.length}`, MARGIN_X + CONTENT_W, PAGE_H - 30);
      ctx.restore();
    }
  }

  // Assemble A4 Landscape PDF (297mm × 210mm)
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  pdf.setProperties({
    title: `Báo Cáo Nhập Xuất Tồn (${FM09_FORM_CODE})`,
    subject: 'Báo Cáo Nhập Xuất Tồn Theo Số Lượng - Mẫu QN-OPR-PR11-FM09',
    creator: 'PTSC Quang Ngai Inventory Management'
  });

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage('a4', 'landscape');
    const imgData = pages[i].canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 0, 297, 210, undefined, 'FAST');
  }

  const fileName = buildFm09PdfFileName(options.startDate, options.endDate);
  pdf.save(fileName);
  return fileName;
}
