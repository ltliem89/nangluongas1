import React from 'react';
import { Lightbulb, Move, RotateCw, ShieldAlert, X, Zap } from 'lucide-react';
import { ExperimentState } from '../physics/SimulationEngine';

interface TutorialOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onQuickStartWithObstacle: (patch: Partial<ExperimentState>) => void;
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  isOpen,
  onClose,
  onQuickStartWithObstacle,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/40 backdrop-blur-xs pointer-events-auto">
      <div className="w-full max-w-xl bg-slate-950/55 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-950/45 border-b border-white/10">
          <div>
            <span className="text-[11px] font-semibold text-amber-400 tracking-wide">
              KHTN 7 · BÀI 15: NĂNG LƯỢNG ÁNH SÁNG, TIA SÁNG & VÙNG TỐI
            </span>
            <h2 className="text-base sm:text-lg font-bold text-white mt-0.5">
              Hướng dẫn nhanh: Điều chỉnh đèn & Kéo vật cản sáng
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors cursor-pointer"
            aria-label="Đóng hướng dẫn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3 Core Steps */}
        <div className="p-5 space-y-3 text-xs sm:text-sm text-slate-100">
          {/* Step 1: Lamp adjustment */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-950/40 border border-white/10">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0 mt-0.5">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-white">
                01. Bật đèn, kéo vị trí & xoay hướng chiếu sáng
              </div>
              <p className="text-xs text-slate-200/90 leading-relaxed">
                Nhấn trực tiếp vào <strong>nút công tắc tròn nổi trên chân đèn</strong> (hoặc nút{' '}
                <span className="text-amber-300 font-medium">Đèn: BẬT</span> ở thanh dưới) để phát sáng. Kéo chân đèn để dịch chuyển khoảng cách trên mặt bàn gỗ, hoặc chọn{' '}
                <span className="inline-flex items-center gap-1 text-amber-200 font-medium">
                  <RotateCw className="w-3 h-3" /> Kéo xoay góc
                </span>{' '}
                ở góc trên trái (hay giữ phím <code className="px-1 py-0.5 rounded bg-white/10 text-slate-100">Shift</code>) để chỉnh hướng chùm sáng.
              </p>
            </div>
          </div>

          {/* Step 2: Dragging the light obstacle */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-950/40 border border-white/10">
            <div className="w-9 h-9 rounded-lg bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-rose-300 shrink-0 mt-0.5">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-white">
                02. Đặt & kéo Vật cản sáng để tạo vùng tối thực tế
              </div>
              <p className="text-xs text-slate-200/90 leading-relaxed">
                Nhấn nút{' '}
                <span className="text-rose-300 font-medium">Đặt Vật cản sáng lên bàn</span>, sau đó dùng chuột hoặc ngón tay{' '}
                <span className="inline-flex items-center gap-1 text-amber-200 font-medium">
                  <Move className="w-3 h-3" /> nắm kéo trực tiếp vật cản
                </span>{' '}
                trượt qua lại giữa đèn và tấm pin. Quan sát các tia sáng bị chặn lại, tạo <strong>vùng tối / bán tối</strong> phía sau và làm kim điện kế giảm độ lệch.
              </p>
            </div>
          </div>

          {/* Step 3: PV Panel, Circuit Switch & Camera */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-950/40 border border-white/10">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shrink-0 mt-0.5">
              <Zap className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-white">
                03. Di chuyển Pin quang điện, Đóng/Mở mạch & Xoay Camera
              </div>
              <p className="text-xs text-slate-200/90 leading-relaxed">
                Mọi thiết bị trên bàn đều kéo di chuyển được và dây dẫn sẽ tự động uốn theo. Nhấn vào <strong>Khóa mạch điện</strong> để đóng/mở mạch; kéo ở vùng trống ngoài bàn để xoay góc nhìn 3D (phím <code className="px-1 py-0.5 rounded bg-white/10 text-slate-100">H</code> để ẩn/hiện thanh công cụ).
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-950/45 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => {
              onQuickStartWithObstacle({
                lampOn: true,
                occluderActive: true,
                occluderPos: { x: -0.9, z: 0.28 },
                dragInteractionMode: 'translate',
              });
              onClose();
            }}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold text-amber-200 transition-colors cursor-pointer"
          >
            Thử ngay: Bật đèn & Kéo vật cản sáng
          </button>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-500/90 hover:bg-amber-400 text-xs font-bold text-slate-950 transition-colors cursor-pointer"
          >
            Đã hiểu, bắt đầu thí nghiệm
          </button>
        </div>
      </div>
    </div>
  );
};
