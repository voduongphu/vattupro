import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MATERIAL_CODE_MIN_LENGTH,
  MATERIAL_CODE_MAX_LENGTH,
  isValidMaterialCodeFormat,
  sanitizeMaterialCodeCandidate,
  ensureUniqueValidMaterialCode,
  generateSmartDeterministicMaterialCode
} from './materialCodeAi.ts';

describe('materialCodeAi utilities', () => {
  it('validates 8 to 20 character uppercase alphanumeric + hyphen codes', () => {
    assert.equal(isValidMaterialCodeFormat('PIPE-5LB-DN150'), true);
    assert.equal(isValidMaterialCodeFormat('GLV-C600-DN200'), true);
    assert.equal(isValidMaterialCodeFormat('A1234567'), true); // 8 chars
    assert.equal(isValidMaterialCodeFormat('ABCD-1234-EFGH-56789'), true); // 20 chars

    assert.equal(isValidMaterialCodeFormat('ABC-123'), false); // 7 chars (< 8)
    assert.equal(isValidMaterialCodeFormat('ABCD-1234-EFGH-567890'), false); // 21 chars (> 20)
    assert.equal(isValidMaterialCodeFormat('-PIPE-DN100'), false); // leading hyphen
    assert.equal(isValidMaterialCodeFormat('PIPE-DN100-'), false); // trailing hyphen
    assert.equal(isValidMaterialCodeFormat('PIPE--DN100'), false); // double hyphen
    assert.equal(isValidMaterialCodeFormat('PIPE DN100'), false); // space
    assert.equal(isValidMaterialCodeFormat('ONG_THEP_100'), false); // underscore
  });

  it('sanitizes Vietnamese diacritics and special characters into clean uppercase [A-Z0-9-]', () => {
    assert.equal(
      sanitizeMaterialCodeCandidate('Ống thép / API 5L_DN150'),
      'ONG-THEP-API-5L-DN15'
    );
    assert.equal(
      sanitizeMaterialCodeCandidate('  van--bi__DN50!!  '),
      'VAN-BI-DN50'
    );
  });

  it('enforces 8-20 char length and uniqueness without forcing VT prefix', () => {
    const used = new Set<string>(['GLV-C600-DN200']);

    // Deduplicates existing AI suggestion while keeping 8-20 chars
    const c1 = ensureUniqueValidMaterialCode('GLV-C600-DN200', used, 'Van cầu áp lực cao Class 600 DN200');
    assert.equal(isValidMaterialCodeFormat(c1), true);
    assert.notEqual(c1, 'GLV-C600-DN200');
    assert.equal(c1.startsWith('VT-'), false);

    // Pads too-short AI candidate cleanly to >= 8 chars without adding VT
    const c2 = ensureUniqueValidMaterialCode('M12', used, 'Bulong lục giác M12x40 inox 304');
    assert.equal(isValidMaterialCodeFormat(c2), true);
    assert.ok(c2.length >= MATERIAL_CODE_MIN_LENGTH && c2.length <= MATERIAL_CODE_MAX_LENGTH);
    assert.equal(c2.startsWith('VT-'), false);

    // Truncates overly long candidate cleanly to <= 20 chars
    const c3 = ensureUniqueValidMaterialCode(
      'ROTARY-AIR-PREHEATER-M12X30-HEX-BOLT-GRADE-88',
      used,
      'Rotary Air Preheaters M12 x 30L HEX BOLT'
    );
    assert.equal(isValidMaterialCodeFormat(c3), true);
    assert.ok(c3.length >= MATERIAL_CODE_MIN_LENGTH && c3.length <= MATERIAL_CODE_MAX_LENGTH);
  });

  it('generates deterministic fallback codes strictly 8-20 chars without mandatory VT prefix', () => {
    const used = new Set<string>();
    const codeA = generateSmartDeterministicMaterialCode(used, 'Van cầu áp lực cao Class 600 DN200');
    const codeB = generateSmartDeterministicMaterialCode(used, 'Ống thép đúc API 5L Gr.B DN150 SCH40');
    const codeC = generateSmartDeterministicMaterialCode(used, 'Đinh');

    assert.ok(codeA.startsWith('GLV-C600-DN200'), `Expected GLV-C600-DN200 prefix, got ${codeA}`);
    assert.ok(codeB.startsWith('PIPE-API5L-DN150'), `Expected PIPE-API5L-DN150 prefix, got ${codeB}`);

    for (const c of [codeA, codeB, codeC]) {
      assert.equal(isValidMaterialCodeFormat(c), true, `Invalid code format: ${c}`);
      assert.equal(c.startsWith('VT-'), false, `Should not force VT prefix: ${c}`);
    }
    assert.notEqual(codeA, codeB);
  });
});
