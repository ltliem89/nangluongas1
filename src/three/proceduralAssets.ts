import * as THREE from 'three';

/**
 * Tạo texture mặt thang đo Điện kế (Galvanometer Dial) độ phân giải siêu cao 2048x1680 (Retina 2K)
 * - Số 0 ở chính giữa (zero-center) như Hình 15.1 SGK KHTN 7.
 * - Vạch chia tương đối từ -5 đến +5 (góc mở ±45° quanh tâm trục kim ở đáy mặt đồng hồ).
 * - Tối ưu độ tương phản và độ sắc nét tuyệt đối cho chữ số, vạch chia và ký hiệu G.
 */
export function createGalvanometerDialTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const scale = 2; // 2048 x 1680 (Retina 2K)
  const canvas = document.createElement('canvas');
  canvas.width = 1024 * scale;
  canvas.height = 840 * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  const w = 1024;
  const h = 840;

  // Nền mặt đồng hồ trắng ngà tinh khiết kết hợp đổ bóng viền nhẹ tạo chiều sâu lòng đồng hồ
  const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.52, 80, w * 0.5, h * 0.5, 680);
  bgGrad.addColorStop(0, '#FFFFFF');
  bgGrad.addColorStop(0.82, '#F8FAFC');
  bgGrad.addColorStop(1, '#E2E8F0');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Khung viền bo tròn sắc nét bên trong mặt đồng hồ
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.roundRect(22, 22, w - 44, h - 44, 36);
  ctx.stroke();

  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(34, 34, w - 68, h - 68, 28);
  ctx.stroke();

  // Tâm quay của kim tương ứng trên mặt phẳng UV của bảng thang đo
  const pivotX = w * 0.5;
  const pivotY = h * (1 - 0.165); // 701.4
  const arcOuterR = 522;
  const arcInnerR = 464;

  const startAngle = -Math.PI / 2 - Math.PI / 4;
  const endAngle = -Math.PI / 2 + Math.PI / 4;

  // Dải gương chống sai số thị sai (Anti-parallax mirror arc) đặc trưng của Điện kế phòng thí nghiệm chuẩn
  const mirrorOuterR = arcInnerR - 14;
  const mirrorInnerR = arcInnerR - 38;
  const mirrorGrad = ctx.createLinearGradient(pivotX - 360, pivotY - 450, pivotX + 360, pivotY - 450);
  mirrorGrad.addColorStop(0, '#CBD5E1');
  mirrorGrad.addColorStop(0.28, '#F8FAFC');
  mirrorGrad.addColorStop(0.5, '#94A3B8');
  mirrorGrad.addColorStop(0.72, '#F8FAFC');
  mirrorGrad.addColorStop(1, '#CBD5E1');

  ctx.beginPath();
  ctx.arc(pivotX, pivotY, mirrorOuterR, startAngle, endAngle);
  ctx.arc(pivotX, pivotY, mirrorInnerR, endAngle, startAngle, true);
  ctx.closePath();
  ctx.fillStyle = mirrorGrad;
  ctx.fill();
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Cung chia độ đôi sắc nét
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, arcOuterR, startAngle, endAngle);
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 5.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(pivotX, pivotY, arcInnerR, startAngle, endAngle);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Vẽ các vạch chia chính (-5..+5), vạch giữa (0.5) và vạch chia phụ (0.2)
  const totalDivisions = 5;
  const subSteps = 5; // 5 khoảng nhỏ mỗi vạch đơn vị (mỗi vạch phụ = 0.2)

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = -totalDivisions * subSteps; i <= totalDivisions * subSteps; i++) {
    const val = i / subSteps; // -5.0 -> +5.0
    const deg = (val / totalDivisions) * 45; // -45° -> +45°
    const rad = ((deg - 90) * Math.PI) / 180;

    const isZero = i === 0;
    const isMajor = i % subSteps === 0;

    const rStart = arcInnerR - (isMajor ? 5 : 0);
    const rEnd = isZero
      ? arcOuterR + 30
      : isMajor
        ? arcOuterR + 20
        : arcInnerR + 30;

    const x1 = pivotX + Math.cos(rad) * rStart;
    const y1 = pivotY + Math.sin(rad) * rStart;
    const x2 = pivotX + Math.cos(rad) * rEnd;
    const y2 = pivotY + Math.sin(rad) * rEnd;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineCap = 'round';

    if (isZero) {
      ctx.strokeStyle = '#DC2626';
      ctx.lineWidth = 9.5;
    } else if (isMajor) {
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 7.5;
    } else {
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3.2;
    }
    ctx.stroke();

    // Đánh số vạch chia chính (-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5)
    if (isMajor) {
      const labelR = arcOuterR + 66;
      const lx = pivotX + Math.cos(rad) * labelR;
      const ly = pivotY + Math.sin(rad) * labelR;

      ctx.font = isZero
        ? '800 56px "Plus Jakarta Sans", sans-serif'
        : '700 45px "JetBrains Mono", monospace';
      ctx.fillStyle = isZero ? '#DC2626' : '#020617';
      const labelText = val > 0 ? `+${val}` : `${val}`;
      ctx.fillText(isZero ? '0' : labelText, lx, ly);
    }
  }

  // Ký hiệu G (Điện kế / Galvanometer) sắc nét ở chính giữa
  ctx.fillStyle = '#020617';
  ctx.font = '800 84px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('G', pivotX, pivotY - 260);

  // Đường gạch chân biểu tượng điện kế từ điện một chiều (DC Moving-Coil)
  ctx.strokeStyle = '#020617';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pivotX - 48, pivotY - 208);
  ctx.lineTo(pivotX + 48, pivotY - 208);
  ctx.stroke();

  // Dòng chữ chú thích thang chuẩn hóa
  ctx.fillStyle = '#1E293B';
  ctx.font = '700 25px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('ĐIỆN KẾ (THANG TƯƠNG ĐỐI)', pivotX, pivotY - 164);

  ctx.fillStyle = '#64748B';
  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.fillText('ZERO-CENTER · CẤP 1.5', pivotX, pivotY - 126);

  // Dấu phân cực quy ước (−) bên trái và (+) bên phải có vòng tròn bo viền
  ctx.fillStyle = '#1D4ED8';
  ctx.font = '800 48px "JetBrains Mono", monospace';
  ctx.fillText('−', pivotX - 315, pivotY - 95);

  ctx.fillStyle = '#DC2626';
  ctx.fillText('+', pivotX + 315, pivotY - 95);

  // Vòng cung kim loại trang trí quanh tâm chốt kim
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, 52, Math.PI, 0);
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Tạo texture vệt sáng ấm khi chùm tia chiếu chạm mặt bàn gỗ hoặc mặt thiết bị
 */
export function createBeamHitGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(256, 256, 8, 256, 256, 248);
  grad.addColorStop(0, 'rgba(255, 251, 235, 0.95)');
  grad.addColorStop(0.25, 'rgba(253, 224, 71, 0.68)');
  grad.addColorStop(0.58, 'rgba(245, 158, 11, 0.28)');
  grad.addColorStop(0.85, 'rgba(217, 119, 6, 0.08)');
  grad.addColorStop(1, 'rgba(217, 119, 6, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Tạo texture Kim loại Vân Bạc Xước (Brushed Silver Metallic Grain) 1024x1024
 * Dùng cho đế pin, khung pin và chi tiết thân/đế đèn giúp thiết bị sáng rõ, nổi bật trên bàn gỗ.
 */
export function createBrushedSilverTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Nền bạc ánh kim chuyển sắc nhẹ
  const baseGrad = ctx.createLinearGradient(0, 0, 1024, 1024);
  baseGrad.addColorStop(0, '#E2E8F0');
  baseGrad.addColorStop(0.28, '#F8FAFC');
  baseGrad.addColorStop(0.55, '#CBD5E1');
  baseGrad.addColorStop(0.82, '#F1F5F9');
  baseGrad.addColorStop(1, '#94A3B8');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Các sọc vân bạc phay xước mịn (fine brushed metallic grain)
  for (let i = 0; i < 1600; i++) {
    const y = (i * 0.64) % 1024;
    const isLight = i % 2 === 0;
    const alpha = 0.06 + ((i * 19) % 10) * 0.012;
    ctx.strokeStyle = isLight
      ? `rgba(255, 255, 255, ${alpha.toFixed(3)})`
      : `rgba(71, 85, 105, ${(alpha * 0.85).toFixed(3)})`;
    ctx.lineWidth = 1 + (i % 3) * 0.45;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y + ((i % 5) - 2) * 1.5);
    ctx.stroke();
  }

  // Các vòng vân tiện đồng tâm nhẹ (machined concentric silver rings) cho mặt đế tròn
  const cx = 512;
  const cy = 512;
  for (let r = 40; r < 490; r += 8) {
    ctx.strokeStyle =
      r % 16 === 0 ? 'rgba(255, 255, 255, 0.14)' : 'rgba(100, 116, 139, 0.10)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Tạo texture bề mặt Pin Quang Điện (Photovoltaic Silicon Cell) 1024x768
 * - Nền bán dẫn kết hợp hệ thống vân bạc (silver collector grid & brushed silver frame)
 *   sắc nét, dễ quan sát dưới ánh sáng nhẹ.
 */
export function createPhotovoltaicCellTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 768;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, '#17325C');
  grad.addColorStop(0.5, '#1E40AF');
  grad.addColorStop(1, '#132A4E');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Hạt tinh thể đa tinh thể ánh bạc nhẹ
  ctx.fillStyle = 'rgba(226, 232, 240, 0.08)';
  for (let i = 0; i < 65; i++) {
    const rx = (i * 173) % canvas.width;
    const ry = (i * 251) % canvas.height;
    const rw = 60 + ((i * 31) % 90);
    const rh = 45 + ((i * 47) % 70);
    ctx.fillRect(rx, ry, rw, rh);
  }

  // Viền khung bạc phay xước bao quanh mặt pin
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 20;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);

  // Hệ thống vân bạc ngang (silver collector fingers) nổi rõ
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.78)';
  ctx.lineWidth = 3.2;
  const fingerCount = 26;
  for (let i = 1; i < fingerCount; i++) {
    const y = (i / fingerCount) * (canvas.height - 48) + 24;
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(canvas.width - 24, y);
    ctx.stroke();
  }

  // 3 Thanh góp điện vân bạc lớn (Silver Busbars)
  const busbarX = [canvas.width * 0.22, canvas.width * 0.5, canvas.width * 0.78];
  for (const bx of busbarX) {
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(bx - 8, 22, 16, canvas.height - 44);
    ctx.fillStyle = '#FFFFFF';
    for (let j = 1; j <= 6; j++) {
      const py = (j / 7) * (canvas.height - 48) + 24;
      ctx.fillRect(bx - 13, py - 5, 26, 10);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Tạo texture mặt bàn gỗ phòng thí nghiệm tự nhiên (Natural Oak Wood Bench) 2048x2048
 * - Vân gỗ sồi ấm áp, ghép từ các thanh gỗ tự nhiên có đường ghép mảnh.
 * - Độ sáng vừa phải giúp nổi bật toàn bộ dụng cụ thí nghiệm, dây dẫn và chân đế.
 */
export function createLabBenchTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;

  const w = canvas.width;
  const h = canvas.height;

  // Nền gỗ sồi vàng ấm trung tính
  ctx.fillStyle = '#C69762';
  ctx.fillRect(0, 0, w, h);

  // Vẽ 8 tấm ván gỗ ghép dọc theo chiều dài mặt bàn (trục X)
  const plankCount = 8;
  const plankH = h / plankCount;

  for (let p = 0; p < plankCount; p++) {
    const y0 = p * plankH;
    // Mỗi thanh gỗ có sắc độ chênh lệch tự nhiên rất nhẹ
    const toneShift = ((p * 37) % 18) - 9;
    const baseR = 198 + toneShift;
    const baseG = 150 + Math.round(toneShift * 0.8);
    const baseB = 96 + Math.round(toneShift * 0.5);

    const plankGrad = ctx.createLinearGradient(0, y0, 0, y0 + plankH);
    plankGrad.addColorStop(0, `rgb(${baseR - 6}, ${baseG - 5}, ${baseB - 4})`);
    plankGrad.addColorStop(0.5, `rgb(${baseR + 5}, ${baseG + 4}, ${baseB + 3})`);
    plankGrad.addColorStop(1, `rgb(${baseR - 8}, ${baseG - 7}, ${baseB - 5})`);
    ctx.fillStyle = plankGrad;
    ctx.fillRect(0, y0, w, plankH);

    // Các đường vân gỗ uốn lượn dọc theo từng tấm ván
    const grainLines = 55;
    for (let g = 0; g < grainLines; g++) {
      const gy = y0 + ((g + 0.5) / grainLines) * plankH;
      const amp = 3 + ((g * 13 + p * 7) % 8);
      const freq = 0.0025 + ((g % 5) * 0.0006);
      const phase = (p * 1.7 + g * 0.43);

      ctx.beginPath();
      for (let x = 0; x <= w; x += 32) {
        const dy = Math.sin(x * freq + phase) * amp + Math.cos(x * freq * 2.1 - phase) * (amp * 0.35);
        const py = Math.max(y0 + 2, Math.min(y0 + plankH - 2, gy + dy));
        if (x === 0) ctx.moveTo(x, py);
        else ctx.lineTo(x, py);
      }
      const isDarkGrain = g % 3 === 0;
      ctx.strokeStyle = isDarkGrain
        ? 'rgba(108, 68, 30, 0.14)'
        : 'rgba(235, 198, 150, 0.11)';
      ctx.lineWidth = 1.5 + (g % 3) * 0.8;
      ctx.stroke();
    }

    // Mắt gỗ tự nhiên nhẹ (subtle wood knots) trên một số ván
    const knotX = ((p * 523 + 340) % (w - 300)) + 150;
    const knotY = y0 + plankH * (0.3 + ((p * 19) % 40) * 0.01);
    const knotGrad = ctx.createRadialGradient(knotX, knotY, 4, knotX, knotY, 48);
    knotGrad.addColorStop(0, 'rgba(92, 54, 22, 0.28)');
    knotGrad.addColorStop(0.5, 'rgba(115, 72, 32, 0.12)');
    knotGrad.addColorStop(1, 'rgba(198, 150, 96, 0)');
    ctx.fillStyle = knotGrad;
    ctx.beginPath();
    ctx.ellipse(knotX, knotY, 64, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Đường ghép mảnh giữa các tấm ván gỗ
    ctx.strokeStyle = 'rgba(88, 52, 22, 0.35)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(w, y0);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Tạo texture bóng tiếp xúc mềm (Radial Contact Shadow) dưới chân thiết bị
 */
export function createRadialContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(128, 128, 16, 128, 128, 120);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.55)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.22)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
