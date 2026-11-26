import type {
  InboundItemDetail,
  InboundReceipt,
  MaterialItem,
  OutboundItemDetail,
  OutboundReceipt
} from '../types/inventory';
import { normKey, sumInboundItems, sumOutboundItems } from './additiveMerge';

function stripKienXuatText(raw?: string | null): string {
  if (!raw) return '';
  return String(raw)
    .normalize('NFC')
    .replace(/\(\s*kiện\s+xuất\s*\)|\[\s*kiện\s+xuất\s*\]/gi, ' ')
    .replace(/(?:^|[\s\-–—:;,.])kiện\s+xuất(?!\s*(?:khẩu|nhập|xứ)\b)(?=$|[\s\-–—:;,.])/gi, ' ')
    .replace(/^[\s:\-–—;,.]+|[\s:\-–—;,.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanMeaningfulField(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = String(raw).normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  const upper = trimmed.toUpperCase();
  if (upper === 'N/A' || upper === 'NA' || upper === '-' || upper === '--') {
    return '';
  }
  return trimmed;
}

export function normalizePackageCompareToken(raw?: string | null): string {
  const cleaned = cleanMeaningfulField(stripKienXuatText(raw));
  if (!cleaned) return '';
  const core = cleaned.replace(/^(?:kiện|lô)\s+/i, '').trim();
  return core ? core.toUpperCase() : '';
}

function isLegacyLotPackageName(packageName?: string | null): boolean {
  const cleaned = cleanMeaningfulField(stripKienXuatText(packageName));
  if (!cleaned) return false;
  return /^lô\s+/i.test(cleaned);
}

export interface CleanupReceiptsOptions {
  /** If provided, bumps updatedAt & itemsReplacedAt on modified receipts (for one-time local persistence/sync) without touching lastEditedBy/lastEditedAt. */
  bumpTimestamp?: number;
}

export interface InboundCleanupResult {
  receipts: InboundReceipt[];
  changed: boolean;
  changedCodes: string[];
  cleanedItemCount: number;
}

export interface OutboundCleanupResult {
  receipts: OutboundReceipt[];
  changed: boolean;
  changedCodes: string[];
  cleanedItemCount: number;
}

/**
 * Dọn sạch các trường `batchCode` bị ứng dụng cũ tự động sao chép từ `packageNo` (Số kiện)
 * hoặc gán chuỗi rỗng giả ('N/A', '-') trên các phiếu nhập kho đã lưu.
 * Đồng thời xóa `packageName` dạng tự sinh 'Lô ...' khi `packageNo` trống để không làm lệch khóa gộp Báo cáo NXT.
 */
export function cleanupLegacyInboundReceipts(
  receipts: InboundReceipt[],
  options?: CleanupReceiptsOptions
): InboundCleanupResult {
  if (!Array.isArray(receipts) || receipts.length === 0) {
    return { receipts: receipts || [], changed: false, changedCodes: [], cleanedItemCount: 0 };
  }

  let anyChanged = false;
  const changedCodes: string[] = [];
  let cleanedItemCount = 0;
  const bumpTs = options?.bumpTimestamp;

  const nextReceipts = receipts.map((r) => {
    const items = Array.isArray(r.items) ? r.items : [];
    let receiptChanged = false;

    const nextItems: InboundItemDetail[] = items.map((it) => {
      const rawBatch = it.batchCode ?? '';
      const cleanBatch = cleanMeaningfulField(rawBatch);
      const cleanPkg = cleanMeaningfulField(stripKienXuatText(it.packageNo));
      const batchToken = normalizePackageCompareToken(cleanBatch);
      const pkgToken = normalizePackageCompareToken(cleanPkg);

      let nextBatch = rawBatch;
      if (rawBatch !== '' && cleanBatch === '') {
        // Bỏ giá trị giả như 'N/A', '-', khoảng trắng thừa
        nextBatch = '';
      } else if (cleanPkg !== '' && batchToken !== '' && batchToken === pkgToken) {
        // Mã lô trùng khớp Số kiện (do phiên bản cũ tự lấy Số kiện điền vào Mã lô) -> xóa trắng Mã lô
        nextBatch = '';
      }

      let nextPkgName = it.packageName ?? '';
      if (cleanPkg === '' && isLegacyLotPackageName(nextPkgName)) {
        // Phiên bản cũ tự sinh packageName = 'Lô <batch>' khi không có số kiện -> xóa để không bị gộp nhầm thành Package No.
        nextPkgName = '';
      }

      if (nextBatch !== rawBatch || nextPkgName !== (it.packageName ?? '')) {
        receiptChanged = true;
        cleanedItemCount++;
        return {
          ...it,
          batchCode: nextBatch,
          packageName: nextPkgName
        };
      }
      return it;
    });

    if (!receiptChanged) return r;

    anyChanged = true;
    const codeKey = normKey(r.receiptCode || r.id);
    if (codeKey) changedCodes.push(codeKey);
    const sums = sumInboundItems(nextItems);

    if (bumpTs && bumpTs > 0) {
      const nextTs = Math.max(
        bumpTs,
        (Number(r.updatedAt) || 0) + 1,
        (Number(r.itemsReplacedAt) || 0) + 1
      );
      return {
        ...r,
        items: nextItems,
        packageCount: sums.packageCount,
        totalQuantity: sums.totalQuantity,
        totalWeightKg: sums.totalWeightKg,
        totalAmount: sums.totalAmount,
        updatedAt: nextTs,
        itemsReplacedAt: nextTs
      };
    }

    return {
      ...r,
      items: nextItems,
      packageCount: sums.packageCount,
      totalQuantity: sums.totalQuantity,
      totalWeightKg: sums.totalWeightKg,
      totalAmount: sums.totalAmount
    };
  });

  return {
    receipts: anyChanged ? nextReceipts : receipts,
    changed: anyChanged,
    changedCodes,
    cleanedItemCount
  };
}

/**
 * Dọn sạch các trường `batchCode` bị ứng dụng cũ tự động sao chép từ `packageNo` (Số kiện)
 * trên các phiếu xuất kho đã lưu.
 * Nếu phiếu xuất cũ bị trống `packageNo` nhưng `batchCode` lại đang giữ đúng `packageNo` của vật tư đó từ phiếu nhập,
 * tự động khôi phục về `packageNo` và để trống `batchCode` để Báo cáo Nhập-Xuất-Tồn khớp chính xác.
 */
export function cleanupLegacyOutboundReceipts(
  outbounds: OutboundReceipt[],
  inbounds: InboundReceipt[],
  materials?: MaterialItem[],
  options?: CleanupReceiptsOptions
): OutboundCleanupResult {
  if (!Array.isArray(outbounds) || outbounds.length === 0) {
    return { receipts: outbounds || [], changed: false, changedCodes: [], cleanedItemCount: 0 };
  }

  // Xây dựng bảng tra cứu Số kiện (Package No.) thực tế theo Mã vật tư và Tên vật tư từ Phiếu nhập & Danh mục
  const knownPkgByCode = new Map<string, Map<string, string>>();
  const knownPkgByName = new Map<string, Map<string, string>>();

  const registerKnownPkg = (code?: string, name?: string, pkgNo?: string) => {
    const cleanPkg = cleanMeaningfulField(stripKienXuatText(pkgNo));
    const token = normalizePackageCompareToken(cleanPkg);
    if (!cleanPkg || !token) return;

    const cKey = normKey(code);
    if (cKey) {
      let m = knownPkgByCode.get(cKey);
      if (!m) {
        m = new Map<string, string>();
        knownPkgByCode.set(cKey, m);
      }
      if (!m.has(token)) m.set(token, cleanPkg);
    }

    const nKey = normKey(name);
    if (nKey) {
      let m = knownPkgByName.get(nKey);
      if (!m) {
        m = new Map<string, string>();
        knownPkgByName.set(nKey, m);
      }
      if (!m.has(token)) m.set(token, cleanPkg);
    }
  };

  for (let i = 0; i < (inbounds || []).length; i++) {
    const items = inbounds[i]?.items || [];
    for (let j = 0; j < items.length; j++) {
      registerKnownPkg(items[j].materialCode, items[j].materialName, items[j].packageNo);
    }
  }
  for (let i = 0; i < (materials || []).length; i++) {
    registerKnownPkg(materials![i].code, materials![i].name, materials![i].packageNo);
  }

  let anyChanged = false;
  const changedCodes: string[] = [];
  let cleanedItemCount = 0;
  const bumpTs = options?.bumpTimestamp;

  const nextReceipts = outbounds.map((r) => {
    const items = Array.isArray(r.items) ? r.items : [];
    let receiptChanged = false;

    const nextItems: OutboundItemDetail[] = items.map((it) => {
      const rawBatch = it.batchCode ?? '';
      const cleanBatch = cleanMeaningfulField(rawBatch);
      const cleanPkg = cleanMeaningfulField(stripKienXuatText(it.packageNo));
      const batchToken = normalizePackageCompareToken(cleanBatch);
      const pkgToken = normalizePackageCompareToken(cleanPkg);

      let nextBatch = rawBatch;
      let nextPkgNo = it.packageNo ?? '';
      let nextPkgName = it.packageName ?? '';

      if (rawBatch !== '' && cleanBatch === '') {
        nextBatch = '';
      } else if (cleanPkg !== '' && batchToken !== '' && batchToken === pkgToken) {
        // Mã lô bị sao chép từ Số kiện -> xóa trắng Mã lô
        nextBatch = '';
      } else if (cleanPkg === '' && batchToken !== '') {
        // Phiếu xuất cũ để trống Số kiện nhưng lại ghi Số kiện vào ô Mã lô -> khôi phục về Số kiện & xóa Mã lô
        const cKey = normKey(it.materialCode);
        const nKey = normKey(it.materialName);
        const matchedPkg =
          (cKey ? knownPkgByCode.get(cKey)?.get(batchToken) : undefined) ||
          (nKey ? knownPkgByName.get(nKey)?.get(batchToken) : undefined);

        if (matchedPkg) {
          nextPkgNo = matchedPkg;
          nextBatch = '';
          if (!cleanMeaningfulField(nextPkgName) || isLegacyLotPackageName(nextPkgName)) {
            nextPkgName = `Kiện ${matchedPkg}`;
          }
        }
      }

      if (cleanMeaningfulField(nextPkgNo) === '' && isLegacyLotPackageName(nextPkgName)) {
        nextPkgName = '';
      }

      if (
        nextBatch !== rawBatch ||
        nextPkgNo !== (it.packageNo ?? '') ||
        nextPkgName !== (it.packageName ?? '')
      ) {
        receiptChanged = true;
        cleanedItemCount++;
        return {
          ...it,
          batchCode: nextBatch,
          packageNo: nextPkgNo,
          packageName: nextPkgName
        };
      }
      return it;
    });

    if (!receiptChanged) return r;

    anyChanged = true;
    const codeKey = normKey(r.issueCode || r.id);
    if (codeKey) changedCodes.push(codeKey);
    const sums = sumOutboundItems(nextItems);

    if (bumpTs && bumpTs > 0) {
      const nextTs = Math.max(
        bumpTs,
        (Number(r.updatedAt) || 0) + 1,
        (Number(r.itemsReplacedAt) || 0) + 1
      );
      return {
        ...r,
        items: nextItems,
        totalQuantity: sums.totalQuantity,
        totalWeightKg: sums.totalWeightKg,
        updatedAt: nextTs,
        itemsReplacedAt: nextTs
      };
    }

    return {
      ...r,
      items: nextItems,
      totalQuantity: sums.totalQuantity,
      totalWeightKg: sums.totalWeightKg
    };
  });

  return {
    receipts: anyChanged ? nextReceipts : outbounds,
    changed: anyChanged,
    changedCodes,
    cleanedItemCount
  };
}
