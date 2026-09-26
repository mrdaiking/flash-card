# App Ghi Nhớ (Spaced Repetition) — Kiến Trúc & Spec

Cập nhật lần cuối: 2026-09-26. Nguồn gốc: doc kiến trúc trên claude.ai, bản này là bản làm việc trong repo.

## Quy ước làm việc (cho Claude Code)

- Không bao giờ chạy `git commit` hay `git push`. Viết và sửa file xong thì dừng lại, báo tóm tắt thay đổi để Felix tự commit.
- Trước khi đổi schema DB: migration phải additive, idempotent, không xoá dữ liệu (theo đúng pattern trong `db.js`).
- Trước khi deploy lên EC2: backup `data/cards.db` trước tiên.
- Khi một quyết định thiết kế thay đổi, cập nhật file này trong cùng lượt làm việc.

## Triết lý cốt lõi & thước đo thành công

- App ghi nhớ tổng quát (spaced repetition), không giới hạn ngành nghề — giúp ghi chú và đưa kiến thức vào trí nhớ dài hạn.
- Differentiator thật KHÔNG phải "thuật toán tốt nhất": FSRS-6 đã gần sát giới hạn nghiên cứu hiện tại (log-loss 0.291 so với 0.354 của SM-2, trên benchmark 700 triệu lượt ôn), và đã miễn phí trong Anki, RemNote, Diane, Recall — không phải một moat bền.
- Hai khoảng trống thật của thị trường: (1) chất lượng thẻ — hầu hết app AI-generate-card hiện nay vi phạm minimum information principle của Wozniak; (2) khả năng resume sau gián đoạn — giải quyết prospective-memory failure (quên hẳn một domain/project còn tồn tại), điều chưa app nào làm tốt.
- Thước đo thành công: dogfooding. Người dùng đầu tiên là chính người xây dựng. Thành công = tự nhớ lại được sau 6 tháng, kiểm tra ngoài ngữ cảnh — không chỉ dựa vào nút "Good" lúc ôn, vì bối cảnh ôn tự nó đã gợi ý câu trả lời.

## Data model

- **Domain**: tầng phân loại bền vững, phẳng — không lồng nhau kiểu deck/subdeck của Anki. Ví dụ: tiếng Nhật, tiếng Anh. Mỗi note thuộc đúng 1 domain. Domain cũng là đơn vị nhận nhắc nhở "còn tồn tại" (xem mục Notification).
- **Tag**: phẳng, tuỳ chọn, một note gắn được nhiều tag, dùng để phân loại chéo domain.
- **Note/Card**: đơn vị nhỏ nhất, phải atomic (một ý duy nhất) theo minimum information principle — áp dụng dù tạo tay hay import hàng loạt.
- Lý do tránh cấu trúc lồng nhau: độ phức tạp phân loại (tags, decks, subdecks...) là lý do chính khiến người mới bỏ Anki sau một lần mở.
- Lợi ích kỹ thuật thêm: có domain/tag, scheduler có thể chủ động giãn cách các thẻ mới cùng category ra thay vì học cùng ngày, giảm nhiễu lẫn nhau (combat interference — một trong 20 rules của Wozniak).

## Capture

**Chrome extension (desktop/web only)**

- Đọc nội dung từ ChatGPT (content script) và trang web đang xem, atomize thành thẻ ngay tại chỗ.
- AI gợi ý domain/tag để chạm xác nhận thay vì gõ tay — giữ friction thấp đúng lúc curiosity đang cao.
- Vai trò: capture only, không tự lưu trữ riêng — ghi thẳng vào backend trung tâm.

**CSV bulk import (web only)**

- Upload → preview vài dòng đầu.
- Map cột thủ công (không giả định thứ tự cột).
- Chọn domain đích trong không gian đã có, không tạo domain mới ngầm.
- Validate từng dòng: cảnh báo dòng gộp nhiều ý (vi phạm minimum information principle), cho sửa tại chỗ.
- Duplicate detection trước khi commit.
- Rải lịch học thẻ mới ra vài tuần thay vì đẩy hết vào hàng đợi ôn cùng lúc, tránh backlog-dread ngay sau import.
- Bản đầu: thuần CSV (front/back bắt buộc, tag tuỳ chọn). Chưa hỗ trợ .apkg (binary SQLite của Anki).

**[Đã build — chưa commit/deploy] CSV import v1** — màn hình riêng `#/decks/:id/import`:
- Nhận file CSV/TSV hoặc dán text; tự nhận delimiter (tab / `|` / `,`), parser hỗ trợ ô có ngoặc kép (dấu phẩy, xuống dòng, `""`). Định dạng cũ `front | back` vẫn dán được.
- Map cột thủ công Front / Back / Example (tuỳ chọn); tự nhận header nếu có cột tên front/back/question/answer/term/definition.
- Domain đích = deck đang mở (luôn là deck có sẵn, không tạo mới ngầm).
- Review từng dòng, sửa tại chỗ: thiếu front/back → bị loại cho tới khi sửa; trùng (cùng front, so sánh không phân biệt hoa thường/khoảng trắng) với thẻ đã có trong deck hoặc trong chính file → bỏ qua; cảnh báo "nhiều ý" (back có `;`, xuống dòng, ` / `, danh sách đánh số, hoặc >150 ký tự; front có ≥2 dấu hỏi) chỉ là gợi ý, không chặn. Server kiểm tra lại front/back và trùng lặp.
- Pacing: "All due now" hoặc rải đều 1/2/4 tuần (mặc định 2 tuần khi >30 thẻ) bằng cách đặt `next_review` tăng dần theo ngày.
- Endpoint: `POST /api/decks/:id/import-rows` `{rows:[{front,back,example}], spreadDays}` — thay cho `POST /api/decks/:id/import` (text thô) đã bị xoá.
- Parser + heuristic ở `public/csv.js`, tự kiểm tra bằng `node scripts/check-csv.js`.
- **Chưa làm: tag.** Hiện chưa có data model tag ở đâu trong app, nên cột tag chưa được map — thêm khi có model Tag.

## Nguồn sự thật & Archive phụ

- **Backend cloud riêng** là nguồn sự thật duy nhất: chứa domain, tag, thẻ, tham số FSRS-6 từng thẻ, log review.
- Cả Chrome extension (ghi) và PWA (đọc/ghi) đều gọi qua internet — không phụ thuộc việc máy tính cá nhân có đang bật hay không.
- Lý do: Obsidian Local REST API chỉ chạy trên localhost của máy đang mở Obsidian — không thể dùng làm nguồn sự thật cho PWA trên điện thoại lúc di chuyển.
- **Archive phụ (không bắt buộc)**: khi desktop đang bật và Obsidian đang chạy, đồng bộ một chiều bản sao vào vault qua Local REST API plugin (cộng đồng, HTTPS + API key) — chỉ để tra cứu, không phải đường sống của app.

## Scheduling engine

- Nền tảng: **FSRS-6** (mã nguồn mở, đã train trên hàng trăm triệu lượt ôn tập thật) — không tự chế lại thuật toán từ đầu.
- **Target retention**: tunable theo từng domain, KHÔNG cố định ở mặc định 90% của đa số app. Sau vài tuần có dữ liệu review thật, chạy simulator (quét 60–95%) để tìm điểm tối thiểu hoá "thời gian ôn / mỗi thẻ thực sự nhớ được".
- Lưu ý về "dễ chịu": buổi ôn cảm thấy dễ, mượt thường là buổi ôn kém hiệu quả nhất cho trí nhớ dài hạn (desirable difficulty, Bjork). Không tối ưu app để review "cảm thấy dễ" — tối ưu để "khó vừa đủ nhưng vẫn thành công".
- **Chống nhiễu** (combat interference): thẻ mới cùng category/domain được giãn cách ra, không học dồn cùng một buổi.

**[Đã build — chưa commit/deploy] Hiện trạng scheduling** (`fsrs.js`, tự kiểm tra: `node scripts/check-fsrs.js`):
- FSRS-6 qua `ts-fsrs` 5.x (cần Node ≥ 20; EC2 đang v24). Retention mặc định 85%, `enable_short_term` tắt (mọi khoảng cách tính bằng ngày), `enable_fuzz` bật để thẻ không dồn cùng một ngày.
- Target retention theo từng deck: cột `decks.target_retention` (NULL = 85%), chỉnh trong menu ⋮ của deck (80/85/90/95%), API `PUT /api/decks/:id/retention` (0.70–0.97). Chỉ áp dụng từ lần review kế tiếp của mỗi thẻ, không xếp lại lịch hiện có. **Chưa có simulator** tự đề xuất retention — cần vài tuần dữ liệu review FSRS trước.
- Chống nhiễu, 2 tầng: (1) khi thêm thẻ lẻ, mỗi deck chỉ mở tối đa 10 thẻ mới/ngày, thẻ dư xếp sang ngày sau qua `next_review` (làm ở tầng dữ liệu nên mọi số "due" trong app khớp với phiên học); (2) thứ tự phiên học xen kẽ các deck và rải thẻ mới đều giữa thẻ ôn. Import CSV dùng lựa chọn pacing riêng của nó (không bị giới hạn 10/ngày).

## Review

- PWA, mobile-first, dùng hằng ngày lúc đi tàu.
- **Offline-first bắt buộc**: prefetch due-cards vài ngày tới vào IndexedDB qua service worker khi có mạng; review vẫn chạy được khi mất sóng dưới hầm (JR/Metro Tokyo); kết quả review queue lại, sync khi có mạng trở lại.

**[Đã build — chưa commit/deploy] Hiện trạng offline** (`public/sw.js`):
- Mọi `GET /api/*` cùng origin: network-first, chỉ dùng bản cache khi mất mạng. Online luôn thấy dữ liệu mới; offline mọi màn hình đã từng mở vẫn mở được.
- Danh sách due lấy kèm `?ahead=3` (server trả cả thẻ đến hạn trong 3 ngày tới, tối đa 7); client tự lọc `next_review <= now` theo đồng hồ máy → bản cache vẫn dùng được sau nhiều giờ offline. Prefetch được cache trong Cache Storage của SW, không phải IndexedDB.
- Review lúc offline: xếp vào IndexedDB (`felix-cards-sw` / `pending-reviews`) và gỡ thẻ đó khỏi các danh sách due đang cache để không bị ôn lại. Gửi lại khi: Background Sync (chỉ Chrome/Android), **mở app, sự kiện `online`, app quay lại foreground** (đường chính trên iOS vì Safari không có Background Sync), và sau mỗi review online thành công. Single-flight để không gửi trùng.
- Static asset cache-first, **kể cả script/style CDN** (Tailwind, marked, Google Fonts — response opaque) để mở app lúc đang mất mạng không bị vỡ giao diện.
- Favorite cũng được queue giống review (request là "đặt = true/false" nên gửi lại an toàn, giữ thứ tự hàng đợi).
- **Quyết định: không hỗ trợ thêm/sửa thẻ hoặc journal lúc offline** (Felix không dùng kiểu đó). Khi offline, nút lưu báo "Offline — not saved. Tap to retry" và giữ nguyên nội dung đã gõ, thay vì kẹt ở "Saving…". Badge due ở Home khi offline là số của lần online cuối.

## Notification & re-engagement

- Vấn đề gốc cần giải: quên hẳn một domain/project còn tồn tại (prospective-memory failure, gần như cueless) — khác với đơn thuần "thiếu kỷ luật ôn hằng ngày".
- Push tức thời cần là OS-level notification, không phụ thuộc việc có đang mở app hay không.
- **Bắt buộc trên iPhone**: ép flow Add to Home Screen trước khi bật được nhắc nhở (Web Push chỉ hoạt động từ iOS 16.4+ khi đã cài vào màn hình chính). Xin quyền notification gắn vào một hành động chạm cụ thể, không tự động bật khi load trang.
- **Một email digest cuối ngày duy nhất**, làm 3 việc:
  1. Báo cáo: số note mới hôm nay, số thẻ cần review, thẻ nào "chưa nhớ chắc" (Difficulty cao nhất hoặc đã lapse ≥1 lần trong 30 ngày gần nhất).
  2. Liệt kê domain im lặng quá N ngày dù không có thẻ đến hạn — phần trực tiếp giải quyết prospective-memory failure.
  3. Lưới an toàn: web push trên iOS được ghi nhận có thể âm thầm ngừng hoạt động mà không báo lỗi; email digest tự động bù vào nếu push chết.
- Quyết định: không build thêm kênh Telegram cho bản đầu — một kênh làm đủ ba việc thì không cần nhân đôi hạ tầng.

**[Đã build — chưa commit/deploy] Email digest** (`routes/digest.js`):
- Gửi qua SMTP bất kỳ bằng `nodemailer` (Gmail App Password, SES SMTP, …), cấu hình trong `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `DIGEST_TO`, `DIGEST_FROM`, `APP_URL` (xem `.env.example`). Chưa cấu hình thì bỏ qua và ghi log, không lỗi. **Cần Felix tự tạo và điền thông tin SMTP.**
- Mỗi ngày 1 lần vào giờ chỉnh được (mặc định 12:00 UTC = 21:00 Tokyo), chỉnh trên Stats → Notifications. `POST /api/digest/test` gửi ngay, `GET /api/digest/preview` xem nội dung.
- Nội dung: 24 giờ qua (thẻ mới, số lượt ôn), số thẻ due + số sắp due trong 24 giờ tới, "chưa nhớ chắc" (tối đa 8 thẻ, thẻ quên gần đây xếp trước), toàn bộ deck im lặng (không bị giới hạn renotify), và cảnh báo nếu không còn thiết bị nào đăng ký push.

## Cài đặt mặc định & câu hỏi còn mở

- **[Đã build — global, chưa theo domain] Ngưỡng "domain im lặng"**: mặc định 21 ngày, `renotify` mặc định 14 ngày để không nhắc lại mỗi ngày một khi đã bắn. Chỉnh qua `GET/PUT /api/settings/silence`. Hiện là 1 giá trị chung cho toàn app, chưa tách theo từng domain — để sau nếu thực tế dùng thấy cần.
- **[Đã build — chỉnh tay; chưa có simulator] (Settings, theo domain) Target retention**: mặc định 85% cho domain mới (trước khi có đủ dữ liệu chạy simulator) — thấp hơn mức 90% phổ biến, ưu tiên nhẹ khối lượng ôn ban đầu. Sau vài tuần, simulator tự đề xuất giá trị tối ưu; chỉnh tay trong menu ⋮ của deck.
- **(Nội bộ, không phải setting) Giới hạn thẻ mới**: 10 thẻ mới/deck/ngày khi thêm thẻ lẻ (`NEW_PER_DAY` trong `fsrs.js`).
- **(Nội bộ, không phải setting) "Chưa nhớ chắc"**: Difficulty thuộc 25% cao nhất, hoặc đã lapse ≥1 lần trong 30 ngày gần nhất — chỉ phục vụ báo cáo cuối ngày, không phải quyết định người dùng cần đưa ra nên không cần phơi ra UI.
- **(Mở, chưa cần cho MVP) Hỗ trợ import .apkg của Anki**: để bản sau, không chặn bản đầu.

## Hiện trạng đã build (repo mrdaiking/flash-card)

**Tech stack thực tế:** Node.js + Express, SQLite (better-sqlite3, 1 file), auth PIN + JWT, tự host trên EC2 sau Cloudflare Tunnel, PWA (manifest + service worker, cache offline, background sync), web-push đã chạy thật (VAPID + bảng push_subscriptions).

**Khớp tốt với spec:**

- Decks phẳng — đúng tinh thần Domain, không lồng subdeck kiểu Anki.
- Backend chạy qua Cloudflare Tunnel, PWA gọi qua internet thật, không phải localhost — khớp yêu cầu dùng được lúc đi tàu.
- Có bảng journal_entries (content + correction dán tay từ ChatGPT + words) — bản thủ công của ý tưởng "capture từ ChatGPT", chưa tự động hoá qua extension.
- Push notification không phải lý thuyết — đã có VAPID key, subscribe, gửi thật.

**[Đã build — chưa commit/deploy] Thuật toán đã chuyển sang FSRS-6.** Viết lại từ đầu (patch `fsrs-and-silence-reminder.patch` gốc không có trên máy). `sm2.js` bị xoá, thay bằng `fsrs.js` bọc `ts-fsrs`. Migration một lần khi khởi động, trong 1 transaction: thêm cột `stability, difficulty, reps, lapses, state, last_review`; thẻ đã từng ôn (SM-2 `interval > 0`) được seed S = interval, D suy ngược từ `ease_factor` (cách fsrs-rs làm cho Anki), `reps`/`lapses` đếm từ bảng `reviews`; `next_review` giữ nguyên hoàn toàn. Đã chạy thử trên bản sao DB production (180 thẻ): số thẻ due trước/sau bằng nhau (6 = 6), 0 thẻ đổi `next_review`, chạy lần 2 không làm gì (idempotent). Cột SM-2 cũ vẫn giữ; `interval` tiếp tục được ghi = số ngày hiện tại (stats "mature" dùng). Review offline mang theo `at` (thời điểm ôn thật) để FSRS tính đúng thời gian đã trôi qua.

**[Đã build — chưa commit/deploy] Domain-silence reminder**, độc lập hoàn toàn với `sendDueReminder`. Chạy mỗi ngày cùng khung giờ với nhắc due (`sendSilenceReminder` trong `routes/push.js`): hoạt động gần nhất của deck = max(review mới nhất, thẻ tạo mới nhất); vượt ngưỡng thì bắn push. `decks.silence_notified_at` + `renotify_days` để không nhắc lại mỗi ngày. Deck rỗng bị loại trừ. Ngưỡng chỉnh trên Stats; test tay qua nút "Test quiet-deck nudge" / `POST /api/push/test-silence`.

**Chưa có:** Chrome extension (Felix hoãn lại), tag (data model + cột tag khi import), simulator đề xuất target retention, offline cho thêm/sửa thẻ (quyết định không làm), archive Obsidian (không bắt buộc), import .apkg.

**Kiểm tra sau khi deploy lên EC2** (runbook cũ vẫn áp dụng): backup `data/cards.db` trước; sau `npm install` + `pm2 restart anki-pwa --update-env`, kiểm tra có đủ cột FSRS và `settings.silence_threshold_days = 21`, và số thẻ due bằng với bản backup.
