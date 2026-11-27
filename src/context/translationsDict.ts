/**
 * Comprehensive Warehouse & Logistics System UI Dictionary (VI -> EN)
 *
 * Rules:
 * - Covers 100% of system UI labels, buttons, headings, table headers, filters,
 *   modals, tooltips, placeholders, status badges, and system notifications.
 * - Every English value MUST be pure, idiomatic English (zero Vietnamese diacritics).
 * - Never translates arbitrary user-entered data (material names, notes, warehouse names,
 *   supplier/deliverer/recipient names, etc.); dynamic pattern rules preserve all
 *   interpolated user values verbatim.
 */

export const COMPREHENSIVE_UI_PHRASES_EN: Record<string, string> = {
  // ===== DASHBOARD & OVERVIEW =====
  'Tổng Quan & KPI': 'Dashboard & KPIs',
  'Hệ Thống Quản Lý Nhập Xuất Tồn Vật Tư Dự Án': 'Project Equipment & Material Inventory Management System',
  'Hệ Thống Quản Lý Vật Tư': 'Material Management System',
  'Hệ thống kho vận': 'Logistics & Inventory System',
  'Đang mở hệ thống kho vận...': 'Opening Logistics & Inventory System...',
  'Nhập Kho Mới / Import Excel': 'New Inbound / Import Excel',
  'Lập Phiếu Xuất Kho': 'Create Outbound Issue',
  'Xem Báo Cáo NXT Đa Chiều': 'View Multidimensional Inventory Report',
  'Phiếu Nhập Kho Gần Đây': 'Recent Inbound Receipts',
  'Phiếu Xuất Kho Gần Đây': 'Recent Outbound Issues',
  'Phiếu Nhập Gần Đây': 'Recent Inbound Receipts',
  'Phiếu Xuất Gần Đây': 'Recent Outbound Issues',
  'Tất cả phiếu': 'All Vouchers',
  'Tất cả': 'All',
  'Xem chi tiết': 'View Details',
  'Xem tất cả': 'View All',
  'Phân Bổ Tồn Kho Theo Hạng Mục': 'Stock Distribution by Category',
  'Tổng Khối Lượng Tồn': 'Total Inventory Weight',
  'Tổng Số Lượng Tồn': 'Total Inventory Quantity',
  'Kho Bãi Lưu Trữ': 'Storage Warehouses',
  'Khu bãi & kho': 'Yards & Warehouses',
  'Truy xuất nguồn gốc chuẩn 100%': '100% Traceability Standard',
  'Số lượng:': 'Quantity:',
  'Tỷ trọng:': 'Share:',
  'Tấn': 'Tons',
  'Đơn vị / Kiện': 'Units / Packages',
  'mã vật tư thiết bị': 'material items',
  'PL / ': 'PL / ',
  ' Lô': ' Shipments',
  'Chưa có phiếu nhập kho nào gần đây': 'No recent inbound receipts yet',
  'Chưa có phiếu xuất kho nào gần đây': 'No recent outbound issues yet',
  'Kho Cát Lái, Cảng Phú Mỹ...': 'Cat Lai, Phu My Ports...',
  'Khác': 'Other',
  'Tài khoản chưa được phân quyền thao tác kho nào': 'No warehouses assigned to this account yet',
  'Chưa tải được dữ liệu kho từ Cloud Firestore': 'Warehouse data not yet loaded from Cloud Firestore',
  'Vui lòng liên hệ Quản trị viên (Admin) để cấp quyền truy cập cho các kho bãi bạn phụ trách trong mục Quản Lý Người Dùng.':
    'Please contact the Administrator (Admin) to grant access to your assigned warehouses in User Management.',
  'Vui lòng nhấn nút "Đồng Bộ Cloud" trên thanh tiêu đề để tải danh mục kho và dữ liệu mới nhất từ Cloud Firestore.':
    'Please click the "Cloud Sync" button in the top bar to load warehouses and the latest data from Cloud Firestore.',
  'Vui lòng nhấn nút "Đồng Bộ Cloud" trên thanh tiêu đề để tải danh mục kho và phiếu nhập kho mới nhất.':
    'Please click the "Cloud Sync" button in the top bar to load warehouses and the latest inbound receipts.',
  'Vui lòng nhấn nút "Đồng Bộ Cloud" trên thanh tiêu đề để tải danh mục kho và phiếu xuất kho mới nhất.':
    'Please click the "Cloud Sync" button in the top bar to load warehouses and the latest outbound issues.',
  'Vui lòng nhấn nút "Đồng Bộ Cloud" trên thanh tiêu đề để tải danh mục kho và biên bản OSD mới nhất.':
    'Please click the "Cloud Sync" button in the top bar to load warehouses and the latest OS&D reports.',
  'Vui lòng nhấn nút "Đồng Bộ Cloud" trên thanh tiêu đề để tải danh mục kho và số liệu tồn kho mới nhất.':
    'Please click the "Cloud Sync" button in the top bar to load warehouses and the latest inventory figures.',
  'Vui lòng liên hệ Admin để cấp quyền các kho bãi bạn được phép xem và thao tác.':
    'Please contact the Admin to assign the warehouses you are authorized to view and manage.',

  // ===== SIDEBAR & NAVIGATION & HEADER =====
  'Quyền Quản Trị Viên': 'Administrator Access',
  'Chế độ Nhân Viên': 'Staff Mode',
  'Toàn quyền thêm/sửa/xóa kho bãi, vật tư, người dùng & duyệt phiếu':
    'Full permissions to add/edit/delete warehouses, materials, users & approve vouchers',
  'Quyền thực hiện nhập/xuất kho và tra cứu báo cáo tồn kho':
    'Authorized to perform inbound/outbound operations and view inventory reports',
  'Danh mục điều hướng': 'Navigation Menu',
  'Mở danh mục điều hướng': 'Open navigation menu',
  'Đóng danh mục': 'Close menu',
  'Đăng Xuất Phiên Thiết Bị': 'Sign Out This Device Session',
  'Mới': 'New',
  'Cloud tạm dừng (Spark)': 'Cloud Paused (Spark)',
  'Cloud Firestore tạm dừng (Gói Spark):': 'Cloud Firestore Paused (Spark Plan):',
  'Lỗi Cloud Firestore:': 'Cloud Firestore Error:',
  'Đóng thông báo': 'Dismiss notification',

  // ===== MODAL CONTEXT & COMMON DIALOGS =====
  'Xác nhận thoát hộp thoại': 'Confirm Closing Dialog',
  'Phím ESC vừa được nhấn': 'ESC key was pressed',
  'Mọi thông tin đang nhập dở chưa lưu trong hộp thoại này sẽ bị hủy nếu bạn thoát ra.':
    'Any unsaved changes entered in this dialog will be discarded if you close it.',
  'Ở lại tiếp tục': 'Stay & Continue',
  'Ở lại': 'Stay',
  'Xác nhận thoát': 'Confirm Close',
  'Đóng hộp thoại (ESC)': 'Close dialog (ESC)',
  'Đóng hộp thoại': 'Close dialog',
  'Hủy và quay lại hộp thoại (ESC)': 'Cancel and return to dialog (ESC)',

  // ===== INBOUND RECEIPT MANAGER =====
  'Quản Lý Nhập Kho': 'Inbound Receipts',
  'Quản Lý Phiếu Nhập Kho (QN-OPR-PR11-FM05.01)': 'Inbound Receipt Management (QN-OPR-PR11-FM05.01)',
  'Lập & in Phiếu Nhập Kho chuẩn PTSC Quảng Ngãi QLVT theo Mã vật tư, Mã lô, Số lượng, Khối lượng (Kg), Đơn vị giao hàng & Hợp đồng':
    'Create & print standard Inbound Receipts (FM05.01) by Material Code, Batch No., Quantity, Weight (Kg), Supplier & Contract',
  'Tải Mẫu Excel Nhập Kho': 'Download Inbound Excel Template',
  'Tải tệp Excel mẫu chuẩn để chuẩn bị nhập kho': 'Download standard Excel template to prepare inbound data',
  'Import Từ File Excel': 'Import from Excel',
  'Export ra Excel': 'Export to Excel',
  'Xuất danh sách phiếu nhập kho ra file Excel': 'Export inbound receipts list to Excel file',
  'Lập Phiếu Nhập Kho Mới': 'Create New Inbound Receipt',
  'Lập Phiếu Nhập Kho (Mẫu QN-OPR-PR11-FM05.01)': 'Create Inbound Receipt (Form QN-OPR-PR11-FM05.01)',
  'Quyền Quản trị viên (Admin) — Mọi thay đổi số lượng/khối lượng sẽ tự động cập nhật lại tồn kho & đồng bộ thiết bị':
    'Administrator (Admin) Rights — Any quantity/weight changes will automatically update inventory & sync across devices',
  'CÔNG TY CỔ PHẦN DỊCH VỤ DẦU KHÍ QUẢNG NGÃI PTSC — Nhập đầy đủ thông tin để in phiếu A4 chuẩn':
    'PTSC QUANG NGAI — Complete all fields to print standard A4 voucher',
  'Tìm theo Số phiếu (PNK...), Đơn vị giao hàng, Hợp đồng, Đề xuất số, Mã lô, Mã/Tên vật tư...':
    'Search by Receipt No., Supplier, Contract, Request No., Batch, Code/Name...',
  'Tìm theo Số phiếu (PNK...), Đơn vị giao hàng, Hợp đồng, Vị trí lưu kho/bãi, Mã lô, Mã/Tên vật tư...':
    'Search by Receipt No., Supplier, Contract, Storage Location, Batch, Code/Name...',
  'Tìm nhanh Mã vật tư, Tên vật tư, Mã lô trong phiếu...':
    'Quick search Material Code, Material Name, Batch No. in receipt...',
  'Tìm nhanh Mã vật tư, Tên vật tư, Số kiện, Mã lô trong phiếu...':
    'Quick search Material Code, Material Name, Package No., Batch No. in receipt...',
  'Tìm nhanh Mã vật tư, Tên vật tư, Số kiện, Mã lô, Vị trí lưu kho/bãi trong phiếu...':
    'Quick search Material Code, Name, Package No., Batch No., Storage Location...',
  'Tìm nhanh Mã vật tư, Tên vật tư, Số kiện, Mã lô, Bản vẽ, Vị trí lưu kho/bãi trong phiếu...':
    'Quick search Material Code, Name, Package No., Batch No., DWG no., Storage Location...',
  'Mẹo dán nhanh từ Excel: Copy nhiều dòng (hoặc nhiều cột) Mã vật tư, Tên vật tư, Số kiện, Số lượng... rồi nhấn Ctrl+V trực tiếp vào ô trong bảng — hệ thống tự động thêm dòng & điền dữ liệu.':
    'Quick Excel Paste Tip: Copy multiple rows (or columns) of Material Code, Material Name, Package No., Quantity... and press Ctrl+V directly into any table cell — rows are added and filled automatically.',
  'Mẹo dán nhanh từ Excel: Copy nhiều dòng (hoặc nhiều cột) Mã vật tư, Tên vật tư, Mã lô / Số kiện, Số lượng... rồi nhấn Ctrl+V vào ô tìm nhanh hoặc trực tiếp vào ô trong bảng — hệ thống tự động thêm dòng & điền dữ liệu.':
    'Quick Excel Paste Tip: Copy multiple rows (or columns) of Material Code, Material Name, Batch / Package No., Quantity... and press Ctrl+V into the quick search box or any table cell — rows are added and filled automatically.',
  'Đóng thông báo dán dữ liệu': 'Close paste notification',
  'Tất cả kho bãi': 'All Warehouses',
  '🌐 Tất cả các kho': 'All Warehouses',
  'Từ:': 'From:',
  'Đến:': 'To:',
  'Số Phiếu & Ngày': 'Receipt No. & Date',
  'Số phiếu': 'Voucher No.',
  'Số phiếu (*)': 'Voucher No. (*)',
  'Số kế tiếp': 'Next No.',
  'Ngày': 'Date',
  'Ngày lập phiếu (*)': 'Voucher Date (*)',
  'Đơn Vị Giao Hàng & Hợp Đồng': 'Supplier & Contract',
  'Bộ Phận & Kho Lưu Trữ': 'Department & Storage Warehouse',
  'Nội Dung / Lô Hàng': 'Description / Cargo Lot',
  'Tổng Số Lượng': 'Total Quantity',
  'Tổng Khối Lượng (Kg)': 'Total Weight (Kg)',
  'Thao Tác': 'Actions',
  'Bấm để sắp xếp theo Số phiếu': 'Click to sort by Receipt No.',
  'Bấm để sắp xếp theo Ngày': 'Click to sort by Date',
  'Bấm để sắp xếp theo Số phiếu xuất': 'Click to sort by Issue No.',
  'Bấm để sắp xếp theo Ngày xuất': 'Click to sort by Issue Date',
  'Ngày: Mới nhất trước (Mặc định)': 'Date: Newest first (Default)',
  'Ngày: Cũ nhất trước': 'Date: Oldest first',
  'Số phiếu: Giảm dần (Z-A / 9-0)': 'Voucher No.: Descending (Z-A / 9-0)',
  'Số phiếu: Tăng dần (A-Z / 0-9)': 'Voucher No.: Ascending (A-Z / 0-9)',
  'Không có phiếu nhập kho nào phù hợp điều kiện lọc.': 'No inbound receipts match the filter criteria.',
  'Chưa có phiếu nhập kho nào phù hợp điều kiện lọc.': 'No inbound receipts match the filter criteria.',
  'Bộ phận': 'Department',
  'Bộ phận:': 'Department:',
  'Bộ phận: —': 'Department: —',
  'Để trống sẽ in BỘ PHẬN:': 'Leave blank to print "DEPARTMENT:"',
  'Kho tiếp nhận (*)': 'Receiving Warehouse (*)',
  'Hợp đồng': 'Contract',
  'Hợp đồng:': 'Contract:',
  'Số hợp đồng...': 'Contract No....',
  'Đề xuất số': 'Proposal / Request No.',
  'Đề xuất số:': 'Proposal / Request No.:',
  'Số đề xuất...': 'Proposal No....',
  'Nội dung nhập kho': 'Inbound Description',
  'Nội dung:': 'Description:',
  'Nội dung': 'Description',
  'Loại nhập:': 'Inbound Type:',
  'Loại phiếu:': 'Voucher Type:',
  'Hình thức nhập': 'Inbound Type',
  'Hình thức xuất': 'Outbound Type',
  'Nhập mới': 'New Inbound',
  'Nhập trả kho': 'Return to Stock',
  'Xuất mới': 'New Issue',
  'Xuất điều chuyển': 'Transfer Outbound',
  'Nhập mới / Nhập trả kho': 'New Inbound / Return to Stock',
  'Xuất mới / Xuất điều chuyển': 'New Issue / Transfer Outbound',
  'Nhập trả kho (Hàng hoàn trả từ công trường)': 'Return to Stock (Returned from Site)',
  'Xuất điều chuyển (Tái xuất sang kho khác/công trường)': 'Transfer Outbound (Transfer to another warehouse/site)',
  'Vị trí lưu kho/bãi (mặc định cho phiếu)': 'Storage Location (default for receipt)',
  'Vị trí lưu kho/bãi': 'Storage Location',
  'Vị trí lưu kho/bãi:': 'Storage Location:',
  'Áp dụng cho tất cả dòng': 'Apply to All Lines',
  'VD: Bãi A - Khu 01 - Hàng 03, Kho kín K1 - Kệ B2... (có thể sửa riêng từng dòng bên dưới)':
    'e.g., Yard A - Zone 01 - Row 03, Warehouse K1 - Rack B2... (editable per row below)',
  'VD: Bãi A - Kệ 01': 'e.g., Yard A - Rack 01',
  'Số Packing List (nếu có)': 'Packing List No. (if any)',
  'Shipment / Lô tàu (nếu có)': 'Shipment / Vessel Lot (if any)',
  'Viết bằng chữ (trên phiếu in)': 'Amount in Words (for printed voucher)',
  'Số tiền bằng chữ...': 'Amount in words...',
  'Số chứng từ gốc kèm theo': 'Attached Original Documents',
  'Ví dụ: Việt Xuân Mới': 'e.g., Viet Xuan Moi Co.',
  'Ví dụ: Phục vụ thi công hạng mục PIPING': 'e.g., For PIPING construction works',
  'Chọn vật tư từ Danh mục vật tư có sẵn': 'Select Material from Available Catalog',
  'Chọn Vật Tư Từ Danh Mục Có Sẵn': 'Select Material from Available Catalog',
  'Chọn Vật Tư Từ Danh Mục Vật Tư Có Sẵn': 'Select Material from Available Catalog',
  'Chưa có vật tư nào trong Danh mục. Khi bạn lưu phiếu nhập mới, vật tư sẽ tự động đồng bộ vào Danh mục.':
    'No materials in the Catalog yet. When you save a new inbound receipt, materials will automatically sync into the Catalog.',
  'Danh mục vật tư hiện đang trống — bạn có thể nhập dòng vật tư mới trực tiếp bên dưới...':
    'Materials Catalog is currently empty — you can enter new material rows directly below...',
  'Gõ Mã vật tư, Tên vật tư, Quy cách hoặc nhấp vào đây để chọn từ Danh mục vật tư có sẵn...':
    'Type Material Code, Name, Spec or click here to pick from Available Materials Catalog...',
  'Mở danh sách vật tư có sẵn': 'Open available materials catalog',
  'Nhấp vào một vật tư bên dưới để điền tự động thông tin vào dòng đang chọn':
    'Click any material below to auto-fill the selected row',
  'Tìm nhanh theo Mã vật tư, Tên vật tư, Packing List, Shipment, Mã kiện, Bản vẽ, Nhà cung cấp...':
    'Quick search by Material Code, Name, Packing List, Shipment, Package No., Drawing, Supplier...',
  'Chọn / Bỏ chọn tất cả vật tư trên trang hiện tại': 'Select / Deselect all materials on this page',
  'Không tìm thấy vật tư nào phù hợp trong Danh mục.': 'No matching materials found in the Catalog.',
  'Xem chi tiết phiếu nhập kho': 'View inbound receipt details',
  'In Phiếu Nhập Kho (Mẫu QN-OPR-PR11-FM05.01)': 'Print Inbound Receipt (Form QN-OPR-PR11-FM05.01)',
  'Xuất phiếu nhập kho ra Excel (.xlsx)': 'Export inbound receipt to Excel (.xlsx)',
  'Sửa phiếu nhập kho (Admin)': 'Edit inbound receipt (Admin)',
  'Sửa phiếu nhập kho này (Admin)': 'Edit this inbound receipt (Admin)',
  'Xóa phiếu nhập kho': 'Delete inbound receipt',
  'Xóa phiếu nhập kho này': 'Delete this inbound receipt',
  'Xem & In Phiếu (FM05.01)': 'Preview & Print (FM05.01)',
  'Sửa Phiếu': 'Edit Voucher',
  'Xóa Phiếu': 'Delete Voucher',
  'Lưu Phiếu Nhập Kho': 'Save Inbound Receipt',
  'Lưu Cập Nhật Phiếu Nhập Kho': 'Save Inbound Receipt Changes',
  'Bỏ chọn các phiếu nhập trên trang này': 'Deselect inbound receipts on this page',
  'Chọn tất cả các phiếu nhập trên trang này': 'Select all inbound receipts on this page',
  'Xóa các phiếu nhập kho đã đánh dấu chọn': 'Delete selected inbound receipts',
  'Xác Nhận Xóa Phiếu Nhập Kho': 'Confirm Delete Inbound Receipt',
  'Xác Nhận Xóa Nhiều Phiếu Nhập Kho': 'Confirm Delete Multiple Inbound Receipts',
  'Xóa phiếu nhập kho sẽ tự động trừ lại số lượng và khối lượng tồn kho tương ứng. Bạn có chắc chắn muốn xóa không?':
    'Deleting this inbound receipt will automatically deduct the corresponding stock quantity and weight. Are you sure you want to delete it?',
  'Toàn bộ các phiếu nhập kho đã đánh dấu sẽ bị xóa vĩnh viễn và tự động trừ lại số lượng, khối lượng tồn kho tương ứng trên toàn hệ thống.':
    'All selected inbound receipts will be permanently deleted and their stock quantities and weights will be automatically deducted system-wide.',
  'Chỉ tài khoản Quản trị viên (Admin) mới có quyền sửa phiếu nhập kho.':
    'Only Administrator (Admin) accounts can edit inbound receipts.',
  'Chỉ tài khoản Quản trị viên (Admin) mới có quyền xóa phiếu nhập kho.':
    'Only Administrator (Admin) accounts can delete inbound receipts.',
  'Số phiếu nhập không được để trống.': 'Inbound receipt number is required.',
  'Vui lòng nhập Đơn vị giao hàng.': 'Please enter the Delivery Unit / Supplier.',
  'Vui lòng thêm ít nhất một dòng vật tư vào phiếu nhập kho.': 'Please add at least one material line to the inbound receipt.',
  'Không có dữ liệu phiếu nhập kho để xuất ra Excel.': 'No inbound receipt data to export to Excel.',
  'Không thể xuất file Excel danh sách phiếu nhập kho.': 'Unable to export inbound receipts list to Excel.',
  'Lọc dòng vật tư...': 'Filter material rows...',
  'Không có dòng vật tư nào khớp từ khóa lọc.': 'No material lines match the filter keyword.',
  'Không tìm thấy mặt hàng phù hợp từ khóa.': 'No items match the search keyword.',
  'TỔNG CỘNG (LỌC)': 'TOTAL (FILTERED)',
  'TỔNG CỘNG': 'TOTAL',

  // ===== OUTBOUND ISSUE MANAGER =====
  'Quản Lý Xuất Kho': 'Outbound Issues',
  'Quản Lý Phiếu Xuất Kho (QN-OPR-PR11-FM06)': 'Outbound Issue Management (QN-OPR-PR11-FM06)',
  'Lập & in Phiếu Xuất Kho chuẩn PTSC Quảng Ngãi QLVT theo Người nhận, Đơn vị/Tổ/Nhóm, Số PYC/PĐX, Mã lô & Khối lượng (Kg)':
    'Create & print standard Outbound Issues (FM06) by Receiver, Unit/Team, Request No., Batch No. & Weight (Kg)',
  'Tải Mẫu Excel Xuất Kho': 'Download Outbound Excel Template',
  'Tải tệp Excel mẫu chuẩn để chuẩn bị xuất kho': 'Download standard Excel template to prepare outbound data',
  'Import Xuất Từ File Excel': 'Import Outbound from Excel',
  'Xuất danh sách phiếu xuất kho ra file Excel': 'Export outbound issues list to Excel file',
  'Lập Phiếu Xuất Kho Mới': 'Create New Outbound Issue',
  'Lập Phiếu Xuất Kho (Mẫu QN-OPR-PR11-FM06)': 'Create Outbound Issue (Form QN-OPR-PR11-FM06)',
  'Quyền Quản trị viên (Admin) — Mọi thay đổi số lượng/khối lượng xuất sẽ tự động cập nhật tồn kho & đồng bộ thiết bị':
    'Administrator (Admin) Rights — Any outbound quantity/weight changes will automatically update inventory & sync across devices',
  'CÔNG TY CỔ PHẦN DỊCH VỤ DẦU KHÍ QUẢNG NGÃI PTSC — Chọn từ tồn kho hoặc thêm dòng vật tư xuất':
    'PTSC QUANG NGAI — Select from available stock or add outbound material lines',
  'Tìm theo Số phiếu (PXK...), Người nhận, Đơn vị/Tổ/Nhóm, Số PYC/PĐX, Mã lô, Mã/Tên vật tư...':
    'Search by Issue No., Receiver, Unit/Team, Request No., Batch, Code/Name...',
  'Tìm theo Số phiếu (PXK...), Người nhận, Đơn vị/Tổ/Nhóm, Số PYC/PĐX, Mã lô, Bản vẽ, Mã/Tên vật tư...':
    'Search by Issue No., Receiver, Unit/Team, Request No., Batch, DWG no., Code/Name...',
  'Tìm nhanh Mã vật tư, Tên vật tư, Mã lô trong phiếu xuất...':
    'Quick search Material Code, Material Name, Batch No. in issue voucher...',
  'Tìm nhanh Mã vật tư, Tên vật tư, Mã lô, Bản vẽ trong phiếu xuất...':
    'Quick search Material Code, Material Name, Batch No., DWG no. in issue voucher...',
  'Người Nhận & Đơn Vị/Tổ/Nhóm': 'Receiver & Unit/Team',
  'Bộ Phận & Kho Xuất': 'Department & Issuing Warehouse',
  'Số PYC/PĐX & Lý Do Xuất': 'Request No. & Issue Purpose',
  'Số Phiếu Xuất & Ngày': 'Issue No. & Date',
  'Không có phiếu xuất kho nào phù hợp điều kiện lọc.': 'No outbound issues match the filter criteria.',
  'Chưa có phiếu xuất kho nào phù hợp điều kiện lọc.': 'No outbound issues match the filter criteria.',
  'Kho xuất hàng (*)': 'Issuing Warehouse (*)',
  'Tất cả kho xuất': 'All Issuing Warehouses',
  'Người nhận': 'Receiver',
  'Người nhận:': 'Receiver:',
  'Đơn vị/Tổ/Nhóm': 'Unit / Team / Group',
  'Đơn vị/Tổ/Nhóm:': 'Unit / Team / Group:',
  'Số PYC/PĐX': 'Request / Proposal No.',
  'Số PYC/PĐX:': 'Request / Proposal No.:',
  'Lý do xuất kho': 'Issue Reason',
  'Lý do xuất kho:': 'Issue Reason:',
  'Lý do xuất kho & Ghi chú': 'Issue Reason & Notes',
  'Mục đích xuất:': 'Issue Purpose:',
  'Lý do xuất:': 'Issue Reason:',
  'Phiếu xuất kho': 'Outbound Issue',
  'Phiếu xuất điều chuyển': 'Transfer Outbound',
  'Ví dụ: Nguyễn Văn Long': 'e.g., Nguyen Van Long',
  'Ví dụ: Tổ thi công': 'e.g., Construction Team',
  'Ví dụ: PYC25-0001': 'e.g., REQ25-0001',
  'Ví dụ: Phục vụ công tác thi công UG piping': 'e.g., For UG piping installation works',
  'Tìm & chọn nhanh từ tồn kho bên dưới hoặc thêm dòng thủ công':
    'Quickly search & select from stock below or add a manual row',
  '🔍 Tìm nhanh vật tư từ Tồn kho (gõ Mã VT, Tên VT, Vị trí lưu kho/bãi, Mã lô / Số kiện, Packing List...)':
    'Search materials from Stock (type Material Code, Name, Storage Location, Batch/Package No., Packing List...)',
  'Gõ tìm nhanh Mã vật tư, Tên vật tư, Mã lô / Số kiện, Packing List...':
    'Quick search Material Code, Name, Batch/Package No., Packing List...',
  'Gõ tìm nhanh Mã vật tư, Tên vật tư, Vị trí lưu kho/bãi, Mã lô / Số kiện, Packing List...':
    'Quick search Material Code, Name, Storage Location, Batch/Package No., Packing List...',
  'Không có mặt hàng tồn kho khả dụng nào trong kho này.': 'No available stock items in this warehouse.',
  'Hiện tại': 'Current',
  'Kho hiện tại': 'Current Warehouse',
  '(Đang chọn)': '(Selected)',
  '+ Thêm dòng': '+ Add Row',
  '+ Chọn xuất': '+ Select Issue',
  '✓ Đã có trong phiếu': '✓ Already in voucher',
  'Đã có trong phiếu': 'Already in voucher',
  'Chưa có vật tư xuất. Bấm': 'No outbound items yet. Click',
  'để lập phiếu xuất kho.': 'to create the outbound issue.',
  'hoặc': 'or',
  'Chọn Hàng Hóa Từ Tồn Kho Khả Dụng': 'Select Items from Available Stock',
  'Tích chọn nhanh nhiều vật tư cần xuất kho — Tìm theo Mã vật tư, Tên vật tư, Mã lô / Số kiện, Packing List':
    'Multi-select stock items to issue — Search by Material Code, Name, Batch/Package No., Packing List',
  'Mã Lô / Số Kiện': 'Batch / Package No.',
  'Mã lô / Số kiện': 'Batch / Package No.',
  'Kho hàng': 'Warehouse',
  'Tồn SL': 'Stock Qty',
  'Tồn KL (Kg)': 'Stock Wt (Kg)',
  'Tồn KL (kg)': 'Stock Wt (kg)',
  'Chọn': 'Select',
  'Không tìm thấy mặt hàng tồn kho nào phù hợp.': 'No matching stock items found.',
  'Bấm \'Chọn\' hoặc Nhấp đúp chuột để đưa ngay vào phiếu xuất':
    'Click "Select" or double-click to add directly to outbound issue',
  'Đưa ngay vào phiếu xuất và đóng hộp thoại': 'Add directly to outbound issue and close dialog',
  'Bỏ chọn tất cả vật tư trên trang này': 'Deselect all items on this page',
  'Chọn tất cả vật tư trên trang này': 'Select all items on this page',
  'Bỏ chọn các phiếu xuất trên trang này': 'Deselect outbound issues on this page',
  'Chọn tất cả các phiếu xuất trên trang này': 'Select all outbound issues on this page',
  'Xóa các phiếu xuất kho đã đánh dấu chọn': 'Delete selected outbound issues',
  'Chưa ghi tên': 'Unnamed',
  'Xem chi tiết phiếu xuất kho': 'View outbound issue details',
  'In Phiếu Xuất Kho (Mẫu QN-OPR-PR11-FM06)': 'Print Outbound Issue (Form QN-OPR-PR11-FM06)',
  'Xuất phiếu xuất kho ra Excel (.xlsx)': 'Export outbound issue to Excel (.xlsx)',
  'Sửa phiếu xuất kho (Admin)': 'Edit outbound issue (Admin)',
  'Sửa phiếu xuất kho này (Admin)': 'Edit this outbound issue (Admin)',
  'Xóa phiếu xuất kho': 'Delete outbound issue',
  'Xóa phiếu xuất kho này': 'Delete this outbound issue',
  'Xem & In Phiếu (FM06)': 'Preview & Print (FM06)',
  'Lưu Phiếu Xuất Kho': 'Save Outbound Issue',
  'Lưu Cập Nhật Phiếu Xuất Kho': 'Save Outbound Issue Changes',
  'Xác Nhận Xóa Phiếu Xuất Kho': 'Confirm Delete Outbound Issue',
  'Xác Nhận Xóa Nhiều Phiếu Xuất Kho': 'Confirm Delete Multiple Outbound Issues',
  'Xóa phiếu xuất kho sẽ tự động hoàn trả lại số lượng và khối lượng tồn kho cho các kiện hàng liên quan. Bạn có chắc chắn muốn xóa không?':
    'Deleting this outbound issue will automatically restore stock quantity and weight for the affected packages. Are you sure you want to delete it?',
  'Toàn bộ các phiếu xuất kho đã đánh dấu sẽ bị xóa vĩnh viễn và tự động hoàn trả lại số lượng, khối lượng tồn kho cho các mặt hàng liên quan trên toàn hệ thống.':
    'All selected outbound issues will be permanently deleted and their stock quantities and weights will be automatically restored system-wide.',
  'Chỉ tài khoản Quản trị viên (Admin) mới có quyền sửa phiếu xuất kho.':
    'Only Administrator (Admin) accounts can edit outbound issues.',
  'Chỉ tài khoản Quản trị viên (Admin) mới có quyền xóa phiếu xuất kho.':
    'Only Administrator (Admin) accounts can delete outbound issues.',
  'Số phiếu xuất không được để trống.': 'Outbound issue number is required.',
  'Vui lòng nhập họ tên Người nhận.': 'Please enter the Receiver name.',
  'Vui lòng chọn từ tồn kho hoặc thêm ít nhất một dòng vật tư xuất.':
    'Please select from available stock or add at least one outbound material line.',
  'Mặt hàng này hiện không còn tồn kho khả dụng!': 'This item currently has no available stock!',
  'Không có dữ liệu phiếu xuất kho để xuất ra Excel.': 'No outbound issue data to export to Excel.',
  'Không thể xuất file Excel danh sách phiếu xuất kho.': 'Unable to export outbound issues list to Excel.',
  'Không thể xuất file Excel. Vui lòng thử lại.': 'Unable to export Excel file. Please try again.',

  // ===== OS&D MANAGER =====
  'Quản Lý Vật Tư OSD': 'OS&D Discrepancies',
  'Quản Lý Vật Tư OSD (Overage - Shortage - Damage)': 'OS&D Material Management (Overage - Shortage - Damage)',
  'Biên Bản Bất Thường Hàng Hóa (OS&D)': 'Over, Short & Damaged Reports (OS&D)',
  'Lập biên bản hàng Thừa - Thiếu - Hư hỏng từ phiếu nhập kho, đính kèm biên bản PDF & theo dõi trạng thái Mở / Đóng':
    'Create Overage, Shortage & Damage reports from inbound receipts, attach signed PDF reports & track Open / Closed status',
  'Lập Phiếu OSD Mới': 'New OS&D Report',
  'Lập Biên Bản OSD Mới': 'Create New OS&D Report',
  'Xuất danh sách OSD ra file Excel': 'Export OS&D list to Excel file',
  'Thiết bị đang mất kết nối Internet (Ngoại tuyến)': 'Device is offline (No Internet connection)',
  'Chế độ lưu Offline': 'Offline Save Mode',
  'Đồng bộ dữ liệu OSD bị gián đoạn': 'OS&D data sync interrupted',
  'Thông báo': 'Notice',
  'Đã hiểu & Bỏ qua': 'Understood & Dismiss',
  'Tổng Phiếu OSD': 'Total OS&D Reports',
  'OSD Đang Mở': 'Open OS&D',
  'Chưa xong': 'Pending',
  'Biên bản đang xử lý': 'Reports in progress',
  'OSD Đã Đóng': 'Closed OS&D',
  'Hoàn thành': 'Completed',
  'Đã xử lý giải quyết': 'Resolved & closed',
  'Thừa (Overage)': 'Overage',
  'Mục hàng thừa': 'Overage items',
  'Thiếu (Shortage)': 'Shortage',
  'Mục hàng thiếu': 'Shortage items',
  'Hư Hỏng (Damage)': 'Damage',
  'Hư hỏng (Damage)': 'Damage',
  'Mục hàng hư hỏng': 'Damaged items',
  'Bộ Lọc & Tra Cứu Biên Bản OSD': 'OS&D Report Filter & Search',
  'Tìm kiếm tổng hợp': 'Combined Search',
  'Mã OSD, phiếu nhập, NCC, mã vật tư, số kiện...': 'OS&D No., Receipt No., Supplier, Material Code, Package No....',
  'Trạng thái xử lý': 'Resolution Status',
  'Phân loại OSD': 'OS&D Type',
  'Tất cả loại OSD': 'All OS&D Types',
  'Kho bãi tiếp nhận': 'Receiving Warehouse',
  'Click vào ô [Mở] hoặc [Đóng] để cập nhật trạng thái trực tiếp':
    'Click [Open] or [Closed] to update status directly',
  'MÃ BIÊN BẢN': 'REPORT NO.',
  'NGÀY LẬP': 'DATE',
  'PHIẾU NHẬP NGUỒN': 'SOURCE RECEIPT',
  'KHO TIẾP NHẬN': 'RECEIVING WAREHOUSE',
  'ĐƠN VỊ GIAO / NCC': 'DELIVERY / SUPPLIER',
  'VẬT TƯ BỊ ẢNH HƯỞNG': 'AFFECTED MATERIALS',
  'PHÂN LOẠI': 'CLASSIFICATION',
  'BIÊN BẢN PDF': 'PDF REPORT',
  'TRẠNG THÁI XỬ LÝ (TICK THỦ CÔNG)': 'RESOLUTION STATUS (MANUAL)',
  'THAO TÁC': 'ACTIONS',
  'Chưa có biên bản OSD nào khớp với bộ lọc. Hãy bấm "Lập Phiếu OSD Mới" để bắt đầu.':
    'No OS&D reports match your filters. Click "New OS&D Report" to get started.',
  'Hư hỏng': 'Damaged',
  'Thiếu': 'Shortage',
  'Thừa': 'Overage',
  'Thiếu hụt': 'Shortage',
  'Thừa hàng': 'Overage',
  'Sai quy cách': 'Wrong Spec',
  'Chưa đính kèm': 'Not attached',
  'Mở': 'Open',
  'Đóng': 'Close',
  'MỞ (Chưa xử lý)': 'OPEN (Pending)',
  'ĐÓNG (Đã xử lý)': 'CLOSED (Resolved)',
  'Mở (Chưa xử lý)': 'Open (Pending)',
  'Đóng (Đã xử lý)': 'Closed (Resolved)',
  'Khi chưa xử lý hoàn thành OSD': 'When OS&D resolution is still pending',
  'Khi đã xử lý hoàn thành OSD': 'When OS&D resolution is complete',
  'Tick chọn Mở khi chưa xử lý hoàn thành OSD': 'Mark Open when OS&D is still pending',
  'Tick chọn Đóng khi đã xử lý hoàn thành OSD': 'Mark Closed when OS&D is resolved',
  'Ghi nhận hàng hóa Thừa (Overage) - Thiếu (Shortage) - Hư hỏng (Damage) từ phiếu nhập kho':
    'Record Overage, Shortage & Damage items from inbound receipts',
  '1. Thông Tin Phiếu & Nguồn Nhập Kho': '1. Report Info & Source Inbound Receipt',
  'Mã phiếu OSD (*)': 'OS&D Report No. (*)',
  'Ngày lập OSD (*)': 'OS&D Date (*)',
  'Chọn Phiếu Nhập Kho Nguồn (*)': 'Select Source Inbound Receipt (*)',
  'Đơn vị giao / NCC': 'Delivery Unit / Supplier',
  'Đơn vị giao hàng / NCC': 'Delivery Unit / Supplier',
  'Số Packing List': 'Packing List No.',
  'Tự động từ phiếu nhập': 'Auto-filled from receipt',
  'Hãy chọn Phiếu nhập kho nguồn ở bước 1 để tải dữ liệu vật tư, hoặc bấm "Thêm dòng vật tư".':
    'Select a source inbound receipt in Step 1 to load materials, or click "Add Material Line".',
  'Loại OSD:': 'OS&D Type:',
  'Số kiện (Pkg No)': 'Package No.',
  'Tên kiện': 'Package Name',
  'SL theo phiếu nhập': 'Receipt Qty',
  'Số lượng OSD (*)': 'OS&D Qty (*)',
  'Số Lượng OSD': 'OS&D Quantity',
  'Khối lượng (kg)': 'Weight (kg)',
  'Khối Lượng (Kg)': 'Weight (Kg)',
  'Khối Lượng Ảnh Hưởng (kg)': 'Affected Weight (kg)',
  'Mô tả tình trạng lỗi / hư hỏng / chênh lệch (*)': 'Defect / Damage / Discrepancy Description (*)',
  'Nguyên nhân & Biện pháp xử lý': 'Root Cause & Corrective Action',
  'Biện Pháp Xử Lý': 'Corrective Action',
  'VD: Móp méo mặt bích, thiếu 2 bu lông, rách niêm phong...':
    'e.g., Dented flange, missing 2 bolts, broken seal...',
  'VD: Lập biên bản hiện trường với tài xế, yêu cầu NCC cấp bù...':
    'e.g., Signed site report with driver, requested supplier replacement...',
  '3. Đính Kèm Biên Bản OSD (File .PDF)': '3. Attach OS&D Report (.PDF File)',
  'Bấm hoặc kéo thả file biên bản (.pdf) vào đây': 'Click or drag & drop PDF report file here',
  'Hỗ trợ file PDF scan có chữ ký hiện trường, tối đa 25MB':
    'Supports scanned signed site PDF reports, up to 25MB',
  'Gỡ file đính kèm này': 'Remove this attachment',
  '4. Trạng Thái Xử Lý (Tick Thủ Công)': '4. Resolution Status (Manual Toggle)',
  'Chọn trạng thái xử lý cho biên bản OSD này:': 'Select the resolution status for this OS&D report:',
  'Ghi chú kết quả xử lý (khi đóng OSD hoặc cập nhật tiến độ)':
    'Resolution notes (when closing OS&D or updating progress)',
  'Ghi chú kết quả xử lý:': 'Resolution Notes:',
  'Ghi Chú Kết Quả Xử Lý': 'Resolution Notes',
  'VD: NCC đã bàn giao bù đủ 2 bu lông ngày 15/03, đã nghiệm thu xong.':
    'e.g., Supplier delivered 2 replacement bolts on Mar 15, inspected and accepted.',
  'Cập Nhật Biên Bản': 'Update Report',
  'Lưu Biên Bản OSD': 'Save OS&D Report',
  'Biên Bản Ghi Nhận Hàng Hóa Thừa - Thiếu - Hư Hỏng (OSD Report)':
    'Overage - Shortage - Damage Discrepancy Report (OS&D)',
  'BIÊN BẢN GHI NHẬN HÀNG HÓA THỪA - THIẾU - HƯ HỎNG':
    'OVERAGE - SHORTAGE - DAMAGE DISCREPANCY REPORT (OS&D)',
  'In biên bản': 'Print Report',
  'Số biên bản:': 'Report No.:',
  'Ngày lập:': 'Date:',
  'Trạng thái:': 'Status:',
  'Phiếu nhập kho liên kết': 'Linked Inbound Receipt',
  'Số Packing List / Shipment': 'Packing List / Shipment No.',
  'Danh Mục Vật Tư Thiết Bị Ghi Nhận Sự Cố OSD:': 'OS&D Discrepancy Materials & Equipment List:',
  'Số kiện': 'Package No.',
  'SL Nhập': 'Inbound Qty',
  'Phân loại': 'Type',
  'Mô tả tình trạng & Kiến nghị': 'Condition Description & Action',
  'ĐẠI DIỆN BÊN GIAO HÀNG': 'DELIVERY REPRESENTATIVE',
  '(Ký và ghi rõ họ tên)': '(Signature & Full Name)',
  'THỦ KHO TIẾP NHẬN': 'RECEIVING WAREHOUSE KEEPER',
  'NGƯỜI LẬP BIÊN BẢN': 'REPORT PREPARED BY',
  'Tải PDF về': 'Download PDF',
  'Trình duyệt không hỗ trợ hiển thị PDF trực tiếp trong khung này.':
    'Your browser does not support inline PDF preview.',
  'Tải file PDF về máy': 'Download PDF file',
  'Xem chi tiết biên bản hiện trường OSD': 'View OS&D field report details',
  'Chỉnh sửa biên bản OSD': 'Edit OS&D report',
  'Xóa biên bản OSD': 'Delete OS&D report',
  'Xóa dòng vật tư này': 'Delete this material line',
  'Xác Nhận Xóa Biên Bản OSD': 'Confirm Delete OS&D Report',
  'Xóa Vĩnh Viễn': 'Delete Permanently',
  'Biên bản chưa có nội dung PDF.': 'This report has no PDF content attached.',
  'Không thể tải file PDF từ đám mây. Vui lòng thử lại sau.':
    'Unable to load PDF file from cloud. Please try again later.',
  'Lỗi khi tải file PDF từ đám mây.': 'Error loading PDF file from cloud.',
  'Thiết bị đang ngắt kết nối mạng. Toàn bộ dữ liệu OSD đã được bảo toàn an toàn trên máy này và sẽ tự động đồng bộ khi có kết nối trở lại.':
    'Device is offline. All OS&D data is safely stored locally and will auto-sync once reconnected.',
  'Thiết bị đang ngắt kết nối mạng. Dữ liệu biên bản OSD được lưu an toàn tại máy và sẽ tự động đồng bộ khi có mạng.':
    'Device is offline. OS&D report data is saved locally and will auto-sync when online.',
  'Vui lòng chỉ đính kèm file biên bản định dạng .pdf': 'Please attach .pdf report files only.',
  'Kích thước file PDF không được vượt quá 25MB': 'PDF file size must not exceed 25MB.',
  'Không thể đọc file PDF. Vui lòng thử lại.': 'Unable to read PDF file. Please try again.',
  'Vui lòng nhập số biên bản OSD': 'Please enter the OS&D report number.',
  'Vui lòng chọn Phiếu nhập kho nguồn để liên kết vật tư':
    'Please select a source inbound receipt to link materials.',
  'Vui lòng khai báo ít nhất 1 dòng vật tư có Số lượng OSD > 0':
    'Please add at least 1 material line with OS&D Quantity > 0.',
  'Vật tư mới': 'New Material',
  'Quản trị viên': 'Administrator',

  // ===== INVENTORY REPORT =====
  'Báo Cáo Nhập - Xuất - Tồn Vật Tư Thiết Bị': 'Equipment & Material Inventory Report',
  'Báo Cáo Nhập-Xuất-Tồn': 'Inventory Reports',
  'Bộ Lọc Điều Kiện Chuyên Sâu': 'Advanced Filter Parameters',
  'Xuất Báo Cáo Ra Excel': 'Export Report to Excel',
  'Đặt lại bộ lọc': 'Reset Filters',
  'Tìm kiếm tổng hợp (mã vật tư, tên kiện, vị trí lưu kho/bãi, hạng mục, bản vẽ, packing list, shipment...)':
    'Combined search (material code, package name, storage location, category, drawing, packing list, shipment...)',
  'Tìm kiếm tổng hợp (mã vật tư, Package No., vị trí lưu kho/bãi, hạng mục, bản vẽ, packing list, shipment...)':
    'Combined search (material code, Package No., storage location, category, drawing, packing list, shipment...)',
  'Shipment / Vận đơn': 'Shipment / Bill of Lading',
  'Hạng mục dự án': 'Project Category',
  'Bản vẽ (DWG No)': 'Drawing (DWG No.)',
  'PACKAGE No. (Số kiện)': 'PACKAGE No.',
  'Tên kiện hàng': 'Package Name',
  'Đường ống, Kết cấu...': 'Piping, Steel Structure...',
  'Hòa Phát, Petro...': 'Supplier name...',
  'Kiện cụm van...': 'Valve skid package...',
  'Bãi A, Kệ B2...': 'Yard A, Rack B2...',
  'Tổng Nhập (SL / kg)': 'Total Inbound (Qty / kg)',
  'Phiếu nhập kho chuẩn': 'Standard inbound receipts',
  'Nhập Trả Kho (SL / kg)': 'Return to Stock (Qty / kg)',
  'Phiếu tick Nhập trả kho': 'Receipts marked Return to Stock',
  'Tổng Xuất Kho (SL / kg)': 'Total Outbound (Qty / kg)',
  'Phiếu xuất công trình': 'Site outbound issues',
  'Tái Xuất / Đ.Chuyển (SL / kg)': 'Transfer Out (Qty / kg)',
  'Phiếu tick Xuất điều chuyển': 'Issues marked Transfer Outbound',
  'TỒN KHO (SL)': 'STOCK ON HAND (QTY)',
  'Nhập + Trả - Xuất - Tái xuất': 'Inbound + Return - Outbound - Transfer',
  'TỒN KHO (kg)': 'STOCK ON HAND (KG)',
  'Tổng khối lượng tồn bãi': 'Total stock weight on hand',
  'Bảng Chi Tiết Nhập - Xuất - Tồn Sau Gộp': 'Consolidated Inventory Inbound-Outbound-Stock Table',
  'Tự động gộp theo Packing List, Shipment, Kiện hàng, Mã vật tư & Tên vật tư | Tồn = (Nhập + Nhập trả) - (Xuất + Tái xuất)':
    'Auto-consolidated by Packing List, Shipment, Package, Material Code & Name | Stock = (Inbound + Return) - (Outbound + Transfer)',
  'Tự động gộp theo Packing List, Shipment, Package No., Mã vật tư & Tên vật tư | Tồn = (Nhập + Nhập trả) - (Xuất + Tái xuất)':
    'Auto-consolidated by Packing List, Shipment, Package No., Material Code & Name | Stock = (Inbound + Return) - (Outbound + Transfer)',
  'PACKING LIST': 'PACKING LIST',
  'SHIPMENT': 'SHIPMENT',
  'KIỆN HÀNG': 'PACKAGE',
  'PACKAGE No.': 'PACKAGE No.',
  'MÃ VẬT TƯ': 'MATERIAL CODE',
  'VẬT TƯ THIẾT BỊ': 'MATERIALS & EQUIPMENT',
  'VỊ TRÍ LƯU KHO/BÃI': 'STORAGE LOCATION',
  'TỔNG NHẬP': 'TOTAL INBOUND',
  'NHẬP TRẢ KHO': 'RETURN TO STOCK',
  'TỔNG XUẤT': 'TOTAL OUTBOUND',
  'TÁI XUẤT': 'TRANSFER OUT',
  'TỒN SL': 'STOCK QTY',
  'TỒN KL (KG)': 'STOCK WT (KG)',
  'Không có bản ghi tồn kho nào khớp với các điều kiện lọc đã chọn.':
    'No inventory records match the selected filter criteria.',
  'Tổng Cộng Báo Cáo:': 'Report Grand Total:',
  'Ngày Cập Nhật': 'Last Updated',

  // ===== WAREHOUSE MANAGER =====
  'Quản Lý Kho Bãi': 'Warehouse Setup',
  'Quản Lý Danh Mục Kho Bãi': 'Warehouse Directory Management',
  'Quản lý hệ thống kho bãi lưu trữ vật tư, bãi cảng hàng nặng, diện tích & sức chứa':
    'Manage material warehouses, heavy cargo yards, storage area & weight capacity',
  'Thêm Kho Bãi Mới': 'Add New Warehouse',
  'Chỉnh Sửa Kho Bãi': 'Edit Warehouse',
  'Chỉ quyền Admin mới có thể thêm/sửa/xóa kho bãi': 'Only Admin can add/edit/delete warehouses',
  'Loại hình:': 'Type:',
  'Loại hình': 'Warehouse Type',
  'Loại:': 'Type:',
  'Kho kín tiêu chuẩn': 'Standard Covered Warehouse',
  'Bãi ngoài trời': 'Open Yard Storage',
  'Kho chuyên dụng / điều hòa': 'Specialized / AC Storage',
  'Kho chuyên dụng / Điều hòa': 'Specialized / AC Storage',
  'Kho kỹ thuật / Chuyên dụng': 'Technical / Specialized Storage',
  'Bãi trung chuyển': 'Transit Yard',
  'Diện tích mặt bằng:': 'Floor Area:',
  'Sức chứa tải trọng:': 'Weight Capacity:',
  'Thủ kho:': 'Keeper:',
  'Chỉ xem dữ liệu': 'View Only',
  'Mã kho (*)': 'Warehouse Code (*)',
  'Tên kho bãi (*)': 'Warehouse Name (*)',
  'Mã viết tắt số phiếu (VD: LP, LT)': 'Voucher Prefix Code (e.g., LP, LT)',
  'Ký hiệu phiếu:': 'Voucher Prefix:',
  'Địa điểm / Vị trí': 'Location / Address',
  'Địa điểm': 'Location',
  'Diện tích (m²)': 'Area (m²)',
  'Sức chứa (Tấn)': 'Capacity (Tons)',
  'Thủ kho phụ trách': 'Warehouse Keeper',
  'Trạng thái kho': 'Warehouse Status',
  'Đang hoạt động': 'Active',
  'Hoạt động': 'Active',
  'Đầy tải': 'Full Capacity',
  'Đã đầy hàng': 'Full Capacity',
  'Bảo trì': 'Maintenance',
  'Đang bảo trì / Nâng cấp': 'Under Maintenance / Upgrade',
  'Ghi chú thêm': 'Additional Notes',
  'Ghi chú về thiết bị nâng hạ, cầu trục, tiêu chuẩn PCCC...':
    'Notes on lifting gear, overhead cranes, fire safety standards...',
  'Lưu Kho Bãi Mới': 'Save New Warehouse',
  'Lưu Cập Nhật': 'Save Changes',
  'Chưa cập nhật địa chỉ': 'Address not updated',
  'ví dụ: KB-CATLAI-02': 'e.g., WH-CATLAI-02',
  'ví dụ: Kho SBQT Long Thành': 'e.g., Long Thanh Int. Airport Warehouse',
  'Địa chỉ, phân khu...': 'Address, zone...',
  'ví dụ: Võ Dương Phú': 'e.g., Keeper Full Name',
  'Mã kho và Tên kho bãi là bắt buộc.': 'Warehouse Code and Name are required.',
  'Tên kho bãi không được để trống.': 'Warehouse Name is required.',
  'Chưa có dữ liệu kho bãi tại thiết bị. Vui lòng bấm "Đồng Bộ Cloud" trên thanh tiêu đề để tải dữ liệu.':
    'No warehouse data on this device yet. Please click "Cloud Sync" in the top bar to load data.',
  'Tài khoản của bạn chưa được Admin phân quyền thao tác trên kho bãi nào.':
    'Your account has not been assigned to any warehouses by the Admin yet.',
  'Tài khoản của bạn chưa được phân quyền thao tác trên kho bãi nào.':
    'Your account is not authorized to manage any warehouses.',
  'Tài khoản của bạn chưa được phân quyền thao tác trên kho bãi này.':
    'Your account is not authorized to operate on this warehouse.',
  'Không tìm thấy kho bãi nào phù hợp điều kiện lọc.': 'No warehouses match the filter criteria.',
  'Xác Nhận Xóa Kho Bãi': 'Confirm Delete Warehouse',
  'Kho bãi này sẽ bị xóa khỏi danh sách. Bạn có chắc chắn muốn xóa không?':
    'This warehouse will be removed from the directory. Are you sure you want to delete it?',

  // ===== MATERIAL CATALOG =====
  'Danh Mục Vật Tư': 'Materials Catalog',
  'Danh Mục Vật Tư Thiết Bị': 'Equipment & Materials Catalog',
  'Quản Lý Danh Mục Vật Tư & Thiết Bị': 'Equipment & Materials Catalog Management',
  'Tự động đồng bộ thời gian thực từ Phiếu nhập kho & Phiếu xuất kho (trùng mã lấy dữ liệu mới nhất)':
    'Auto-synced in real time from Inbound & Outbound vouchers (duplicate codes keep latest record)',
  'Đồng Bộ Nhập/Xuất': 'Sync Inbound/Outbound',
  'Đồng bộ và cập nhật dữ liệu mới nhất từ toàn bộ Phiếu nhập kho và Phiếu xuất kho':
    'Sync and update latest material info from all Inbound Receipts and Outbound Issues',
  'Tải Mẫu Excel': 'Download Excel Template',
  'Tải tệp Excel mẫu để chuẩn bị dữ liệu nhập danh mục':
    'Download Excel template to prepare catalog import data',
  'Xuất Excel': 'Export Excel',
  'Xóa Toàn Bộ': 'Delete All',
  'Xóa toàn bộ vật tư trong danh mục': 'Delete all materials in the catalog',
  'Xóa các vật tư đã chọn theo checkbox': 'Delete checked materials',
  'Thêm Vật Tư Mới': 'Add New Material',
  'Thêm Vật Tư / Thiết Bị Mới': 'Add New Material / Equipment',
  'Quyền Admin quản lý': 'Admin Managed',
  'Hạng mục:': 'Category:',
  'Thao tác xóa sẽ loại bỏ các vật tư đã đánh dấu khỏi danh mục hệ thống.':
    'Deleting will permanently remove the checked materials from the system catalog.',
  'Mã & Tên Vật Tư Thiết Bị': 'Code & Equipment / Material Name',
  'Nhà Sản Xuất & Cung Cấp': 'Manufacturer & Supplier',
  'Khối Lượng ĐV (kg)': 'Unit Weight (kg)',
  'Khối lượng đơn vị (kg)': 'Unit Weight (kg)',
  'Khối Lượng Tiêu Chuẩn (kg)': 'Standard Weight (kg)',
  'Không có vật tư nào khớp với từ khóa tìm kiếm.': 'No materials match your search keyword.',
  'Chỉ xem': 'View Only',
  'Đơn vị tính (*)': 'Unit (*)',
  'Tên vật tư thiết bị (*)': 'Equipment / Material Name (*)',
  'Tên vật tư thiết bị': 'Equipment / Material Name',
  'Tên Vật Tư Thiết Bị': 'Equipment / Material Name',
  'Cảnh báo tồn tối thiểu': 'Min Stock Alert',
  'Quy cách kỹ thuật / Tiêu chuẩn': 'Technical Specification / Standard',
  'Quy cách kỹ thuật': 'Technical Specification',
  'Lưu Vật Tư Mới': 'Save New Material',
  'Chỉnh sửa vật tư': 'Edit material',
  'Xóa khỏi danh mục': 'Delete from catalog',
  'Bỏ chọn các dòng trên trang này': 'Deselect rows on this page',
  'Chọn tất cả các dòng trên trang này': 'Select all rows on this page',
  'Tìm theo mã VT, tên thiết bị, Package No., NSX, NCC...':
    'Search by Material Code, Name, Package No., Mfr, Supplier...',
  'Tìm theo mã VT, tên thiết bị, Package No., Bản vẽ, NSX, NCC...':
    'Search by Material Code, Name, Package No., DWG no., Mfr, Supplier...',
  'Bản vẽ (DWG No.)': 'DWG no.',
  'VD: DWG-PID-001...': 'e.g., DWG-PID-001...',
  'Bộ, Cái, Cây, Tủ, Tấn, Mét...': 'Set, Pcs, Length, Panel, Ton, Meter...',
  'ví dụ: Van cầu áp lực cao Class 600 DN200': 'e.g., High-Pressure Globe Valve Class 600 DN200',
  'Đường ống P&ID, Kết cấu thép, Điện...': 'P&ID Piping, Steel Structure, Electrical...',
  'ví dụ: PKG-01/15, BOX-03/08...': 'e.g., PKG-01/15, BOX-03/08...',
  'PetroSteel, Hòa Phát...': 'Manufacturer / Supplier...',
  'Vật liệu, tiêu chuẩn ASTM/ASME/JIS, kích thước...': 'Material grade, ASTM/ASME/JIS standard, dimensions...',
  'Tên vật tư không được để trống.': 'Material name is required.',
  'Mã vật tư và tên vật tư không được để trống.': 'Material code and name are required.',
  'Danh mục vật tư đã được đồng bộ đầy đủ với dữ liệu mới nhất từ Phiếu nhập & Phiếu xuất.':
    'Materials catalog is already up to date with all Inbound & Outbound vouchers.',
  'Đã xuất danh mục vật tư ra file Excel!': 'Exported materials catalog to Excel file!',
  'Xác Nhận Xóa Vật Tư Khỏi Danh Mục': 'Confirm Delete Material from Catalog',
  'Vật tư này sẽ bị xóa khỏi danh mục chính của hệ thống. Bạn có chắc chắn muốn xóa không?':
    'This material will be removed from the master catalog. Are you sure you want to delete it?',
  'Xác Nhận Xóa Các Vật Tư Đã Chọn': 'Confirm Delete Selected Materials',
  'Xác Nhận XÓA TOÀN BỘ Danh Mục Vật Tư': 'Confirm DELETE ALL Materials Catalog',
  'CẢNH BÁO NGUY HIỂM: Toàn bộ danh mục vật tư trong cơ sở dữ liệu sẽ bị xóa hoàn toàn. Bạn có chắc chắn muốn xóa tất cả không?':
    'DANGER WARNING: The entire materials catalog in the database will be permanently deleted. Are you sure you want to delete everything?',
  'Đồng bộ từ': 'Synced from',
  'Tự động tạo': 'Auto-generated',
  'Tự tạo nếu để trống': 'Auto-generated if blank',
  'Tự động tạo mã vật tư không trùng': 'Auto-generate unique material code',
  'Tự sinh mã': 'Auto code',
  'Tự sinh': 'Auto',
  'Tự sinh mã phiếu': 'Auto voucher code',
  'Mã có sẵn': 'Existing code',
  'Tự tạo': 'Auto-create',

  // ===== USER MANAGER =====
  'Người Sử Dụng': 'User Accounts',
  'Quản Trị Người Dùng & Phân Quyền': 'User Accounts & Permissions',
  'Quản Lý Tài Khoản Google & Phân Quyền': 'Google Accounts & Permissions Management',
  'Thêm Người Dùng': 'Add User',
  'Thêm Người Sử Dụng Mới': 'Add New User',
  'Thêm Tài Khoản Google': 'Add Google Account',
  'Thêm Tài Khoản Google Mới': 'Add New Google Account',
  'Trạng thái Cloud Firestore:': 'Cloud Firestore Status:',
  '. Mọi tài khoản tạo mới hoặc cập nhật phân quyền sẽ tự động đồng bộ tức thì sang tất cả thiết bị khác.':
    '. Any new account or permission update will automatically sync across all devices in real time.',
  'Hệ thống tự động kích hoạt kết nối Google Cloud Firestore. Dữ liệu tài khoản và kho bãi được bảo toàn tại thiết bị. Sử dụng nút “Đồng Bộ Cloud” trên thanh tiêu đề để đồng bộ phần thay đổi.':
    'Google Cloud Firestore sync is enabled automatically. Account and warehouse data are preserved locally. Use the "Cloud Sync" button in the top bar to sync changes.',
  'Tài khoản Google (Email)': 'Google Account (Email)',
  'Tài Khoản Google (Email)': 'Google Account (Email)',
  'Vai Trò': 'Role',
  'Vai trò': 'Role',
  'Vai trò:': 'Role:',
  'Vai trò phân quyền': 'Assigned Role',
  'Phân Quyền Kho Bãi': 'Warehouse Permissions',
  'Phân quyền thao tác kho bãi': 'Warehouse Operation Permissions',
  'Phòng Ban / Liên Hệ': 'Department / Contact',
  'Phòng ban': 'Department',
  'Phòng ban / Đơn vị': 'Department / Division',
  'Ban Quản Lý Kho Bãi': 'Warehouse Management Division',
  'Số điện thoại liên hệ': 'Contact Phone',
  'Trạng Thái': 'Status',
  'Thao Tác Quản Trị': 'Admin Actions',
  'Quản Trị Viên (Admin)': 'Administrator (Admin)',
  'Quản Lý Kho': 'Warehouse Manager',
  'Thủ Kho / Nhân Viên': 'Warehouse Keeper / Staff',
  'Thủ Kho / Nhân Viên Kho': 'Warehouse Keeper / Staff',
  'Chỉ Xem': 'Viewer Only',
  'Chỉ Xem Báo Cáo': 'Report Viewer Only',
  'ADMIN CHÍNH': 'PRIMARY ADMIN',
  'Chưa gắn Email Google (Bấm Sửa để cập nhật)': 'No Google Email linked (Click Edit to update)',
  'Toàn quyền tất cả kho': 'Full access to all warehouses',
  'Chưa phân quyền kho': 'No warehouse assigned',
  'Kích hoạt': 'Active',
  'Đã khóa': 'Locked',
  'Không tìm thấy người sử dụng nào phù hợp điều kiện tìm kiếm.':
    'No user accounts match your search criteria.',
  'Email Google đăng nhập (*)': 'Google Sign-In Email (*)',
  'Nhân sự dùng đúng địa chỉ Gmail này để bấm “Đăng nhập bằng tài khoản Google”.':
    'Staff members use this exact Gmail address to click "Sign in with Google Account".',
  'Họ và tên đầy đủ (*)': 'Full Name (*)',
  'Mã định danh nội bộ': 'Internal Identifier',
  'Tự động lấy theo Gmail nếu để trống': 'Auto-derived from Gmail if left blank',
  'Quản trị viên (Admin) có toàn quyền xem và thao tác trên tất cả kho bãi.':
    'Administrators (Admin) have full view and edit access to all warehouses.',
  'Chưa có danh mục kho bãi nào trong hệ thống.': 'No warehouses configured in the system yet.',
  'Chưa chọn kho nào: Người dùng sẽ chưa xem hoặc thao tác được dữ liệu kho cho đến khi được phân quyền.':
    'No warehouses selected: This user will not see or operate any warehouse data until assigned.',
  'Cho phép tài khoản Google này đăng nhập ngay lập tức': 'Allow this Google account to sign in immediately',
  'Cho phép tài khoản này đăng nhập hệ thống': 'Allow this account to sign in to the system',
  'Lưu & Cấp Quyền Google': 'Save & Grant Google Access',
  'Khóa quyền đăng nhập Google của tài khoản này': 'Lock Google sign-in for this account',
  'Mở khóa cho phép tài khoản này đăng nhập Google': 'Unlock Google sign-in for this account',
  'Chỉnh sửa thông tin & Phân quyền': 'Edit Info & Permissions',
  'Xóa người sử dụng': 'Delete user',
  'ví dụ: nhanvienkho@gmail.com': 'e.g., warehouse.staff@gmail.com',
  'ví dụ: Lê Văn Hải': 'e.g., Staff Full Name',
  'Vui lòng nhập địa chỉ Email Google hợp lệ (ví dụ: nhanvien@gmail.com).':
    'Please enter a valid Google Email address (e.g., staff@gmail.com).',
  'Vui lòng nhập họ và tên đầy đủ của người sử dụng.': 'Please enter the user\'s full name.',
  'Họ và tên người sử dụng không được để trống.': 'User full name is required.',
  'Vui lòng nhập Email Google hợp lệ để người dùng đăng nhập.':
    'Please enter a valid Google Email for sign-in.',
  'Không thể khóa tài khoản Quản trị viên chính voduongphu@gmail.com!':
    'Cannot lock the primary Administrator account (voduongphu@gmail.com)!',
  'Không thể xóa tài khoản Quản trị viên chính Võ Dương Phú!':
    'Cannot delete the primary Administrator account!',
  'Đã xóa và cập nhật đồng bộ lên Cloud Firestore thành công.':
    'Deleted and synced to Cloud Firestore successfully.',
  'Không thể xóa tài khoản này.': 'Unable to delete this account.',
  'Lỗi khi tạo người dùng': 'Error creating user account',
  'Lỗi kết nối Cloud Firestore': 'Cloud Firestore connection error',
  'Xác Nhận Xóa Tài Khoản Google': 'Confirm Delete Google Account',
  'Tài khoản này sẽ bị xóa khỏi danh sách phân quyền của hệ thống. Bạn có chắc chắn muốn xóa không?':
    'This account will be removed from the system\'s authorized user list. Are you sure you want to delete it?',
  'Lịch Sử Đăng Nhập': 'Login History',
  'Lịch Sử Đăng Nhập Hệ Thống': 'System Login History',
  'Lịch Sử Đăng Nhập Tất Cả Người Dùng': 'All Users Login History',
  'Chỉ Quản trị viên (Admin) được phép theo dõi thời gian, tài khoản và thiết bị đăng nhập hệ thống.':
    'Only Administrators (Admin) can view login timestamps, accounts, and devices across the system.',
  'Tổng Lượt Đăng Nhập': 'Total Logins',
  'Tài Khoản Đã Đăng Nhập': 'Signed-In Accounts',
  'Đăng Nhập Gần Nhất (GMT+7)': 'Latest Sign-In (GMT+7)',
  'Tìm kiếm nhanh': 'Quick Search',
  'Họ tên, email, mã định danh, thiết bị...': 'Full name, email, username, device...',
  'Người sử dụng': 'User',
  'Tất cả người dùng': 'All Users',
  'Tất cả vai trò': 'All Roles',
  'Thời Gian (GMT+7)': 'Time (GMT+7)',
  'Email Google': 'Google Email',
  'Thiết Bị / Trình Duyệt': 'Device / Browser',
  'Trạng Thái Phiên': 'Session Status',
  'Chuyển phiên thiết bị': 'Switched Device Session',
  'Đăng nhập thành công': 'Signed In Successfully',
  'Đang tải lịch sử đăng nhập từ Cloud Firestore...': 'Loading login history from Cloud Firestore...',
  'Chưa có bản ghi lịch sử đăng nhập nào phù hợp với bộ lọc hiện tại.':
    'No login history entries match the current filters.',
  'lượt đăng nhập': 'login records',
  'Làm mới': 'Refresh',

  // ===== AI MATERIAL CODE GENERATOR =====
  'AI Tạo mã': 'AI Generate Code',
  'AI Tạo Mã': 'AI Generate Codes',
  'AI đang tạo mã...': 'AI generating codes...',
  'AI đang phân tích tạo mã...': 'AI analyzing & generating code...',
  'AI đang tạo mã vật tư...': 'AI generating material code...',
  'AI tự tạo khi nhập tên': 'Auto-generated by AI from name',
  'Tự tạo bằng AI khi nhập tên': 'Auto-generated by AI when entering name',
  '8–20 ký tự (A-Z, 0-9, "-")': '8-20 chars (A-Z, 0-9, "-")',
  'AI đang phân tích tên vật tư để đề xuất mã chuẩn...':
    'AI is analyzing the material name to suggest a standard code...',
  'Phân tích AI để tạo mã vật tư thông minh (8–20 ký tự)':
    'Use AI analysis to generate a smart material code (8-20 chars)',
  'Phân tích AI tạo mã vật tư thông minh (8–20 ký tự, không bắt buộc VT)':
    'Use AI analysis to generate a smart material code (8-20 chars, VT prefix optional)',
  'Dùng AI phân tích tên vật tư để tự động tạo mã (8–20 ký tự) cho các dòng đang trống mã':
    'Use AI to analyze material names and auto-generate codes (8-20 chars) for blank code rows',
  'Vui lòng nhập Tên vật tư trước khi dùng AI tạo mã.':
    'Please enter the Material Name before generating a code with AI.',
  'Vui lòng nhập Tên vật tư ở dòng này trước khi dùng AI tạo mã.':
    'Please enter the Material Name on this row before generating a code with AI.',
  'Tất cả dòng vật tư có tên đều đã có Mã vật tư.':
    'All named material rows already have a Material Code.',

  // ===== EXCEL IMPORT MODAL =====
  '1. Tải lên file Excel': '1. Upload Excel File',
  'Chế độ xử lý mã vật tư trùng:': 'Duplicate material code handling:',
  'Cập nhật thông tin mới nhất nếu trùng mã (Khuyên dùng)':
    'Update with latest info on duplicate code (Recommended)',
  'Chỉ thêm mới (Bỏ qua nếu mã đã có)': 'Add new only (Skip existing codes)',
  'Tự động nhận diện từ cột "Kho" trong file Excel': 'Auto-detect from "Warehouse" column in Excel',
  '(Hệ thống ưu tiên tên kho ghi trong file Excel)': '(System prioritizes warehouse names inside Excel)',
  'Hỗ trợ định dạng Microsoft Excel (.xlsx, .xls) hoặc tệp CSV (UTF-8) — Tối ưu hóa dữ liệu lớn trên 100.000 dòng':
    'Supports Microsoft Excel (.xlsx, .xls) or CSV (UTF-8) — Optimized for 100,000+ rows',
  'Các trường dữ liệu chuẩn được hệ thống tự động bóc tách & phân loại:':
    'Standard fields automatically parsed & classified by the system:',
  '• Mã vật tư / Thiết bị (*)': '• Material / Equipment Code (*)',
  '• Tên vật tư thiết bị (*)': '• Material / Equipment Name (*)',
  'Van cầu áp lực cao, Thép dầm...': 'High-pressure valve, Steel beam...',
  '• Đơn vị tính (*)': '• Unit (*)',
  'Bộ, Cái, Cây, Mét, Tủ, Tấn': 'Set, Pcs, Length, Meter, Panel, Ton',
  '• Hạng mục': '• Category',
  'Đường ống, Kết cấu, Điện...': 'Piping, Structure, Electrical...',
  '• Nhà sản xuất (NSX)': '• Manufacturer (Mfr)',
  '• Nhà cung cấp (NCC)': '• Supplier',
  '• Khối lượng & Tồn tối thiểu': '• Weight & Min Stock',
  'Khối lượng kg, Tồn tối thiểu': 'Weight (kg), Min Stock',
  '• Ngày & Kho (*)': '• Date & Warehouse (*)',
  'Bộ phận, Đơn vị/Nhà thầu...': 'Department, Unit/Contractor...',
  '• Mã vật tư & Tên vật tư (*)': '• Material Code & Name (*)',
  'VT-PIPE-01, Ống thép đúc...': 'VT-PIPE-01, Seamless steel pipe...',
  '• Mã lô / Package No.': '• Batch / Package No.',
  '• Bản vẽ (DWG no.)': '• DWG no.',
  '• Số lượng, ĐVT & KL (Kg) (*)': '• Quantity, Unit & Weight (Kg) (*)',
  'Số lượng (cây/tấm), ĐVT, Kg': 'Quantity (pcs/sheets), Unit, Kg',
  '• Vị trí lưu kho/bãi': '• Storage Location',
  'Bãi A - Khu 01, Kho K1 - Kệ B2...': 'Yard A - Zone 01, Warehouse K1 - Rack B2...',
  'Lưu ý phát hiện khi đọc file:': 'Warnings detected while parsing file:',
  'Nhận diện': 'Detected',
  '. Hệ thống sẽ tự động tạo': '. The system will automatically create',
  'File chưa có cột Số phiếu. Hệ thống sẽ': 'No Voucher No. column found. The system will',
  'tự động sinh mã phiếu': 'auto-generate voucher codes',
  'theo kho và Packing List cho từng nhóm mặt hàng.': 'by warehouse and Packing List for each item group.',
  'Tổng khối lượng:': 'Total Weight:',
  'Đã chuẩn bị sẵn sàng để nhập vào Danh mục vật tư & thiết bị':
    'Ready to import into the Equipment & Materials Catalog',
  'Bộ phận & Chứng từ': 'Department & Documents',
  'Mã vật tư & Tên vật tư': 'Material Code & Name',
  'SL (cây/tấm)': 'Qty (pcs/sheets)',
  'Xem trước kết quả': 'Preview Results',
  'Chọn file khác': 'Choose Another File',
  'Không tìm thấy dữ liệu hợp lệ trong file Excel.': 'No valid data found in the Excel file.',
  'Kho mặc định': 'Default Warehouse',
  'Import Danh Mục Vật Tư & Thiết Bị Từ File Excel': 'Import Equipment & Materials Catalog from Excel',
  'Import Dữ Liệu Nhập Kho Từ File Excel': 'Import Inbound Data from Excel',
  'Import Dữ Liệu Xuất Kho Từ File Excel': 'Import Outbound Data from Excel',
  'Tự động bóc tách Mã VT, Tên vật tư thiết bị, ĐVT, Package No., Hạng mục, NSX, NCC, Khối lượng tiêu chuẩn, Quy cách & Tồn tối thiểu':
    'Auto-extracts Material Code, Name, Unit, Package No., Category, Mfr, Supplier, Std Weight, Spec & Min Stock',
  'Tự động nhận diện Mã phiếu, Ngày nhập, Kho tiếp nhận, Packing List, Shipment, Package No., NSX, NCC, Bản vẽ, Khối lượng & Số lượng':
    'Auto-detects Receipt No., Date, Receiving Warehouse, Packing List, Shipment, Package No., Mfr, Supplier, Drawing, Weight & Qty',
  'Tự động nhận diện Mã phiếu, Ngày xuất, Dự án, Đơn vị nhận, Kho xuất, Packing List, Shipment, Package No., Vật tư & Khối lượng':
    'Auto-detects Issue No., Date, Project, Receiving Unit, Issuing Warehouse, Packing List, Shipment, Package No., Material & Weight',
  'Kho tiếp nhận áp dụng:': 'Target Receiving Warehouse:',
  'Kho xuất hàng áp dụng:': 'Target Issuing Warehouse:',
  'Nhấp để chọn file Excel hoặc kéo thả vào đây': 'Click to select an Excel file or drag & drop here',
  'Đang đọc và giải nén cấu trúc file Excel...': 'Reading and parsing Excel file structure...',
  'Số phiếu PNK (*)': 'Inbound Receipt No. (*)',
  'Số phiếu PXK (*)': 'Outbound Issue No. (*)',
  'Mẫu QN-OPR-PR11-FM05.01': 'Form QN-OPR-PR11-FM05.01',
  'Mẫu QN-OPR-PR11-FM06': 'Form QN-OPR-PR11-FM06',
  'Hợp đồng & Đề xuất số': 'Contract & Proposal No.',
  'Đơn vị/Tổ/Nhóm & Số PYC/PĐX': 'Unit/Team & Request No.',
  'HĐ-2026-01, ĐX-VT-008': 'CON-2026-01, REQ-008',
  'Tổ Lắp máy, PYC-015': 'Mechanical Team, REQ-015',
  'Xóa dòng này': 'Delete this row',
  'Danh mục vật tư': 'Materials Catalog',
  'Nhập kho': 'Inbound',
  'Xuất kho': 'Outbound',

  // ===== CHANGE PASSWORD MODAL =====
  'Đổi Mật Khẩu Cá Nhân': 'Change Personal Password',
  'Mật khẩu hiện tại': 'Current Password',
  'Mật khẩu mới': 'New Password',
  'Xác nhận mật khẩu mới': 'Confirm New Password',
  'Nhập lại mật khẩu mới': 'Re-enter new password',

  // ===== RECEIPT PRINT MODAL =====
  'Xem Trước & In Phiếu Nhập Kho': 'Preview & Print Inbound Receipt',
  'Xem Trước & In Phiếu Xuất Kho': 'Preview & Print Outbound Issue',
  'Hiệu chỉnh thông tin in': 'Customize Print Info',
  'Xuất phiếu này ra file Excel (.xlsx)': 'Export this voucher to Excel (.xlsx)',
  'In Phiếu (A4)': 'Print Voucher (A4)',
  'Bộ phận (để trống sẽ in "BỘ PHẬN:")': 'Department (leave blank to print "DEPARTMENT:")',
  'Ví dụ: PHÒNG KỸ THUẬT / DỰ ÁN...': 'e.g., TECHNICAL / PROJECT DEPT...',
  'Số dòng trống bổ sung cuối bảng': 'Extra blank rows at end of table',
  'Viết bằng chữ': 'Amount in Words',
  'PHIẾU NHẬP KHO': 'INBOUND RECEIPT',
  'PHIẾU XUẤT KHO': 'OUTBOUND ISSUE',
  'SỐ PHIẾU:': 'VOUCHER NO.:',
  'BỘ PHẬN:': 'DEPARTMENT:',
  'Nhấp để chọn / bỏ chọn Nhập mới': 'Click to toggle New Inbound',
  'Nhấp để chọn / bỏ chọn Nhập trả kho': 'Click to toggle Return to Stock',
  'Nhấp để chọn / bỏ chọn Phiếu xuất kho': 'Click to toggle Outbound Issue',
  'Nhấp để chọn / bỏ chọn Phiếu xuất điều chuyển': 'Click to toggle Transfer Outbound',
  'Viết bằng chữ : ': 'Amount in words: ',
  'Số chứng từ gốc kèm theo: ': 'Attached original documents: ',
  'Note: Cột số lượng (cây/tấm), mã lô, chiều rộng, chiều dài chỉ áp dụng đối với vật tư chính.':
    'Note: Quantity (pcs/sheets), batch no., width, and length columns apply only to primary materials.',
  'Thủ kho/NV QLVT': 'Warehouse Keeper / Material Staff',
  'Thủ kho': 'Warehouse Keeper',
  'Phê duyệt': 'Approved By',
  '(Ký, ghi rõ họ tên)': '(Signature & Full Name)',

  // ===== COMMON TABLE / FORM / PAGINATION / DELETE TERMS =====
  '1. Thông Tin Phiếu & Người Nhận': '1. Issue Info & Receiver',
  '2. Danh Sách Vật Tư Thiết Bị': '2. Equipment & Material Items',
  'Danh Sách Vật Tư Chi Tiết': 'Detailed Materials List',
  'Số phiếu nhập': 'Inbound Receipt No.',
  'Số phiếu xuất': 'Outbound Issue No.',
  'Ngày lập phiếu': 'Voucher Date',
  'Kho tiếp nhận': 'Receiving Warehouse',
  'Kho xuất hàng': 'Issuing Warehouse',
  'Người giao hàng': 'Deliverer',
  'Người nhận hàng': 'Receiver',
  'Đơn vị giao': 'Delivery Unit',
  'Đơn vị giao hàng': 'Delivery Unit',
  'Đơn vị giao hàng:': 'Delivery Unit:',
  'Đơn vị nhận': 'Receiving Unit',
  'Bộ phận yêu cầu': 'Requesting Department',
  'Số hợp đồng': 'Contract No.',
  'Số PYC / PĐX': 'Request / Proposal No.',
  'Loại phiếu nhập': 'Inbound Type',
  'Hàng nhập mới': 'New Inbound Cargo',
  'Hàng nhập trả kho': 'Return to Stock',
  'Xuất công trường': 'Issue to Construction Site',
  'Chọn Từ Tồn Kho Hiện Tại': 'Select from Current Stock',
  '"Chọn Từ Tồn Kho Hiện Tại"': '"Select from Current Stock"',
  'Thêm Dòng Thủ Công': 'Add Manual Line',
  '"Thêm Dòng Thủ Công"': '"Add Manual Line"',
  'Thêm dòng vật tư': 'Add Material Line',
  '+ Chọn': '+ Select',
  'Đã chọn': 'Selected',
  'Đã chọn tất cả': 'All Selected',
  'Bỏ chọn': 'Deselect',
  'Chọn tất cả': 'Select All',
  'Xóa Đã Chọn': 'Delete Selected',
  'Xem': 'View',
  'In': 'Print',
  'Sửa': 'Edit',
  'Xóa': 'Delete',
  'Hủy': 'Cancel',
  'Hủy Bỏ': 'Cancel',
  'Hủy bỏ': 'Cancel',
  'Lưu': 'Save',
  'Lưu Thay Đổi': 'Save Changes',
  'Cập Nhật': 'Update',
  'Xác Nhận Xóa': 'Confirm Deletion',
  'Hành động này không thể hoàn tác': 'This action cannot be undone',
  'STT': 'No.',
  'ĐVT': 'Unit',
  'Ghi chú': 'Notes',
  'Ghi Chú': 'Notes',
  'Ghi chú:': 'Notes:',
  'Ghi chú...': 'Notes...',
  'Mã lô': 'Batch No.',
  'Mã Lô': 'Batch No.',
  'Mã vật tư': 'Material Code',
  'Mã Vật Tư': 'Material Code',
  'Mã vật tư (*)': 'Material Code (*)',
  'Tên vật tư': 'Material Name',
  'Tên Vật Tư': 'Material Name',
  'Tên vật tư (*)': 'Material Name (*)',
  'Tên vật tư & Quy cách': 'Material Name & Spec',
  'Quy Cách & Ghi Chú': 'Specification & Notes',
  'Hạng Mục': 'Category',
  'Hạng mục': 'Category',
  'Hạng mục lắp đặt': 'Installation Category',
  'Số lượng': 'Quantity',
  'Số Lượng': 'Quantity',
  'Số lượng (cây/tấm)': 'Quantity (pcs/sheets)',
  'Khối lượng': 'Weight',
  'Khối Lượng': 'Weight',
  'Khối lượng (Kg)': 'Weight (Kg)',
  'Đơn giá': 'Unit Price',
  'Đơn giá (VNĐ)': 'Unit Price (VND)',
  'Thành tiền': 'Amount',
  'Thành tiền (VNĐ)': 'Amount (VND)',
  'Thành Tiền (VNĐ)': 'Amount (VND)',
  'Đơn giá, Thành tiền & Ghi chú': 'Unit Price, Amount & Notes',
  'Hiển thị': 'Showing',
  'Tổng': 'Total',
  'Dòng/trang:': 'Rows/page:',
  'Trang đầu': 'First page',
  'Trang trước': 'Previous page',
  'Trang tiếp': 'Next page',
  'Trang cuối': 'Last page',
  'dòng': 'rows',
  'dòng vật tư': 'material rows',
  'mục': 'items',
  'mục hàng': 'items',
  'mặt hàng': 'items',
  'mặt hàng tồn': 'stock items',
  'kho': 'warehouses',
  'kho bãi': 'warehouses',
  'kho bãi lưu trữ': 'this storage warehouse',
  'phiếu': 'vouchers',
  'phiếu nhập': 'inbound receipts',
  'phiếu xuất': 'outbound issues',
  'phiếu nhập kho': 'this inbound receipt',
  'phiếu xuất kho': 'this outbound issue',
  'danh sách phiếu nhập kho': 'these selected inbound receipts',
  'danh sách phiếu xuất kho': 'these selected outbound issues',
  'biên bản OSD': 'OS&D reports',
  'bản ghi tồn kho': 'inventory records',
  'vật tư': 'materials',
  'vật tư thiết bị': 'this material item',
  'vật tư trong danh mục': 'catalog materials',
  'các vật tư đã chọn': 'the selected materials',
  'toàn bộ danh mục vật tư': 'the entire materials catalog',
  'tài khoản người sử dụng': 'this user account',
  'trang': 'page',

  // ===== SPLIT SHORT LABELS & ADDITIONAL SYSTEM PHRASES =====
  'Ngày:': 'Date:',
  'Kho:': 'Warehouse:',
  'Kiện:': 'Pkg:',
  'Kiện/Lô:': 'Pkg/Batch:',
  'KL đơn vị:': 'Unit Wt:',
  'NSX:': 'Mfr:',
  'NCC:': 'Supplier:',
  'ĐVT:': 'Unit:',
  'KN:': 'Action:',
  'Quy cách:': 'Spec:',
  'HĐ:': 'Contract:',
  'ĐX:': 'Req:',
  'PYC/PĐX:': 'Req No.:',
  'Bản vẽ:': 'Drawing:',
  'Vị trí:': 'Location:',
  'Tổng SL:': 'Total Qty:',
  'Mã nội bộ:': 'Internal ID:',
  'Ngày tạo:': 'Created:',
  'Xác nhận bởi:': 'Confirmed by:',
  'Sắp xếp:': 'Sort:',
  'Chọn nhiều mục': 'Multi-Select',
  'Đang cập nhật': 'Updating',
  'Đã có trong phiếu nhập:': 'Already in inbound receipt:',
  'Đã chọn trong phiếu xuất:': 'Selected in outbound issue:',
  'Đang chọn vật tư cho': 'Selecting material for',
  'Hết hạn mức Cloud Firestore trong ngày': 'Daily Cloud Firestore Quota Exceeded',
  'Tải File Excel Mẫu (Danh mục vật tư)': 'Download Sample Excel (Materials Catalog)',
  'Tải File Excel Mẫu (Nhập kho)': 'Download Sample Excel (Inbound)',
  'Tải File Excel Mẫu (Xuất kho)': 'Download Sample Excel (Outbound)',
  'số phiếu trong file:': 'voucher numbers in file:',
  'phiếu nhập kho tương ứng.': 'corresponding inbound receipts.',
  'phiếu xuất kho tương ứng.': 'corresponding outbound issues.',
  'Bạn có chắc chắn muốn xóa biên bản OSD số': 'Are you sure you want to delete OS&D report no.',
  'Phiếu nhập kho nguồn': 'Source Inbound Receipt',
  'Tổng số lượng:': 'Total Quantity:',
  'Tổng số lượng xuất:': 'Total Outbound Quantity:',
  'Tổng khối lượng xuất:': 'Total Outbound Weight:',
  'Xem PDF': 'View PDF',
  'Bãi A, Khu 01...': 'Yard A, Zone 01...',
  'Kho Bãi': 'Warehouses',
  'Nhập Kho': 'Inbound',
  'Xuất Kho': 'Outbound'
};

export interface SystemUiPatternRule {
  pattern: RegExp;
  replace: (...args: string[]) => string;
}

/**
 * Ordered dynamic pattern rules for interpolated system UI strings.
 * Preserves ALL user-entered values (names, codes, locations, notes, emails, filenames) verbatim!
 */
export const SYSTEM_UI_PATTERN_RULES_EN: SystemUiPatternRule[] = [
  // Pagination & counts
  {
    pattern: /^Trang\s+([0-9.,]+)\s*\/\s*([0-9.,]+)$/i,
    replace: (_, p, t) => `Page ${p}/${t}`
  },
  {
    pattern: /^([0-9.,]+)\s+kết quả lọc$/i,
    replace: (_, n) => `${n} filtered results`
  },
  {
    pattern: /^Đã chọn\s+([0-9.,]+)\s*\/\s*([0-9.,]+)\s+phiếu nhập kho$/i,
    replace: (_, a, b) => `Selected ${a} / ${b} inbound receipts`
  },
  {
    pattern: /^Đã chọn\s+([0-9.,]+)\s*\/\s*([0-9.,]+)\s+phiếu xuất kho$/i,
    replace: (_, a, b) => `Selected ${a} / ${b} outbound issues`
  },
  {
    pattern: /^Đã chọn\s+([0-9.,]+)\s*\/\s*([0-9.,]+)\s+vật tư$/i,
    replace: (_, a, b) => `Selected ${a} / ${b} materials`
  },
  {
    pattern: /^Đã chọn\s+([0-9.,]+)\s*\/\s*([0-9.,]+)\s+kho bãi được phép thao tác\.?$/i,
    replace: (_, a, b) => `Selected ${a}/${b} authorized warehouses.`
  },
  {
    pattern: /^Đã chọn\s+([0-9.,]+)\s+vật tư$/i,
    replace: (_, n) => `Selected ${n} materials`
  },
  {
    pattern: /^Xóa\s+([0-9.,]+)\s+mục đã chọn$/i,
    replace: (_, n) => `Delete ${n} Selected`
  },
  {
    pattern: /^Xóa\s+([0-9.,]+)\s+phiếu đã chọn$/i,
    replace: (_, n) => `Delete ${n} Selected`
  },
  {
    pattern: /^Chọn hết\s+([0-9.,]+)\s+kết quả lọc$/i,
    replace: (_, n) => `Select all ${n} filtered`
  },
  {
    pattern: /^Chọn kết quả lọc\s*\(([0-9.,]+)\)$/i,
    replace: (_, n) => `Select filtered (${n})`
  },
  {
    pattern: /^Chọn tất cả\s*\(([0-9.,]+)\)$/i,
    replace: (_, n) => `Select all (${n})`
  },
  {
    pattern: /^Chọn toàn bộ\s*\(([0-9.,]+)\)$/i,
    replace: (_, n) => `Select all (${n})`
  },
  {
    pattern: /^Bỏ chọn\s*\(([0-9.,]+)\)$/i,
    replace: (_, n) => `Deselect (${n})`
  },
  {
    pattern: /^Xong\s*\(([0-9.,]+)\s+mục\)$/i,
    replace: (_, n) => `Done (${n} items)`
  },
  {
    pattern: /^Tất cả kho được phép\s*\(([0-9.,]+)\)$/i,
    replace: (_, n) => `All authorized warehouses (${n})`
  },
  {
    pattern: /^Chọn Nhiều Từ Danh Mục\s*\(([0-9.,]+)\)$/i,
    replace: (_, n) => `Select Multiple from Catalog (${n})`
  },
  {
    pattern: /^Có sẵn\s+([0-9.,]+)\s+vật tư\s*·\s*Chọn để tự điền vào dòng nhập kho$/i,
    replace: (_, n) => `${n} materials available · Click to auto-fill inbound line`
  },
  {
    pattern: /^Tích chọn nhanh một hoặc nhiều vật tư từ\s+([0-9.,]+)\s+danh mục có sẵn để đưa vào phiếu nhập kho$/i,
    replace: (_, n) => `Quickly select one or more materials from ${n} catalog entries to add to the inbound receipt`
  },
  {
    pattern: /^TỔNG CỘNG:\s*([0-9.,]+)\s+mục hàng$/i,
    replace: (_, n) => `TOTAL: ${n} items`
  },
  {
    pattern: /^\(([0-9.,]+)\s+mục hàng\)$/i,
    replace: (_, n) => `(${n} items)`
  },
  {
    pattern: /^([0-9.,]+)\s+mục hàng$/i,
    replace: (_, n) => `${n} items`
  },
  {
    pattern: /^Phiếu nhập có\s+([0-9.,]+)\s+mục hàng$/i,
    replace: (_, n) => `Receipt has ${n} items`
  },
  {
    pattern: /^([0-9.,]+)\s+mục vật tư\s*\(SL:\s*([0-9.,]+)\)$/i,
    replace: (_, n, qty) => `${n} material lines (Qty: ${qty})`
  },
  {
    pattern: /^([0-9.,]+)\s+vật tư ảnh hưởng$/i,
    replace: (_, n) => `${n} affected items`
  },
  {
    pattern: /^Tổng cộng:\s*([0-9.,]+)\s+dòng vật tư OSD$/i,
    replace: (_, n) => `Total: ${n} OS&D material lines`
  },
  {
    pattern: /^([0-9.,]+)\s+dòng vật tư OSD$/i,
    replace: (_, n) => `${n} OS&D material lines`
  },
  {
    pattern: /^Danh Sách Biên Bản OSD\s*\(([0-9.,]+)\s+biên bản\)$/i,
    replace: (_, n) => `OS&D Reports List (${n} reports)`
  },
  {
    pattern: /^Bảng Chi Tiết Nhập - Xuất - Tồn Sau Gộp\s*\(([0-9.,]+)\s+vật tư gộp\)$/i,
    replace: (_, n) => `Consolidated Inventory Inbound-Outbound-Stock Table (${n} grouped items)`
  },
  {
    pattern: /^Chi Tiết Vật Tư Nhập Kho\s*\(([0-9.,]+)\s+mục hàng\)$/i,
    replace: (_, n) => `Inbound Material Details (${n} items)`
  },
  {
    pattern: /^Chi Tiết Vật Tư Xuất Kho\s*\(([0-9.,]+)\s+mục hàng\)$/i,
    replace: (_, n) => `Outbound Material Details (${n} items)`
  },
  {
    pattern: /^2\.\s*Chi Tiết Vật Tư OSD\s*\(([0-9.,]+)\s+dòng\)$/i,
    replace: (_, n) => `2. OS&D Material Details (${n} lines)`
  },
  {
    pattern: /^Gợi ý tồn kho khả dụng\s*\(([0-9.,]+)\s+kết quả\)$/i,
    replace: (_, n) => `Available stock suggestions (${n} results)`
  },
  {
    pattern: /^\+([0-9.,]+)\s+kho khác$/i,
    replace: (_, n) => `+${n} more warehouses`
  },
  {
    pattern: /^Các hạng mục khác\s*\(([0-9.,]+)\)$/i,
    replace: (_, n) => `Other categories (${n})`
  },
  {
    pattern: /^Tự tạo\s+([0-9.,]+)\s+phiếu$/i,
    replace: (_, n) => `Auto-create ${n} vouchers`
  },
  {
    pattern: /^Xem trước dữ liệu bóc tách\s*\(([0-9.,]+)\s+mặt hàng\)$/i,
    replace: (_, n) => `Preview parsed data (${n} items)`
  },
  {
    pattern: /^Đang lưu\s+([0-9.,]+)\s+dòng\.\.\.$/i,
    replace: (_, n) => `Saving ${n} rows...`
  },
  {
    pattern: /^Xác Nhận Import\s*\(([0-9.,]+)\s+mặt hàng\)$/i,
    replace: (_, n) => `Confirm Import (${n} items)`
  },
  {
    pattern: /^Đang bóc tách dòng\s+([0-9.,]+)\s*\/\s*([0-9.,]+)\.\.\.$/i,
    replace: (_, a, b) => `Parsing row ${a} / ${b}...`
  },
  {
    pattern: /^\.\.\.\s*\(\+([0-9.,]+)\s+phiếu khác\)$/i,
    replace: (_, n) => `... (+${n} more vouchers)`
  },
  {
    pattern: /^([0-9.,]+)\s*KB\s*-\s*Đã đính kèm$/i,
    replace: (_, kb) => `${kb} KB - Attached`
  },
  {
    pattern: /^([0-9.,]+)\s*KB\s*-\s*Biên bản scan đính kèm$/i,
    replace: (_, kb) => `${kb} KB - Scanned report attached`
  },
  {
    pattern: /^([0-9.,]+)\s+vật tư được chọn bằng checkbox$/i,
    replace: (_, n) => `${n} checked materials`
  },
  {
    pattern: /^Toàn bộ\s+([0-9.,]+)\s+vật tư & thiết bị trong hệ thống$/i,
    replace: (_, n) => `All ${n} materials & equipment in the system`
  },
  {
    pattern: /^CẢNH BÁO: Bạn đang thực hiện xóa\s+([0-9.,]+)\s+vật tư khỏi danh mục hệ thống\. Thao tác này không thể hoàn tác\.$/i,
    replace: (_, n) => `WARNING: You are about to delete ${n} materials from the system catalog. This action cannot be undone.`
  },
  {
    pattern: /^([0-9.,]+)\s+phiếu nhập đã chọn\s*\((.+)\)$/i,
    replace: (_, n, rest) =>
      `${n} selected inbound receipts (${rest.replace(
        /\s+và\s+([0-9.,]+)\s+phiếu nhập khác$/i,
        ' and $1 more inbound receipts'
      )})`
  },
  {
    pattern: /^([0-9.,]+)\s+phiếu xuất đã chọn\s*\((.+)\)$/i,
    replace: (_, n, rest) =>
      `${n} selected outbound issues (${rest.replace(
        /\s+và\s+([0-9.,]+)\s+phiếu xuất khác$/i,
        ' and $1 more outbound issues'
      )})`
  },
  {
    pattern: /^Phiếu\s+(.+?)\s*\((.+)\)$/i,
    replace: (_, code, rest) => `Voucher ${code} (${rest})`
  },
  {
    pattern: /^(.+?)\s+và\s+([0-9.,]+)\s+phiếu nhập khác$/i,
    replace: (_, codes, n) => `${codes} and ${n} more inbound receipts`
  },
  {
    pattern: /^(.+?)\s+và\s+([0-9.,]+)\s+phiếu xuất khác$/i,
    replace: (_, codes, n) => `${codes} and ${n} more outbound issues`
  },

  // Modal titles & dynamic headers (preserve dynamic code/name verbatim)
  {
    pattern: /^Xem Trước & In Phiếu Nhập Kho\s+(.+)$/i,
    replace: (_, code) => `Preview & Print Inbound Receipt ${code}`
  },
  {
    pattern: /^Xem Trước & In Phiếu Xuất Kho\s+(.+)$/i,
    replace: (_, code) => `Preview & Print Outbound Issue ${code}`
  },
  {
    pattern: /^Chỉnh Sửa Phiếu Nhập Kho:\s*(.+?)\s*\(Mẫu QN-OPR-PR11-FM05\.01\)$/i,
    replace: (_, code) => `Edit Inbound Receipt: ${code} (Form QN-OPR-PR11-FM05.01)`
  },
  {
    pattern: /^Chỉnh Sửa Phiếu Xuất Kho:\s*(.+?)\s*\(Mẫu QN-OPR-PR11-FM06\)$/i,
    replace: (_, code) => `Edit Outbound Issue: ${code} (Form QN-OPR-PR11-FM06)`
  },
  {
    pattern: /^Chỉnh Sửa Phiếu Nhập Kho:\s*(.+)$/i,
    replace: (_, code) => `Edit Inbound Receipt: ${code}`
  },
  {
    pattern: /^Chỉnh Sửa Phiếu Xuất Kho:\s*(.+)$/i,
    replace: (_, code) => `Edit Outbound Issue: ${code}`
  },
  {
    pattern: /^Chi Tiết Phiếu Nhập Kho:\s*(.+)$/i,
    replace: (_, code) => `Inbound Receipt Details: ${code}`
  },
  {
    pattern: /^Chi Tiết Phiếu Xuất Kho:\s*(.+)$/i,
    replace: (_, code) => `Outbound Issue Details: ${code}`
  },
  {
    pattern: /^Chỉnh Sửa Biên Bản OSD:\s*(.+)$/i,
    replace: (_, code) => `Edit OS&D Report: ${code}`
  },
  {
    pattern: /^Chi Tiết Biên Bản OSD:\s*(.+)$/i,
    replace: (_, code) => `OS&D Report Details: ${code}`
  },
  {
    pattern: /^Xác Nhận Xóa Biên Bản OSD:\s*(.+)$/i,
    replace: (_, code) => `Confirm Delete OS&D Report: ${code}`
  },
  {
    pattern: /^Chọn Vật Tư Từ Danh Mục Cho Dòng Số\s+([0-9.,]+)$/i,
    replace: (_, n) => `Select Material from Catalog for Row #${n}`
  },
  {
    pattern: /^Sửa Vật Tư:\s*(.+)$/i,
    replace: (_, code) => `Edit Material: ${code}`
  },
  {
    pattern: /^Sửa Kho Bãi:\s*(.+)$/i,
    replace: (_, code) => `Edit Warehouse: ${code}`
  },
  {
    pattern: /^Phân Quyền Tài Khoản:\s*(.+)$/i,
    replace: (_, name) => `Account Permissions: ${name}`
  },
  {
    pattern: /^Phiếu Nhập Kho:\s*(.+)$/i,
    replace: (_, code) => `Inbound Receipt: ${code}`
  },
  {
    pattern: /^Phiếu Xuất Kho:\s*(.+)$/i,
    replace: (_, code) => `Outbound Issue: ${code}`
  },
  {
    pattern: /^BỘ PHẬN:\s*(.+)$/i,
    replace: (_, dept) => `DEPARTMENT: ${dept}`
  },
  {
    pattern: /^Ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})$/i,
    replace: (_, d, m, y) => `Date: ${d}/${m}/${y}`
  },

  // Dynamic prefixes & badges (keep user-entered value intact!)
  {
    pattern: /^Ký hiệu phiếu:\s*(.+)$/i,
    replace: (_, v) => `Voucher Prefix: ${v}`
  },
  {
    pattern: /^Tự động:\s*(.+)$/i,
    replace: (_, v) => `Auto: ${v}`
  },
  {
    pattern: /^Vị trí lưu kho\/bãi:\s*(.+)$/i,
    replace: (_, v) => `Storage Location: ${v}`
  },
  {
    pattern: /^Vị trí:\s*(.+)$/i,
    replace: (_, v) => `Location: ${v}`
  },
  {
    pattern: /^Bản vẽ:\s*(.+)$/i,
    replace: (_, v) => `Drawing: ${v}`
  },
  {
    pattern: /^HĐ:\s*(.+)$/i,
    replace: (_, v) => `Contract: ${v}`
  },
  {
    pattern: /^ĐX:\s*(.+)$/i,
    replace: (_, v) => `Req: ${v}`
  },
  {
    pattern: /^PYC\/PĐX:\s*(.+)$/i,
    replace: (_, v) => `Req No.: ${v}`
  },
  {
    pattern: /^·\s*Kiện\/Lô:\s*(.+)$/i,
    replace: (_, v) => `· Pkg/Batch: ${v}`
  },
  {
    pattern: /^·\s*KL đơn vị:\s*(.+)$/i,
    replace: (_, v) => `· Unit Wt: ${v}`
  },
  {
    pattern: /^(.+?)\s*\(mặc định\)$/i,
    replace: (_, name) => `${name} (default)`
  },
  {
    pattern: /^Mã nội bộ:\s*(@\S+)\s*•\s*Ngày tạo:\s*(.+)$/i,
    replace: (_, code, date) => `Internal ID: ${code} • Created: ${date}`
  },
  {
    pattern: /^Mã nội bộ:\s*(.+)$/i,
    replace: (_, code) => `Internal ID: ${code}`
  },

  // Row / checkbox tooltips & aria-labels
  {
    pattern: /^Xóa dòng vật tư\s+([0-9.,]+)$/i,
    replace: (_, n) => `Delete material row ${n}`
  },
  {
    pattern: /^Chọn vật tư từ Danh mục cho dòng\s+([0-9.,]+)$/i,
    replace: (_, n) => `Select material from Catalog for row ${n}`
  },
  {
    pattern: /^Chọn phiếu nhập\s+(.+)$/i,
    replace: (_, code) => `Select inbound receipt ${code}`
  },
  {
    pattern: /^Chọn phiếu xuất\s+(.+)$/i,
    replace: (_, code) => `Select outbound issue ${code}`
  },
  {
    pattern: /^Chọn vật tư\s+(.+)$/i,
    replace: (_, code) => `Select material ${code}`
  },
  {
    pattern: /^Bỏ chọn vật tư\s+(.+)$/i,
    replace: (_, code) => `Deselect material ${code}`
  },
  {
    pattern: /^Chọn xuất kho vật tư\s+(.+)$/i,
    replace: (_, code) => `Select material ${code} for outbound`
  },
  {
    pattern: /^Chọn nhập kho vật tư\s+(.+)$/i,
    replace: (_, code) => `Select material ${code} for inbound`
  },

  // Validation, toast, status & cloud sync notifications
  {
    pattern: /^Dòng số\s+([0-9.,]+):\s*Vui lòng nhập Tên vật tư\.?$/i,
    replace: (_, n) => `Row #${n}: Please enter Material Name.`
  },
  {
    pattern: /^Dòng số\s+([0-9.,]+):\s*Số lượng và Khối lượng(?: xuất)? không được là số âm\.?$/i,
    replace: (_, n) => `Row #${n}: Quantity and Weight cannot be negative.`
  },
  {
    pattern: /^Dòng số\s+([0-9.,]+):\s*Vui lòng nhập Số lượng(?: xuất)?\s*\(> 0\)\s*hoặc Khối lượng\s*\(> 0\)\.?$/i,
    replace: (_, n) => `Row #${n}: Please enter Quantity (> 0) or Weight (> 0).`
  },
  {
    pattern: /^Số phiếu\s+"(.+?)"\s+đã tồn tại trong hệ thống\. Vui lòng nhập số phiếu khác\.?$/i,
    replace: (_, code) => `Voucher No. "${code}" already exists. Please enter a different number.`
  },
  {
    pattern: /^Mã kho\s+"(.+?)"\s+đã tồn tại\. Vui lòng chọn mã khác\.?$/i,
    replace: (_, code) => `Warehouse code "${code}" already exists. Please choose another code.`
  },
  {
    pattern: /^Mã vật tư\s+"(.+?)"\s+đã tồn tại\. Vui lòng đặt mã khác hoặc để trống để hệ thống tự tạo\.?$/i,
    replace: (_, code) => `Material code "${code}" already exists. Enter another code or leave blank to auto-generate.`
  },
  {
    pattern: /^Email Google\s+"(.+?)"\s+đã được gán cho tài khoản\s+"(.+?)"\.?$/i,
    replace: (_, email, name) => `Google Email "${email}" is already assigned to "${name}".`
  },
  {
    pattern: /^Email Google\s+"(.+?)"\s+đã thuộc về người dùng\s+"(.+?)"\.?$/i,
    replace: (_, email, name) => `Google Email "${email}" already belongs to user "${name}".`
  },
  {
    pattern: /^Đã tạo tài khoản Google\s+"(.+?)"\s*\((.+?)\)\. Đang đồng bộ lên Cloud Firestore\.\.\.$/i,
    replace: (_, email, name) => `Created Google account "${email}" (${name}). Syncing to Cloud Firestore...`
  },
  {
    pattern: /^Đã cấp quyền và đồng bộ tài khoản\s+"(.+?)"\s+lên Cloud Firestore thành công!$/i,
    replace: (_, email) => `Authorized and synced account "${email}" to Cloud Firestore successfully!`
  },
  {
    pattern: /^Đã cập nhật phân quyền cho\s+"(.+?)"\. Đang đồng bộ Cloud\.\.\.$/i,
    replace: (_, name) => `Updated permissions for "${name}". Syncing to Cloud...`
  },
  {
    pattern: /^Đã đồng bộ cập nhật tài khoản\s+"(.+?)"\s+lên Cloud Firestore thành công!$/i,
    replace: (_, email) => `Synced updates for "${email}" to Cloud Firestore successfully!`
  },
  {
    pattern: /^Đã mở khóa cho phép\s+"(.+?)"\s+đăng nhập Google\.?$/i,
    replace: (_, name) => `Unlocked Google sign-in for "${name}".`
  },
  {
    pattern: /^Đã khóa quyền đăng nhập của\s+"(.+?)"\.?$/i,
    replace: (_, name) => `Locked sign-in access for "${name}".`
  },
  {
    pattern: /^Đã xóa tài khoản\s+"(.+?)"\s*\((.+?)\)\. Đang đồng bộ Cloud\.\.\.$/i,
    replace: (_, name, email) => `Deleted account "${name}" (${email}). Syncing to Cloud...`
  },
  {
    pattern: /^Đã thêm kho bãi\s+"(.+?)"\s+thành công!$/i,
    replace: (_, name) => `Added warehouse "${name}" successfully!`
  },
  {
    pattern: /^Đã cập nhật kho bãi\s+"(.+?)"\.?$/i,
    replace: (_, name) => `Updated warehouse "${name}".`
  },
  {
    pattern: /^Đã xóa kho bãi\s+"(.+?)"\s+thành công!$/i,
    replace: (_, name) => `Deleted warehouse "${name}" successfully!`
  },
  {
    pattern: /^Đã thêm vật tư\s+"(.+?)"\s+vào danh mục thành công!$/i,
    replace: (_, name) => `Added material "${name}" to catalog successfully!`
  },
  {
    pattern: /^Đã cập nhật vật tư\s+"(.+?)"\.?$/i,
    replace: (_, name) => `Updated material "${name}".`
  },
  {
    pattern: /^Đã xóa vật tư\s+"(.+?)"\s+thành công!$/i,
    replace: (_, name) => `Deleted material "${name}" successfully!`
  },
  {
    pattern: /^Đã xóa thành công\s+([0-9.,]+)\s+vật tư đã chọn khỏi danh mục!$/i,
    replace: (_, n) => `Successfully deleted ${n} selected materials from catalog!`
  },
  {
    pattern: /^Đã xóa toàn bộ\s+([0-9.,]+)\s+vật tư trong danh mục thành công!$/i,
    replace: (_, n) => `Successfully deleted all ${n} materials from catalog!`
  },
  {
    pattern: /^Đã đồng bộ Danh mục vật tư từ Phiếu nhập & Phiếu xuất\s*\(Thêm mới:\s*([0-9.,]+),\s*Cập nhật mới nhất:\s*([0-9.,]+)\)!$/i,
    replace: (_, a, u) => `Synced Materials Catalog from Inbound & Outbound vouchers (Added: ${a}, Updated: ${u})!`
  },
  {
    pattern: /^Đã import thành công danh mục vật tư! Thêm mới:\s*([0-9.,]+),\s*Cập nhật:\s*([0-9.,]+)\s+vật tư\.?$/i,
    replace: (_, a, u) => `Successfully imported materials catalog! Added: ${a}, Updated: ${u} materials.`
  },
  {
    pattern: /^Đã xuất file Excel cho phiếu nhập\s+"(.+?)"!$/i,
    replace: (_, code) => `Exported Excel file for inbound receipt "${code}"!`
  },
  {
    pattern: /^Đã xuất file Excel cho phiếu xuất\s+"(.+?)"!$/i,
    replace: (_, code) => `Exported Excel file for outbound issue "${code}"!`
  },
  {
    pattern: /^Đã export\s+([0-9.,]+)\s+phiếu nhập kho\s*\(([0-9.,]+)\s+dòng vật tư\)\s+ra file Excel!$/i,
    replace: (_, r, i) => `Exported ${r} inbound receipts (${i} material lines) to Excel!`
  },
  {
    pattern: /^Đã export\s+([0-9.,]+)\s+phiếu xuất kho\s*\(([0-9.,]+)\s+dòng vật tư\)\s+ra file Excel!$/i,
    replace: (_, r, i) => `Exported ${r} outbound issues (${i} material lines) to Excel!`
  },
  {
    pattern: /^Đã import thành công\s+([0-9.,]+)\s+phiếu nhập kho\s*\(([0-9.,]+)\s+mục hàng\)!$/i,
    replace: (_, r, i) => `Successfully imported ${r} inbound receipts (${i} items)!`
  },
  {
    pattern: /^Đã import thành công\s+([0-9.,]+)\s+phiếu xuất kho\s*\(([0-9.,]+)\s+mục hàng\)!$/i,
    replace: (_, r, i) => `Successfully imported ${r} outbound issues (${i} items)!`
  },
  {
    pattern: /^Đã cập nhật phiếu nhập kho\s+"(.+?)"\s+thành công!$/i,
    replace: (_, code) => `Updated inbound receipt "${code}" successfully!`
  },
  {
    pattern: /^Đã lập phiếu nhập kho\s+"(.+?)"\s+thành công!$/i,
    replace: (_, code) => `Created inbound receipt "${code}" successfully!`
  },
  {
    pattern: /^Đã xóa phiếu nhập\s+"(.+?)"\s+thành công!$/i,
    replace: (_, code) => `Deleted inbound receipt "${code}" successfully!`
  },
  {
    pattern: /^Đã xóa thành công\s+([0-9.,]+)\s+phiếu nhập kho đã chọn!$/i,
    replace: (_, n) => `Successfully deleted ${n} selected inbound receipts!`
  },
  {
    pattern: /^Đã cập nhật phiếu xuất kho\s+"(.+?)"\s+thành công!$/i,
    replace: (_, code) => `Updated outbound issue "${code}" successfully!`
  },
  {
    pattern: /^Đã lập phiếu xuất kho\s+"(.+?)"\s+thành công!$/i,
    replace: (_, code) => `Created outbound issue "${code}" successfully!`
  },
  {
    pattern: /^Đã xóa phiếu xuất\s+"(.+?)"\s+thành công!$/i,
    replace: (_, code) => `Deleted outbound issue "${code}" successfully!`
  },
  {
    pattern: /^Đã xóa thành công\s+([0-9.,]+)\s+phiếu xuất kho đã chọn!$/i,
    replace: (_, n) => `Successfully deleted ${n} selected outbound issues!`
  },
  {
    pattern: /^Đã cập nhật\s+([0-9.,]+)\s+mục vào phiếu xuất kho!$/i,
    replace: (_, n) => `Updated ${n} items in the outbound issue!`
  },
  {
    pattern: /^Đã thêm dòng xuất mới cho\s+"(.+?)"!$/i,
    replace: (_, label) => `Added new outbound line for "${label}"!`
  },
  {
    pattern: /^Đã thêm\s+"(.+?)"\s+vào phiếu xuất kho!$/i,
    replace: (_, label) => `Added "${label}" to the outbound issue!`
  },
  {
    pattern: /^Đã áp dụng vị trí\s+"(.+?)"\s+cho tất cả dòng vật tư\.?$/i,
    replace: (_, loc) => `Applied storage location "${loc}" to all material rows.`
  },
  {
    pattern: /^Không tìm thấy vật tư nào trong tồn kho khớp với từ khóa\s+"(.+?)"\.?$/i,
    replace: (_, q) => `No stock items match "${q}".`
  },
  {
    pattern: /^Bạn không có quyền import phiếu nhập vào kho\s+"(.+?)"\. Vui lòng kiểm tra lại file Excel hoặc liên hệ Admin\.?$/i,
    replace: (_, wh) => `You are not authorized to import inbound receipts into warehouse "${wh}". Check your Excel file or contact Admin.`
  },
  {
    pattern: /^Bạn không có quyền import phiếu xuất cho kho\s+"(.+?)"\. Vui lòng kiểm tra lại file Excel hoặc liên hệ Admin\.?$/i,
    replace: (_, wh) => `You are not authorized to import outbound issues for warehouse "${wh}". Check your Excel file or contact Admin.`
  },
  {
    pattern: /^Đã chuyển trạng thái biên bản thành\s+"(Mở|Đóng)"!$/i,
    replace: (_, st) => `Updated report status to "${st === 'Mở' ? 'Open' : 'Closed'}"!`
  },
  {
    pattern: /^Đã chuyển trạng thái sang\s+"(Mở|Đóng)"\s*\(Lưu cục bộ, sẽ tự đồng bộ khi có mạng\)$/i,
    replace: (_, st) => `Updated status to "${st === 'Mở' ? 'Open' : 'Closed'}" (Saved locally, will auto-sync when online)`
  },
  {
    pattern: /^Đã cập nhật biên bản OSD\s+"(.+?)"\s+thành công!$/i,
    replace: (_, code) => `Updated OS&D report "${code}" successfully!`
  },
  {
    pattern: /^Đã lập biên bản OSD\s+"(.+?)"\s+thành công!$/i,
    replace: (_, code) => `Created OS&D report "${code}" successfully!`
  },
  {
    pattern: /^Đã cập nhật OSD\s+"(.+?)"\s*\(Lưu cục bộ an toàn, sẽ tự đồng bộ khi có Internet\)$/i,
    replace: (_, code) => `Updated OS&D "${code}" (Saved locally, will auto-sync when online)`
  },
  {
    pattern: /^Đã lập biên bản OSD\s+"(.+?)"\s*\(Lưu cục bộ an toàn, sẽ tự đồng bộ khi có Internet\)$/i,
    replace: (_, code) => `Created OS&D report "${code}" (Saved locally, will auto-sync when online)`
  },
  {
    pattern: /^Đã xóa biên bản OSD\s+"(.+?)"\s*\(Lưu cục bộ, sẽ tự đồng bộ khi có mạng\)$/i,
    replace: (_, code) => `Deleted OS&D report "${code}" (Saved locally, will auto-sync when online)`
  },
  {
    pattern: /^Đã xóa biên bản OSD\s+"(.+?)"$/i,
    replace: (_, code) => `Deleted OS&D report "${code}"`
  },
  {
    pattern: /^Đồng bộ OSD bị gián đoạn:\s*(.+?)\.\s*Dữ liệu trên máy vẫn an toàn\.?$/i,
    replace: (_, err) => `OS&D sync interrupted: ${err}. Local device data remains safe.`
  },
  {
    pattern: /^Lỗi đồng bộ:\s*(.+)$/i,
    replace: (_, err) => `Sync error: ${err}`
  },
  {
    pattern: /^Lỗi:\s*(.+)$/i,
    replace: (_, err) => `Error: ${err}`
  },
  {
    pattern: /^Đã xác thực tài khoản Google\s*\((.+?)\)\s*thành công!$/i,
    replace: (_, email) => `Authenticated Google account (${email}) successfully!`
  },
  {
    pattern: /^Đã yêu cầu đăng xuất thành công phiên đang mở trên\s+"(.+?)"\s+và chuyển sang thiết bị hiện tại\.?$/i,
    replace: (_, dev) => `Successfully logged out the active session on "${dev}" and switched to this device.`
  },
  {
    pattern: /^Hệ thống vừa nhận được yêu cầu đăng xuất từ xa(.*?)\. Phiên làm việc trên thiết bị này đã được tự động kết thúc để đảm bảo chỉ 1 thiết bị được hoạt động\.?$/i,
    replace: (_, dev) => `A remote sign-out request was received${dev ? dev.replace(/từ thiết bị/i, 'from device') : ''}. This session was automatically ended to enforce single-device access.`
  },
  {
    pattern: /^Phát hiện tài khoản Google đang được chuyển phiên đăng nhập sang thiết bị mới(.*?)\. Hệ thống đã tự động đăng xuất khỏi thiết bị hiện tại để đảm bảo an toàn dữ liệu\.?$/i,
    replace: (_, dev) => `Your Google account was signed in on a new device${dev ? dev.replace(/từ thiết bị/i, 'from device') : ''}. This device was automatically signed out to protect data integrity.`
  },

  // Additional dynamic patterns discovered across components
  {
    pattern: /^Đã import thành công\s+([0-9.,]+)\s+phiếu nhập kho\s*\(([0-9.,]+)\s+mục hàng\)!\s*Tự động cập nhật\s+([0-9.,]+)\s+vật tư mới\.?$/i,
    replace: (_, r, i, m) => `Successfully imported ${r} inbound receipts (${i} items)! Automatically added ${m} new materials.`
  },
  {
    pattern: /^Có sẵn\s+([0-9.,]+)\s+vật tư\s*·\s*Chọn để tự điền Mã VT, Tên VT, ĐVT, Mã lô & Khối lượng$/i,
    replace: (_, n) => `${n} materials available · Click to auto-fill Code, Name, Unit, Batch & Weight`
  },
  {
    pattern: /^Không tìm thấy vật tư khớp từ khóa\s+"(.+?)"\.\s*Bạn có thể nhập thủ công ở bảng dưới\.?$/i,
    replace: (_, q) => `No materials match "${q}". You can enter items manually in the table below.`
  },
  {
    pattern: /^Gợi ý tồn kho khả dụng\s*\(([0-9.,]+)\s+kết quả\s+cho\s+"(.+?)"\)$/i,
    replace: (_, n, q) => `Available stock suggestions (${n} results for "${q}")`
  },
  {
    pattern: /^\(([0-9.,]+)\s*\/\s*([0-9.,]+)\s+danh mục đang hiển thị\)$/i,
    replace: (_, a, b) => `(${a}/${b} catalog items shown)`
  },
  {
    pattern: /^\(([0-9.,]+)\s*\/\s*([0-9.,]+)\s+mục khả dụng đang hiển thị\)$/i,
    replace: (_, a, b) => `(${a}/${b} available items shown)`
  },
  {
    pattern: /^Kho:\s*(.+?)\s*\(Đang chọn\)$/i,
    replace: (_, wh) => `Warehouse: ${wh} (Selected)`
  },
  {
    pattern: /^Kho:\s*(.+)$/i,
    replace: (_, wh) => `Warehouse: ${wh}`
  },
  {
    pattern: /^Xem PDF:\s*(.+)$/i,
    replace: (_, file) => `View PDF: ${file}`
  },
  {
    pattern: /^Đã kết nối\s*\((.+?)\)$/i,
    replace: (_, email) => `Connected (${email})`
  },
  {
    pattern: /^Tài khoản đã lưu tại máy\.\s*(.+)$/i,
    replace: (_, msg) => `Account saved locally. ${msg}`
  },
  {
    pattern: /^Chỉ những tài khoản Google mail được Admin\s*\((.+?)\)\s*khai báo và phân quyền tại đây mới được phép đăng nhập vào hệ thống\.?$/i,
    replace: (_, email) => `Only Google Mail accounts registered and authorized here by Admin (${email}) are allowed to sign in.`
  },
  {
    pattern: /^Chỉ Admin\s*\((.+?)\)\s*mới có quyền thêm\/sửa\/khóa người dùng$/i,
    replace: (_, email) => `Only Admin (${email}) can add, edit, or lock users`
  },
  {
    pattern: /^--\s*Bấm để chọn Phiếu Nhập Kho\s*\(([0-9.,]+)\s+phiếu\)\s*--$/i,
    replace: (_, n) => `-- Click to select Inbound Receipt (${n} receipts) --`
  },
  {
    pattern: /^([0-9.,]+)\s+Tấn$/i,
    replace: (_, n) => `${n} Tons`
  },
  {
    pattern: /^2\.\s*Kiểm tra dữ liệu\s*\(([0-9.,]+)\s+mặt hàng\)$/i,
    replace: (_, n) => `2. Review Data (${n} items)`
  },
  {
    pattern: /^\(gồm\s+([0-9.,]+)\s+mục vật tư ảnh hưởng\)\?$/i,
    replace: (_, n) => `(including ${n} affected material items)?`
  },
  {
    pattern: /^Dòng số\s+([0-9.,]+)$/i,
    replace: (_, n) => `Row #${n}`
  },
  {
    pattern: /^Đang Mở\s*\(([0-9.,]+)\)$/i,
    replace: (_, n) => `Open (${n})`
  },
  {
    pattern: /^Đã Đóng\s*\(([0-9.,]+)\)$/i,
    replace: (_, n) => `Closed (${n})`
  },
  {
    pattern: /^Tất cả\s*\(([0-9.,]+)\)$/i,
    replace: (_, n) => `All (${n})`
  },
  {
    pattern: /^Tất cả kho\s*\(([0-9.,]+)\)$/i,
    replace: (_, n) => `All Warehouses (${n})`
  },
  {
    pattern: /^Tất cả kho bãi\s*\(([0-9.,]+)\)$/i,
    replace: (_, n) => `All Warehouses (${n})`
  },
  {
    pattern: /^Tất cả kho xuất\s*\(([0-9.,]+)\)$/i,
    replace: (_, n) => `All Issuing Warehouses (${n})`
  },
  {
    pattern: /^Tất cả hạng mục\s*\(([0-9.,]+)\)$/i,
    replace: (_, n) => `All Categories (${n})`
  },
  {
    pattern: /^Tất cả vai trò\s*\(([0-9.,]+)\)$/i,
    replace: (_, n) => `All Roles (${n})`
  },
  {
    pattern: /^Xác nhận bởi:\s*(.+)$/i,
    replace: (_, v) => `Confirmed by: ${v}`
  },
  {
    pattern: /^Đã thêm\s+([0-9.,]+)\s+vật tư vào phiếu nhập kho!$/i,
    replace: (_, n) => `Added ${n} materials to the inbound receipt!`
  },
  {
    pattern: /^Đã bỏ\s+([0-9.,]+)\s+vật tư khỏi phiếu nhập kho\.?$/i,
    replace: (_, n) => `Removed ${n} materials from the inbound receipt.`
  },
  {
    pattern: /^Đã chọn\s+([0-9.,]+)\s+vật tư vào phiếu xuất kho!$/i,
    replace: (_, n) => `Selected ${n} materials for the outbound issue!`
  },
  {
    pattern: /^Đã dán\s+([0-9.,]+)\s+dòng từ Excel(?:\s*\((.+)\))?\.$/i,
    replace: (_, count, details) => {
      if (!details) return `Pasted ${count} rows from Excel.`;
      const enParts: string[] = [];
      const addedMatch = String(details).match(/tự động thêm\s+([0-9.,]+)\s+dòng mới/i);
      if (addedMatch) enParts.push(`auto-added ${addedMatch[1]} new rows`);
      const stockMatch = String(details).match(/khớp\s+([0-9.,]+)\s+vật tư từ Tồn kho/i);
      if (stockMatch) enParts.push(`matched ${stockMatch[1]} stock items`);
      const matchedMatch = String(details).match(/khớp\s+([0-9.,]+)\s+vật tư từ Danh mục/i);
      if (matchedMatch) enParts.push(`matched ${matchedMatch[1]} catalog items`);
      return enParts.length > 0
        ? `Pasted ${count} rows from Excel (${enParts.join(' · ')}).`
        : `Pasted ${count} rows from Excel.`;
    }
  },
  {
    pattern: /^Thiết bị đang ngoại tuyến\.\s*Vui lòng kiểm tra kết nối mạng và nhấn nút "Đồng Bộ Cloud" để thử lại\.?$/i,
    replace: () => 'Device is offline. Please check your network connection and click "Cloud Sync" to retry.'
  },
  {
    pattern: /^Tạm dừng kết nối Cloud vì lý do:\s*(.+?)\.\s*Vui lòng nhấn nút "Đồng Bộ Cloud" để chủ động kết nối lại\.?$/i,
    replace: (_, reason) => {
      const rawReason = String(reason || '').trim();
      const r = rawReason.toLowerCase();
      let enReason = rawReason;
      if (r.includes('ngoại tuyến') || r.includes('mất kết nối mạng internet')) {
        enReason = 'Device is offline (no Internet connection)';
      } else if (r.includes('> 2 phút') || r.includes('quá thời gian chờ')) {
        enReason = 'Connection/sync timed out (> 2 minutes) due to slow mobile network or unreachable Cloud server';
      } else if (r.includes('spark') || r.includes('blaze') || r.includes('thanh toán')) {
        enReason = 'Firebase project is on the Spark plan or Cloud Firestore Blaze billing is disabled';
      } else if (r.includes('hạn mức') || r.includes('quota')) {
        enReason = 'Daily free Cloud Firestore read/write quota exceeded';
      } else if (r.includes('chặn cửa sổ')) {
        enReason = 'Device browser blocked the Google authentication popup';
      } else if (r.includes('hết hạn') || r.includes('đăng nhập lại')) {
        enReason = 'Google authentication session expired; please sign in again';
      } else if (r.includes('quyền') || r.includes('thu hồi')) {
        enReason = 'Google account lacks permission or Cloud access was revoked';
      } else if (r.includes('mạng di động') || r.includes('chập chờn')) {
        enReason = 'Weak or unstable mobile network; unable to reach Google Cloud server';
      } else if (/[À-ỹà-ỹĐđ]/.test(enReason)) {
        enReason = 'Unable to connect to Google Cloud Firestore server';
      }
      return `Paused Cloud sync due to: ${enReason}. Click "Cloud Sync" to manually reconnect.`;
    }
  },
  {
    pattern: /^Bản vẽ\s+"(.+?)":\s*([0-9.,]+)\s+vật tư$/i,
    replace: (_, dwg, n) => `DWG "${dwg}": ${n} materials`
  },
  {
    pattern: /^Lần sửa đổi gần nhất từ\s+(.+?),\s*vào lúc:\s*(\d{2}:\d{2})\s*\(GMT\+7\),\s*(\d{2}\/\d{2}\/\d{4})$/i,
    replace: (_, userCode, time, date) => `Last modified by ${userCode} at ${time} (GMT+7), ${date}`
  },
  {
    pattern: /^AI Tạo Mã\s*\(([0-9.,]+)\)$/i,
    replace: (_, n) => `AI Generate Codes (${n})`
  },
  {
    pattern: /^AI đã phân tích & tạo mã thông minh \(8–20 ký tự\) cho\s+([0-9.,]+)\s+dòng vật tư\.$/i,
    replace: (_, n) => `AI analyzed & generated smart codes (8-20 chars) for ${n} material rows.`
  }
];
