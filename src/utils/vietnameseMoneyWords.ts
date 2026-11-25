const VI_DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'] as const;
const VI_SCALES = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'] as const;

function readThreeDigitsVi(num: number, showZeroHundred: boolean): string {
  const hundreds = Math.floor(num / 100);
  const tens = Math.floor((num % 100) / 10);
  const units = num % 10;
  const parts: string[] = [];

  if (hundreds > 0 || showZeroHundred) {
    parts.push(`${VI_DIGITS[hundreds]} trăm`);
    if (tens === 0 && units > 0) {
      parts.push('linh');
    }
  }

  if (tens === 1) {
    parts.push('mười');
    if (units === 5) {
      parts.push('lăm');
    } else if (units > 0) {
      parts.push(VI_DIGITS[units]);
    }
  } else if (tens > 1) {
    parts.push(`${VI_DIGITS[tens]} mươi`);
    if (units === 1) {
      parts.push('mốt');
    } else if (units === 4) {
      parts.push('tư');
    } else if (units === 5) {
      parts.push('lăm');
    } else if (units > 0) {
      parts.push(VI_DIGITS[units]);
    }
  } else if (units > 0) {
    parts.push(VI_DIGITS[units]);
  }

  return parts.join(' ').trim();
}

/**
 * Chuyển đổi số tiền (VNĐ) thành chữ tiếng Việt chuẩn chứng từ kế toán/kho vận.
 * Trả về chuỗi rỗng nếu số tiền <= 0 hoặc không hợp lệ.
 */
export function numberToVietnameseMoneyWords(amount: number | string | null | undefined): string {
  const raw = Number(amount);
  if (!Number.isFinite(raw) || raw <= 0) return '';

  const rounded = Math.round(raw);
  if (rounded <= 0) return '';

  const groups: number[] = [];
  let remaining = rounded;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const isMostSignificant = i === groups.length - 1;
    const groupText = readThreeDigitsVi(g, !isMostSignificant);
    const scale = VI_SCALES[i] || '';
    parts.push(scale ? `${groupText} ${scale}` : groupText);
  }

  const sentence = `${parts.join(' ').replace(/\s+/g, ' ').trim()} đồng`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

const EN_ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen'
] as const;

const EN_TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety'
] as const;

const EN_SCALES = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion'] as const;

function readThreeDigitsEn(num: number): string {
  const hundreds = Math.floor(num / 100);
  const rem = num % 100;
  const parts: string[] = [];

  if (hundreds > 0) {
    parts.push(`${EN_ONES[hundreds]} hundred`);
  }
  if (rem > 0) {
    if (rem < 20) {
      parts.push(EN_ONES[rem]);
    } else {
      const tens = Math.floor(rem / 10);
      const ones = rem % 10;
      parts.push(ones > 0 ? `${EN_TENS[tens]}-${EN_ONES[ones]}` : EN_TENS[tens]);
    }
  }
  return parts.join(' ').trim();
}

export function numberToEnglishMoneyWords(amount: number | string | null | undefined): string {
  const raw = Number(amount);
  if (!Number.isFinite(raw) || raw <= 0) return '';

  const rounded = Math.round(raw);
  if (rounded <= 0) return '';

  const groups: number[] = [];
  let remaining = rounded;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const groupText = readThreeDigitsEn(g);
    const scale = EN_SCALES[i] || '';
    parts.push(scale ? `${groupText} ${scale}` : groupText);
  }

  const sentence = `${parts.join(' ').replace(/\s+/g, ' ').trim()} VND`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export function formatMoneyWordsByLanguage(
  amount: number | string | null | undefined,
  language: 'vi' | 'en'
): string {
  return language === 'en'
    ? numberToEnglishMoneyWords(amount)
    : numberToVietnameseMoneyWords(amount);
}
