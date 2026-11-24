import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { ModalGuard, ModalCloseButton } from '../../context/ModalContext';
import {
  LayoutDashboard,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Warehouse,
  Package,
  Users,
  ShieldAlert,
  CheckCircle2,
  Boxes,
  LogOut,
  FileWarning,
  BookOpen
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  isMobileOpen = false,
  onCloseMobile
}) => {
  const { currentUser, isAdmin, logout } = useAuth();
  const { t } = useLanguage();

  const navItems = [
    {
      id: 'dashboard',
      label: t('navOverview'),
      icon: LayoutDashboard,
      meta: null
    },
    {
      id: 'inbound',
      label: t('navInbound'),
      icon: ArrowDownLeft,
      meta: 'Excel'
    },
    {
      id: 'outbound',
      label: t('navOutbound'),
      icon: ArrowUpRight,
      meta: 'Excel'
    },
    {
      id: 'osd',
      label: t('navOsd'),
      icon: FileWarning,
      meta: t('sidebarBadgeNew')
    },
    {
      id: 'report',
      label: t('navReports'),
      icon: BarChart3,
      meta: null
    },
    {
      section: t('navCategorySection')
    },
    {
      id: 'warehouses',
      label: t('navWarehouses'),
      icon: Warehouse,
      meta: 'Admin'
    },
    {
      id: 'materials',
      label: t('navMaterials'),
      icon: Package,
      meta: 'Admin'
    },
    {
      id: 'users',
      label: t('navUsers'),
      icon: Users,
      meta: 'Admin'
    },
    {
      section: t('navGuideSection')
    },
    {
      id: 'guide',
      label: t('navGuide'),
      icon: BookOpen,
      meta: 'PDF'
    }
  ];

  const renderNavList = (isMobile: boolean) => (
    <div className="space-y-1">
      {navItems.map((item, index) => {
        if (item.section) {
          return (
            <div
              key={index}
              className="px-3 pt-5 pb-2 text-[11px] font-bold tracking-wide text-slate-400"
            >
              {item.section}
            </div>
          );
        }

        const Icon = item.icon!;
        const isActive = activeTab === item.id;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onTabChange(item.id!);
              if (isMobile && onCloseMobile) {
                onCloseMobile();
              }
            }}
            className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              isActive
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span className="truncate">{item.label}</span>
            </div>

            {item.meta && (
              <span
                className={`text-[11px] font-medium shrink-0 ml-2 ${
                  isActive
                    ? 'text-blue-100'
                    : item.meta === 'Admin'
                      ? 'text-rose-600'
                      : 'text-emerald-600'
                }`}
              >
                {item.meta}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  const renderRoleNotice = () => (
    <div
      className={`p-3 rounded-2xl border text-xs ${
        isAdmin
          ? 'bg-emerald-50/60 border-emerald-200/80 text-emerald-900'
          : 'bg-amber-50/60 border-amber-200/80 text-amber-900'
      }`}
    >
      <div className="flex items-center gap-1.5 font-bold mb-1">
        {isAdmin ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        ) : (
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
        )}
        <span>{isAdmin ? t('sidebarRoleAdminTitle') : t('sidebarRoleStaffTitle')}</span>
      </div>
      <p className="text-[11px] text-slate-600 leading-relaxed">
        {isAdmin ? t('sidebarRoleAdminDesc') : t('sidebarRoleStaffDesc')}
      </p>
    </div>
  );

  return (
    <>
      {/* Desktop Permanent Sidebar */}
      <aside className="hidden lg:flex w-64 lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:overflow-y-auto bg-white border-r border-slate-200/80 p-4 flex-col justify-between shrink-0">
        {renderNavList(false)}
        <div className="pt-4 border-t border-slate-100">{renderRoleNotice()}</div>
      </aside>

      {/* Mobile Slide-Over Navigation Drawer */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex overscroll-contain">
          {onCloseMobile && (
            <ModalGuard title={t('navMenuTitle')} onClose={onCloseMobile} />
          )}
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={onCloseMobile}
          />

          <aside className="relative z-10 w-72 max-w-[86vw] h-full bg-white shadow-2xl border-r border-slate-200 flex flex-col justify-between overflow-y-auto overscroll-contain p-4">
            <div>
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shrink-0">
                    <Boxes className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div
                      className="font-bold text-xs text-slate-900 truncate"
                      data-user-content={currentUser?.fullName ? 'true' : undefined}
                    >
                      {currentUser?.fullName || t('sidebarSystemFallback')}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono truncate" data-user-content="true">
                      {currentUser?.email || (currentUser?.username ? `@${currentUser.username}` : '')}
                    </div>
                  </div>
                </div>

                {onCloseMobile && (
                  <ModalCloseButton
                    onClick={onCloseMobile}
                    ariaLabel={t('closeNavMenu')}
                  />
                )}
              </div>

              {renderNavList(true)}
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 space-y-3">
              {renderRoleNotice()}
              <button
                type="button"
                onClick={() => {
                  if (onCloseMobile) onCloseMobile();
                  void logout();
                }}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/70 text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>{t('logoutDeviceSession')}</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
