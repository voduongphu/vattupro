import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInboundMaterialCodeResolver,
  normalizeMaterialNameLookupKey
} from './additiveMerge.ts';

describe('createInboundMaterialCodeResolver', () => {
  it('reuses existing material code from app catalog when materialName matches (case/space/NFC-insensitive)', () => {
    const resolver = createInboundMaterialCodeResolver({
      materials: [
        { code: 'ONG-API-100', name: 'Ống thép API 5L DN100', updatedAt: 1000 },
        { code: 'VAN-BI-50', name: 'Van bi mặt bích DN50', updatedAt: 2000 }
      ]
    });

    const r1 = resolver.resolveWithSource('', '  ống   thép API 5L DN100 ');
    assert.deepEqual(r1, { code: 'ONG-API-100', source: 'catalog' });

    const r2 = resolver.resolveWithSource(undefined, 'VAN BI MẶT BÍCH DN50');
    assert.deepEqual(r2, { code: 'VAN-BI-50', source: 'catalog' });

    // Second blank row with the same catalog name still reuses the exact same catalog code
    const r3 = resolver.resolveWithSource('', 'Ống thép API 5L DN100');
    assert.deepEqual(r3, { code: 'ONG-API-100', source: 'catalog' });
  });

  it('generates the exact same code for identical material names not yet in catalog, and distinct codes for different names', () => {
    const resolver = createInboundMaterialCodeResolver({
      materials: [{ code: 'MAT-01', name: 'Vật tư có sẵn', updatedAt: 100 }]
    });

    const first = resolver.resolveWithSource('', 'Van bi mặt bích DN80');
    const secondSameName = resolver.resolveWithSource('', '  van bi   mặt bích DN80  ');
    const differentNameSameSlug = resolver.resolveWithSource('', 'Van bi mặt bích DN100');

    assert.equal(first.source, 'generated');
    assert.equal(secondSameName.source, 'generated');
    assert.equal(differentNameSameSlug.source, 'generated');

    assert.equal(first.code, secondSameName.code);
    assert.notEqual(first.code, differentNameSameSlug.code);
  });

  it('reuses explicit code from another row in the same import batch when name is not in catalog, while catalog still takes precedence', () => {
    const resolver = createInboundMaterialCodeResolver({
      materials: [{ code: 'CAT-001', name: 'Bulong M16', updatedAt: 500 }],
      extraItems: [
        { materialCode: 'CUSTOM-77', materialName: 'Gioăng cao su DN50' },
        { materialCode: '', materialName: 'Gioăng cao su DN50' },
        { materialCode: 'OVERRIDE-M16', materialName: 'Bulong M16' },
        { materialCode: '', materialName: 'Bulong M16' }
      ]
    });

    assert.equal(resolver.resolve('', 'Gioăng cao su DN50'), 'CUSTOM-77');
    assert.equal(resolver.resolve('OVERRIDE-M16', 'Bulong M16'), 'OVERRIDE-M16');
    assert.equal(resolver.resolve('', 'Bulong M16'), 'CAT-001');
  });

  it('keeps distinct Vietnamese diacritic words separate under normalizeMaterialNameLookupKey', () => {
    assert.notEqual(
      normalizeMaterialNameLookupKey('Đầu nối thép'),
      normalizeMaterialNameLookupKey('Dấu nối thép')
    );
    assert.equal(
      normalizeMaterialNameLookupKey('  Ống   Thép\u0020 '),
      normalizeMaterialNameLookupKey('ống thép')
    );
  });
});
