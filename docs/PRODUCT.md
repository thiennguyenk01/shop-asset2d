# Sản phẩm và quy tắc kinh doanh

Nghiệp vụ của dự án: mô hình kinh doanh, quy tắc Free/Premium, 21 danh mục, Lợi ích theo gói, dữ liệu demo, danh sách trang. Chuyển **nguyên văn** từ `CLAUDE.md` cũ (§5, §10, §11, §12) ngày 2026-11-15; câu đã lỗi thời giữ nguyên chữ, có dòng ghi chú ngay bên dưới. Yêu cầu gốc: `docs/requirements/ORIGINAL-BRIEF.md` (đối chiếu ở `BRIEF-STATUS.md`). Quyết định: `docs/DECISIONS.md`.

> **Dự án: Asset Game MMORPG 2D** (tên cũ: Eastern Fantasy Asset Marketplace) — website thương mại điện tử bán tài nguyên đồ họa game 2D (HD Pixel Art) phong cách phương Đông: Tiên hiệp/Tu tiên, Võ hiệp, Huyền huyễn, Thần thoại phương Đông, Dark Fantasy, MMORPG/RPG 2D.
>
> Đây là một **Marketplace đầy đủ** (tìm kiếm, xem trước, mua, tải xuống, thư viện cá nhân, Admin), không phải Landing Page.

## 1. Quy tắc kinh doanh

Mô hình **Freemium + bán lẻ từng Asset Pack (Pay-per-Asset)**. **Không** Membership, **không** Subscription, **không** Pro/Studio plan.

- **FREE**: nhãn FREE, giá hiển thị 0đ (từ 2026-11-20, theo người dùng "FREE chính là 0đ": ô giá hiện chữ **FREE** thay cho "0 ₫"; giá trong dữ liệu vẫn là 0 ₫), nút "Tải miễn phí". **Bắt buộc đăng nhập để tải** (đổi 2026-11-15, thay quyết định "Free tải không cần đăng nhập"):
  - **Chưa đăng nhập:** bấm "Tải miễn phí" mở **hộp mời** (con dấu 宝阁; lợi ích: lưu vào Thư viện, 2 lượt tải miễn phí, báo bản cập nhật; nút **"Đăng nhập để tải"** / **"Tạo tài khoản"** với `callbackUrl` → quay lại tự tải một lần). Không còn "Tải ngay, không lưu".
  - **Đã đăng nhập:** mỗi tài khoản tải mỗi bộ Free **tối đa 2 lần, trọn đời** (`FREE_DOWNLOADS_PER_PACK`), cộng lượt đã mua thêm cho bộ đó (4.6: **+2 lượt / 10.000 ₫** mỗi lần mua, theo từng bộ). Lần tải đầu tạo `Entitlement(source=FREE_CLAIM)` → bộ vào My Library; hết lượt bộ vẫn ở Thư viện nhưng không tải được. Mỗi lần tải ghi `DownloadLog`.
  - **PREMIUM** đã mua: tải **không giới hạn**; mọi tài khoản có chốt chống bot `DOWNLOAD_HOURLY_CAP` = 100 lượt/giờ (mọi bộ). Mọi lượt tải tăng `downloadCount`.
- **PREMIUM**: nhãn PREMIUM, giá riêng, nút "Thêm vào giỏ" và "Mua ngay". Chỉ tải được sau khi backend xác nhận thanh toán. Đã mua → vào My Library, tải lại được theo điều khoản giấy phép.
  > **Ghi chú khi chuyển file (2026-11-15):** "theo điều khoản giấy phép": trên giao diện nay gọi là "Lợi ích" của gói (DECISIONS #23).
- **Mỗi sản phẩm là một bộ asset trọn gói A→Z** (nhân vật, bản đồ, quái vật, kỹ năng, giao diện… — các danh mục là các phần bên trong bộ). **Chỉ bán nguyên bộ**, không bán lẻ từng phần.
- **Không có Bundle** (đã bỏ 2026-11-14 theo yêu cầu người dùng).
- Mua một sản phẩm không đồng nghĩa sở hữu sản phẩm khác.
- Giỏ hàng: không có số lượng; không cho thêm sản phẩm đã sở hữu; không cho thêm sản phẩm FREE; gộp giỏ khách vào giỏ tài khoản khi đăng nhập.
- Thanh toán yêu cầu đăng nhập (sản phẩm phải gắn với tài khoản để vào Library).

## 2. Danh mục 21 nhóm Assets (slug cố định)

**Từ 2026-11-14:** danh mục là **các phần bên trong mỗi bộ A→Z** (`ProductSection`), hiển thị trên trang chi tiết bộ và điều hướng bằng thanh Bottom Navigation dính dưới đáy. **Không còn trang `/category/[slug]` và không lọc theo danh mục ở Cửa hàng.** Mỗi danh mục có icon (`Category.iconKey`, map trong `src/components/product/category-icon.tsx`), mô tả VI/EN/ZH.

| # | slug | Tên | Nội dung chính |
|---|---|---|---|
| 01 | `characters` | Character – Nhân vật | Người chơi nam/nữ, NPC, môn phái, chiến binh, trang phục, giáp/phụ kiện; anim Idle/Walk/Run/Attack/Skill/Hit/Death |
| 02 | `maps-environments` | Map & Environment | Rừng, núi, sông hồ, thác, thành trì, làng, tông môn, tiên phủ, bí cảnh, hang động, chiến trường |
| 03 | `tilesets` | Tileset | Ground, Grass, Water, Wall, Floor, Road, Bridge, Cliff, Terrain, Decoration |
| 04 | `monsters-bosses` | Monster & Boss | Yêu thú, linh thú, ma thú, quái vật, boss bí cảnh/thế giới/môn phái, anim + hiệu ứng chiến đấu |
| 05 | `skills-vfx` | Skill & VFX | Kiếm khí, kiếm quang, chưởng pháp, hỏa cầu, băng tiễn, lôi điện, ma khí, huyết khí, pháp trận, hiệu ứng tấn công/chí mạng/trúng đòn |
| 06 | `equipment` | Equipment – Trang bị | Kiếm, đao, thương, áo giáp, mũ, nhẫn, vòng tay, dây chuyền, pháp bảo, linh khí, trang phục |
| 07 | `items` | Item – Vật phẩm | Đan dược, linh thạch, linh thảo, quặng, nguyên liệu, sách kỹ năng, rương báu, vật phẩm nhiệm vụ/bí cảnh |
| 08 | `ui` | UI – Giao diện game | Khung nhân vật, túi đồ, trang bị, kỹ năng, nhiệm vụ, minimap, bảng thông tin, cửa hàng, giao dịch, cường hóa, luyện đan, bảng tu vi |
| 09 | `icons` | Icons | Icon kỹ năng, vật phẩm, trang bị, thuộc tính, buff/debuff, môn phái, nhiệm vụ, tiền tệ |
| 10 | `environment-effects` | Animation & Environment Effects | Mưa, tuyết, sương, khói, lửa, thác, lá rơi, ánh sáng, cổng dịch chuyển, linh khí |
| 11 | `audio` | Audio – Âm thanh | Nhạc nền, chiến đấu, bước chân, kiếm chém, kỹ năng, quái vật, UI, thông báo |
| 12 | `fonts-text` | Fonts & Text | Font giao diện, thư pháp, sát thương, cấp độ, thông báo; phù văn, ký tự cổ, con dấu |
| 13 | `mounts-pets` | Mount & Pet | Ngựa, hạc, kỳ lân, rồng, phi kiếm, pháp bảo bay, linh thú đồng hành, pet chiến đấu |
| 14 | `social` | Social | Icon/huy hiệu bang hội, khung tên, danh hiệu, bong bóng chat, biểu tượng tổ đội, trạng thái người chơi |
| 15 | `pvp-war` | PvP & War | Đấu trường, chiến trường, cờ chiếm đóng, trụ phòng thủ, huy hiệu xếp hạng, icon PK, hiệu ứng thắng/thua |
| 16 | `cultivation` | Cultivation – Tu luyện | Pháp trận tu luyện, đột phá cảnh giới, thiên kiếp, lôi kiếp, linh khí hội tụ, kết đan, nguyên anh, phi thăng, hào quang cảnh giới |
| 17 | `crafting-gathering` | Crafting & Gathering | Lò luyện đan, đỉnh luyện khí, bàn chế tạo, mỏ quặng, linh thảo, nguyên liệu, hiệu ứng chế tạo |
| 18 | `world-maps` | World Map | Bản đồ thế giới/khu vực/môn phái, icon thành trì/bí cảnh, đường di chuyển/truyền tống, la bàn, vị trí người chơi |
| 19 | `ui-states` | UI States | Normal, Hover, Pressed, Disabled, Selected, Locked, Unlocked, Loading, Error, Success |
| 20 | `cinematic-story` | Cinematic & Story | Background hội thoại, chân dung NPC, khung hội thoại, minh họa nhiệm vụ, sự kiện, Boss, Loading/Login Screen |
| 21 | `technical` | Technical | Sprite Atlas, Animation Data, Collision Mask, Hitbox/Hurtbox, Navigation Data, Tile Collision, Sorting Layer, Particle/Audio Config, Asset Metadata |

## 3. Lợi ích, thông tin sản phẩm và dữ liệu demo

**Lợi ích theo gói (thay cho "Giấy phép"/"Điều khoản", từ 2026-11-14)**
- Chủ shop là cá nhân, không có đăng ký kinh doanh/G1–G3 → giao diện **không dùng chữ "Giấy phép"/"Điều khoản" và không nêu tên mức Cá nhân/Thương mại/Mở rộng**. Trang bộ asset có mục **"Lợi ích"** (cột mua + khối riêng + mục trên thanh dưới đáy), **chỉ hiện cột của gói đó** ("Lợi ích gói Free" hoặc "Lợi ích gói Premium"). 5 dòng, logic ở `src/lib/catalog/benefits.ts`:

  | Lợi ích | Free | Premium |
  |---|---|---|
  | Tải và sử dụng asset | ✓ | ✓ |
  | Chỉnh sửa asset (khách chọn màu, hiệu ứng… theo nhu cầu) | ✗ | ✓ |
  | Dùng trong game cá nhân | ✓ | ✓ |
  | Dùng trong game thương mại | ✗ | ✓ |
  | Sử dụng nhiều dự án | ✗ | ✓ |

  Bộ Free có thêm câu gợi ý chọn Premium; mọi bộ có dòng nhỏ "không được chia sẻ, phân phối lại hay bán lại file gốc".
- Dữ liệu: seed `License` code = `Product.type` (`FREE`/`PREMIUM`), seed tự gán theo loại. `allowModification` = "Chỉnh sửa asset" (tùy chỉnh theo nhu cầu); `allowCommercial`, `allowMultiProject` như tên. Nội dung `terms` vẫn lưu (snapshot đơn hàng sau này) nhưng không hiển thị. Luồng thực hiện "chỉnh sửa asset theo nhu cầu" cho khách Premium **chưa thiết kế** — hỏi người dùng khi làm tới.
- ~~Giai đoạn đầu: mỗi sản phẩm có một giấy phép mặc định… nhiều mức Personal / Commercial / Extended~~ — thay bằng dòng trên.
- Trang sản phẩm, giỏ hàng và checkout phải hiển thị rõ **trước khi mua**: dùng cho game thương mại? được chỉnh sửa? nhiều dự án? phân phối lại file gốc? bán lại/chia sẻ?
- Không mặc định mọi sản phẩm cùng quyền. Personal/Commercial/Extended chỉ là mẫu tham khảo — chủ website tự quyết điều khoản thật.
  > **Ghi chú khi chuyển file (2026-11-15):** Câu thứ hai ở dòng trên, về "Personal/Commercial/Extended chỉ là mẫu tham khảo", đã bị thay: giao diện không nêu tên các mức này, quyền theo gói Free / Premium (DECISIONS #21 → #22 → #23). Ý "không mặc định mọi sản phẩm cùng quyền" vẫn đúng (Free và Premium khác nhau).
- Entitlement và OrderItem lưu giấy phép tại thời điểm mua (snapshot).

**Thông tin sản phẩm bắt buộc:** tên, mô tả, thumbnail, gallery, danh sách file, số lượng asset, định dạng, kích thước/độ phân giải, phần mềm tương thích, phiên bản, license, giá, loại. Định dạng hỗ trợ: PNG, GIF, JPG, WebP, PSD, Aseprite, WAV, MP3, OGG, JSON, ...
> **Ghi chú khi chuyển file (2026-11-15):** "license" trên giao diện là mục "Lợi ích" (DECISIONS #23).

**Gallery:** hỗ trợ PNG, GIF, WebP, JPG và video preview (MP4/WebM). Ảnh được quản lý qua `ProductMedia` để Admin thay ảnh Pixel Art HD thật sau này mà không sửa code.

**Dữ liệu demo**
- Chưa có ảnh sản phẩm chính thức → dùng **ảnh minh họa tạm có nhãn DEMO** (`ProductMedia.isPlaceholder = true`, overlay "DEMO" khi hiển thị). Không dùng ảnh minh họa giả làm sản phẩm thật.
- Sản phẩm seed có `isDemoData = true` và hiển thị nhãn "Dữ liệu demo / Demo data"; thông số minh họa không được trình bày như thật. File tải của sản phẩm demo là gói nhỏ chứa README ghi rõ DEMO.
- ~~Tối thiểu 25 sản phẩm theo danh mục~~ — thay bằng (2026-11-14): 10 bộ A→Z demo (8 PREMIUM, 2 FREE), mỗi bộ chứa 6–21 phần danh mục; tổng cộng mọi danh mục đều có mặt.
  > **Ghi chú khi nghiệm thu (2026-11-15):** Việc thay "tối thiểu 25 sản phẩm" bằng 10 bộ A→Z **chưa được người dùng xác nhận là quyết định** (REVIEW, xem `docs/requirements/BRIEF-STATUS.md` hàng §12). 10 bộ là hiện trạng dữ liệu seed.

## 4. Các trang và khu Admin (yêu cầu)

**Trang người dùng:** ~~Home~~ (đã bỏ 2026-11-14, Cửa hàng là trang đầu), Shop (tìm kiếm; lọc thể loại, phong cách, Free/Premium; khoảng giá ở thanh công cụ; sắp xếp mới/bán chạy/giá ↑↓; phân trang), Product Detail (gallery, demo video/GIF, các phần danh mục + Bottom Navigation, thông số, license, đánh giá, liên quan), Cart (coupon), Checkout (trạng thái giao dịch), My Library (Free đã nhận, đã mua, lịch sử, ngày mua, phiên bản, giấy phép, nút tải, hướng dẫn), Tài khoản (đăng ký, đăng nhập, đăng xuất, quên/đổi mật khẩu, hồ sơ, lịch sử đơn), About, Contact, FAQ, License & Terms, Privacy, Refund, 404.
> **Ghi chú khi chuyển file (2026-11-15):** About, FAQ, License & Terms, Privacy, Refund và chức năng đánh giá: **NOT SCHEDULED** (`docs/ROADMAP.md`). Contact là nút chat nổi (DECISIONS #20). "Quên mật khẩu": GĐ6 (DECISIONS #26); làm ở bước 6.2 (2026-11-20): trang Quên mật khẩu + trang Đặt mật khẩu mới từ link trong thư. *(2026-11-22, DECISIONS #57: đã làm 5 trang Giới thiệu, Câu hỏi thường gặp, Điều khoản sử dụng, Chính sách bảo mật, Chính sách hoàn tiền; "License & Terms" gộp vào Điều khoản sử dụng, quyền dùng từng bộ vẫn là mục Lợi ích (#23); nội dung là bản mẫu chờ người dùng sửa. Đánh giá và nhận xét vẫn NOT SCHEDULED.)*

**Admin:** sản phẩm (CRUD, ẩn/hiện, upload preview/GIF/video/file, giá, loại, danh mục, license, phiên bản, nổi bật), danh mục, đơn hàng (chi tiết, trạng thái, giao dịch, hoàn tiền), người dùng (thông tin, lịch sử mua, khóa), coupon, giấy phép, thống kê (doanh thu, đơn, sản phẩm, người dùng, bán chạy, Free tải nhiều, biểu đồ doanh thu theo thời gian), audit log.
> **Ghi chú khi chuyển file (2026-11-15):** Quản lý danh mục và quản lý giấy phép: **NOT SCHEDULED** (`docs/ROADMAP.md`). Các phần còn lại nằm trong kế hoạch GĐ5.

Mã giảm giá demo (DEMO10, DEMO200K, DEMOHETHAN, DEMOHETLUOT): xem `docs/PROGRESS.md`, bước 3.4.
