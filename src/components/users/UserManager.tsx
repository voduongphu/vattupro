import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, UserRole, Warehouse } from '../../types/inventory';
import {
  Users,
  UserPlus,
  ShieldAlert,
  Trash2,
  Edit3,
  Search,
  CheckCircle2,
  X,
  ShieldCheck,
  UserCog,
  Building2,
  Phone,
  Mail,
  Lock,
  Unlock,
  Warehouse as WarehouseIcon
} from 'lucide-react';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { ModalGuard, ModalCloseButton } from '../../context/ModalContext';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  computeEmailAuthDigest,
  deriveWarehouseAbbrev,
  isBootstrappedAdminUser,
  isUserAdmin,
  normalizeAllowedWarehouseIds,
  normUserKey
} from '../../utils/additiveMerge';
import { StorageService } from '../../services/storage';
import { SyncService } from '../../services/syncService';

export const UserManager: React.FC = () => {
  const { users, currentUser, isAdmin, addUser, updateUser, deleteUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [warehouses, setWarehouses] = useState<Warehouse[]>(() => StorageService.getWarehouses());
  const [cloudState, setCloudState] = useState(() => SyncService.getCloudState());

  useEffect(() => {
    const unsubCloud = SyncService.subscribeCloudState((st) => setCloudState(st));
    const unsubStorage = StorageService.subscribe(() => {
      setWarehouses(StorageService.getWarehouses());
    });
    return () => {
      unsubCloud();
      unsubStorage();
    };
  }, []);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Form states for Add/Edit
  const [formEmail, setFormEmail] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('staff');
  const [formPhone, setFormPhone] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [formAllowedWarehouseIds, setFormAllowedWarehouseIds] = useState<string[]>([]);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formError, setFormError] = useState('');
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showNotify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3500);
  };

  const openAddModal = () => {
    setWarehouses(StorageService.getWarehouses());
    setFormEmail('');
    setFormFullName('');
    setFormUsername('');
    setFormRole('staff');
    setFormPhone('');
    setFormDepartment('Ban Quản Lý Kho Bãi');
    setFormAllowedWarehouseIds([]);
    setFormIsActive(true);
    setFormError('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (u: User) => {
    setWarehouses(StorageService.getWarehouses());
    const mainAdmin = isBootstrappedAdminUser(u);
    setEditingUser(u);
    setFormEmail(mainAdmin ? BOOTSTRAPPED_ADMIN_EMAIL : u.email || '');
    setFormFullName(u.fullName);
    setFormUsername(u.username);
    setFormRole(mainAdmin ? 'admin' : u.role);
    setFormPhone(u.phone || '');
    setFormDepartment(u.department || '');
    setFormAllowedWarehouseIds(
      mainAdmin || u.role === 'admin' ? [] : normalizeAllowedWarehouseIds(u.allowedWarehouseIds)
    );
    setFormIsActive(mainAdmin ? true : u.isActive);
    setFormError('');
  };

  const toggleWarehousePermission = (whId: string) => {
    setFormAllowedWarehouseIds((prev) =>
      prev.includes(whId) ? prev.filter((id) => id !== whId) : [...prev, whId]
    );
  };

  const buildUniqueUsername = (preferred: string, emailLower: string, excludeId?: string): string => {
    const baseCandidate =
      preferred.normalize('NFC').trim() ||
      emailLower.split('@')[0]?.trim() ||
      'user';
    let candidate = baseCandidate;
    let suffix = 2;
    while (
      users.some(
        (u) => u.id !== excludeId && normUserKey(u.username) === normUserKey(candidate)
      )
    ) {
      candidate = `${baseCandidate}.${suffix}`;
      suffix += 1;
    }
    return candidate;
  };

  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = formEmail.trim().toLowerCase();
    const cleanFullName = formFullName.normalize('NFC').trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFormError('Vui lòng nhập địa chỉ Email Google hợp lệ (ví dụ: nhanvien@gmail.com).');
      return;
    }
    if (!cleanFullName) {
      setFormError('Vui lòng nhập họ và tên đầy đủ của người sử dụng.');
      return;
    }

    const digest = computeEmailAuthDigest(cleanEmail);
    const existingByEmail = users.find(
      (u) =>
        (u.email || '').trim().toLowerCase() === cleanEmail ||
        (digest && u.emailDigest === digest)
    );
    if (existingByEmail) {
      setFormError(
        `Email Google "${cleanEmail}" đã được gán cho tài khoản "${existingByEmail.fullName}".`
      );
      return;
    }

    const finalUsername = buildUniqueUsername(formUsername, cleanEmail);

    const resolvedRole: UserRole = cleanEmail === BOOTSTRAPPED_ADMIN_EMAIL ? 'admin' : formRole;
    const resolvedAllowedWarehouses =
      resolvedRole === 'admin' ? undefined : normalizeAllowedWarehouseIds(formAllowedWarehouseIds);

    try {
      addUser({
        username: finalUsername,
        fullName: cleanFullName,
        role: resolvedRole,
        password: 'google-oauth',
        email: cleanEmail,
        emailDigest: digest,
        phone: formPhone.trim(),
        department: formDepartment.trim(),
        allowedWarehouseIds: resolvedAllowedWarehouses,
        isActive: cleanEmail === BOOTSTRAPPED_ADMIN_EMAIL ? true : formIsActive
      });
      setIsAddModalOpen(false);
      showNotify(
        'success',
        `Đã tạo tài khoản Google "${cleanEmail}" (${cleanFullName}). Đang đồng bộ lên Cloud Firestore...`
      );

      // Đẩy đồng bộ tức thì lên Cloud Firestore & máy chủ nội bộ
      void SyncService.syncUsersToCloudImmediately().then((res) => {
        if (res.success) {
          showNotify('success', `Đã cấp quyền và đồng bộ tài khoản "${cleanEmail}" lên Cloud Firestore thành công!`);
        } else {
          showNotify('error', `Tài khoản đã lưu tại máy. ${res.message}`);
        }
      });
    } catch (err: any) {
      setFormError(err.message || 'Lỗi khi tạo người dùng');
    }
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const isMainAdmin = isBootstrappedAdminUser(editingUser);
    const cleanEmail = isMainAdmin
      ? BOOTSTRAPPED_ADMIN_EMAIL
      : formEmail.trim().toLowerCase();
    const cleanFullName = formFullName.normalize('NFC').trim();

    if (!cleanFullName) {
      setFormError('Họ và tên người sử dụng không được để trống.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFormError('Vui lòng nhập Email Google hợp lệ để người dùng đăng nhập.');
      return;
    }

    const digest = computeEmailAuthDigest(cleanEmail);
    const duplicateEmailUser = users.find(
      (u) =>
        u.id !== editingUser.id &&
        ((u.email || '').trim().toLowerCase() === cleanEmail ||
          (digest && u.emailDigest === digest))
    );
    if (duplicateEmailUser) {
      setFormError(
        `Email Google "${cleanEmail}" đã thuộc về người dùng "${duplicateEmailUser.fullName}".`
      );
      return;
    }

    const finalUsername = isMainAdmin
      ? editingUser.username
      : buildUniqueUsername(formUsername || editingUser.username, cleanEmail, editingUser.id);

    const resolvedRole: UserRole = isMainAdmin ? 'admin' : formRole;
    const resolvedAllowedWarehouses =
      resolvedRole === 'admin' ? undefined : normalizeAllowedWarehouseIds(formAllowedWarehouseIds);

    updateUser(editingUser.id, {
      username: finalUsername,
      fullName: cleanFullName,
      role: resolvedRole,
      email: cleanEmail,
      emailDigest: digest,
      phone: formPhone.trim(),
      department: formDepartment.trim(),
      allowedWarehouseIds: resolvedAllowedWarehouses,
      isActive: isMainAdmin ? true : formIsActive
    });

    setEditingUser(null);
    showNotify('success', `Đã cập nhật phân quyền cho "${cleanFullName}". Đang đồng bộ Cloud...`);
    void SyncService.syncUsersToCloudImmediately().then((res) => {
      if (res.success) {
        showNotify('success', `Đã đồng bộ cập nhật tài khoản "${cleanEmail}" lên Cloud Firestore thành công!`);
      }
    });
  };

  const handleToggleActive = (u: User) => {
    if (isBootstrappedAdminUser(u)) {
      showNotify('error', 'Không thể khóa tài khoản Quản trị viên chính voduongphu@gmail.com!');
      return;
    }
    const nextActive = !u.isActive;
    updateUser(u.id, { isActive: nextActive });
    showNotify(
      'success',
      nextActive
        ? `Đã mở khóa cho phép "${u.fullName}" đăng nhập Google.`
        : `Đã khóa quyền đăng nhập của "${u.fullName}".`
    );
    void SyncService.syncUsersToCloudImmediately();
  };

  const handleDelete = (u: User) => {
    if (isBootstrappedAdminUser(u)) {
      showNotify('error', 'Không thể xóa tài khoản Quản trị viên chính Võ Dương Phú!');
      return;
    }
    setUserToDelete(u);
  };

  const confirmDeleteUser = () => {
    if (!userToDelete) return;
    const ok = deleteUser(userToDelete.id);
    if (ok) {
      showNotify(
        'success',
        `Đã xóa tài khoản "${userToDelete.fullName}" (${userToDelete.email || userToDelete.username}). Đang đồng bộ Cloud...`
      );
      void SyncService.syncUsersToCloudImmediately().then((res) => {
        if (res.success) {
          showNotify('success', 'Đã xóa và cập nhật đồng bộ lên Cloud Firestore thành công.');
        }
      });
    } else {
      showNotify('error', 'Không thể xóa tài khoản này.');
    }
    setUserToDelete(null);
  };

  const visibleUsers = isAdmin
    ? users
    : users.filter((u) => {
        if (isUserAdmin(u)) return true;
        if (!currentUser) return false;
        return (
          u.id === currentUser.id ||
          normUserKey(u.username) === normUserKey(currentUser.username) ||
          (Boolean(currentUser.emailDigest) && u.emailDigest === currentUser.emailDigest)
        );
      });

  const normalizedSearch = searchTerm.normalize('NFC').toLowerCase();
  const filteredUsers = visibleUsers.filter((u) => {
    const matchesSearch =
      u.fullName.normalize('NFC').toLowerCase().includes(normalizedSearch) ||
      (u.email && u.email.toLowerCase().includes(normalizedSearch)) ||
      u.username.normalize('NFC').toLowerCase().includes(normalizedSearch) ||
      (u.department && u.department.normalize('NFC').toLowerCase().includes(normalizedSearch));
    const matchesRole = selectedRole === 'all' || u.role === selectedRole;
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            <ShieldCheck className="w-3 h-3" /> Quản Trị Viên (Admin)
          </span>
        );
      case 'manager':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <UserCog className="w-3 h-3" /> Quản Lý Kho
          </span>
        );
      case 'staff':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <Users className="w-3 h-3" /> Thủ Kho / Nhân Viên
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            Chỉ Xem
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {notification && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 border shadow-md animate-in slide-in-from-top-2 ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <ShieldAlert className="w-5 h-5 shrink-0" />
          )}
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4">
        <div>
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">
                Quản Lý Tài Khoản Google & Phân Quyền
              </h1>
              <p className="text-slate-500 text-xs mt-0.5">
                Chỉ những tài khoản Google mail được Admin ({BOOTSTRAPPED_ADMIN_EMAIL}) khai báo và phân quyền tại đây mới được phép đăng nhập vào hệ thống.
              </p>
            </div>
          </div>
        </div>

        {isAdmin ? (
          <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
            <button
              type="button"
              onClick={openAddModal}
              className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs sm:text-sm shadow-md shadow-blue-500/20 transition active:scale-95 min-h-[42px]"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              <span>Thêm Tài Khoản Google</span>
            </button>
          </div>
        ) : (
          <div className="text-xs bg-amber-50 text-amber-800 px-3 py-2 rounded-lg border border-amber-200 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Chỉ Admin ({BOOTSTRAPPED_ADMIN_EMAIL}) mới có quyền thêm/sửa/khóa người dùng</span>
          </div>
        )}
      </div>

      {/* Cloud Connection Status Banner */}
      {cloudState.status === 'connected' ? (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-950 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
            <span>
              Trạng thái Cloud Firestore: <strong>Đã kết nối ({cloudState.cloudEmail || BOOTSTRAPPED_ADMIN_EMAIL})</strong>. Mọi tài khoản tạo mới hoặc cập nhật phân quyền sẽ tự động đồng bộ tức thì sang tất cả thiết bị khác.
            </span>
          </div>
          <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider shrink-0 hidden sm:inline">
            Realtime Active
          </span>
        </div>
      ) : cloudState.status === 'error' && cloudState.errorMessage ? (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl border text-xs shadow-xs ${
            cloudState.quotaExceeded
              ? 'bg-amber-50/90 border-amber-300 text-amber-950'
              : 'bg-rose-50/90 border-rose-200 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                cloudState.quotaExceeded ? 'bg-amber-500' : 'bg-rose-500'
              }`}
            />
            <span>
              Trạng thái Cloud Firestore:{' '}
              <strong>
                {cloudState.quotaExceeded
                  ? 'Hết hạn mức Cloud Firestore trong ngày'
                  : 'Lỗi kết nối Cloud Firestore'}
              </strong>
              {' — '}
              {cloudState.errorMessage}
            </span>
          </div>
          <span
            className={`text-[11px] font-semibold uppercase tracking-wider shrink-0 hidden sm:inline ${
              cloudState.quotaExceeded ? 'text-amber-700' : 'text-rose-700'
            }`}
          >
            {cloudState.quotaExceeded ? 'Quota Exceeded' : 'Error'}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-blue-50/80 border border-blue-200 text-xs text-blue-950 shadow-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 animate-pulse" />
          <span>
            Hệ thống tự động kích hoạt kết nối Google Cloud Firestore. Dữ liệu tài khoản và kho bãi được bảo toàn tại thiết bị. Sử dụng nút &ldquo;Đồng Bộ Cloud&rdquo; trên thanh tiêu đề để đồng bộ phần thay đổi.
          </span>
        </div>
      )}

      {/* Filters & Search */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3 min-w-0 max-w-full overflow-hidden">
        <div className="relative flex-1 w-full min-w-0">
          <input
            type="text"
            data-quick-search="primary"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo Email Google, họ tên, phòng ban..."
            className="w-full pl-9 pr-16 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[42px]"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 sm:top-3" />
          {!searchTerm && (
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              Ctrl+K
            </kbd>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto sm:max-w-[280px] min-w-0">
          <label className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">Vai trò:</label>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="flex-1 min-w-0 w-full max-w-full sm:w-auto px-3 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[42px] truncate"
          >
            <option value="all">Tất cả vai trò ({visibleUsers.length})</option>
            <option value="admin">Quản Trị Viên (Admin)</option>
            <option value="manager">Quản Lý Kho</option>
            <option value="staff">Thủ Kho / Nhân Viên</option>
            <option value="viewer">Chỉ Xem</option>
          </select>
        </div>
      </div>

      {/* Table of Users */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Người Sử Dụng</th>
                <th className="px-5 py-3.5">Tài Khoản Google (Email)</th>
                <th className="px-5 py-3.5">Vai Trò</th>
                <th className="px-5 py-3.5">Phân Quyền Kho Bãi</th>
                <th className="px-5 py-3.5">Phòng Ban / Liên Hệ</th>
                <th className="px-5 py-3.5 text-center">Trạng Thái</th>
                <th className="px-5 py-3.5 text-right">Thao Tác Quản Trị</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    Không tìm thấy người sử dụng nào phù hợp điều kiện tìm kiếm.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isMainAdmin = isBootstrappedAdminUser(u);
                  const displayEmail = isMainAdmin ? BOOTSTRAPPED_ADMIN_EMAIL : u.email || '';
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                              isMainAdmin
                                ? 'bg-rose-100 text-rose-700 ring-2 ring-rose-300'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {u.fullName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                              <span data-user-content="true">{u.fullName}</span>
                              {isMainAdmin && (
                                <span className="bg-rose-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                                  ADMIN CHÍNH
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">
                              <span>Mã nội bộ:</span> <span data-user-content="true">@{u.username}</span> • <span>Ngày tạo:</span>{' '}
                              <span data-user-content="true">{new Date(u.createdAt).toLocaleDateString('vi-VN')}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {displayEmail ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50/80 border border-blue-200/80 text-blue-900 font-mono text-xs font-semibold">
                            <Mail className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span data-user-content="true">{displayEmail}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                            Chưa gắn Email Google (Bấm Sửa để cập nhật)
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4">{getRoleBadge(isMainAdmin ? 'admin' : u.role)}</td>

                      <td className="px-5 py-4">
                        {isUserAdmin(u) ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Toàn quyền tất cả kho
                          </span>
                        ) : (() => {
                          const assignedIds = normalizeAllowedWarehouseIds(u.allowedWarehouseIds);
                          if (assignedIds.length === 0) {
                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                Chưa phân quyền kho
                              </span>
                            );
                          }
                          const assignedNames = assignedIds.map((whId) => {
                            const foundWh = warehouses.find((w) => w.id === whId);
                            return foundWh ? foundWh.name : whId;
                          });
                          return (
                            <div className="flex flex-wrap gap-1 max-w-[260px]">
                              {assignedNames.slice(0, 3).map((whName, idx) => (
                                <span
                                  key={`${u.id}-wh-${idx}`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200"
                                >
                                  <WarehouseIcon className="w-3 h-3 text-blue-600 shrink-0" />
                                  <span className="truncate max-w-[160px]" data-user-content="true">{whName}</span>
                                </span>
                              ))}
                              {assignedNames.length > 3 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                  +{assignedNames.length - 3} kho khác
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      <td className="px-5 py-4">
                        <div className="space-y-0.5 text-xs text-slate-600">
                          {u.department && (
                            <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span data-user-content="true">{u.department}</span>
                            </div>
                          )}
                          {u.phone && (
                            <div className="flex items-center gap-1.5 text-slate-500">
                              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span data-user-content="true">{u.phone}</span>
                            </div>
                          )}
                          {!u.department && !u.phone && (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-center">
                        {u.isActive || isMainAdmin ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Hoạt động
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                            Đã khóa
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        {isAdmin ? (
                          <div className="flex items-center justify-end gap-1.5">
                            {!isMainAdmin && (
                              <button
                                onClick={() => handleToggleActive(u)}
                                title={
                                  u.isActive
                                    ? 'Khóa quyền đăng nhập Google của tài khoản này'
                                    : 'Mở khóa cho phép tài khoản này đăng nhập Google'
                                }
                                className={`p-1.5 rounded-lg border transition ${
                                  u.isActive
                                    ? 'text-amber-600 hover:bg-amber-50 border-amber-200'
                                    : 'text-emerald-600 hover:bg-emerald-50 border-emerald-200'
                                }`}
                              >
                                {u.isActive ? (
                                  <Lock className="w-4 h-4" />
                                ) : (
                                  <Unlock className="w-4 h-4" />
                                )}
                              </button>
                            )}

                            <button
                              onClick={() => openEditModal(u)}
                              title="Chỉnh sửa thông tin & Phân quyền"
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            {!isMainAdmin && (
                              <button
                                onClick={() => handleDelete(u)}
                                title="Xóa người sử dụng"
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Chỉ xem</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Thêm tài khoản Google mới */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4 overscroll-contain">
          <ModalGuard
            title="Thêm Tài Khoản Google Mới"
            onClose={() => setIsAddModalOpen(false)}
          />
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[92dvh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
                  <UserPlus className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                  Thêm Tài Khoản Google Mới
                </h3>
              </div>
              <ModalCloseButton onClick={() => setIsAddModalOpen(false)} />
            </div>

            <form onSubmit={handleSaveAdd} className="p-4 sm:p-6 space-y-4 overflow-y-auto overscroll-contain flex-1">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Email Google đăng nhập (*)
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="ví dụ: nhanvienkho@gmail.com"
                  className="w-full px-3 py-2.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Nhân sự dùng đúng địa chỉ Gmail này để bấm &ldquo;Đăng nhập bằng tài khoản Google&rdquo;.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Họ và tên đầy đủ (*)
                  </label>
                  <input
                    type="text"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    placeholder="ví dụ: Lê Văn Hải"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Mã định danh nội bộ
                  </label>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="Tự động lấy theo Gmail nếu để trống"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Vai trò phân quyền
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="staff">Thủ Kho / Nhân Viên Kho</option>
                    <option value="manager">Quản Lý Kho</option>
                    <option value="admin">Quản Trị Viên (Admin)</option>
                    <option value="viewer">Chỉ Xem Báo Cáo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Phòng ban / Đơn vị
                  </label>
                  <input
                    type="text"
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    placeholder="Ban Quản Lý Kho Bãi"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Số điện thoại liên hệ
                </label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="09xx xxx xxx"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Phân quyền thao tác kho bãi */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-xs font-semibold text-slate-800 uppercase flex items-center gap-1.5">
                    <WarehouseIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Phân quyền thao tác kho bãi</span>
                  </label>
                  {formRole !== 'admin' && warehouses.length > 0 && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setFormAllowedWarehouseIds(warehouses.map((w) => w.id))}
                        className="font-semibold text-blue-600 hover:text-blue-800"
                      >
                        Chọn tất cả
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setFormAllowedWarehouseIds([])}
                        className="font-semibold text-slate-500 hover:text-slate-700"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  )}
                </div>

                {formRole === 'admin' ? (
                  <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 font-medium">
                    Quản trị viên (Admin) có toàn quyền xem và thao tác trên tất cả kho bãi.
                  </p>
                ) : warehouses.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    Chưa có danh mục kho bãi nào trong hệ thống.
                  </p>
                ) : (
                  <>
                    <div className="max-h-40 overflow-y-auto overscroll-contain grid grid-cols-1 gap-1.5 pr-1">
                      {warehouses.map((w) => {
                        const checked = formAllowedWarehouseIds.includes(w.id);
                        return (
                          <label
                            key={w.id}
                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition ${
                              checked
                                ? 'bg-blue-50/90 border-blue-300 text-blue-950'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleWarehousePermission(w.id)}
                                className="w-4 h-4 text-blue-600 rounded border-slate-300 shrink-0"
                              />
                              <span className="font-semibold truncate" data-user-content="true">{w.name}</span>
                            </div>
                            <span className="font-mono text-[11px] text-slate-500 shrink-0" data-user-content="true">
                              {w.code} • {deriveWarehouseAbbrev(w)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {formAllowedWarehouseIds.length === 0 ? (
                      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                        Chưa chọn kho nào: Người dùng sẽ chưa xem hoặc thao tác được dữ liệu kho cho đến khi được phân quyền.
                      </p>
                    ) : (
                      <p className="text-[11px] text-blue-700 font-medium">
                        Đã chọn {formAllowedWarehouseIds.length}/{warehouses.length} kho bãi được phép thao tác.
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="userActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300"
                />
                <label htmlFor="userActive" className="text-xs font-medium text-slate-700">
                  Cho phép tài khoản Google này đăng nhập ngay lập tức
                </label>
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/20"
                >
                  Lưu & Cấp Quyền Google
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Sửa thông tin & phân quyền */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4 overscroll-contain">
          <ModalGuard
            title={`Phân Quyền Tài Khoản: ${editingUser.fullName}`}
            onClose={() => setEditingUser(null)}
          />
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
                  <Edit3 className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                  Phân Quyền Tài Khoản: {editingUser.fullName}
                </h3>
              </div>
              <ModalCloseButton onClick={() => setEditingUser(null)} />
            </div>

            <form onSubmit={handleSaveEdit} className="p-4 sm:p-6 space-y-4 overflow-y-auto overscroll-contain flex-1">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Email Google đăng nhập (*)
                </label>
                <input
                  type="email"
                  value={formEmail}
                  disabled={isBootstrappedAdminUser(editingUser)}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="nhanvien@gmail.com"
                  className="w-full px-3 py-2.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-200"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Họ và tên đầy đủ (*)
                  </label>
                  <input
                    type="text"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Mã định danh nội bộ
                  </label>
                  <input
                    type="text"
                    value={formUsername}
                    disabled={isBootstrappedAdminUser(editingUser)}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Vai trò
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    disabled={isBootstrappedAdminUser(editingUser)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-200"
                  >
                    <option value="admin">Quản Trị Viên (Admin)</option>
                    <option value="manager">Quản Lý Kho</option>
                    <option value="staff">Thủ Kho / Nhân Viên</option>
                    <option value="viewer">Chỉ Xem</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Phòng ban
                  </label>
                  <input
                    type="text"
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Số điện thoại
                </label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Phân quyền thao tác kho bãi */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-xs font-semibold text-slate-800 uppercase flex items-center gap-1.5">
                    <WarehouseIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Phân quyền thao tác kho bãi</span>
                  </label>
                  {!isBootstrappedAdminUser(editingUser) && formRole !== 'admin' && warehouses.length > 0 && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setFormAllowedWarehouseIds(warehouses.map((w) => w.id))}
                        className="font-semibold text-blue-600 hover:text-blue-800"
                      >
                        Chọn tất cả
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setFormAllowedWarehouseIds([])}
                        className="font-semibold text-slate-500 hover:text-slate-700"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  )}
                </div>

                {isBootstrappedAdminUser(editingUser) || formRole === 'admin' ? (
                  <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 font-medium">
                    Quản trị viên (Admin) có toàn quyền xem và thao tác trên tất cả kho bãi.
                  </p>
                ) : warehouses.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    Chưa có danh mục kho bãi nào trong hệ thống.
                  </p>
                ) : (
                  <>
                    <div className="max-h-40 overflow-y-auto overscroll-contain grid grid-cols-1 gap-1.5 pr-1">
                      {warehouses.map((w) => {
                        const checked = formAllowedWarehouseIds.includes(w.id);
                        return (
                          <label
                            key={w.id}
                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition ${
                              checked
                                ? 'bg-blue-50/90 border-blue-300 text-blue-950'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleWarehousePermission(w.id)}
                                className="w-4 h-4 text-blue-600 rounded border-slate-300 shrink-0"
                              />
                              <span className="font-semibold truncate" data-user-content="true">{w.name}</span>
                            </div>
                            <span className="font-mono text-[11px] text-slate-500 shrink-0" data-user-content="true">
                              {w.code} • {deriveWarehouseAbbrev(w)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {formAllowedWarehouseIds.length === 0 ? (
                      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                        Chưa chọn kho nào: Người dùng sẽ chưa xem hoặc thao tác được dữ liệu kho cho đến khi được phân quyền.
                      </p>
                    ) : (
                      <p className="text-[11px] text-blue-700 font-medium">
                        Đã chọn {formAllowedWarehouseIds.length}/{warehouses.length} kho bãi được phép thao tác.
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editActive"
                  checked={formIsActive}
                  disabled={isBootstrappedAdminUser(editingUser)}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300"
                />
                <label htmlFor="editActive" className="text-xs font-medium text-slate-700">
                  Cho phép tài khoản này đăng nhập hệ thống
                </label>
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/20"
                >
                  Lưu Thay Đổi
                </button>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Xác Nhận Xóa Người Dùng */}
      <ConfirmDeleteModal
        isOpen={Boolean(userToDelete)}
        onClose={() => setUserToDelete(null)}
        onConfirm={confirmDeleteUser}
        title="Xác Nhận Xóa Tài Khoản Google"
        itemName={
          userToDelete
            ? `${userToDelete.fullName} (${userToDelete.email || '@' + userToDelete.username})`
            : ''
        }
        itemType="tài khoản người sử dụng"
        warningText="Tài khoản này sẽ bị xóa khỏi danh sách phân quyền của hệ thống. Bạn có chắc chắn muốn xóa không?"
      />
    </div>
  );
};
