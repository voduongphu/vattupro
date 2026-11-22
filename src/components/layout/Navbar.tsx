import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { SyncService } from '../../services/syncService';
import {
  Boxes,
  LogOut,
  RefreshCw,
  ShieldCheck,
  MonitorSmartphone,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Cloud,
  CloudOff,
  CloudUpload,
  LogIn,
  ChevronDown,
  Menu,
  X,
  Search
} from 'lucide-react';
import { LoginModal } from '../auth/LoginModal';
import { useLanguage, LanguageSwitcher } from '../../context/LanguageContext';

interface NavbarProps {
  onOpenMobileMenu?: () => void;
  onOpenQuickSearch?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenMobileMenu, onOpenQuickSearch }) => {
  const {
    currentUser,
    cloudState,
    connectCloudSync,
    switchGoogleAccount,
    logout,
    forceLogoutOtherDevicesFromCurrent,
    isAdmin
  } = useAuth();
  const { t } = useLanguage();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCheckingSync, setIsCheckingSync] = useState(false);
  const [isConnectingCloud, setIsConnectingCloud] = useState(false);
  const [isForcingRemoteLogout, setIsForcingRemoteLogout] = useState(false);
  const [remoteLogoutNotice, setRemoteLogoutNotice] = useState<{
    success: boolean;
    paused?: boolean;
    redirected?: boolean;
    message: string;
  } | null>(null);
  const [dismissedCloudErrorMsg, setDismissedCloudErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    return SyncService.subscribeSyncState(setIsSyncing);
  }, []);

  useEffect(() => {
    if (cloudState.pausedAt) {
      setDismissedCloudErrorMsg(null);
    }
  }, [cloudState.pausedAt]);

  useEffect(() => {
    if (!remoteLogoutNotice) return;
    const timer = setTimeout(() => {
      setRemoteLogoutNotice(null);
    }, 9000);
    return () => clearTimeout(timer);
  }, [remoteLogoutNotice]);

  const handleUnifiedSync = async () => {
    if (isCheckingSync || isSyncing || isConnectingCloud) return;
    setIsUserMenuOpen(false);
    setDismissedCloudErrorMsg(null);
    setIsCheckingSync(true);
    try {
      const res = await SyncService.syncCloudChangesOnly();
      setRemoteLogoutNotice({
        success: res.success,
        paused: res.paused,
        redirected: res.redirected,
        message: res.message
      });
    } catch (err: any) {
      setRemoteLogoutNotice({
        success: false,
        message: `Lỗi đồng bộ: ${err?.message || String(err)}`
      });
    } finally {
      setIsCheckingSync(false);
    }
  };

  const handleSwitchGoogleAccount = async () => {
    setIsUserMenuOpen(false);
    setIsConnectingCloud(true);
    try {
      const res = await switchGoogleAccount();
      if (!res.success && res.message) {
        setRemoteLogoutNotice({
          success: false,
          message: res.message
        });
      } else if (res.success) {
        setRemoteLogoutNotice({
          success: true,
          message: res.message
        });
      }
    } finally {
      setIsConnectingCloud(false);
    }
  };

  const handleForceLogoutOtherDevices = async () => {
    setIsUserMenuOpen(false);
    setIsForcingRemoteLogout(true);
    try {
      const res = await forceLogoutOtherDevicesFromCurrent();
      setRemoteLogoutNotice(res);
    } finally {
      setIsForcingRemoteLogout(false);
    }
  };

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    await logout();
  };

  const displayEmail =
    currentUser?.email || cloudState.cloudEmail || (currentUser ? `@${currentUser.username}` : '');

  return (
    <>
      <header className="sticky top-0 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-white shrink-0 z-40 w-full shadow-md shadow-slate-950/15">
        <div className="w-full px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Mobile Drawer Trigger + Brand */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {onOpenMobileMenu && (
              <button
                type="button"
                onClick={onOpenMobileMenu}
                aria-label={t('openNavMenu')}
                className="lg:hidden min-w-[44px] min-h-[44px] -ml-1 rounded-xl flex items-center justify-center text-slate-200 hover:text-white hover:bg-slate-800 transition shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-md shadow-blue-500/20 text-white shrink-0">
              <Boxes className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>

            <div className="min-w-0">
              <span className="font-extrabold text-xs sm:text-sm md:text-base tracking-tight text-white block truncate">
                {t('appTitle')}
              </span>
              <p className="text-[11px] text-slate-400 hidden md:block truncate">
                {t('appSubtitle')}
              </p>
            </div>
          </div>

          {/* Right: Quick Search + Language Switcher + Unified Cloud Sync + User Account */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 whitespace-nowrap">
            {onOpenQuickSearch && currentUser && (
              <button
                type="button"
                onClick={onOpenQuickSearch}
                title={t('quickSearchBtnTooltip')}
                className="min-h-[40px] flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 text-slate-200 hover:text-white text-xs font-medium transition shrink-0 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="hidden lg:inline">{t('quickSearchBtnLabel')}</span>
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-slate-900/90 border border-slate-600/80 text-[10px] font-mono text-slate-300 leading-none">
                  Ctrl+K
                </kbd>
              </button>
            )}

            {/* Nút chuyển đổi ngôn ngữ Tiếng Anh / Tiếng Việt trong ứng dụng */}
            <LanguageSwitcher variant="dark" showLabel={true} />

            {(() => {
              const isPaused = cloudState.status === 'paused' || Boolean(cloudState.connectionPaused);
              const busy = (isSyncing || isConnectingCloud || cloudState.status === 'connecting') && !isPaused;
              const quotaExceeded = Boolean(cloudState.quotaExceeded);
              const isSparkPaused = Boolean(
                quotaExceeded &&
                  cloudState.errorMessage &&
                  /spark|blaze|thanh toán|billing/i.test(cloudState.errorMessage)
              );
              const hasError = cloudState.status === 'error' || isPaused;
              const connected = cloudState.status === 'connected' && !hasError;

              return (
                <button
                  type="button"
                  onClick={handleUnifiedSync}
                  disabled={isSyncing || isConnectingCloud || isCheckingSync}
                  title={
                    isPaused
                      ? cloudState.errorMessage || t('cloudPausedReconnectTooltip')
                      : quotaExceeded
                        ? cloudState.errorMessage || t('cloudQuotaExceeded')
                        : hasError && cloudState.errorMessage
                          ? cloudState.errorMessage
                          : connected
                            ? `${t('cloudSyncedTooltip')} (${cloudState.cloudEmail || displayEmail})`
                            : t('cloudConnectTooltip')
                  }
                  className={`min-h-[40px] min-w-[40px] flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition disabled:opacity-75 shrink-0 ${
                    quotaExceeded || isPaused
                      ? 'text-amber-200 hover:text-white bg-amber-950/85 hover:bg-amber-900/90 border-amber-600/70 shadow-xs'
                      : hasError
                        ? 'text-rose-200 hover:text-white bg-rose-950/85 hover:bg-rose-900/90 border-rose-700/70 shadow-xs'
                        : connected
                          ? 'text-emerald-200 hover:text-white bg-emerald-950/75 hover:bg-emerald-900/80 border-emerald-700/60 shadow-xs'
                          : 'text-blue-200 hover:text-white bg-blue-950/80 hover:bg-blue-900/80 border-blue-700/60 shadow-xs'
                  }`}
                >
                  {busy ? (
                    <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
                  ) : quotaExceeded || isPaused ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : hasError ? (
                    <CloudOff className="w-4 h-4 text-rose-400 shrink-0" />
                  ) : connected ? (
                    <Cloud className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <CloudUpload className="w-4 h-4 text-blue-400 shrink-0" />
                  )}
                  <span className="hidden sm:inline">
                    {busy
                      ? t('syncing')
                      : isSparkPaused
                        ? t('cloudPausedSparkShort')
                        : quotaExceeded
                          ? t('cloudQuotaExceededShort')
                          : isPaused
                            ? t('cloudPausedShort')
                            : t('cloudSync')}
                  </span>
                </button>
              );
            })()}

            {currentUser ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="min-h-[40px] flex items-center gap-2 p-1 sm:px-3 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 transition text-left"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      isAdmin ? 'bg-rose-600 text-white' : 'bg-blue-600 text-white'
                    }`}
                  >
                    {currentUser.fullName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="hidden md:block">
                    <div className="text-xs font-semibold text-white flex items-center gap-1">
                      <span className="max-w-[160px] truncate" data-user-content="true">{currentUser.fullName}</span>
                      {isAdmin && <ShieldCheck className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                    </div>
                    <div className="text-[10px] text-slate-400 max-w-[170px] truncate" data-user-content="true">
                      {displayEmail}
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 mr-0.5 sm:mr-0" />
                </button>

                {isUserMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsUserMenuOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 text-slate-700 text-xs z-50">
                      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                        <div className="font-bold text-slate-900 truncate" data-user-content="true">
                          {currentUser.fullName}
                        </div>
                        <div className="text-[11px] text-blue-700 font-mono truncate" data-user-content="true">
                          {displayEmail}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>
                            {isAdmin ? t('adminBadge') : t('googleUserBadge')}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleSwitchGoogleAccount}
                        disabled={isConnectingCloud}
                        className="w-full min-h-[44px] px-4 py-2.5 text-left hover:bg-blue-50 text-blue-700 flex items-center gap-2.5 font-semibold disabled:opacity-60"
                      >
                        <LogIn className="w-4 h-4 shrink-0" />
                        <span>{t('switchGoogleAccount')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleForceLogoutOtherDevices}
                        disabled={isForcingRemoteLogout}
                        className="w-full min-h-[44px] px-4 py-2.5 text-left hover:bg-amber-50 text-amber-800 flex items-center gap-2.5 font-medium disabled:opacity-60"
                      >
                        <MonitorSmartphone className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          {isForcingRemoteLogout
                            ? t('sendingRequest')
                            : t('requestLogoutOther')}
                        </span>
                      </button>

                      <div className="border-t border-slate-100 mt-1 pt-1">
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="w-full min-h-[44px] px-4 py-2.5 text-left hover:bg-rose-50 text-rose-600 flex items-center gap-2.5 font-semibold"
                        >
                          <LogOut className="w-4 h-4 shrink-0" />
                          <span>{t('logout')}</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsLoginModalOpen(true)}
                className="min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md transition shrink-0"
              >
                <LogIn className="w-4 h-4" />
                <span>{t('loginWithGoogle')}</span>
              </button>
            )}
          </div>
        </div>

        {remoteLogoutNotice && (
          <div
            className={`px-3 sm:px-6 py-2 text-xs flex items-start sm:items-center justify-between gap-2 border-t ${
              remoteLogoutNotice.success
                ? 'bg-emerald-950/95 border-emerald-800 text-emerald-200'
                : remoteLogoutNotice.redirected
                  ? 'bg-blue-950/95 border-blue-800 text-blue-100'
                  : cloudState.quotaExceeded || remoteLogoutNotice.paused || cloudState.connectionPaused
                    ? 'bg-amber-950/95 border-amber-700 text-amber-100'
                    : 'bg-rose-950/95 border-rose-800 text-rose-200'
            }`}
          >
            <div className="flex items-start sm:items-center gap-2 min-w-0">
              {remoteLogoutNotice.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
              ) : remoteLogoutNotice.redirected ? (
                <RefreshCw className="w-4 h-4 text-blue-400 animate-spin shrink-0 mt-0.5 sm:mt-0" />
              ) : cloudState.quotaExceeded || remoteLogoutNotice.paused || cloudState.connectionPaused ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5 sm:mt-0" />
              )}
              <span className="leading-relaxed break-words">{t(remoteLogoutNotice.message)}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {(remoteLogoutNotice.paused || cloudState.connectionPaused) && !remoteLogoutNotice.success && (
                <button
                  type="button"
                  onClick={handleUnifiedSync}
                  disabled={isSyncing || isConnectingCloud || isCheckingSync}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-amber-100 font-semibold transition whitespace-nowrap"
                >
                  {t('cloudReconnectNow')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setRemoteLogoutNotice(null)}
                className="p-1 rounded-lg hover:bg-white/10 transition shrink-0"
                title={t('closeNotification')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {(cloudState.status === 'error' ||
          cloudState.status === 'paused' ||
          Boolean(cloudState.connectionPaused)) &&
          cloudState.errorMessage &&
          dismissedCloudErrorMsg !== cloudState.errorMessage &&
          (!remoteLogoutNotice || remoteLogoutNotice.message !== cloudState.errorMessage) && (() => {
            const isPausedBanner = cloudState.status === 'paused' || Boolean(cloudState.connectionPaused);
            const isSparkBanner = Boolean(
              cloudState.quotaExceeded &&
                /spark|blaze|thanh toán|billing/i.test(cloudState.errorMessage || '')
            );
            return (
              <div
                className={`px-3 sm:px-6 py-2 text-xs flex items-start sm:items-center justify-between gap-2 border-t ${
                  cloudState.quotaExceeded || isPausedBanner
                    ? 'bg-amber-950/95 border-amber-700/90 text-amber-100'
                    : 'bg-rose-950/95 border-rose-800 text-rose-200'
                }`}
              >
                <div className="flex items-start sm:items-center gap-2 min-w-0">
                  {cloudState.quotaExceeded || isPausedBanner ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                  ) : (
                    <CloudOff className="w-4 h-4 text-rose-400 shrink-0 mt-0.5 sm:mt-0" />
                  )}
                  <span className="leading-relaxed break-words">
                    <strong className="mr-1.5">
                      {isSparkBanner
                        ? t('cloudPausedSparkPrefix')
                        : isPausedBanner
                          ? t('cloudPausedPrefix')
                          : cloudState.quotaExceeded
                            ? `${t('cloudQuotaExceeded')}:`
                            : t('cloudErrorPrefix')}
                    </strong>
                    {t(cloudState.errorMessage)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isPausedBanner && (
                    <button
                      type="button"
                      onClick={handleUnifiedSync}
                      disabled={isSyncing || isConnectingCloud || isCheckingSync}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-amber-100 font-semibold transition whitespace-nowrap"
                    >
                      {t('cloudReconnectNow')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDismissedCloudErrorMsg(cloudState.errorMessage)}
                    className="p-1 rounded-lg hover:bg-white/10 transition shrink-0"
                    title={t('closeNotification')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })()}
      </header>

      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
    </>
  );
};
