import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMoneyWordsByLanguage,
  numberToEnglishMoneyWords,
  numberToVietnameseMoneyWords
} from './vietnameseMoneyWords.ts';

describe('vietnameseMoneyWords', () => {
  it('returns empty string for zero, negative, or non-finite values', () => {
    assert.equal(numberToVietnameseMoneyWords(0), '');
    assert.equal(numberToVietnameseMoneyWords(-1500), '');
    assert.equal(numberToVietnameseMoneyWords(Number.NaN), '');
    assert.equal(numberToVietnameseMoneyWords(null), '');
    assert.equal(numberToEnglishMoneyWords(0), '');
  });

  it('converts Vietnamese VND amounts accurately using accounting conventions', () => {
    assert.equal(numberToVietnameseMoneyWords(1), 'Một đồng');
    assert.equal(numberToVietnameseMoneyWords(15), 'Mười lăm đồng');
    assert.equal(numberToVietnameseMoneyWords(21), 'Hai mươi mốt đồng');
    assert.equal(numberToVietnameseMoneyWords(24), 'Hai mươi tư đồng');
    assert.equal(numberToVietnameseMoneyWords(105), 'Một trăm linh năm đồng');
    assert.equal(numberToVietnameseMoneyWords(1005000), 'Một triệu không trăm linh năm nghìn đồng');
    assert.equal(numberToVietnameseMoneyWords(15250000), 'Mười lăm triệu hai trăm năm mươi nghìn đồng');
    assert.equal(
      numberToVietnameseMoneyWords(2000000000),
      'Hai tỷ đồng'
    );
  });

  it('converts English VND amounts and respects language helper', () => {
    assert.equal(numberToEnglishMoneyWords(15250000), 'Fifteen million two hundred fifty thousand VND');
    assert.equal(
      formatMoneyWordsByLanguage(500000, 'vi'),
      'Năm trăm nghìn đồng'
    );
    assert.equal(
      formatMoneyWordsByLanguage(500000, 'en'),
      'Five hundred thousand VND'
    );
  });
});
