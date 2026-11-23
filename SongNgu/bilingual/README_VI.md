# C4 Reader — Đọc tài liệu song ngữ Anh–Việt

Bổ sung cho đúng project trong tệp `c4model.zip` được cung cấp. Tài liệu gốc: **Simon Brown / C4 model**. Bản dịch tiếng Việt phục vụ luyện đọc, không phải bản dịch chính thức. Nội dung tiếng Anh luôn là bản chuẩn.

## Mở và ghép vào repository hiện có

**Gói bổ sung:** chép thư mục `bilingual/` và tệp `DOC_SONG_NGU.html` vào **ngay thư mục chứa `index.html` tiếng Anh**. Không chép chúng vào `assets/`. Không xóa, thay thế hoặc ghi đè `.git` của repository đang dùng.

**Gói đầy đủ:** giải nén ra một thư mục riêng để xem thử. Gói này chứa toàn bộ 172 tệp nguồn/tài nguyên từ ZIP đầu vào, giữ nguyên từng byte, cùng các tệp mới; không chứa lịch sử, cấu hình hay remote `.git` của người dùng.

Mở `DOC_SONG_NGU.html`, hoặc mở trực tiếp `bilingual/index.html`. Trang đầu mặc định là Introduction; sau đó chương trình nhớ bài đọc gần nhất nếu trình duyệt cho lưu dữ liệu. Giữ nguyên các thư mục tài nguyên bên cạnh. Không cần Docker, Ruby/Jekyll, npm, API key hoặc bước build để sử dụng.

Khi phục vụ project như website tĩnh, địa chỉ bộ đọc là `<đường-dẫn-project>/bilingual/`. Liên kết trong ứng dụng dùng hash route, ví dụ `bilingual/index.html#/diagrams/container.html`. Không cần rewrite phía server. `index.html` tại thư mục gốc vẫn là trang tiếng Anh cũ: không tự thay trang chủ để bảo toàn nguồn.

Ứng dụng dùng CSS, JavaScript và dữ liệu dịch cục bộ, không dùng `fetch()` để tải JSON khi mở bằng `file://`. Ảnh cục bộ dùng lại từ project. Video/iframe, liên kết ngoài và một số tài nguyên bên ngoài của nội dung gốc vẫn có thể cần Internet. Chế độ “Bản EN gốc” mở trang gốc chưa thay đổi, vì vậy các phụ thuộc mạng vốn có của trang đó cũng không được thay đổi.

## Các tính năng đã có

- **24 trang, 566 đơn vị nội dung dịch**, gồm tiêu đề, đoạn văn, mục danh sách, ô bảng và danh sách công cụ động. Trang ví dụ tương tác không được dịch hoặc chỉnh sửa. Văn bản nằm trong hình ảnh giữ nguyên.
- **Song song:** luôn đọc được cả hai cột. **Luyện đọc (mặc định):** che bản dịch; hover hiện cụm nghĩa đang tra, hoặc chủ động mở đoạn. **Thử thách:** không lộ nghĩa chỉ vì hover; cần nhấn Hiện đoạn.
- **986 cặp đối chiếu cụm nghĩa tại các vị trí trong tài liệu**, không phải 986 từ vựng khác nhau và không phải mọi từ đều có mapping riêng. Trong số đó, Introduction có 133 cặp biên soạn thủ công; các cặp còn lại dùng thuật ngữ và nghĩa tương ứng trong cùng đơn vị dịch. Những chỗ chưa có đối chiếu riêng được ghi rõ **ĐỐI CHIẾU CẢ ĐOẠN**. Không lấy vị trí từ thứ n ở hai ngôn ngữ làm cặp dịch.
- Hover hoặc chạm văn bản để chọn; nhấn để ghim; `Esc` để bỏ ghim. Liên kết vẫn giữ chức năng mở trang: với từ nằm trong liên kết, dùng nút Ghim thay vì nhấn liên kết.
- Highlight bằng `Range` và CSS Custom Highlight API, không bọc thêm span vào văn bản tiếng Anh. Với trình duyệt thiếu API, dùng lớp tô sáng dự phòng không thay đổi nội dung tiếng Anh; chế độ Luyện đọc khi đó có thể hiện cả đoạn dịch.
- Cuộn độc lập hoặc bật **Đồng bộ cuộn** theo đoạn. Hover không tự cuộn. Nút **Tới bản dịch** đưa cột phải đến đúng đoạn đang chọn. Khung tra nghĩa giữ kích thước cố định; nội dung dài cuộn bên trong thay vì co giãn trang.
- **Sổ từ vựng:** lưu cụm/đoạn, nghĩa và ngữ cảnh gốc; chống trùng cùng cụm ở cùng nguồn; tìm kiếm, đánh dấu Đã nhớ/Cần ôn, xóa, ôn tập bằng thẻ lật, xuất/nhập JSON. Tối đa 2.000 mục, tệp nhập dưới 5 MB.
- **Từ điển 105 mục** giải thích trong ngữ cảnh C4. Không phải từ điển tiếng Anh tổng quát và không tra nghĩa trực tuyến.
- **Nghe tiếng Anh:** phát phần đang chọn ở 0,75× / 1× / 1,25×, có nút dừng. Cần thiết bị có giọng đọc tiếng Anh; ứng dụng ưu tiên giọng cục bộ. Giọng do trình duyệt cung cấp có thể dùng mạng. Âm thanh trên thiết bị của người dùng chưa được kiểm thử.
- Nhớ vị trí đọc, bài gần nhất, tùy chọn; đánh dấu đã đọc và số lần **chủ động** mở đoạn. Các số này ghi nhận thao tác, **không đánh giá trình độ**.
- Giữ chức năng Modelling/Diagramming ở Tooling và đồng bộ bộ lọc hai cột.

## Cách luyện đọc

Đọc câu tiếng Anh trước. Gặp cụm khó thì hover, nhấn để ghim, rồi nhìn phần được tô sáng ở cột phải hoặc nghĩa trong khung dưới. Khi chưa hiểu cả câu/đoạn, nhấn **Hiện đoạn**. Lưu những cụm cần học; sau đó ẩn bản dịch và đọc lại. Sổ từ vựng → Ôn tập cho phép tự nhớ nghĩa trước khi lật thẻ.

`T`: hiện/ẩn đoạn đang chọn. `S`: lưu. `Esc`: bỏ ghim. `Shift + ↑/↓`: chọn đoạn bằng bàn phím. Không áp dụng phím tắt chữ khi đang nhập vào ô tìm kiếm. Trên màn hình cảm ứng, chạm thay cho hover.

## Bảo toàn nguồn

Các tệp gốc trên đĩa không bị sửa. `content/source-integrity.json` ghi đường dẫn, kích thước và SHA-256 của **172 tệp** trong bản upload, không bao gồm `.git`. Kết quả đối chiếu tại thời điểm bàn giao: **172/172 khớp**, không mất tệp.

Bộ đọc lấy nguyên fragment `<main>…</main>` từ từng trang vào dữ liệu riêng. Khi hiển thị, chỉ giải quyết đường dẫn tài nguyên/liên kết theo vị trí gốc và gắn sự kiện ở lớp ứng dụng. Nội dung, thứ tự thẻ và text node tiếng Anh được đối chiếu; không dịch đè hoặc dựng lại câu tiếng Anh. Với Tooling, bảng được lấy từ đầu ra của đoạn script sẵn có; bộ lọc được nối vào giao diện mới. Bản dịch chỉ được gắn trong cây DOM riêng của cột Việt.

Khung đọc hai cột có CSS riêng để phục vụ học; không tuyên bố giao diện mới giống từng pixel với website tiếng Anh một cột. Nút **Bản EN gốc** luôn đưa về đúng HTML gốc.

Thông tin nguồn và giấy phép của bản gốc được giữ trong các tệp gốc. Bản dịch ghi nhận Simon Brown, C4 model và CC BY 4.0. Tên công cụ, URL, mã, hình ảnh và nội dung lịch sử không được tự cập nhật hay “sửa đúng” theo kiến thức bên ngoài.

## Dữ liệu học và riêng tư

Không có tài khoản, backend, dịch vụ AI hoặc tracking do bộ đọc mới bổ sung. Từ đã lưu, vị trí đọc và tùy chọn dùng `localStorage` của trình duyệt. Khi trình duyệt chặn lưu trữ, ứng dụng vẫn đọc được và thông báo rằng dữ liệu chỉ ở trong phiên đang mở.

Với `file://`, khả năng lưu dữ liệu có thể khác giữa trình duyệt; đổi đường dẫn thư mục hoặc trình duyệt cũng có thể làm bạn không thấy dữ liệu đã lưu. **Dùng Xuất JSON trước khi chuyển máy, đổi đường dẫn hoặc xóa dữ liệu trình duyệt.** Nhập JSON ghép các mục mới, không nhân đôi từ đã có. Tệp sao lưu không bao gồm toàn bộ tài liệu.

Ảnh/video/liên kết bên ngoài được giữ theo nguồn và có thể liên hệ máy chủ của bên thứ ba. Giọng đọc không cục bộ cũng có thể dùng dịch vụ của trình duyệt/hệ điều hành. Bộ đọc không gửi sổ từ vựng tới một máy chủ riêng.

## Cấu trúc mã

```text
DOC_SONG_NGU.html                 Lối mở mới; không thay index.html gốc
bilingual/
  index.html                     Khung ứng dụng
  assets/
    reader.css                   Giao diện, responsive, highlight
    reader.js                    Điều hướng, tương tác, lưu trữ, ôn tập
    reader-data.js               Dữ liệu đã build; mở được không cần fetch
  content/
    source-snapshot.json         Snapshot nguyên văn và đơn vị đối chiếu
    source-integrity.json        Hash của các tệp đầu vào
    translations.vi.json        Bản dịch theo trang/đơn vị
    alignment.json              Các cặp nghĩa biên soạn chi tiết
    glossary.json               Từ điển ngữ cảnh
    coverage.json               Thống kê độ bao phủ
  tools/
    build_data.py                Tạo lại reader-data.js; không sửa EN
    verify_source.py             So hash nguồn, chỉ đọc
  tests/
    ui_tests.py                  Kiểm thử Chromium trong bộ nhớ
    ui-results.json              Kết quả 57 kiểm tra giao diện
    integrity-results.json       Kết quả đối chiếu tệp và tài nguyên
```

Không cần Python để xem. Khi chỉnh dữ liệu dịch hoặc mapping, dùng Python 3.9+:

```bash
python bilingual/tools/build_data.py
python bilingual/tools/verify_source.py
```

`translations.vi.json` lưu các đoạn theo đúng thứ tự snapshot. Mã `[[0|chữ liên kết]]` trỏ tới liên kết số 0 trong đơn vị nguồn tương ứng. Không chèn HTML tùy ý vào bản dịch. `alignment.json` dùng cụm EN và một hay nhiều cụm VI; trường occurrence chỉ rõ lần xuất hiện khi cần. Trình build kiểm tra nội dung nguồn, số đoạn, liên kết và vị trí mapping; nguồn khác snapshot sẽ bị từ chối thay vì áp bản dịch vào văn bản khác. Sau thay đổi nguồn cần biên soạn lại snapshot/bản dịch/mapping một cách chủ động, không chỉ đổi hash để bỏ qua kiểm tra.

Chạy kiểm thử bổ sung bằng Python + Playwright + Chromium:

```bash
python -m pip install playwright
python -m playwright install chromium
python bilingual/tests/ui_tests.py
```

Có thể đặt `CHROMIUM_PATH` nếu đã có trình duyệt. Kết quả mới vào `bilingual/tests/results/`. Đây là công cụ phát triển tùy chọn, không phải điều kiện sử dụng bộ đọc.

## Kiểm thử và giới hạn đã biết

**Đã đạt 57/57 kiểm thử giao diện bằng Chromium**, nạp HTML/CSS/JS thật vào document trong bộ nhớ. Kiểm tra cả 24 trang, cấu trúc/text node tiếng Anh, mapping hover, ghim, bố cục dock, ba chế độ, cuộn, sổ từ, ôn tập, xuất/nhập, xử lý dữ liệu nhập không tin cậy, bộ lọc Tooling, chế độ dự phòng, màn hình 390×844 và trường hợp lưu trữ bị chặn. **357 tham chiếu cục bộ trong bài viết** được kiểm tra có tệp đích.

**Không đồng nghĩa đã xác minh mọi môi trường.** Chính sách môi trường kiểm thử chặn điều hướng `file://` và HTTP; vì vậy chưa kiểm thử thao tác mở tệp trực tiếp hoặc tải qua website thật. Các bài kiểm tra lưu/khôi phục dùng kho lưu trữ mô phỏng; chưa xác nhận `localStorage` bền vững trên máy người dùng. Âm thanh TTS và nội dung video bên ngoài chưa được nghe/xem kiểm chứng. Ảnh chụp giao diện lấy từ môi trường Chromium nói trên, không phải hình thiết kế minh họa.

Không có dịch khi đang chạy, không có ánh xạ chính xác cho mọi từ, không chỉnh sửa ảnh để dịch chữ trong ảnh. Chưa triển khai phân tích ngữ pháp bằng AI, bài kiểm tra đọc hiểu tự chấm, đồng bộ đa thiết bị, thống kê trình độ hoặc lịch ôn tự động. Flashcard chỉ dùng dữ liệu bạn đã lưu.

Một liên kết neo vốn có trong FAQ trỏ đến `tooling#diagramming-vs-modelling`, nhưng nguồn không có mục neo tương ứng. Bộ đọc giữ đích gốc và thông báo neo không tồn tại thay vì tự thêm/sửa nội dung.
