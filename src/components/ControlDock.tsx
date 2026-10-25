import React, { useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Eye,
  Lightbulb,
  Minus,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Zap,
} from 'lucide-react';
import {
  CameraPreset,
  DEFAULT_EXPERIMENT_STATE,
  ExperimentState,
  PhysicsEvaluation,
  QualityMode,
  SCENE_GEOMETRY,
  VisualBeamMode,
  computeLampPosFromDistance,
} from '../physics/SimulationEngine';

interface ControlDockProps {
  state: ExperimentState;
  physics: PhysicsEvaluation;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onUpdateState: (patch: Partial<ExperimentState>) => void;
  onReset: () => void;
  onOpenAuditModal: () => void;
}

type DockTab = 'basic' | 'geometry' | 'display' | 'status';

export const ControlDock: React.FC<ControlDockProps> = ({
  state,
  physics,
  isCollapsed,
  onToggleCollapse,
  onUpdateState,
  onReset,
  onOpenAuditModal,
}) => {
  const [activeTab, setActiveTab] = useState<DockTab>('basic');

  const illumPercent = Math.round(Math.min(1, physics.illumination.effectiveIrradiance) * 100);
  const currentPercent = Math.round(physics.circuit.currentMagnitudeNorm * 100);
  const needleDiv = physics.galvanometer.targetScaleDivision;

  const illumCategoryText =
    physics.illumination.illuminationCategory === 'none'
      ? 'Không có (0%)'
      : physics.illumination.illuminationCategory === 'low'
        ? `Thấp (${illumPercent}%)`
        : physics.illumination.illuminationCategory === 'medium'
          ? `Vừa (${illumPercent}%)`
          : `Cao (${illumPercent}%)`;

  const stepValue = (
    key: keyof ExperimentState,
    current: number,
    delta: number,
    min: number,
    max: number,
    decimals = 2,
  ) => {
    const next = Math.max(min, Math.min(max, Number((current + delta).toFixed(decimals))));
    onUpdateState({ [key]: next } as Partial<ExperimentState>);
  };

  return (
    <div
      className="fixed bottom-0 left-1/2 -translate-x-1/2 z-30 w-full max-w-[980px] px-2 sm:px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pointer-events-none"
    >
      {/* Thanh nút thu gọn / mở rộng và tóm tắt nhanh luôn hiển thị */}
      <div className="flex items-center justify-between gap-2 mb-1.5 pointer-events-auto">
        <div className="flex items-center gap-1.5 bg-slate-950/95 border border-slate-800 rounded-lg px-3 py-1.5 shadow-lg overflow-x-auto max-w-[calc(100vw-150px)]">
          <span className="text-xs font-semibold text-slate-200 whitespace-nowrap">
            Đèn: {state.lampOn ? 'Đang bật' : 'Đang tắt'}
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="text-xs text-slate-300 whitespace-nowrap tabular-nums">
            Quang năng tới pin: <strong className="text-amber-300">{illumCategoryText}</strong>
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="text-xs text-slate-300 whitespace-nowrap tabular-nums">
            Mạch: <strong className={state.circuitClosed ? 'text-emerald-300' : 'text-rose-300'}>{state.circuitClosed ? 'Kín' : 'Hở'}</strong>
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="text-xs text-slate-300 whitespace-nowrap tabular-nums">
            Điện kế:{' '}
            <strong className="text-sky-300 font-mono">
              {Math.abs(needleDiv) < 0.08
                ? '0.0 vạch'
                : `${needleDiv > 0 ? '+' : ''}${needleDiv.toFixed(1)} vạch`}
            </strong>
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-semibold text-slate-100 hover:bg-slate-800 transition-colors shadow-lg whitespace-nowrap shrink-0 cursor-pointer"
          title="Phím tắt: H"
        >
          {isCollapsed ? (
            <>
              <ChevronUp className="w-4 h-4 text-amber-400" />
              <span>Hiện bảng điều khiển</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4 text-slate-400" />
              <span>Ẩn công cụ</span>
            </>
          )}
        </button>
      </div>

      {/* Bảng điều khiển chính (ẩn hoàn toàn khi thu gọn để tối đa diện tích 3D) */}
      {!isCollapsed && (
        <div className="bg-slate-950/95 border border-slate-800 rounded-xl shadow-2xl overflow-hidden pointer-events-auto">
          {/* Dòng giải thích nhân quả trực tiếp theo trạng thái thật */}
          <div className="px-3.5 py-2 bg-slate-900/90 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-xs text-slate-200 leading-snug">
              <span className="font-semibold text-amber-300 mr-1.5">Giải thích hiện tượng:</span>
              {physics.causalSummary}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  onUpdateState({
                    ...DEFAULT_EXPERIMENT_STATE,
                    lampOn: false,
                    qualityMode: state.qualityMode,
                  })
                }
                className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                  !state.lampOn && state.circuitClosed && !state.occluderActive
                    ? 'bg-slate-800 text-white border-slate-600'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                Bước 1 SGK (Đèn tắt)
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateState({
                    ...DEFAULT_EXPERIMENT_STATE,
                    lampOn: true,
                    qualityMode: state.qualityMode,
                  })
                }
                className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                  state.lampOn &&
                  state.circuitClosed &&
                  !state.occluderActive &&
                  state.lampYawDeg === 0 &&
                  state.pvYawDeg === 0
                    ? 'bg-amber-500/20 text-amber-200 border-amber-500/50'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                Bước 2 SGK (Bật đèn)
              </button>
            </div>
          </div>

          {/* Thanh chuyển Tab */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800/80 bg-slate-950 overflow-x-auto gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('basic')}
                className={`flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'basic'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-900'
                }`}
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>Thí nghiệm chính</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('geometry')}
                className={`flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'geometry'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-900'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Góc chiếu & Mạch điện</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('display')}
                className={`flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'display'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-900'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Camera & Hiển thị</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('status')}
                className={`flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'status'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-900'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Trạng thái khoa học</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onOpenAuditModal}
                className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
              >
                Kiểm thử & Nguồn SGK
              </button>
              <button
                type="button"
                onClick={onReset}
                className="flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
                title="Đặt lại toàn bộ thí nghiệm về trạng thái ban đầu"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Đặt lại</span>
              </button>
            </div>
          </div>

          {/* Nội dung từng Tab */}
          <div className="p-3 sm:p-4 max-h-[36vh] overflow-y-auto">
            {activeTab === 'basic' && (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                {/* Cột 1: Công tắc chính (Bật/Tắt đèn, Vật chắn, Đóng/Mở mạch) */}
                <div className="sm:col-span-5 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const nextOn = !state.lampOn || state.lampIntensity <= 0.001;
                      onUpdateState({
                        lampOn: nextOn,
                        lampIntensity: nextOn && state.lampIntensity <= 0.001 ? 0.8 : state.lampIntensity,
                      });
                    }}
                    className={`min-h-[48px] px-2.5 py-2 rounded-lg border text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                      state.lampOn && state.lampIntensity > 0.001
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                        : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <Lightbulb className="w-4 h-4" />
                    <span className="whitespace-nowrap">
                      {state.lampOn && state.lampIntensity > 0.001 ? 'BẬT ĐÈN' : 'TẮT ĐÈN'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateState({
                        occluderActive: !state.occluderActive,
                        occluderInsertion: 1.0,
                      })
                    }
                    className={`min-h-[48px] px-2.5 py-2 rounded-lg border text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                      state.occluderActive
                        ? 'bg-rose-600 text-white border-rose-500'
                        : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span className="whitespace-nowrap">
                      {state.occluderActive ? 'Chắn sáng: BẬT' : 'Chắn sáng: TẮT'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onUpdateState({ circuitClosed: !state.circuitClosed })}
                    className={`min-h-[48px] px-2.5 py-2 rounded-lg border text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                      state.circuitClosed
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-slate-900 text-rose-300 border-rose-700/60 hover:bg-slate-800'
                    }`}
                  >
                    <Zap className="w-4 h-4" />
                    <span className="whitespace-nowrap">
                      {state.circuitClosed ? 'Mạch: KÍN' : 'Mạch: HỞ'}
                    </span>
                  </button>
                </div>

                {/* Cột 2: Độ sáng đèn chuẩn hóa (0% -> 100%, 0% là không có ánh sáng) */}
                <div className="sm:col-span-4 bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-slate-300">Độ sáng đèn (0% – 100%)</span>
                    <span className="font-mono font-semibold text-amber-300 tabular-nums">
                      {Math.round(state.lampIntensity * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const next = Math.max(0, Math.min(1, Number((state.lampIntensity - 0.1).toFixed(2))));
                        onUpdateState({
                          lampIntensity: next,
                          lampOn: next > 0 ? true : state.lampOn,
                        });
                      }}
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                      aria-label="Giảm độ sáng đèn"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1.0}
                      step={0.01}
                      value={state.lampIntensity}
                      onChange={(e) => {
                        const next = parseFloat(e.target.value);
                        onUpdateState({
                          lampIntensity: next,
                          lampOn: next > 0 ? true : state.lampOn,
                        });
                      }}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = Math.max(0, Math.min(1, Number((state.lampIntensity + 0.1).toFixed(2))));
                        onUpdateState({
                          lampIntensity: next,
                          lampOn: next > 0 ? true : state.lampOn,
                        });
                      }}
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                      aria-label="Tăng độ sáng đèn"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Cột 3: Khoảng cách đèn - pin */}
                <div className="sm:col-span-3 bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-slate-300">Khoảng cách đèn</span>
                    <span className="font-mono font-semibold text-sky-300 tabular-nums">
                      {(physics.illumination.distance / SCENE_GEOMETRY.referenceDistance).toFixed(2)}×
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const nextD = Math.max(
                          SCENE_GEOMETRY.minDistance,
                          Math.min(
                            SCENE_GEOMETRY.maxDistance,
                            Number((state.lampDistance - 0.15).toFixed(2)),
                          ),
                        );
                        const tf = computeLampPosFromDistance(state.pvPos, nextD);
                        onUpdateState({
                          lampDistance: nextD,
                          lampPos: tf.lampPos,
                          lampHeight: tf.lampHeight,
                        });
                      }}
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                      aria-label="Giảm khoảng cách đèn"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="range"
                      min={SCENE_GEOMETRY.minDistance}
                      max={SCENE_GEOMETRY.maxDistance}
                      step={0.05}
                      value={state.lampDistance}
                      onChange={(e) => {
                        const nextD = parseFloat(e.target.value);
                        const tf = computeLampPosFromDistance(state.pvPos, nextD);
                        onUpdateState({
                          lampDistance: nextD,
                          lampPos: tf.lampPos,
                          lampHeight: tf.lampHeight,
                        });
                      }}
                      className="w-full accent-sky-400 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const nextD = Math.max(
                          SCENE_GEOMETRY.minDistance,
                          Math.min(
                            SCENE_GEOMETRY.maxDistance,
                            Number((state.lampDistance + 0.15).toFixed(2)),
                          ),
                        );
                        const tf = computeLampPosFromDistance(state.pvPos, nextD);
                        onUpdateState({
                          lampDistance: nextD,
                          lampPos: tf.lampPos,
                          lampHeight: tf.lampHeight,
                        });
                      }}
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                      aria-label="Tăng khoảng cách đèn"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'geometry' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Chỉnh hướng chiếu đèn */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-slate-200">Hướng chiếu đèn (Ngang)</span>
                    <span className="font-mono text-amber-300 tabular-nums">{state.lampYawDeg}°</span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <button
                      type="button"
                      onClick={() => stepValue('lampYawDeg', state.lampYawDeg, -5, -45, 45, 0)}
                      className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="range"
                      min={-45}
                      max={45}
                      step={1}
                      value={state.lampYawDeg}
                      onChange={(e) => onUpdateState({ lampYawDeg: parseInt(e.target.value, 10) })}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => stepValue('lampYawDeg', state.lampYawDeg, 5, -45, 45, 0)}
                      className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-slate-200">Góc chúc/ngẩng đèn</span>
                    <span className="font-mono text-amber-300 tabular-nums">{state.lampPitchDeg}°</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => stepValue('lampPitchDeg', state.lampPitchDeg, -5, -35, 35, 0)}
                      className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="range"
                      min={-35}
                      max={35}
                      step={1}
                      value={state.lampPitchDeg}
                      onChange={(e) => onUpdateState({ lampPitchDeg: parseInt(e.target.value, 10) })}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => stepValue('lampPitchDeg', state.lampPitchDeg, 5, -35, 35, 0)}
                      className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Xoay mặt pin quang điện & mức đẩy tấm chắn */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-slate-200">Xoay mặt Pin quang điện</span>
                    <span className="font-mono text-emerald-300 tabular-nums">
                      {state.pvYawDeg}° (Góc tới: {Math.round(physics.illumination.incidenceAngleDeg)}°)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <button
                      type="button"
                      onClick={() => stepValue('pvYawDeg', state.pvYawDeg, -10, -85, 85, 0)}
                      className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="range"
                      min={-85}
                      max={85}
                      step={1}
                      value={state.pvYawDeg}
                      onChange={(e) => onUpdateState({ pvYawDeg: parseInt(e.target.value, 10) })}
                      className="w-full accent-emerald-400 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => stepValue('pvYawDeg', state.pvYawDeg, 10, -85, 85, 0)}
                      className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-slate-200">Mức che của vật chắn</span>
                    <span className="font-mono text-rose-300 tabular-nums">
                      {state.occluderActive ? `${Math.round(state.occluderInsertion * 100)}%` : 'Đang tắt'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={state.occluderActive ? state.occluderInsertion : 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        onUpdateState({
                          occluderActive: val > 0.02,
                          occluderInsertion: val,
                        });
                      }}
                      className="w-full accent-rose-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Đấu dây cực tính & Ánh sáng môi trường */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 flex flex-col justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium text-slate-200 mb-1">
                      Đấu dây tại Điện kế (Zero-Center)
                    </div>
                    <button
                      type="button"
                      onClick={() => onUpdateState({ wiringReversed: !state.wiringReversed })}
                      className={`w-full min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                        state.wiringReversed
                          ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                          : 'bg-slate-950 border-slate-700 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {state.wiringReversed
                        ? 'Đang đảo 2 dây (Kim lệch chiều −)'
                        : 'Đấu dây chuẩn SGK (Kim lệch chiều +)'}
                    </button>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-slate-200 mb-1">
                      Chế độ ánh sáng môi trường phòng
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateState({
                          ambientMode:
                            state.ambientMode === 'sgk_controlled'
                              ? 'classroom_ambient'
                              : 'sgk_controlled',
                        })
                      }
                      className={`w-full min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                        state.ambientMode === 'classroom_ambient'
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-slate-950 border-slate-700 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {state.ambientMode === 'sgk_controlled'
                        ? 'Chế độ SGK (Khống chế sáng nền = 0)'
                        : 'Thực tế phòng sáng (Lệch nhẹ khi tắt đèn)'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'display' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Chế độ hiển thị chùm sáng */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                  <div className="text-xs font-medium text-slate-200 mb-1.5">
                    Biểu diễn chùm sáng (Tách biệt vật lí)
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {(
                      [
                        ['realistic', 'Chế độ thực tế (Không vẽ nón sáng đục)'],
                        ['explanatory_cone', 'Chế độ giải thích: Hình nón SGK'],
                        ['explanatory_rays', 'Chế độ giải thích: Các tia sáng có hướng'],
                      ] as [VisualBeamMode, string][]
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onUpdateState({ visualBeamMode: mode })}
                        className={`min-h-[36px] px-2.5 py-1 rounded text-left text-xs font-medium border transition-colors cursor-pointer ${
                          state.visualBeamMode === mode
                            ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Góc nhìn Camera */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                  <div className="text-xs font-medium text-slate-200 mb-1.5">Góc nhìn Camera 3D</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        ['overview', 'Toàn cảnh bàn'],
                        ['pv_closeup', 'Cận cảnh Pin'],
                        ['galvanometer_closeup', 'Cận cảnh Điện kế'],
                      ] as [CameraPreset, string][]
                    ).map(([preset, label]) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => onUpdateState({ cameraPreset: preset })}
                        className={`min-h-[38px] px-2.5 py-1.5 rounded text-xs font-semibold border transition-colors cursor-pointer ${
                          state.cameraPreset === preset
                            ? 'bg-sky-500 text-slate-950 border-sky-400'
                            : 'bg-slate-950 text-slate-200 border-slate-800 hover:bg-slate-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => onUpdateState({ cameraPreset: 'overview' })}
                      className="min-h-[38px] px-2.5 py-1.5 rounded text-xs font-medium border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Khôi phục góc nhìn
                    </button>
                  </div>
                </div>

                {/* Nhãn, Hạt tải điện, Chế độ Phòng tối & Chất lượng đồ họa */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 flex flex-col justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdateState({ darkLabVisualMode: !state.darkLabVisualMode })}
                    className={`w-full min-h-[36px] px-2.5 py-1 rounded text-xs font-semibold border transition-colors cursor-pointer ${
                      state.darkLabVisualMode
                        ? 'bg-blue-950/80 border-blue-500/70 text-sky-200'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    {state.darkLabVisualMode
                      ? 'Phòng tối + Spotlight xanh đêm: BẬT'
                      : 'Phòng tối + Spotlight xanh đêm: TẮT'}
                  </button>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onUpdateState({ showLabels: !state.showLabels })}
                      className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-semibold border transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                        state.showLabels
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{state.showLabels ? 'Nhãn: HIỆN' : 'Nhãn: ẨN'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onUpdateState({
                          showChargeFlowConceptual: !state.showChargeFlowConceptual,
                        })
                      }
                      className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-semibold border transition-colors cursor-pointer ${
                        state.showChargeFlowConceptual
                          ? 'bg-sky-500/20 border-sky-500/50 text-sky-200'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {state.showChargeFlowConceptual ? 'Minh họa dòng: BẬT' : 'Minh họa dòng: TẮT'}
                    </button>
                  </div>

                  <div>
                    <div className="text-[11px] font-medium text-slate-300 mb-1">
                      Chất lượng kết xuất (Retina/HiDPI):
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {(
                        [
                          ['auto', 'Tự động'],
                          ['high', 'Cao'],
                          ['balanced', 'Cân bằng'],
                          ['battery_saver', 'Tiết kiệm'],
                        ] as [QualityMode, string][]
                      ).map(([q, lbl]) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => onUpdateState({ qualityMode: q })}
                          className={`min-h-[32px] px-1.5 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                            state.qualityMode === q
                              ? 'bg-slate-200 text-slate-950 border-white'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-900'
                          }`}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'status' && (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                {/* Bảng thông số chuẩn hóa (Không gán đơn vị định lượng giả) */}
                <div className="sm:col-span-6 bg-slate-900/90 border border-slate-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-white">
                      Bảng trạng thái khoa học (Thang chuẩn hóa 0–100% mô hình)
                    </span>
                    <span className="text-[11px] text-slate-400">Chưa hiệu chuẩn linh kiện thật</span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-slate-300">Mức chiếu sáng hữu hiệu tới Pin:</span>
                        <span className="font-mono font-semibold text-amber-300 tabular-nums">
                          {illumCategoryText}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-amber-400 transition-all duration-150"
                          style={{ width: `${illumPercent}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-slate-300">Đầu ra dòng điện tương đối qua mạch:</span>
                        <span className="font-mono font-semibold text-emerald-300 tabular-nums">
                          {currentPercent === 0
                            ? 'Không đáng kể (0%)'
                            : `Có dòng tương đối (${currentPercent}% mô hình)`}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-emerald-400 transition-all duration-150"
                          style={{ width: `${currentPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="pt-1 flex items-center justify-between border-t border-slate-800/80">
                      <span className="text-slate-300">Trạng thái kim điện kế:</span>
                      <span className="font-mono font-semibold text-sky-300">
                        {physics.galvanometer.statusText}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Chuỗi nhân quả 4 bước */}
                <div className="sm:col-span-6 bg-slate-900/90 border border-slate-800 rounded-lg p-3">
                  <div className="text-xs font-semibold text-white mb-1.5">
                    Chuỗi nhân quả Vật lí đang diễn ra:
                  </div>
                  <ul className="space-y-1 text-[11px] text-slate-300 leading-relaxed">
                    {physics.detailedChain.map((stepStr, idx) => (
                      <li key={idx} className="tabular-nums">
                        {stepStr}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
