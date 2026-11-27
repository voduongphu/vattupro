import {
  ensureUniqueValidMaterialCode,
  generateSmartDeterministicMaterialCode,
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

export class MaterialCodeAiError extends Error {
  status: number;
  errorCode: string;

  constructor(message: string, status = 500, errorCode = 'AI_GENERATION_FAILED') {
    super(message);
    this.name = 'MaterialCodeAiError';
    this.status = status;
    this.errorCode = errorCode;
  }
}

export function isAiKeyOrQuotaUnavailableError(err: unknown): boolean {
  const code = String((err as { errorCode?: string })?.errorCode || '');
  const status = Number((err as { status?: number })?.status || 0);
  return (
    code === 'CREDITS_DEPLETED' ||
    code === 'API_KEY_MISSING' ||
    code === 'API_KEY_INVALID' ||
    code === 'RESOURCE_EXHAUSTED' ||
    status === 402 ||
    status === 403 ||
    status === 429 ||
    status === 503
  );
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
    const errCode =
      (payload && typeof payload.code === 'string' && payload.code.trim()) ||
      `HTTP_${response.status}`;
    throw new MaterialCodeAiError(errMsg, response.status, errCode);
  }

  if (!payload || !Array.isArray(payload.items)) {
    throw new MaterialCodeAiError(
      'Phản hồi AI không hợp lệ. Vui lòng thử lại.',
      502,
      'INVALID_RESPONSE'
    );
  }

  return payload.items.map((it: any) => ({
    index: Number(it?.index),
    code: String(it?.code || ''),
    reason: String(it?.reason || '')
  }));
}

/**
 * Generates a single intelligent 8–20 char material code via server-side free-tier Gemini AI.
 */
export async function generateMaterialCodeWithAI(
  input: MaterialCodeAiRequestItem,
  existingCodes: Iterable<string> = [],
  signal?: AbortSignal
): Promise<MaterialCodeAiResult> {
  const results = await generateMaterialCodesBatchWithAI([input], existingCodes, signal);
  const first = results[0];
  if (!first || !first.code) {
    throw new MaterialCodeAiError(
      'AI không trả về mã vật tư hợp lệ. Vui lòng thử lại.',
      502,
      'INCOMPLETE_AI_RESPONSE'
    );
  }
  return {
    code: first.code,
    reason: first.reason
  };
}

/**
 * Generates intelligent 8–20 char material codes in batch via server-side free-tier Gemini AI.
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
        throw new MaterialCodeAiError(
          `AI chưa tạo được mã cho vật tư "${group.representative.materialName}". Vui lòng thử lại.`,
          502,
          'INCOMPLETE_AI_RESPONSE'
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

/**
 * Explicit offline rule-based code generator (only invoked when the user explicitly requests
 * local non-AI fallback after inspecting an upstream Gemini API error).
 */
export function generateOfflineSmartMaterialCodesBatch(
  items: MaterialCodeAiRequestItem[],
  existingCodes: Iterable<string> = []
): MaterialCodeAiBatchItemResult[] {
  if (!Array.isArray(items) || items.length === 0) return [];

  const usedSet = new Set<string>();
  for (const c of existingCodes) {
    const k = normCodeKey(c);
    if (k) usedSet.add(k);
  }

  const nameToCode = new Map<string, string>();
  const results: MaterialCodeAiBatchItemResult[] = [];

  for (let i = 0; i < items.length; i++) {
    const rawName = String(items[i]?.materialName || '').trim();
    if (!rawName) continue;
    const nameKey = normalizeMaterialNameLookupKey(rawName);
    let code = nameToCode.get(nameKey);
    if (!code) {
      code = generateSmartDeterministicMaterialCode(usedSet, rawName);
      nameToCode.set(nameKey, code);
    }
    results.push({
      index: i,
      code,
      reason: 'Tạo tự động nội bộ (Offline, 8–20 ký tự)'
    });
  }

  return results;
}
