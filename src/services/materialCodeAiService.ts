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

export type MaterialCodeGenerationSource = 'ai' | 'local';

export interface MaterialCodeAiResult {
  code: string;
  reason: string;
  source: MaterialCodeGenerationSource;
}

export interface MaterialCodeAiBatchItemResult {
  index: number;
  code: string;
  reason: string;
  source: MaterialCodeGenerationSource;
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
  if (!err) return false;
  if ((err as { name?: string })?.name === 'AbortError') return false;
  if (err instanceof TypeError) {
    // Network/offline fetch failure
    return true;
  }
  const code = String((err as { errorCode?: string })?.errorCode || '');
  const status = Number((err as { status?: number })?.status || 0);
  return (
    code === 'CREDITS_DEPLETED' ||
    code === 'API_KEY_MISSING' ||
    code === 'API_KEY_INVALID' ||
    code === 'RESOURCE_EXHAUSTED' ||
    code === 'MODEL_NOT_FOUND' ||
    code === 'UPSTREAM_AI_ERROR' ||
    status === 402 ||
    status === 403 ||
    status === 429 ||
    status === 502 ||
    status === 503
  );
}

const MAX_ITEMS_PER_REQUEST = 25;
const AI_QUOTA_COOLDOWN_MS = 2 * 60 * 1000;
const LOCAL_AUTO_REASON = 'Tự động tạo mã nội bộ (8–20 ký tự)';

let aiQuotaExhaustedUntil = 0;

export function resetAiQuotaCooldown(): void {
  aiQuotaExhaustedUntil = 0;
}

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
 * Generates a single intelligent 8–20 char material code via server-side free-tier Gemini AI,
 * automatically falling back to the internal smart code generator when free quota/credits are exhausted.
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
      'Không thể tạo mã vật tư hợp lệ. Vui lòng thử lại.',
      502,
      'INCOMPLETE_AI_RESPONSE'
    );
  }
  return {
    code: first.code,
    reason: first.reason,
    source: first.source
  };
}

/**
 * Generates intelligent 8–20 char material codes in batch via server-side free-tier Gemini AI.
 * Automatically detects free-tier quota/credit exhaustion and seamlessly falls back to the
 * internal smart generator without blocking the user.
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
  let useLocalFallback = Date.now() < aiQuotaExhaustedUntil;

  for (let offset = 0; offset < uniqueGroups.length; offset += MAX_ITEMS_PER_REQUEST) {
    const chunk = uniqueGroups.slice(offset, offset + MAX_ITEMS_PER_REQUEST);

    if (!useLocalFallback) {
      try {
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
          const finalUniqueCode =
            match && match.code
              ? ensureUniqueValidMaterialCode(
                  match.code,
                  usedSet,
                  group.representative.materialName
                )
              : generateSmartDeterministicMaterialCode(
                  usedSet,
                  group.representative.materialName
                );
          const source: MaterialCodeGenerationSource = match && match.code ? 'ai' : 'local';
          const reason =
            match && match.code ? match.reason || 'Phân tích thông số vật tư bằng AI' : LOCAL_AUTO_REASON;

          for (const origIdx of group.originalIndices) {
            resultsByOriginalIndex.set(origIdx, {
              index: origIdx,
              code: finalUniqueCode,
              reason,
              source
            });
          }
        }
        aiQuotaExhaustedUntil = 0;
        continue;
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError' || signal?.aborted) {
          throw err;
        }
        if (isAiKeyOrQuotaUnavailableError(err)) {
          useLocalFallback = true;
          aiQuotaExhaustedUntil = Date.now() + AI_QUOTA_COOLDOWN_MS;
        } else {
          throw err;
        }
      }
    }

    // Free-tier AI quota/limit unavailable -> automatically generate smart internal codes
    for (let j = 0; j < chunk.length; j++) {
      const group = chunk[j];
      const localCode = generateSmartDeterministicMaterialCode(
        usedSet,
        group.representative.materialName
      );
      for (const origIdx of group.originalIndices) {
        resultsByOriginalIndex.set(origIdx, {
          index: origIdx,
          code: localCode,
          reason: LOCAL_AUTO_REASON,
          source: 'local'
        });
      }
    }
  }

  return Array.from(resultsByOriginalIndex.values()).sort((a, b) => a.index - b.index);
}

/**
 * Local deterministic smart code generator (8–20 chars, A-Z/0-9/-, no mandatory VT prefix).
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
      reason: LOCAL_AUTO_REASON,
      source: 'local'
    });
  }

  return results;
}
