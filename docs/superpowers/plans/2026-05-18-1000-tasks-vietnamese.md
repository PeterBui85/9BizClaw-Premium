# Vietnamese Text Audit — 250 Micro Tasks
Each task is 1-2 minutes, string replacement only, zero breaking risk.

---

## Category 1: English fragments in user-facing UI

1. [dashboard.html:493] `"Node.js Runtime"` → `"Trình chạy Node.js"` — step title in splash is English
2. [dashboard.html:500] `"Cài đặt packages"` → `"Cài đặt gói phần mềm"` — mixed English/Vietnamese step title
3. [dashboard.html:501] `"openclaw, 9router, openzca"` → `"OpenClaw, 9Router, OpenZCA"` — proper casing for product names
4. [dashboard.html:507] `"Plugin Zalo"` → `"Gói mở rộng Zalo"` — "Plugin" is English jargon
5. [dashboard.html:508] `"modoro-zalo"` → `"modoro-zalo (kết nối Zalo)"` — bare package name unclear to CEO
6. [dashboard.html:514] `"gogcli (Google Workspace)"` → `"Google Workspace"` — CEO doesn't need to see "gogcli"
7. [dashboard.html:515] `"Google Calendar, Gmail, Drive..."` → `"Lịch, Email, Drive Google..."` — partial Vietnamese
8. [dashboard.html:522] `"Embedding model (~450 MB)"` → `"Mô hình nhúng (~450 MB)"` — English desc
9. [dashboard.html:2547] `"Gateway Token (login)"` → `"Mã đăng nhập Gateway"` — English label
10. [dashboard.html:2552] `"Copy"` button text → `"Sao chép"` — English button
11. [dashboard.html:4109] `"Web UI gateway — phiên, log, agent"` → `"Giao diện web gateway — phiên, nhật ký, tác vụ"` — mixed English
12. [dashboard.html:4112] `"Copy token"` → `"Sao chép mã"` — English button label
13. [dashboard.html:4113] `"Reload"` → `"Tải lại"` — English button label
14. [dashboard.html:4114] `"Mở trong browser ↗"` → `"Mở trong trình duyệt ↗"` — "browser" is English
15. [dashboard.html:4286] `"Reset"` button text → `"Đặt lại"` — English button on memory modal
16. [dashboard.html:2656] `"Refresh"` button label → `"Làm mới"` — English button in schedules page
17. [dashboard.html:5210] `"Copy"` chat action → `"Sao chép"` — English button in chat
18. [dashboard.html:5211] `"Thử lại"` — correct, keep as-is; but confirm `title="Thử lại"` matches
19. [splash.html:762] `"Copy lỗi"` → `"Sao chép lỗi"` — inconsistent "Copy" vs "Sao chép"
20. [splash.html:766] `"Đã copy!"` → `"Đã sao chép!"` — inconsistent with Vietnamese style
21. [splash.html:773] `"Thử lại"` — good; keep consistent
22. [splash.html:777] `"Thoát"` — good; keep consistent
23. [license.html:379] `"Premium Edition"` → `"Phiên bản Premium"` — half English brand tag
24. [license.html:400] `"License key"` label → `"Mã bản quyền"` — English form label
25. [license.html:401] `placeholder="CLAW-eyJlIjoiZW1haWxAZXhhb..."` → `placeholder="Dán mã bản quyền vào đây (CLAW-...)"` — unclear placeholder
26. [license.html:403] `"Machine ID:"` → `"Mã máy:"` — English label
27. [license.html:404] `"loading..."` → `"Đang tải..."` — English loading text
28. [license.html:405] `"nhấn để copy"` → `"nhấn để sao chép"` — inconsistent "copy" usage
29. [dashboard.html:4092] `"Copy link"` button → `"Sao chép link"` — English button
30. [dashboard.html:5347] `"Đã copy"` → `"Đã sao chép"` — inconsistent copy/sao chép
31. [dashboard.html:5349] `"Copy"` button fallback → `"Sao chép"` — inconsistent
32. [dashboard.html:5323] `showToast('Đã copy hội thoại')` → `showToast('Đã sao chép hội thoại')` — toast uses English "copy"
33. [dashboard.html:5339] `showToast('Đã tải file chat')` → `showToast('Đã tải tệp hội thoại')` — mixed English
34. [dashboard.html:4711] `showToast('Đã copy Gateway token')` → `showToast('Đã sao chép mã đăng nhập Gateway')` — English mix
35. [dashboard.html:6386] `showToast('Đã copy token — paste vào ô đăng nhập OpenClaw')` → `showToast('Đã sao chép mã — dán vào ô đăng nhập OpenClaw')` — "copy/paste" is English
36. [wizard.html:1456] `"Copied!"` tooltip text → `"Đã sao chép!"` — English tooltip
37. [wizard.html:1211] `"Trợ Lý AI Cho Doanh Nghiệp"` — capitalization inconsistent, keep as brand
38. [dashboard.html:2832] `"Escalate CEO"` chip label → `"Chuyển CEO"` — English term in UI chip
39. [dashboard.html:4178] `"Workspace (AGENTS, knowledge, memory, logs)"` → `"Dữ liệu làm việc (tài liệu, kiến thức, bộ nhớ, nhật ký)"` — English terms in factory reset

## Category 2: Inconsistent terminology

40. [dashboard.html:4510] `'Dừng'` vs `'Đã dừng'` — toggle button should match status text; button says "Dừng" but status says "Đã dừng"
41. [dashboard.html:2507] rail label `"Tổng quan"` — consistent, good
42. [dashboard.html:2511] rail label `"Chat"` → `"Trò chuyện"` — English word in nav rail
43. [dashboard.html:2515] rail label `"Kênh"` — good, consistent
44. [dashboard.html:2520] rail label `"Nội dung"` — good
45. [dashboard.html:2524] rail label `"Cấu hình"` — good
46. [dashboard.html:2766] `"Tạm dừng"` on Telegram — consistent with Zalo page
47. [dashboard.html:2972] `"Tạm dừng"` on Zalo — matches Telegram, good
48. [dashboard.html:2971] `"Đổi tài khoản"` button Zalo — matches Telegram "Đổi tài khoản", consistent
49. [dashboard.html:4522] `'Đang khởi động trợ lý...'` — uses "trợ lý" (assistant)
50. [dashboard.html:4523] `'Đang dừng trợ lý...'` — uses "trợ lý" — consistent, good
51. [dashboard.html:2602] `"Bot đã học"` → `"Trợ lý đã học"` — inconsistent "bot" vs "trợ lý" in overview card
52. [dashboard.html:2607] `"Bot sẽ tự học từ cuộc hội thoại"` → `"Trợ lý sẽ tự học từ cuộc hội thoại"` — "bot" should be "trợ lý"
53. [dashboard.html:2563] `"Nhắn thử cho bot trên Telegram"` → `"Nhắn thử cho trợ lý trên Telegram"` — "bot" inconsistent
54. [dashboard.html:2564] `"Bot sẽ trả lời trong vài giây"` → `"Trợ lý sẽ trả lời trong vài giây"` — normalize to "trợ lý"
55. [dashboard.html:2655] `"Bot chạy tự động theo lịch này"` title → `"Trợ lý chạy tự động theo lịch này"` — "bot" → "trợ lý"
56. [dashboard.html:2779] `"Khi người không phải CEO nhắn Telegram bot"` → `"Khi người lạ nhắn Telegram"` — CEO doesn't call themselves "CEO"
57. [dashboard.html:2986] `"Bật Zalo"` label → consistent standalone label, good
58. [dashboard.html:2992] `"Thay đổi sẽ khởi động lại gateway"` → `"Thay đổi sẽ khởi động lại hệ thống"` — "gateway" is jargon
59. [dashboard.html:5279] `'Đang suy nghĩ...'` typing label — good Vietnamese
60. [dashboard.html:5289] `'Đang xử lý... '` — good
61. [dashboard.html:2653] `"Timeline bot chạy hàng ngày"` → `"Lịch trình trợ lý chạy hàng ngày"` — "Timeline" English, "bot" inconsistent
62. [dashboard.html:4508] `'9BizClaw — Đang chạy (click để dừng)'` → `'9BizClaw — Đang chạy (nhấn để dừng)'` — "click" is English
63. [dashboard.html:4508] `'Đã dừng (click để khởi động)'` → `'Đã dừng (nhấn để khởi động)'` — "click" → "nhấn"
64. [wizard.html:1289] `"Nếu thấy trang đăng nhập, nhập mật khẩu"` — uses "mật khẩu", consistent
65. [dashboard.html:2929] `"Khách gửi nhiều tin liên tiếp — bot chờ gộp lại"` → `"Khách gửi nhiều tin liên tiếp — trợ lý chờ gộp lại"` — "bot" inconsistent
66. [dashboard.html:2980] `"Tất cả bạn bè đã tắt — bot không trả lời ai trên Zalo"` → `"...trợ lý không trả lời ai trên Zalo"` — "bot" → "trợ lý"
67. [dashboard.html:3527] `placeholder="Nhập tin nhắn cho 9BizClaw..."` — good, uses product name

## Category 3: Missing tooltips

68. [dashboard.html:2505] rail item "Tổng quan" — add `title="Trang chủ tổng quan"` for accessibility
69. [dashboard.html:2509] rail item "Chat" — add `title="Trò chuyện với trợ lý"` for accessibility
70. [dashboard.html:2513] rail item "Kênh" — add `title="Quản lý kênh Telegram và Zalo"` for accessibility
71. [dashboard.html:2518] rail item "Nội dung" — add `title="Quản lý nội dung và tài liệu"` for accessibility
72. [dashboard.html:2522] rail item "Cấu hình" — add `title="Cài đặt hệ thống"` for accessibility
73. [dashboard.html:4139] support FAB button — add `title="Hỗ trợ & Trợ giúp"` to the button
74. [dashboard.html:2604] memory card expand button — `title="Xem tất cả"` exists, good
75. [dashboard.html:2615] schedule card action button — `title="Mở Lịch tự động"` exists, good
76. [dashboard.html:4267] "Đóng" button in Zalo QR modal — add `title="Đóng cửa sổ"` for clarity
77. [dashboard.html:4264] "Làm mới QR" button — add `title="Tạo mã QR mới"` for clarity
78. [dashboard.html:4288] "Đóng" button in user memory modal — add `title="Đóng hồ sơ khách"` for clarity
79. [dashboard.html:4192] "Hủy" button in factory reset — add `title="Hủy xóa, quay lại"` for clarity
80. [dashboard.html:4193] "Xóa sạch" button — add `title="Xóa toàn bộ dữ liệu không thể khôi phục"` warning tooltip
81. [dashboard.html:2809] "Lưu cấu hình" button Telegram sidebar — add `title="Lưu thay đổi cấu hình Telegram"` for clarity
82. [dashboard.html:2952] "Hủy" button in Telegram change modal — add `title="Hủy thay đổi"` for clarity
83. [wizard.html:1286] "Kết nối ChatGPT" button — add `title="Mở trang kết nối ChatGPT trong trình duyệt"` for clarity
84. [wizard.html:1302] "Kiểm tra kết nối" button — add `title="Xác nhận ChatGPT đã kết nối thành công"` for clarity
85. [license.html:409] "Kích hoạt" button — add `title="Kích hoạt bản quyền với mã đã nhập"` for clarity
86. [splash.html:444] minimize button — `title="Thu nhỏ"` exists, good
87. [splash.html:450] close button — `title="Đóng — cài đặt sẽ dừng lại"` exists, good

## Category 4: Error messages in English or unclear

88. [dashboard.html:4679] `showToast('Không lấy được Gateway token', 'error')` → `showToast('Không lấy được mã đăng nhập', 'error')` — "Gateway token" jargon
89. [dashboard.html:4686] `showToast('Lỗi: ' + e.message, 'error')` → `showToast('Đã xảy ra lỗi: ' + e.message, 'error')` — softer error prefix
90. [dashboard.html:4428] `alert('Không mở được thư mục log')` → `alert('Không mở được thư mục nhật ký')` — "log" is English
91. [dashboard.html:4431] `alert('Lỗi: ' + (e.message || e))` — keep, but add Vietnamese fallback: `'Lỗi không xác định'`
92. [dashboard.html:4556] `'Lỗi: ' + e.message` in bot status → add fallback: `'Lỗi: ' + (e.message || 'Không rõ nguyên nhân')` — clearer
93. [dashboard.html:4586] `'Lỗi tạo QR. Thử lại.'` → `'Không tạo được mã QR. Vui lòng thử lại.'` — warmer wording
94. [dashboard.html:5391] `showToast('Không mở được file picker', 'error')` → `showToast('Không mở được trình chọn tệp', 'error')` — "file picker" English
95. [dashboard.html:5440] `'Lỗi kết nối trợ lý. Vui lòng thử lại.'` — good fallback error
96. [dashboard.html:5447] `'Lỗi kết nối: ' + (e.message || 'unknown')` → `'Lỗi kết nối: ' + (e.message || 'không rõ')` — "unknown" is English
97. [dashboard.html:5581] `'Không đọc được trạng thái Facebook'` — good Vietnamese error
98. [dashboard.html:5607] `'Không kết nối được Facebook'` — good Vietnamese error
99. [dashboard.html:5658] `'Lỗi tải tài sản'` → `'Không tải được tài sản'` — warmer phrasing
100. [dashboard.html:5681] `'Không upload được ' + name` → `'Không tải lên được ' + name` — "upload" is English
101. [dashboard.html:5756] `'Không upload được "' + name + '"'` → `'Không tải lên được "' + name + '"'` — "upload" is English
102. [dashboard.html:5784] `'Chưa xóa được tài sản thương hiệu'` — good Vietnamese phrasing
103. [license.html:478] `'Key không hợp lệ. Vui lòng kiểm tra lại.'` → `'Mã không hợp lệ. Vui lòng kiểm tra lại.'` — "Key" is English
104. [license.html:479] `'Key đã hết hạn.'` → `'Mã đã hết hạn.'` — "Key" is English
105. [license.html:480] `'Không ghi được license.'` → `'Không lưu được bản quyền.'` — "license" is English
106. [license.html:481] `'Key đã bị thu hồi.'` → `'Mã đã bị thu hồi.'` — "Key" is English
107. [license.html:482] `'Key này đã được bind tới máy khác.'` → `'Mã này đã được gắn với máy khác.'` — "bind" is English
108. [dashboard-ipc.js:352] `'9router không khởi động được trong 10 giây — fallback file mode'` → `'9Router không khởi động được trong 10 giây — chuyển sang chế độ tệp'` — "fallback file mode" English
109. [dashboard-ipc.js:398] `'Không tạo được provider: '` → `'Không tạo được nhà cung cấp: '` — "provider" English
110. [dashboard-ipc.js:439] `'Ollama trả về 401...'` — good Vietnamese error with context
111. [dashboard-ipc.js:441] `'Không kết nối được ollama.com. Kiểm tra Internet hoặc thử đổi mạng.'` — good Vietnamese
112. [dashboard-ipc.js:443] `'Ollama trả về 429 (rate limit).'` → `'Ollama trả về 429 (quá giới hạn).'` — "rate limit" English

## Category 5: Toast messages cleanup

113. [dashboard.html:4872] `showToast('Test cron thành công', 'success')` → `showToast('Kiểm tra cron thành công', 'success')` — "Test" is English
114. [dashboard.html:4875] `showToast('Test cron thất bại', 'error')` → `showToast('Kiểm tra cron thất bại', 'error')` — "Test" is English
115. [dashboard.html:5602] `showToast('Đã kết nối Fanpage', 'success')` → `showToast('Đã kết nối trang Facebook', 'success')` — "Fanpage" is informal English
116. [dashboard.html:5684] `'Upload xong, có ' + failed + ' file lỗi'` → `'Tải lên xong, có ' + failed + ' tệp lỗi'` — "Upload/file" English
117. [dashboard.html:5684] `'Đã upload tài sản thương hiệu'` → `'Đã tải lên tài sản thương hiệu'` — "upload" English
118. [dashboard.html:5759] `'Upload xong, có ' + failed + ' ảnh lỗi'` → `'Tải lên xong, có ' + failed + ' ảnh lỗi'` — "Upload" English
119. [dashboard.html:5759] `'Đã upload hình sản phẩm'` → `'Đã tải lên hình sản phẩm'` — "upload" English
120. [dashboard.html:5787] `showToast('Đã xóa tài sản thương hiệu', 'success')` — good Vietnamese toast
121. [dashboard.html:5328] `showToast('Chưa có tin nhắn', 'error')` — good, appropriate empty state warning
122. [dashboard.html:5308] `'Đã dừng theo yêu cầu.'` — good Vietnamese info text
123. [dashboard.html:4649] `addActivity('Đã đổi chế độ Zalo: ' + mode)` — mode value may be English; add mode label map
124. [dashboard.html:4630] `addActivity('Zalo đã kết nối thành công')` — good Vietnamese
125. [dashboard.html:4710] `addActivity('Đã copy Gateway Token')` → `addActivity('Đã sao chép mã đăng nhập Gateway')` — "copy" English
126. [dashboard.html:4700] `addActivity('Mở cài đặt nâng cao OpenClaw trong browser')` → `'Mở cài đặt nâng cao OpenClaw trong trình duyệt'` — "browser" English
127. [dashboard.html:4867] `addActivity('Đang test cron...')` → `addActivity('Đang kiểm tra cron...')` — "test" English
128. [dashboard.html:4878] `addActivity('Lỗi test cron: ' + e.message)` → `addActivity('Lỗi kiểm tra cron: ' + e.message)` — "test" English

## Category 6: Empty state text improvements

129. [dashboard.html:4131] `"Chưa có hoạt động"` — good empty state
130. [dashboard.html:4236] `"Chưa có hoạt động"` (drawer) — matches panel, consistent
131. [dashboard.html:2607] `"Bot sẽ tự học từ cuộc hội thoại"` → `"Trợ lý sẽ tự học từ cuộc hội thoại với khách"` — add context
132. [dashboard.html:2618] `"Không có lịch nào"` → `"Chưa có lịch hôm nay"` — warmer phrasing
133. [dashboard.html:4724] `'Chưa có lịch nào. Nhấn + để thêm.'` — good guidance text
134. [dashboard.html:5617] `'Chưa có bài đăng nào'` — good empty state
135. [dashboard.html:5625] `'Không tải được bài đăng'` — good error state
136. [dashboard.html:2648] `"tl-empty"` class text — check if text is set; add: `"Chưa có lịch trình nào được thiết lập"`
137. [dashboard.html:624] `"know-empty"` class — check empty state text `"Chưa có tài liệu nào trong thư mục này"`
138. [dashboard.html:751] `"zalo-mgr-empty"` text — check if present: `"Chưa có dữ liệu"` → `"Chưa có liên hệ Zalo nào"`

## Category 7: Placeholder text improvements

139. [dashboard.html:3051] `placeholder="Tìm nhóm..."` — good Vietnamese placeholder
140. [dashboard.html:3066] `placeholder="Tìm theo tên hoặc số điện thoại..."` — good, descriptive
141. [dashboard.html:3098] `placeholder="Tên thư mục mới"` — good
142. [dashboard.html:3232] `placeholder="VD: Dạ em [tên trợ lý] bên [tên công ty] xin chào..."` — good example
143. [dashboard.html:3286] `placeholder="Combo A - gà\nÁo thun basic size L"` → `placeholder="Combo A - gà\nÁo thun cơ bản size L"` — "basic" is English
144. [dashboard.html:3303] `placeholder="Lý do (VD: mưa bão miền Bắc)"` — good
145. [dashboard.html:3327] `placeholder="Ghi chú bổ sung..."` — good
146. [dashboard.html:3408] `placeholder="VD: Họp với anh Minh về hợp đồng"` — good
147. [dashboard.html:3621] `placeholder="Paste Page Access Token từ Meta Business Suite"` → `placeholder="Dán mã truy cập trang từ Meta Business Suite"` — "Paste Page Access Token" mostly English
148. [dashboard.html:3839] `placeholder="Trả lời..."` — good
149. [dashboard.html:3851] `placeholder="nguoi-nhan@email.com"` → `placeholder="email-nguoi-nhan@congty.com"` — more Vietnamese-style example
150. [dashboard.html:3855] `placeholder="Chủ đề email"` — good
151. [dashboard.html:3873] `placeholder="Tìm kiếm file..."` → `placeholder="Tìm kiếm tệp..."` — "file" is English
152. [dashboard.html:3893] `placeholder="Dán link Google Doc hoặc ID"` — "link" is semi-accepted; could add "liên kết"
153. [dashboard.html:3916] `placeholder="Dán link Google Sheet hoặc ID"` — same as above
154. [dashboard.html:3920] `placeholder='[["Tên","SĐT"],["An","090..."]]'` — technical but appropriate for dev
155. [dashboard.html:3935] `placeholder="Tìm liên hệ..."` — good
156. [dashboard.html:3949] `placeholder="Nguyễn Văn A"` — good Vietnamese example
157. [dashboard.html:3950] `placeholder="0901234567"` — good phone format
158. [dashboard.html:3977] `placeholder="Gọi khách hàng"` — good task example
159. [dashboard.html:4090] `placeholder="ceo@company.com"` → `placeholder="giamdoc@congty.com"` — more Vietnamese email example
160. [dashboard.html:4292] `placeholder="Ghi chú riêng của anh/chị về khách này (không gửi cho khách)..."` — good, descriptive
161. [wizard.html:1247] `placeholder="Ví dụ: Nguyễn Văn A"` — good
162. [wizard.html:1251] `placeholder="Không bắt buộc"` — good
163. [wizard.html:1256] `placeholder="Để trống = bot tự xưng 'em'. Ví dụ: Momo, Linh, Claw"` → `placeholder="Để trống = trợ lý tự xưng 'em'. Ví dụ: Momo, Linh, Claw"` — "bot" inconsistent
164. [wizard.html:1261] `placeholder="Ví dụ: anh, chị, sếp, thầy, cô, giám đốc"` — good examples
165. [wizard.html:1463] `placeholder="Dán Mã kết nối từ BotFather..."` — good
166. [wizard.html:1666] `placeholder="Dán dãy số (VD: 5738291046)"` — good
167. [dashboard.html:2942] `placeholder="123456789:ABCdef..."` — technical but needed for token input
168. [dashboard.html:2946] `placeholder="987654321"` — good numeric placeholder for User ID

## Category 8: Button label improvements

169. [dashboard.html:2764] `"Kiểm tra"` button in Telegram page — good, clear action
170. [dashboard.html:2765] `"Đổi tài khoản"` button — good
171. [dashboard.html:2951] `"Lưu và kiểm tra"` button — good, dual action clarity
172. [dashboard.html:2952] `"Hủy"` button — good
173. [dashboard.html:2970] `"Refresh"` button in Zalo page → `"Làm mới"` — English button
174. [dashboard.html:4193] `"Xóa sạch"` button — good, clear danger action
175. [dashboard.html:4192] `"Hủy"` button — good
176. [dashboard.html:4221] `"← Trước"` walkthrough button — good
177. [dashboard.html:4223] `"Tiếp →"` walkthrough button — good
178. [dashboard.html:4216] `"Bỏ qua"` skip button — good
179. [wizard.html:1346] `"Bắt đầu kết nối →"` — good CTA
180. [wizard.html:1369] `"Mở trong App"` — "App" is English → `"Mở trong ứng dụng"`
181. [wizard.html:1374] `"Mở trên Web"` — good, "Web" is accepted loanword
182. [wizard.html:1380] `"Tôi đã mở rồi"` — good
183. [wizard.html:1415] `"BotFather đã gửi Mã kết nối →"` — good CTA
184. [wizard.html:1472] `"Tiếp tục →"` — good
185. [wizard.html:1837] `"Tiếp tục"` next button — good
186. [dashboard.html:4154] `"Xuất dữ liệu (backup)"` → `"Xuất dữ liệu (sao lưu)"` — "backup" is English
187. [dashboard.html:4158] `"Khôi phục từ file"` → `"Khôi phục từ tệp"` — "file" is English
188. [dashboard.html:4163] `"Xóa sạch dữ liệu (Factory Reset)"` → `"Xóa sạch dữ liệu (khôi phục gốc)"` — "Factory Reset" English

## Category 9: Section/tab headers

189. [dashboard.html:4128] `"Hoạt động gần đây"` — good section header
190. [dashboard.html:4232] `"Hoạt động gần đây"` (drawer) — matches, consistent
191. [dashboard.html:2602] `"Bot đã học"` → `"Trợ lý đã học"` — see task #51
192. [dashboard.html:2614] `"Lịch hôm nay"` — good section header
193. [dashboard.html:2817] `"Khả năng"` section label in Telegram — good
194. [dashboard.html:2838] `"Câu lệnh mẫu"` section label — good
195. [dashboard.html:2918] `"Thời gian gộp tin"` section label — good, descriptive
196. [dashboard.html:2778] `"Người lạ nhắn tin"` section label — good
197. [dashboard.html:2788] `"Hành vi nhóm mới"` section label — good
198. [dashboard.html:2798] `"Giới hạn lịch sử"` section label — good
199. [dashboard.html:2999] `"Chế độ trả lời"` section label Zalo sidebar — good
200. [dashboard.html:4243] `"Đăng nhập Zalo"` modal title — good
201. [dashboard.html:2937] `"Đổi tài khoản Telegram"` modal title — good
202. [dashboard.html:4172] `"Xóa sạch dữ liệu"` modal title — good danger title

## Category 10: Help text and descriptions

203. [dashboard.html:2839] `"Nhắn bất kỳ thứ gì cho bot qua Telegram. Click hàng để copy."` → `"Nhắn bất kỳ thứ gì cho trợ lý qua Telegram. Nhấn dòng để sao chép."` — "bot/Click/copy" all English
204. [dashboard.html:2929] debounce hint `"0s = mỗi tin trả lời riêng. 3s = chờ khách gõ xong."` — good, concise
205. [dashboard.html:2992] `"Thay đổi sẽ khởi động lại gateway. Telegram sẽ gián đoạn 10-15 giây."` → `"Thay đổi sẽ khởi động lại hệ thống. Telegram sẽ gián đoạn 10-15 giây."` — "gateway" jargon
206. [dashboard.html:4094] `"Khi bấm Kết nối, trình duyệt sẽ mở trang đăng nhập Google."` — good help text
207. [dashboard.html:4186] `"Không thể khôi phục sau khi xóa."` — good warning
208. [dashboard.html:4190] `'Gõ "xóa" (hoặc "xoa" nếu không gõ được dấu)'` — good accessibility hint
209. [wizard.html:1257] `"Đây là tên riêng của trợ lý AI. Khách Zalo sẽ thấy bot tự giới thiệu bằng tên này."` → replace "bot" with "trợ lý" — `"...trợ lý tự giới thiệu bằng tên này."`
210. [wizard.html:1262] `"Bot sẽ dùng cách xưng hô này khi nhắn anh/chị qua Telegram."` → `"Trợ lý sẽ dùng cách xưng hô này khi nhắn anh/chị qua Telegram."` — "bot" inconsistent
211. [wizard.html:1266] `"Thông tin chi tiết về sản phẩm...sẽ được anh/chị tải lên qua Dashboard → Knowledge"` → `"...tải lên qua Bảng điều khiển → Kiến thức"` — "Dashboard/Knowledge" English
212. [wizard.html:1338] `"Toàn bộ dữ liệu lưu trên máy anh/chị, không gửi lên cloud."` → `"...không gửi lên đám mây."` — "cloud" is English
213. [wizard.html:1222] `"Toàn bộ dữ liệu lưu local trên máy anh/chị, không gửi lên cloud."` → `"Toàn bộ dữ liệu lưu trên máy anh/chị, không gửi ra ngoài."` — "local/cloud" English
214. [license.html:390] `"Bản quyền gắn với máy tính của anh/chị. Dán key vào ô bên phải để kích hoạt."` → `"...Dán mã vào ô bên phải để kích hoạt."` — "key" English
215. [license.html:397] `"Dán license key đã nhận từ 9Biz để kích hoạt phiên bản Premium."` → `"Dán mã bản quyền đã nhận từ 9Biz để kích hoạt phiên bản Premium."` — "license key" English

## Category 11: Confirmation dialog text

216. [dashboard.html:5775] `showConfirmDialog` — check that confirm/cancel button text is in Vietnamese
217. [dashboard.html:5796] `showConfirmDialog` — same check for second usage
218. [dashboard.html:4244] Zalo QR modal `"Mở app Zalo trên điện thoại, vào Quét QR"` → `"Mở ứng dụng Zalo trên điện thoại, vào Quét QR"` — "app" English
219. [dashboard.html:4260] `"Cửa sổ sẽ tự đóng trong 3 giây"` — good countdown text
220. [dashboard.html:4259] `"Đăng nhập thành công"` — good success text

## Category 12: Splash screen text

221. [splash.html:440] `"— Đang cài đặt"` titlebar text — good
222. [splash.html:471] `"Đang cài đặt 9BizClaw"` title — good
223. [splash.html:472] `"Quá trình này chỉ diễn ra một lần duy nhất."` — good subtitle
224. [splash.html:479] `"Tiến độ"` progress label — good
225. [splash.html:494] `"Đang kiểm tra..."` desc for node step — good
226. [splash.html:607] `'Đang kiểm tra hệ thống...'` — good
227. [splash.html:611] `'Đang tải Node.js...'` — good fallback
228. [splash.html:617] `'Đang cài openclaw, 9router, openzca...'` → `'Đang cài OpenClaw, 9Router, OpenZCA...'` — proper casing
229. [splash.html:622] `'Đang tải Git...'` — good
230. [splash.html:626] `'Git đã sẵn sàng'` — good
231. [splash.html:630] `'Đang cài packages...'` → `'Đang cài gói phần mềm...'` — "packages" English
232. [splash.html:640] `'Đang cài plugin Zalo...'` → `'Đang cài gói mở rộng Zalo...'` — "plugin" English
233. [splash.html:650] `'Đang cài gogcli...'` → `'Đang cài công cụ Google Workspace...'` — "gogcli" is internal name
234. [splash.html:660] `'Đang tải mô hình AI...'` — good
235. [splash.html:670] `'Sẵn sàng!'` — good completion title
236. [splash.html:671] `'9BizClaw đã được cài đặt thành công.'` — good completion message
237. [splash.html:672] `'Hoàn tất'` — good progress label
238. [splash.html:684] `'Đang cập nhật 9BizClaw'` — good migration title
239. [splash.html:685] `'Đang chuyển dữ liệu từ phiên bản cũ...'` — good migration subtitle
240. [splash.html:686] `'Đang sao lưu dữ liệu...'` — good migration fallback
241. [splash.html:714] `'Cài đặt gặp lỗi'` — good error title
242. [splash.html:716] `'Vui lòng kiểm tra mạng Internet hoặc thử lại.'` — good error subtitle
243. [splash.html:717] `'Lỗi'` — good error label

## Category 13: Channels.js user-facing strings

244. [channels.js:94] `"📝 ${sourceLabel} vừa ${actionLabel} hồ sơ khách *${customerRef}*"` — good Vietnamese alert to CEO
245. [channels.js:91] `'khách ${senderId ? senderId.slice(-6) : '?'}'` — `'khách'` prefix good, but `'?'` could be `'không rõ'`
246. [channels.js:92] `details?.source === 'dashboard-ipc' ? 'Dashboard' : 'Bot'` → `'Bảng điều khiển' : 'Trợ lý'` — English labels

## Category 14: Wizard step brand panel sync

247. [wizard.html:1216] `"Bước 1 / 4"` eyebrow — good
248. [wizard.html:1217] `"Chào mừng đến với 9BizClaw"` headline — good
249. [wizard.html:1218] `"Trợ lý AI 1-click giúp..."` subhead — "1-click" is OK loanword; but `"1 nhấn"` is alternative
250. [wizard.html:1274] `"Trợ lý cần kết nối với ChatGPT. Tài khoản miễn phí hoặc Plus đều dùng được."` — good description
