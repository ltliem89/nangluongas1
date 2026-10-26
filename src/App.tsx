/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_EXPERIMENT_STATE,
  ExperimentState,
  evaluateExperimentPhysics,
} from './physics/SimulationEngine';
import { LabViewport3D } from './three/LabViewport3D';
import { ControlDock } from './components/ControlDock';
import { ScientificAuditModal } from './components/ScientificAuditModal';
import { TutorialOverlay } from './components/TutorialOverlay';
import {
  ControllableObjectKey,
  GamePhase,
  LAB_MISSIONS,
} from './game/missions';
import { gameAudio } from './audio/gameAudio';

export default function App() {
  const [state, setState] = useState<ExperimentState>(() => ({
    ...DEFAULT_EXPERIMENT_STATE,
    lampOn: true,
    lampIntensity: 0.85,
    darkLabVisualMode: true,
  }));

  // Game Shell state: 'title' -> 'playing' -> 'paused' / 'mission_clear' / 'victory'
  const [gamePhase, setGamePhase] = useState<GamePhase>('title');
  const [playMode, setPlayMode] = useState<'mission' | 'sandbox'>('mission');
  const [missionIndex, setMissionIndex] = useState<number>(0);
  const [completedMissions, setCompletedMissions] = useState<Record<string, boolean>>({});
  const [score, setScore] = useState<number>(0);
  const [holdSeconds, setHoldSeconds] = useState<number>(0);
  const [showMissionHint, setShowMissionHint] = useState<boolean>(false);
  const [selectedObject, setSelectedObject] = useState<ControllableObjectKey>('lamp');
  const [celebrationTrigger, setCelebrationTrigger] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Collapsed by default during gameplay so >85% of the 3D viewport remains unobstructed
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(true);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [fpsInfo, setFpsInfo] = useState<{ fps: number | null; isSoftwareGl: boolean }>({
    fps: null,
    isSoftwareGl: false,
  });

  const currentMission = LAB_MISSIONS[missionIndex] ?? LAB_MISSIONS[0];

  // Tính toán mô hình vật lí độc lập từ trạng thái thí nghiệm
  const physics = useMemo(() => evaluateExperimentPhysics(state), [state]);

  // Đánh giá mục tiêu Nhiệm vụ theo thời gian thực
  const missionEval = useMemo(
    () => currentMission.evaluate(state, physics),
    [currentMission, state, physics],
  );

  const handleUpdateState = useCallback((patch: Partial<ExperimentState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const loadMissionSetup = useCallback((idx: number) => {
    const targetMission = LAB_MISSIONS[idx] ?? LAB_MISSIONS[0];
    setMissionIndex(idx);
    setHoldSeconds(0);
    setShowMissionHint(false);
    setSelectedObject(targetMission.recommendedObject);
    setState((prev) => ({
      ...DEFAULT_EXPERIMENT_STATE,
      ...targetMission.initialPatch,
      qualityMode: prev.qualityMode,
    }));
  }, []);

  const handleStartMissionGame = useCallback(() => {
    gameAudio.playSelectSound();
    setPlayMode('mission');
    loadMissionSetup(0);
    setGamePhase('playing');
  }, [loadMissionSetup]);

  const handleStartSandbox = useCallback(() => {
    gameAudio.playSelectSound();
    setPlayMode('sandbox');
    setHoldSeconds(0);
    setSelectedObject('lamp');
    setState((prev) => ({
      ...DEFAULT_EXPERIMENT_STATE,
      lampOn: true,
      lampIntensity: 0.85,
      darkLabVisualMode: true,
      qualityMode: prev.qualityMode,
    }));
    setGamePhase('playing');
  }, []);

  const handleReset = useCallback(() => {
    gameAudio.playSelectSound();
    if (playMode === 'mission') {
      loadMissionSetup(missionIndex);
    } else {
      setState((prev) => ({
        ...DEFAULT_EXPERIMENT_STATE,
        qualityMode: prev.qualityMode,
      }));
    }
  }, [playMode, missionIndex, loadMissionSetup]);

  const handleNextMission = useCallback(() => {
    gameAudio.playSelectSound();
    if (missionIndex + 1 < LAB_MISSIONS.length) {
      loadMissionSetup(missionIndex + 1);
      setGamePhase('playing');
    } else {
      setPlayMode('sandbox');
      setGamePhase('playing');
    }
  }, [missionIndex, loadMissionSetup]);

  const handleToggleMute = useCallback(() => {
    const nextMuted = gameAudio.toggleMute();
    setIsMuted(nextMuted);
  }, []);

  const handleFpsReport = useCallback((fps: number, isSoftwareGl: boolean) => {
    setFpsInfo({ fps, isSoftwareGl });
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {
          setIsDockCollapsed((prev) => !prev);
        });
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  }, []);

  // Vòng lặp kiểm tra giữ mục tiêu Nhiệm vụ (Hold-Timer Lock-In)
  const missionSatisfiedRef = useRef(missionEval.satisfied);
  missionSatisfiedRef.current = missionEval.satisfied;
  const lastTickSoundRef = useRef<number>(0);

  useEffect(() => {
    if (gamePhase !== 'playing' || playMode !== 'mission') {
      setHoldSeconds(0);
      return;
    }

    const intervalMs = 50;
    const timer = window.setInterval(() => {
      if (missionSatisfiedRef.current) {
        setHoldSeconds((prev) => {
          const next = prev + intervalMs / 1000;
          const now = performance.now();
          if (now - lastTickSoundRef.current > 320 && next < currentMission.holdDurationSec) {
            lastTickSoundRef.current = now;
            gameAudio.playLockTickSound(next / currentMission.holdDurationSec);
          }
          if (next >= currentMission.holdDurationSec) {
            // Hoàn thành nhiệm vụ!
            const alreadyDone = completedMissions[currentMission.id];
            setCompletedMissions((old) => ({ ...old, [currentMission.id]: true }));
            setScore((s) => s + (alreadyDone ? 100 : currentMission.basePoints));
            setCelebrationTrigger((c) => c + 1);

            const isFinalMission = missionIndex === LAB_MISSIONS.length - 1;
            if (isFinalMission) {
              gameAudio.playVictoryFanfare();
              setGamePhase('victory');
            } else {
              gameAudio.playMissionCompleteSound();
              setGamePhase('mission_clear');
            }
            return currentMission.holdDurationSec;
          }
          return next;
        });
      } else {
        setHoldSeconds((prev) => (prev > 0 ? Math.max(0, prev - (intervalMs / 1000) * 1.5) : 0));
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [gamePhase, playMode, currentMission, missionIndex, completedMissions]);

  // Phím tắt hệ thống Game Shell (Enter/Space ở màn hình mở đầu, Esc tạm dừng, H ẩn/hiện bảng, ?: hướng dẫn)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (gamePhase === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleStartMissionGame();
        }
        return;
      }

      if (gamePhase === 'mission_clear') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleNextMission();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (isTutorialOpen) {
          setIsTutorialOpen(false);
          return;
        }
        if (isAuditModalOpen) {
          setIsAuditModalOpen(false);
          return;
        }
        setGamePhase((prev) => (prev === 'playing' ? 'paused' : prev === 'paused' ? 'playing' : prev));
        gameAudio.playSelectSound();
      } else if (e.key === 'h' || e.key === 'H') {
        setIsDockCollapsed((prev) => !prev);
      } else if (e.key === '?') {
        setIsTutorialOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    gamePhase,
    isTutorialOpen,
    isAuditModalOpen,
    handleStartMissionGame,
    handleNextMission,
  ]);

  const holdRatio = Math.min(1, holdSeconds / currentMission.holdDurationSec);
  const completedCount = Object.keys(completedMissions).length;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 select-none">
      {/* Full-Viewport 3D WebGL Scene (Isolated container so React state updates never re-create the canvas) */}
      <main className="w-full h-full">
        <LabViewport3D
          state={state}
          physics={physics}
          onUpdateState={handleUpdateState}
          onFpsReport={handleFpsReport}
          selectedObject={selectedObject}
          onSelectObject={setSelectedObject}
          gamePhase={gamePhase}
          celebrationTrigger={celebrationTrigger}
        />
      </main>

      {/* =====================================================================
          1. MÀN HÌNH MỞ ĐẦU GAME (TITLE SCREEN OVERLAY — 35%+ NEGATIVE SPACE)
         ===================================================================== */}
      {gamePhase === 'title' && (
        <div className="fixed inset-0 z-40 flex flex-col justify-between p-5 sm:p-8 pointer-events-none bg-gradient-to-b from-slate-950/85 via-slate-950/20 to-slate-950/90">
          {/* Top Brand Lockup with Bespoke SVG Emblem */}
          <div className="flex items-center justify-between gap-4 pointer-events-auto">
            <div className="flex items-center gap-3">
              <svg
                className="w-10 h-10 shrink-0"
                viewBox="0 0 48 48"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="2"
                  y="2"
                  width="44"
                  height="44"
                  rx="12"
                  fill="#0F172A"
                  stroke="#F59E0B"
                  strokeWidth="2"
                />
                <circle cx="15" cy="24" r="6" fill="#FBBF24" />
                <path
                  d="M21 21L38 13V35L21 27V21Z"
                  fill="#FDE047"
                  fillOpacity="0.35"
                  stroke="#FBBF24"
                  strokeWidth="1.5"
                />
                <rect
                  x="35"
                  y="14"
                  width="4"
                  height="20"
                  rx="1.5"
                  fill="#38BDF8"
                />
              </svg>
              <div>
                <div className="text-xs font-mono uppercase tracking-widest text-amber-400">
                  KHTN 7 · BÀI 15 · KẾT NỐI TRI THỨC
                </div>
                <div className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Phòng Thí Nghiệm Tương Tác 3D
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleMute}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900/95 border border-slate-700 text-xs font-semibold text-slate-200 hover:border-amber-400 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {isMuted ? (
                  <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
                ) : (
                  <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                )}
              </svg>
              <span>{isMuted ? 'Âm thanh: TẮT' : 'Âm thanh: BẬT'}</span>
            </button>
          </div>

          {/* Center Negative Space reveals the live 3D optical bench & Tyndall dust beam */}
          <div className="my-auto max-w-xl pointer-events-auto">
            {/* Bespoke SVG Title Lockup */}
            <svg
              className="w-full max-w-[440px] h-auto mb-3"
              viewBox="0 0 520 110"
              fill="none"
              role="img"
              aria-label="Năng Lượng Ánh Sáng: Tia Sáng & Vùng Tối"
            >
              <text
                x="0"
                y="46"
                fill="#FFFFFF"
                fontSize="40"
                fontWeight="800"
                fontFamily="system-ui, -apple-system, sans-serif"
                letterSpacing="-0.02em"
              >
                NĂNG LƯỢNG ÁNH SÁNG
              </text>
              <text
                x="2"
                y="88"
                fill="#FBBF24"
                fontSize="26"
                fontWeight="700"
                fontFamily="system-ui, -apple-system, sans-serif"
                letterSpacing="0.04em"
              >
                TIA SÁNG · VÙNG TỐI · QUANG ĐIỆN 3D
              </text>
              <line x1="2" y1="102" x2="260" y2="102" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" />
              <circle cx="274" cy="102" r="4" fill="#FBBF24" />
            </svg>

            <p className="text-sm sm:text-base text-slate-200 leading-relaxed mb-5 max-w-lg">
              Điều khiển trực tiếp Đèn chiếu, Vật cản sáng, Tấm pin quang điện vân bạc và Khóa mạch trên bàn gỗ 3D để chinh phục 4 thử thách vật lí thực nghiệm.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleStartMissionGame}
                className="flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm sm:text-base shadow-xl transition-transform active:scale-95 cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>BẮT ĐẦU NHIỆM VỤ (ENTER)</span>
              </button>

              <button
                type="button"
                onClick={handleStartSandbox}
                className="px-4 py-3.5 rounded-xl bg-slate-900/95 hover:bg-slate-800 border border-slate-700 text-slate-100 font-semibold text-sm transition-colors cursor-pointer"
              >
                Phòng Thí Nghiệm Tự Do
              </button>
            </div>
          </div>

          {/* Single Flat Control-Hint Line at Bottom */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800/80 text-xs text-slate-300 pointer-events-auto">
            <div className="font-mono tracking-tight">
              WASD Di chuyển thiết bị · Q/E Xoay góc · Space Bật/Tắt đèn · 1–5 Chọn thiết bị · Esc Tạm dừng
            </div>
            <div className="text-slate-400">
              Mô phỏng Vật lí 60fps · Bóng tối Umbra & Hạt bụi Tyndall 3D
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          2. GIAO DIỆN HUD VIỀN NGOÀI KHI ĐANG CHƠI (PERIMETER HUD — >85% CLEAR)
         ===================================================================== */}
      {gamePhase !== 'title' && (
        <div className="fixed top-0 left-0 right-0 z-30 p-2.5 sm:p-3.5 flex flex-wrap items-start justify-between gap-2 pointer-events-none">
          {/* Cụm Góc Trên Trái: Chuyển đổi Nhiệm vụ / Tự do + Điểm số & Sao (tabular-nums) */}
          <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
            <div className="flex items-center gap-2 bg-slate-950/95 border border-slate-800 rounded-xl px-3 py-1.5 shadow-lg">
              {/* Custom SVG Trophy/Star Icon */}
              <svg className="w-4 h-4 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
              </svg>
              <span className="text-xs font-bold text-white tabular-nums">
                {score} ĐIỂM
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-xs font-semibold text-amber-300 tabular-nums">
                {completedCount}/{LAB_MISSIONS.length} Nhiệm vụ
              </span>
            </div>

            {/* Bộ chọn Nhiệm vụ 1-4 hoặc Chế độ Tự do */}
            <div className="flex items-center gap-1 bg-slate-950/95 border border-slate-800 rounded-xl p-1 shadow-lg">
              {LAB_MISSIONS.map((m, idx) => {
                const isDone = !!completedMissions[m.id];
                const isCurrent = playMode === 'mission' && missionIndex === idx;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      gameAudio.playSelectSound();
                      setPlayMode('mission');
                      loadMissionSetup(idx);
                    }}
                    className={`min-h-[30px] px-2.5 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer tabular-nums ${
                      isCurrent
                        ? 'bg-amber-400 text-slate-950'
                        : isDone
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'text-slate-300 hover:bg-slate-900'
                    }`}
                    title={m.title}
                  >
                    NV{m.stepNumber} {isDone ? '✓' : ''}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleStartSandbox}
                className={`min-h-[30px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  playMode === 'sandbox'
                    ? 'bg-sky-400 text-slate-950 font-bold'
                    : 'text-slate-300 hover:bg-slate-900'
                }`}
              >
                Tự do
              </button>
            </div>
          </div>

          {/* Cụm Giữa Trên: Thẻ Nhiệm Vụ Đang Thực Hiện & Thanh Khóa Mục Tiêu (Hold Lock-In) */}
          {playMode === 'mission' && (
            <div className="w-full lg:w-auto lg:max-w-[520px] bg-slate-950/95 border border-slate-800 rounded-xl px-3.5 py-2 shadow-xl pointer-events-auto order-3 lg:order-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-bold text-amber-300 truncate">
                  {currentMission.title}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono text-slate-300 tabular-nums">
                    {missionEval.currentValueText} /{' '}
                    <strong className="text-emerald-300">{missionEval.targetValueText}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowMissionHint((h) => !h)}
                    className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-semibold text-amber-300 hover:bg-slate-800 cursor-pointer"
                  >
                    {showMissionHint ? 'Ẩn gợi ý' : 'Gợi ý'}
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-200 leading-snug mb-1.5">
                {currentMission.goalText}
              </p>

              {showMissionHint && (
                <p className="text-[11px] text-amber-200/95 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1 mb-1.5">
                  Mẹo: {currentMission.hintText}
                </p>
              )}

              {/* Thanh tiến độ đạt ngưỡng + Giữ ổn định để khóa kết quả */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full transition-all duration-75 ${
                      missionEval.satisfied ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                    style={{
                      width: `${Math.round(
                        (missionEval.satisfied
                          ? Math.max(0.15, holdRatio)
                          : missionEval.progress01 * 0.85) * 100,
                      )}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono font-semibold text-slate-300 tabular-nums whitespace-nowrap">
                  {missionEval.satisfied
                    ? `Đang khóa: ${(currentMission.holdDurationSec - holdSeconds).toFixed(1)}s`
                    : `${Math.round(missionEval.progress01 * 100)}%`}
                </span>
              </div>
            </div>
          )}

          {/* Cụm Góc Trên Phải: Chế độ Phòng tối, Âm thanh, Kiểm chứng SGK, Tạm dừng (Esc) */}
          <div className="flex items-center gap-1.5 pointer-events-auto order-2 lg:order-3">
            <button
              type="button"
              onClick={() => handleUpdateState({ darkLabVisualMode: !state.darkLabVisualMode })}
              className={`min-h-[36px] px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                state.darkLabVisualMode
                  ? 'bg-blue-950/95 border-blue-500/60 text-sky-200'
                  : 'bg-slate-950/95 border-slate-800 text-slate-200 hover:bg-slate-900'
              }`}
              title="Bật/tắt chế độ phòng tối & hạt bụi Tyndall"
            >
              {state.darkLabVisualMode ? 'Phòng tối: BẬT' : 'Phòng sáng'}
            </button>

            <button
              type="button"
              onClick={handleToggleMute}
              className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-slate-950/95 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
              title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
            >
              {isMuted ? 'Tắt tiếng' : 'Âm thanh'}
            </button>

            <button
              type="button"
              onClick={() => setIsAuditModalOpen(true)}
              className="hidden sm:inline-flex items-center min-h-[36px] px-2.5 py-1.5 rounded-xl bg-slate-950/95 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
            >
              Kiểm chứng SGK
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="hidden md:inline-flex items-center min-h-[36px] px-2.5 py-1.5 rounded-xl bg-slate-950/95 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
            >
              {isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
            </button>

            <button
              type="button"
              onClick={() => {
                gameAudio.playSelectSound();
                setGamePhase((prev) => (prev === 'paused' ? 'playing' : 'paused'));
              }}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-amber-400 text-xs font-bold text-amber-300 transition-colors cursor-pointer"
              title="Tạm dừng (Phím Esc)"
            >
              Menu (Esc)
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          3. THANH GAME HOTBAR & BẢNG ĐIỀU KHIỂN ĐÁY (CONTROL DOCK)
         ===================================================================== */}
      {gamePhase !== 'title' && (
        <ControlDock
          state={state}
          physics={physics}
          isCollapsed={isDockCollapsed}
          onToggleCollapse={() => setIsDockCollapsed((prev) => !prev)}
          onUpdateState={handleUpdateState}
          onReset={handleReset}
          onOpenAuditModal={() => setIsAuditModalOpen(true)}
          selectedObject={selectedObject}
          onSelectObject={setSelectedObject}
        />
      )}

      {/* =====================================================================
          4. HỘP THOẠI TẠM DỪNG / HOÀN THÀNH NHIỆM VỤ / CHIẾN THẮNG (MODALS)
         ===================================================================== */}
      {(gamePhase === 'paused' || gamePhase === 'mission_clear' || gamePhase === 'victory') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl">
            {gamePhase === 'paused' && (
              <>
                <div className="text-xs font-mono uppercase tracking-wider text-amber-400 mb-1">
                  TẠM DỪNG TRÒ CHƠI
                </div>
                <h2 className="text-xl font-bold text-white mb-2">
                  KHTN 7 · Bài 15: Năng lượng ánh sáng
                </h2>
                <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                  Sử dụng các phím <strong>1–5</strong> để chọn thiết bị trên bàn thí nghiệm,{' '}
                  <strong>WASD</strong> hoặc <strong>Phím mũi tên</strong> để trượt thiết bị trên mặt bàn gỗ,{' '}
                  <strong>Q / E</strong> để xoay góc, <strong>R / F</strong> để tăng/giảm độ sáng đèn (0%–100%), và{' '}
                  <strong>Space</strong> để Bật/Tắt đèn.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      gameAudio.playSelectSound();
                      setGamePhase('playing');
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs cursor-pointer"
                  >
                    Tiếp tục (Esc)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleReset();
                      setGamePhase('playing');
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs border border-slate-700 cursor-pointer"
                  >
                    Chơi lại Nhiệm vụ hiện tại
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsTutorialOpen(true);
                      setGamePhase('playing');
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs border border-slate-700 cursor-pointer"
                  >
                    Xem Hướng dẫn Thao tác
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGamePhase('title');
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 font-semibold text-xs border border-slate-800 cursor-pointer"
                  >
                    Về Màn Hình Mở Đầu
                  </button>
                </div>
              </>
            )}

            {gamePhase === 'mission_clear' && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-bold">
                    HOÀN THÀNH XUẤT SẮC · +{currentMission.basePoints} ĐIỂM
                  </span>
                  <span className="text-amber-400 font-bold text-sm">★ ★ ★</span>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">
                  {currentMission.title}
                </h2>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-emerald-500/40 text-xs text-slate-200 leading-relaxed mb-5">
                  <strong className="text-emerald-300 block mb-1">Kiến thức Vật lí rút ra:</strong>
                  {currentMission.scienceTakeaway}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      loadMissionSetup(missionIndex);
                      setGamePhase('playing');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                  >
                    Thực hiện lại
                  </button>
                  <button
                    type="button"
                    onClick={handleNextMission}
                    className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-xs font-bold text-slate-950 cursor-pointer"
                  >
                    Nhiệm vụ tiếp theo (Enter) →
                  </button>
                </div>
              </>
            )}

            {gamePhase === 'victory' && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
                    CHINH PHỤC TOÀN BỘ 4 NHIỆM VỤ KHTN 7 · BÀI 15
                  </span>
                  <span className="text-amber-400 font-bold text-base tabular-nums">
                    {score} ĐIỂM
                  </span>
                </div>
                <h2 className="text-2xl font-extrabold text-white mb-2">
                  Nhà Thực Nghiệm Quang Học Xuất Sắc!
                </h2>
                <p className="text-xs text-slate-200 leading-relaxed mb-4">
                  Bạn đã làm chủ trọn vẹn các hiện tượng của Bài 15: Thu năng lượng ánh sáng bằng pin quang điện, tạo vùng tối hoàn toàn (Umbra), vùng nửa tối (Penumbra), định luật cosin góc tới và đảo cực điện kế.
                </p>

                <div className="flex flex-wrap items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={handleStartMissionGame}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                  >
                    Chơi lại từ Nhiệm vụ 1
                  </button>
                  <button
                    type="button"
                    onClick={handleStartSandbox}
                    className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-xs font-bold text-slate-950 cursor-pointer"
                  >
                    Khám phá Tự do (Sandbox)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* First-Visit / On-Demand Tutorial Overlay */}
      <TutorialOverlay
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        onQuickStartWithObstacle={(patch) => handleUpdateState(patch)}
      />

      {/* Scientific Source Verification & Automated Test Suite Modal */}
      <ScientificAuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        onApplyScenario={(patch) => handleUpdateState(patch)}
        currentFps={fpsInfo.fps}
        isSoftwareGl={fpsInfo.isSoftwareGl}
      />
    </div>
  );
}
