import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  History,
  RefreshCw,
  Download,
  Search,
  RotateCcw,
  ShieldCheck,
  UserCog,
  Users,
  Monitor,
  CheckCircle2,
  ArrowRightLeft,
  Clock,
  ShieldAlert
} from 'lucide-react';
import type { LoginHistoryEntry, User, UserRole } from '../../types/inventory';
import { ModalGuard, ModalCloseButton } from '../../context/ModalContext';
import { PaginationBar } from '../common/PaginationBar';
import { SyncService } from '../../services/syncService';
import { exportToExcel } from '../../services/excelService';
import {
  filterLoginHistoryEntries,
  formatLoginHistoryGmt7
} from '../../utils/loginHistory';

interface LoginHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  currentUser: User | null;
  isAdmin: boolean;
}

export const LoginHistoryModal: React.FC<LoginHistoryModalProps> = ({
  isOpen,
  onClose,
  users,
  currentUser,
  isAdmin
}) => {
  const [entries, setEntries] = useState<LoginHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Filter states
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('all');
  const [selectedRole, setSelectedRole] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const loadHistory = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setNotice(null);
    const cached = SyncService.getCachedLoginHistory(currentUser);
    if (cached.length > 0) {
      setEntries(cached);
    }
    try {
      const res = await SyncService.fetchAllUsersLoginHistory(currentUser);
      setEntries(res.entries);
      if (!res.success && res.message) {
        setNotice(res.message);
      }
    } finally {
      setLoading(false);
    }
  }, [isAdmin, currentUser]);

  useEffect(() => {
    if (isOpen && isAdmin) {
      void loadHistory();
    }
  }, [isOpen, isAdmin, loadHistory]);

  const userFilterOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();
    for (const u of users) {
      map.set(u.id, {
        value: u.id,
        label: u.email ? `${u.fullName} (${u.email})` : `${u.fullName} (@${u.username})`
      });
    }
    for (const e of entries) {
      if (!map.has(e.userId)) {
        map.set(e.userId, {
          value: e.userId,
          label: e.email ? `${e.fullName} (${e.email})` : `${e.fullName} (@${e.username})`
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  }, [users, entries]);

  const filteredEntries = useMemo(
    () =>
      filterLoginHistoryEntries(entries, {
        search,
        role: selectedRole,
        userId: selectedUserId,
        startDate,
        endDate
      }),
    [entries, search, selectedRole, selectedUserId, startDate, endDate]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedRole, selectedUserId, startDate, endDate, entries.length]);

  const uniqueAccountsCount = useMemo(() => {
    const set = new Set<string>();
    for (const e of filteredEntries) {
      set.add((e.email || e.userId || e.username).toLowerCase());
    }
    return set.size;
  }, [filteredEntries]);

  const latestLoginFormatted = useMemo(() => {
    if (filteredEntries.length === 0) return null;
    return formatLoginHistoryGmt7(filteredEntries[0].loginAtMs || filteredEntries[0].loginAt);
  }, [filteredEntries]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIdx = (safePage - 1) * pageSize;
  const pagedEntries = useMemo(
    () => filteredEntries.slice(pageStartIdx, pageStartIdx + pageSize),
    [filteredEntries, pageStartIdx, pageSize]
  );

  const handleResetFilters = () => {
    setSearch('');
    setSelectedUserId('all');
    setSelectedRole('all');
    setStartDate('');
    setEndDate('');
  };

  const getRoleLabel = (role: UserRole): string => {
    switch (role) {
      case 'admin':
        return 'Quản Trị Viên (Admin)';
      case 'manager':
        return 'Quản Lý Kho';
      case 'staff':
        return 'Thủ Kho / Nhân Viên';
      default:
        return 'Chỉ Xem';
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200 whitespace-nowrap">
            <ShieldCheck className="w-3 h-3 shrink-0" />
            <span>Admin</span>
          </span>
        );
      case 'manager':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200 whitespace-nowrap">
            <UserCog className="w-3 h-3 shrink-0" />
            <span>Quản Lý Kho</span>
          </span>
        );
      case 'staff':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap">
            <Users className="w-3 h-3 shrink-0" />
            <span>Thủ Kho</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
            Chỉ Xem
          </span>
        );
    }
  };

  const handleExportExcel = () => {
    const rows = filteredEntries.map((e, idx) => {
      const gmt7 = formatLoginHistoryGmt7(e.loginAtMs || e.loginAt);
      return {
        'STT': idx + 1,
        'Giờ Đăng Nhập (GMT+7)': gmt7.time,
        'Ngày Đăng Nhập (GMT+7)': gmt7.date,
        'Họ và Tên': e.fullName,
        'Mã Định Danh': e.username,
        'Email Google': e.email || '',
        'Vai Trò': getRoleLabel(e.role),
        'Thiết Bị / Trình Duyệt': e.deviceLabel,
        'Trạng Thái':
          e.status === 'replaced_other_device'
            ? `Thay thế phiên cũ (${e.replacedDeviceLabel || 'Thiết bị khác'})`
            : 'Đăng nhập thành công'
      };
    });
    exportToExcel(
      rows,
      `LichSu_DangNhap_${new Date().toISOString().slice(0, 10)}`,
      'LichSuDangNhap'
    );
  };

  if (!isOpen || !isAdmin) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-sm p-2 sm:p-4 overscroll-contain">
      <ModalGuard title="Lịch Sử Đăng Nhập Hệ Thống" onClose={onClose} />
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[1280px] max-h-[92dvh] flex flex-col overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 border-b border-slate-100 bg-slate-50/90">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                Lịch Sử Đăng Nhập Tất Cả Người Dùng
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                Chỉ Quản trị viên (Admin) được phép theo dõi thời gian, tài khoản và thiết bị đăng nhập hệ thống.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadHistory()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
              <span>Làm mới</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredEntries.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Excel</span>
            </button>

            <ModalCloseButton onClick={onClose} />
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain flex-1 bg-slate-50/40">
          {notice && (
            <div className="px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {/* KPI Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                Tổng Lượt Đăng Nhập
              </span>
              <span className="text-xl font-extrabold text-indigo-700 font-mono tabular-nums mt-1 block">
                {filteredEntries.length.toLocaleString('vi-VN')}
              </span>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                Tài Khoản Đã Đăng Nhập
              </span>
              <span className="text-xl font-extrabold text-blue-700 font-mono tabular-nums mt-1 block">
                {uniqueAccountsCount.toLocaleString('vi-VN')}
              </span>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                Đăng Nhập Gần Nhất (GMT+7)
              </span>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-900 font-mono">
                <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{latestLoginFormatted ? `${latestLoginFormatted.time} — ${latestLoginFormatted.date}` : 'Chưa có dữ liệu'}</span>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs">
              <div className="lg:col-span-2 relative">
                <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                  Tìm kiếm nhanh
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Họ tên, email, mã định danh, thiết bị..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                  Người sử dụng
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none truncate"
                >
                  <option value="all">Tất cả người dùng</option>
                  {userFilterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value} data-user-content="true">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                  Vai trò
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none"
                >
                  <option value="all">Tất cả vai trò</option>
                  <option value="admin">Quản Trị Viên (Admin)</option>
                  <option value="manager">Quản Lý Kho</option>
                  <option value="staff">Thủ Kho / Nhân Viên</option>
                  <option value="viewer">Chỉ Xem</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                  Từ ngày
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase">
                    Đến ngày
                  </label>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Đặt lại</span>
                  </button>
                </div>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-3.5 py-3 w-12 text-center">STT</th>
                    <th className="px-3.5 py-3 w-40">Thời Gian (GMT+7)</th>
                    <th className="px-3.5 py-3">Người Sử Dụng</th>
                    <th className="px-3.5 py-3">Email Google</th>
                    <th className="px-3.5 py-3">Vai Trò</th>
                    <th className="px-3.5 py-3">Thiết Bị / Trình Duyệt</th>
                    <th className="px-3.5 py-3">Trạng Thái Phiên</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && entries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                        Đang tải lịch sử đăng nhập từ Cloud Firestore...
                      </td>
                    </tr>
                  ) : pagedEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                        Chưa có bản ghi lịch sử đăng nhập nào phù hợp với bộ lọc hiện tại.
                      </td>
                    </tr>
                  ) : (
                    pagedEntries.map((entry, idx) => {
                      const gmt7 = formatLoginHistoryGmt7(entry.loginAtMs || entry.loginAt);
                      return (
                        <tr key={entry.id} className="hover:bg-slate-50/70 transition">
                          <td className="px-3.5 py-3 text-center text-slate-400 font-mono">
                            {pageStartIdx + idx + 1}
                          </td>
                          <td className="px-3.5 py-3 font-mono whitespace-nowrap">
                            <div className="font-bold text-slate-900">{gmt7.time}</div>
                            <div className="text-[11px] text-slate-500">{gmt7.date}</div>
                          </td>
                          <td className="px-3.5 py-3">
                            <div className="font-semibold text-slate-900" data-user-content="true">
                              {entry.fullName}
                            </div>
                            <div className="text-[11px] text-slate-400" data-user-content="true">
                              @{entry.username}
                            </div>
                          </td>
                          <td className="px-3.5 py-3 font-mono text-blue-800">
                            {entry.email ? (
                              <span data-user-content="true">{entry.email}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3.5 py-3">{getRoleBadge(entry.role)}</td>
                          <td className="px-3.5 py-3">
                            <div className="flex items-center gap-1.5 text-slate-700">
                              <Monitor className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[230px]" title={entry.deviceLabel} data-user-content="true">
                                {entry.deviceLabel}
                              </span>
                            </div>
                          </td>
                          <td className="px-3.5 py-3">
                            {entry.status === 'replaced_other_device' ? (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                  <ArrowRightLeft className="w-3 h-3 shrink-0" />
                                  <span>Chuyển phiên thiết bị</span>
                                </span>
                                {entry.replacedDeviceLabel && (
                                  <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[210px]" data-user-content="true">
                                    Đăng xuất: {entry.replacedDeviceLabel}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                <span>Đăng nhập thành công</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <PaginationBar
              currentPage={safePage}
              totalItems={filteredEntries.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[25, 50, 100]}
              itemLabel="lượt đăng nhập"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
