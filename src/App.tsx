/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import {
  DEFAULT_EXPERIMENT_STATE,
  ExperimentState,
  evaluateExperimentPhysics,
} from './physics/SimulationEngine';
import { LabViewport3D } from './three/LabViewport3D';
import { ControlDock } from './components/ControlDock';
import { ScientificAuditModal } from './components/ScientificAuditModal';
import { TutorialOverlay } from './components/TutorialOverlay';

const TUTORIAL_STORAGE_KEY = 'khtn7_bai15_tutorial_seen_v1';

export default function App() {
  const [state, setState] = useState<ExperimentState>(DEFAULT_EXPERIMENT_STATE);
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(TUTORIAL_STORAGE_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [fpsInfo, setFpsInfo] = useState<{ fps: number | null; isSoftwareGl: boolean }>({
    fps: null,
    isSoftwareGl: false,
  });

  // Tính toán mô hình vật lí độc lập từ trạng thái thí nghiệm
  const physics = useMemo(() => evaluateExperimentPhysics(state), [state]);

  const handleUpdateState = useCallback((patch: Partial<ExperimentState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleCloseTutorial = useCallback(() => {
    setIsTutorialOpen(false);
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, '1');
    } catch {
      // Ignore storage errors in restricted iframes
    }
  }, []);

  const handleReset = useCallback(() => {
    setState((prev) => ({
      ...DEFAULT_EXPERIMENT_STATE,
      qualityMode: prev.qualityMode,
    }));
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

  // Phím tắt tiện lợi trên máy tính (H: ẩn/hiện công cụ, R: đặt lại, ?: mở hướng dẫn)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'h' || e.key === 'H') {
        setIsDockCollapsed((prev) => !prev);
      } else if (e.key === 'r' || e.key === 'R') {
        handleReset();
      } else if (e.key === '?') {
        setIsTutorialOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isTutorialOpen) {
        handleCloseTutorial();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleReset, handleCloseTutorial, isTutorialOpen]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 select-none">
      {/* Top Bar Contract: 3 Zones (Brand Wordmark — 5 Concise Nav Links — 1 Primary Action) */}
      <header className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between gap-4 sm:gap-8 px-3 sm:px-6 py-2.5 bg-slate-950/95 border-b border-slate-800/90 pt-[max(0.625rem,env(safe-area-inset-top))]">
        {/* Zone 1: Brand / Lesson Title */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            handleUpdateState({ cameraPreset: 'overview' });
          }}
          className="text-sm sm:text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          KHTN 7 · Bài 15: Năng lượng ánh sáng
        </a>

        {/* Zone 2: 5 Single-line Navigation Links for Core SGK Experiment Steps & Tutorial */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
          <button
            type="button"
            onClick={() =>
              handleUpdateState({
                ...DEFAULT_EXPERIMENT_STATE,
                lampOn: false,
                qualityMode: state.qualityMode,
              })
            }
            className="hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            01. Chưa bật đèn
          </button>
          <button
            type="button"
            onClick={() =>
              handleUpdateState({
                ...DEFAULT_EXPERIMENT_STATE,
                lampOn: true,
                qualityMode: state.qualityMode,
              })
            }
            className="hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            02. Bật đèn chiếu
          </button>
          <button
            type="button"
            onClick={() =>
              handleUpdateState({
                lampOn: true,
                occluderActive: !state.occluderActive,
                occluderInsertion: 1.0,
              })
            }
            className="hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            03. Vật cản sáng
          </button>
          <button
            type="button"
            onClick={() => setIsAuditModalOpen(true)}
            className="hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            04. Kiểm chứng SGK
          </button>
          <button
            type="button"
            onClick={() => setIsTutorialOpen(true)}
            className="hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            05. Hướng dẫn
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Thu nhỏ</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Toàn màn hình</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Full-Viewport 3D WebGL Scene */}
      <main className="w-full h-full">
        <LabViewport3D
          state={state}
          physics={physics}
          onUpdateState={handleUpdateState}
          onFpsReport={handleFpsReport}
          onOpenTutorial={() => setIsTutorialOpen(true)}
        />
      </main>

      {/* Collapsible Unified Bottom Control Dock */}
      <ControlDock
        state={state}
        physics={physics}
        isCollapsed={isDockCollapsed}
        onToggleCollapse={() => setIsDockCollapsed((prev) => !prev)}
        onUpdateState={handleUpdateState}
        onReset={handleReset}
        onOpenAuditModal={() => setIsAuditModalOpen(true)}
      />

      {/* First-Visit Concise Tutorial Overlay */}
      <TutorialOverlay
        isOpen={isTutorialOpen}
        onClose={handleCloseTutorial}
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
