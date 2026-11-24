import React, { createContext, useContext, useState, useEffect } from 'react';
import { Languages } from 'lucide-react';
import {
  COMPREHENSIVE_UI_PHRASES_EN,
  SYSTEM_UI_PATTERN_RULES_EN
} from './translationsDict';

export type AppLanguage = 'vi' | 'en';

const TRANSLATIONS = {
  vi: {
    // Document & Top Bar & Brand
    documentTitle: 'Hệ Thống Quản Lý Nhập Xuất Tồn Vật Tư Thiết Bị',
    appTitle: 'LOGISTICS & INVENTORY',
    appSubtitle: 'Quản Lý Nhập - Xuất - Tồn Vật Tư Thiết Bị Dự Án',
    cloudSync: 'Đồng Bộ Cloud',
    syncing: 'Đang đồng bộ...',
    syncingTooltipPrefix: 'Đang đồng bộ dữ liệu Cloud',
    syncDownloadShort: 'Tải về',
    syncUploadShort: 'Tải lên',
    cloudPausedSparkShort: 'Cloud tạm dừng (Spark)',
    cloudPausedSparkPrefix: 'Cloud Firestore tạm dừng (Gói Spark):',
    cloudPausedShort: 'Cloud tạm dừng',
    cloudManualPausedShort: 'Tạm dừng Sync',
    cloudPausedPrefix: 'Tạm dừng kết nối Cloud:',
    cloudReconnectNow: 'Kết nối lại',
    cloudResumeNow: 'Bật lại đồng bộ',
    cloudPauseSyncHint: 'Bấm để tạm dừng đồng bộ',
    cloudPausedReconnectTooltip: 'Kết nối Cloud đang tạm dừng. Bấm nút Đồng Bộ Cloud để chủ động kết nối lại.',
    cloudManualPausedTooltip:
      'Đồng bộ Cloud đang TẠM DỪNG (dữ liệu thay đổi vẫn được lưu tại máy) — Bấm để BẬT LẠI tự động đồng bộ & đồng bộ ngay',
    cloudErrorPrefix: 'Lỗi Cloud Firestore:',
    cloudQuotaExceeded: 'Hết hạn mức Cloud Firestore trong ngày',
    cloudQuotaExceededShort: 'Hết hạn mức Cloud',
    cloudSyncedTooltip:
      'Tự động đồng bộ Cloud đang BẬT — Bấm để TẠM DỪNG đồng bộ (kiểm soát lưu lượng & số lượt trong ngày)',
    cloudConnectTooltip: 'Bấm để kết nối & chỉ đồng bộ phần dữ liệu thay đổi với Cloud Firestore (tiết kiệm hạn mức đọc)',
    switchGoogleAccount: 'Đổi tài khoản Google khác',
    requestLogoutOther: 'Yêu cầu đăng xuất trên thiết bị kia',
    sendingRequest: 'Đang gửi yêu cầu...',
    logout: 'Đăng xuất',
    adminBadge: 'Quản trị viên chính (Admin)',
    googleUserBadge: 'Tài khoản Google đồng bộ',
    sessionAlertTitle: 'Cảnh báo phiên đăng nhập:',
    understand: 'Đã hiểu',
    closeNotification: 'Đóng thông báo',
    openNavMenu: 'Mở danh mục điều hướng',
    closeNavMenu: 'Đóng danh mục',
    navMenuTitle: 'Danh mục điều hướng',
    logoutDeviceSession: 'Đăng Xuất Phiên Thiết Bị',
    languageToggleTooltip: 'Chuyển sang Tiếng Anh (Switch to English)',
    languageCurrent: 'Tiếng Việt',

    // Navigation / Sidebar
    navOverview: 'Tổng Quan & KPI',
    navInbound: 'Quản Lý Nhập Kho',
    navOutbound: 'Quản Lý Xuất Kho',
    navOsd: 'Quản Lý Vật Tư OSD',
    navReports: 'Báo Cáo Nhập-Xuất-Tồn',
    navCategorySection: 'Quản trị danh mục',
    navWarehouses: 'Quản Lý Kho Bãi',
    navMaterials: 'Danh Mục Vật Tư',
    navUsers: 'Người Sử Dụng',
    sidebarBadgeNew: 'Mới',
    sidebarRoleAdminTitle: 'Quyền Quản Trị Viên',
    sidebarRoleStaffTitle: 'Chế độ Nhân Viên',
    sidebarRoleAdminDesc: 'Toàn quyền thêm/sửa/xóa kho bãi, vật tư, người dùng & duyệt phiếu',
    sidebarRoleStaffDesc: 'Quyền thực hiện nhập/xuất kho và tra cứu báo cáo tồn kho',
    sidebarSystemFallback: 'Hệ thống kho vận',

    // Mobile Quick Tabs
    quickTabDashboard: 'Tổng quan',
    quickTabInbound: 'Nhập kho',
    quickTabOutbound: 'Xuất kho',
    quickTabOsd: 'Vật tư OSD',
    quickTabReport: 'Báo cáo NXT',
    quickTabWarehouses: 'Kho bãi',
    quickTabMaterials: 'Vật tư',
    quickTabUsers: 'Người dùng',

    // Login Screen & Login Modal
    loginModalTitle: 'Hệ Thống Quản Lý Vật Tư',
    loginModalSubtitle: 'Đăng nhập đồng bộ bằng tài khoản Google',
    loginWithGoogle: 'Đăng nhập bằng tài khoản Google',
    openingGoogleAuth: 'Đang mở xác thực Google...',
    authenticatingLabel: 'Đang xác thực...',
    switchingSession: 'Đang chuyển phiên...',
    googleLoginSuccessRedirect: 'Đăng nhập Google thành công! Đang chuyển vào hệ thống...',
    loginSuccessShort: 'Đăng nhập thành công!',
    redirectingToGoogle: 'Đang chuyển hướng sang trang đăng nhập Google...',
    currentGoogleAccount: 'Tài khoản hiện tại',
    continueWithAccount: 'Tiếp tục với',
    googleAuthHeaderBadge: 'Xác thực đồng bộ bằng Google Cloud',
    googleAuthTitle: 'Đăng Nhập Bằng Google',
    googleAuthDesc: 'Đăng nhập trực tiếp bằng tài khoản Google (Gmail) để vào hệ thống và tự động đồng bộ dữ liệu thời gian thực giữa Máy tính và Điện thoại.',
    singleDeviceNotice: 'Mỗi tài khoản Google chỉ hoạt động trên 1 thiết bị tại một thời điểm để bảo vệ toàn vẹn tồn kho.',
    adminDefaultNotice: 'Tài khoản voduongphu@gmail.com được phân quyền mặc định là Quản trị viên chính (Admin).',
    staffNotice: 'Chỉ những tài khoản Google mail được Quản trị viên (Admin) khai báo và phân quyền trong mục "Người Sử Dụng" mới được phép đăng nhập vào hệ thống.',
    heroTitle: 'Hệ Thống Quản Lý Nhập Xuất Tồn Vật Tư',
    heroSubtitle: 'Giải pháp quản trị kho vật tư thiết bị dự án công trình chuyên sâu theo Packing List, Shipment, Package No., Kiện hàng, Nhà sản xuất & Nhà cung cấp.',
    heroSubbrand: 'Quản trị kho vận thiết bị dự án',
    heroFeatureRealtime: 'Đồng Bộ Google Cloud Thời Gian Thực',
    heroFeatureRealtimeDesc: 'Đăng nhập 1 chạm bằng Google, tự động cộng gộp dữ liệu mọi thiết bị',
    heroFeatureExcel: 'Nhập Xuất & Import File Excel Lớn',
    heroFeatureExcelDesc: 'Xử lý mượt mà trên 100.000 dòng dữ liệu vật tư',
    heroFeatureSecurity: 'Bảo Mật Phiên Đơn Thiết Bị',
    heroFeatureSecurityDesc: 'Tự động ngắt phiên cũ khi chuyển sang máy mới',
    heroFooterSystem: 'Hệ thống Quản lý Kho vận Công trình',
    sessionTerminatedTitle: 'Đã tự động thoát phiên trên thiết bị này',
    sessionSecurityAlertTitle: 'Cảnh Báo Bảo Mật Phiên Thiết Bị',
    conflictTitle: 'Tài khoản Google đang hoạt động trên thiết bị khác',
    activeOnOtherDevicePrefix: 'Đang đăng nhập trên',
    otherDeviceLabel: 'Thiết bị khác',
    conflictDeviceLabel: 'Thiết bị đang mở:',
    conflictLoginAt: 'Đăng nhập lúc:',
    forceLogoutAndContinue: 'Đăng xuất thiết bị kia & Vào hệ thống',
    requestLogoutOnly: 'Chỉ gửi yêu cầu đăng xuất thiết bị kia',
    logoutOtherDeviceOnlyShort: 'Chỉ đăng xuất thiết bị kia',
    switchGoogleAccountBtn: 'Chọn tài khoản Google khác',
    retryGoogleLogin: 'Thử lại đăng nhập Google',
    accountLabel: 'Tài khoản:',
    requestingDeviceLabel: 'Thiết bị yêu cầu:',
    newDeviceLabel: 'Thiết bị mới:',
    timeLabel: 'Thời điểm:',
    sessionReplacedSecurityHint:
      'Nếu không phải bạn vừa đăng nhập trên thiết bị mới, vui lòng đăng nhập lại bằng tài khoản Google và kiểm tra bảo mật tài khoản của bạn.',
    acknowledgeReturnGoogle: 'Đã hiểu & Quay lại đăng nhập Google',
    cloudNoticeTitle: 'Thông báo kết nối Cloud Firestore',
    cloudNoticeDefaultDesc:
      'Kết nối Cloud Firestore đang tạm gián đoạn. Vui lòng thử đăng nhập lại hoặc kiểm tra kết nối mạng.',

    // ESC Confirm Modal
    escConfirmTitle: 'Xác nhận thoát hộp thoại',
    escConfirmSubtitle: 'Phím ESC vừa được nhấn',
    closeConfirmSubtitle: 'Dữ liệu phiếu vừa có thay đổi chưa lưu',
    escConfirmCancelTitle: 'Hủy và quay lại hộp thoại (ESC)',
    escConfirmWarning:
      'Mọi thông tin đang nhập dở chưa lưu trong hộp thoại này sẽ bị hủy nếu bạn thoát ra.',
    confirmModalUnsavedWarning:
      'Dữ liệu phiếu vừa chỉnh sửa chưa được lưu. Bạn có muốn lưu phiếu trước khi đóng không?',
    escConfirmStay: 'Ở lại tiếp tục',
    escConfirmLeave: 'Xác nhận thoát',
    confirmModalSave: 'Lưu phiếu',
    confirmModalDiscard: 'Thoát không lưu',
    closeModalTitle: 'Đóng hộp thoại (ESC)',
    closeModalAria: 'Đóng hộp thoại',

    // Keyboard Shortcuts (Ctrl+K / Ctrl+N)
    quickSearchBtnLabel: 'Tìm nhanh',
    quickSearchBtnTooltip: 'Tìm kiếm nhanh (Ctrl+K)',
    quickSearchModalTitle: 'Tìm Kiếm Nhanh Toàn Hệ Thống',
    quickSearchModalPlaceholder: 'Nhập số phiếu (PNK, PXK, OSD), mã vật tư, tên vật tư, mã lô, kho bãi...',
    quickSearchEmptyHint: 'Gõ từ khóa để tra cứu nhanh phiếu nhập kho, phiếu xuất kho, vật tư trong danh mục và biên bản OSD.',
    quickSearchNoResults: 'Không tìm thấy kết quả phù hợp với từ khóa vừa nhập.',
    quickSearchSectionInbound: 'Phiếu Nhập Kho',
    quickSearchSectionOutbound: 'Phiếu Xuất Kho',
    quickSearchSectionMaterials: 'Danh Mục Vật Tư',
    quickSearchSectionOsd: 'Vật Tư OSD',
    quickSearchFooterHint: 'Nhấn Enter để mở • ESC để đóng • Ctrl+Space lập phiếu mới',
    quickNewVoucherTitle: 'Lập Phiếu Kho Mới',
    quickNewVoucherSubtitle: 'Chọn loại phiếu cần tạo (phím tắt Ctrl+Space)',
    quickNewInboundTitle: 'Lập Phiếu Nhập Kho Mới',
    quickNewInboundDesc: 'Mở biểu mẫu lập phiếu nhập vật tư vào kho bãi (Mẫu QN-OPR-PR11-FM05.01)',
    quickNewOutboundTitle: 'Lập Phiếu Xuất Kho Mới',
    quickNewOutboundDesc: 'Mở biểu mẫu lập phiếu xuất vật tư từ tồn kho (Mẫu QN-OPR-PR11-FM06)',
    quickNewVoucherFooterHint: 'Nhấn phím 1 (Nhập kho) • phím 2 (Xuất kho) • ESC để đóng'
  },
  en: {
    // Document & Top Bar & Brand
    documentTitle: 'Equipment & Material Logistics Inventory System',
    appTitle: 'LOGISTICS & INVENTORY',
    appSubtitle: 'Project Equipment & Material Logistics Management',
    cloudSync: 'Cloud Sync',
    syncing: 'Syncing...',
    syncingTooltipPrefix: 'Syncing Cloud data',
    syncDownloadShort: 'Download',
    syncUploadShort: 'Upload',
    cloudPausedSparkShort: 'Cloud Paused (Spark)',
    cloudPausedSparkPrefix: 'Cloud Firestore Paused (Spark Plan):',
    cloudPausedShort: 'Cloud Paused',
    cloudManualPausedShort: 'Sync Paused',
    cloudPausedPrefix: 'Cloud Sync Paused:',
    cloudReconnectNow: 'Reconnect',
    cloudResumeNow: 'Resume Sync',
    cloudPauseSyncHint: 'Click to pause sync',
    cloudPausedReconnectTooltip: 'Cloud sync is paused. Click Cloud Sync to manually reconnect.',
    cloudManualPausedTooltip:
      'Cloud auto-sync is PAUSED (local changes are safely saved) — Click to RESUME auto-sync & sync now',
    cloudErrorPrefix: 'Cloud Firestore Error:',
    cloudQuotaExceeded: 'Daily Cloud Firestore quota exceeded',
    cloudQuotaExceededShort: 'Quota Exceeded',
    cloudSyncedTooltip:
      'Auto Cloud Sync is ON — Click to PAUSE sync (manage daily traffic & sync count)',
    cloudConnectTooltip: 'Click to connect & sync changed data only with Cloud Firestore (saves daily read quota)',
    switchGoogleAccount: 'Switch Google Account',
    requestLogoutOther: 'Request Logout on Other Device',
    sendingRequest: 'Sending request...',
    logout: 'Log Out',
    adminBadge: 'Main Administrator (Admin)',
    googleUserBadge: 'Synced Google Account',
    sessionAlertTitle: 'Session Alert:',
    understand: 'Understood',
    closeNotification: 'Dismiss notification',
    openNavMenu: 'Open navigation menu',
    closeNavMenu: 'Close menu',
    navMenuTitle: 'Navigation Menu',
    logoutDeviceSession: 'Sign Out This Device Session',
    languageToggleTooltip: 'Switch to Vietnamese',
    languageCurrent: 'English',

    // Navigation / Sidebar
    navOverview: 'Dashboard & KPIs',
    navInbound: 'Inbound Receipts',
    navOutbound: 'Outbound Issues',
    navOsd: 'OSD Discrepancies',
    navReports: 'Inventory Reports',
    navCategorySection: 'Master Catalogs',
    navWarehouses: 'Warehouse Setup',
    navMaterials: 'Materials Catalog',
    navUsers: 'User Accounts',
    sidebarBadgeNew: 'New',
    sidebarRoleAdminTitle: 'Administrator Access',
    sidebarRoleStaffTitle: 'Staff Mode',
    sidebarRoleAdminDesc: 'Full access to add/edit/delete warehouses, materials, users & approve vouchers',
    sidebarRoleStaffDesc: 'Authorized to perform inbound/outbound operations and view inventory reports',
    sidebarSystemFallback: 'Logistics System',

    // Mobile Quick Tabs
    quickTabDashboard: 'Dashboard',
    quickTabInbound: 'Inbound',
    quickTabOutbound: 'Outbound',
    quickTabOsd: 'OSD Items',
    quickTabReport: 'Reports',
    quickTabWarehouses: 'Warehouses',
    quickTabMaterials: 'Materials',
    quickTabUsers: 'Users',

    // Login Screen & Login Modal
    loginModalTitle: 'Material Management System',
    loginModalSubtitle: 'Sign in with Google Account for Cloud Sync',
    loginWithGoogle: 'Sign in with Google Account',
    openingGoogleAuth: 'Opening Google authentication...',
    authenticatingLabel: 'Authenticating...',
    switchingSession: 'Switching session...',
    googleLoginSuccessRedirect: 'Google sign-in successful! Entering the system...',
    loginSuccessShort: 'Signed in successfully!',
    redirectingToGoogle: 'Redirecting to Google sign-in...',
    currentGoogleAccount: 'Current Google account',
    continueWithAccount: 'Continue with',
    googleAuthHeaderBadge: 'Authenticated via Google Cloud',
    googleAuthTitle: 'Sign In With Google',
    googleAuthDesc: 'Sign in directly with your Google account (Gmail) to access the system and sync real-time inventory between PC and Mobile.',
    singleDeviceNotice: 'Each Google account is restricted to 1 active device at a time to preserve inventory integrity.',
    adminDefaultNotice: 'Account voduongphu@gmail.com is granted default Main Administrator (Admin) privileges.',
    staffNotice: 'Only Google mail accounts declared and granted access by the Admin in "User Accounts" are authorized to sign in.',
    heroTitle: 'Logistics & Inventory Management System',
    heroSubtitle: 'Enterprise construction project inventory management by Packing List, Shipment, Package No., Crate/Bundle, Manufacturer & Supplier.',
    heroSubbrand: 'Project equipment logistics governance',
    heroFeatureRealtime: 'Real-Time Google Cloud Sync',
    heroFeatureRealtimeDesc: 'One-tap Google sign-in with automatic data consistency across all devices',
    heroFeatureExcel: 'Inbound/Outbound & Bulk Excel Import',
    heroFeatureExcelDesc: 'Effortlessly processes 100,000+ inventory line items',
    heroFeatureSecurity: 'Single-Device Session Guard',
    heroFeatureSecurityDesc: 'Automatically revokes prior session when switching devices',
    heroFooterSystem: 'Construction Project Logistics System',
    sessionTerminatedTitle: 'Session ended on this device',
    sessionSecurityAlertTitle: 'Device Session Security Alert',
    conflictTitle: 'Google account is currently active on another device',
    activeOnOtherDevicePrefix: 'Currently signed in on',
    otherDeviceLabel: 'Another device',
    conflictDeviceLabel: 'Active device:',
    conflictLoginAt: 'Logged in at:',
    forceLogoutAndContinue: 'Log Out Other Device & Proceed',
    requestLogoutOnly: 'Request Logout on Other Device Only',
    logoutOtherDeviceOnlyShort: 'Log out other device only',
    switchGoogleAccountBtn: 'Choose Another Google Account',
    retryGoogleLogin: 'Retry Google Login',
    accountLabel: 'Account:',
    requestingDeviceLabel: 'Requesting device:',
    newDeviceLabel: 'New device:',
    timeLabel: 'Timestamp:',
    sessionReplacedSecurityHint:
      'If this was not you signing in on a new device, please sign back in with your Google account and review your account security.',
    acknowledgeReturnGoogle: 'Understood & Return to Google Sign-In',
    cloudNoticeTitle: 'Cloud Firestore Connection Notice',
    cloudNoticeDefaultDesc:
      'Cloud Firestore connection is temporarily interrupted. Please try signing in again or check your internet connection.',

    // ESC Confirm Modal
    escConfirmTitle: 'Confirm Closing Dialog',
    escConfirmSubtitle: 'ESC key was pressed',
    closeConfirmSubtitle: 'Unsaved voucher changes detected',
    escConfirmCancelTitle: 'Cancel and return to dialog (ESC)',
    escConfirmWarning:
      'Any unsaved information entered in this dialog will be discarded if you leave.',
    confirmModalUnsavedWarning:
      'Your edited voucher data has not been saved yet. Would you like to save before closing?',
    escConfirmStay: 'Stay & Continue',
    escConfirmLeave: 'Confirm Close',
    confirmModalSave: 'Save Voucher',
    confirmModalDiscard: 'Exit Without Saving',
    closeModalTitle: 'Close dialog (ESC)',
    closeModalAria: 'Close dialog',

    // Keyboard Shortcuts (Ctrl+K / Ctrl+N)
    quickSearchBtnLabel: 'Quick Search',
    quickSearchBtnTooltip: 'Quick Search (Ctrl+K)',
    quickSearchModalTitle: 'Global Quick Search',
    quickSearchModalPlaceholder: 'Type voucher no. (PNK, PXK, OSD), material code, material name, batch, warehouse...',
    quickSearchEmptyHint: 'Type keywords to search across inbound receipts, outbound issues, material catalog, and OSD reports.',
    quickSearchNoResults: 'No matching results found for your query.',
    quickSearchSectionInbound: 'Inbound Receipts',
    quickSearchSectionOutbound: 'Outbound Issues',
    quickSearchSectionMaterials: 'Materials Catalog',
    quickSearchSectionOsd: 'OSD Discrepancies',
    quickSearchFooterHint: 'Press Enter to open • ESC to close • Ctrl+Space for new voucher',
    quickNewVoucherTitle: 'Create New Warehouse Voucher',
    quickNewVoucherSubtitle: 'Choose the voucher type to create (shortcut Ctrl+Space)',
    quickNewInboundTitle: 'New Inbound Receipt',
    quickNewInboundDesc: 'Open the inbound material receipt form (Form QN-OPR-PR11-FM05.01)',
    quickNewOutboundTitle: 'New Outbound Issue',
    quickNewOutboundDesc: 'Open the outbound material issue form from inventory (Form QN-OPR-PR11-FM06)',
    quickNewVoucherFooterHint: 'Press 1 (Inbound) • Press 2 (Outbound) • ESC to close'
  }
};

/**
 * Core system UI phrases dictionary (VI -> EN).
 * Strictly limited to system UI controls, headers, filters, modals, and system messages.
 * User-entered data is NEVER translated.
 */
const UI_PHRASES_EN: Record<string, string> = {
  // Common Actions & Controls
  'Tìm kiếm': 'Search',
  'Tìm kiếm...': 'Search...',
  'Tìm kiếm vật tư...': 'Search materials...',
  'Tìm kiếm vật tư, số phiếu...': 'Search materials, vouchers...',
  'Tìm kiếm theo mã, tên vật tư...': 'Search by code, material name...',
  'Tìm kiếm kho bãi...': 'Search warehouses...',
  'Tìm kiếm người dùng...': 'Search users...',
  'Tìm theo mã kho, tên kho, địa điểm, thủ kho...': 'Search by code, warehouse name, location, keeper...',
  'Tìm theo Email Google, họ tên, phòng ban...': 'Search by Google Email, name, department...',
  'Thêm mới': 'Add New',
  'Thêm Mới': 'Add New',
  'Thêm vật tư': 'Add Material',
  'Thêm vật tư mới': 'Add New Material',
  'Thêm Vật Tư Mới': 'Add New Material',
  'Thêm kho mới': 'Add New Warehouse',
  'Thêm Kho Mới': 'Add New Warehouse',
  'Thêm người dùng': 'Add User',
  'Thêm Người Dùng': 'Add User',
  'Thêm dòng': 'Add Row',
  'Thêm dòng mới': 'Add New Row',
  'Thêm Dòng Vật Tư': 'Add Material Line',
  'Thêm từ danh mục': 'Add from Catalog',
  'Thêm từ tồn kho': 'Add from Stock',
  'Chọn nhiều mục': 'Select Multiple',
  'Chọn tất cả': 'Select All',
  'Bỏ chọn tất cả': 'Deselect All',
  '+ Chọn': '+ Select',
  '+Chọn': '+ Select',
  'Đã chọn': 'Selected',
  'Chỉnh sửa': 'Edit',
  'Sửa': 'Edit',
  'Xóa': 'Delete',
  'Xóa mục này': 'Delete this item',
  'Xóa các mục đã chọn': 'Delete Selected',
  'Xóa Các Mục Đã Chọn': 'Delete Selected Items',
  'Xóa tất cả': 'Delete All',
  'Xóa Tất Cả': 'Delete All',
  'Xóa phiếu': 'Delete Voucher',
  'Lưu': 'Save',
  'Lưu lại': 'Save',
  'Lưu thay đổi': 'Save Changes',
  'Lưu thông tin': 'Save Information',
  'Lưu phiếu': 'Save Voucher',
  'Lưu phiếu nhập': 'Save Inbound Receipt',
  'Lưu phiếu xuất': 'Save Outbound Issue',
  'Lưu kho bãi': 'Save Warehouse',
  'Lưu Kho Bãi': 'Save Warehouse',
  'Hủy': 'Cancel',
  'Hủy bỏ': 'Cancel',
  'Đóng': 'Close',
  'Xác nhận': 'Confirm',
  'Xác Nhận Xóa': 'Confirm Deletion',
  'Hành động này không thể hoàn tác': 'This action cannot be undone',
  'Chi tiết': 'Details',
  'Xem chi tiết': 'View Details',
  'Xem trước': 'Preview',
  'In phiếu': 'Print Voucher',
  'In ấn': 'Print',
  'Xuất Excel': 'Export Excel',
  'Xuất file Excel': 'Export Excel File',
  'Xuất Báo Cáo Excel': 'Export Excel Report',
  'Tải mẫu Excel': 'Download Excel Template',
  'Tải file mẫu': 'Download Template',
  'Import Excel': 'Import Excel',
  'Import Packing List Excel': 'Import Packing List Excel',
  'Nhập File Excel': 'Import Excel File',
  'Nhập File Excel Danh Mục': 'Import Materials Excel File',
  'Đặt lại': 'Reset',
  'Đặt lại bộ lọc': 'Reset Filters',
  'Làm mới': 'Refresh',
  'Quay lại': 'Back',
  'Tiếp tục': 'Continue',
  'Hoàn tất': 'Finish',
  'Cập nhật': 'Update',

  // Table Column Headers & Badges
  'STT': 'No.',
  'Mã vật tư': 'Material Code',
  'Mã Vật Tư': 'Material Code',
  'Mã VT': 'Item Code',
  'Tên vật tư': 'Material Name',
  'Tên Vật Tư': 'Material Name',
  'Tên vật tư (*)': 'Material Name (*)',
  'Tên Vật Tư Thiết Bị': 'Equipment & Material Name',
  'Tên vật tư & Quy cách': 'Material Name & Spec',
  'Quy cách': 'Specification',
  'Quy cách / Tiêu chuẩn': 'Specification / Standard',
  'Quy Cách & Ghi Chú': 'Specification & Notes',
  'Đơn vị tính': 'Unit',
  'ĐVT': 'Unit',
  'Đơn Vị': 'Unit',
  'Số lượng': 'Quantity',
  'Số Lượng': 'Quantity',
  'SL': 'Qty',
  'Số lượng (cây/tấm)': 'Quantity (pcs/sheets)',
  'Khối lượng': 'Weight',
  'Khối Lượng': 'Weight',
  'Khối lượng (Kg)': 'Weight (Kg)',
  'Tổng Khối Lượng (Kg)': 'Total Weight (Kg)',
  'Tổng Khối Lượng': 'Total Weight',
  'Tổng Số Lượng': 'Total Quantity',
  'Đơn trọng (Kg)': 'Unit Weight (Kg)',
  'KL đơn vị (Kg)': 'Unit Weight (Kg)',
  'KL Chuẩn (kg)': 'Std Weight (kg)',
  'Đơn giá': 'Unit Price',
  'Đơn giá (VNĐ)': 'Unit Price (VND)',
  'Thành tiền': 'Amount',
  'Thành tiền (VNĐ)': 'Total Amount (VND)',
  'Thành Tiền (VNĐ)': 'Total Amount (VND)',
  'Hạng mục': 'Category',
  'Hạng Mục': 'Category',
  'Hạng Mục Thi Công': 'Construction Work Item',
  'Số lô': 'Lot No.',
  'Mã lô': 'Batch No.',
  'Mã Lô': 'Batch No.',
  'Kiện / Lô': 'Package / Batch',
  'Số kiện': 'Package No.',
  'Số kiện / Package No.': 'Package No.',
  'Số kiện (Package No.)': 'Package No.',
  'Số Kiện (Package No.)': 'Package No.',
  'Package No.': 'Package No.',
  'Tên kiện': 'Package Name',
  'Tên kiện / Package Name': 'Package Name',
  'Packing List': 'Packing List',
  'Số packing list': 'Packing List No.',
  'Số packing list/Shipment': 'Packing List / Shipment',
  'Shipment': 'Shipment',
  'Số vận đơn / B/L': 'Bill of Lading / B/L',
  'Số Vận Đơn / B/L': 'Bill of Lading / B/L',
  'Số Container': 'Container No.',
  'Số Đơn Hàng / PO': 'Purchase Order / PO',
  'Số Hợp Đồng': 'Contract No.',
  'Bản vẽ': 'Drawing',
  'Bản vẽ / Drawing': 'Drawing No.',
  'Bản vẽ / Drawing No.': 'Drawing No.',
  'Nhà sản xuất': 'Manufacturer',
  'Nhà Sản Xuất': 'Manufacturer',
  'NSX': 'Mfr',
  'Nhà cung cấp': 'Supplier',
  'Nhà Cung Cấp': 'Supplier',
  'NCC': 'Supplier',
  'NSX & NCC': 'Mfr & Supplier',
  'Kho': 'Warehouse',
  'Kho bãi': 'Warehouse',
  'Kho Bãi': 'Warehouse',
  'Kho tiếp nhận': 'Receiving Warehouse',
  'Kho Tiếp Nhận': 'Receiving Warehouse',
  'Kho xuất hàng': 'Issuing Warehouse',
  'Kho Xuất Hàng': 'Issuing Warehouse',
  'Kho lưu trữ': 'Storage Warehouse',
  'Kho Lưu Trữ': 'Storage Warehouse',
  'Bộ Phận & Kho Lưu Trữ': 'Department & Warehouse',
  'Đơn Vị Giao Hàng & Hợp Đồng': 'Delivery Unit & Contract',
  'Đơn vị giao hàng': 'Delivery Unit',
  'Người giao hàng': 'Deliverer',
  'Người nhận hàng': 'Receiver',
  'Người Nhận Hàng': 'Receiver',
  'Người nhận & Đơn vị': 'Receiver & Department',
  'Bộ phận nhận': 'Receiving Dept',
  'Bộ phận / Đơn vị nhận': 'Receiving Dept / Unit',
  'Mục đích xuất': 'Issue Purpose',
  'Mục Đích Xuất': 'Issue Purpose',
  'Ngày tạo': 'Created Date',
  'Ngày lập': 'Voucher Date',
  'Ngày nhập': 'Inbound Date',
  'Ngày Nhập': 'Inbound Date',
  'Ngày Nhập Kho': 'Inbound Date',
  'Ngày xuất': 'Outbound Date',
  'Ngày Xuất': 'Outbound Date',
  'Ngày Xuất Kho': 'Outbound Date',
  'Người tạo': 'Creator',
  'Người lập': 'Prepared By',
  'Người Lập': 'Prepared By',
  'Trạng thái': 'Status',
  'Trạng Thái': 'Status',
  'Thao tác': 'Actions',
  'Thao Tác': 'Actions',
  'Ghi chú': 'Notes',
  'Ghi Chú': 'Notes',
  'Nội Dung / Lô Hàng': 'Description / Cargo',
  'Tồn đầu kỳ': 'Beginning Stock',
  'Tồn Đầu Kỳ': 'Beginning Stock',
  'Nhập trong kỳ': 'Inbound in Period',
  'Nhập Trong Kỳ': 'Inbound in Period',
  'Xuất trong kỳ': 'Outbound in Period',
  'Xuất Trong Kỳ': 'Outbound in Period',
  'Tồn cuối kỳ': 'Ending Stock',
  'Tồn Cuối Kỳ': 'Ending Stock',
  'Tồn khả dụng': 'Available Stock',
  'Tồn Khả Dụng': 'Available Stock',
  'Tồn Tối Thiểu': 'Min Stock Alert',
  'Cảnh báo tồn tối thiểu': 'Min Stock Alert',
  'Tổng tồn thực tế': 'Total Actual Stock',
  'Tổng khối lượng tồn': 'Total Stock Weight',
  'Tổng dòng vật tư': 'Total Material Lines',

  // Filters & State Selectors
  'Tất cả': 'All',
  'Tất cả kho': 'All Warehouses',
  'Tất cả kho bãi': 'All Warehouses',
  'Tất cả trạng thái': 'All Statuses',
  'Tất cả vai trò': 'All Roles',
  'Tất cả hạng mục': 'All Categories',
  'Tất cả loại kho': 'All Types',
  'Đang hoạt động': 'Active',
  'Tạm ngưng': 'Inactive',
  'Kích hoạt': 'Active',
  'Đã khóa': 'Locked',
  'Chờ xử lý': 'Pending',
  'Đang xử lý': 'Processing',
  'Đã giải quyết': 'Resolved',
  'Đã đóng': 'Closed',
  'Đã xuất': 'Issued',
  'Chưa xuất': 'Unissued',
  'Bản nháp': 'Draft',
  'Đã duyệt': 'Approved',
  'Đã nhập kho': 'Stored',
  'Hoàn thành': 'Completed',
  'Nghiêm trọng': 'Critical',
  'Trung bình': 'Medium',
  'Nhẹ': 'Low',
  'Hư hỏng': 'Damaged',
  'Thiếu hụt': 'Shortage',
  'Thừa hàng': 'Overage',
  'Sai quy cách': 'Spec Mismatch',
  'Đã đền bù': 'Compensated',
  'Đã đổi trả': 'Replaced',

  // Section Titles & Empty States
  'Báo Cáo Nhập - Xuất - Tồn Đa Chiều': 'Multidimensional Inventory Report',
  'Tra cứu đa điều kiện: Packing List, Shipment, Bản vẽ, Hạng mục, Kiện hàng, NSX, NCC, Khối lượng & Số lượng':
    'Multi-criteria query: Packing List, Shipment, Drawing, Category, Package, Mfr, Supplier, Weight & Quantity',
  'Hư Hỏng, Thiếu Hụt, Thừa Hàng (OS&D)': 'Over, Short & Damaged (OS&D)',
  'Danh Sách Phiếu Nhập': 'Inbound Receipts List',
  'Lập Phiếu Nhập Mới': 'Create Inbound Receipt',
  'Danh Sách Phiếu Xuất': 'Outbound Issues List',
  'Lập Phiếu Xuất Mới': 'Create Outbound Issue',
  'Danh Sách Biên Bản OSD': 'OS&D Reports List',
  'Chi Tiết Phiếu Nhập': 'Inbound Receipt Details',
  'Chi Tiết Phiếu Xuất': 'Outbound Issue Details',
  'Bộ Lọc Tra Cứu': 'Search Filters',
  'Bộ Lọc Nâng Cao': 'Advanced Filters',
  'Bộ lọc tra cứu chuyên sâu': 'Advanced Search & Filter Parameters',
  'Thông Tin Chung': 'General Information',
  'Thông Tin Phiếu': 'Voucher Information',
  'Danh Sách Vật Tư': 'Materials List',
  'Danh Sách Hàng Hóa': 'Cargo & Items List',
  'Tổng Kết': 'Summary',
  'Tổng Quan Kho': 'Warehouse Overview',
  'Không có dữ liệu': 'No data available',
  'Không tìm thấy dữ liệu phù hợp': 'No matching records found',
  'Không có phiếu nhập nào': 'No inbound receipts found',
  'Không có phiếu xuất nào': 'No outbound issues found',
  'Không có vật tư nào': 'No materials found',
  'Không có kho nào': 'No warehouses found',
  'Không có biên bản nào': 'No OS&D reports found',
  'Chưa có dòng vật tư nào': 'No material lines added yet',
  'Từ ngày': 'From Date',
  'Đến ngày': 'To Date',
  'Hôm nay': 'Today',
  'Tuần này': 'This Week',
  'Tháng này': 'This Month',
  'Shipment & Packing List': 'Shipment & Packing List',
  'Shipment quốc tế': 'International Shipments',
  'Mạng Lưới Kho Bãi': 'Warehouse Network',
  'kho đang hoạt động': 'active warehouses',
  'Sức chứa linh hoạt': 'Flexible storage capacity',

  // Warehouse / User / Voucher Details
  'Mã kho': 'Warehouse Code',
  'Mã Kho': 'Warehouse Code',
  'Tên kho bãi': 'Warehouse Name',
  'Tên Kho Bãi': 'Warehouse Name',
  'Loại kho': 'Warehouse Type',
  'Kho Kín / Có Mái': 'Covered / Indoor Warehouse',
  'Kho Hở / Bãi Ngoài Trời': 'Open Yard / Outdoor Storage',
  'Kho Hóa Chất / Đặc Biệt': 'Hazardous / Specialized Storage',
  'Sức chứa diện tích (m²)': 'Area Capacity (m²)',
  'Sức Chứa Diện Tích (m²)': 'Area Capacity (m²)',
  'Sức chứa khối lượng (Tấn)': 'Weight Capacity (Tons)',
  'Sức Chứa Khối Lượng (Tấn)': 'Weight Capacity (Tons)',
  'Thủ kho / Người phụ trách': 'Warehouse Keeper / Person in Charge',
  'Thủ Kho / Người Phụ Trách': 'Warehouse Keeper / Person in Charge',
  'Số điện thoại': 'Phone Number',
  'Số Điện Thoại': 'Phone Number',
  'Họ và tên': 'Full Name',
  'Họ Và Tên': 'Full Name',
  'Tài khoản / Username': 'Username',
  'Email Google': 'Google Email',
  'Vai trò / Phân quyền': 'Role / Permissions',
  'Quản trị viên (Admin)': 'Administrator (Admin)',
  'Thủ kho / Nhân viên': 'Warehouse Keeper / Staff',
  'Trạng thái hoạt động': 'Account Status',
  'Kích hoạt tài khoản': 'Active Account',
  'Đổi mật khẩu': 'Change Password',
  'Số Phiếu Nhập': 'Inbound Receipt No.',
  'Số Phiếu Xuất': 'Outbound Issue No.',
  'Mã phiếu xuất': 'Outbound Issue No.',
  'Mã Phiếu Xuất': 'Outbound Issue No.',
  'Mã phiếu nhập': 'Inbound Receipt No.',
  'Mã Phiếu Nhập': 'Inbound Receipt No.',
  'Mã phiếu': 'Voucher No.',
  'Mã Phiếu': 'Voucher No.',
  'Vật Tư Xuất Kho': 'Outbound Material Items',
  'Vật Tư Nhập Kho': 'Inbound Material Items',
  'Hàng Hóa Tồn Kho Khả Dụng': 'Available Inventory Items',
  'Vật tư đã chọn': 'Selected Materials',
  'Chọn vật tư': 'Select Material',
  'Chọn vật tư xuất': 'Select Outbound Item',
  'Tồn khả dụng:': 'Available stock:',
  'Khối lượng xuất (Kg)': 'Issue Weight (Kg)',
  'Số lượng xuất': 'Issue Quantity',
  'Khối lượng nhập (Kg)': 'Receipt Weight (Kg)',
  'Số lượng nhập': 'Receipt Quantity',
  'Hàng Hóa Tồn Kho': 'Inventory Stock',
  'Mã Biên Bản': 'Report No.',
  'Mã biên bản': 'Report No.',
  'Loại bất thường': 'Discrepancy Type',
  'Loại Bất Thường': 'Discrepancy Type',
  'Mức độ nghiêm trọng': 'Severity Level',
  'Mức Độ Nghiêm Trọng': 'Severity Level',
  'Tình trạng xử lý': 'Resolution Status',
  'Tình Trạng Xử Lý': 'Resolution Status',
  'Biện pháp khắc phục': 'Corrective Action',
  'Biện Pháp Khắc Phục': 'Corrective Action',
  'Nguyên nhân': 'Root Cause',
  'Nguyên Nhân': 'Root Cause',
  'Đơn vị chịu trách nhiệm': 'Responsible Party',
  'Số lượng ảnh hưởng': 'Affected Quantity',
  'Khối lượng ảnh hưởng (Kg)': 'Affected Weight (Kg)',
  'Tải Mẫu Excel Vật Tư': 'Download Materials Template',
  'Mở Bảng Tồn Kho Đầy Đủ': 'Open Full Inventory Table',
  'Chỉ Admin (voduongphu@gmail.com) mới có quyền thêm/sửa/khóa người dùng':
    'Only Admin (voduongphu@gmail.com) can add/edit/lock users',
  'Chỉ Quản trị viên (Admin) mới có quyền import danh mục vật tư.':
    'Only Administrators (Admin) can import materials catalog.',
  'Tự động lấy số phiếu nhập kế tiếp theo năm lập phiếu':
    'Auto-generate next inbound receipt number by voucher year',
  'Tự động lấy số phiếu nhập kế tiếp theo kho và năm lập phiếu':
    'Auto-generate next inbound receipt number by warehouse & voucher year',
  'Tự động lấy số phiếu xuất kế tiếp theo kho và năm lập phiếu':
    'Auto-generate next outbound issue number by warehouse & voucher year',

  // Auth / Cloud System Errors
  'Không thể đăng nhập bằng tài khoản Google. Vui lòng kiểm tra kết nối mạng và thử lại.':
    'Unable to sign in with Google account. Please check your internet connection and try again.',
  'Bạn đã đóng cửa sổ chọn tài khoản Google trước khi hoàn tất đăng nhập.':
    'You closed the Google account chooser window before completing sign-in.',
  'Trình duyệt đã chặn cửa sổ bật lên (Popup). Vui lòng cho phép Popup cho trang web này và thử đăng nhập lại.':
    'The browser blocked the sign-in popup window. Please allow popups for this site and try again.',
  'Tài khoản Google không cung cấp địa chỉ email hợp lệ. Vui lòng chọn tài khoản Google khác.':
    'This Google account did not provide a valid email address. Please choose another Google account.',
  'Firebase Authentication báo dự án chưa bật gói Blaze/Billing. Vui lòng kiểm tra cấu hình thanh toán trên Firebase Console.':
    'Firebase Authentication reported that billing/Blaze is not enabled. Please check billing settings in Firebase Console.',
  'Firebase Authentication tạm vượt hạn mức. Vui lòng thử lại sau ít phút hoặc kiểm tra hạn mức trên Firebase Console.':
    'Firebase Authentication temporarily exceeded its quota. Please try again shortly or check Firebase Console.',
  'Kết nối mạng bị gián đoạn khi xác thực với Google. Vui lòng kiểm tra Internet và thử lại.':
    'Network connection interrupted while authenticating with Google. Please check your internet and try again.',
  'Đã tạm dừng tự động đồng bộ Cloud. Các thay đổi dữ liệu vẫn được lưu an toàn tại máy — bấm lại nút "Đồng Bộ Cloud" để bật lại và đồng bộ.':
    'Auto Cloud sync paused. All local changes remain safely saved on this device — click "Cloud Sync" again to resume and sync.',
  'Đã bật lại tự động đồng bộ Cloud (dữ liệu đã khớp, không có thay đổi mới).':
    'Auto Cloud sync resumed (data is already in sync, no new changes).'
};

// Merge all specialized and comprehensive phrases into one unified dictionary
export const ALL_UI_PHRASES_EN: Record<string, string> = {
  ...UI_PHRASES_EN,
  ...COMPREHENSIVE_UI_PHRASES_EN
};

// Precompute lowercase lookup map for instant case-insensitive matching
const LOWER_CASE_MAP: Record<string, string> = {};
for (const [k, v] of Object.entries(ALL_UI_PHRASES_EN)) {
  LOWER_CASE_MAP[k.trim().toLowerCase()] = v;
}

function matchExactPhrase(str: string): string | null {
  if (ALL_UI_PHRASES_EN[str]) return ALL_UI_PHRASES_EN[str];
  const lower = str.toLowerCase();
  if (LOWER_CASE_MAP[lower]) return LOWER_CASE_MAP[lower];
  return null;
}

/**
 * Intelligent system UI phrase translator.
 * - Handles exact matches, punctuation (:, (*), +, •), counts, quoted labels, and dynamic system patterns.
 * - Returns null for arbitrary user-entered text so user data is NEVER altered.
 */
export function lookupTranslation(rawText: string): string | null {
  if (!rawText) return null;
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  // 1. Direct exact or trimmed match
  const direct = matchExactPhrase(trimmed);
  if (direct) return direct;

  // 2. Trailing colon handling: "Kho bãi:" -> "Warehouse:"
  if (trimmed.endsWith(':')) {
    const withoutColon = trimmed.slice(0, -1).trim();
    const trans = matchExactPhrase(withoutColon);
    if (trans) return `${trans}:`;
  }

  // 3. Parentheses with numbers or codes: "Tất cả kho (4)" -> "All Warehouses (4)"
  const parenMatch = trimmed.match(/^(.*?)(\s*\([0-9.,\s/A-Za-z-]+\))$/);
  if (parenMatch) {
    const base = parenMatch[1].trim();
    const suffix = parenMatch[2];
    const trans = matchExactPhrase(base);
    if (trans) return `${trans}${suffix}`;
  }

  // 4. Leading plus or bullet symbols: "+ Chọn" -> "+ Select", "• Hạng mục" -> "• Category"
  if (trimmed.startsWith('+')) {
    const base = trimmed.replace(/^\+\s*/, '').trim();
    const trans = matchExactPhrase(base);
    if (trans) return `+ ${trans}`;
  }
  if (trimmed.startsWith('•')) {
    const base = trimmed.replace(/^•\s*/, '').trim();
    const trans = matchExactPhrase(base);
    if (trans) return `• ${trans}`;
  }

  // 5. Asterisk suffix: "Tên vật tư (*)" -> "Material Name (*)"
  if (trimmed.endsWith('(*)') || trimmed.endsWith('*')) {
    const base = trimmed.replace(/\s*\(\*\)$|\s*\*$/, '').trim();
    const trans = matchExactPhrase(base);
    if (trans) return `${trans} (*)`;
  }

  // 6. Quoted system phrase: '"Thêm dòng vật tư"' -> '"Add Material Line"'
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith('“') && trimmed.endsWith('”'))
  ) {
    const inner = trimmed.slice(1, -1).trim();
    const trans = matchExactPhrase(inner);
    if (trans) return `"${trans}"`;
  }

  // 7. Dynamic system UI patterns (preserves interpolated user values verbatim)
  for (let i = 0; i < SYSTEM_UI_PATTERN_RULES_EN.length; i++) {
    const rule = SYSTEM_UI_PATTERN_RULES_EN[i];
    if (rule.pattern.test(trimmed)) {
      return trimmed.replace(rule.pattern, rule.replace);
    }
  }

  return null;
}

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  toggleLanguage: () => void;
  t: (keyOrPhrase: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'vtp_app_language';

const USER_PROTECTED_SELECTOR = '[data-user-content="true"], .user-data, code, pre, input, textarea';

function isProtectedUserContentElement(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.closest(USER_PROTECTED_SELECTOR)) return true;
  if (el.tagName === 'TD' && el.classList.contains('font-mono')) return true;
  return false;
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    try {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored === 'en' || stored === 'vi') return stored;
    } catch {
      // ignore localStorage read error
    }
    return 'vi';
  });

  const setLanguage = (lang: AppLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'vi' ? 'en' : 'vi');
  };

  const t = (keyOrPhrase: string, fallback?: string): string => {
    if (language === 'vi') {
      const direct = (TRANSLATIONS.vi as Record<string, string>)?.[keyOrPhrase];
      return direct || keyOrPhrase;
    }

    // language === 'en'
    const structured = (TRANSLATIONS.en as Record<string, string>)?.[keyOrPhrase];
    if (structured) return structured;

    const trans = lookupTranslation(keyOrPhrase);
    if (trans) return trans;

    return fallback || keyOrPhrase;
  };

  // Keep <html lang> and document.title in sync with active language
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = language;
    document.title = TRANSLATIONS[language].documentTitle;
  }, [language]);

  // Safe TreeWalker DOM text-node & attribute translator for system UI across tabs.
  // Strictly preserves user-entered content (inputs, textareas, data-user-content="true", .user-data).
  useEffect(() => {
    const isEn = language === 'en';
    let isScanning = false;

    const syncAttribute = (el: HTMLElement, attr: 'placeholder' | 'title' | 'aria-label') => {
      if (!el.hasAttribute(attr)) return;
      if (attr !== 'placeholder' && isProtectedUserContentElement(el)) return;

      const viKey = `data-vi-${attr}`;
      const enKey = `data-en-${attr}`;
      const currentVal = el.getAttribute(attr) || '';

      if (isEn) {
        const lastEn = el.getAttribute(enKey);
        // If React updated the attribute to a new Vietnamese string, refresh the stored VI source
        if (lastEn !== currentVal) {
          const trans = lookupTranslation(currentVal);
          if (trans && trans !== currentVal) {
            el.setAttribute(viKey, currentVal);
            el.setAttribute(enKey, trans);
            el.setAttribute(attr, trans);
          }
        }
      } else if (el.hasAttribute(viKey)) {
        const storedVi = el.getAttribute(viKey);
        const lastEn = el.getAttribute(enKey);
        // Only restore stored VI if React hasn't already overwritten the attribute with a fresh value
        if (storedVi !== null && (lastEn === null || currentVal === lastEn)) {
          el.setAttribute(attr, storedVi);
        }
        el.removeAttribute(viKey);
        el.removeAttribute(enKey);
      }
    };

    const translateAttributes = (el: HTMLElement) => {
      syncAttribute(el, 'placeholder');
      syncAttribute(el, 'title');
      syncAttribute(el, 'aria-label');
    };

    const scanAll = () => {
      if (isScanning || !document.body) return;
      isScanning = true;

      try {
        // 1. Translate placeholders, title tooltips, and aria-labels
        const attrElements = document.body.querySelectorAll<HTMLElement>(
          '[placeholder], [title], [aria-label]'
        );
        attrElements.forEach(translateAttributes);

        // 2. High-performance TreeWalker for all system UI text nodes
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;

            const tagName = parent.tagName;
            if (
              tagName === 'SCRIPT' ||
              tagName === 'STYLE' ||
              tagName === 'INPUT' ||
              tagName === 'TEXTAREA' ||
              tagName === 'CODE' ||
              tagName === 'PRE' ||
              isProtectedUserContentElement(parent)
            ) {
              return NodeFilter.FILTER_REJECT;
            }

            const val = node.nodeValue;
            if (!val || !val.trim()) return NodeFilter.FILTER_REJECT;

            return NodeFilter.FILTER_ACCEPT;
          }
        });

        let currentNode: Node | null;
        while ((currentNode = walker.nextNode())) {
          const raw = currentNode.nodeValue || '';
          const trimmed = raw.trim();
          if (!trimmed) continue;

          const anyNode = currentNode as any;

          if (isEn) {
            // If React updated this text node since our last translation, capture the fresh VI text
            if (anyNode.__lastEnText !== undefined && raw !== anyNode.__lastEnText) {
              anyNode.__origViText = undefined;
              anyNode.__lastEnText = undefined;
            }

            const trans = lookupTranslation(trimmed);
            if (trans && trans !== trimmed) {
              if (anyNode.__origViText === undefined) {
                anyNode.__origViText = raw;
              }
              const replaced = raw.replace(trimmed, trans);
              anyNode.__lastEnText = replaced;
              currentNode.nodeValue = replaced;
            }
          } else {
            if (anyNode.__origViText !== undefined) {
              if (anyNode.__lastEnText === undefined || raw === anyNode.__lastEnText) {
                currentNode.nodeValue = anyNode.__origViText;
              }
              anyNode.__origViText = undefined;
              anyNode.__lastEnText = undefined;
            }
          }
        }
      } finally {
        isScanning = false;
      }
    };

    // Run initial scan immediately
    scanAll();

    // Observe DOM mutations (tab switches, modals, async list renders)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (isScanning) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        scanAll();
      }, 30);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label']
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      observer.disconnect();
    };
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

/**
 * Nút chuyển đổi ngôn ngữ Tiếng Anh / Tiếng Việt tiện dụng, thẩm mỹ cao
 */
export const LanguageSwitcher: React.FC<{
  variant?: 'light' | 'dark' | 'pill';
  showLabel?: boolean;
  className?: string;
}> = ({ variant = 'dark', showLabel = true, className = '' }) => {
  const { language, setLanguage, toggleLanguage, t } = useLanguage();

  if (variant === 'pill') {
    return (
      <div
        className={`inline-flex items-center p-0.5 rounded-xl border border-slate-700/80 bg-slate-800/90 shadow-sm ${className}`}
        role="group"
        aria-label="Language switch"
      >
        <button
          type="button"
          onClick={() => setLanguage('vi')}
          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
            language === 'vi'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Tiếng Việt"
        >
          VI
        </button>
        <button
          type="button"
          onClick={() => setLanguage('en')}
          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
            language === 'en'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="English"
        >
          EN
        </button>
      </div>
    );
  }

  const isLight = variant === 'light';

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      title={t('languageToggleTooltip')}
      className={`min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition active:scale-95 shrink-0 ${
        isLight
          ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-xs'
          : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white border-slate-700 shadow-xs'
      } ${className}`}
    >
      <Languages className={`w-4 h-4 shrink-0 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
      <span className="font-bold tracking-wide">
        {language === 'vi' ? 'VI' : 'EN'}
      </span>
      {showLabel && (
        <span className="hidden sm:inline text-[11px] opacity-80 border-l pl-1.5 border-slate-500/40">
          {language === 'vi' ? 'Tiếng Việt' : 'English'}
        </span>
      )}
    </button>
  );
};
