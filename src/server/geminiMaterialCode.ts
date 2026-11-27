import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  MATERIAL_CODE_MAX_LENGTH,
  MATERIAL_CODE_MIN_LENGTH,
  ensureUniqueValidMaterialCode,
  normCodeKey
} from '../utils/materialCodeAi.ts';

export interface AiMaterialCodeInputItem {
  materialName: string;
  unit?: string;
  category?: string;
  specification?: string;
  drawingNo?: string;
}

export interface AiMaterialCodeOutputItem {
  index: number;
  code: string;
  reason: string;
}

export class GeminiMaterialCodeError extends Error {
  status: number;
  errorCode: string;

  constructor(message: string, status = 500, errorCode = 'AI_GENERATION_FAILED') {
    super(message);
    this.name = 'GeminiMaterialCodeError';
    this.status = status;
    this.errorCode = errorCode;
  }
}

let cachedClient: GoogleGenAI | null = null;
let cachedApiKey = '';

function getGeminiClient(): GoogleGenAI {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new GeminiMaterialCodeError(
      'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Vui lòng kiểm tra khóa API trong mục Settings > Secrets.',
      503,
      'API_KEY_MISSING'
    );
  }
  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
    cachedApiKey = apiKey;
  }
  return cachedClient;
}

function classifyGeminiError(err: unknown): GeminiMaterialCodeError {
  if (err instanceof GeminiMaterialCodeError) return err;
  const rawMessage = String((err as { message?: string })?.message || err || '');
  const statusNum = Number((err as { status?: number })?.status || 0);
  const lower = rawMessage.toLowerCase();

  if (
    statusNum === 403 ||
    lower.includes('permission_denied') ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    statusNum === 401
  ) {
    return new GeminiMaterialCodeError(
      'Khóa Gemini API không hợp lệ hoặc không có quyền truy cập. Vui lòng kiểm tra lại API key trong mục Settings > Secrets.',
      403,
      'API_KEY_INVALID'
    );
  }

  if (
    statusNum === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit')
  ) {
    return new GeminiMaterialCodeError(
      'Hệ thống AI tạm thời vượt giới hạn lượt gọi (quota). Vui lòng thử lại sau ít giây.',
      429,
      'RESOURCE_EXHAUSTED'
    );
  }

  if (statusNum === 404 || lower.includes('not_found')) {
    return new GeminiMaterialCodeError(
      'Model AI không khả dụng trên cấu hình hiện tại. Vui lòng thử lại sau.',
      502,
      'MODEL_NOT_FOUND'
    );
  }

  return new GeminiMaterialCodeError(
    `Không thể phân tích tạo mã vật tư bằng AI lúc này: ${rawMessage.slice(0, 180)}`,
    statusNum >= 400 && statusNum < 600 ? statusNum : 502,
    'UPSTREAM_AI_ERROR'
  );
}

function isRetryableError(err: unknown): boolean {
  const statusNum = Number((err as { status?: number })?.status || 0);
  if (statusNum === 500 || statusNum === 502 || statusNum === 503 || statusNum === 504) {
    return true;
  }
  const msg = String((err as { message?: string })?.message || '').toLowerCase();
  return (
    msg.includes('unavailable') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('fetch failed') ||
    msg.includes('overloaded')
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const SYSTEM_INSTRUCTION = [
  'Bạn là chuyên gia mã hóa vật tư thiết bị công nghiệp, cơ điện và xây lắp dự án (EPC / dầu khí / nhiệt điện / nhà máy).',
  'Nhiệm vụ: Phân tích thông minh tên vật tư (và thông số phụ nếu có) để tạo Mã Vật Tư ngắn gọn, trực quan, dễ đọc, chuẩn kỹ thuật.',
  '',
  'QUY TẮC BẮT BUỘC:',
  `1. Độ dài MỖI mã vật tư PHẢI từ ${MATERIAL_CODE_MIN_LENGTH} đến ${MATERIAL_CODE_MAX_LENGTH} ký tự (tính cả dấu gạch ngang "-").`,
  '2. Chỉ được phép dùng chữ cái tiếng Anh viết HOA (A-Z), chữ số (0-9) và dấu gạch ngang "-".',
  '3. KHÔNG dấu tiếng Việt, KHÔNG khoảng trắng, KHÔNG dùng ký tự đặc biệt khác (_, /, ., *, (, )...), KHÔNG bắt đầu hoặc kết thúc bằng "-", KHÔNG dùng "--".',
  '4. KHÔNG BẮT BUỘC và KHÔNG tự động thêm tiền tố "VT" hay "VT-". Hãy đặt tiền tố giàu ngữ nghĩa kỹ thuật từ chính loại vật tư/thiết bị:',
  '   - Ví dụ: "Van cầu áp lực cao Class 600 DN200" -> "GLV-C600-DN200" hoặc "VCAU-C600-DN200"',
  '   - Ví dụ: "Ống thép đúc API 5L Gr.B DN150 SCH40" -> "PIPE-5LB-DN150-S40"',
  '   - Ví dụ: "Bulong lục giác M24x120 ASTM A193 B7" -> "BLG-M24X120-B7"',
  '   - Ví dụ: "Gioăng cao su mặt bích DN50" -> "GSK-CS-DN50-RF"',
  '   - Ví dụ: "Cáp điện lực 3x50mm2 XLPE 0.6/1kV" -> "CBL-3X50-XLPE"',
  '   - Ví dụ: "Rotary Air Preheaters M12 x 30L HEX BOLT" -> "BOLT-M12-30L-HEX"',
  '   - Ví dụ: "Mặt bích hàn cổ DN200 Class 300 A105" -> "FLG-WN-DN200-300"',
  '   - Ví dụ: "Thép hình H300x300x10x15 SS400" -> "BEAM-H300-SS400"',
  '5. Ưu tiên giữ lại các thông số cốt lõi nhận diện vật tư: loại vật tư + kích thước/quy cách (DN, M, OD, mm, inch, công suất) + vật liệu/tiêu chuẩn/áp lực (SS304, 316L, A105, B7, CL600, S40, PN16...).',
  '6. Mỗi vật tư khác nhau PHẢI có mã khác nhau và KHÔNG được trùng với danh sách existingCodes đã tồn tại.',
  '7. Nếu tên vật tư quá ngắn, bổ sung từ viết tắt nhóm vật tư hoặc hậu tố số để đạt đủ ít nhất 8 ký tự.',
  '8. Trả về JSON đúng schema, kèm lý do giải thích rất ngắn gọn (tối đa 10 từ tiếng Việt) về cấu trúc mã.'
].join('\n');

export async function generateMaterialCodesWithGemini(params: {
  items: AiMaterialCodeInputItem[];
  existingCodes?: string[];
}): Promise<AiMaterialCodeOutputItem[]> {
  const sanitizedItems = (params.items || [])
    .slice(0, 40)
    .map((it, idx) => ({
      index: idx,
      materialName: String(it?.materialName || '').trim(),
      unit: String(it?.unit || '').trim(),
      category: String(it?.category || '').trim(),
      specification: String(it?.specification || '').trim(),
      drawingNo: String(it?.drawingNo || '').trim()
    }));

  if (sanitizedItems.length === 0) {
    return [];
  }

  const nonEmptyItems = sanitizedItems.filter((it) => it.materialName.length > 0);
  if (nonEmptyItems.length === 0) {
    throw new GeminiMaterialCodeError(
      'Vui lòng nhập Tên vật tư trước khi phân tích tạo mã bằng AI.',
      400,
      'EMPTY_MATERIAL_NAME'
    );
  }

  const ai = getGeminiClient();

  const existingSet = new Set<string>();
  const existingSample: string[] = [];
  if (Array.isArray(params.existingCodes)) {
    for (const raw of params.existingCodes) {
      const k = normCodeKey(raw);
      if (!k || existingSet.has(k)) continue;
      existingSet.add(k);
      if (existingSample.length < 120) {
        existingSample.push(k);
      }
    }
  }

  const userPayload = {
    existingCodesSample: existingSample,
    materialsToCode: nonEmptyItems.map((it) => {
      const entry: Record<string, string | number> = {
        index: it.index,
        materialName: it.materialName
      };
      if (it.unit) entry.unit = it.unit;
      if (it.category) entry.category = it.category;
      if (it.specification) entry.specification = it.specification;
      if (it.drawingNo && it.drawingNo.toUpperCase() !== 'N/A') entry.drawingNo = it.drawingNo;
      return entry;
    })
  };

  let lastError: unknown = null;
  let responseText = '';

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Phân tích danh sách vật tư sau và tạo mã vật tư (8-20 ký tự, chỉ gồm A-Z, 0-9, "-", không nhất thiết có "VT"):\n${JSON.stringify(userPayload)}`,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    index: {
                      type: Type.INTEGER,
                      description: 'Original index from materialsToCode'
                    },
                    code: {
                      type: Type.STRING,
                      description:
                        'Uppercase material code, 8 to 20 chars, only A-Z, 0-9, and hyphen (-), no forced VT prefix'
                    },
                    reason: {
                      type: Type.STRING,
                      description: 'Short Vietnamese explanation of the code structure (max 10 words)'
                    }
                  },
                  required: ['index', 'code', 'reason']
                }
              }
            },
            required: ['items']
          }
        }
      });

      responseText = String(response.text || '').trim();
      if (!responseText) {
        throw new Error('Empty JSON response from Gemini model');
      }
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (attempt < 2 && isRetryableError(err)) {
        await sleep(400 * Math.pow(2, attempt));
        continue;
      }
      throw classifyGeminiError(err);
    }
  }

  if (lastError) {
    throw classifyGeminiError(lastError);
  }

  let parsed: { items?: Array<{ index?: number; code?: string; reason?: string }> };
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new GeminiMaterialCodeError(
      'AI trả về dữ liệu không đúng định dạng JSON. Vui lòng thử lại.',
      502,
      'INVALID_AI_JSON'
    );
  }

  const aiItems = Array.isArray(parsed?.items) ? parsed.items : [];
  const byIndex = new Map<number, { code: string; reason: string }>();
  for (const row of aiItems) {
    const idx = Number(row?.index);
    if (!Number.isInteger(idx)) continue;
    const rawCode = String(row?.code || '').trim();
    const rawReason = String(row?.reason || '').trim();
    if (rawCode) {
      byIndex.set(idx, { code: rawCode, reason: rawReason });
    }
  }

  const results: AiMaterialCodeOutputItem[] = [];
  for (const item of nonEmptyItems) {
    const aiMatch = byIndex.get(item.index);
    if (!aiMatch || !aiMatch.code) {
      throw new GeminiMaterialCodeError(
        `AI chưa tạo được mã cho vật tư "${item.materialName}". Vui lòng thử lại.`,
        502,
        'INCOMPLETE_AI_RESPONSE'
      );
    }
    const validatedCode = ensureUniqueValidMaterialCode(
      aiMatch.code,
      existingSet,
      item.materialName
    );
    results.push({
      index: item.index,
      code: validatedCode,
      reason: aiMatch.reason || 'Phân tích thông số vật tư bằng AI'
    });
  }

  return results;
}
