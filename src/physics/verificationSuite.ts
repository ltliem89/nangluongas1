/**
 * BỘ KIỂM THỬ TỰ ĐỘNG & XÁC MINH KHOA HỌC (Mục 5.3, Mục 8 & Mục 9 Spec V2)
 * Chạy trực tiếp trên mô hình vật lí độc lập để kiểm chứng tất cả kịch bản nghiệm thu.
 */

import {
  DEFAULT_EXPERIMENT_STATE,
  ExperimentState,
  GalvanometerNeedleDynamics,
  evaluateExperimentPhysics,
  resolveTableCollision,
} from './SimulationEngine';

export interface VerificationTestResult {
  id: string;
  category: 'scientific' | 'graphics_sync' | 'interaction_perf';
  title: string;
  expected: string;
  actual: string;
  passed: boolean;
  verificationMethod: 'automated_unit' | 'runtime_3d_check' | 'manual_hardware_limitation';
}

export interface ScientificSourceAudit {
  id: string;
  sourceTitle: string;
  url: string;
  verifiedFacts: string[];
  unverifiedAssumptions: string[];
}

export const SCIENTIFIC_SOURCE_AUDITS: ScientificSourceAudit[] = [
  {
    id: 'sgk-khtn7-bai15',
    sourceTitle: 'SGK Khoa học tự nhiên 7 – Kết nối tri thức với cuộc sống (Bài 15, Hình 15.1, trang 73)',
    url: 'https://www.sachgiaokhoa.online/lop-7-10/ket-noi-tri-thuc-voi-cuoc-song-3/chuong-v-anh-sang-2380/bai-15-nang-luong-anh-sang-tia-sang-vung-toi-8175.html',
    verifiedFacts: [
      'Bố cục thí nghiệm Hình 15.1 gồm: Đèn chiếu trên giá đỡ (bên trái), tấm pin quang điện nối qua 2 dây dẫn với điện kế kim có vạch 0 ở giữa (bên phải).',
      'Bước 1 (chưa bật đèn): Kim điện kế đứng yên ở vạch 0.',
      'Bước 2 (bật đèn chiếu vào pin quang điện): Kim điện kế bị lệch khỏi vạch 0, chứng tỏ pin quang điện đã nhận năng lượng ánh sáng và chuyển hóa thành điện năng.',
      'Chùm sáng hình nón màu cam trên hình vẽ SGK là biểu diễn trực quan đường truyền ánh sáng, không phải thể tích sáng đục tự phát trong không khí sạch.',
    ],
    unverifiedAssumptions: [
      'Ảnh SGK không ghi mã sản phẩm (model/hãng), công suất đèn, diện tích hiệu dụng hay đường đặc tính I–V của tấm pin quang điện.',
      'Mặt thang đo điện kế trong hình minh họa không xác định đơn vị thực tế (µA hay mA) và điện trở trong của điện kế.',
    ],
  },
  {
    id: 'doe-pv-basics',
    sourceTitle: 'U.S. Department of Energy — Solar Photovoltaic Cell Basics & Performance/Efficiency Basics',
    url: 'https://www.energy.gov/cmei/systems/solar-photovoltaic-cell-basics',
    verifiedFacts: [
      'Pin quang điện sử dụng vật liệu bán dẫn hấp thụ photon ánh sáng để giải phóng các hạt tải điện, tạo ra dòng điện một chiều khi nối với mạch ngoài.',
      'Không phải 100% năng lượng ánh sáng tới đều biến thành điện năng: một phần bị phản xạ ở bề mặt, truyền qua hoặc chuyển hóa thành nhiệt năng.',
      'Khi mạch ngoài bị hở, pin vẫn có thể xuất hiện thế quang điện hở mạch nhưng dòng điện chạy qua mạch ngoài bằng 0.',
    ],
    unverifiedAssumptions: [
      'Hiệu suất chuyển đổi cụ thể và hệ số nhiệt độ của cell trong bộ thí nghiệm trường học chưa có datasheet nên được mô phỏng bằng hàm chuẩn hóa đơn điệu có bão hòa mềm.',
    ],
  },
  {
    id: 'openstax-galvanometer',
    sourceTitle: 'OpenStax College Physics 2e (Section 21.4 — Analog Meters: Galvanometers)',
    url: 'https://openstax.org/books/college-physics-2e/pages/21-4-dc-voltmeters-and-ammeters',
    verifiedFacts: [
      'Điện kế (Galvanometer) hoạt động dựa trên mô-men lực từ tác dụng lên khung dây có dòng điện chạy qua trong từ trường, cân bằng với lò xo xoắn hoàn lực.',
      'Trong vùng làm việc tuyến tính, góc lệch của kim tỉ lệ thuận với cường độ dòng điện chạy qua điện kế và phụ thuộc chiều dòng điện (với điện kế zero-center).',
    ],
    unverifiedAssumptions: [
      'Độ nhạy dòng điện (hệ số K) và tần số dao động riêng (ω_n = 14.5 rad/s, hệ số tắt dần ζ = 0.82) là tham số cơ học giả định để tái tạo chuyển động kim mượt và thực tế.',
    ],
  },
  {
    id: 'cie-distance-law',
    sourceTitle: 'CIE e-ILV 17-25-104 & 17-25-105 — Photometric Distance Law & Inverse Square Law',
    url: 'https://cie.co.at/eilvterm/17-25-104',
    verifiedFacts: [
      'Định luật nghịch đảo bình phương khoảng cách (1/r²) chỉ nghiệm đúng chính xác cho nguồn điểm hoặc khi khoảng cách đo đủ lớn so với kích thước khẩu độ nguồn phát và chóa phản xạ.',
      'Ở khoảng cách gần trên bàn thí nghiệm với đèn chiếu có khẩu độ hữu hạn và chóa gom sáng, độ rọi giảm chậm hơn và bị chặn trên thay vì phân kỳ về vô cùng khi r → 0.',
    ],
    unverifiedAssumptions: [
      'Mô phỏng sử dụng hàm suy giảm chuẩn hóa có bán kính khẩu độ hữu hạn hiệu dụng a: f(r) = (r_min² + a²) / (r² + a²) kết hợp phân bố góc chùm tia.',
    ],
  },
];

export function runAutomatedVerificationSuite(): VerificationTestResult[] {
  const results: VerificationTestResult[] = [];

  // Test 1: Đèn tắt, mạch kín (Chế độ SGK) -> Kim ở vạch 0
  {
    const s1: ExperimentState = { ...DEFAULT_EXPERIMENT_STATE, lampOn: false, circuitClosed: true, ambientMode: 'sgk_controlled' };
    const ev1 = evaluateExperimentPhysics(s1);
    const passed = ev1.illumination.effectiveIrradiance === 0 && ev1.galvanometer.targetAngleDeg === 0;
    results.push({
      id: 'SC-01',
      category: 'scientific',
      title: 'Kịch bản 1: Đèn tắt, mạch kín (Chế độ SGK)',
      expected: 'E_eff = 0, dòng điện = 0, góc kim = 0.0°',
      actual: `E_eff = ${ev1.illumination.effectiveIrradiance.toFixed(3)}, I_norm = ${ev1.circuit.normalizedCurrent.toFixed(3)}, Góc kim = ${ev1.galvanometer.targetAngleDeg.toFixed(1)}°`,
      passed,
      verificationMethod: 'automated_unit',
    });
  }

  // Test 2: Đèn bật, hướng đúng, mặt pin nhận sáng, mạch kín -> Kim lệch rõ
  {
    const s2: ExperimentState = { ...DEFAULT_EXPERIMENT_STATE, lampOn: true, lampIntensity: 0.8, circuitClosed: true };
    const ev2 = evaluateExperimentPhysics(s2);
    const passed = ev2.illumination.effectiveIrradiance > 0.5 && ev2.galvanometer.targetScaleDivision > 2.5;
    results.push({
      id: 'SC-02',
      category: 'scientific',
      title: 'Kịch bản 2: Đèn bật, chiếu đúng tâm pin, mạch kín',
      expected: 'E_eff > 0.50, kim lệch dương > +2.5 vạch',
      actual: `E_eff = ${ev2.illumination.effectiveIrradiance.toFixed(3)}, Kim lệch = +${ev2.galvanometer.targetScaleDivision.toFixed(2)} vạch (${ev2.galvanometer.targetAngleDeg.toFixed(1)}°)`,
      passed,
      verificationMethod: 'automated_unit',
    });
  }

  // Test 3: Đèn bật nhưng quay chùm sáng lệch hẳn khỏi pin -> Đầu ra bằng 0
  {
    const s3: ExperimentState = { ...DEFAULT_EXPERIMENT_STATE, lampOn: true, lampYawDeg: 42, circuitClosed: true };
    const ev3 = evaluateExperimentPhysics(s3);
    const passed = ev3.illumination.beamOverlap === 0 && ev3.galvanometer.targetAngleDeg === 0;
    results.push({
      id: 'SC-03',
      category: 'scientific',
      title: 'Kịch bản 3: Đèn bật nhưng hướng chiếu lệch khỏi mặt pin (Yaw = 42°)',
      expected: 'Độ chồng chùm sáng = 0%, góc kim = 0.0°',
      actual: `Overlap = ${(ev3.illumination.beamOverlap * 100).toFixed(0)}%, Góc kim = ${ev3.galvanometer.targetAngleDeg.toFixed(1)}°`,
      passed,
      verificationMethod: 'automated_unit',
    });
  }

  // Test 4: Đèn bật nhưng tấm chắn che hoàn toàn -> E_eff = 0, kim về 0
  {
    const s4: ExperimentState = {
      ...DEFAULT_EXPERIMENT_STATE,
      lampOn: true,
      occluderActive: true,
      occluderInsertion: 1.0,
      circuitClosed: true,
    };
    const ev4 = evaluateExperimentPhysics(s4);
    const passed = ev4.illumination.fOcclusion === 0 && ev4.galvanometer.targetAngleDeg === 0;
    results.push({
      id: 'SC-04',
      category: 'scientific',
      title: 'Kịch bản 4: Đèn bật nhưng vật chắn đục che hoàn toàn trước pin',
      expected: 'Hệ số truyền qua f_occlusion = 0, góc kim = 0.0°',
      actual: `f_occlusion = ${ev4.illumination.fOcclusion.toFixed(2)}, Góc kim = ${ev4.galvanometer.targetAngleDeg.toFixed(1)}°`,
      passed,
      verificationMethod: 'automated_unit',
    });
  }

  // Test 5: Đèn bật và mặt pin quay nghiêng (60°) -> mức lệch giảm theo cos(θ)
  {
    const sNormal: ExperimentState = { ...DEFAULT_EXPERIMENT_STATE, lampOn: true, pvYawDeg: 0 };
    const sTilted: ExperimentState = { ...DEFAULT_EXPERIMENT_STATE, lampOn: true, pvYawDeg: 60 };
    const evNormal = evaluateExperimentPhysics(sNormal);
    const evTilted = evaluateExperimentPhysics(sTilted);
    const passed =
      evTilted.illumination.effectiveIrradiance > 0.1 &&
      evTilted.illumination.effectiveIrradiance < evNormal.illumination.effectiveIrradiance * 0.65 &&
      evTilted.galvanometer.targetAngleDeg < evNormal.galvanometer.targetAngleDeg;
    results.push({
      id: 'SC-05',
      category: 'scientific',
      title: 'Kịch bản 5: Xoay nghiêng mặt pin quang điện (60°) làm giảm quang thông thu được',
      expected: 'Góc lệch khi nghiêng 60° nhỏ hơn rõ rệt so với khi vuông góc (0°)',
      actual: `Tại 0°: +${evNormal.galvanometer.targetScaleDivision.toFixed(2)} vạch; Tại 60°: +${evTilted.galvanometer.targetScaleDivision.toFixed(2)} vạch`,
      passed,
      verificationMethod: 'automated_unit',
    });
  }

  // Test 6: Đèn bật, pin được chiếu sáng nhưng mạch ngoài HỞ -> dòng qua điện kế = 0, thế hở mạch > 0
  {
    const s6: ExperimentState = { ...DEFAULT_EXPERIMENT_STATE, lampOn: true, circuitClosed: false };
    const ev6 = evaluateExperimentPhysics(s6);
    const passed =
      ev6.pv.openCircuitVoltageNorm > 0.5 &&
      ev6.circuit.normalizedCurrent === 0 &&
      ev6.galvanometer.targetAngleDeg === 0;
    results.push({
      id: 'SC-06',
      category: 'scientific',
      title: 'Kịch bản 6: Đèn bật chiếu vào pin nhưng công tắc/mạch ngoài HỞ',
      expected: 'Pin vẫn tạo thế quang điện (V_oc > 0) nhưng dòng qua điện kế = 0, kim ở 0°',
      actual: `V_oc chuẩn hóa = ${(ev6.pv.openCircuitVoltageNorm * 100).toFixed(0)}%, Dòng mạch ngoài = ${ev6.circuit.normalizedCurrent.toFixed(2)}, Kim = ${ev6.galvanometer.targetAngleDeg.toFixed(1)}°`,
      passed,
      verificationMethod: 'automated_unit',
    });
  }

  // Test 7: Tăng độ sáng đèn & giảm khoảng cách -> Đầu ra tăng đơn điệu, có giới hạn không vượt thang
  {
    const sLow: ExperimentState = { ...DEFAULT_EXPERIMENT_STATE, lampOn: true, lampIntensity: 0.3, lampDistance: 2.5 };
    const sMid: ExperimentState = { ...DEFAULT_EXPERIMENT_STATE, lampOn: true, lampIntensity: 0.6, lampDistance: 1.8 };
    const sHigh: ExperimentState = { ...DEFAULT_EXPERIMENT_STATE, lampOn: true, lampIntensity: 1.0, lampDistance: 1.1 };
    const evLow = evaluateExperimentPhysics(sLow);
    const evMid = evaluateExperimentPhysics(sMid);
    const evHigh = evaluateExperimentPhysics(sHigh);
    const passed =
      evLow.galvanometer.targetAngleDeg < evMid.galvanometer.targetAngleDeg &&
      evMid.galvanometer.targetAngleDeg < evHigh.galvanometer.targetAngleDeg &&
      evHigh.galvanometer.targetAngleDeg <= 45.0;
    results.push({
      id: 'SC-07',
      category: 'scientific',
      title: 'Kịch bản 7: Tăng độ sáng & tiến gần làm tăng dòng đơn điệu và giữ trong giới hạn thang (≤ 45°)',
      expected: 'Góc lệch(Thấp) < Góc lệch(Vừa) < Góc lệch(Cao) ≤ 45.0°',
      actual: `${evLow.galvanometer.targetAngleDeg.toFixed(1)}° < ${evMid.galvanometer.targetAngleDeg.toFixed(1)}° < ${evHigh.galvanometer.targetAngleDeg.toFixed(1)}°`,
      passed,
      verificationMethod: 'automated_unit',
    });
  }

  // Test 8: Đảo hai đầu dây tại điện kế zero-center -> Hướng lệch đảo dấu chính xác
  {
    const sStd: ExperimentState = { ...DEFAULT_EXPERIMENT_STATE, lampOn: true, wiringReversed: false };
    const sRev: ExperimentState = { ...DEFAULT_EXPERIMENT_STATE, lampOn: true, wiringReversed: true };
    const evStd = evaluateExperimentPhysics(sStd);
    const evRev = evaluateExperimentPhysics(sRev);
    const passed =
      evStd.galvanometer.targetAngleDeg > 0 &&
      Math.abs(evStd.galvanometer.targetAngleDeg + evRev.galvanometer.targetAngleDeg) < 1e-6;
    results.push({
      id: 'SC-08',
      category: 'scientific',
      title: 'Kịch bản 8: Đảo cực hai đầu dây điện kế zero-center làm đảo chiều lệch kim',
      expected: 'Góc lệch khi đảo dây bằng đúng số đối của góc lệch chuẩn',
      actual: `Chuẩn: +${evStd.galvanometer.targetScaleDivision.toFixed(2)} vạch | Đảo dây: ${evRev.galvanometer.targetScaleDivision.toFixed(2)} vạch`,
      passed,
      verificationMethod: 'automated_unit',
    });
  }

  // Test 9: Bật/tắt lớp chùm sáng minh họa & chế độ phòng tối Spotlight xanh đêm hoàn toàn độc lập với phép tính vật lí
  {
    const sReal: ExperimentState = { ...DEFAULT_EXPERIMENT_STATE, lampOn: true, visualBeamMode: 'realistic', darkLabVisualMode: false };
    const sCone: ExperimentState = { ...DEFAULT_EXPERIMENT_STATE, lampOn: true, visualBeamMode: 'explanatory_cone', darkLabVisualMode: true };
    const sRays: ExperimentState = { ...DEFAULT_EXPERIMENT_STATE, lampOn: true, visualBeamMode: 'explanatory_rays', darkLabVisualMode: true };
    const evReal = evaluateExperimentPhysics(sReal);
    const evCone = evaluateExperimentPhysics(sCone);
    const evRays = evaluateExperimentPhysics(sRays);
    const passed =
      evReal.illumination.effectiveIrradiance === evCone.illumination.effectiveIrradiance &&
      evCone.illumination.effectiveIrradiance === evRays.illumination.effectiveIrradiance &&
      evReal.galvanometer.targetAngleDeg === evCone.galvanometer.targetAngleDeg;
    results.push({
      id: 'SC-09',
      category: 'graphics_sync',
      title: 'Kịch bản 9: Bật/tắt chùm sáng minh họa & Spotlight xanh đêm phòng tối không làm sai lệch dòng điện vật lí',
      expected: 'E_eff và góc kim giữ nguyên tuyệt đối giữa Phòng tối / Phòng sáng và 3 chế độ chùm tia',
      actual: `Phòng sáng: ${evReal.galvanometer.targetAngleDeg.toFixed(2)}° | Phòng tối (Nón): ${evCone.galvanometer.targetAngleDeg.toFixed(2)}° | Phòng tối (Tia): ${evRays.galvanometer.targetAngleDeg.toFixed(2)}°`,
      passed,
      verificationMethod: 'automated_unit',
    });
  }

  // Test 10: Động lực học giảm chấn của kim điện kế khi tắt đèn -> Hội tụ mượt về 0, không dao động mãi
  {
    const dyn = new GalvanometerNeedleDynamics();
    dyn.reset(32.0); // Đang lệch 32°
    for (let i = 0; i < 90; i++) {
      dyn.step(0, 1 / 60); // Mô phỏng 1.5 giây sau khi tắt đèn
    }
    const passed = Math.abs(dyn.currentAngleDeg) < 0.05 && Math.abs(dyn.angularVelocityDegPerSec) < 0.05;
    results.push({
      id: 'SC-10',
      category: 'scientific',
      title: 'Kịch bản 10: Khi tắt đèn, kim điện kế giảm chấn mượt và hội tụ ổn định về vạch 0',
      expected: 'Sau 1.5s, góc kim < 0.05° và vận tốc góc ≈ 0°/s',
      actual: `Góc kim = ${dyn.currentAngleDeg.toFixed(4)}°, ω = ${dyn.angularVelocityDegPerSec.toFixed(4)}°/s`,
      passed,
      verificationMethod: 'automated_unit',
    });
  }

  // Test 11: Kéo di chuyển Vật cản sáng trên bàn (Chắn toàn bộ -> Chắn một phần -> Kéo ra ngoài chùm tia)
  {
    const sFullBlock: ExperimentState = {
      ...DEFAULT_EXPERIMENT_STATE,
      lampOn: true,
      occluderActive: true,
      occluderPos: { x: -0.90, z: -0.08 },
    };
    const sHalfBlock: ExperimentState = {
      ...DEFAULT_EXPERIMENT_STATE,
      lampOn: true,
      occluderActive: true,
      occluderPos: { x: -0.90, z: 0.34 },
    };
    const sOutBlock: ExperimentState = {
      ...DEFAULT_EXPERIMENT_STATE,
      lampOn: true,
      occluderActive: true,
      occluderPos: { x: -0.90, z: 0.95 },
    };
    const evFull = evaluateExperimentPhysics(sFullBlock);
    const evHalf = evaluateExperimentPhysics(sHalfBlock);
    const evOut = evaluateExperimentPhysics(sOutBlock);

    const passed =
      evFull.illumination.fOcclusion === 0 &&
      evHalf.illumination.fOcclusion > 0.15 &&
      evHalf.illumination.fOcclusion < 0.85 &&
      evOut.illumination.fOcclusion === 1.0 &&
      evFull.galvanometer.targetAngleDeg < evHalf.galvanometer.targetAngleDeg &&
      evHalf.galvanometer.targetAngleDeg < evOut.galvanometer.targetAngleDeg;

    results.push({
      id: 'SC-11',
      category: 'scientific',
      title: 'Kịch bản 11: Kéo di chuyển Vật cản sáng trên bàn (Tạo vùng tối toàn phần, bán phần và ngoài chùm sáng)',
      expected: 'Che 100% (0.0°) < Che một phần < Kéo ra ngoài chùm tia (truyền 100%)',
      actual: `Che giữa: ${evFull.galvanometer.targetAngleDeg.toFixed(1)}° | Che lệch: ${evHalf.galvanometer.targetAngleDeg.toFixed(1)}° (che ${Math.round(evHalf.illumination.shadowCoverageOnPV * 100)}%) | Ngoài tia: ${evOut.galvanometer.targetAngleDeg.toFixed(1)}°`,
      passed,
      verificationMethod: 'automated_unit',
    });
  }

  // Test 12: Nguồn phát khẩu độ hữu hạn (5 điểm phát) phân biệt Vùng tối (Umbra) & Vùng nửa tối (Penumbra) + Chống chồng lấn chân đế
  {
    const sEdge: ExperimentState = {
      ...DEFAULT_EXPERIMENT_STATE,
      lampOn: true,
      occluderActive: true,
      occluderPos: { x: -0.90, z: 0.28 },
    };
    const evEdge = evaluateExperimentPhysics(sEdge);
    const hasBothUmbraAndPenumbra =
      evEdge.illumination.umbraFractionOnPV > 0 && evEdge.illumination.penumbraFractionOnPV > 0;

    // Kiểm tra chống xuyên thấu khi kéo Đèn trùng vào đúng tọa độ chân Pin quang điện
    const resolved = resolveTableCollision(
      'lamp',
      DEFAULT_EXPERIMENT_STATE.pvPos,
      DEFAULT_EXPERIMENT_STATE,
    );
    const distAfterCollision = Math.hypot(
      resolved.x - DEFAULT_EXPERIMENT_STATE.pvPos.x,
      resolved.z - DEFAULT_EXPERIMENT_STATE.pvPos.z,
    );
    const collisionPrevented = distAfterCollision >= 0.65;

    const passed = hasBothUmbraAndPenumbra && collisionPrevented;
    results.push({
      id: 'SC-12',
      category: 'scientific',
      title: 'Kịch bản 12: Nguồn sáng rộng phân biệt Vùng tối (Umbra) + Vùng nửa tối (Penumbra) & Chống xuyên vật thể',
      expected: 'Xuất hiện đồng thời Vùng tối & Vùng nửa tối ở mép chắn; khoảng cách tối thiểu chân đế ≥ 0.65 m',
      actual: `Vùng tối = ${Math.round(evEdge.illumination.umbraFractionOnPV * 100)}%, Vùng nửa tối = ${Math.round(evEdge.illumination.penumbraFractionOnPV * 100)}%, Khoảng cách chống đè = ${distAfterCollision.toFixed(2)} m`,
      passed,
      verificationMethod: 'automated_unit',
    });
  }

  return results;
}
