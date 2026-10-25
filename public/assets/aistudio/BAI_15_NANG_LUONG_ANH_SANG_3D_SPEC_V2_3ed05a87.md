# BÀI 15 — NĂNG LƯỢNG ÁNH SÁNG
## Bản đặc tả V2: Mô phỏng 3D thí nghiệm thu năng lượng từ ánh sáng

**Tên file:** `BAI_15_NANG_LUONG_ANH_SANG_3D_SPEC_V2.md`  
**Phiên bản:** 2.0 — rà soát khoa học, thiết bị, mô hình hiển thị và kiểm thử  
**Đối tượng:** Khoa học tự nhiên 7  
**Môi trường đích:** Google AI Studio Build, Gemini 4 Argon, Three.js 3D scenes nếu có  
**Đầu ra mong muốn:** Ứng dụng web 3D tương tác, ưu tiên iPhone/Android, vẫn dùng được trên máy tính

---

## 0. Các điểm hiệu chỉnh quan trọng so với V1

1. **Tách đồ họa khỏi vật lí:** ánh sáng, bóng đổ và hiệu ứng trong Three.js chỉ phục vụ kết xuất. Chúng không được tự quyết định dòng điện. Mô hình vật lí phải tính mức chiếu sáng hữu hiệu dựa trên vị trí, hướng, độ sáng, vùng nhận sáng và vật cản.
2. **Mô hình pin quang điện đúng hơn:** pin quang điện tạo ra điện áp và dòng điện khi được chiếu sáng; dòng chạy qua điện kế còn phụ thuộc mạch ngoài và tải. Không dùng quy tắc “đèn bật thì kim luôn lệch” nếu ánh sáng không chiếu tới pin hoặc mạch bị hở.
3. **Điện kế:** góc lệch phải phụ thuộc dòng điện có dấu, độ nhạy và giới hạn thang đo. Không gán góc lệch ngẫu nhiên hoặc tuyên bố số đo thực khi chưa hiệu chuẩn.
4. **Chùm sáng trên hình:** hình nón màu cam trong SGK là biểu diễn trực quan đường đi của ánh sáng. Trong không khí sạch, chùm sáng không tự nhìn thấy rõ từ bên cạnh nếu không có tán xạ. Vì vậy, tách ánh sáng thực dùng để chiếu sáng bề mặt khỏi lớp chùm sáng minh họa có thể bật/tắt.
5. **Khoảng cách:** không áp dụng máy móc định luật nghịch đảo bình phương cho mọi khoảng cách của một đèn có kích thước hữu hạn. Dùng mô hình giảm cường độ định tính đã giới hạn, và chỉ dùng \(1/r^2\) như gần đúng khi giả thiết nguồn điểm đủ xa.
6. **Môi trường 3D:** ánh sáng của phòng để làm đẹp hình ảnh không được tính là ánh sáng chiếu vào pin quang điện. Chỉ nguồn sáng thí nghiệm và nguồn sáng môi trường được mô phỏng rõ ràng mới tác động đến mô hình vật lí.
7. **Mức độ khẳng định:** chưa có mã sản phẩm, thông số pin và điện kế thì mô phỏng chỉ là định tính/chuẩn hóa, không phải bản sao số đã hiệu chuẩn của bộ dụng cụ thật.

---

## 1. Căn cứ SGK và mục tiêu học tập

Hai ảnh do người dùng cung cấp là Bài 15 “Năng lượng ánh sáng. Tia sáng, vùng tối”, Hình 15.1 “Thí nghiệm thu năng lượng từ ánh sáng”, SGK Khoa học tự nhiên 7 — Kết nối tri thức với cuộc sống.

Nội dung chính được thể hiện:
- Khi chưa bật đèn chiếu, kim điện kế ở vạch 0.
- Khi bật đèn chiếu vào pin quang điện, kim điện kế lệch.
- Thí nghiệm minh họa việc pin quang điện nhận năng lượng ánh sáng và chuyển hóa một phần năng lượng đó thành điện năng.

### Mục tiêu mô phỏng

Học sinh có thể:
1. Nhận diện đúng đèn chiếu, pin quang điện, điện kế, dây nối và giá đỡ.
2. Quan sát sự khác biệt giữa trạng thái chưa chiếu sáng và đang chiếu sáng.
3. Trực tiếp bật/tắt đèn và thay đổi cách chiếu.
4. Thấy rõ rằng ánh sáng cần đến được vùng nhận sáng của pin và mạch phải kín để dòng điện đi qua điện kế.
5. Khám phá định tính tác động của cường độ sáng, khoảng cách, góc tới và vật chắn.
6. Giải thích được chuỗi nhân quả: ánh sáng hấp thụ trong vật liệu bán dẫn → tạo hạt tải điện → dòng điện trong mạch ngoài → kim điện kế lệch.

Không yêu cầu mô phỏng vi mô electron–lỗ trống như một mô hình lượng tử đầy đủ. Nếu thêm hình giải thích hạt tải điện thì đó phải là **lớp minh họa khái niệm**, không được mô tả là hình ảnh trực tiếp quan sát được bên trong pin.

---

## 2. Nghiên cứu và mức độ xác minh của thiết bị

### 2.1. Đèn chiếu

Tạo đèn chiếu thí nghiệm kiểu phòng học:
- Vỏ đèn nhỏ, mặt phát sáng hoặc cửa chiếu.
- Giá đỡ có chân đế và thanh đỡ.
- Dây cấp điện đi về nguồn/công tắc.
- Có nút bật/tắt.
- Có thể điều chỉnh hướng và khoảng cách bằng cơ cấu kéo/khớp xoay trong giới hạn hợp lí.

Ảnh SGK không xác định rõ hãng, model, công suất, phổ phát xạ hoặc hình dạng bên trong của đèn. Không bịa các thông số này. Mô hình ngoài chỉ cần gần với dụng cụ giáo dục trong ảnh.

### 2.2. Pin quang điện

Dùng mô-đun pin quang điện nhỏ trong phòng thí nghiệm, phù hợp tỉ lệ với đèn và điện kế:
- Mặt nhận sáng màu xanh đậm/đen hoặc xanh lam theo hình tham khảo.
- Khung và tấm nền đơn giản.
- Các đầu nối điện đặt ở cạnh hoặc mặt sau một cách hợp lí.
- Có giá đỡ để định hướng mặt nhận sáng về nguồn đèn.

**Không nhầm pin quang điện với pin lưu trữ hóa học.** Pin quang điện là linh kiện bán dẫn chuyển đổi năng lượng ánh sáng thành điện năng. Trong thực tế, điện áp/dòng điện phụ thuộc cấu trúc cell, phổ và cường độ ánh sáng, nhiệt độ, trạng thái mạch và tải.

Ảnh SGK không cho biết chính xác loại vật liệu, công suất, đường đặc tính I–V hay hiệu suất. Vì vậy, không gán số liệu thực tế cho mô-đun trong mô phỏng nếu chưa có datasheet của đúng linh kiện.

### 2.3. Điện kế kim

Dựng thiết bị tương tự hình:
- Hộp hình chữ nhật có vỏ và mặt kính.
- Thang kim cong với vạch chia rõ.
- Vị trí 0 ở giữa nếu mô phỏng loại điện kế zero-center như hình tham khảo.
- Kim, trục quay và cọc nối ở phía dưới.
- Kim phải quay đúng tâm, di chuyển mượt có giảm chấn nhẹ.

Hình SGK cho thấy kim chuyển khỏi 0 khi pin được chiếu sáng; cách đánh số thang không đủ để xác nhận đơn vị và độ nhạy của model. Vì vậy:
- Dùng thang chia không đơn vị hoặc các vạch tương đối.
- Không tự gắn đơn vị A/mA/µA nếu chưa xác minh.
- Không tuyên bố độ lệch cụ thể tương ứng một dòng điện thực nếu chưa hiệu chuẩn.
- Quy ước dây nối mặc định phải làm kim lệch về phía thể hiện trong sơ đồ, nhưng cần giữ quy ước dấu nhất quán. Nếu hoán đổi hai dây, chiều lệch có thể đổi.

Về nguyên lí, trong vùng làm việc tuyến tính, độ lệch kim của điện kế tương tự tỉ lệ với dòng điện đi qua nó. Điều này chỉ được dùng định lượng khi biết độ nhạy và giới hạn thang đo của thiết bị. (Tham khảo OpenStax, mục Analog Meters: Galvanometers.)

### 2.4. Dây nối và mặt bàn

- Hai dây nối tạo mạch kín từ hai cực pin quang điện qua điện kế.
- Mỗi đầu dây phải kết nối tại cọc cụ thể; không vẽ dây như vật trang trí không có đầu nối.
- Không tự bịa màu dây như một chuẩn điện áp; màu chỉ là quy ước trực quan của mô phỏng.
- Mặt bàn trung tính, đủ tương phản, không làm chìm các bộ phận.

### 2.5. Điều gì không thể xác minh từ ảnh

Chưa thể khẳng định chính xác:
- Nhà sản xuất/model của pin quang điện.
- Điện trở trong, dòng ngắn mạch, điện áp hở mạch hay công suất của pin.
- Độ nhạy, điện trở và đơn vị thang đo của điện kế.
- Công suất, phổ sáng và phân bố chùm sáng của đèn.
- Hình dạng cơ khí bên trong các thiết bị.

Tất cả phải được ghi là giả định mô phỏng. Không sử dụng logo/model giả.

---

## 3. Nguyên lí vật lí cần mô phỏng đúng

### 3.1. Hiệu ứng quang điện trong pin quang điện

Ở mức phù hợp KHTN 7:
1. Ánh sáng tới mặt pin.
2. Vật liệu bán dẫn hấp thụ một phần năng lượng ánh sáng.
3. Quá trình quang điện tạo các hạt tải điện trong vật liệu.
4. Cấu trúc bên trong cell giúp tách và thu hạt tải điện.
5. Khi mạch ngoài kín, dòng điện chạy qua điện kế và làm kim lệch.

Năng lượng ánh sáng không biến đổi toàn bộ thành điện năng; một phần có thể bị phản xạ, truyền qua hoặc chuyển thành nhiệt. Không vẽ một dòng sáng biến thành “dòng điện phát sáng” chạy bên trong dây như thể đó là hiện tượng nhìn thấy bằng mắt.

### 3.2. Ánh sáng đến pin: mô hình hình học

Tính một đại lượng nội bộ `effectiveIrradiance` hoặc `normalizedIllumination` từ:
- `lampOn`: đèn có bật hay không.
- `lampIntensity`: cường độ nguồn do người dùng điều chỉnh.
- `distance`: khoảng cách từ vùng phát sáng đến mặt pin.
- `incidenceAngle`: góc giữa pháp tuyến bề mặt pin và hướng tia tới.
- `beamOverlap`: phần chùm sáng thực sự chồng lên vùng nhận sáng.
- `occlusion`: có vật cản ánh sáng hay không.
- `circuitClosed`: mạch điện ngoài có kín hay không.

Mô hình khái niệm:
\[
E_\text{eff}=E_0\,f_\text{distance}(r)\,f_\text{angle}(\theta)\,f_\text{overlap}\,f_\text{occlusion}
\]

Trong đó:
- \(E_0\) là mức nguồn sáng chuẩn hóa.
- Với chùm tia có hướng, có thể dùng \(f_\text{angle}=\max(0,\cos\theta)\) như gần đúng cho mặt nhận sáng phẳng khi tia tới có hướng xác định.
- \(f_\text{overlap}\) nằm trong khoảng 0–1, dựa trên phần chùm sáng chiếu vào vùng nhận sáng.
- \(f_\text{occlusion}=0\) nếu có vật cản đục chặn toàn bộ chùm sáng; nếu chắn một phần, giảm theo phần diện tích bị chắn.

**Khoảng cách:** không dùng định luật \(1/r^2\) như luật chính xác cho một đèn có kích thước hữu hạn ở khoảng cách rất gần. Có thể dùng đường cong giảm cường độ đã giới hạn để giữ mô phỏng ổn định; nếu dùng \(1/r^2\), phải ghi rõ đó là gần đúng nguồn điểm và chọn khoảng cách phù hợp. Thực tế phụ thuộc phân bố sáng của đèn và quang học của chóa/ống chiếu.

Mô hình hình học phải dùng cùng vị trí, hướng và góc chiếu với đối tượng đèn trong cảnh Three.js. Tuy nhiên, **không được đọc độ sáng pixel của canvas hoặc độ sáng của đèn render rồi suy ra dòng điện**. Tính toán vật lí phải có một module độc lập.

### 3.3. Dòng điện và độ lệch điện kế

Trong mô hình học tập:
- Dòng quang điện tăng theo mức chiếu sáng hữu hiệu trong khoảng hoạt động minh họa, khi các điều kiện còn lại giữ nguyên.
- Quan hệ chính xác phụ thuộc pin, nhiệt độ, phổ sáng và tải; không khẳng định tuyến tính tuyệt đối ở mọi điều kiện.
- Nếu mạch bị hở, dòng qua điện kế bằng 0 dù pin có thể vẫn tạo điện áp hở mạch.
- Khi không có ánh sáng thí nghiệm và đã kiểm soát ánh sáng môi trường, dòng qua điện kế về gần 0.

Mô hình tối giản:
\[
I_\text{model}=I_\text{scale}\,F(E_\text{eff})\,\chi_\text{closed}
\]
trong đó \(F\) là hàm đơn điệu tăng, có giới hạn; \(\chi_\text{closed}=1\) khi mạch kín và bằng 0 khi mạch hở.

Nếu không có thông số linh kiện, `I_model` chỉ là đại lượng chuẩn hóa, không hiển thị như ampe thật. Không tự gán trị số dòng điện.

Góc lệch kim:
\[
\theta_\text{needle}=\operatorname{clamp}(K I_\text{model},-\theta_\text{max},+\theta_\text{max})
\]
với \(K\) là hệ số độ nhạy mô phỏng và \(\theta_\text{max}\) là góc giới hạn cơ học. Nếu dùng thang center-zero, dấu dòng điện được quyết định bởi quy ước cực tính/đấu dây. Không cho kim vượt vạch cuối hoặc tự dao động mãi.

### 3.4. Ánh sáng môi trường

Trong lớp học thật, ánh sáng môi trường có thể khiến pin nhận được một lượng sáng nhỏ dù đèn chiếu đã tắt. Để phù hợp với kết quả lý tưởng của SGK:
- Mặc định chế độ **Thí nghiệm SGK** giả định ánh sáng môi trường đã được giảm/khống chế, nên kim gần 0 khi đèn tắt.
- Có thể thêm chế độ nâng cao **Có ánh sáng môi trường** để thể hiện kim vẫn lệch nhẹ nếu pin còn được chiếu sáng.
- Ánh sáng môi trường chỉ ảnh hưởng vật lí khi được bật riêng trong model. Ánh sáng trang trí của phòng 3D không được tính vào `effectiveIrradiance`.

### 3.5. Công tắc và vật chắn

- Khi tắt đèn, đầu ra quang điện do đèn trong thí nghiệm giảm về mức nền.
- Khi chặn hoàn toàn ánh sáng trước pin, mức chiếu sáng hữu hiệu từ đèn đó bằng 0.
- Khi xoay pin sao cho mặt nhận sáng không hướng về đèn, mức chiếu sáng hữu hiệu giảm theo góc.
- Khi mạch hở, kim không bị dòng điện từ pin làm lệch.
- Khi tháo vật chắn, ánh sáng có thể tới pin và kim lệch trở lại nếu đèn bật và mạch kín.

Các hành vi phải dựa trên trạng thái và hình học thực, không chỉ dựa trên nút vừa nhấn.

---

## 4. Đồ họa phải phân biệt “mô hình vật lí” và “lớp minh họa”

### 4.1. Chùm sáng nhìn thấy

Trong không khí sạch, đường đi của ánh sáng thường không nhìn thấy rõ từ bên cạnh nếu không có bụi/sương/tán xạ. Hình SGK dùng vùng tam giác màu cam để minh họa chùm sáng.

Vì vậy tạo hai chế độ:
- **Chế độ thực tế:** không vẽ một thể tích sáng đục trong không khí; thể hiện đèn phát sáng và vùng được chiếu trên bề mặt pin bằng ánh sáng/đổ sáng phù hợp.
- **Chế độ giải thích:** thêm hình nón/miền trong suốt hoặc các tia mảnh để học sinh thấy hướng đi của ánh sáng. Hiển thị nhãn “Chùm sáng minh họa — không phải tia nhìn thấy rõ trong không khí sạch”.

Hiệu ứng minh họa phải tắt/bật riêng, không làm thay đổi `effectiveIrradiance`.

### 4.2. Vật liệu và chi tiết

**Đèn chiếu**
- Thân đèn dạng thiết bị phòng thí nghiệm nhỏ.
- Vỏ, lỗ/mặt phát sáng, công tắc, chân đế và dây nguồn có hình dạng hợp lí.
- Nguồn sáng render phải đồng bộ với bật/tắt đèn và hướng chiếu mô hình.

**Pin quang điện**
- Module nhỏ hình chữ nhật như trong sơ đồ.
- Mặt cell màu xanh đậm/đen/xanh lam; có thể có các đường dẫn kim loại tinh tế nếu phù hợp.
- Có viền, mặt kính phẳng, mặt sau và cọc nối.
- Không biến thành một tấm pin mặt trời mái nhà quá lớn hay thêm nhiều cell không giống thiết bị minh họa.
- Mặt nhận sáng được đánh dấu khi chế độ hướng dẫn bật.

**Điện kế**
- Hộp máy, mặt thang, vạch chia, tâm trục, kim và cọc nối.
- Thang nhìn rõ ở cả chế độ toàn cảnh và cận cảnh.
- Số 0 ở giữa như hình tham khảo; các số/vạch chỉ là thang tương đối nếu chưa biết model.
- Kim là mesh/đối tượng hiển thị có điểm quay tại tâm đúng, không đặt bằng một đường vẽ nổi sai vị trí.

**Dây nối**
- Dây cong mềm, đi sát mặt bàn và vào đúng cọc.
- Không có đoạn dây lơ lửng không lý do hoặc xuyên qua vỏ thiết bị.
- Các hạt/ mũi tên biểu diễn dòng điện, nếu có, là lớp giải thích có thể tắt; không phải ánh sáng thực phát ra từ dây.

### 4.3. Chất lượng hình ảnh

- Đồ họa kiểu game 3D chất lượng cao nhưng không lấn át thiết bị.
- PBR vừa phải: nhựa nhám, kim loại, kính và dây cách điện.
- Ánh sáng key/fill mềm, bóng đổ rõ vừa phải, vật thể có chiều sâu.
- Không dùng bloom mạnh, flare hoặc motion blur làm mờ kim/vạch chia.
- Chữ và số liệu dùng UI sắc nét, không vẽ thành texture chữ nhỏ trên mặt cong.
- Không thêm ốc vít, cổng điện, dây hoặc bộ phận giả để “trông công nghệ hơn”.
- Camera mặc định thấy cả đèn, pin, dây và điện kế; có `Toàn cảnh`, `Cận cảnh pin`, `Cận cảnh điện kế`, `Khôi phục góc nhìn`.

---

## 5. Tương tác phải có ý nghĩa

### 5.1. Điều khiển cơ bản
- `Bật/Tắt đèn`
- Thanh trượt `Độ sáng đèn` (chuẩn hóa, không ghi lux nếu chưa hiệu chuẩn)
- `Tăng/Giảm khoảng cách`
- `Điều chỉnh hướng chiếu`
- `Xoay mặt pin quang điện`
- `Bật/Tắt vật chắn ánh sáng`
- `Đóng/Mở mạch` trong chế độ khám phá
- `Ẩn/Hiện chùm sáng minh họa`
- `Ẩn/Hiện nhãn`
- `Đặt lại thí nghiệm`

Các bộ phận chỉ dịch chuyển trong phạm vi cơ khí hợp lí, có giới hạn tránh xuyên vật thể. Cung cấp nút tăng/giảm như phương án dự phòng cho thao tác kéo trên điện thoại.

### 5.2. Bảng trạng thái khoa học
Hiển thị:
- Đèn: bật/tắt.
- Ánh sáng hữu hiệu tới pin: không có/thấp/vừa/cao.
- Mạch ngoài: kín/hở.
- Đầu ra mô phỏng: không đáng kể/có dòng điện tương đối.
- Điện kế: ở 0/ lệch theo chiều quy ước.
- Giải thích một câu dựa trên trạng thái thật.

Không hiển thị một con số như `0.37 A` hoặc `250 lux` nếu chưa có thông số để hiệu chuẩn. Có thể hiển thị thanh mức tương đối `0–100% mô hình`, kèm ghi chú đây là thang chuẩn hóa.

### 5.3. Kịch bản kiểm tra
1. **Đèn tắt, mạch kín:** kim ở gần 0 trong chế độ SGK.
2. **Đèn bật, hướng đúng, mặt pin nhận sáng, mạch kín:** kim lệch.
3. **Đèn bật nhưng chùm sáng không chạm pin:** kim không lệch đáng kể do nguồn này.
4. **Đèn bật nhưng pin bị chắn sáng:** kim giảm về gần 0.
5. **Đèn bật và pin quay nghiêng:** mức lệch giảm theo mức chiếu sáng hữu hiệu.
6. **Đèn bật nhưng mạch hở:** không có dòng qua điện kế; kim không lệch do dòng mạch.
7. **Tăng độ sáng trong khoảng mô hình:** mức đầu ra tăng, kim lệch xa hơn cho đến giới hạn thang.
8. **Tắt đèn:** kim trở về mức nền.
9. **Đảo hai dây điện kế trong chế độ nâng cao:** hướng lệch đảo nếu model điện kế center-zero và quy ước đấu dây được áp dụng.
10. **Đặt lại:** đèn, vị trí và trạng thái trở về cấu hình ban đầu; không còn hoạt ảnh cũ.

---

## 6. Thiết kế phần mềm: một nguồn trạng thái cho cả vật lí và đồ họa

Tách thành:
- `ExperimentState`: trạng thái thí nghiệm.
- `LightSourceModel`: bật/tắt, cường độ, vị trí, hướng, góc chùm.
- `IlluminationModel`: khoảng cách, góc tới, overlap và che khuất.
- `PhotovoltaicModel`: đầu ra chuẩn hóa của pin theo mức chiếu sáng và trạng thái mạch.
- `CircuitModel`: mạch kín/hở và quy ước dây.
- `GalvanometerModel`: dòng điện có dấu, độ nhạy, góc lệch và giảm chấn.
- `ThreeScene`: geometry, material, camera và render.
- `UIControls`: nút, slider, nhãn, panel, trợ giúp.

Mọi lần cập nhật:
1. Lấy trạng thái vật thể.
2. Tính mức chiếu sáng hữu hiệu.
3. Tính đầu ra quang điện định tính.
4. Kiểm tra mạch.
5. Tính dòng qua điện kế trong mô hình.
6. Tính góc kim mục tiêu.
7. Cập nhật kim và bảng giải thích.
8. Render cảnh.

Không suy ra dòng điện từ màu chùm sáng hoặc độ sáng pixel. Không để toàn bộ React render lại mỗi frame; dùng render loop, refs và event handlers có kiểm soát.

---

## 7. Tối ưu hiển thị web điện thoại

- Mobile-first; hỗ trợ iPhone Safari, Android và máy tính.
- Bố cục dọc/ngang, không tràn ngang.
- Canvas chiếm phần lớn chiều cao; thanh công cụ có thể thu gọn hoặc ẩn.
- Panel trạng thái/điều khiển/bài học mở độc lập.
- Thao tác xoay camera tách khỏi kéo thiết bị.
- Nút chạm lớn, vùng chạm mục tiêu ≥ 44×44 CSS px.
- Tôn trọng `safe-area-inset-top/bottom`.
- Dùng ResizeObserver hoặc cơ chế tương đương cập nhật renderer/camera khi đổi kích thước.
- Dùng `devicePixelRatio` có giới hạn theo chế độ chất lượng; không phóng to canvas độ phân giải thấp bằng CSS.
- Chế độ `Tự động / Cao / Cân bằng / Tiết kiệm pin`.
- Hạn chế đèn tạo bóng, texture lớn, bloom và shader nặng trên điện thoại yếu.
- Giữ UI 2D (chữ, vạch điện kế, nút) rõ nét kể cả khi giảm chất lượng cảnh 3D.
- Dùng Fullscreen API khi được hỗ trợ; nếu không, cung cấp chế độ mở rộng ẩn header/panel.
- Xoay màn hình, ẩn/hiện panel hoặc đổi chất lượng không được reset thí nghiệm.
- Giải phóng renderer, texture, geometry, materials và event listeners khi thoát cảnh.

---

## 8. Bộ kiểm thử khoa học và đồ họa

### Kiểm thử khoa học
- [ ] Đèn tắt, mạch kín, ánh sáng môi trường mặc định bằng 0 trong chế độ SGK → kim ở gần 0.
- [ ] Đèn bật và chiếu đúng mặt pin → mức chiếu sáng hữu hiệu lớn hơn 0.
- [ ] Đèn bật nhưng không chiếu vào pin → đầu ra do đèn này bằng 0/gần nền.
- [ ] Vật chắn che hoàn toàn → mức chiếu hữu hiệu từ đèn bằng 0.
- [ ] Mạch hở → dòng qua điện kế bằng 0 dù pin được chiếu.
- [ ] Tăng sáng hợp lí → đầu ra mô hình tăng đơn điệu, có giới hạn.
- [ ] Kim chỉ được điều khiển bởi dòng có dấu, độ nhạy và cực tính.
- [ ] Đảo hai dây trong chế độ center-zero → hướng lệch đảo.
- [ ] Tắt đèn → kim trở về mức nền theo đáp ứng đã chọn.
- [ ] Chùm sáng minh họa bật/tắt không thay đổi kết quả tính toán.
- [ ] Ánh sáng trang trí của phòng 3D không ảnh hưởng đầu ra pin.
- [ ] Không hiển thị đơn vị định lượng giả.

### Kiểm thử đồ họa
- [ ] Hướng chùm sáng đồng bộ với hướng đèn.
- [ ] Vùng sáng rơi đúng trên mặt pin.
- [ ] Mặt pin và điện kế hướng đúng về camera mặc định.
- [ ] Kim quay quanh đúng tâm, không vượt thang.
- [ ] Dây có đầu nối ở hai đầu và không xuyên vật thể.
- [ ] Không có chùm sáng phát sáng khi đèn tắt.
- [ ] Chế độ thực tế không vẽ chùm sáng đục trong không khí; lớp minh họa ghi rõ là minh họa.
- [ ] Thiết bị không bị cắt khung khi đổi kích thước.
- [ ] Text/scale sắc nét trên Retina/HiDPI.
- [ ] Các panel ẩn/hiện không làm thay đổi trạng thái vật lí.

### Kiểm thử tương tác và hiệu năng
- [ ] Tất cả nút có chức năng.
- [ ] Kéo/đổi góc đèn không xung đột với xoay camera.
- [ ] Hỗ trợ màn hình dọc/ngang.
- [ ] Không có thanh cuộn ngang.
- [ ] Mục tiêu khoảng 30–60 FPS tùy thiết bị; đo thực tế nếu công cụ cho phép.
- [ ] Không có lỗi JavaScript nghiêm trọng đã biết.
- [ ] Báo rõ thử nghiệm nào chạy tự động, thử nghiệm nào chỉ kiểm tra thủ công, thử nghiệm nào chưa xác minh được trên thiết bị thật.

---

## 9. Nguồn kiểm chứng khoa học

1. **SGK Khoa học tự nhiên 7 – Kết nối tri thức, Bài 15:** mô tả đúng thí nghiệm đèn chiếu – pin quang điện – điện kế; khi đèn tắt kim ở 0, khi bật đèn kim lệch. Bản số hóa tham khảo:  
   https://www.sachgiaokhoa.online/lop-7-10/ket-noi-tri-thuc-voi-cuoc-song-3/chuong-v-anh-sang-2380/bai-15-nang-luong-anh-sang-tia-sang-vung-toi-8175.html

2. **U.S. Department of Energy — Solar Photovoltaic Cell Basics:** pin quang điện dùng bán dẫn hấp thụ năng lượng ánh sáng và tạo dòng điện:  
   https://www.energy.gov/cmei/systems/solar-photovoltaic-cell-basics

3. **U.S. Department of Energy — Solar Photovoltaic Performance and Efficiency Basics:** không phải toàn bộ năng lượng ánh sáng tới đều biến thành điện; một phần phản xạ, truyền qua hoặc chuyển thành nhiệt:  
   https://www.energy.gov/cmei/systems/solar-photovoltaic-performance-and-efficiency-basics

4. **OpenStax — Analog Meters: Galvanometers:** dòng điện qua điện kế tạo độ lệch kim; trong vùng tuyến tính, độ lệch tỉ lệ với dòng và phụ thuộc độ nhạy thiết bị:  
   https://openstax.org/books/college-physics-2e/pages/21-4-dc-voltmeters-and-ammeters

5. **Commission Internationale de l'Éclairage (CIE) — Photometric distance law:** quan hệ độ rọi–khoảng cách có điều kiện áp dụng cho nguồn điểm hoặc xấp xỉ nguồn điểm đủ xa; không được áp dụng máy móc cho mọi nguồn hữu hạn:  
   https://cie.co.at/eilvterm/17-25-104

Khi triển khai, kiểm tra các nguồn trên thay vì chỉ tin bản đặc tả. Nếu có mâu thuẫn giữa ảnh SGK và tài liệu thiết bị, ghi rõ mâu thuẫn và không tự bịa cách giải quyết.

---

## 10. Lệnh triển khai trong Google AI Studio Build

Đính kèm file này cùng hai ảnh SGK, chọn Gemini 4 Argon và tính năng Three.js 3D scenes nếu có, rồi dán:

> Đọc toàn bộ `BAI_15_NANG_LUONG_ANH_SANG_3D_SPEC_V2.md` và hai ảnh SGK. Kiểm tra lại các nguồn tham khảo, phân biệt thông tin đã xác minh với giả định, rồi hoàn thiện ứng dụng web 3D tương tác bằng Three.js. Ưu tiên đúng hiện tượng quang điện và logic điện kế trước đồ họa. Ánh sáng render không được tự quyết định dòng điện; hãy tính mức chiếu sáng hữu hiệu, trạng thái mạch và góc kim trong một mô hình vật lí độc lập, rồi đồng bộ với cảnh 3D. Tạo chế độ thực tế và lớp chùm sáng minh họa có thể bật/tắt. Đồ họa phải chi tiết, sắc nét, tối ưu Retina/HiDPI và điện thoại; thanh công cụ có thể ẩn/hiện. Tận dụng mã nguồn hiện có, xây dựng thật, chạy thử các tiêu chí trong file, sửa lỗi và báo trung thực phần đã/chưa kiểm thử. Không tuyên bố đã kiểm thử nếu chưa thực hiện.

---

## 11. Tiêu chí hoàn thành

Chỉ coi ứng dụng đạt yêu cầu khi:
1. Thiết bị nhận diện rõ và bố trí đúng logic như Hình 15.1.
2. Kim điện kế được điều khiển bởi trạng thái pin, ánh sáng và mạch, không phải hoạt ảnh tách rời.
3. Tắt đèn/che sáng/mở mạch tạo kết quả khác nhau đúng nguyên lí.
4. Mô hình phân biệt ánh sáng render với ánh sáng trong phép tính.
5. Chùm sáng minh họa được phân biệt rõ với hiện tượng nhìn thấy thật.
6. Không bịa số đo, đơn vị, độ nhạy hoặc hiệu suất chưa được xác minh.
7. Các thao tác chính hoạt động trên điện thoại.
8. Đồ họa sắc nét nhưng không hi sinh độ rõ của kim và thiết bị.
9. Bộ kiểm thử có kết quả được báo cáo trung thực.
