import {
  ensureUniqueValidMaterialCode,
  normCodeKey
} from '../utils/materialCodeAi';
import { normalizeMaterialNameLookupKey } from '../utils/additiveMerge';

export interface MaterialCodeAiRequestItem {
  materialName: string;
  unit?: string;
  category?: string;
  specification?: string;
  drawingNo?: string;
}

export interface MaterialCodeAiResult {
  code: string;
  reason: string;
}

export interface MaterialCodeAiBatchItemResult {
  index: number;
  code: string;
  reason: string;
}

const MAX_ITEMS_PER_REQUEST = 25;

async function postGenerateMaterialCodes(
  items: MaterialCodeAiRequestItem[],
  existingCodesSample: string[],
  signal?: AbortSignal
): Promise<Array<{ index: number; code: string; reason: string }>> {
  const response = await fetch('/api/ai/generate-material-codes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      items,
      existingCodes: existingCodesSample
    }),
    signal
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errMsg =
      (payload && typeof payload.error === 'string' && payload.error.trim()) ||
      `Không thể gọi AI tạo mã vật tư (HTTP ${response.status}).`;
    throw new Error(errMsg);
  }

  if (!payload || !Array.isArray(payload.items)) {
    throw new Error('Phản hồi AI không hợp lệ. Vui lòng thử lại.');
  }

  return payload.items.map((it: any) => ({
    index: Number(it?.index),
    code: String(it?.code || ''),
    reason: String(it?.reason || '')
  }));
}

/**
 * Generates a single intelligent 8–20 char material code via server-side Gemini AI.
 */
export async function generateMaterialCodeWithAI(
  input: MaterialCodeAiRequestItem,
  existingCodes: Iterable<string> = [],
  signal?: AbortSignal
): Promise<MaterialCodeAiResult> {
  const results = await generateMaterialCodesBatchWithAI([input], existingCodes, signal);
  const first = results[0];
  if (!first || !first.code) {
    throw new Error('AI không trả về mã vật tư hợp lệ. Vui lòng thử lại.');
  }
  return {
    code: first.code,
    reason: first.reason
  };
}

/**
 * Generates intelligent 8–20 char material codes in batch via server-side Gemini AI.
 * Deduplicates identical material names so duplicate rows receive the exact same code
 * while distinct materials receive unique, non-colliding codes.
 */
export async function generateMaterialCodesBatchWithAI(
  items: MaterialCodeAiRequestItem[],
  existingCodes: Iterable<string> = [],
  signal?: AbortSignal
): Promise<MaterialCodeAiBatchItemResult[]> {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const usedSet = new Set<string>();
  for (const c of existingCodes) {
    const k = normCodeKey(c);
    if (k) usedSet.add(k);
  }

  // Group identical material names to avoid duplicate AI tokens and guarantee identical codes for identical names
  const uniqueGroups: Array<{
    nameKey: string;
    representative: MaterialCodeAiRequestItem;
    originalIndices: number[];
  }> = [];
  const keyToGroupIdx = new Map<string, number>();

  for (let i = 0; i < items.length; i++) {
    const rawName = String(items[i]?.materialName || '').trim();
    if (!rawName) continue;
    const nameKey = normalizeMaterialNameLookupKey(rawName);
    const existingGroupIdx = keyToGroupIdx.get(nameKey);
    if (existingGroupIdx !== undefined) {
      uniqueGroups[existingGroupIdx].originalIndices.push(i);
    } else {
      keyToGroupIdx.set(nameKey, uniqueGroups.length);
      uniqueGroups.push({
        nameKey,
        representative: {
          materialName: rawName,
          unit: items[i]?.unit?.trim() || undefined,
          category: items[i]?.category?.trim() || undefined,
          specification: items[i]?.specification?.trim() || undefined,
          drawingNo: items[i]?.drawingNo?.trim() || undefined
        },
        originalIndices: [i]
      });
    }
  }

  if (uniqueGroups.length === 0) {
    return [];
  }

  const resultsByOriginalIndex = new Map<number, MaterialCodeAiBatchItemResult>();

  for (let offset = 0; offset < uniqueGroups.length; offset += MAX_ITEMS_PER_REQUEST) {
    const chunk = uniqueGroups.slice(offset, offset + MAX_ITEMS_PER_REQUEST);
    const existingSample = Array.from(usedSet).slice(-120);

    const aiResponseItems = await postGenerateMaterialCodes(
      chunk.map((g) => g.representative),
      existingSample,
      signal
    );

    const responseByChunkIdx = new Map<number, { code: string; reason: string }>();
    for (const r of aiResponseItems) {
      if (Number.isInteger(r.index) && r.code) {
        responseByChunkIdx.set(r.index, { code: r.code, reason: r.reason });
      }
    }

    for (let j = 0; j < chunk.length; j++) {
      const group = chunk[j];
      const match = responseByChunkIdx.get(j);
      if (!match || !match.code) {
        throw new Error(
          `AI chưa tạo được mã cho vật tư "${group.representative.materialName}". Vui lòng thử lại.`
        );
      }

      const finalUniqueCode = ensureUniqueValidMaterialCode(
        match.code,
        usedSet,
        group.representative.materialName
      );

      for (const origIdx of group.originalIndices) {
        resultsByOriginalIndex.set(origIdx, {
          index: origIdx,
          code: finalUniqueCode,
          reason: match.reason
        });
      }
    }
  }

  return Array.from(resultsByOriginalIndex.values()).sort((a, b) => a.index - b.index);
}
