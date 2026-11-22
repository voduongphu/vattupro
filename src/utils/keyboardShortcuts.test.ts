import test from 'node:test';
import assert from 'node:assert/strict';
import { matchAppShortcut } from './keyboardShortcuts';

test('matchAppShortcut matches Ctrl+K and Cmd+K for quick-search', () => {
  assert.equal(
    matchAppShortcut({
      key: 'k',
      code: 'KeyK',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    'quick-search'
  );

  assert.equal(
    matchAppShortcut({
      key: 'K',
      code: 'KeyK',
      ctrlKey: false,
      metaKey: true,
      altKey: false,
      shiftKey: false
    }),
    'quick-search'
  );

  // Supports non-Latin / IME key values via physical KeyK code
  assert.equal(
    matchAppShortcut({
      key: 'Process',
      code: 'KeyK',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    'quick-search'
  );
});

test('matchAppShortcut matches Ctrl+Space for new-voucher', () => {
  assert.equal(
    matchAppShortcut({
      key: ' ',
      code: 'Space',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    'new-voucher'
  );

  assert.equal(
    matchAppShortcut({
      key: 'Spacebar',
      code: 'Space',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    'new-voucher'
  );

  // Supports IME key values via physical Space code
  assert.equal(
    matchAppShortcut({
      key: 'Process',
      code: 'Space',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    'new-voucher'
  );
});

test('matchAppShortcut ignores plain Space, Ctrl+N, and conflicting modifier combos', () => {
  assert.equal(
    matchAppShortcut({
      key: ' ',
      code: 'Space',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    null
  );

  assert.equal(
    matchAppShortcut({
      key: 'n',
      code: 'KeyN',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    null
  );

  assert.equal(
    matchAppShortcut({
      key: 'k',
      code: 'KeyK',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: true
    }),
    null
  );

  assert.equal(
    matchAppShortcut({
      key: ' ',
      code: 'Space',
      ctrlKey: true,
      metaKey: false,
      altKey: true,
      shiftKey: false
    }),
    null
  );

  assert.equal(
    matchAppShortcut({
      key: ' ',
      code: 'Space',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: true
    }),
    null
  );
});
