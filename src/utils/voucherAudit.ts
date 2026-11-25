import type { User } from '../types/inventory';

function normActorKey(val?: string | null): string {
  return (val || '').normalize('NFC').trim().toLowerCase();
}

/**
 * Lấy mã định danh người dùng đang đăng nhập để ghi vào lịch sử lập/sửa phiếu.
 */
export function getCurrentUserIdentifier(user: User | null | undefined): string {
  if (!user) return '';
  const candidates = [user.username, user.email, user.id, user.fullName];
  for (const c of candidates) {
    const trimmed = (c || '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

/**
 * Quy đổi giá trị tác nhân (username, id, email hoặc họ tên từ dữ liệu cũ)
 * sang Mã định danh nội bộ của người dùng.
 */
export function resolveActorUserCode(
  rawActor: string | undefined | null,
  users: readonly User[]
): string {
  const clean = (rawActor || '').normalize('NFC').trim();
  if (!clean) return 'Hệ thống';

  const targetKey = normActorKey(clean);
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    if (
      normActorKey(u.username) === targetKey ||
      normActorKey(u.id) === targetKey ||
      normActorKey(u.email) === targetKey ||
      normActorKey(u.fullName) === targetKey
    ) {
      return (u.username || u.email || u.id || clean).trim();
    }
  }

  return clean;
}

/**
 * Định dạng thời điểm theo múi giờ GMT+7 bất kể múi giờ hệ điều hành của người dùng.
 */
export function formatGmt7TimeAndDate(
  isoOrMs?: string | number | null
): { time: string; date: string } | null {
  if (isoOrMs == null || isoOrMs === '') return null;
  const ms = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(String(isoOrMs));
  if (!Number.isFinite(ms)) return null;

  const gmt7 = new Date(ms + 7 * 60 * 60 * 1000);
  const hh = String(gmt7.getUTCHours()).padStart(2, '0');
  const mm = String(gmt7.getUTCMinutes()).padStart(2, '0');
  const dd = String(gmt7.getUTCDate()).padStart(2, '0');
  const mo = String(gmt7.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = gmt7.getUTCFullYear();

  return {
    time: `${hh}:${mm}`,
    date: `${dd}/${mo}/${yyyy}`
  };
}

export interface VoucherLastModifiedInfo {
  isEdited: boolean;
  userCode: string;
  time: string;
  date: string;
  message: string;
}

/**
 * Tạo chuỗi hiển thị thông tin lần sửa đổi gần nhất khi nhấp xem chi tiết Phiếu Nhập / Phiếu Xuất.
 */
export function buildVoucherLastModifiedSummary(params: {
  lastEditedBy?: string;
  lastEditedAt?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: number;
  users: readonly User[];
}): VoucherLastModifiedInfo | null {
  const { lastEditedBy, lastEditedAt, createdBy, createdAt, updatedAt, users } = params;

  const editedFormatted = formatGmt7TimeAndDate(lastEditedAt);
  if (editedFormatted) {
    const userCode = resolveActorUserCode(lastEditedBy || createdBy, users);
    return {
      isEdited: true,
      userCode,
      time: editedFormatted.time,
      date: editedFormatted.date,
      message: `Lần sửa đổi gần nhất từ ${userCode}, vào lúc: ${editedFormatted.time} (GMT+7), ${editedFormatted.date}`
    };
  }

  const createdMs = createdAt ? Date.parse(createdAt) : NaN;
  const hasNewerUpdatedAt =
    typeof updatedAt === 'number' &&
    Number.isFinite(updatedAt) &&
    updatedAt > 0 &&
    (!Number.isFinite(createdMs) || updatedAt - createdMs > 2000);

  if (hasNewerUpdatedAt) {
    const updatedFormatted = formatGmt7TimeAndDate(updatedAt);
    if (updatedFormatted) {
      const userCode = resolveActorUserCode(lastEditedBy || createdBy, users);
      return {
        isEdited: true,
        userCode,
        time: updatedFormatted.time,
        date: updatedFormatted.date,
        message: `Lần sửa đổi gần nhất từ ${userCode}, vào lúc: ${updatedFormatted.time} (GMT+7), ${updatedFormatted.date}`
      };
    }
  }

  const createdFormatted = formatGmt7TimeAndDate(createdAt);
  if (createdFormatted) {
    const userCode = resolveActorUserCode(createdBy || lastEditedBy, users);
    return {
      isEdited: false,
      userCode,
      time: createdFormatted.time,
      date: createdFormatted.date,
      message: `Lần sửa đổi gần nhất từ ${userCode}, vào lúc: ${createdFormatted.time} (GMT+7), ${createdFormatted.date}`
    };
  }

  return null;
}
