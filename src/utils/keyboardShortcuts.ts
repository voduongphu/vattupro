export type AppShortcutAction = 'quick-search' | 'new-voucher';

export interface ShortcutKeyEventLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Nhận diện phím tắt toàn cục của ứng dụng:
 * - Ctrl+K / Cmd+K -> 'quick-search' (Tìm kiếm nhanh)
 * - Ctrl+Space -> 'new-voucher' (Lập phiếu nhập/xuất kho mới)
 *
 * Kiểm tra cả `event.key` lẫn `event.code` (KeyK / Space) để hoạt động ổn định
 * ngay cả khi người dùng đang bật bộ gõ tiếng Việt (Unikey/EVKey/Telex) hoặc CapsLock.
 */
export function matchAppShortcut(event: ShortcutKeyEventLike): AppShortcutAction | null {
  const key = event.key || '';
  const keyLower = key.toLowerCase();
  const code = event.code || '';
  const hasPrimaryModifier = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;

  const isK = keyLower === 'k' || code === 'KeyK';
  if (hasPrimaryModifier && isK) {
    return 'quick-search';
  }

  const isSpace = code === 'Space' || key === ' ' || key === 'Spacebar';
  if (hasPrimaryModifier && isSpace) {
    return 'new-voucher';
  }

  return null;
}

function isFocusableVisibleInput(el: Element): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  if (!el.isConnected || el.disabled || el.readOnly) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function focusAndSelectInput(input: HTMLInputElement): void {
  try {
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch {
    // Fallback for environments without smooth scroll support
  }
  input.focus({ preventScroll: true });
  try {
    input.select();
  } catch {
    // Ignore selection errors on unsupported input types
  }
}

/**
 * Tìm và đặt focus vào ô tìm kiếm phù hợp nhất với ngữ cảnh hiện tại:
 * - Khi có hộp thoại đang mở (`hasOpenModal = true`): ưu tiên ô tìm kiếm trong hộp thoại trên cùng.
 * - Khi không có hộp thoại: tìm ô tìm kiếm chính của tab đang xem (`data-quick-search="primary"`).
 *
 * Trả về:
 * - `'focused-modal'`: đã focus ô tìm kiếm trong hộp thoại đang mở
 * - `'focused-primary'`: đã focus ô tìm kiếm chính của tab hiện tại
 * - `'modal-no-search'`: đang có hộp thoại mở nhưng không có ô tìm kiếm (không bật thêm hộp thoại mới)
 * - `'open-global'`: tab hiện tại không có ô tìm kiếm (hoặc đang focus sẵn ở ô chính) -> mở hộp thoại Tìm kiếm nhanh toàn cục
 */
export function focusContextualQuickSearch(
  hasOpenModal: boolean
): 'focused-modal' | 'focused-primary' | 'modal-no-search' | 'open-global' {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return 'open-global';
  }

  if (hasOpenModal) {
    const modalInputs = Array.from(
      document.querySelectorAll('input[data-quick-search="modal"]')
    ).filter(isFocusableVisibleInput);

    if (modalInputs.length > 0) {
      const topmostInput = modalInputs[modalInputs.length - 1];
      focusAndSelectInput(topmostInput);
      return 'focused-modal';
    }
    return 'modal-no-search';
  }

  const primaryInputs = Array.from(
    document.querySelectorAll('main input[data-quick-search="primary"], input[data-quick-search="primary"]')
  ).filter(isFocusableVisibleInput);

  if (primaryInputs.length > 0) {
    const primary = primaryInputs[0];
    // Nếu con trỏ đang nằm sẵn ở ô tìm kiếm của tab và người dùng nhấn Ctrl+K lần nữa,
    // mở hộp thoại Tìm kiếm nhanh toàn cục để tra cứu xuyên suốt toàn hệ thống.
    if (document.activeElement === primary) {
      return 'open-global';
    }
    focusAndSelectInput(primary);
    return 'focused-primary';
  }

  return 'open-global';
}
