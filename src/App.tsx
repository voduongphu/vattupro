/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { ModalProvider, useModal } from './context/ModalContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { DashboardOverview } from './components/dashboard/DashboardOverview';
import { InboundManager } from './components/inbound/InboundManager';
import { OutboundManager } from './components/outbound/OutboundManager';
import { OsdManager } from './components/osd/OsdManager';
import { InventoryReport } from './components/reports/InventoryReport';
import { WarehouseManager } from './components/warehouses/WarehouseManager';
import { MaterialCatalog } from './components/materials/MaterialCatalog';
import { UserManager } from './components/users/UserManager';
import { LoginScreen } from './components/auth/LoginScreen';
import { StickyTableHeadersController } from './components/common/StickyTableHeadersController';
import {
  QuickGlobalSearchModal,
  QuickNewVoucherModal,
  type QuickSearchSelection
} from './components/common/QuickCommandModals';
import {
  focusContextualQuickSearch,
  matchAppShortcut
} from './utils/keyboardShortcuts';
import {
  LayoutDashboard,
  ArrowDownLeft,
  ArrowUpRight,
  FileWarning,
  BarChart3,
  Warehouse,
  Package,
  Users,
  AlertTriangle,
  X
} from 'lucide-react';

const MainLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isQuickSearchOpen, setIsQuickSearchOpen] = useState<boolean>(false);
  const [isQuickNewVoucherOpen, setIsQuickNewVoucherOpen] = useState<boolean>(false);
  const [inboundCreateToken, setInboundCreateToken] = useState<number>(0);
  const [outboundCreateToken, setOutboundCreateToken] = useState<number>(0);
  const [quickSearchTarget, setQuickSearchTarget] = useState<{
    tab: QuickSearchSelection['tab'];
    query: string;
    token: number;
  } | null>(null);
  const { currentUser, replacedOtherDeviceAlert, clearReplacedOtherDeviceAlert } = useAuth();
  const { t } = useLanguage();
  const { activeModalCount } = useModal();

  const mobileQuickTabs = [
    { id: 'dashboard', label: t('quickTabDashboard'), icon: LayoutDashboard },
    { id: 'inbound', label: t('quickTabInbound'), icon: ArrowDownLeft },
    { id: 'outbound', label: t('quickTabOutbound'), icon: ArrowUpRight },
    { id: 'osd', label: t('quickTabOsd'), icon: FileWarning },
    { id: 'report', label: t('quickTabReport'), icon: BarChart3 },
    { id: 'warehouses', label: t('quickTabWarehouses'), icon: Warehouse },
    { id: 'materials', label: t('quickTabMaterials'), icon: Package },
    { id: 'users', label: t('quickTabUsers'), icon: Users }
  ];

  const mainRef = useRef<HTMLElement | null>(null);

  const scrollViewportToTop = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
    if (typeof document !== 'undefined') {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, []);

  useEffect(() => {
    if (!replacedOtherDeviceAlert) return;
    const timer = setTimeout(() => {
      clearReplacedOtherDeviceAlert();
    }, 15000);
    return () => clearTimeout(timer);
  }, [replacedOtherDeviceAlert, clearReplacedOtherDeviceAlert]);

  // Luôn đưa cuộn trang về đầu mỗi khi chuyển tab để không giữ vị trí cuộn của tab trước
  useLayoutEffect(() => {
    scrollViewportToTop();
    if (typeof window === 'undefined') return;
    const rafId = window.requestAnimationFrame(() => {
      scrollViewportToTop();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [activeTab, scrollViewportToTop]);

  const handleSelectTab = useCallback(
    (tab: string) => {
      setActiveTab(tab);
      setIsMobileMenuOpen(false);
      scrollViewportToTop();
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          scrollViewportToTop();
        });
      }
    },
    [scrollViewportToTop]
  );

  const triggerCreateInbound = useCallback(() => {
    setIsQuickSearchOpen(false);
    setIsQuickNewVoucherOpen(false);
    if (activeTab !== 'inbound') {
      handleSelectTab('inbound');
    }
    setInboundCreateToken((prev) => prev + 1);
  }, [activeTab, handleSelectTab]);

  const triggerCreateOutbound = useCallback(() => {
    setIsQuickSearchOpen(false);
    setIsQuickNewVoucherOpen(false);
    if (activeTab !== 'outbound') {
      handleSelectTab('outbound');
    }
    setOutboundCreateToken((prev) => prev + 1);
  }, [activeTab, handleSelectTab]);

  const handleGlobalSearchSelect = useCallback(
    (selection: QuickSearchSelection) => {
      handleSelectTab(selection.tab);
      setQuickSearchTarget({
        tab: selection.tab,
        query: selection.query,
        token: Date.now() + Math.random()
      });
    },
    [handleSelectTab]
  );

  // Phím tắt toàn cục: Ctrl+K (Tìm kiếm nhanh), Ctrl+N / Alt+N (Lập phiếu nhập/xuất kho mới)
  useEffect(() => {
    if (!currentUser || typeof window === 'undefined') return;

    const handleGlobalShortcut = (event: KeyboardEvent) => {
      const action = matchAppShortcut(event);
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();

      if (action === 'quick-search') {
        if (isQuickNewVoucherOpen) {
          setIsQuickNewVoucherOpen(false);
        }
        if (isQuickSearchOpen) {
          focusContextualQuickSearch(true);
          return;
        }
        const outcome = focusContextualQuickSearch(activeModalCount > 0);
        if (outcome === 'open-global') {
          setIsQuickSearchOpen(true);
        }
        return;
      }

      if (action === 'new-voucher') {
        // Nếu đang mở hộp thoại khác (vd: đang lập/sửa/xem phiếu) thì không bật đè thêm hộp thoại lập phiếu mới
        if (activeModalCount > 0 && !isQuickSearchOpen && !isQuickNewVoucherOpen) {
          return;
        }
        if (isQuickSearchOpen) {
          setIsQuickSearchOpen(false);
        }
        if (activeTab === 'inbound') {
          triggerCreateInbound();
        } else if (activeTab === 'outbound') {
          triggerCreateOutbound();
        } else {
          setIsQuickNewVoucherOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalShortcut, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalShortcut, true);
    };
  }, [
    currentUser,
    activeTab,
    activeModalCount,
    isQuickSearchOpen,
    isQuickNewVoucherOpen,
    triggerCreateInbound,
    triggerCreateOutbound
  ]);

  // Hiển thị màn hình đăng nhập nếu người dùng chưa xác thực
  if (!currentUser) {
    return <LoginScreen />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardOverview onNavigate={handleSelectTab} />;
      case 'inbound':
        return (
          <InboundManager
            autoOpenCreateToken={inboundCreateToken}
            quickSearchSignal={
              quickSearchTarget?.tab === 'inbound'
                ? { query: quickSearchTarget.query, token: quickSearchTarget.token }
                : null
            }
          />
        );
      case 'outbound':
        return (
          <OutboundManager
            autoOpenCreateToken={outboundCreateToken}
            quickSearchSignal={
              quickSearchTarget?.tab === 'outbound'
                ? { query: quickSearchTarget.query, token: quickSearchTarget.token }
                : null
            }
          />
        );
      case 'osd':
        return (
          <OsdManager
            quickSearchSignal={
              quickSearchTarget?.tab === 'osd'
                ? { query: quickSearchTarget.query, token: quickSearchTarget.token }
                : null
            }
          />
        );
      case 'report':
        return <InventoryReport />;
      case 'warehouses':
        return <WarehouseManager />;
      case 'materials':
        return (
          <MaterialCatalog
            quickSearchSignal={
              quickSearchTarget?.tab === 'materials'
                ? { query: quickSearchTarget.query, token: quickSearchTarget.token }
                : null
            }
          />
        );
      case 'users':
        return <UserManager />;
      default:
        return <DashboardOverview onNavigate={handleSelectTab} />;
    }
  };

  return (
    <div className="min-h-dvh w-full bg-slate-100/70 flex flex-col font-sans">
      <StickyTableHeadersController />
      <Navbar
        onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        onOpenQuickSearch={() => setIsQuickSearchOpen(true)}
      />

      {/* Cảnh báo rõ ràng trên thiết bị mới khi hệ thống vừa tự động đăng xuất tài khoản ở thiết bị khác */}
      {replacedOtherDeviceAlert && (
        <div className="w-full bg-amber-50 border-b border-amber-300/90 px-3 sm:px-6 py-2.5 text-amber-950 shadow-sm">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-400/50 flex items-center justify-center text-amber-700 shrink-0 mt-0.5 sm:mt-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="text-xs leading-relaxed min-w-0">
                <span className="font-bold text-amber-900 mr-1.5">
                  {t('sessionAlertTitle')}
                </span>
                <span className="text-amber-800">{replacedOtherDeviceAlert.message}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={clearReplacedOtherDeviceAlert}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-amber-200/70 hover:bg-amber-300/80 text-amber-950 font-bold text-xs flex items-center gap-1 shrink-0 transition"
            >
              <span>{t('understand')}</span>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Thanh chuyển tab nhanh trên điện thoại & máy tính bảng (cuộn ngang tự nhiên, không chiếm vùng cố định màn hình) */}
      <div className="lg:hidden w-full bg-white border-b border-slate-200/80 px-3 py-2 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          {mobileQuickTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectTab(tab.id)}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200/70'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 w-full flex flex-row items-stretch min-w-0">
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleSelectTab}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />

        <main ref={mainRef} className="flex-1 min-w-0 p-3 sm:p-5 lg:p-6">
          {renderContent()}
        </main>
      </div>

      <QuickGlobalSearchModal
        isOpen={isQuickSearchOpen}
        onClose={() => setIsQuickSearchOpen(false)}
        onSelect={handleGlobalSearchSelect}
      />

      <QuickNewVoucherModal
        isOpen={isQuickNewVoucherOpen}
        onClose={() => setIsQuickNewVoucherOpen(false)}
        onCreateInbound={triggerCreateInbound}
        onCreateOutbound={triggerCreateOutbound}
      />
    </div>
  );
};

export default function App() {
  return (
    <LanguageProvider>
      <ModalProvider>
        <AuthProvider>
          <MainLayout />
        </AuthProvider>
      </ModalProvider>
    </LanguageProvider>
  );
}
