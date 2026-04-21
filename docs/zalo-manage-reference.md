# Quản lý Zalo từ Telegram — Lệnh chi tiết

## Tra cứu nhóm / người dùng

Bot KHÔNG dùng `exec` tool. Tra cứu bằng cách **đọc file trực tiếp**:

### Tìm group ID

1. Đọc thư mục `memory/zalo-groups/` — mỗi file `<groupId>.md` có frontmatter `name:` chứa tên nhóm
2. Hoặc đọc file `~/.openzca/profiles/default/cache/groups.json` — mảng JSON có `groupId`, `name`, `memberCount`

**Ví dụ CEO hỏi "group id của nhóm ABC":**
- Dùng `list_dir` tool đọc `memory/zalo-groups/`
- Đọc từng file `.md` → tìm file có `name:` khớp/gần giống "ABC"
- Trả lời CEO: "Nhóm ABC có ID là 1234567890123456789"

### Tìm user ID

1. Đọc thư mục `memory/zalo-users/` — mỗi file `<senderId>.md` có frontmatter `name:`, `zaloName:`
2. Hoặc đọc file `~/.openzca/profiles/default/cache/friends.json` — mảng JSON có `userId`, `displayName`, `zaloName`

## Thay đổi cài đặt nhóm/user

Khi CEO yêu cầu thay đổi (bật/tắt nhóm, block user):

1. Đọc file cài đặt tương ứng:
   - Nhóm: `zalo-group-settings.json` trong workspace
   - User: `zalo-blocklist.json` trong workspace
2. Sửa JSON trực tiếp bằng `write_file` tool
3. Confirm CEO trước khi ghi
4. Dashboard tự cập nhật trong 30s

## Quy trình

1. CEO nói "tắt nhóm ABC" hoặc "block user XYZ"
2. Đọc `memory/zalo-groups/` hoặc `memory/zalo-users/` tìm ID
3. Confirm CEO
4. Ghi file config tương ứng
5. Báo kết quả
