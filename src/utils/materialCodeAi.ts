export const MATERIAL_CODE_MIN_LENGTH = 8;
export const MATERIAL_CODE_MAX_LENGTH = 20;

const ALLOWED_CHAR_REGEX = /^[A-Z0-9-]+$/;

const VIETNAMESE_STOP_WORDS = new Set([
  'VA',
  'CUA',
  'CHO',
  'THEO',
  'LOAI',
  'BANG',
  'CO',
  'KHONG',
  'VOI',
  'TRONG',
  'NGOAI',
  'TAI',
  'TU',
  'DEN',
  'BO',
  'CAI',
  'CAY',
  'CHIEC',
  'TAM',
  'CUON',
  'HOP',
  'THUNG',
  'THE',
  'FOR',
  'WITH',
  'AND',
  'OF',
  'TYPE',
  'SIZE',
  'WITHIN',
  'FROM',
  'TO',
  'IN',
  'ON'
]);

const DOMAIN_ABBREVIATIONS: Record<string, string> = {
  ONG: 'PIPE',
  THEP: 'STL',
  INOX: 'SS',
  VAN: 'VLV',
  CAU: 'GLB',
  CONG: 'GAT',
  BI: 'BAL',
  BUOM: 'BFY',
  MOT: 'CHK',
  CHIEU: 'CHK',
  BULONG: 'BOLT',
  BULON: 'BOLT',
  OC: 'NUT',
  VIT: 'SCR',
  LONG: 'WSH',
  DEN: 'WSH',
  GIOANG: 'GSK',
  RON: 'GSK',
  MAT: 'FLG',
  BICH: 'FLG',
  CO: 'ELB',
  CUT: 'ELB',
  TE: 'TEE',
  BAU: 'RED',
  GIAM: 'RED',
  CAP: 'CBL',
  DIEN: 'ELC',
  BOM: 'PMP',
  DONG: 'MTR',
  COI: 'MTR',
  CAM: 'SNS',
  BIEN: 'SNS',
  DONGHO: 'GAG',
  AP: 'PRS',
  NHIET: 'TMP',
  SON: 'PNT',
  QUE: 'ELR',
  HAN: 'WLD',
  DAY: 'WIR',
  KEO: 'GLUE',
  DAU: 'OIL',
  MO: 'GRS',
  LOC: 'FLT',
  KHOP: 'CPL',
  NOI: 'CPL',
  THANH: 'BAR',
  TAM: 'PLT',
  HINH: 'SEC',
  TU: 'PNL',
  BANG: 'PNL',
  DENCHIEU: 'LGT',
  CHIEU_SANG: 'LGT',
  PHU: 'ACC',
  KIEN: 'ACC',
  THIET: 'EQP',
  VALVE: 'VLV',
  GLOBE: 'GLB',
  GATE: 'GAT',
  BALL: 'BAL',
  BUTTERFLY: 'BFY',
  CHECK: 'CHK',
  FLANGE: 'FLG',
  GASKET: 'GSK',
  ELBOW: 'ELB',
  REDUCER: 'RED',
  BOLT: 'BOLT',
  HEX: 'HEX',
  NUT: 'NUT',
  WASHER: 'WSH',
  STUD: 'STUD',
  CABLE: 'CBL',
  PUMP: 'PMP',
  MOTOR: 'MTR',
  SENSOR: 'SNS',
  GAUGE: 'GAG',
  STEEL: 'STL',
  PLATE: 'PLT',
  PIPE: 'PIPE',
  TUBE: 'TUBE',
  BEAM: 'BEAM',
  FILTER: 'FLT',
  COUPLING: 'CPL',
  NIPPLE: 'NIP',
  UNION: 'UNI',
  PANEL: 'PNL',
  SWITCH: 'SWT',
  BREAKER: 'BRK',
  TRANSFORMER: 'XFM',
  BEARING: 'BRG',
  SEAL: 'SEAL',
  HOSE: 'HOSE',
  CLAMP: 'CLMP',
  SUPPORT: 'SUP',
  BRACKET: 'BKT',
  INSULATION: 'INS'
};

export function foldAsciiUpper(raw: string | null | undefined): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase();
}

export function normCodeKey(raw: string | null | undefined): string {
  return String(raw || '').trim().toUpperCase();
}

export function isValidMaterialCodeFormat(code: string | null | undefined): boolean {
  const s = String(code || '').trim();
  if (s.length < MATERIAL_CODE_MIN_LENGTH || s.length > MATERIAL_CODE_MAX_LENGTH) {
    return false;
  }
  if (!ALLOWED_CHAR_REGEX.test(s)) return false;
  if (s.startsWith('-') || s.endsWith('-') || s.includes('--')) return false;
  return true;
}

export function sanitizeMaterialCodeCandidate(raw: string | null | undefined): string {
  let s = foldAsciiUpper(raw)
    .replace(/[^A-Z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  if (s.length > MATERIAL_CODE_MAX_LENGTH) {
    s = trimCodeToMaxLength(s, MATERIAL_CODE_MAX_LENGTH);
  }
  return s;
}

function trimCodeToMaxLength(code: string, maxLen: number): string {
  if (code.length <= maxLen) return code.replace(/^-+|-+$/g, '');
  let trimmed = code.slice(0, maxLen).replace(/-+$/g, '');
  if (!trimmed) {
    trimmed = code.replace(/-/g, '').slice(0, maxLen);
  }
  return trimmed;
}

function normalizeEngineeringPhrases(input: string): string {
  return foldAsciiUpper(input)
    .replace(/\bVAN\s+CAU\b/g, 'GLV')
    .replace(/\bGLOBE\s+VALVE\b/g, 'GLV')
    .replace(/\bVAN\s+BI\b/g, 'BLV')
    .replace(/\bBALL\s+VALVE\b/g, 'BLV')
    .replace(/\bVAN\s+CONG\b/g, 'GTV')
    .replace(/\bGATE\s+VALVE\b/g, 'GTV')
    .replace(/\bVAN\s+BUOM\b/g, 'BFV')
    .replace(/\bBUTTERFLY\s+VALVE\b/g, 'BFV')
    .replace(/\bVAN\s+MOT\s+CHIEU\b/g, 'CKV')
    .replace(/\bCHECK\s+VALVE\b/g, 'CKV')
    .replace(/\bMAT\s+BICH\b/g, 'FLG')
    .replace(/\bONG\s+THEP\b/g, 'PIPE')
    .replace(/\bCAP\s+DIEN\b/g, 'CBL')
    .replace(/\bDONG\s+HO\s+AP\b/g, 'PGAG')
    .replace(/\bDONG\s+HO\b/g, 'GAG')
    .replace(/\bCLASS\s*(\d+)\b/g, 'C$1')
    .replace(/\bCL\s*(\d+)\b/g, 'C$1')
    .replace(/\bSCH(?:EDULE)?\s*(\d+S?)\b/g, 'S$1')
    .replace(/\bDN\s*(\d+)\b/g, 'DN$1')
    .replace(/\bPN\s*(\d+)\b/g, 'PN$1')
    .replace(/\bINOX\s*(\d+L?)\b/g, 'SS$1')
    .replace(/\bAPI\s*5L\b/g, 'API5L')
    .replace(/\bGR\.?\s*([A-Z0-9]+)\b/g, 'GR$1');
}

function extractDescriptiveTokens(materialName?: string | null): string[] {
  const folded = normalizeEngineeringPhrases(String(materialName || ''));
  const rawTokens = folded
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const specTokens: string[] = [];
  const wordTokens: string[] = [];

  for (const tok of rawTokens) {
    if (/\d/.test(tok)) {
      // Keep technical specs like DN200, M24X120, 3X50, C600, SS316L, API5L, S40
      const cleanSpec = tok.slice(0, 8);
      if (cleanSpec && !specTokens.includes(cleanSpec)) {
        specTokens.push(cleanSpec);
      }
      continue;
    }
    if (tok.length <= 1 || VIETNAMESE_STOP_WORDS.has(tok)) continue;
    const mapped = DOMAIN_ABBREVIATIONS[tok] || tok.slice(0, 4);
    if (mapped && !wordTokens.includes(mapped)) {
      wordTokens.push(mapped);
    }
  }

  // Prioritize meaningful engineering type word first, then specs, then additional descriptor words
  const ordered: string[] = [];
  if (wordTokens.length > 0) ordered.push(wordTokens[0]);
  for (const s of specTokens.slice(0, 2)) {
    if (!ordered.includes(s)) ordered.push(s);
  }
  for (const w of wordTokens.slice(1, 3)) {
    if (!ordered.includes(w)) ordered.push(w);
  }
  return ordered;
}

function computeShortDeterministicHash(input: string, len = 4): string {
  let h = 0x811c9dc5;
  const s = foldAsciiUpper(input).trim() || 'ITEM';
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const base36 = (h >>> 0).toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '0');
  return base36.padStart(len, '0').slice(-len);
}

/**
 * Ensures any material code candidate (from AI or fallback) strictly adheres to:
 * - 8 to 20 characters
 * - Only A-Z, 0-9, and "-"
 * - No leading/trailing "-" and no "--"
 * - Not colliding with any code in `usedCodes`
 * - Does NOT force a "VT" prefix
 */
export function ensureUniqueValidMaterialCode(
  candidate: string | null | undefined,
  usedCodes: Set<string>,
  materialName?: string | null
): string {
  let base = sanitizeMaterialCodeCandidate(candidate);

  if (!base) {
    base = buildBaseStemFromName(materialName);
  }

  // Pad cleanly if shorter than 8 characters without forcing "VT"
  if (base.length < MATERIAL_CODE_MIN_LENGTH) {
    const tokens = extractDescriptiveTokens(materialName);
    for (const tok of tokens) {
      if (base.length >= MATERIAL_CODE_MIN_LENGTH) break;
      if (base.includes(tok)) continue;
      const joined = `${base}-${tok}`;
      if (joined.length <= MATERIAL_CODE_MAX_LENGTH) {
        base = joined;
      }
    }
  }

  if (base.length < MATERIAL_CODE_MIN_LENGTH) {
    const padLen = Math.max(2, MATERIAL_CODE_MIN_LENGTH - base.length - 1);
    const suffix = computeShortDeterministicHash(materialName || base, Math.min(4, padLen));
    base = `${base}-${suffix}`;
  }

  if (base.length < MATERIAL_CODE_MIN_LENGTH) {
    base = base.padEnd(MATERIAL_CODE_MIN_LENGTH, '0');
  }

  if (base.length > MATERIAL_CODE_MAX_LENGTH) {
    base = trimCodeToMaxLength(base, MATERIAL_CODE_MAX_LENGTH);
    if (base.length < MATERIAL_CODE_MIN_LENGTH) {
      const need = MATERIAL_CODE_MIN_LENGTH - base.length;
      base = `${base}${computeShortDeterministicHash(materialName || base, need)}`;
    }
  }

  // Ensure uniqueness against usedCodes
  let finalCode = base;
  if (usedCodes.has(normCodeKey(finalCode))) {
    let seq = 1;
    while (seq < 10000) {
      const suffix = `-${String(seq).padStart(2, '0')}`;
      const maxPrefixLen = MATERIAL_CODE_MAX_LENGTH - suffix.length;
      let prefix = trimCodeToMaxLength(base, maxPrefixLen);
      if (prefix.length + suffix.length < MATERIAL_CODE_MIN_LENGTH) {
        prefix = prefix.padEnd(MATERIAL_CODE_MIN_LENGTH - suffix.length, '0');
      }
      const nextCandidate = `${prefix}${suffix}`;
      if (
        isValidMaterialCodeFormat(nextCandidate) &&
        !usedCodes.has(normCodeKey(nextCandidate))
      ) {
        finalCode = nextCandidate;
        break;
      }
      seq++;
    }
  }

  usedCodes.add(normCodeKey(finalCode));
  return finalCode;
}

function buildBaseStemFromName(materialName?: string | null): string {
  const tokens = extractDescriptiveTokens(materialName);
  let stem = '';
  for (const tok of tokens) {
    const next = stem ? `${stem}-${tok}` : tok;
    if (next.length <= MATERIAL_CODE_MAX_LENGTH - 3) {
      stem = next;
    } else if (!stem) {
      stem = tok.slice(0, MATERIAL_CODE_MAX_LENGTH - 3);
    }
  }
  if (!stem) {
    stem = `MAT-${computeShortDeterministicHash(materialName || 'ITEM', 4)}`;
  }
  return stem;
}

/**
 * Synchronous deterministic material code generator used only for non-AI synchronous
 * utilities (e.g., offline preview / catalog resolver).
 * Strictly produces 8–20 char [A-Z0-9-] codes without requiring "VT".
 */
export function generateSmartDeterministicMaterialCode(
  usedCodes: Set<string>,
  materialName?: string | null,
  optionalPrefix?: string
): string {
  const cleanOptionalPrefix =
    optionalPrefix && optionalPrefix.trim() && normCodeKey(optionalPrefix) !== 'VT'
      ? sanitizeMaterialCodeCandidate(optionalPrefix).replace(/-/g, '').slice(0, 4)
      : '';

  const baseStem = buildBaseStemFromName(materialName);
  const fullStem = cleanOptionalPrefix && !baseStem.startsWith(cleanOptionalPrefix)
    ? trimCodeToMaxLength(`${cleanOptionalPrefix}-${baseStem}`, MATERIAL_CODE_MAX_LENGTH - 4)
    : trimCodeToMaxLength(baseStem, MATERIAL_CODE_MAX_LENGTH - 4);

  const stemPattern = new RegExp(`^${fullStem.replace(/[-]/g, '\\-')}-(\\d+)$`);
  let maxSeq = 0;
  usedCodes.forEach((code) => {
    const m = code.match(stemPattern);
    if (m) {
      const num = parseInt(m[1], 10);
      if (Number.isFinite(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  });

  const seq = maxSeq + 1;
  const minSeqDigits = Math.max(2, MATERIAL_CODE_MIN_LENGTH - fullStem.length - 1);
  const rawCandidate = `${fullStem}-${String(seq).padStart(Math.min(4, Math.max(2, minSeqDigits)), '0')}`;
  return ensureUniqueValidMaterialCode(rawCandidate, usedCodes, materialName);
}
