import type {
  InboundItemDetail,
  InventoryStockRecord,
  MaterialItem,
  OutboundItemDetail
} from '../types/inventory';
import { roundQty } from './additiveMerge';

export type InboundPasteField =
  | 'materialCode'
  | 'materialName'
  | 'packageNo'
  | 'batchCode'
  | 'drawingNo'
  | 'quantity'
  | 'unit'
  | 'weightKg'
  | 'unitPrice'
  | 'storageLocation'
  | 'note';

export const INBOUND_PASTE_COLUMN_ORDER: readonly InboundPasteField[] = [
  'materialCode',
  'materialName',
  'packageNo',
  'batchCode',
  'drawingNo',
  'quantity',
  'unit',
  'weightKg',
  'unitPrice',
  'storageLocation',
  'note'
];

/**
 * Phân tích dữ liệu TSV copy từ Excel/Google Sheets (hỗ trợ ô có dấu ngoặc kép,
 * xuống dòng bên trong ô trích dẫn, ký tự xuống dòng CRLF/LF/CR và bỏ các dòng trắng ở cuối).
 */
export function parseExcelClipboardGrid(rawText: string): string[][] {
  if (!rawText) return [];

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];

    if (inQuotes) {
      if (ch === '"') {
        if (rawText[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"' && currentCell.length === 0) {
      inQuotes = true;
      continue;
    }

    if (ch === '\t') {
      currentRow.push(currentCell.replace(/[\r\n]+/g, ' ').trim());
      currentCell = '';
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && rawText[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentCell.replace(/[\r\n]+/g, ' ').trim());
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += ch;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.replace(/[\r\n]+/g, ' ').trim());
    rows.push(currentRow);
  }

  // Loại bỏ các dòng hoàn toàn rỗng ở cuối (Excel thường kèm 1 ký tự \r\n cuối cùng khi copy)
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell === '')) {
    rows.pop();
  }

  // Nếu người dùng copy kèm dòng rỗng ở đầu thì bỏ qua dòng rỗng đầu để tránh bỏ trống dòng hiện tại
  while (rows.length > 0 && rows[0].every((cell) => cell === '')) {
    rows.shift();
  }

  return rows;
}

/**
 * Xác định xem nội dung dán có phải là dữ liệu nhiều dòng hoặc nhiều cột từ Excel hay không.
 * Dán 1 ô đơn lẻ trả về false để trình duyệt xử lý nhập văn bản mặc định.
 */
export function shouldHandleBulkExcelPaste(rawText: string): boolean {
  if (!rawText) return false;
  if (!rawText.includes('\n') && !rawText.includes('\r') && !rawText.includes('\t')) {
    return false;
  }
  const grid = parseExcelClipboardGrid(rawText);
  if (grid.length === 0) return false;
  if (grid.length > 1) return true;
  return grid[0].length > 1;
}

/**
 * Chuẩn hóa số từ ô Excel (hỗ trợ cả định dạng Việt Nam 1.250,5 và quốc tế 1,250.5).
 */
export function parsePastedNumber(raw: string): number | null {
  const cleaned = String(raw || '')
    .replace(/[\s\u00A0]/g, '')
    .replace(/(?:vnđ|vnd|đ|₫|kg)$/i, '')
    .trim();
  if (!cleaned) return null;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;

  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      // Định dạng VN/EU: 1.250,50
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // Định dạng US: 1,250.50
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = cleaned.split(',');
    if (parts.length > 2) {
      // Nhiều dấu phẩy: 1,250,000
      normalized = cleaned.replace(/,/g, '');
    } else {
      const [intPart, decPart] = parts;
      const isThousands =
        decPart.length === 3 &&
        intPart.replace(/^-/, '').length >= 1 &&
        intPart.replace(/^-/, '') !== '0';
      normalized = isThousands ? `${intPart}${decPart}` : `${intPart}.${decPart}`;
    }
  } else if (hasDot) {
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      // Nhiều dấu chấm: 1.250.000
      normalized = cleaned.replace(/\./g, '');
    }
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export interface ApplyExcelPasteParams {
  existingItems: InboundItemDetail[];
  startRowIndex: number;
  startField: InboundPasteField;
  grid: string[][];
  createBlankRow: (idxOffset: number) => InboundItemDetail;
  findMaterialByCode: (code: string) => MaterialItem | undefined;
  findMaterialByName: (name: string) => MaterialItem | undefined;
}

export interface ApplyExcelPasteResult {
  items: InboundItemDetail[];
  pastedRowCount: number;
  pastedColCount: number;
  addedRowCount: number;
  matchedCatalogCount: number;
}

function applyCatalogMetadataToRow(
  row: InboundItemDetail,
  found: MaterialItem,
  explicitFields: Set<InboundPasteField>,
  matchedBy: 'code' | 'name'
): void {
  if (matchedBy === 'code') {
    if (!explicitFields.has('materialName') && found.name) {
      row.materialName = found.name;
    }
  } else if (!explicitFields.has('materialCode') && !(row.materialCode || '').trim() && found.code) {
    row.materialCode = found.code;
  }

  if (!explicitFields.has('unit') && found.unit) {
    row.unit = found.unit;
  }

  if (
    !explicitFields.has('packageNo') &&
    !(row.packageNo || '').trim() &&
    found.packageNo &&
    found.packageNo !== 'N/A'
  ) {
    row.packageNo = found.packageNo;
    if (!(row.packageName || '').trim()) {
      row.packageName = `Kiện ${found.packageNo}`;
    }
  }

  if (found.category && found.category !== 'Chung' && !row.category) {
    row.category = found.category;
  }
  if (!explicitFields.has('drawingNo') && found.drawingNo && found.drawingNo !== 'N/A' && !row.drawingNo) {
    row.drawingNo = found.drawingNo;
  }
  if (found.manufacturer && found.manufacturer !== 'N/A' && !row.manufacturer) {
    row.manufacturer = found.manufacturer;
  }
  if (found.supplier && found.supplier !== 'N/A' && !row.supplier) {
    row.supplier = found.supplier;
  }

  if (!explicitFields.has('weightKg') && found.unitWeightKg && found.unitWeightKg > 0) {
    const qty = Math.max(0, roundQty(row.quantity));
    if (qty > 0) {
      row.weightKg = Math.round(found.unitWeightKg * qty * 100) / 100;
    }
  }
}

/**
 * Dán ma trận dữ liệu từ Excel vào danh sách dòng vật tư của phiếu nhập kho thủ công.
 * Tự động mở rộng thêm dòng mới khi số dòng dán vượt quá số dòng hiện có,
 * đồng thời tự động tra cứu Danh mục vật tư theo Mã vật tư hoặc Tên vật tư để điền sẵn thông tin liên quan.
 */
export function applyExcelPasteToInboundItems(
  params: ApplyExcelPasteParams
): ApplyExcelPasteResult {
  const {
    existingItems,
    startRowIndex,
    startField,
    grid,
    createBlankRow,
    findMaterialByCode,
    findMaterialByName
  } = params;

  const safeStartRow = Math.max(0, Math.min(startRowIndex, existingItems.length));
  const startColIdx = INBOUND_PASTE_COLUMN_ORDER.indexOf(startField);

  if (grid.length === 0 || startColIdx < 0) {
    return {
      items: existingItems,
      pastedRowCount: 0,
      pastedColCount: 0,
      addedRowCount: 0,
      matchedCatalogCount: 0
    };
  }

  const nextItems = existingItems.map((it) => ({ ...it }));
  let addedRowCount = 0;
  let matchedCatalogCount = 0;
  let maxColCount = 0;

  for (let r = 0; r < grid.length; r++) {
    const rowCells = grid[r];
    if (rowCells.length > maxColCount) {
      maxColCount = rowCells.length;
    }

    const targetIdx = safeStartRow + r;
    while (nextItems.length <= targetIdx) {
      nextItems.push(createBlankRow(nextItems.length));
      addedRowCount += 1;
    }

    const prevRow = nextItems[targetIdx];
    const rowCopy: InboundItemDetail = { ...prevRow };
    const explicitFields = new Set<InboundPasteField>();

    for (let c = 0; c < rowCells.length; c++) {
      const colIdx = startColIdx + c;
      if (colIdx >= INBOUND_PASTE_COLUMN_ORDER.length) break;
      const field = INBOUND_PASTE_COLUMN_ORDER[colIdx];
      const cellVal = rowCells[c];

      // Nếu là dán 1 cột mà dòng ở giữa trống thì vẫn giữ nguyên giá trị cũ;
      // nếu có dữ liệu thì điền vào trường tương ứng
      if (cellVal === '') continue;

      if (field === 'quantity') {
        const parsed = parsePastedNumber(cellVal);
        if (parsed !== null) {
          rowCopy.quantity = Math.max(0, roundQty(parsed));
          explicitFields.add('quantity');
        }
      } else if (field === 'weightKg') {
        const parsed = parsePastedNumber(cellVal);
        if (parsed !== null) {
          rowCopy.weightKg = Math.max(0, Math.round(parsed * 100) / 100);
          explicitFields.add('weightKg');
        }
      } else if (field === 'unitPrice') {
        const parsed = parsePastedNumber(cellVal);
        if (parsed !== null) {
          rowCopy.unitPrice = Math.max(0, parsed);
          explicitFields.add('unitPrice');
        }
      } else {
        rowCopy[field] = cellVal;
        explicitFields.add(field);
        if (field === 'packageNo' && !(rowCopy.packageName || '').trim()) {
          rowCopy.packageName = `Kiện ${cellVal}`;
        }
      }
    }

    // Tự động điền thông tin từ Danh mục vật tư nếu dán Mã vật tư hoặc Tên vật tư
    if (explicitFields.has('materialCode')) {
      const foundByCode = findMaterialByCode(rowCopy.materialCode);
      if (foundByCode) {
        matchedCatalogCount += 1;
        applyCatalogMetadataToRow(rowCopy, foundByCode, explicitFields, 'code');
      } else if (explicitFields.has('materialName')) {
        const foundByName = findMaterialByName(rowCopy.materialName);
        if (foundByName) {
          matchedCatalogCount += 1;
          applyCatalogMetadataToRow(rowCopy, foundByName, explicitFields, 'name');
        }
      }
    } else if (explicitFields.has('materialName')) {
      const foundByName = findMaterialByName(rowCopy.materialName);
      if (foundByName) {
        matchedCatalogCount += 1;
        applyCatalogMetadataToRow(rowCopy, foundByName, explicitFields, 'name');
      }
    } else if (explicitFields.has('quantity') && !explicitFields.has('weightKg')) {
      // Nếu chỉ dán cột Số lượng cho các dòng đã có Mã vật tư -> tự cập nhật lại khối lượng theo KL đơn vị
      const found = findMaterialByCode(rowCopy.materialCode);
      if (found && found.unitWeightKg && found.unitWeightKg > 0) {
        const prevAutoW = Math.round(found.unitWeightKg * roundQty(prevRow.quantity) * 100) / 100;
        const currW = Number(prevRow.weightKg) || 0;
        if (currW === 0 || Math.abs(currW - prevAutoW) < 0.05) {
          rowCopy.weightKg = Math.round(found.unitWeightKg * roundQty(rowCopy.quantity) * 100) / 100;
        }
      }
    }

    // Luôn tính lại Thành tiền = Số lượng * Đơn giá
    const qty = Math.max(0, roundQty(rowCopy.quantity));
    const price = Math.max(0, Number(rowCopy.unitPrice) || 0);
    rowCopy.totalPrice = Math.round(qty * price * 100) / 100;

    nextItems[targetIdx] = rowCopy;
  }

  return {
    items: nextItems,
    pastedRowCount: grid.length,
    pastedColCount: maxColCount,
    addedRowCount,
    matchedCatalogCount
  };
}

export type OutboundPasteField =
  | 'materialCode'
  | 'materialName'
  | 'batchCode'
  | 'drawingNo'
  | 'quantity'
  | 'unit'
  | 'weightKg'
  | 'note';

export const OUTBOUND_PASTE_COLUMN_ORDER: readonly OutboundPasteField[] = [
  'materialCode',
  'materialName',
  'batchCode',
  'drawingNo',
  'quantity',
  'unit',
  'weightKg',
  'note'
];

export interface ApplyOutboundExcelPasteParams {
  existingItems: OutboundItemDetail[];
  startRowIndex: number;
  startField: OutboundPasteField;
  grid: string[][];
  createBlankRow: (idxOffset: number) => OutboundItemDetail;
  findStockByCode?: (code: string) => InventoryStockRecord | undefined;
  findStockByName?: (name: string) => InventoryStockRecord | undefined;
  findMaterialByCode: (code: string) => MaterialItem | undefined;
  findMaterialByName: (name: string) => MaterialItem | undefined;
}

export interface ApplyOutboundExcelPasteResult {
  items: OutboundItemDetail[];
  pastedRowCount: number;
  pastedColCount: number;
  addedRowCount: number;
  matchedStockCount: number;
  matchedCatalogCount: number;
}

function isBlankOrNA(value?: string): boolean {
  const trimmed = (value || '').trim();
  return !trimmed || trimmed.toUpperCase() === 'N/A';
}

function applyStockMetadataToOutboundRow(
  row: OutboundItemDetail,
  st: InventoryStockRecord,
  explicitFields: Set<OutboundPasteField>,
  matchedBy: 'code' | 'name',
  fallbackCatalog?: MaterialItem
): void {
  if (matchedBy === 'code') {
    if (!explicitFields.has('materialName') && st.materialName) {
      row.materialName = st.materialName;
    }
  } else if (!explicitFields.has('materialCode') && !(row.materialCode || '').trim() && st.materialCode) {
    row.materialCode = st.materialCode;
  }

  if (!explicitFields.has('unit') && st.unit) {
    row.unit = st.unit;
  }

  const defaultBatch = !isBlankOrNA(st.packageNo)
    ? st.packageNo
    : !isBlankOrNA(st.shipment)
      ? st.shipment
      : '';
  if (!explicitFields.has('batchCode') && !(row.batchCode || '').trim() && defaultBatch) {
    row.batchCode = defaultBatch;
  }

  if (isBlankOrNA(row.packingListNo) && !isBlankOrNA(st.packingListNo)) {
    row.packingListNo = st.packingListNo;
  }
  if (isBlankOrNA(row.shipment) && !isBlankOrNA(st.shipment)) {
    row.shipment = st.shipment;
  }
  if (isBlankOrNA(row.packageNo) && !isBlankOrNA(st.packageNo)) {
    row.packageNo = st.packageNo;
  }
  if (!(row.packageName || '').trim() && st.packageName) {
    row.packageName = st.packageName;
  }
  if ((!row.category || row.category === 'Vật tư dự án') && st.category) {
    row.category = st.category;
  }
  if (!explicitFields.has('drawingNo') && isBlankOrNA(row.drawingNo) && !isBlankOrNA(st.drawingNo)) {
    row.drawingNo = st.drawingNo;
  }
  if (isBlankOrNA(row.manufacturer) && !isBlankOrNA(st.manufacturer)) {
    row.manufacturer = st.manufacturer;
  }
  if (isBlankOrNA(row.supplier) && !isBlankOrNA(st.supplier)) {
    row.supplier = st.supplier;
  }

  if (!explicitFields.has('weightKg')) {
    const qty = Math.max(0, roundQty(row.quantity));
    if (qty > 0) {
      if (st.currentQuantity > 0 && st.currentWeightKg > 0) {
        const unitWeight = st.currentWeightKg / st.currentQuantity;
        row.weightKg = Math.round(unitWeight * qty * 100) / 100;
      } else if (fallbackCatalog && fallbackCatalog.unitWeightKg && fallbackCatalog.unitWeightKg > 0) {
        row.weightKg = Math.round(fallbackCatalog.unitWeightKg * qty * 100) / 100;
      }
    }
  }
}

function applyCatalogMetadataToOutboundRow(
  row: OutboundItemDetail,
  found: MaterialItem,
  explicitFields: Set<OutboundPasteField>,
  matchedBy: 'code' | 'name'
): void {
  if (matchedBy === 'code') {
    if (!explicitFields.has('materialName') && found.name) {
      row.materialName = found.name;
    }
  } else if (!explicitFields.has('materialCode') && !(row.materialCode || '').trim() && found.code) {
    row.materialCode = found.code;
  }

  if (!explicitFields.has('unit') && found.unit) {
    row.unit = found.unit;
  }

  if (
    !explicitFields.has('batchCode') &&
    !(row.batchCode || '').trim() &&
    !isBlankOrNA(found.packageNo)
  ) {
    row.batchCode = found.packageNo!;
    if (isBlankOrNA(row.packageNo)) {
      row.packageNo = found.packageNo!;
    }
  }

  if ((!row.category || row.category === 'Vật tư dự án') && found.category && found.category !== 'Chung') {
    row.category = found.category;
  }
  if (!explicitFields.has('drawingNo') && isBlankOrNA(row.drawingNo) && found.drawingNo && !isBlankOrNA(found.drawingNo)) {
    row.drawingNo = found.drawingNo;
  }
  if (isBlankOrNA(row.manufacturer) && found.manufacturer && !isBlankOrNA(found.manufacturer)) {
    row.manufacturer = found.manufacturer;
  }
  if (isBlankOrNA(row.supplier) && found.supplier && !isBlankOrNA(found.supplier)) {
    row.supplier = found.supplier;
  }

  if (!explicitFields.has('weightKg') && found.unitWeightKg && found.unitWeightKg > 0) {
    const qty = Math.max(0, roundQty(row.quantity));
    if (qty > 0) {
      row.weightKg = Math.round(found.unitWeightKg * qty * 100) / 100;
    }
  }
}

/**
 * Dán ma trận dữ liệu từ Excel vào danh sách dòng vật tư của phiếu xuất kho thủ công.
 * Tự động mở rộng thêm dòng mới khi số dòng dán vượt quá số dòng hiện có,
 * ưu tiên tra cứu từ Tồn kho hiện tại (và dự phòng Danh mục vật tư) theo Mã vật tư hoặc Tên vật tư.
 */
export function applyExcelPasteToOutboundItems(
  params: ApplyOutboundExcelPasteParams
): ApplyOutboundExcelPasteResult {
  const {
    existingItems,
    startRowIndex,
    startField,
    grid,
    createBlankRow,
    findStockByCode,
    findStockByName,
    findMaterialByCode,
    findMaterialByName
  } = params;

  const safeStartRow = Math.max(0, Math.min(startRowIndex, existingItems.length));
  const startColIdx = OUTBOUND_PASTE_COLUMN_ORDER.indexOf(startField);

  if (grid.length === 0 || startColIdx < 0) {
    return {
      items: existingItems,
      pastedRowCount: 0,
      pastedColCount: 0,
      addedRowCount: 0,
      matchedStockCount: 0,
      matchedCatalogCount: 0
    };
  }

  const nextItems = existingItems.map((it) => ({ ...it }));
  let addedRowCount = 0;
  let matchedStockCount = 0;
  let matchedCatalogCount = 0;
  let maxColCount = 0;

  for (let r = 0; r < grid.length; r++) {
    const rowCells = grid[r];
    if (rowCells.length > maxColCount) {
      maxColCount = rowCells.length;
    }

    const targetIdx = safeStartRow + r;
    while (nextItems.length <= targetIdx) {
      nextItems.push(createBlankRow(nextItems.length));
      addedRowCount += 1;
    }

    const prevRow = nextItems[targetIdx];
    const rowCopy: OutboundItemDetail = { ...prevRow };
    const explicitFields = new Set<OutboundPasteField>();

    for (let c = 0; c < rowCells.length; c++) {
      const colIdx = startColIdx + c;
      if (colIdx >= OUTBOUND_PASTE_COLUMN_ORDER.length) break;
      const field = OUTBOUND_PASTE_COLUMN_ORDER[colIdx];
      const cellVal = rowCells[c];

      if (cellVal === '') continue;

      if (field === 'quantity') {
        const parsed = parsePastedNumber(cellVal);
        if (parsed !== null) {
          rowCopy.quantity = Math.max(0, roundQty(parsed));
          explicitFields.add('quantity');
        }
      } else if (field === 'weightKg') {
        const parsed = parsePastedNumber(cellVal);
        if (parsed !== null) {
          rowCopy.weightKg = Math.max(0, Math.round(parsed * 100) / 100);
          explicitFields.add('weightKg');
        }
      } else {
        rowCopy[field] = cellVal;
        explicitFields.add(field);
        if (field === 'batchCode' && isBlankOrNA(rowCopy.packingListNo)) {
          rowCopy.packageNo = cellVal;
        }
      }
    }

    // Ưu tiên khớp Tồn kho hiện tại -> dự phòng Danh mục vật tư khi dán Mã vật tư hoặc Tên vật tư
    if (explicitFields.has('materialCode')) {
      const stockByCode = findStockByCode?.(rowCopy.materialCode);
      if (stockByCode) {
        matchedStockCount += 1;
        applyStockMetadataToOutboundRow(
          rowCopy,
          stockByCode,
          explicitFields,
          'code',
          findMaterialByCode(rowCopy.materialCode)
        );
      } else {
        const matByCode = findMaterialByCode(rowCopy.materialCode);
        if (matByCode) {
          matchedCatalogCount += 1;
          applyCatalogMetadataToOutboundRow(rowCopy, matByCode, explicitFields, 'code');
        } else if (explicitFields.has('materialName')) {
          const stockByName = findStockByName?.(rowCopy.materialName);
          if (stockByName) {
            matchedStockCount += 1;
            applyStockMetadataToOutboundRow(
              rowCopy,
              stockByName,
              explicitFields,
              'name',
              findMaterialByName(rowCopy.materialName)
            );
          } else {
            const matByName = findMaterialByName(rowCopy.materialName);
            if (matByName) {
              matchedCatalogCount += 1;
              applyCatalogMetadataToOutboundRow(rowCopy, matByName, explicitFields, 'name');
            }
          }
        }
      }
    } else if (explicitFields.has('materialName')) {
      const stockByName = findStockByName?.(rowCopy.materialName);
      if (stockByName) {
        matchedStockCount += 1;
        applyStockMetadataToOutboundRow(
          rowCopy,
          stockByName,
          explicitFields,
          'name',
          findMaterialByName(rowCopy.materialName)
        );
      } else {
        const matByName = findMaterialByName(rowCopy.materialName);
        if (matByName) {
          matchedCatalogCount += 1;
          applyCatalogMetadataToOutboundRow(rowCopy, matByName, explicitFields, 'name');
        }
      }
    } else if (explicitFields.has('quantity') && !explicitFields.has('weightKg')) {
      // Nếu chỉ dán cột Số lượng cho các dòng đã có dữ liệu -> tự cập nhật lại khối lượng
      const nextQty = Math.max(0, roundQty(rowCopy.quantity));
      const prevQty = roundQty(prevRow.quantity);
      const currW = Number(prevRow.weightKg) || 0;
      const found = findMaterialByCode(rowCopy.materialCode);
      if (found && found.unitWeightKg && found.unitWeightKg > 0) {
        const prevAutoW = Math.round(found.unitWeightKg * prevQty * 100) / 100;
        if (currW === 0 || Math.abs(currW - prevAutoW) < 0.05) {
          rowCopy.weightKg = Math.round(found.unitWeightKg * nextQty * 100) / 100;
        } else if (prevQty > 0 && currW > 0 && nextQty > 0) {
          rowCopy.weightKg = Math.round((currW / prevQty) * nextQty * 100) / 100;
        }
      } else if (prevQty > 0 && currW > 0 && nextQty > 0) {
        rowCopy.weightKg = Math.round((currW / prevQty) * nextQty * 100) / 100;
      }
    }

    nextItems[targetIdx] = rowCopy;
  }

  return {
    items: nextItems,
    pastedRowCount: grid.length,
    pastedColCount: maxColCount,
    addedRowCount,
    matchedStockCount,
    matchedCatalogCount
  };
}
