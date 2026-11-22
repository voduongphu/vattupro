import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  COMPREHENSIVE_UI_PHRASES_EN,
  SYSTEM_UI_PATTERN_RULES_EN
} from '../context/translationsDict';

const VIETNAMESE_DIACRITIC_RE = /[À-ỹà-ỹĐđ]/;

function applySystemTranslation(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (Object.prototype.hasOwnProperty.call(COMPREHENSIVE_UI_PHRASES_EN, trimmed)) {
    return COMPREHENSIVE_UI_PHRASES_EN[trimmed];
  }
  for (const rule of SYSTEM_UI_PATTERN_RULES_EN) {
    if (rule.pattern.test(trimmed)) {
      return trimmed.replace(rule.pattern, rule.replace);
    }
  }
  return null;
}

test('all COMPREHENSIVE_UI_PHRASES_EN values are pure English with zero Vietnamese diacritics', () => {
  const offenders: Array<[string, string]> = [];
  for (const [vi, en] of Object.entries(COMPREHENSIVE_UI_PHRASES_EN)) {
    if (VIETNAMESE_DIACRITIC_RE.test(en)) {
      offenders.push([vi, en]);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Found Vietnamese diacritics in English dictionary values: ${JSON.stringify(offenders)}`
  );
});

test('all TRANSLATIONS.en values in LanguageContext.tsx are pure English with zero Vietnamese diacritics', () => {
  const content = fs.readFileSync(
    path.resolve(process.cwd(), 'src/context/LanguageContext.tsx'),
    'utf8'
  );
  const enBlockMatch = content.match(/\ben:\s*\{([\s\S]*?)\n\s*\}\s*\n\};/);
  assert.ok(enBlockMatch, 'Could not locate TRANSLATIONS.en block in LanguageContext.tsx');
  const enBlock = enBlockMatch[1];
  const valueMatches = [...enBlock.matchAll(/:\s*'([^']*)'/g)];
  assert.ok(valueMatches.length > 30, 'Expected at least 30 keys in TRANSLATIONS.en');

  const offenders = valueMatches
    .map((m) => m[1])
    .filter((v) => VIETNAMESE_DIACRITIC_RE.test(v));
  assert.deepEqual(
    offenders,
    [],
    `Found Vietnamese diacritics in TRANSLATIONS.en: ${JSON.stringify(offenders)}`
  );
});

test('dynamic pattern rules translate interpolated system UI strings and preserve user values verbatim', () => {
  const cases: Array<[string, string]> = [
    ['Trang 2 / 15', 'Page 2/15'],
    ['Tất cả kho (4)', 'All Warehouses (4)'],
    ['Tất cả kho bãi (6)', 'All Warehouses (6)'],
    ['Tất cả kho xuất (3)', 'All Issuing Warehouses (3)'],
    ['Tất cả hạng mục (12)', 'All Categories (12)'],
    ['Đang Mở (5)', 'Open (5)'],
    ['Đã Đóng (18)', 'Closed (18)'],
    ['500 Tấn', '500 Tons'],
    [
      'Kho: Kho Cảng Phú Mỹ - Bãi A (Đang chọn)',
      'Warehouse: Kho Cảng Phú Mỹ - Bãi A (Selected)'
    ],
    [
      '5 phiếu nhập đã chọn (PN-LP-2026-0001, PN-LP-2026-0002 và 3 phiếu nhập khác)',
      '5 selected inbound receipts (PN-LP-2026-0001, PN-LP-2026-0002 and 3 more inbound receipts)'
    ],
    [
      'Phiếu PX-LP-2026-0010 (Nguyễn Văn An)',
      'Voucher PX-LP-2026-0010 (Nguyễn Văn An)'
    ],
    [
      'Đã áp dụng vị trí "Bãi A - Khu 01 - Hàng 03" cho tất cả dòng vật tư.',
      'Applied storage location "Bãi A - Khu 01 - Hàng 03" to all material rows.'
    ],
    [
      'Gợi ý tồn kho khả dụng (12 kết quả cho "Ống thép đúc")',
      'Available stock suggestions (12 results for "Ống thép đúc")'
    ],
    [
      'Chỉ Admin (voduongphu@gmail.com) mới có quyền thêm/sửa/khóa người dùng',
      'Only Admin (voduongphu@gmail.com) can add, edit, or lock users'
    ],
    [
      'Đã import thành công 3 phiếu nhập kho (42 mục hàng)! Tự động cập nhật 5 vật tư mới.',
      'Successfully imported 3 inbound receipts (42 items)! Automatically added 5 new materials.'
    ],
    ['(gồm 4 mục vật tư ảnh hưởng)?', '(including 4 affected material items)?'],
    ['2. Kiểm tra dữ liệu (128 mặt hàng)', '2. Review Data (128 items)'],
    [
      'Tạm dừng kết nối Cloud vì lý do: Quá thời gian chờ kết nối/đồng bộ (> 2 phút) do mạng di động phản hồi chậm hoặc không thể liên hệ máy chủ Cloud. Vui lòng nhấn nút "Đồng Bộ Cloud" để chủ động kết nối lại.',
      'Paused Cloud sync due to: Connection/sync timed out (> 2 minutes) due to slow mobile network or unreachable Cloud server. Click "Cloud Sync" to manually reconnect.'
    ],
    [
      'Tạm dừng kết nối Cloud vì lý do: Thiết bị đang mất kết nối mạng Internet (ngoại tuyến). Vui lòng nhấn nút "Đồng Bộ Cloud" để chủ động kết nối lại.',
      'Paused Cloud sync due to: Device is offline (no Internet connection). Click "Cloud Sync" to manually reconnect.'
    ]
  ];

  for (const [input, expected] of cases) {
    const actual = applySystemTranslation(input);
    assert.equal(actual, expected, `Failed translating "${input}"`);
  }
});

test('arbitrary user-entered Vietnamese text is NOT matched by system dictionary or pattern rules', () => {
  const userEnteredSamples = [
    'Ống thép đúc không gỉ DN200 SCH40',
    'Kho Cảng Phú Mỹ - Bãi A',
    'Nguyễn Văn An',
    'Hàng giao đợt 2 bị móp nhẹ mặt bích',
    'Công ty TNHH Thiết Bị Dầu Khí Biển Đông',
    'Tổ lắp máy số 3 - Khu vực lọc dầu',
    'Bãi B - Kệ C4 - Tầng 2',
    'Van bi 2 chiều inox 316 chịu áp lực cao'
  ];

  for (const sample of userEnteredSamples) {
    const translated = applySystemTranslation(sample);
    assert.equal(
      translated,
      null,
      `User-entered content "${sample}" should NOT be translated, but got "${translated}"`
    );
  }
});

test('local account login UI has been completely removed from LoginScreen, LoginModal, and firestoreSync', () => {
  const files = [
    'src/components/auth/LoginScreen.tsx',
    'src/components/auth/LoginModal.tsx',
    'src/services/firestoreSync.ts'
  ];
  const forbiddenPatterns = [
    /Tài khoản cục bộ/i,
    /Đăng nhập cục bộ/i,
    /Đăng nhập bằng tài khoản cục bộ/i,
    /Local Account/i,
    /loginMode\s*===\s*['"]local['"]/i
  ];

  for (const relPath of files) {
    const content = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
    for (const pat of forbiddenPatterns) {
      assert.equal(
        pat.test(content),
        false,
        `Forbidden local-login pattern ${pat} found in ${relPath}`
      );
    }
  }
});
