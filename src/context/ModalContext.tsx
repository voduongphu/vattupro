import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState
} from 'react';
import { AlertTriangle, X } from 'lucide-react';
import {
  getTopmostModalEntry,
  removeModalEntry,
  upsertModalEntry,
  type ModalStackEntry
} from '../utils/modalStackHelpers';
import { useLanguage } from './LanguageContext';

interface InternalModalEntry extends ModalStackEntry {
  onClose: () => void;
}

interface ModalContextValue {
  registerModal: (entry: {
    id: string;
    title: string;
    priority?: number;
    onClose: () => void;
  }) => void;
  unregisterModal: (id: string) => void;
  activeModalCount: number;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { language, t } = useLanguage();
  const [modalStack, setModalStack] = useState<InternalModalEntry[]>([]);
  const [pendingEscTarget, setPendingEscTarget] = useState<InternalModalEntry | null>(null);
  const orderCounterRef = useRef(0);
  const stackRef = useRef<InternalModalEntry[]>([]);
  const stayButtonRef = useRef<HTMLButtonElement | null>(null);

  stackRef.current = modalStack;

  const registerModal = useCallback(
    (entry: { id: string; title: string; priority?: number; onClose: () => void }) => {
      setModalStack((prev) => {
        const existing = prev.find((item) => item.id === entry.id);
        const order = existing ? existing.order : ++orderCounterRef.current;
        return upsertModalEntry(prev, {
          id: entry.id,
          title: entry.title,
          priority: entry.priority ?? 50,
          order,
          onClose: entry.onClose
        });
      });
    },
    []
  );

  const unregisterModal = useCallback((id: string) => {
    setModalStack((prev) => removeModalEntry(prev, id));
    setPendingEscTarget((prev) => (prev && prev.id === id ? null : prev));
  }, []);

  // Khóa cuộn chuột ở cửa sổ ứng dụng nền khi có ít nhất 1 hộp thoại đang mở
  const hasActiveModal = modalStack.length > 0 || pendingEscTarget !== null;
  useEffect(() => {
    if (!hasActiveModal || typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const prevBodyPaddingRight = bodyEl.style.paddingRight;
    const scrollbarWidth = Math.max(0, window.innerWidth - htmlEl.clientWidth);

    htmlEl.classList.add('vtp-modal-open');
    bodyEl.classList.add('vtp-modal-open');
    if (scrollbarWidth > 0) {
      bodyEl.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      htmlEl.classList.remove('vtp-modal-open');
      bodyEl.classList.remove('vtp-modal-open');
      bodyEl.style.paddingRight = prevBodyPaddingRight;
    };
  }, [hasActiveModal]);

  // Lắng nghe phím ESC toàn cục: chỉ áp dụng cho hộp thoại trên cùng và luôn hiển thị hộp thoại xác nhận trước khi thoát
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      if (pendingEscTarget) {
        event.preventDefault();
        event.stopPropagation();
        setPendingEscTarget(null);
        return;
      }

      const topmost = getTopmostModalEntry(stackRef.current);
      if (!topmost) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingEscTarget(topmost);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [pendingEscTarget]);

  // Đặt focus an toàn vào nút "Ở lại" khi hộp thoại xác nhận ESC xuất hiện để tránh bấm nhầm Enter làm mất dữ liệu
  useEffect(() => {
    if (pendingEscTarget) {
      const timer = setTimeout(() => {
        stayButtonRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [pendingEscTarget]);

  const handleCancelEscClose = () => {
    setPendingEscTarget(null);
  };

  const handleConfirmEscClose = () => {
    const target = pendingEscTarget;
    setPendingEscTarget(null);
    if (!target) return;
    const liveEntry = stackRef.current.find((item) => item.id === target.id) || target;
    liveEntry.onClose();
  };

  const localizedPendingTitle = pendingEscTarget ? t(pendingEscTarget.title) : '';

  return (
    <ModalContext.Provider
      value={{
        registerModal,
        unregisterModal,
        activeModalCount: modalStack.length
      }}
    >
      {children}

      {pendingEscTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="esc-confirm-modal-title"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4 overscroll-contain animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-100 bg-amber-50/80 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3
                    id="esc-confirm-modal-title"
                    className="font-bold text-slate-900 text-sm sm:text-base truncate"
                  >
                    {t('escConfirmTitle')}
                  </h3>
                  <p className="text-[11px] text-amber-800 font-medium">
                    {t('escConfirmSubtitle')}
                  </p>
                </div>
              </div>
              <ModalCloseButton
                onClick={handleCancelEscClose}
                title={t('escConfirmCancelTitle')}
              />
            </div>

            <div className="p-5 space-y-4 text-xs sm:text-sm text-slate-700">
              <p className="leading-relaxed">
                {language === 'en' ? (
                  <>
                    Are you sure you want to close the dialog{' '}
                    <strong className="text-slate-900">&ldquo;{localizedPendingTitle}&rdquo;</strong>?
                  </>
                ) : (
                  <>
                    Bạn có chắc chắn muốn đóng hộp thoại{' '}
                    <strong className="text-slate-900">&ldquo;{localizedPendingTitle}&rdquo;</strong>{' '}
                    đang mở không?
                  </>
                )}
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                {t('escConfirmWarning')}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  ref={stayButtonRef}
                  type="button"
                  onClick={handleCancelEscClose}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs sm:text-sm rounded-xl transition cursor-pointer"
                >
                  {t('escConfirmStay')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmEscClose}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-rose-600/20 transition cursor-pointer"
                >
                  {t('escConfirmLeave')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};

export const ModalGuard: React.FC<{
  title: string;
  onClose: () => void;
  priority?: number;
  isOpen?: boolean;
}> = ({ title, onClose, priority = 50, isOpen = true }) => {
  const ctx = useContext(ModalContext);
  const id = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const registerModal = ctx?.registerModal;
  const unregisterModal = ctx?.unregisterModal;

  useEffect(() => {
    if (!isOpen || !registerModal || !unregisterModal) return;
    registerModal({
      id,
      title,
      priority,
      onClose: () => onCloseRef.current()
    });
    return () => {
      unregisterModal(id);
    };
  }, [id, isOpen, title, priority, registerModal, unregisterModal]);

  return null;
};

export interface ModalCloseButtonProps {
  onClick: () => void;
  title?: string;
  ariaLabel?: string;
  variant?: 'light' | 'dark';
  className?: string;
  disabled?: boolean;
}

export const ModalCloseButton: React.FC<ModalCloseButtonProps> = ({
  onClick,
  title,
  ariaLabel,
  variant = 'light',
  className = '',
  disabled = false
}) => {
  const { t } = useLanguage();
  const resolvedTitle = title ? t(title) : t('closeModalTitle');
  const resolvedAria = ariaLabel ? t(ariaLabel) : t('closeModalAria');
  const baseClass =
    variant === 'dark'
      ? 'inline-flex items-center justify-center w-9 h-9 rounded-xl border-2 border-rose-400 bg-rose-500/25 text-rose-100 hover:bg-rose-600 hover:text-white hover:border-rose-500 shadow-xs transition-colors shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
      : 'inline-flex items-center justify-center w-9 h-9 rounded-xl border-2 border-rose-500 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white hover:border-rose-600 shadow-xs transition-colors shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={resolvedTitle}
      aria-label={resolvedAria}
      className={`${baseClass} ${className}`.trim()}
    >
      <X className="w-4 h-4 stroke-[2.5]" />
    </button>
  );
};
