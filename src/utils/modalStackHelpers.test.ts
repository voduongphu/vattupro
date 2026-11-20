import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  upsertModalEntry,
  removeModalEntry,
  getTopmostModalEntry,
  type ModalStackEntry
} from './modalStackHelpers.ts';

describe('modalStackHelpers', () => {
  it('resolves topmost modal by priority first, then open order', () => {
    let stack: ModalStackEntry[] = [];
    stack = upsertModalEntry(stack, {
      id: 'outbound-form',
      title: 'Lập Phiếu Xuất Kho Mới',
      priority: 50,
      order: 1
    });
    assert.equal(getTopmostModalEntry(stack)?.id, 'outbound-form');

    // Open stock picker sub-modal with higher priority (60)
    stack = upsertModalEntry(stack, {
      id: 'stock-picker',
      title: 'Chọn Hàng Hóa Từ Tồn Kho Khả Dụng',
      priority: 60,
      order: 2
    });
    assert.equal(getTopmostModalEntry(stack)?.id, 'stock-picker');

    // Re-updating underlying modal metadata must preserve its lower order & priority
    stack = upsertModalEntry(stack, {
      id: 'outbound-form',
      title: 'Chỉnh Sửa Phiếu Xuất Kho',
      priority: 50,
      order: 99
    });
    assert.equal(getTopmostModalEntry(stack)?.id, 'stock-picker');

    // Closing stock picker leaves outbound-form active and topmost
    stack = removeModalEntry(stack, 'stock-picker');
    assert.equal(getTopmostModalEntry(stack)?.id, 'outbound-form');

    // Closing last modal empties stack
    stack = removeModalEntry(stack, 'outbound-form');
    assert.equal(getTopmostModalEntry(stack), null);
  });

  it('picks the most recently opened modal when priorities are equal', () => {
    let stack: ModalStackEntry[] = [];
    stack = upsertModalEntry(stack, {
      id: 'first',
      title: 'First',
      priority: 50,
      order: 1
    });
    stack = upsertModalEntry(stack, {
      id: 'second',
      title: 'Second',
      priority: 50,
      order: 2
    });
    assert.equal(getTopmostModalEntry(stack)?.id, 'second');

    stack = removeModalEntry(stack, 'second');
    assert.equal(getTopmostModalEntry(stack)?.id, 'first');
  });
});
