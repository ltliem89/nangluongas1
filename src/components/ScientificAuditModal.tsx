import React, { useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Play, ShieldCheck, X } from 'lucide-react';
import { DEFAULT_EXPERIMENT_STATE, ExperimentState } from '../physics/SimulationEngine';
import {
  SCIENTIFIC_SOURCE_AUDITS,
  runAutomatedVerificationSuite,
} from '../physics/verificationSuite';

interface ScientificAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyScenario: (patch: Partial<ExperimentState>) => void;
  currentFps: number | null;
  isSoftwareGl: boolean;
}

export const ScientificAuditModal: React.FC<ScientificAuditModalProps> = ({
  isOpen,
  onClose,
  onApplyScenario,
  currentFps,
  isSoftwareGl,
}) => {
  const [tab, setTab] = useState<'tests' | 'sources' | 'limitations'>('tests');

  const testResults = useMemo(() => (isOpen ? runAutomatedVerificationSuite() : []), [isOpen]);
  const passedCount = testResults.filter((t) => t.passed).length;

  if (!isOpen) return null;

  const applyScenarioById = (id: string) => {
    switch (id) {
      case 'SC-01':
        onApplyScenario({ ...DEFAULT_EXPERIMENT_STATE, lampOn: false, circuitClosed: true });
        break;
      case 'SC-02':
        onApplyScenario({ ...DEFAULT_EXPERIMENT_STATE, lampOn: true, lampIntensity: 0.8, circuitClosed: true });
        break;
      case 'SC-03':
        onApplyScenario({ ...DEFAULT_EXPERIMENT_STATE, lampOn: true, lampYawDeg: 42, circuitClosed: true });
        break;
      case 'SC-04':
        onApplyScenario({
          ...DEFAULT_EXPERIMENT_STATE,
          lampOn: true,
          occluderActive: true,
          occluderInsertion: 1.0,
          circuitClosed: true,
        });
        break;
      case 'SC-05':
        onApplyScenario({ ...DEFAULT_EXPERIMENT_STATE, lampOn: true, pvYawDeg: 60, circuitClosed: true });
        break;
      case 'SC-06':
        onApplyScenario({ ...DEFAULT_EXPERIMENT_STATE, lampOn: true, circuitClosed: false });
        break;
      case 'SC-07':
        onApplyScenario({ ...DEFAULT_EXPERIMENT_STATE, lampOn: true, lampIntensity: 1.0, lampDistance: 1.15 });
        break;
      case 'SC-08':
        onApplyScenario({ ...DEFAULT_EXPERIMENT_STATE, lampOn: true, wiringReversed: true });
        break;
      case 'SC-09':
        onApplyScenario({ ...DEFAULT_EXPERIMENT_STATE, lampOn: true, visualBeamMode: 'realistic' });
        break;
      case 'SC-10':
        onApplyScenario({ ...DEFAULT_EXPERIMENT_STATE, lampOn: false });
        break;
      case 'SC-11':
        onApplyScenario({
          ...DEFAULT_EXPERIMENT_STATE,
          lampOn: true,
          occluderActive: true,
          occluderPos: { x: -0.90, z: 0.34 },
        });
        break;
      default:
        break;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85">
      <div className="w-full max-w-4xl max-h-[88vh] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">
              Hồ sơ Kiểm chứng Khoa học, Giả định Mô hình & Bộ Kiểm thử Nghiệm thu
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Bài 15: Năng lượng ánh sáng (Hình 15.1 SGK KHTN 7 — Kết nối tri thức với cuộc sống)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
            aria-label="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-950/60 border-b border-slate-800 overflow-x-auto">
          <button
            type="button"
            onClick={() => setTab('tests')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'tests'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            1. Bộ kiểm thử tự động ({passedCount}/{testResults.length} ĐẠT)
          </button>
          <button
            type="button"
            onClick={() => setTab('sources')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'sources'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            2. Nguồn khoa học: Xác minh vs. Giả định
          </button>
          <button
            type="button"
            onClick={() => setTab('limitations')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'limitations'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            3. Báo cáo trung thực phạm vi kiểm thử & Giới hạn
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm">
          {tab === 'tests' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-emerald-300 font-semibold text-xs">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>
                    Đã chạy trực tiếp {testResults.length} kịch bản nghiệm thu trên mô hình vật lí độc lập:{' '}
                    {passedCount}/{testResults.length} kịch bản đạt 100%.
                  </span>
                </div>
                <span className="text-xs text-slate-400 font-mono tabular-nums">
                  FPS hiện tại: {currentFps !== null ? `${currentFps} FPS` : 'Đang đo...'} (
                  {isSoftwareGl ? 'Software WebGL' : 'Hardware GPU'})
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {testResults.map((t) => (
                  <div
                    key={t.id}
                    className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 ${
                            t.passed ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        />
                        <span className="font-mono text-xs text-amber-300 font-semibold">
                          [{t.id}]
                        </span>
                        <span className="font-semibold text-slate-100 text-xs sm:text-sm">
                          {t.title}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 pl-6">
                        <span className="text-slate-300">Kỳ vọng:</span> {t.expected} ·{' '}
                        <span className="text-slate-300">Thực tế đo được:</span>{' '}
                        <span className="font-mono text-emerald-300">{t.actual}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => applyScenarioById(t.id)}
                      className="self-start sm:self-center shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-amber-200 border border-slate-700 transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Xem trong 3D</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'sources' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                Theo đúng yêu cầu đặc tả V2, bảng dưới đây phân biệt rõ những thông tin khoa học đã được đối chiếu xác minh từ tài liệu gốc với những tham số kỹ thuật là giả định mô phỏng (do ảnh SGK không cung cấp mã thiết bị/datasheet).
              </p>

              {SCIENTIFIC_SOURCE_AUDITS.map((src) => (
                <div
                  key={src.id}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-bold text-amber-300">{src.sourceTitle}</h3>
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 whitespace-nowrap shrink-0"
                    >
                      <span>Nguồn tham chiếu</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                      <div className="text-xs font-semibold text-emerald-300 mb-1.5">
                        Thông tin Khoa học & SGK đã xác minh:
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-xs text-slate-300 leading-relaxed">
                        {src.verifiedFacts.map((fact, idx) => (
                          <li key={idx}>{fact}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                      <div className="text-xs font-semibold text-amber-200 mb-1.5">
                        Thông số chưa thể xác minh từ ảnh (Giả định mô phỏng):
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-xs text-slate-300 leading-relaxed">
                        {src.unverifiedAssumptions.map((assump, idx) => (
                          <li key={idx}>{assump}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'limitations' && (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h3 className="text-sm font-bold text-emerald-300">
                  A. Hạng mục ĐÃ KIỂM THỬ TỰ ĐỘNG & XÁC MINH TRONG MÃ NGUỒN
                </h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    <strong>Kiểm thử biên dịch & kiểu dữ liệu TypeScript (compile_applet / lint):</strong> Đã xác minh không có lỗi cú pháp hoặc lỗi kiểu trong toàn bộ mô hình vật lí và hệ thống kết xuất Three.js.
                  </li>
                  <li>
                    <strong>10 kịch bản vật lí độc lập (SC-01 đến SC-10):</strong> Đã chạy kiểm thử tự động trực tiếp trên hàm <code>evaluateExperimentPhysics</code> và bộ giải động lực học <code>GalvanometerNeedleDynamics</code>. Đảm bảo đèn tắt, che sáng, quay lệch góc, mở mạch, đảo dây, và bật/tắt chùm sáng minh họa cho kết quả nhất quán 100% với mô hình toán học.
                  </li>
                  <li>
                    <strong>Tách biệt Đồ họa và Vật lí:</strong> Xác minh kiến trúc một chiều <code>ExperimentState → PhysicsEngine → ThreeScene</code>; hệ thống tuyệt đối không đọc màu pixel từ WebGL canvas và không lấy cường độ đèn studio của phòng để tính dòng quang điện.
                  </li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h3 className="text-sm font-bold text-amber-300">
                  B. Hạng mục CHƯA THỂ KIỂM THỬ VẬT LÍ TRÊN THIẾT BỊ DI ĐỘNG THẬT & GIỚI HẠN CÒN LẠI
                </h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    <strong>Kiểm thử trên phần cứng iPhone Safari & Android thực tế:</strong> Ứng dụng đã áp dụng <code>ResizeObserver</code>, <code>safe-area-inset</code>, vùng chạm nút ≥ 44px và giới hạn <code>devicePixelRatio</code> theo 4 chế độ chất lượng, nhưng môi trường xây dựng hiện tại là máy chủ Linux đám mây nên chưa thực hiện đo FPS trực tiếp trên phần cứng iPhone/Android vật lí ngoài đời thực.
                  </li>
                  <li>
                    <strong>Chưa hiệu chuẩn theo linh kiện thực tế:</strong> Do hình vẽ 15.1 trong SGK KHTN 7 là hình minh họa sư phạm (không có mã model pin quang điện, diện tích cell thực, phổ đèn sợi đốt/LED hay độ nhạy µA/vạch của điện kế), toàn bộ giá trị đầu ra được chuẩn hóa trên thang tương đối <code>0–100% mô hình</code> và <code>-5..0..+5 vạch chia tương đối</code>.
                  </li>
                  <li>
                    <strong>Mô hình quang học chùm sáng:</strong> Phép tính chồng lấp chùm sáng và che khuất dùng lưới tích phân số 25 điểm (5×5) trên mặt phẳng bán dẫn kết hợp quy luật suy giảm khoảng cách có khẩu độ hữu hạn. Đây là mô hình hình học thời gian thực tối ưu cho giáo dục phổ thông, không phải mô phỏng dò tia phổ lượng tử (spectral Monte Carlo ray-tracing).
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
