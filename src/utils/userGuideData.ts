import type { AppLanguage } from '../context/LanguageContext';

export interface GuideStep {
  title: string;
  description: string;
}

export interface GuideRule {
  label: string;
  detail: string;
}

export interface GuideTable {
  headers: string[];
  rows: string[][];
}

export interface UserGuideSection {
  id: string;
  chapter: string;
  title: string;
  summary: string;
  targetTab?: string;
  targetTabLabel?: string;
  audienceLabel: string;
  steps: GuideStep[];
  rules?: GuideRule[];
  table?: GuideTable;
}

export function buildUserGuidePdfFileName(language: AppLanguage): string {
  const datePart = new Date().toISOString().slice(0, 10);
  return language === 'en'
    ? `User_Guide_Logistics_Inventory_${datePart}.pdf`
    : `Huong_Dan_Su_Dung_Quan_Ly_Kho_Vat_Tu_${datePart}.pdf`;
}

export function filterUserGuideSections(
  sections: UserGuideSection[],
  rawQuery: string
): UserGuideSection[] {
  const query = rawQuery.normalize('NFC').trim().toLowerCase();
  if (!query) return sections;

  return sections.filter((section) => {
    if (
      section.title.toLowerCase().includes(query) ||
      section.summary.toLowerCase().includes(query) ||
      section.audienceLabel.toLowerCase().includes(query) ||
      section.chapter.toLowerCase().includes(query)
    ) {
      return true;
    }

    if (
      section.steps.some(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query)
      )
    ) {
      return true;
    }

    if (
      section.rules?.some(
        (r) =>
          r.label.toLowerCase().includes(query) ||
          r.detail.toLowerCase().includes(query)
      )
    ) {
      return true;
    }

    if (
      section.table &&
      (section.table.headers.some((h) => h.toLowerCase().includes(query)) ||
        section.table.rows.some((row) =>
          row.some((cell) => cell.toLowerCase().includes(query))
        ))
    ) {
      return true;
    }

    return false;
  });
}

const GUIDE_SECTIONS_VI: UserGuideSection[] = [
  {
    id: 'overview-auth',
    chapter: '01',
    title: 'Tổng Quan Hệ Thống, Đăng Nhập & Phân Quyền',
    summary:
      'Ứng dụng quản trị toàn diện quy trình Nhập kho, Xuất kho, Báo cáo Nhập-Xuất-Tồn, Vật tư OSD và Danh mục kho bãi cho vật tư thiết bị dự án theo Packing List, Shipment, PACKAGE No., Bản vẽ (DWG No.), Nhà sản xuất và Nhà cung cấp.',
    audienceLabel: 'Tất cả người dùng',
    steps: [
      {
        title: 'Đăng nhập bằng tài khoản Google được cấp quyền',
        description:
          'Tại màn hình đăng nhập, nhấn "Đăng nhập bằng tài khoản Google" và chọn Gmail công việc. Chỉ những Email đã được Quản trị viên (Admin) khai báo và kích hoạt trong mục Người Sử Dụng mới được phép truy cập dữ liệu kho.'
      },
      {
        title: 'Cơ chế bảo vệ phiên đơn thiết bị',
        description:
          'Để bảo vệ tính toàn vẹn số liệu tồn kho, mỗi tài khoản Google chỉ đăng nhập hoạt động trên 1 thiết bị tại một thời điểm. Khi bạn đăng nhập trên thiết bị mới, hệ thống sẽ cảnh báo nếu tài khoản đang mở ở máy khác và hỗ trợ đăng xuất phiên cũ an toàn.'
      },
      {
        title: 'Làm quen với menu điều hướng và thanh tiêu đề',
        description:
          'Thanh bên trái (hoặc thanh tab nhanh trên điện thoại) chứa 9 phân hệ chức năng chính. Thanh tiêu đề phía trên tích hợp nút Tìm nhanh (Ctrl+K), chuyển đổi ngôn ngữ Tiếng Việt / Tiếng Anh, nút Đồng Bộ Cloud và menu tài khoản Google.'
      }
    ],
    table: {
      headers: ['Phân hệ / Quyền hạn', 'Quản Trị Viên (Admin)', 'Nhân Viên (Staff)'],
      rows: [
        ['Tổng Quan & KPI, Báo Cáo NXT', 'Xem toàn bộ tất cả các kho bãi', 'Chỉ xem các kho bãi được Admin phân quyền'],
        ['Quản Lý Nhập Kho & Xuất Kho', 'Lập, sửa, xóa, Import/Export Excel, In phiếu toàn bộ kho', 'Thao tác đầy đủ trên các kho được phân quyền'],
        ['Quản Lý Vật Tư OSD', 'Tạo, cập nhật xử lý, đính kèm PDF, xóa biên bản OSD', 'Thao tác OSD thuộc các kho được phân quyền'],
        ['Quản Lý Kho Bãi & Danh Mục Vật Tư', 'Toàn quyền Thêm / Sửa / Xóa / Import / Export', 'Chỉ xem danh mục (không được chỉnh sửa/xóa)'],
        ['Quản Lý Người Sử Dụng', 'Cấp quyền Email Google, phân quyền kho, khóa/mở tài khoản', 'Không có quyền truy cập']
      ]
    }
  },
  {
    id: 'dashboard',
    chapter: '02',
    title: 'Tổng Quan & KPI Hệ Thống',
    summary:
      'Màn hình điều hành trung tâm hiển thị tức thời tổng khối lượng tồn (Tấn / kg), tổng số lượng tồn kho, số lượng Packing List, Shipment, cơ cấu tồn theo hạng mục và các phiếu nhập/xuất gần nhất.',
    targetTab: 'dashboard',
    targetTabLabel: 'Đi tới Tổng Quan & KPI',
    audienceLabel: 'Admin & Nhân viên',
    steps: [
      {
        title: 'Theo dõi chỉ số tồn kho thời gian thực',
        description:
          'Các thẻ KPI tự động tính toán lại ngay sau mỗi lần lập phiếu nhập, lập phiếu xuất, chỉnh sửa số liệu hoặc đồng bộ dữ liệu mới từ Cloud Firestore.'
      },
      {
        title: 'Thao tác điều hướng nhanh từ banner đầu trang',
        description:
          'Nhấn trực tiếp các nút lối tắt "Nhập Kho Mới / Import Excel", "Lập Phiếu Xuất Kho", "Xem Báo Cáo NXT Đa Chiều" hoặc "Quản Lý Vật Tư OSD" để chuyển nhanh vào màn hình tác nghiệp tương ứng.'
      },
      {
        title: 'Kiểm tra trạng thái phân quyền kho cho tài khoản mới',
        description:
          'Nếu tài khoản Nhân viên mới chưa được gán kho nào, màn hình sẽ hiển thị bảng nhắc nhở liên hệ Admin phân quyền hoặc nhấn nút Đồng Bộ Cloud để tải dữ liệu kho mới nhất.'
      }
    ]
  },
  {
    id: 'inbound',
    chapter: '03',
    title: 'Quản Lý Nhập Kho (Mẫu QN-OPR-PR11-FM05.01)',
    summary:
      'Ghi nhận vật tư thiết bị nhập vào kho từ nhà cung cấp hoặc nhập trả lại kho từ công trình. Hỗ trợ lập phiếu trực tiếp, Import file Excel trên 100.000 dòng, Export Excel và In phiếu chuẩn A4.',
    targetTab: 'inbound',
    targetTabLabel: 'Đi tới Quản Lý Nhập Kho',
    audienceLabel: 'Admin & Nhân viên được cấp quyền kho',
    steps: [
      {
        title: 'Lập phiếu nhập kho mới (hoặc nhấn Ctrl+Space)',
        description:
          'Nhấn "Lập Phiếu Nhập Mới". Chọn Kho tiếp nhận (hệ thống tự sinh mã phiếu theo mã viết tắt của kho, VD: PN-LP-2026-0001), điền Ngày nhập, Người giao, Số hợp đồng/PO, Packing List, Shipment và Vị trí lưu kho/bãi.'
      },
      {
        title: 'Phân loại "Nhập mới" và "Nhập trả kho"',
        description:
          'Mặc định là "Nhập mới". Khi vật tư dư từ công trình trả về kho, hãy tích chọn "Nhập trả kho" để hệ thống tự động tách riêng số liệu vào cột NHẬP TRẢ KHO trên Báo cáo Nhập-Xuất-Tồn.'
      },
      {
        title: 'Thêm vật tư & Khai báo Vị trí lưu kho/bãi',
        description:
          'Có thể chọn nhanh vật tư có sẵn từ Danh mục vật tư hoặc nhập dòng mới (Mã vật tư, Tên vật tư, ĐVT, PACKAGE No., Bản vẽ DWG No., Số lượng, Khối lượng kg, Đơn giá, Vị trí lưu kho/bãi riêng từng dòng). Hệ thống tự đồng bộ thông tin vật tư mới vào Danh mục.'
      },
      {
        title: 'Import hàng loạt từ file Excel',
        description:
          'Nhấn "Tải Mẫu Excel Nhập Kho" để lấy file mẫu chuẩn cột. Sau khi điền dữ liệu, nhấn "Import Từ File Excel" để hệ thống tự bóc tách phiếu, nhóm theo Packing List/Shipment và kiểm tra hợp lệ.'
      },
      {
        title: 'In phiếu A4 & Xuất Excel từng phiếu hoặc toàn bộ',
        description:
          'Trên từng dòng phiếu có nút Xem chi tiết, Chỉnh sửa, In phiếu chuẩn mẫu QN-OPR-PR11-FM05.01, Xuất Excel từng phiếu, hoặc nhấn "Export ra Excel" ở thanh công cụ để xuất toàn bộ danh sách đang lọc.'
      }
    ],
    rules: [
      {
        label: 'Bảo vệ dữ liệu khi đóng hộp thoại sửa/lập phiếu',
        detail:
          'Nếu bạn đã thay đổi bất kỳ số liệu nào trong biểu mẫu phiếu nhập, khi nhấn nút X hoặc phím ESC sẽ xuất hiện hộp thoại hỏi "Lưu phiếu" hay "Thoát không lưu". Nếu chưa sửa gì, hộp thoại sẽ đóng ngay lập tức.'
      },
      {
        label: 'Cập nhật Vị trí lưu kho/bãi',
        detail:
          'Nếu khai báo Vị trí lưu kho/bãi ở đầu phiếu, các dòng chưa nhập vị trí riêng sẽ tự kế thừa; bạn vẫn có thể ghi đè vị trí riêng cho từng kiện/dòng vật tư.'
      }
    ]
  },
  {
    id: 'outbound',
    chapter: '04',
    title: 'Quản Lý Xuất Kho (Mẫu QN-OPR-PR11-FM06)',
    summary:
      'Quản lý xuất vật tư thiết bị ra công trình hoặc xuất điều chuyển sang kho/dự án khác. Tự động đối soát tồn kho thực tế theo từng kho, ngăn xuất âm và hỗ trợ chọn nhiều vật tư cùng lúc.',
    targetTab: 'outbound',
    targetTabLabel: 'Đi tới Quản Lý Xuất Kho',
    audienceLabel: 'Admin & Nhân viên được cấp quyền kho',
    steps: [
      {
        title: 'Lập phiếu xuất kho & Chọn kho xuất',
        description:
          'Nhấn "Lập Phiếu Xuất Mới" (hoặc Ctrl+Space), chọn Kho xuất hàng, điền Công trình/Dự án, Người nhận hàng, Bộ phận nhận, Số yêu cầu/Lệnh xuất và Mục đích sử dụng.'
      },
      {
        title: 'Phân loại "Xuất mới" và "Xuất điều chuyển"',
        description:
          'Chọn "Xuất mới" cho xuất thi công công trình thông thường, hoặc tích "Xuất điều chuyển" nếu xuất luân chuyển nội bộ/tái xuất — số liệu sẽ tự động cộng vào cột TÁI XUẤT trên Báo cáo NXT.'
      },
      {
        title: 'Chọn vật tư từ tồn kho khả dụng (Tích chọn 1 hoặc nhiều dòng)',
        description:
          'Nhấn "Chọn Vật Tư Từ Tồn Kho", tìm theo Mã VT, Tên VT, PACKAGE No., Packing List hoặc Vị trí lưu kho/bãi. Bạn có thể tích chọn hàng loạt nhiều vật tư để đưa vào phiếu, sau đó điều chỉnh Số lượng xuất (không vượt quá tồn khả dụng).'
      },
      {
        title: 'Import Excel Xuất Kho kèm kiểm tra tồn tự động',
        description:
          'Tải mẫu Excel Xuất kho hoặc Import trực tiếp: hệ thống tự đối chiếu Mã vật tư / Tên vật tư / PACKAGE No. với tồn kho tại kho tương ứng, cảnh báo rõ những dòng thiếu tồn hoặc sai tên kho trong khi vẫn giữ lại các dòng hợp lệ.'
      },
      {
        title: 'In phiếu chuẩn QN-OPR-PR11-FM06 & Export Excel',
        description:
          'Xem, sửa, xóa, xuất Excel từng phiếu/toàn bộ danh sách và in biểu mẫu phiếu xuất kho A4 chuẩn ký duyệt 4 chữ ký.'
      }
    ],
    rules: [
      {
        label: 'Chống xuất vượt tồn khi sửa phiếu',
        detail:
          'Khi chỉnh sửa phiếu xuất cũ, hạn mức tối đa cho phép bằng (Tồn kho hiện tại + Số lượng đã xuất của chính phiếu đang sửa) để đảm bảo kiểm soát chính xác.'
      }
    ]
  },
  {
    id: 'osd',
    chapter: '05',
    title: 'Quản Lý Vật Tư OSD (Hư Hỏng / Thiếu Hụt / Thừa Hàng)',
    summary:
      'Theo dõi và xử lý các bất thường phát sinh khi kiểm nhận hàng hóa (Over, Short & Damaged): Hư hỏng, Thiếu hụt, Thừa hàng, Sai quy cách gắn với phiếu nhập nguồn và biên bản PDF ký duyệt.',
    targetTab: 'osd',
    targetTabLabel: 'Đi tới Quản Lý Vật Tư OSD',
    audienceLabel: 'Admin & Nhân viên được cấp quyền kho',
    steps: [
      {
        title: 'Tạo biên bản OSD liên kết phiếu nhập nguồn',
        description:
          'Nhấn "Lập Biên Bản OSD Mới", chọn Phiếu nhập kho nguồn liên quan để hệ thống tự nạp danh sách vật tư, Packing List, Shipment và Kho bãi tương ứng.'
      },
      {
        title: 'Khai báo loại bất thường, mức độ và số lượng OSD',
        description:
          'Chọn phân loại cho từng dòng vật tư (Hư hỏng / Thiếu hụt / Thừa hàng / Sai quy cách), nhập Số lượng OSD > 0, chọn Mức độ (Nghiêm trọng / Trung bình / Nhẹ) và Trạng thái xử lý (Mở / Đã đền bù / Đã đổi trả / Đóng).'
      },
      {
        title: 'Đính kèm & Xem trực tiếp file PDF biên bản (tối đa 25MB)',
        description:
          'Tải lên file biên bản hiện trường định dạng .pdf (tối đa 25MB). File PDF được đồng bộ lên Cloud Firestore để các thiết bị khác có thể bấm xem hoặc tải về ngay trong ứng dụng.'
      },
      {
        title: 'Lọc theo dõi & Xuất danh sách OSD ra Excel',
        description:
          'Lọc nhanh theo trạng thái Mở/Đóng, loại OSD, kho bãi, khoảng ngày và xuất toàn bộ biên bản ra file Excel báo cáo nhà cung cấp/bảo hiểm.'
      }
    ]
  },
  {
    id: 'report',
    chapter: '06',
    title: 'Báo Cáo Nhập - Xuất - Tồn (NXT)',
    summary:
      'Tổng hợp tự động toàn bộ dòng luân chuyển vật tư theo 5 khóa gộp chuẩn và cung cấp bộ lọc đa điều kiện chuyên sâu kèm chức năng Xuất Excel báo cáo.',
    targetTab: 'report',
    targetTabLabel: 'Đi tới Báo Cáo Nhập-Xuất-Tồn',
    audienceLabel: 'Admin & Nhân viên (theo phạm vi kho được cấp)',
    steps: [
      {
        title: 'Hiểu quy tắc tự động gộp dòng báo cáo',
        description:
          'Hệ thống tự động gộp các phiếu nhập/xuất trùng 5 tiêu chí: Packing List + Shipment + PACKAGE No. + Mã vật tư + Tên vật tư, đồng thời tổng hợp danh sách Vị trí lưu kho/bãi tương ứng.'
      },
      {
        title: 'Tra cứu bằng Bộ Lọc Điều Kiện Chuyên Sâu',
        description:
          'Kết hợp tìm kiếm tổng hợp với các bộ lọc chi tiết: Kho bãi, Số Packing List, Shipment/Vận đơn, Hạng mục dự án, Bản vẽ (DWG No), PACKAGE No. (Số kiện), Nhà sản xuất, Nhà cung cấp, Vị trí lưu kho/bãi và khoảng Từ ngày – Đến ngày.'
      },
      {
        title: 'Xuất Báo Cáo Ra Excel',
        description:
          'Nhấn "Xuất Báo Cáo Ra Excel" ở góc trên bên phải để tải toàn bộ bảng số liệu đang hiển thị (đã áp dụng bộ lọc hiện hành) với đầy đủ cột PACKAGE No., Nhập, Nhập trả, Xuất, Tái xuất, Tồn SL và Tồn KL (kg).'
      }
    ],
    table: {
      headers: ['Chỉ tiêu trên Báo cáo NXT', 'Ý nghĩa nghiệp vụ / Công thức tính'],
      rows: [
        ['TỔNG NHẬP (SL / kg)', 'Tổng khối lượng & số lượng từ các phiếu Nhập mới'],
        ['NHẬP TRẢ KHO (SL / kg)', 'Tổng số liệu từ các phiếu tick chọn "Nhập trả kho"'],
        ['TỔNG XUẤT (SL / kg)', 'Tổng số liệu từ các phiếu Xuất mới ra công trình'],
        ['TÁI XUẤT (SL / kg)', 'Tổng số liệu từ các phiếu tick chọn "Xuất điều chuyển"'],
        ['TỒN KHO (SL & KL kg)', '(Tổng Nhập + Nhập Trả Kho) - (Tổng Xuất + Tái Xuất)']
      ]
    }
  },
  {
    id: 'catalogs',
    chapter: '07',
    title: 'Quản Trị Danh Mục (Kho Bãi, Vật Tư, Người Sử Dụng)',
    summary:
      'Ba phân hệ quản trị nền tảng dành riêng cho Quản trị viên (Admin) để thiết lập mạng lưới kho bãi, chuẩn hóa danh mục vật tư thiết bị và cấp quyền tài khoản Google.',
    targetTab: 'warehouses',
    targetTabLabel: 'Đi tới Quản Lý Kho Bãi',
    audienceLabel: 'Chỉ Quản Trị Viên (Admin)',
    steps: [
      {
        title: 'Quản Lý Kho Bãi: Khai báo mã viết tắt & sức chứa',
        description:
          'Mỗi kho bãi có Mã kho, Tên viết tắt (dùng tự động sinh số phiếu PN/PX, VD: LP → PN-LP-2026-0001), Loại hình (Kho kín, Bãi ngoài trời, Kho chuyên dụng), Diện tích (m²), Sức chứa (Tấn), Thủ kho và Trạng thái hoạt động.'
      },
      {
        title: 'Danh Mục Vật Tư: Chuẩn hóa dữ liệu & Cảnh báo tồn tối thiểu',
        description:
          'Quản lý Mã vật tư, Tên thiết bị, ĐVT, PACKAGE No., Bản vẽ, NSX, NCC, Khối lượng đơn vị (kg) và Ngưỡng cảnh báo tồn tối thiểu. Hỗ trợ Tải mẫu Excel, Import/Export hàng loạt và tích chọn xóa nhiều dòng.'
      },
      {
        title: 'Người Sử Dụng: Cấp quyền Google Email & Kho thao tác',
        description:
          'Thêm tài khoản bằng Gmail chính xác, chọn vai trò Admin (toàn quyền) hoặc Nhân viên (Staff). Với Nhân viên, Admin tích chọn từng Kho bãi mà người đó được phép xem và lập phiếu nhập/xuất/OSD, hoặc bật/tắt khóa tài khoản khi cần.'
      }
    ]
  },
  {
    id: 'cloud-sync',
    chapter: '08',
    title: 'Đồng Bộ Cloud, Chế Độ Offline & Kiểm Soát Lưu Lượng',
    summary:
      'Hệ thống mặc định tự động đồng bộ hai chiều thời gian thực qua Google Cloud Firestore khi có thay đổi dữ liệu, đồng thời cho phép người dùng chủ động Bật / Tắt (Tạm dừng) bất kỳ lúc nào.',
    audienceLabel: 'Tất cả người dùng',
    steps: [
      {
        title: 'Tự động đồng bộ & Theo dõi dung lượng trên nút Đồng Bộ Cloud',
        description:
          'Khi bạn thêm, sửa hoặc xóa phiếu/danh mục, dữ liệu được lưu ngay xuống bộ nhớ cục bộ (IndexedDB) và tự động đẩy lên Cloud. Khi đang chạy, nút "Đồng Bộ Cloud" trên thanh tiêu đề hiển thị trực tiếp tổng dung lượng truyền tải (KB/MB).'
      },
      {
        title: 'Chủ động Bật / Tắt (Tạm dừng) đồng bộ bất kỳ lúc nào',
        description:
          'Bấm vào nút "Đồng Bộ Cloud" khi đang bật để TẠM DỪNG tự động đồng bộ (hữu ích khi cần nhập nhiều phiếu liên tiếp mà muốn tiết kiệm số lượt đọc/ghi Cloud trong ngày). Bấm lại nút này hoặc nút "Bật lại đồng bộ" trên thông báo để bật lại và đồng bộ phần thay đổi ngay lập tức.'
      },
      {
        title: 'Xử lý mất mạng & Cơ chế thời gian chờ kết nối thông minh',
        description:
          'Nếu máy mất mạng hoặc chưa kết nối được tới máy chủ Cloud, hệ thống chỉ chờ tối đa 2 phút rồi tạm dừng kết nối để tránh treo máy; toàn bộ thao tác vẫn an toàn tại máy. Khi đã bắt tay kết nối được dữ liệu với Cloud, hệ thống sẽ chờ đồng bộ hoàn tất trọn vẹn bất kể kích thước dữ liệu.'
      }
    ],
    rules: [
      {
        label: 'Lưu trữ cục bộ an toàn (Offline-First)',
        detail:
          'Mọi dữ liệu trong lúc tạm dừng đồng bộ hoặc mất mạng đều được bảo toàn trong trình duyệt thiết bị và sẽ tự đối soát cộng gộp (không ghi đè mất dữ liệu máy khác) khi bật đồng bộ trở lại.'
      }
    ]
  },
  {
    id: 'shortcuts',
    chapter: '09',
    title: 'Phím Tắt & Mẹo Thao Tác Nhanh',
    summary:
      'Hệ thống phím tắt thông minh (hoạt động ổn định ngay cả khi đang bật bộ gõ tiếng Việt) cùng các tiện ích giao diện giúp rút ngắn thời gian lập phiếu và tra cứu.',
    audienceLabel: 'Tất cả người dùng',
    steps: [
      {
        title: 'Tra cứu nhanh theo ngữ cảnh hoặc toàn hệ thống (Ctrl+K)',
        description:
          'Nhấn Ctrl+K (hoặc Cmd+K trên macOS) để đưa con trỏ vào ô tìm kiếm của màn hình/hộp thoại đang mở; nhấn Ctrl+K lần nữa (hoặc ở màn hình không có ô tìm kiếm) để mở Tìm Kiếm Nhanh Toàn Hệ Thống (tìm xuyên suốt Phiếu nhập, Phiếu xuất, Vật tư, OSD).'
      },
      {
        title: 'Lập nhanh phiếu Nhập / Xuất kho (Ctrl+Space)',
        description:
          'Tại tab Nhập kho hoặc Xuất kho, nhấn Ctrl+Space để mở ngay biểu mẫu lập phiếu mới. Ở các tab khác, nhấn Ctrl+Space sẽ mở hộp thoại chọn nhanh phím 1 (Lập Phiếu Nhập Kho) hoặc phím 2 (Lập Phiếu Xuất Kho).'
      },
      {
        title: 'Chuyển đổi Song ngữ Việt/Anh & Ghim tiêu đề bảng',
        description:
          'Dùng nút chuyển ngôn ngữ trên thanh tiêu đề để chuyển toàn bộ giao diện giữa Tiếng Việt và English. Khi cuộn danh sách dài, dòng tiêu đề bảng dữ liệu tự động ghim cố định ở đầu màn hình để dễ đối chiếu cột.'
      }
    ],
    table: {
      headers: ['Phím tắt / Thao tác', 'Chức năng tương ứng'],
      rows: [
        ['Ctrl + K (hoặc Cmd + K)', 'Focus ô tìm nhanh đang mở hoặc mở Tìm Kiếm Nhanh Toàn Hệ Thống'],
        ['Ctrl + Space', 'Mở nhanh hộp thoại Lập Phiếu Nhập Kho / Phiếu Xuất Kho mới'],
        ['Phím 1 / 2 (trong hộp thoại Tạo nhanh)', 'Chọn nhanh Lập Phiếu Nhập Kho (1) hoặc Phiếu Xuất Kho (2)'],
        ['ESC hoặc nút X', 'Đóng hộp thoại; tự hỏi Xác nhận Lưu nếu biểu mẫu phiếu có dữ liệu thay đổi'],
        ['Click nút "Đồng Bộ Cloud"', 'Bật / Tạm dừng đồng bộ Cloud tức thì bất cứ lúc nào']
      ]
    }
  }
];

const GUIDE_SECTIONS_EN: UserGuideSection[] = [
  {
    id: 'overview-auth',
    chapter: '01',
    title: 'System Overview, Google Sign-In & Role Permissions',
    summary:
      'End-to-end project warehouse logistics management covering Inbound Receipts, Outbound Issues, Multidimensional Inventory Reports, OS&D Discrepancy Reports, and Master Catalogs indexed by Packing List, Shipment, PACKAGE No., Drawing No., Manufacturer, and Supplier.',
    audienceLabel: 'All Users',
    steps: [
      {
        title: 'Sign in with an authorized Google account',
        description:
          'Click "Sign in with Google Account" on the login screen and choose your work Gmail. Only Google email addresses pre-registered and activated by an Administrator in User Accounts can access warehouse data.'
      },
      {
        title: 'Single-device active session security',
        description:
          'To protect inventory accuracy, each Google account stays active on one device at a time. Signing in on a new device notifies you if another session is active and lets you sign out the previous device cleanly.'
      },
      {
        title: 'Main menu and top bar utilities',
        description:
          'Use the left sidebar (or mobile quick-tab strip) to switch across the 9 core modules. The top navigation bar includes Quick Search (Ctrl+K), Vietnamese/English language toggle, Cloud Sync control, and your Google account menu.'
      }
    ],
    table: {
      headers: ['Module / Permission', 'Administrator (Admin)', 'Staff Member (Staff)'],
      rows: [
        ['Dashboard & KPIs, Inventory Reports', 'View data across all warehouses', 'View assigned warehouses only'],
        ['Inbound Receipts & Outbound Issues', 'Create, edit, delete, Import/Export Excel, Print A4 across all warehouses', 'Full voucher operations for assigned warehouses'],
        ['OSD Discrepancies', 'Create, update resolution, attach PDF, delete OSD reports', 'Manage OSD reports for assigned warehouses'],
        ['Warehouse Setup & Materials Catalog', 'Full Add / Edit / Delete / Import / Export access', 'Read-only catalog view'],
        ['User Accounts', 'Manage Google emails, assign warehouses, activate/lock users', 'No access']
      ]
    }
  },
  {
    id: 'dashboard',
    chapter: '02',
    title: 'Dashboard & KPIs Overview',
    summary:
      'Real-time operational summary showing total stock weight (Tons / kg), total stock quantity, Packing List and Shipment counts, category breakdown, and recent inbound/outbound transactions.',
    targetTab: 'dashboard',
    targetTabLabel: 'Open Dashboard & KPIs',
    audienceLabel: 'Admin & Staff',
    steps: [
      {
        title: 'Monitor real-time stock metrics',
        description:
          'All KPI cards recalculate automatically after every inbound receipt, outbound issue, edit, or Cloud Firestore synchronization.'
      },
      {
        title: 'Use quick action shortcuts on the welcome banner',
        description:
          'Click "New Inbound / Import Excel", "Create Outbound Issue", "View Inventory Reports", or "OSD Discrepancies" to jump straight to your workflow.'
      },
      {
        title: 'Check warehouse access status for new accounts',
        description:
          'If a newly created Staff account has not been assigned any warehouse yet, the dashboard displays guidance to contact an Admin or click Cloud Sync to pull the latest warehouse catalog.'
      }
    ]
  },
  {
    id: 'inbound',
    chapter: '03',
    title: 'Inbound Receipts (Form QN-OPR-PR11-FM05.01)',
    summary:
      'Record incoming project equipment from suppliers or stock returns from construction sites. Supports manual entry, large-scale Excel import (100,000+ rows), Excel export, and A4 voucher printing.',
    targetTab: 'inbound',
    targetTabLabel: 'Open Inbound Receipts',
    audienceLabel: 'Admin & Authorized Staff',
    steps: [
      {
        title: 'Create a new inbound receipt (or press Ctrl+Space)',
        description:
          'Click "Create New Receipt", choose the receiving warehouse (auto-generates voucher code using the warehouse abbreviation, e.g., PN-LP-2026-0001), and enter Receipt Date, Deliverer, Contract/PO, Packing List, Shipment, and Storage Location.'
      },
      {
        title: 'Distinguish "New Inbound" vs. "Return to Stock"',
        description:
          'Select "Return to Stock" when unused materials come back from a site so quantities flow automatically into the RETURN TO STOCK column on Inventory Reports.'
      },
      {
        title: 'Add items and specify per-row Storage Location',
        description:
          'Pick items from the Materials Catalog or add new lines (Material Code, Name, Unit, PACKAGE No., Drawing No., Qty, Weight kg, Unit Price, Storage Location). New material details sync into the catalog automatically.'
      },
      {
        title: 'Batch Import from Excel',
        description:
          'Download the standard Excel Inbound Template, populate rows, and run "Import From Excel" to auto-group receipts by Packing List and Shipment.'
      },
      {
        title: 'Print A4 Form & Export Excel',
        description:
          'Inspect, edit, print A4 form QN-OPR-PR11-FM05.01, export individual receipts, or export the entire filtered list to Excel.'
      }
    ],
    rules: [
      {
        label: 'Unsaved edit protection on close',
        detail:
          'If you modified any field in an inbound or outbound receipt dialog, clicking X or pressing ESC asks whether to Save Receipt or Discard Changes. Unmodified dialogs close immediately.'
      }
    ]
  },
  {
    id: 'outbound',
    chapter: '04',
    title: 'Outbound Issues (Form QN-OPR-PR11-FM06)',
    summary:
      'Issue stocked equipment to project sites or transfer materials between warehouses with per-warehouse stock validation, multi-item picker, Excel import verification, and A4 printing.',
    targetTab: 'outbound',
    targetTabLabel: 'Open Outbound Issues',
    audienceLabel: 'Admin & Authorized Staff',
    steps: [
      {
        title: 'Create an outbound issue',
        description:
          'Click "Create Outbound Issue" (or Ctrl+Space), select the issuing warehouse, and enter Project, Recipient, Department, Request No., and Purpose.'
      },
      {
        title: 'Distinguish "Standard Issue" vs. "Transfer Outbound"',
        description:
          'Enable "Transfer Outbound" for inter-warehouse transfers or re-exports so quantities are tracked separately under TRANSFER OUT on Inventory Reports.'
      },
      {
        title: 'Select multiple items directly from available stock',
        description:
          'Open the stock picker, filter by Material Code, Name, PACKAGE No., Packing List, or Storage Location, check multiple rows at once, and adjust issue quantities within available stock.'
      },
      {
        title: 'Validated Excel Outbound Import',
        description:
          'Import outbound spreadsheets with automatic matching against warehouse stock by Material Code, Name, and PACKAGE No.; rows exceeding stock are flagged clearly without discarding valid rows.'
      }
    ],
    rules: [
      {
        label: 'Edit allowance calculation',
        detail:
          'When editing an existing outbound issue, maximum allowed quantity equals (Current Available Stock + Original Issued Qty of that receipt).'
      }
    ]
  },
  {
    id: 'osd',
    chapter: '05',
    title: 'OSD Discrepancies (Over, Short & Damaged)',
    summary:
      'Document and resolve cargo inspection discrepancies (Damaged, Shortage, Overage, Spec Mismatch) linked to source inbound receipts with signed PDF attachments up to 25MB.',
    targetTab: 'osd',
    targetTabLabel: 'Open OSD Discrepancies',
    audienceLabel: 'Admin & Authorized Staff',
    steps: [
      {
        title: 'Link a new OSD report to a source Inbound Receipt',
        description:
          'Select the source inbound receipt to populate warehouse, Packing List, Shipment, and item lines automatically.'
      },
      {
        title: 'Record discrepancy type, severity & resolution status',
        description:
          'Set type (Damaged, Shortage, Overage, Spec Mismatch), enter OSD Quantity > 0, assign severity (Critical, Medium, Low), and track status (Open, Compensated, Replaced, Closed).'
      },
      {
        title: 'Attach & preview PDF inspection reports (up to 25MB)',
        description:
          'Upload a .pdf inspection report synced via Cloud Firestore so authorized users can view or download it from any device.'
      }
    ]
  },
  {
    id: 'report',
    chapter: '06',
    title: 'Consolidated Inventory Reports',
    summary:
      'Automatically consolidates movement records by 5 key attributes with multi-criteria filtering and instant Excel report export.',
    targetTab: 'report',
    targetTabLabel: 'Open Inventory Reports',
    audienceLabel: 'Admin & Authorized Staff',
    steps: [
      {
        title: '5-field automatic consolidation',
        description:
          'Records sharing the same Packing List + Shipment + PACKAGE No. + Material Code + Material Name are consolidated into a single row with combined Storage Locations.'
      },
      {
        title: 'Apply multi-criteria filters',
        description:
          'Filter by Warehouse, Packing List, Shipment, Project Category, Drawing (DWG No.), PACKAGE No., Manufacturer, Supplier, Storage Location, and Date Range.'
      },
      {
        title: 'Export consolidated Excel report',
        description:
          'Click "Export Report to Excel" to download the filtered dataset including PACKAGE No., Inbound, Return to Stock, Outbound, Transfer Out, Stock Qty, and Stock Weight (kg).'
      }
    ],
    table: {
      headers: ['Report Column', 'Calculation Rule'],
      rows: [
        ['TOTAL INBOUND (Qty / kg)', 'Sum of standard inbound receipts'],
        ['RETURN TO STOCK (Qty / kg)', 'Sum of receipts marked Return to Stock'],
        ['TOTAL OUTBOUND (Qty / kg)', 'Sum of standard site outbound issues'],
        ['TRANSFER OUT (Qty / kg)', 'Sum of issues marked Transfer Outbound'],
        ['STOCK ON HAND (Qty & kg)', '(Total Inbound + Return to Stock) - (Total Outbound + Transfer Out)']
      ]
    }
  },
  {
    id: 'catalogs',
    chapter: '07',
    title: 'Master Catalogs (Warehouses, Materials & Users)',
    summary:
      'Administrator-only master setup screens for configuring storage facilities, standardizing equipment specifications, and controlling user access.',
    targetTab: 'warehouses',
    targetTabLabel: 'Open Warehouse Setup',
    audienceLabel: 'Administrator Only',
    steps: [
      {
        title: 'Warehouse Setup',
        description:
          'Configure warehouse code, voucher prefix abbreviation (e.g., LP), storage type, floor area (m2), weight capacity (Tons), warehouse keeper, and active status.'
      },
      {
        title: 'Materials Catalog',
        description:
          'Maintain Material Code, Equipment Name, Unit, PACKAGE No., Manufacturer, Supplier, unit weight (kg), and minimum stock alert threshold with batch Excel Import/Export.'
      },
      {
        title: 'User Accounts',
        description:
          'Whitelist authorized Gmail accounts, assign Admin or Staff roles, grant per-warehouse permissions, and enable or lock user access.'
      }
    ]
  },
  {
    id: 'cloud-sync',
    chapter: '08',
    title: 'Cloud Sync, Offline Safety & Traffic Control',
    summary:
      'Auto-syncs changes in real time via Google Cloud Firestore by default, with instant manual Pause/Resume control on the top bar to manage daily sync quota.',
    audienceLabel: 'All Users',
    steps: [
      {
        title: 'Real-time auto-sync with transfer size indicator',
        description:
          'Data edits save locally to IndexedDB first and sync automatically to Cloud Firestore. Active transfers display live total bytes (KB/MB) on the Cloud Sync button.'
      },
      {
        title: 'Toggle Cloud Sync ON/OFF at any time',
        description:
          'Click "Cloud Sync" while active to Pause auto-sync immediately during bulk edits. Click it again (or click "Resume Sync") whenever ready to resume and push pending changes.'
      },
      {
        title: 'Resilient connection timeout behavior',
        description:
          'If the Cloud server is unreachable or offline, connection attempts time out within 2 minutes to keep the app responsive. Once connected and transferring data, sync waits until completion.'
      }
    ]
  },
  {
    id: 'shortcuts',
    chapter: '09',
    title: 'Keyboard Shortcuts & Productivity Tips',
    summary:
      'Keyboard-first shortcuts designed to work reliably across English and Vietnamese input methods, paired with sticky table headers and bilingual switching.',
    audienceLabel: 'All Users',
    steps: [
      {
        title: 'Contextual & Global Quick Search (Ctrl+K)',
        description:
          'Press Ctrl+K (or Cmd+K on macOS) to focus the active tab or modal search field; press Ctrl+K again to launch Global Quick Search across Inbound, Outbound, Materials, and OSD.'
      },
      {
        title: 'Quick New Voucher (Ctrl+Space)',
        description:
          'Press Ctrl+Space on Inbound/Outbound tabs to open a new voucher immediately, or press 1 / 2 inside the Quick New Voucher prompt from any other screen.'
      }
    ],
    table: {
      headers: ['Shortcut / Action', 'Behavior'],
      rows: [
        ['Ctrl + K (or Cmd + K)', 'Focus current search bar or open Global Quick Search'],
        ['Ctrl + Space', 'Open Quick New Inbound / Outbound Voucher dialog'],
        ['Keys 1 / 2 (in Quick Prompt)', 'Launch New Inbound Receipt (1) or Outbound Issue (2)'],
        ['ESC or X button', 'Close dialog; prompts Save Confirmation if voucher data changed'],
        ['Click Cloud Sync button', 'Pause or Resume Cloud auto-sync immediately at any time']
      ]
    }
  }
];

export function getUserGuideSections(language: AppLanguage): UserGuideSection[] {
  return language === 'en' ? GUIDE_SECTIONS_EN : GUIDE_SECTIONS_VI;
}
