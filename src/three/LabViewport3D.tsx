import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  CameraPreset,
  ExperimentState,
  GalvanometerNeedleDynamics,
  PhysicsEvaluation,
  SCENE_GEOMETRY,
  clamp,
  computeLampTransform,
  computeOccluderTransform,
  computePVSurfaceBasis,
  intersectRayWithOccluder,
  intersectRayWithPVPanel,
  resolveTableCollision,
  vecAdd,
  vecLen,
  vecScale,
  vecSub,
} from '../physics/SimulationEngine';
import {
  createBeamHitGlowTexture,
  createBrushedSilverTexture,
  createGalvanometerDialTexture,
  createLabBenchTexture,
  createPhotovoltaicCellTexture,
  createRadialContactShadowTexture,
} from './proceduralAssets';
import { ControllableObjectKey, GamePhase } from '../game/missions';
import { gameAudio } from '../audio/gameAudio';

interface LabViewport3DProps {
  state: ExperimentState;
  physics: PhysicsEvaluation;
  onUpdateState: (patch: Partial<ExperimentState>) => void;
  onFpsReport?: (fps: number, isSoftwareGl: boolean) => void;
  onOpenTutorial?: () => void;
  selectedObject?: ControllableObjectKey;
  onSelectObject?: (key: ControllableObjectKey) => void;
  gamePhase?: GamePhase;
  celebrationTrigger?: number;
}

interface ProjectedLabel {
  id: string;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  visible: boolean;
  tone?: 'default' | 'amber' | 'emerald' | 'rose';
  placement?: 'top' | 'left';
  compact?: boolean;
  onClick?: () => void;
}

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3C = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();

/**
 * Tạo hình chữ nhật bo tròn 4 góc phục vụ ExtrudeGeometry có vát cạnh (bevel) mượt
 */
function createRoundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2 - 0.001, height / 2 - 0.001);

  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.absarc(x + width - r, y + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(x + width, y + height - r);
  shape.absarc(x + width - r, y + height - r, r, 0, Math.PI / 2, false);
  shape.lineTo(x + r, y + height);
  shape.absarc(x + r, y + height - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(x, y + r);
  shape.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return shape;
}

/**
 * Tạo khung viền bo tròn có khoét lỗ bo tròn ở giữa (dùng cho viền mặt đồng hồ Điện kế)
 */
function createRoundedFrameShape(
  outerW: number,
  outerH: number,
  outerR: number,
  innerW: number,
  innerH: number,
  innerR: number,
): THREE.Shape {
  const frame = createRoundedRectShape(outerW, outerH, outerR);
  const hole = new THREE.Path();
  const x = -innerW / 2;
  const y = -innerH / 2;
  const r = Math.min(innerR, innerW / 2 - 0.001, innerH / 2 - 0.001);

  hole.moveTo(x + r, y);
  hole.lineTo(x + innerW - r, y);
  hole.absarc(x + innerW - r, y + r, r, -Math.PI / 2, 0, false);
  hole.lineTo(x + innerW, y + innerH - r);
  hole.absarc(x + innerW - r, y + innerH - r, r, 0, Math.PI / 2, false);
  hole.lineTo(x + r, y + innerH);
  hole.absarc(x + r, y + innerH - r, r, Math.PI / 2, Math.PI, false);
  hole.lineTo(x, y + r);
  hole.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);

  frame.holes.push(hole);
  return frame;
}

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  overview: {
    pos: [0.05, 2.38, 3.92],
    target: [-0.05, 0.72, -0.05],
  },
  pv_closeup: {
    pos: [-0.85, 1.35, 1.55],
    target: [-0.35, 0.74, -0.08],
  },
  galvanometer_closeup: {
    pos: [1.48, 1.12, 1.48],
    target: [1.48, 0.68, -0.10],
  },
};

export const LabViewport3D: React.FC<LabViewport3DProps> = ({
  state,
  physics,
  onUpdateState,
  onFpsReport,
  selectedObject = 'lamp',
  onSelectObject,
  gamePhase = 'playing',
  celebrationTrigger = 0,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<ExperimentState>(state);
  const physicsRef = useRef<PhysicsEvaluation>(physics);
  const onUpdateStateRef = useRef(onUpdateState);
  const onFpsReportRef = useRef(onFpsReport);
  const selectedObjectRef = useRef<ControllableObjectKey>(selectedObject);
  const onSelectObjectRef = useRef(onSelectObject);
  const gamePhaseRef = useRef<GamePhase>(gamePhase);
  const celebrationTriggerRef = useRef<number>(celebrationTrigger);

  stateRef.current = state;
  physicsRef.current = physics;
  onUpdateStateRef.current = onUpdateState;
  onFpsReportRef.current = onFpsReport;
  selectedObjectRef.current = selectedObject;
  onSelectObjectRef.current = onSelectObject;
  gamePhaseRef.current = gamePhase;
  celebrationTriggerRef.current = celebrationTrigger;

  const [labels, setLabels] = useState<ProjectedLabel[]>([]);
  const [hoveredInteractive, setHoveredInteractive] = useState<string | null>(null);
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  const activeCameraPresetRef = useRef<CameraPreset>(state.cameraPreset);
  const cameraAnimatingRef = useRef<boolean>(false);

  useEffect(() => {
    if (activeCameraPresetRef.current !== state.cameraPreset) {
      activeCameraPresetRef.current = state.cameraPreset;
      cameraAnimatingRef.current = true;
    }
  }, [state.cameraPreset]);

  useEffect(() => {
    if (gamePhase === 'playing') {
      cameraAnimatingRef.current = true;
    }
  }, [gamePhase]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL detection
    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('Trình duyệt hoặc thiết bị không hỗ trợ khởi tạo ngữ cảnh WebGL.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const getTargetPixelRatio = (qMode: ExperimentState['qualityMode']) => {
      if (isSoftwareGl) return 1;
      const dpr = window.devicePixelRatio || 1;
      if (qMode === 'battery_saver') return 1;
      if (qMode === 'balanced') return Math.min(dpr, 1.5);
      return Math.min(dpr, 2);
    };

    renderer.setPixelRatio(getTargetPixelRatio(stateRef.current.qualityMode));
    renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );
    renderer.shadowMap.enabled = !isSoftwareGl && stateRef.current.qualityMode !== 'battery_saver';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Scene, Fog & Studio Environment
    const scene = new THREE.Scene();
    const bgDarkNight = new THREE.Color(0x030816);
    const bgBrightStudio = new THREE.Color(0x0f172a);
    const sceneFog = new THREE.FogExp2(0x030816, 0.048);
    scene.background = stateRef.current.darkLabVisualMode ? bgDarkNight : bgBrightStudio;
    scene.fog = sceneFog;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = stateRef.current.darkLabVisualMode ? 0.16 : 0.72;
    pmremGenerator.dispose();

    // 3. Camera & OrbitControls
    const camera = new THREE.PerspectiveCamera(
      42,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      50,
    );
    const initialPreset = CAMERA_PRESETS[stateRef.current.cameraPreset];
    camera.position.set(...initialPreset.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...initialPreset.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.6;
    controls.minDistance = 0.75;
    controls.maxDistance = 9.5;
    controls.update();

    const onControlsStart = () => {
      cameraAnimatingRef.current = false;
    };
    controls.addEventListener('start', onControlsStart);

    // 4. Studio Lighting Rig & Night-Blue Dark Lab Spotlight (Hoàn toàn tách biệt khỏi mô hình vật lí)
    // 4a. Ambient Light môi trường tối dịu (giữ chi tiết hình khối thiết bị trong phòng tối)
    const darkAmbientLight = new THREE.AmbientLight(0x1e3a8a, 0.24);
    scene.add(darkAmbientLight);

    // 4b. Hemisphere Light dịu
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x090d16, 0.18);
    hemiLight.position.set(0, 8, 0);
    scene.add(hemiLight);

    // 4c. Đèn Spotlight màu xanh đêm (Night-Blue Spotlight) chiếu bao quát bàn thí nghiệm trong tối
    const nightBlueSpotLight = new THREE.SpotLight(
      0x2563eb,
      3.6,
      16,
      Math.PI * 0.38,
      0.68,
      1.15,
    );
    nightBlueSpotLight.position.set(-0.3, 4.6, 1.8);
    const nightSpotTarget = new THREE.Object3D();
    nightSpotTarget.position.set(-0.2, 0.2, -0.1);
    scene.add(nightSpotTarget);
    nightBlueSpotLight.target = nightSpotTarget;
    scene.add(nightBlueSpotLight);

    // Đèn Spotlight viền xanh lam đêm phụ trợ từ phía sau giúp nổi bật đường viền kim loại & chùm tia vàng cam
    const nightBlueRimSpot = new THREE.SpotLight(
      0x38bdf8,
      2.1,
      14,
      Math.PI * 0.42,
      0.75,
      1.2,
    );
    nightBlueRimSpot.position.set(1.6, 3.8, -2.8);
    const nightRimTarget = new THREE.Object3D();
    nightRimTarget.position.set(-0.4, 0.5, 0.0);
    scene.add(nightRimTarget);
    nightBlueRimSpot.target = nightRimTarget;
    scene.add(nightBlueRimSpot);

    // 4d. Đèn Studio chính (giảm nhẹ cường độ khi ở chế độ phòng tối để nhường tương phản cho đèn thực nghiệm)
    const studioKeyLight = new THREE.DirectionalLight(0xfff7ed, 0.14);
    studioKeyLight.position.set(2.5, 5.8, 3.8);
    studioKeyLight.castShadow = !isSoftwareGl;
    studioKeyLight.shadow.mapSize.width = 1024;
    studioKeyLight.shadow.mapSize.height = 1024;
    studioKeyLight.shadow.camera.near = 0.5;
    studioKeyLight.shadow.camera.far = 15;
    const dShadow = 3.8;
    studioKeyLight.shadow.camera.left = -dShadow;
    studioKeyLight.shadow.camera.right = dShadow;
    studioKeyLight.shadow.camera.top = dShadow;
    studioKeyLight.shadow.camera.bottom = -dShadow;
    studioKeyLight.shadow.bias = -0.0005;
    studioKeyLight.shadow.normalBias = 0.02;
    scene.add(studioKeyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.25);
    rimLight.position.set(-2.5, 3.5, -3.5);
    scene.add(rimLight);

    // 5. Procedural Textures & Materials
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const dialTexture = createGalvanometerDialTexture(maxAniso);
    const pvCellTexture = createPhotovoltaicCellTexture(maxAniso);
    const brushedSilverTexture = createBrushedSilverTexture(maxAniso);
    const benchTexture = createLabBenchTexture(maxAniso);
    const contactShadowTexture = createRadialContactShadowTexture();
    const beamHitGlowTexture = createBeamHitGlowTexture();

    const matBench = new THREE.MeshStandardMaterial({
      map: benchTexture,
      roughness: 0.55,
      metalness: 0.04,
    });
    const matBenchTrim = new THREE.MeshStandardMaterial({
      color: 0x8b5a2b,
      roughness: 0.52,
      metalness: 0.05,
    });
    const matWoodLeg = new THREE.MeshStandardMaterial({
      map: benchTexture,
      color: 0xd6a874,
      roughness: 0.58,
      metalness: 0.04,
    });
    const matCastIron = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.62,
      metalness: 0.48,
    });
    const matBrushedSilver = new THREE.MeshStandardMaterial({
      map: brushedSilverTexture,
      color: 0xf8fafc,
      roughness: 0.24,
      metalness: 0.68,
    });
    const matChrome = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.16,
      metalness: 0.94,
    });
    const matBrushedAluminum = new THREE.MeshStandardMaterial({
      map: brushedSilverTexture,
      color: 0xe2e8f0,
      roughness: 0.28,
      metalness: 0.72,
    });
    const matBrass = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.22,
      metalness: 0.9,
    });
    const matRedPlastic = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.36,
      metalness: 0.08,
    });
    const matBluePlastic = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      roughness: 0.36,
      metalness: 0.08,
    });
    const matDarkHousing = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.46,
      metalness: 0.22,
    });
    const matGalvanoBody = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.34,
      metalness: 0.16,
    });
    const matGlassCover = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.05,
      transparent: true,
      opacity: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      depthWrite: false,
    });
    const matContactShadow = new THREE.MeshBasicMaterial({
      map: contactShadowTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    });

    const addContactShadow = (parent: THREE.Object3D, rx: number, rz: number, yOffset = 0.003) => {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(rx, rz), matContactShadow);
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = yOffset;
      parent.add(plane);
    };

    // Vòng sáng báo hiệu vật thể đang được chọn/kéo trên mặt bàn gỗ
    const dragHighlightRing = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.42, 36),
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    dragHighlightRing.rotation.x = -Math.PI / 2;
    dragHighlightRing.position.y = 0.006;
    dragHighlightRing.visible = false;
    scene.add(dragHighlightRing);

    // Vòng tâm ngắm 3D + Mũi tên Beacon lơ lửng báo hiệu thiết bị đang điều khiển bằng phím WASD / Q-E (Game Reticle)
    const activeSelectionGroup = new THREE.Group();
    scene.add(activeSelectionGroup);

    const activeOuterRing = new THREE.Mesh(
      new THREE.RingGeometry(0.41, 0.46, 40),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    activeOuterRing.rotation.x = -Math.PI / 2;
    activeOuterRing.position.y = 0.007;
    activeSelectionGroup.add(activeOuterRing);

    const activeInnerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.345, 32),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    activeInnerRing.rotation.x = -Math.PI / 2;
    activeInnerRing.position.y = 0.0075;
    activeSelectionGroup.add(activeInnerRing);

    const activeBeaconCone = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.055, 0),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.9,
      }),
    );
    activeBeaconCone.position.y = 1.62;
    activeSelectionGroup.add(activeBeaconCone);

    // Hệ hạt 3D chúc mừng khi hoàn thành mục tiêu Nhiệm vụ (Pooled 3D Celebration Particle Burst)
    const burstCount = 72;
    const burstGeo = new THREE.BufferGeometry();
    const burstPositions = new Float32Array(burstCount * 3);
    const burstColors = new Float32Array(burstCount * 3);
    const burstVelocities: { vx: number; vy: number; vz: number }[] = [];

    for (let i = 0; i < burstCount; i++) {
      burstVelocities.push({ vx: 0, vy: 0, vz: 0 });
      const isGold = i % 2 === 0;
      burstColors[i * 3] = isGold ? 1.0 : 0.2;
      burstColors[i * 3 + 1] = isGold ? 0.84 : 0.95;
      burstColors[i * 3 + 2] = isGold ? 0.25 : 0.62;
    }
    burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPositions, 3));
    burstGeo.setAttribute('color', new THREE.BufferAttribute(burstColors, 3));

    const burstMat = new THREE.PointsMaterial({
      map: beamHitGlowTexture,
      size: 0.11,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const celebrationPoints = new THREE.Points(burstGeo, burstMat);
    celebrationPoints.visible = false;
    celebrationPoints.frustumCulled = false;
    celebrationPoints.renderOrder = 8;
    scene.add(celebrationPoints);

    // =========================================================================
    // A. BÀN GỖ PHÒNG THÍ NGHIỆM CÓ CHÂN BÀN (WOODEN LABORATORY TABLE WITH LEGS)
    // =========================================================================
    const benchGroup = new THREE.Group();

    const benchTop = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.16, 3.8), matBench);
    benchTop.position.set(0, -0.08, 0);
    benchTop.receiveShadow = true;
    benchTop.castShadow = true;
    benchGroup.add(benchTop);

    const benchEdgeFront = new THREE.Mesh(new THREE.BoxGeometry(6.86, 0.17, 0.05), matBenchTrim);
    benchEdgeFront.position.set(0, -0.08, 1.91);
    const benchEdgeBack = new THREE.Mesh(new THREE.BoxGeometry(6.86, 0.17, 0.05), matBenchTrim);
    benchEdgeBack.position.set(0, -0.08, -1.91);
    const benchEdgeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.17, 3.86), matBenchTrim);
    benchEdgeLeft.position.set(-3.41, -0.08, 0);
    const benchEdgeRight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.17, 3.86), matBenchTrim);
    benchEdgeRight.position.set(3.41, -0.08, 0);
    benchGroup.add(benchEdgeFront, benchEdgeBack, benchEdgeLeft, benchEdgeRight);

    const apronFront = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.22, 0.09), matBenchTrim);
    apronFront.position.set(0, -0.27, 1.56);
    const apronBack = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.22, 0.09), matBenchTrim);
    apronBack.position.set(0, -0.27, -1.56);
    const apronLeft = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 3.04), matBenchTrim);
    apronLeft.position.set(-3.05, -0.27, 0);
    const apronRight = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 3.04), matBenchTrim);
    apronRight.position.set(3.05, -0.27, 0);
    benchGroup.add(apronFront, apronBack, apronLeft, apronRight);

    const legHeight = 2.24;
    const legY = -0.16 - legHeight / 2;
    const legPositions: [number, number][] = [
      [-3.05, 1.56],
      [3.05, 1.56],
      [-3.05, -1.56],
      [3.05, -1.56],
    ];

    for (const [lx, lz] of legPositions) {
      const legMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, legHeight, 0.22), matWoodLeg);
      legMesh.position.set(lx, legY, lz);
      legMesh.castShadow = true;
      legMesh.receiveShadow = true;
      benchGroup.add(legMesh);

      const legFoot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.24), matCastIron);
      legFoot.position.set(lx, -2.35, lz);
      benchGroup.add(legFoot);

      const footShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), matContactShadow);
      footShadow.rotation.x = -Math.PI / 2;
      footShadow.position.set(lx, -2.415, lz);
      benchGroup.add(footShadow);
    }

    const stretcherLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 3.04), matBenchTrim);
    stretcherLeft.position.set(-3.05, -1.85, 0);
    const stretcherRight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 3.04), matBenchTrim);
    stretcherRight.position.set(3.05, -1.85, 0);
    const stretcherCenter = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.12, 0.14), matBenchTrim);
    stretcherCenter.position.set(0, -1.85, -1.56);
    benchGroup.add(stretcherLeft, stretcherRight, stretcherCenter);

    // Hộp ổ cắm nguồn điện thí nghiệm đặt nổi trên góc trái phía sau mặt bàn (giúp dây nguồn đèn luôn nằm gọn trên mặt bàn)
    const benchPowerOutletGroup = new THREE.Group();
    benchPowerOutletGroup.position.set(-3.02, 0, -1.48);
    const outletBox = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.18), matDarkHousing);
    outletBox.position.y = 0.04;
    outletBox.castShadow = true;
    const outletPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.012, 0.14),
      matBrushedAluminum,
    );
    outletPlate.position.y = 0.082;
    const outletPlug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.032, 0.05, 16),
      matCastIron,
    );
    outletPlug.position.set(0.04, 0.095, 0.02);
    benchPowerOutletGroup.add(outletBox, outletPlate, outletPlug);
    benchGroup.add(benchPowerOutletGroup);

    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.05,
    });
    const floorPlane = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), floorMat);
    floorPlane.rotation.x = -Math.PI / 2;
    floorPlane.position.y = -2.42;
    floorPlane.receiveShadow = true;
    benchGroup.add(floorPlane);

    scene.add(benchGroup);

    // =========================================================================
    // B. ĐÈN CHIẾU THÍ NGHIỆM & CÔNG TẮC NỔI BẬT DỄ THẤY (LABORATORY LAMP & PROMINENT SWITCH)
    // =========================================================================
    const lampStandGroup = new THREE.Group();
    scene.add(lampStandGroup);

    const lampBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.39, 0.08, 36),
      matBrushedSilver,
    );
    lampBase.position.y = 0.04;
    lampBase.castShadow = true;
    lampBase.receiveShadow = true;
    lampBase.userData = {
      interactiveType: 'object_lamp_base',
      objectKey: 'lamp',
      label: 'Chân đèn chiếu vân bạc (Kéo để di chuyển trên bàn)',
    };
    lampStandGroup.add(lampBase);
    addContactShadow(lampStandGroup, 0.98, 0.98);

    // Cụm Hộp Công Tắc Bật/Tắt Đèn đặt phía trước-trái chân đế (tách rời hoàn toàn khỏi trụ đứng của đèn)
    const switchConsoleGroup = new THREE.Group();
    switchConsoleGroup.position.set(-0.18, 0.068, 0.21);
    switchConsoleGroup.scale.set(0.86, 0.86, 0.86);
    lampStandGroup.add(switchConsoleGroup);

    const switchBoxGeo = new THREE.ExtrudeGeometry(createRoundedRectShape(0.24, 0.20, 0.04), {
      depth: 0.075,
      bevelEnabled: true,
      bevelThickness: 0.014,
      bevelSize: 0.012,
      bevelSegments: 4,
    });
    switchBoxGeo.rotateX(-Math.PI / 2);
    switchBoxGeo.translate(0, -0.035, 0);
    const switchBox = new THREE.Mesh(switchBoxGeo, matDarkHousing);
    switchBox.castShadow = true;
    switchBox.receiveShadow = true;
    switchBox.userData = {
      interactiveType: 'toggle_lamp',
      label: 'Hộp công tắc Bật/Tắt đèn chiếu (Nhấn để BẬT / TẮT đèn)',
    };
    switchConsoleGroup.add(switchBox);

    // Mặt bích kim loại phay xước trên đỉnh hộp công tắc
    const switchFaceplate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.084, 0.092, 0.022, 32),
      matChrome,
    );
    switchFaceplate.position.set(0, 0.056, 0);
    switchFaceplate.userData = {
      interactiveType: 'toggle_lamp',
      label: 'Công tắc Bật/Tắt đèn chiếu (Nhấn để BẬT / TẮT đèn)',
    };
    switchConsoleGroup.add(switchFaceplate);

    // Vòng hào quang LED phát sáng quanh chân nút công tắc (luôn sáng rõ ngay cả trong phòng tối)
    const lampSwitchHaloMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.4,
      roughness: 0.2,
      metalness: 0.1,
    });
    const lampSwitchHaloRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.072, 0.011, 16, 36),
      lampSwitchHaloMat,
    );
    lampSwitchHaloRing.rotation.x = Math.PI / 2;
    lampSwitchHaloRing.position.set(0, 0.068, 0);
    lampSwitchHaloRing.userData = {
      interactiveType: 'toggle_lamp',
      label: 'Công tắc Bật/Tắt đèn chiếu (Nhấn để BẬT / TẮT đèn)',
    };
    switchConsoleGroup.add(lampSwitchHaloRing);

    // Nút nhấn Bật/Tắt đèn kích thước lớn, nhô cao, bo vòm tròn dễ nhìn và dễ bấm
    const lampPowerButtonMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.22,
      metalness: 0.12,
      emissive: 0xdc2626,
      emissiveIntensity: 0.75,
    });
    const lampPowerButton = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.062, 0.068, 32),
      lampPowerButtonMat,
    );
    lampPowerButton.position.set(0, 0.098, 0);
    lampPowerButton.castShadow = true;
    lampPowerButton.userData = {
      interactiveType: 'toggle_lamp',
      label: 'NÚT BẬT/TẮT ĐÈN CHIẾU (Nhấn trực tiếp để Bật hoặc Tắt đèn)',
    };
    switchConsoleGroup.add(lampPowerButton);

    // Chỏm bo tròn trên đỉnh nút bấm + vòng biểu tượng nguồn (Power Icon Ring)
    const lampButtonDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.058, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.42),
      lampPowerButtonMat,
    );
    lampButtonDome.position.y = 0.032;
    lampButtonDome.userData = {
      interactiveType: 'toggle_lamp',
      label: 'NÚT BẬT/TẮT ĐÈN CHIẾU (Nhấn trực tiếp để Bật hoặc Tắt đèn)',
    };
    lampPowerButton.add(lampButtonDome);

    const powerSymbolRing = new THREE.Mesh(
      new THREE.RingGeometry(0.022, 0.031, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    );
    powerSymbolRing.rotation.x = -Math.PI / 2;
    powerSymbolRing.position.y = 0.051;
    lampPowerButton.add(powerSymbolRing);

    const lampColumnMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.036, 1.0, 24),
      matChrome,
    );
    lampColumnMesh.castShadow = true;
    lampColumnMesh.userData = {
      interactiveType: 'object_lamp_base',
      objectKey: 'lamp',
      label: 'Trụ đèn chiếu (Kéo để di chuyển đèn trên bàn)',
    };
    lampStandGroup.add(lampColumnMesh);

    const lampCollarMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.058, 0.08, 24),
      matBrass,
    );
    lampStandGroup.add(lampCollarMesh);

    // Khớp nối chữ U (Yoke Bracket) nối liền đỉnh trụ đèn với bầu đầu đèn (không còn khoảng hở)
    const lampYokeGroup = new THREE.Group();
    lampStandGroup.add(lampYokeGroup);

    const yokeBaseBlock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.044, 0.06, 24),
      matBrass,
    );
    yokeBaseBlock.position.y = -0.18;
    lampYokeGroup.add(yokeBaseBlock);

    const yokeCrossBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.036, 0.39),
      matBrushedSilver,
    );
    yokeCrossBar.position.y = -0.145;
    lampYokeGroup.add(yokeCrossBar);

    for (const sideZ of [-0.175, 0.175]) {
      const yokeArm = new THREE.Mesh(
        new THREE.BoxGeometry(0.048, 0.165, 0.032),
        matBrushedSilver,
      );
      yokeArm.position.set(0, -0.068, sideZ);
      lampYokeGroup.add(yokeArm);

      const pivotBoss = new THREE.Mesh(
        new THREE.CylinderGeometry(0.036, 0.036, 0.045, 20),
        matBrass,
      );
      pivotBoss.rotation.x = Math.PI / 2;
      pivotBoss.position.set(0, 0, sideZ > 0 ? sideZ + 0.012 : sideZ - 0.012);
      lampYokeGroup.add(pivotBoss);
    }

    const lampHeadGroup = new THREE.Group();
    scene.add(lampHeadGroup);

    const housingBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.15, 0.44, 32),
      matBrushedSilver,
    );
    housingBody.rotation.x = Math.PI / 2;
    housingBody.position.z = -0.22;
    housingBody.castShadow = true;
    housingBody.userData = {
      interactiveType: 'object_lamp_head',
      objectKey: 'lamp',
      label: 'Đầu đèn chiếu (Kéo để di chuyển hoặc xoay hướng chiếu)',
    };
    lampHeadGroup.add(housingBody);

    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.184, 0.184, 0.02, 32), matChrome);
      fin.rotation.x = Math.PI / 2;
      fin.position.z = -0.14 - i * 0.07;
      lampHeadGroup.add(fin);
    }

    const rearCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2),
      matBrushedAluminum,
    );
    rearCap.rotation.x = -Math.PI / 2;
    rearCap.position.z = -0.44;
    lampHeadGroup.add(rearCap);

    const frontShroud = new THREE.Mesh(
      new THREE.CylinderGeometry(0.148, 0.17, 0.09, 32, 1, true),
      matBrushedSilver,
    );
    frontShroud.rotation.x = Math.PI / 2;
    frontShroud.position.z = 0.02;
    lampHeadGroup.add(frontShroud);

    // Chóa phản xạ phát sáng dịu bên trong họng đèn giúp chùm sáng nối liền mạch nhưng không làm lóa đèn
    const nozzleReflectorMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 0,
      roughness: 0.22,
      metalness: 0.35,
      side: THREE.BackSide,
    });
    const nozzleReflectorMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.144, 0.115, 0.064, 32, 1, true),
      nozzleReflectorMat,
    );
    nozzleReflectorMesh.rotation.x = Math.PI / 2;
    nozzleReflectorMesh.position.z = 0.032;
    lampHeadGroup.add(nozzleReflectorMesh);

    const bulbLensMat = new THREE.MeshStandardMaterial({
      color: 0xfffbeb,
      emissive: 0xfbbf24,
      emissiveIntensity: 0,
      roughness: 0.15,
      metalness: 0.04,
    });
    const bulbLens = new THREE.Mesh(new THREE.CircleGeometry(0.138, 32), bulbLensMat);
    bulbLens.position.z = 0.008;
    bulbLens.userData = {
      interactiveType: 'toggle_lamp',
      label: 'Cửa phát sáng đèn chiếu (Nhấn để bật/tắt)',
    };
    lampHeadGroup.add(bulbLens);

    // Vòm thấu kính lồi phát sáng dịu ở miệng đèn (nối liền với gốc chùm sáng 3D)
    const bulbDomeMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const bulbDomeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.136, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42),
      bulbDomeMat,
    );
    bulbDomeMesh.rotation.x = Math.PI / 2;
    bulbDomeMesh.position.z = 0.008;
    bulbDomeMesh.userData = {
      interactiveType: 'toggle_lamp',
      label: 'Cửa phát sáng đèn chiếu (Nhấn để bật/tắt)',
    };
    lampHeadGroup.add(bulbDomeMesh);

    // Đĩa quầng sáng vừa khít miệng chóa đèn (0.24x0.24) với độ sáng dịu để không che khuất thân đèn
    const nozzleMouthGlowMat = new THREE.MeshBasicMaterial({
      map: beamHitGlowTexture,
      color: 0xfffbeb,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const nozzleMouthGlowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.24),
      nozzleMouthGlowMat,
    );
    nozzleMouthGlowMesh.position.z = 0.048;
    nozzleMouthGlowMesh.renderOrder = 5;
    lampHeadGroup.add(nozzleMouthGlowMesh);

    // Nguồn SpotLight thực tế tạo vùng sáng trên mặt bàn gỗ và đổ bóng thật sau vật cản sáng
    const experimentSpotLight = new THREE.SpotLight(
      0xffe49e,
      0,
      12.5,
      THREE.MathUtils.degToRad(SCENE_GEOMETRY.beamOuterHalfAngleDeg * 1.08),
      0.42,
      1.0,
    );
    experimentSpotLight.position.set(0, 0, 0.02);
    experimentSpotLight.castShadow = !isSoftwareGl;
    experimentSpotLight.shadow.mapSize.width = isSoftwareGl ? 512 : 2048;
    experimentSpotLight.shadow.mapSize.height = isSoftwareGl ? 512 : 2048;
    experimentSpotLight.shadow.camera.near = 0.18;
    experimentSpotLight.shadow.camera.far = 8.5;
    experimentSpotLight.shadow.bias = -0.00025;
    experimentSpotLight.shadow.normalBias = 0.008;
    experimentSpotLight.shadow.radius = 2.6;
    lampHeadGroup.add(experimentSpotLight);

    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0, 2.0);
    lampHeadGroup.add(spotTarget);
    experimentSpotLight.target = spotTarget;

    // =========================================================================
    // C. CHÙM SÁNG ĐỀU NỐI LIỀN HỌNG ĐÈN & KHỐI BÓNG TỐI PHÍA SAU VẬT CẢN
    // =========================================================================
    const radialSegments = 96;

    const createRayClippedConeGeometry = (topColorHex: number, botColorHex: number) => {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array((radialSegments + 1) * 2 * 3);
      const colors = new Float32Array((radialSegments + 1) * 2 * 3);
      const cTop = new THREE.Color(topColorHex);
      const cBot = new THREE.Color(botColorHex);

      for (let i = 0; i <= radialSegments; i++) {
        colors[i * 3] = cTop.r;
        colors[i * 3 + 1] = cTop.g;
        colors[i * 3 + 2] = cTop.b;

        const bIdx = (radialSegments + 1 + i) * 3;
        colors[bIdx] = cBot.r;
        colors[bIdx + 1] = cBot.g;
        colors[bIdx + 2] = cBot.b;
      }

      const indices: number[] = [];
      for (let i = 0; i < radialSegments; i++) {
        const topA = i;
        const topB = i + 1;
        const botA = radialSegments + 1 + i;
        const botB = radialSegments + 1 + i + 1;
        indices.push(topA, botA, topB);
        indices.push(topB, botA, botB);
      }

      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setIndex(indices);
      return geo;
    };

    // 1. Lớp nón sáng ngoài (Outer Beam Shell)
    const dynamicConeGeo = createRayClippedConeGeometry(0xfffbeb, 0xfbbf24);
    const coneMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const explanatoryConeMesh = new THREE.Mesh(dynamicConeGeo, coneMat);
    explanatoryConeMesh.frustumCulled = false;
    explanatoryConeMesh.renderOrder = 4;
    scene.add(explanatoryConeMesh);

    // 2. Lớp nón sáng trung gian (Mid Volumetric Shell) giúp lấp đầy thể tích chùm sáng đều đặn
    const midConeGeo = createRayClippedConeGeometry(0xfffef0, 0xfde047);
    const midConeMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const midConeMesh = new THREE.Mesh(midConeGeo, midConeMat);
    midConeMesh.frustumCulled = false;
    midConeMesh.renderOrder = 4;
    scene.add(midConeMesh);

    // 3. Lớp lõi chùm sáng trung tâm (Core Beam Shell)
    const coreConeGeo = createRayClippedConeGeometry(0xffffff, 0xfef08a);
    const coreConeMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const coreConeMesh = new THREE.Mesh(coreConeGeo, coreConeMat);
    coreConeMesh.frustumCulled = false;
    coreConeMesh.renderOrder = 4;
    scene.add(coreConeMesh);

    // 4. Khối vùng tối 3D (3D Umbra Shadow Volume) phía sau Vật cản sáng khi chắn chùm tia
    const shadowVolumeSegs = 64;
    const createShadowVolumeGeometry = () => {
      const geo = new THREE.BufferGeometry();
      // 0..shadowVolumeSegs: vành mặt sau tấm chắn sáng; shadowVolumeSegs+1..2*shadowVolumeSegs+1: vành điểm chạm trên tấm pin / mặt bàn;
      // + 2 tâm nắp trước/sau để tạo khối vùng tối đặc kín 3D
      const vertCount = (shadowVolumeSegs + 1) * 2 + 2;
      const positions = new Float32Array(vertCount * 3);
      const indices: number[] = [];
      const frontCenterIdx = (shadowVolumeSegs + 1) * 2;
      const backCenterIdx = frontCenterIdx + 1;

      for (let i = 0; i < shadowVolumeSegs; i++) {
        const fA = i;
        const fB = i + 1;
        const bA = shadowVolumeSegs + 1 + i;
        const bB = shadowVolumeSegs + 1 + i + 1;
        // Mặt bên của khối bóng tối
        indices.push(fA, bA, fB);
        indices.push(fB, bA, bB);
        // Nắp sát lưng tấm chắn
        indices.push(frontCenterIdx, fB, fA);
        // Nắp đáy vùng tối (trên mặt bàn / tấm pin)
        indices.push(backCenterIdx, bA, bB);
      }

      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setIndex(indices);
      return geo;
    };

    const umbraVolumeGeo = createShadowVolumeGeometry();
    const umbraVolumeMat = new THREE.MeshBasicMaterial({
      color: 0x020617,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const umbraVolumeMesh = new THREE.Mesh(umbraVolumeGeo, umbraVolumeMat);
    umbraVolumeMesh.frustumCulled = false;
    umbraVolumeMesh.renderOrder = 3;
    scene.add(umbraVolumeMesh);

    // 5. Lưới Chiếu Sáng & Bóng Đổ Thực Tế Trên Mặt Bàn Gỗ (Ray-Clipped Tabletop Light & Cast Shadow Grids)
    // Khi không bị che: mặt bàn sáng vàng đều; Khi bị vật cản hoặc tấm pin che: phía sau có bóng tối (Umbra + Penumbra) rõ nét!
    const tableGridCols = 48;
    const tableGridRows = 32;
    const tableGridMinX = -2.75;
    const tableGridMaxX = 2.45;
    const tableGridMinZ = -1.42;
    const tableGridMaxZ = 1.42;

    const createTabletopGridGeometry = (yHeight: number) => {
      const geo = new THREE.BufferGeometry();
      const numVerts = (tableGridCols + 1) * (tableGridRows + 1);
      const positions = new Float32Array(numVerts * 3);
      const colors = new Float32Array(numVerts * 3);

      let ptr = 0;
      for (let r = 0; r <= tableGridRows; r++) {
        const vz = tableGridMinZ + (r / tableGridRows) * (tableGridMaxZ - tableGridMinZ);
        for (let c = 0; c <= tableGridCols; c++) {
          const vx = tableGridMinX + (c / tableGridCols) * (tableGridMaxX - tableGridMinX);
          positions[ptr] = vx;
          positions[ptr + 1] = yHeight;
          positions[ptr + 2] = vz;
          ptr += 3;
        }
      }

      const indices: number[] = [];
      for (let r = 0; r < tableGridRows; r++) {
        for (let c = 0; c < tableGridCols; c++) {
          const i00 = r * (tableGridCols + 1) + c;
          const i10 = i00 + 1;
          const i01 = (r + 1) * (tableGridCols + 1) + c;
          const i11 = i01 + 1;
          indices.push(i00, i01, i10);
          indices.push(i10, i01, i11);
        }
      }

      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setIndex(indices);
      return geo;
    };

    // Lưới ánh sáng vàng ấm trên mặt bàn (chỉ sáng ở vùng tia sáng không bị chặn)
    const tableLightGridGeo = createTabletopGridGeometry(0.0032);
    const tableLightGridMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const tableLightPoolMesh = new THREE.Mesh(tableLightGridGeo, tableLightGridMat);
    tableLightPoolMesh.frustumCulled = false;
    tableLightPoolMesh.renderOrder = 2;
    scene.add(tableLightPoolMesh);

    // Lưới bóng tối (Umbra & Penumbra) đổ dài trên mặt bàn phía sau Vật cản sáng và Tấm pin
    // Dùng Subtractive/Multiply-like darkening thông qua vertex-colored shadow plane
    const tableShadowGridGeo = createTabletopGridGeometry(0.0042);
    // Thêm thuộc tính alpha cho từng đỉnh của lưới bóng tối để vùng không có bóng hoàn toàn trong suốt
    const shadowVertCount = (tableGridCols + 1) * (tableGridRows + 1);
    const shadowColorAlpha = new Float32Array(shadowVertCount * 4);
    tableShadowGridGeo.setAttribute('color', new THREE.BufferAttribute(shadowColorAlpha, 4));

    const tableShadowGridMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
    });
    const tableShadowGridMesh = new THREE.Mesh(tableShadowGridGeo, tableShadowGridMat);
    tableShadowGridMesh.frustumCulled = false;
    tableShadowGridMesh.renderOrder = 3;
    scene.add(tableShadowGridMesh);

    // Nhóm các tia sáng rời rạc + Đốm sáng tiếp xúc nơi từng tia chạm mặt bàn gỗ / tấm pin / vật cản
    const raysGroup = new THREE.Group();
    scene.add(raysGroup);

    const rayMatFree = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const rayMatBlocked = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const rayHitSpotMat = new THREE.MeshBasicMaterial({
      map: beamHitGlowTexture,
      color: 0xfef08a,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    // 15 tia phân bố trong chùm sáng (gồm cả các tia chiếu xuống mặt bàn gỗ quanh chân pin)
    const rayPolarSpecs: [number, number][] = [
      [0, 0],
      [7, 0],
      [7, 60],
      [7, 120],
      [7, 180],
      [7, 240],
      [7, 300],
      [14, 0],
      [14, 45],
      [14, 90],
      [14, 135],
      [14, 180],
      [14, 225],
      [14, 270],
      [14, 315],
    ];
    const shaftGeo = new THREE.CylinderGeometry(0.0055, 0.0075, 1.0, 10);
    shaftGeo.translate(0, 0.5, 0);
    shaftGeo.rotateX(Math.PI / 2);
    const tipGeo = new THREE.ConeGeometry(0.018, 0.056, 12);
    tipGeo.rotateX(Math.PI / 2);
    const hitSpotGeo = new THREE.PlaneGeometry(0.16, 0.16);

    const rayMeshes: {
      shaft: THREE.Mesh;
      tip: THREE.Mesh;
      hitSpot: THREE.Mesh;
      polarDeg: number;
      azimuthDeg: number;
    }[] = [];

    for (const [polarDeg, azimuthDeg] of rayPolarSpecs) {
      const shaft = new THREE.Mesh(shaftGeo, rayMatFree);
      const tip = new THREE.Mesh(tipGeo, rayMatFree);
      const hitSpot = new THREE.Mesh(hitSpotGeo, rayHitSpotMat);
      shaft.frustumCulled = false;
      tip.frustumCulled = false;
      hitSpot.frustumCulled = false;
      hitSpot.renderOrder = 3;
      raysGroup.add(shaft, tip, hitSpot);
      rayMeshes.push({ shaft, tip, hitSpot, polarDeg, azimuthDeg });
    }

    // 6. Hạt bụi lơ lửng trong không khí dọc theo luồng sáng (Tyndall Effect Dust Particles khi ở chế độ Phòng tối)
    interface BeamDustSeed {
      uAxial: number;
      rNorm: number;
      theta: number;
      axialDriftSpeed: number;
      swirlSpeed: number;
      phaseX: number;
      phaseY: number;
      phaseZ: number;
      twinklePhase: number;
      twinkleFreq: number;
      warmth: number;
    }

    const createBeamDustLayer = (count: number, pointSize: number, baseOpacity: number) => {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const seeds: BeamDustSeed[] = [];

      const pseudoRand = (seed: number) => {
        const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
        return x - Math.floor(x);
      };

      for (let i = 0; i < count; i++) {
        const s = i * 17.31 + pointSize * 1000;
        seeds.push({
          uAxial: 0.02 + pseudoRand(s + 1) * 0.96,
          rNorm: Math.pow(pseudoRand(s + 2), 0.58) * 0.95,
          theta: pseudoRand(s + 3) * Math.PI * 2,
          axialDriftSpeed: (pseudoRand(s + 4) - 0.42) * 0.038,
          swirlSpeed: 0.55 + pseudoRand(s + 5) * 0.95,
          phaseX: pseudoRand(s + 6) * Math.PI * 2,
          phaseY: pseudoRand(s + 7) * Math.PI * 2,
          phaseZ: pseudoRand(s + 8) * Math.PI * 2,
          twinklePhase: pseudoRand(s + 9) * Math.PI * 2,
          twinkleFreq: 1.4 + pseudoRand(s + 10) * 2.6,
          warmth: pseudoRand(s + 11),
        });
      }

      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const mat = new THREE.PointsMaterial({
        map: beamHitGlowTexture,
        size: pointSize,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: baseOpacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      points.renderOrder = 5;
      return { points, geo, mat, seeds, count };
    };

    const beamDustGroup = new THREE.Group();
    scene.add(beamDustGroup);
    // Lớp 1: Hạt bụi mịn lấp lánh rõ nét trong luồng sáng (150 hạt)
    const dustFineLayer = createBeamDustLayer(150, 0.042, 0.88);
    // Lớp 2: Hạt bụi tán xạ mờ (bokeh motes) tạo chiều sâu không khí (55 hạt)
    const dustBokehLayer = createBeamDustLayer(55, 0.076, 0.52);
    beamDustGroup.add(dustFineLayer.points, dustBokehLayer.points);

    // =========================================================================
    // D. PIN QUANG ĐIỆN (PHOTOVOLTAIC MODULE — Kéo di chuyển & xoay mặt pin)
    // =========================================================================
    const pvStandGroup = new THREE.Group();
    scene.add(pvStandGroup);

    // Đế Pin quang điện & Khung vỏ đổi sang kim loại Vân Bạc Xước (matBrushedSilver) sáng rõ, dễ nhìn
    const pvBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 0.068, 32),
      matBrushedSilver,
    );
    pvBase.position.y = 0.034;
    pvBase.castShadow = true;
    pvBase.receiveShadow = true;
    pvBase.userData = {
      interactiveType: 'object_pv_base',
      objectKey: 'pv',
      label: 'Chân đế Pin quang điện vân bạc (Kéo để di chuyển trên bàn)',
    };
    pvStandGroup.add(pvBase);

    const pvBaseRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.295, 0.012, 14, 32),
      matChrome,
    );
    pvBaseRim.rotation.x = Math.PI / 2;
    pvBaseRim.position.y = 0.064;
    pvStandGroup.add(pvBaseRim);
    addContactShadow(pvStandGroup, 0.8, 0.8);

    const pvStemHeight = SCENE_GEOMETRY.pvCenterY - 0.04;
    const pvStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.034, 0.034, pvStemHeight, 20),
      matChrome,
    );
    pvStem.position.y = 0.04 + pvStemHeight / 2;
    pvStem.castShadow = true;
    pvStem.userData = {
      interactiveType: 'object_pv_base',
      objectKey: 'pv',
      label: 'Giá đỡ Pin quang điện vân bạc (Kéo để di chuyển trên bàn)',
    };
    pvStandGroup.add(pvStem);

    const pvJoint = new THREE.Mesh(new THREE.SphereGeometry(0.055, 18, 18), matBrass);
    pvJoint.position.y = SCENE_GEOMETRY.pvCenterY;
    pvStandGroup.add(pvJoint);

    const pvPanelGroup = new THREE.Group();
    scene.add(pvPanelGroup);

    const frameW = SCENE_GEOMETRY.pvActiveWidth + 0.12;
    const frameH = SCENE_GEOMETRY.pvActiveHeight + 0.12;
    const frameDepth = 0.048;

    const pvBackplate = new THREE.Mesh(
      new THREE.BoxGeometry(frameW, frameH, frameDepth),
      matBrushedSilver,
    );
    pvBackplate.position.z = -frameDepth / 2 - 0.002;
    pvBackplate.castShadow = true;
    pvBackplate.receiveShadow = true;
    pvBackplate.userData = {
      interactiveType: 'object_pv_panel',
      objectKey: 'pv',
      label: 'Tấm Pin quang điện khung vân bạc (Kéo để di chuyển hoặc xoay mặt nhận sáng)',
    };
    pvPanelGroup.add(pvBackplate);

    const pvCellMat = new THREE.MeshStandardMaterial({
      map: pvCellTexture,
      roughness: 0.24,
      metalness: 0.35,
      emissive: 0x0284c7,
      emissiveIntensity: 0,
    });
    const pvCellMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(SCENE_GEOMETRY.pvActiveWidth, SCENE_GEOMETRY.pvActiveHeight),
      pvCellMat,
    );
    pvCellMesh.position.z = 0.001;
    pvCellMesh.receiveShadow = true;
    pvCellMesh.userData = {
      interactiveType: 'object_pv_panel',
      objectKey: 'pv',
      label: 'Mặt nhận sáng Pin quang điện (Kéo để di chuyển hoặc xoay)',
    };
    pvPanelGroup.add(pvCellMesh);

    const pvGlassMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(SCENE_GEOMETRY.pvActiveWidth, SCENE_GEOMETRY.pvActiveHeight),
      matGlassCover,
    );
    pvGlassMesh.position.z = 0.008;
    pvGlassMesh.renderOrder = 2;
    pvPanelGroup.add(pvGlassMesh);

    // Lưới 6x6 ô (36 điểm lấy mẫu) hiển thị trực tiếp Vùng sáng, Vùng nửa tối (Penumbra) và Vùng tối (Umbra) trên mặt pin!
    const gridN = 6;
    const patchW = (SCENE_GEOMETRY.pvActiveWidth * 0.94) / gridN;
    const patchH = (SCENE_GEOMETRY.pvActiveHeight * 0.94) / gridN;
    const pvSamplePatches: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
    const patchGeo = new THREE.PlaneGeometry(patchW * 0.95, patchH * 0.95);

    for (let i = 0; i < gridN * gridN; i++) {
      const pMat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const pMesh = new THREE.Mesh(patchGeo, pMat);
      pMesh.position.z = 0.004;
      pMesh.renderOrder = 1;
      pvPanelGroup.add(pMesh);
      pvSamplePatches.push({ mesh: pMesh, mat: pMat });
    }

    // Chỉ báo vector pháp tuyến mặt nhận sáng (n⃗) theo Mục 4.2 Spec V2
    const pvNormalGuideGroup = new THREE.Group();
    const normalShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.22, 10),
      new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.85 }),
    );
    normalShaft.rotation.x = Math.PI / 2;
    normalShaft.position.z = 0.11;
    const normalTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.016, 0.045, 12),
      new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.9 }),
    );
    normalTip.rotation.x = Math.PI / 2;
    normalTip.position.z = 0.23;
    pvNormalGuideGroup.add(normalShaft, normalTip);
    pvPanelGroup.add(pvNormalGuideGroup);

    const pvTerminalNeg = new THREE.Group();
    pvTerminalNeg.position.set(-0.22, -frameH / 2 - 0.025, -0.025);
    const postBrassNeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.06, 14),
      matBrass,
    );
    const nutBlue = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.035, 16),
      matBluePlastic,
    );
    nutBlue.position.y = -0.015;
    pvTerminalNeg.add(postBrassNeg, nutBlue);
    pvPanelGroup.add(pvTerminalNeg);

    const pvTerminalPos = new THREE.Group();
    pvTerminalPos.position.set(0.22, -frameH / 2 - 0.025, -0.025);
    const postBrassPos = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.06, 14),
      matBrass,
    );
    const nutRed = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.035, 16),
      matRedPlastic,
    );
    nutRed.position.y = -0.015;
    pvTerminalPos.add(postBrassPos, nutRed);
    pvPanelGroup.add(pvTerminalPos);

    // =========================================================================
    // E. VẬT CẢN SÁNG ĐỤC CÓ CHÂN ĐẾ TRÊN BÀN (MOVABLE OPAQUE OCCLUDER WITH STAND)
    // =========================================================================
    const occluderStandGroup = new THREE.Group();
    scene.add(occluderStandGroup);

    // Chân đế gang của vật cản sáng đặt trên mặt bàn gỗ
    const occBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.28, 0.055, 28),
      matCastIron,
    );
    occBase.position.y = 0.0275;
    occBase.castShadow = true;
    occBase.receiveShadow = true;
    occBase.userData = {
      interactiveType: 'object_occluder',
      objectKey: 'occluder',
      label: 'Chân Vật cản sáng (Kéo để di chuyển vào/ra chùm sáng)',
    };
    occluderStandGroup.add(occBase);
    addContactShadow(occluderStandGroup, 0.72, 0.72);

    // Trụ đỡ tấm chắn sáng
    const occStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.52, 16),
      matChrome,
    );
    occStem.position.y = 0.28;
    occStem.castShadow = true;
    occStem.userData = {
      interactiveType: 'object_occluder',
      objectKey: 'occluder',
      label: 'Giá đỡ Vật cản sáng (Kéo để di chuyển trên mặt bàn)',
    };
    occluderStandGroup.add(occStem);

    // Tấm chắn sáng đục (tâm ở y = 0.90)
    const occluderScreenGroup = new THREE.Group();
    occluderScreenGroup.position.y = 0.90;
    occluderStandGroup.add(occluderScreenGroup);

    const occScreenMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.72,
      metalness: 0.22,
    });
    const occScreenMesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        SCENE_GEOMETRY.occluderWidth,
        SCENE_GEOMETRY.occluderHeight,
        0.028,
      ),
      occScreenMat,
    );
    occScreenMesh.castShadow = true;
    occScreenMesh.receiveShadow = true;
    occScreenMesh.userData = {
      interactiveType: 'object_occluder',
      objectKey: 'occluder',
      label: 'Vật cản sáng đục (Kéo qua lại để chắn tia sáng & tạo vùng tối)',
    };
    occluderScreenGroup.add(occScreenMesh);

    const occFrameRim = new THREE.Mesh(
      new THREE.BoxGeometry(
        SCENE_GEOMETRY.occluderWidth + 0.03,
        SCENE_GEOMETRY.occluderHeight + 0.03,
        0.018,
      ),
      matBrushedAluminum,
    );
    occScreenMesh.add(occFrameRim);

    const occHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.16, 16),
      matRedPlastic,
    );
    occHandle.position.set(0, SCENE_GEOMETRY.occluderHeight * 0.5 + 0.08, 0);
    occHandle.userData = {
      interactiveType: 'object_occluder',
      objectKey: 'occluder',
      label: 'Tay cầm Vật cản sáng (Kéo để di chuyển vật cản)',
    };
    occScreenMesh.add(occHandle);

    // =========================================================================
    // F. KHÓA MẠCH ĐIỆN NGOÀI (KNIFE SWITCH ON BENCH — Có thể kéo vị trí + nhấn đóng/mở)
    // =========================================================================
    const switchGroup = new THREE.Group();
    scene.add(switchGroup);

    const switchBase = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.24), matDarkHousing);
    switchBase.position.y = 0.025;
    switchBase.castShadow = true;
    switchBase.receiveShadow = true;
    switchBase.userData = {
      interactiveType: 'object_switch',
      objectKey: 'switch',
      label: 'Khóa mạch điện (Nhấn để Đóng/Mở mạch hoặc kéo để di chuyển)',
    };
    switchGroup.add(switchBase);
    addContactShadow(switchGroup, 0.56, 0.36);

    const switchJawLeft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.05), matBrass);
    switchJawLeft.position.set(-0.12, 0.07, 0);
    switchGroup.add(switchJawLeft);

    const switchJawRight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.05), matBrass);
    switchJawRight.position.set(0.12, 0.07, 0);
    switchGroup.add(switchJawRight);

    const knifeBladePivot = new THREE.Group();
    knifeBladePivot.position.set(-0.12, 0.085, 0);
    switchGroup.add(knifeBladePivot);

    const knifeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.018, 0.028), matBrass);
    knifeBlade.position.set(0.14, 0, 0);
    knifeBlade.userData = {
      interactiveType: 'object_switch',
      objectKey: 'switch',
      label: 'Lưỡi dao Khóa mạch (Nhấn để Đóng/Mở mạch điện)',
    };
    knifeBladePivot.add(knifeBlade);

    const knifeHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.02, 0.09, 16),
      matRedPlastic,
    );
    knifeHandle.rotation.z = -Math.PI / 2;
    knifeHandle.position.set(0.31, 0.01, 0);
    knifeHandle.userData = {
      interactiveType: 'object_switch',
      objectKey: 'switch',
      label: 'Tay gạt Khóa mạch (Nhấn để Đóng/Mở mạch điện)',
    };
    knifeBladePivot.add(knifeHandle);

    // =========================================================================
    // G. ĐIỆN KẾ KIM BO TRÒN CẠNH, NÉT ĐẸP HƠN (ROUNDED-BEVEL ZERO-CENTER GALVANOMETER)
    // =========================================================================
    const galvanoGroup = new THREE.Group();
    galvanoGroup.rotation.y = -0.18;
    scene.add(galvanoGroup);

    // 1. Đế Điện kế gang đúc bo tròn 4 góc + vát cạnh (bevel) mượt
    const galvanoBaseShape = createRoundedRectShape(1.12, 0.72, 0.11);
    const galvanoBaseGeo = new THREE.ExtrudeGeometry(galvanoBaseShape, {
      depth: 0.10,
      bevelEnabled: true,
      bevelThickness: 0.022,
      bevelSize: 0.022,
      bevelSegments: 6,
      curveSegments: 20,
    });
    galvanoBaseGeo.rotateX(-Math.PI / 2);
    galvanoBaseGeo.translate(0, 0.024, 0);
    const galvanoBase = new THREE.Mesh(galvanoBaseGeo, matCastIron);
    galvanoBase.castShadow = true;
    galvanoBase.receiveShadow = true;
    galvanoBase.userData = {
      interactiveType: 'object_galvano',
      objectKey: 'galvano',
      label: 'Đế Điện kế (Kéo để di chuyển vị trí trên bàn)',
    };
    galvanoGroup.add(galvanoBase);
    addContactShadow(galvanoGroup, 1.44, 1.02);

    // 4 chân đệm đồng thau tiện tròn ở 4 góc đế Điện kế
    const footOffsets: [number, number][] = [
      [-0.46, -0.26],
      [0.46, -0.26],
      [-0.46, 0.26],
      [0.46, 0.26],
    ];
    for (const [fx, fz] of footOffsets) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.028, 20), matBrass);
      foot.position.set(fx, 0.014, fz);
      galvanoGroup.add(foot);
    }

    // 2. Thân vỏ chính Điện kế bo tròn cạnh mượt mà (Beveled Rounded Instrument Housing)
    const galvanoBodyShape = createRoundedRectShape(1.02, 0.92, 0.105);
    const galvanoBodyGeo = new THREE.ExtrudeGeometry(galvanoBodyShape, {
      depth: 0.48,
      bevelEnabled: true,
      bevelThickness: 0.034,
      bevelSize: 0.03,
      bevelSegments: 8,
      curveSegments: 24,
    });
    galvanoBodyGeo.translate(0, 0.62, -0.28);
    const galvanoBody = new THREE.Mesh(galvanoBodyGeo, matGalvanoBody);
    galvanoBody.castShadow = true;
    galvanoBody.receiveShadow = true;
    galvanoBody.userData = {
      interactiveType: 'object_galvano',
      objectKey: 'galvano',
      label: 'Điện kế (Kéo để di chuyển vị trí trên bàn)',
    };
    galvanoGroup.add(galvanoBody);

    // 3. Khung viền mặt đồng hồ (Bezel) bo tròn lồng khung vát cạnh tinh xảo
    const galvanoBezelShape = createRoundedFrameShape(0.98, 0.82, 0.088, 0.84, 0.68, 0.048);
    const galvanoBezelGeo = new THREE.ExtrudeGeometry(galvanoBezelShape, {
      depth: 0.036,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.014,
      bevelSegments: 6,
      curveSegments: 24,
    });
    galvanoBezelGeo.translate(0, 0.66, 0.228);
    const galvanoBezel = new THREE.Mesh(galvanoBezelGeo, matDarkHousing);
    galvanoBezel.castShadow = true;
    galvanoBezel.receiveShadow = true;
    galvanoBezel.userData = {
      interactiveType: 'object_galvano',
      objectKey: 'galvano',
      label: 'Viền đồng hồ Điện kế (Kéo để di chuyển Điện kế)',
    };
    galvanoGroup.add(galvanoBezel);

    // Viền chỉ kim loại mạ crôm mảnh ôm quanh ô cửa kính đồng hồ
    const chromeTrimShape = createRoundedFrameShape(0.865, 0.705, 0.056, 0.836, 0.676, 0.046);
    const chromeTrimGeo = new THREE.ExtrudeGeometry(chromeTrimShape, {
      depth: 0.01,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.004,
      bevelSegments: 4,
      curveSegments: 20,
    });
    chromeTrimGeo.translate(0, 0.66, 0.268);
    const chromeTrimMesh = new THREE.Mesh(chromeTrimGeo, matChrome);
    galvanoGroup.add(chromeTrimMesh);

    // 4 vít đồng thau bo chỏm ở 4 góc mặt đồng hồ + Núm xoay hiệu chỉnh vạch 0 (Zero-Adjust Screw)
    const bezelScrewCoords: [number, number][] = [
      [-0.43, 0.35],
      [0.43, 0.35],
      [-0.43, -0.35],
      [0.43, -0.35],
    ];
    for (const [sx, sy] of bezelScrewCoords) {
      const screw = new THREE.Mesh(
        new THREE.SphereGeometry(0.016, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
        matBrass,
      );
      screw.rotation.x = Math.PI / 2;
      screw.position.set(sx, 0.66 + sy, 0.276);
      galvanoGroup.add(screw);
    }

    // Núm chỉnh chuẩn 0 (Zero-Adjust) ở chính giữa cạnh dưới viền đồng hồ
    const zeroAdjustCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.036, 0.022, 24),
      matChrome,
    );
    zeroAdjustCollar.rotation.x = Math.PI / 2;
    zeroAdjustCollar.position.set(0, 0.285, 0.274);
    const zeroAdjustScrew = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.028, 20),
      matBrass,
    );
    zeroAdjustScrew.rotation.x = Math.PI / 2;
    zeroAdjustScrew.position.set(0, 0.285, 0.28);
    const zeroScrewSlot = new THREE.Mesh(
      new THREE.BoxGeometry(0.032, 0.005, 0.008),
      matDarkHousing,
    );
    zeroScrewSlot.position.set(0, 0.285, 0.293);
    galvanoGroup.add(zeroAdjustCollar, zeroAdjustScrew, zeroScrewSlot);

    // 4. Mặt thang đo 2K sắc nét
    const dialWidth = 0.88;
    const dialHeight = 0.72;
    const dialMat = new THREE.MeshBasicMaterial({
      map: dialTexture,
      toneMapped: false,
    });
    const dialFaceMesh = new THREE.Mesh(new THREE.PlaneGeometry(dialWidth, dialHeight), dialMat);
    dialFaceMesh.position.set(0, 0.66, 0.256);
    dialFaceMesh.userData = {
      interactiveType: 'object_galvano',
      objectKey: 'galvano',
      label: 'Mặt thang đo Điện kế (Kéo để di chuyển Điện kế)',
    };
    galvanoGroup.add(dialFaceMesh);

    // 5. Kim chỉ thị sắc nét kiểu mũi giáo phòng thí nghiệm + Đối trọng cân bằng
    const needlePivotGroup = new THREE.Group();
    needlePivotGroup.position.set(0, 0.4188, 0.264);
    galvanoGroup.add(needlePivotGroup);

    const needleLength = 0.468;
    const needleGeo = new THREE.ConeGeometry(0.0135, needleLength, 16);
    needleGeo.scale(1.0, 1.0, 0.35);
    needleGeo.translate(0, needleLength / 2, 0);
    const needleMat = new THREE.MeshBasicMaterial({ color: 0xdc2626, toneMapped: false });
    const needleMesh = new THREE.Mesh(needleGeo, needleMat);
    needlePivotGroup.add(needleMesh);

    const needleHubRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.008, 24),
      needleMat,
    );
    needleHubRing.rotation.x = Math.PI / 2;
    needlePivotGroup.add(needleHubRing);

    const counterweight = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.014, 0.068, 14),
      new THREE.MeshBasicMaterial({ color: 0x0f172a, toneMapped: false }),
    );
    counterweight.position.y = -0.034;
    needlePivotGroup.add(counterweight);

    // Chụp trục kim đồng thau mạ vòm tròn (Jeweled Pivot Cap)
    const pivotCapBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.04, 0.018, 24),
      matBrass,
    );
    pivotCapBase.rotation.x = Math.PI / 2;
    pivotCapBase.position.set(0, 0.4188, 0.268);
    const pivotCapDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.036, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.45),
      matChrome,
    );
    pivotCapDome.rotation.x = Math.PI / 2;
    pivotCapDome.position.set(0, 0.4188, 0.275);
    galvanoGroup.add(pivotCapBase, pivotCapDome);

    const galvanoGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(dialWidth, dialHeight),
      matGlassCover,
    );
    galvanoGlass.position.set(0, 0.66, 0.285);
    galvanoGlass.renderOrder = 3;
    galvanoGroup.add(galvanoGlass);

    // Hai cọc đấu dây Âm (Xanh) và Dương (Đỏ) bo tròn chi tiết
    const galvTermLeft = new THREE.Group();
    galvTermLeft.position.set(-0.28, 0.145, 0.29);
    const gPostL = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.085, 20), matBrass);
    gPostL.rotation.x = Math.PI / 2;
    const gNutL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.042, 0.042, 24),
      matBluePlastic,
    );
    gNutL.rotation.x = Math.PI / 2;
    gNutL.position.z = 0.014;
    const gCapL = new THREE.Mesh(new THREE.SphereGeometry(0.022, 18, 14), matBrass);
    gCapL.position.z = 0.042;
    galvTermLeft.add(gPostL, gNutL, gCapL);
    galvanoGroup.add(galvTermLeft);

    const galvTermRight = new THREE.Group();
    galvTermRight.position.set(0.28, 0.145, 0.29);
    const gPostR = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.085, 20), matBrass);
    gPostR.rotation.x = Math.PI / 2;
    const gNutR = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.042, 0.042, 24),
      matRedPlastic,
    );
    gNutR.rotation.x = Math.PI / 2;
    gNutR.position.z = 0.014;
    const gCapR = new THREE.Mesh(new THREE.SphereGeometry(0.022, 18, 14), matBrass);
    gCapR.position.z = 0.042;
    galvTermRight.add(gPostR, gNutR, gCapR);
    galvanoGroup.add(galvTermRight);

    // =========================================================================
    // H. DÂY DẪN ĐIỆN BỐ TRÍ TRÊN MẶT BÀN — KHÔNG ẨN DƯỚI BÀN, KHÔNG CHE THIẾT BỊ
    // =========================================================================
    const wiresGroup = new THREE.Group();
    scene.add(wiresGroup);

    const cableClipsGroup = new THREE.Group();
    scene.add(cableClipsGroup);

    const matWireRed = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.42,
      metalness: 0.06,
    });
    const matWireBlue = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.42,
      metalness: 0.06,
    });
    const matWireBlack = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.58,
      metalness: 0.08,
    });

    let wireMeshPosA: THREE.Mesh | null = null;
    let wireMeshPosB: THREE.Mesh | null = null;
    let wireMeshNeg: THREE.Mesh | null = null;
    let wireMeshLampCord: THREE.Mesh | null = null;
    let curvePosA: THREE.CatmullRomCurve3 | null = null;
    let curvePosB: THREE.CatmullRomCurve3 | null = null;
    let curveNeg: THREE.CatmullRomCurve3 | null = null;

    const carrierCount = 24;
    const carrierGeo = new THREE.SphereGeometry(0.019, 10, 10);
    const carrierMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.25,
      metalness: 0.1,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
    });
    const carrierInstanced = new THREE.InstancedMesh(carrierGeo, carrierMat, carrierCount);
    carrierInstanced.frustumCulled = false;
    scene.add(carrierInstanced);

    let lastWireSignature = '';

    /**
     * Xây dựng đường cong dây điện nằm hoàn toàn trên mặt bàn gỗ (y >= 0.016),
     * tuyệt đối không bị võng xuống dưới mặt bàn (y < 0) và tự động né chân các thiết bị thí nghiệm.
     */
    const buildSafeTableWireCurve = (
      rawWaypoints: THREE.Vector3[],
      obstacles: { x: number; z: number; r: number }[],
    ): THREE.CatmullRomCurve3 => {
      const initialCurve = new THREE.CatmullRomCurve3(rawWaypoints, false, 'centripetal', 0.25);
      const sampleCount = 52;
      const safePoints: THREE.Vector3[] = [];

      for (let i = 0; i <= sampleCount; i++) {
        const u = i / sampleCount;
        const pt = initialCurve.getPoint(u);

        // Chặn cứng độ cao tối thiểu trên mặt bàn gỗ (bán kính dây 0.012m -> tâm dây >= 0.016m)
        if (i > 0 && i < sampleCount) {
          pt.y = Math.max(0.016, pt.y);
        }

        // Đẩy các đoạn dây chạy trên mặt bàn ra ngoài bán kính chân đế thiết bị để không cắt ngang hay che thiết bị
        if (u > 0.12 && u < 0.88 && pt.y < 0.12) {
          for (const obs of obstacles) {
            const dx = pt.x - obs.x;
            const dz = pt.z - obs.z;
            const dist = Math.hypot(dx, dz);
            if (dist < obs.r) {
              if (dist < 1e-4) {
                pt.z += obs.r;
              } else {
                const push = (obs.r - dist) / dist;
                pt.x += dx * push;
                pt.z += dz * push;
              }
            }
          }
          pt.x = clamp(pt.x, -3.22, 3.22);
          pt.z = clamp(pt.z, -1.72, 1.72);
        }

        safePoints.push(pt);
      }

      return new THREE.CatmullRomCurve3(safePoints, false, 'centripetal', 0.15);
    };

    const createTableSafeTubeGeometry = (
      curve: THREE.CatmullRomCurve3,
      tubularSegments: number,
      radius: number,
    ): THREE.TubeGeometry => {
      const geo = new THREE.TubeGeometry(curve, tubularSegments, radius, 10, false);
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const vy = pos.getY(i);
        if (vy < 0.002) {
          pos.setY(i, 0.002);
        }
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      return geo;
    };

    const rebuildWiresIfNeeded = (st: ExperimentState) => {
      const sig = [
        st.lampPos.x.toFixed(2),
        st.lampPos.z.toFixed(2),
        st.pvPos.x.toFixed(2),
        st.pvPos.z.toFixed(2),
        st.pvYawDeg.toFixed(1),
        st.pvPitchDeg.toFixed(1),
        st.occluderActive ? st.occluderPos.x.toFixed(2) : 'off',
        st.occluderActive ? st.occluderPos.z.toFixed(2) : 'off',
        st.switchPos.x.toFixed(2),
        st.switchPos.z.toFixed(2),
        st.galvanoPos.x.toFixed(2),
        st.galvanoPos.z.toFixed(2),
        st.wiringReversed,
      ].join('_');

      if (sig === lastWireSignature) return;
      lastWireSignature = sig;

      if (wireMeshPosA) {
        wireMeshPosA.geometry.dispose();
        wiresGroup.remove(wireMeshPosA);
      }
      if (wireMeshPosB) {
        wireMeshPosB.geometry.dispose();
        wiresGroup.remove(wireMeshPosB);
      }
      if (wireMeshNeg) {
        wireMeshNeg.geometry.dispose();
        wiresGroup.remove(wireMeshNeg);
      }
      if (wireMeshLampCord) {
        wireMeshLampCord.geometry.dispose();
        wiresGroup.remove(wireMeshLampCord);
      }

      while (cableClipsGroup.children.length > 0) {
        const child = cableClipsGroup.children[0] as THREE.Mesh;
        child.geometry?.dispose();
        cableClipsGroup.remove(child);
      }

      lampStandGroup.updateMatrixWorld(true);
      pvPanelGroup.updateMatrixWorld(true);
      galvanoGroup.updateMatrixWorld(true);
      switchGroup.updateMatrixWorld(true);

      const tableObstacles = [
        { x: lampStandGroup.position.x, z: lampStandGroup.position.z, r: 0.44 },
        { x: st.pvPos.x, z: st.pvPos.z, r: 0.36 },
        ...(st.occluderActive
          ? [{ x: st.occluderPos.x, z: st.occluderPos.z, r: 0.33 }]
          : []),
        { x: st.switchPos.x, z: st.switchPos.z, r: 0.24 },
        { x: st.galvanoPos.x, z: st.galvanoPos.z, r: 0.62 },
      ];

      // 1. Dây nguồn Đèn chiếu: từ hộp công tắc đi gọn trên mặt bàn ra ổ cắm nguồn góc trái sau bàn (-2.98, 0.095, -1.46)
      const pLampSwitch = new THREE.Vector3();
      switchBox.getWorldPosition(pLampSwitch);
      const rearCordZ = clamp(Math.min(pLampSwitch.z - 0.36, -1.35), -1.68, -0.95);
      const curveLampCord = buildSafeTableWireCurve(
        [
          new THREE.Vector3(pLampSwitch.x, 0.055, pLampSwitch.z - 0.08),
          new THREE.Vector3(pLampSwitch.x - 0.06, 0.020, pLampSwitch.z - 0.22),
          new THREE.Vector3(pLampSwitch.x - 0.18, 0.018, rearCordZ),
          new THREE.Vector3(-2.65, 0.018, -1.44),
          new THREE.Vector3(-2.92, 0.022, -1.46),
          new THREE.Vector3(-2.98, 0.095, -1.46),
        ],
        tableObstacles,
      );
      wireMeshLampCord = new THREE.Mesh(
        createTableSafeTubeGeometry(curveLampCord, 36, 0.012),
        matWireBlack,
      );
      wireMeshLampCord.castShadow = true;
      wiresGroup.add(wireMeshLampCord);

      const pPvPos = new THREE.Vector3();
      const pPvNeg = new THREE.Vector3();
      pvTerminalPos.getWorldPosition(pPvPos);
      pvTerminalNeg.getWorldPosition(pPvNeg);

      const pSwitchIn = new THREE.Vector3();
      const pSwitchOut = new THREE.Vector3();
      switchJawLeft.getWorldPosition(pSwitchIn);
      switchJawRight.getWorldPosition(pSwitchOut);

      const pGalvLeft = new THREE.Vector3();
      const pGalvRight = new THREE.Vector3();
      galvTermLeft.getWorldPosition(pGalvLeft);
      galvTermRight.getWorldPosition(pGalvRight);

      const targetGalvForPos = st.wiringReversed ? pGalvLeft : pGalvRight;
      const targetGalvForNeg = st.wiringReversed ? pGalvRight : pGalvLeft;

      // Rãnh dây phía trước (Front Perimeter Lane) dành cho nhánh Dương (+) qua Khóa mạch
      const frontLaneZ = clamp(
        Math.max(pPvPos.z + 0.42, pSwitchIn.z + 0.22, targetGalvForPos.z + 0.46, 0.94),
        0.75,
        1.62,
      );

      // Rãnh dây phía sau (Rear Perimeter Lane) dành cho nhánh Âm (−) vòng gọn sau lưng Pin & Điện kế
      const rearLaneZ = clamp(
        Math.min(pPvNeg.z - 0.48, targetGalvForNeg.z - 0.56, -0.82),
        -1.62,
        -0.65,
      );

      // 2. Dây Đỏ A: Cực Dương (+) Pin Quang Điện -> Cực vào Khóa mạch (chạy nổi trên mặt bàn theo rãnh trước)
      curvePosA = buildSafeTableWireCurve(
        [
          pPvPos.clone(),
          new THREE.Vector3(pPvPos.x + 0.04, Math.max(0.08, pPvPos.y * 0.45), pPvPos.z + 0.08),
          new THREE.Vector3(pPvPos.x + 0.12, 0.018, pPvPos.z + 0.28),
          new THREE.Vector3(pPvPos.x + 0.22, 0.018, frontLaneZ),
          new THREE.Vector3((pPvPos.x + pSwitchIn.x) * 0.5, 0.018, frontLaneZ),
          new THREE.Vector3(pSwitchIn.x - 0.14, 0.018, Math.max(pSwitchIn.z + 0.14, frontLaneZ - 0.12)),
          new THREE.Vector3(pSwitchIn.x - 0.05, 0.032, pSwitchIn.z + 0.03),
          pSwitchIn.clone(),
        ],
        tableObstacles,
      );

      // 3. Dây Đỏ B: Cực ra Khóa mạch -> Cọc Điện kế (chạy nổi trên mặt bàn theo rãnh trước, không che mặt đồng hồ)
      curvePosB = buildSafeTableWireCurve(
        [
          pSwitchOut.clone(),
          new THREE.Vector3(pSwitchOut.x + 0.05, 0.032, pSwitchOut.z + 0.03),
          new THREE.Vector3(pSwitchOut.x + 0.15, 0.018, Math.max(pSwitchOut.z + 0.14, frontLaneZ - 0.1)),
          new THREE.Vector3((pSwitchOut.x + targetGalvForPos.x) * 0.5, 0.018, frontLaneZ),
          new THREE.Vector3(targetGalvForPos.x + 0.08, 0.018, frontLaneZ),
          new THREE.Vector3(targetGalvForPos.x + 0.04, 0.018, targetGalvForPos.z + 0.22),
          new THREE.Vector3(targetGalvForPos.x, 0.065, targetGalvForPos.z + 0.08),
          targetGalvForPos.clone(),
        ],
        tableObstacles,
      );

      // 4. Dây Xanh: Cọc còn lại của Điện kế -> Cực Âm (−) Pin Quang Điện (đi vòng gọn phía sau thiết bị)
      const galvSideClearX = st.wiringReversed
        ? st.galvanoPos.x + 0.68
        : st.galvanoPos.x - 0.68;

      curveNeg = buildSafeTableWireCurve(
        [
          targetGalvForNeg.clone(),
          new THREE.Vector3(targetGalvForNeg.x, 0.065, targetGalvForNeg.z + 0.08),
          new THREE.Vector3(targetGalvForNeg.x, 0.018, targetGalvForNeg.z + 0.20),
          new THREE.Vector3(galvSideClearX, 0.018, targetGalvForNeg.z + 0.12),
          new THREE.Vector3(galvSideClearX, 0.018, rearLaneZ),
          new THREE.Vector3((st.galvanoPos.x + pPvNeg.x) * 0.5, 0.018, rearLaneZ),
          new THREE.Vector3(pPvNeg.x - 0.22, 0.018, rearLaneZ),
          new THREE.Vector3(pPvNeg.x - 0.14, 0.018, pPvNeg.z - 0.24),
          new THREE.Vector3(pPvNeg.x - 0.04, Math.max(0.08, pPvNeg.y * 0.45), pPvNeg.z - 0.06),
          pPvNeg.clone(),
        ],
        tableObstacles,
      );

      wireMeshPosA = new THREE.Mesh(
        createTableSafeTubeGeometry(curvePosA, 44, 0.012),
        matWireRed,
      );
      wireMeshPosB = new THREE.Mesh(
        createTableSafeTubeGeometry(curvePosB, 44, 0.012),
        matWireRed,
      );
      wireMeshNeg = new THREE.Mesh(
        createTableSafeTubeGeometry(curveNeg, 56, 0.012),
        matWireBlue,
      );

      wireMeshPosA.castShadow = true;
      wireMeshPosB.castShadow = true;
      wireMeshNeg.castShadow = true;
      wiresGroup.add(wireMeshPosA, wireMeshPosB, wireMeshNeg);

      // Kẹp giữ dây cố định gọn gàng trên mặt bàn gỗ (Tabletop Cable Clips)
      const clipPoints = [
        curvePosA.getPointAt(0.45),
        curvePosB.getPointAt(0.45),
        curveNeg.getPointAt(0.5),
      ];
      for (const cp of clipPoints) {
        const clipMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.045, 0.026, 0.045),
          matDarkHousing,
        );
        clipMesh.position.set(cp.x, 0.013, cp.z);
        clipMesh.castShadow = true;
        cableClipsGroup.add(clipMesh);
      }
    };

    // =========================================================================
    // I. TƯƠNG TÁC KÉO DI CHUYỂN VẬT THỂ TRÊN MẶT BÀN & XOAY HƯỚNG (RAY-PLANE DRAG)
    // =========================================================================
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // Mặt bàn gỗ Y = 0
    const planeHitPoint = new THREE.Vector3();

    type ActiveDragAction =
      | {
          kind: 'translate';
          objectKey: 'lamp' | 'pv' | 'occluder' | 'switch' | 'galvano';
          offsetX: number;
          offsetZ: number;
          startClientX: number;
          startClientY: number;
          moved: boolean;
        }
      | {
          kind: 'rotate';
          objectKey: 'lamp' | 'pv' | 'occluder';
          startClientX: number;
          startClientY: number;
          startYaw: number;
          startPitch: number;
        };

    let activeDrag: ActiveDragAction | null = null;

    const getInteractiveHit = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);

      const interactables = [
        lampPowerButton,
        lampButtonDome,
        lampSwitchHaloRing,
        switchFaceplate,
        switchBox,
        bulbLens,
        housingBody,
        lampBase,
        lampColumnMesh,
        pvBackplate,
        pvCellMesh,
        pvBase,
        pvStem,
        occScreenMesh,
        occHandle,
        occBase,
        occStem,
        knifeBlade,
        knifeHandle,
        switchBase,
        galvanoBody,
        galvanoBezel,
        galvanoBase,
        dialFaceMesh,
      ];
      const hits = raycaster.intersectObjects(interactables, false);
      return hits.length > 0 ? hits[0].object : null;
    };

    const getObjectXZ = (
      st: ExperimentState,
      key: 'lamp' | 'pv' | 'occluder' | 'switch' | 'galvano',
    ) => {
      switch (key) {
        case 'lamp':
          return st.lampPos;
        case 'pv':
          return st.pvPos;
        case 'occluder':
          return st.occluderPos;
        case 'switch':
          return st.switchPos;
        case 'galvano':
          return st.galvanoPos;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const hitObj = getInteractiveHit(e.clientX, e.clientY);
      if (!hitObj) return;

      const type = hitObj.userData?.interactiveType as string | undefined;
      const objKey = hitObj.userData?.objectKey as
        | 'lamp'
        | 'pv'
        | 'occluder'
        | 'switch'
        | 'galvano'
        | undefined;

      if (type === 'toggle_lamp') {
        const cur = stateRef.current;
        const nextOn = !cur.lampOn || cur.lampIntensity <= 0.001;
        gameAudio.playLampPowerSound(nextOn);
        bounceTargetKey = 'lamp';
        bounceTimer = 0.18;
        onUpdateStateRef.current({
          lampOn: nextOn,
          lampIntensity: nextOn && cur.lampIntensity <= 0.001 ? 0.8 : cur.lampIntensity,
        });
        return;
      }

      if (!objKey) return;

      if (selectedObjectRef.current !== objKey) {
        onSelectObjectRef.current?.(objKey);
        gameAudio.playSelectSound();
      }
      bounceTargetKey = objKey;
      bounceTimer = 0.15;

      const st = stateRef.current;
      const wantsRotate =
        (st.dragInteractionMode === 'rotate' || e.shiftKey) &&
        (objKey === 'lamp' || objKey === 'pv' || objKey === 'occluder');

      controls.enabled = false;

      if (wantsRotate) {
        activeDrag = {
          kind: 'rotate',
          objectKey: objKey,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startYaw:
            objKey === 'lamp'
              ? st.lampYawDeg
              : objKey === 'pv'
                ? st.pvYawDeg
                : st.occluderYawDeg,
          startPitch: objKey === 'lamp' ? st.lampPitchDeg : st.pvPitchDeg,
        };
        setActiveDragLabel(
          objKey === 'lamp'
            ? 'Đang xoay hướng chiếu của Đèn'
            : objKey === 'pv'
              ? 'Đang xoay góc mặt Pin quang điện'
              : 'Đang xoay góc Vật cản sáng',
        );
      } else {
        // Kéo di chuyển vị trí (X, Z) trên mặt phẳng bàn gỗ Y = 0
        if (raycaster.ray.intersectPlane(tablePlane, planeHitPoint)) {
          const curXZ = getObjectXZ(st, objKey);
          activeDrag = {
            kind: 'translate',
            objectKey: objKey,
            offsetX: curXZ.x - planeHitPoint.x,
            offsetZ: curXZ.z - planeHitPoint.z,
            startClientX: e.clientX,
            startClientY: e.clientY,
            moved: false,
          };
          setActiveDragLabel(
            objKey === 'lamp'
              ? 'Đang di chuyển Đèn chiếu trên mặt bàn'
              : objKey === 'pv'
                ? 'Đang di chuyển Pin quang điện trên mặt bàn'
                : objKey === 'occluder'
                  ? 'Đang di chuyển Vật cản sáng trên mặt bàn'
                  : objKey === 'switch'
                    ? 'Đang di chuyển Khóa mạch điện'
                    : 'Đang di chuyển Điện kế',
          );
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);

      if (activeDrag) {
        const st = stateRef.current;
        if (activeDrag.kind === 'rotate') {
          const dx = e.clientX - activeDrag.startClientX;
          const dy = e.clientY - activeDrag.startClientY;
          if (activeDrag.objectKey === 'lamp') {
            onUpdateStateRef.current({
              lampYawDeg: Math.round(clamp(activeDrag.startYaw + dx * 0.28, -75, 75)),
              lampPitchDeg: Math.round(clamp(activeDrag.startPitch - dy * 0.22, -35, 35)),
            });
          } else if (activeDrag.objectKey === 'pv') {
            onUpdateStateRef.current({
              pvYawDeg: Math.round(clamp(activeDrag.startYaw + dx * 0.35, -90, 90)),
              pvPitchDeg: Math.round(clamp(activeDrag.startPitch - dy * 0.25, -45, 45)),
            });
          } else if (activeDrag.objectKey === 'occluder') {
            onUpdateStateRef.current({
              occluderYawDeg: Math.round(clamp(activeDrag.startYaw + dx * 0.35, -75, 75)),
            });
          }
          return;
        }

        // Translate mode on wooden table plane (với chống chồng lấn vật lí resolveTableCollision)
        const pixelDist = Math.hypot(
          e.clientX - activeDrag.startClientX,
          e.clientY - activeDrag.startClientY,
        );
        if (pixelDist > 4) {
          activeDrag.moved = true;
        }

        if (raycaster.ray.intersectPlane(tablePlane, planeHitPoint)) {
          const rawX = planeHitPoint.x + activeDrag.offsetX;
          const rawZ = planeHitPoint.z + activeDrag.offsetZ;
          const resolvedXZ = resolveTableCollision(
            activeDrag.objectKey,
            { x: rawX, z: rawZ },
            st,
          );
          const nextX = resolvedXZ.x;
          const nextZ = resolvedXZ.z;

          dragHighlightRing.visible = true;
          dragHighlightRing.position.set(nextX, 0.006, nextZ);

          if (activeDrag.objectKey === 'lamp') {
            const newDist = vecLen(
              vecSub(
                { x: st.pvPos.x, y: SCENE_GEOMETRY.pvCenterY, z: st.pvPos.z },
                { x: nextX, y: st.lampHeight, z: nextZ },
              ),
            );
            onUpdateStateRef.current({
              lampPos: { x: nextX, z: nextZ },
              lampDistance: Number(
                clamp(newDist, SCENE_GEOMETRY.minDistance, SCENE_GEOMETRY.maxDistance).toFixed(2),
              ),
            });
          } else if (activeDrag.objectKey === 'pv') {
            const newDist = vecLen(
              vecSub(
                { x: nextX, y: SCENE_GEOMETRY.pvCenterY, z: nextZ },
                { x: st.lampPos.x, y: st.lampHeight, z: st.lampPos.z },
              ),
            );
            onUpdateStateRef.current({
              pvPos: { x: nextX, z: nextZ },
              lampDistance: Number(
                clamp(newDist, SCENE_GEOMETRY.minDistance, SCENE_GEOMETRY.maxDistance).toFixed(2),
              ),
            });
          } else if (activeDrag.objectKey === 'occluder') {
            onUpdateStateRef.current({
              occluderPos: { x: nextX, z: nextZ },
              occluderInsertion: 1.0,
            });
          } else if (activeDrag.objectKey === 'switch') {
            onUpdateStateRef.current({
              switchPos: { x: nextX, z: nextZ },
            });
          } else if (activeDrag.objectKey === 'galvano') {
            onUpdateStateRef.current({
              galvanoPos: { x: nextX, z: nextZ },
            });
          }
        }
        return;
      }

      // Hover detection when not dragging
      const hitObj = getInteractiveHit(e.clientX, e.clientY);
      const objKey = hitObj?.userData?.objectKey as
        | 'lamp'
        | 'pv'
        | 'occluder'
        | 'switch'
        | 'galvano'
        | undefined;

      if (objKey) {
        const xz = getObjectXZ(stateRef.current, objKey);
        dragHighlightRing.visible = true;
        dragHighlightRing.position.set(xz.x, 0.006, xz.z);
      } else {
        dragHighlightRing.visible = false;
      }

      setHoveredInteractive(hitObj?.userData?.label || null);
    };

    const onPointerUp = () => {
      if (activeDrag) {
        // Nếu người dùng nhấn (click nhẹ không kéo) lên Khóa mạch điện -> Đóng/Mở mạch
        if (
          activeDrag.kind === 'translate' &&
          activeDrag.objectKey === 'switch' &&
          !activeDrag.moved
        ) {
          const nextClosed = !stateRef.current.circuitClosed;
          gameAudio.playSwitchSound(nextClosed);
          bounceTargetKey = 'switch';
          bounceTimer = 0.18;
          onUpdateStateRef.current({ circuitClosed: nextClosed });
        }
        activeDrag = null;
        controls.enabled = true;
        setActiveDragLabel(null);
      }
    };

    // Bộ điều khiển bàn phím 60fps kiểu Game (Held Keys cho chuyển động mượt WASD/Q-E/R-F + Edge Keys cho hành động tức thời)
    const heldKeys = new Set<string>();
    const onGameKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      heldKeys.add(e.code);

      if (gamePhaseRef.current !== 'playing') return;
      if (e.repeat) return;

      const st = stateRef.current;
      if (e.code === 'Digit1') {
        onSelectObjectRef.current?.('lamp');
        gameAudio.playSelectSound();
        bounceTargetKey = 'lamp';
        bounceTimer = 0.16;
      } else if (e.code === 'Digit2') {
        onSelectObjectRef.current?.('occluder');
        gameAudio.playSelectSound();
        if (!st.occluderActive) {
          onUpdateStateRef.current({ occluderActive: true, occluderInsertion: 1.0 });
        }
        bounceTargetKey = 'occluder';
        bounceTimer = 0.16;
      } else if (e.code === 'Digit3') {
        onSelectObjectRef.current?.('pv');
        gameAudio.playSelectSound();
        bounceTargetKey = 'pv';
        bounceTimer = 0.16;
      } else if (e.code === 'Digit4') {
        onSelectObjectRef.current?.('switch');
        gameAudio.playSelectSound();
        bounceTargetKey = 'switch';
        bounceTimer = 0.16;
      } else if (e.code === 'Digit5') {
        onSelectObjectRef.current?.('galvano');
        gameAudio.playSelectSound();
        bounceTargetKey = 'galvano';
        bounceTimer = 0.16;
      } else if (e.code === 'Space') {
        e.preventDefault();
        const nextOn = !st.lampOn || st.lampIntensity <= 0.001;
        gameAudio.playLampPowerSound(nextOn);
        bounceTargetKey = 'lamp';
        bounceTimer = 0.18;
        onUpdateStateRef.current({
          lampOn: nextOn,
          lampIntensity: nextOn && st.lampIntensity <= 0.001 ? 0.8 : st.lampIntensity,
        });
      } else if (e.code === 'KeyC') {
        const nextClosed = !st.circuitClosed;
        gameAudio.playSwitchSound(nextClosed);
        bounceTargetKey = 'switch';
        bounceTimer = 0.18;
        onUpdateStateRef.current({ circuitClosed: nextClosed });
      } else if (e.code === 'KeyV') {
        const nextOcc = !st.occluderActive;
        gameAudio.playSwitchSound(nextOcc);
        bounceTargetKey = 'occluder';
        bounceTimer = 0.18;
        onUpdateStateRef.current({
          occluderActive: nextOcc,
          occluderInsertion: 1.0,
        });
        if (nextOcc) {
          onSelectObjectRef.current?.('occluder');
        }
      } else if (e.code === 'KeyX') {
        gameAudio.playSwitchSound(!st.wiringReversed);
        bounceTargetKey = 'galvano';
        bounceTimer = 0.16;
        onUpdateStateRef.current({ wiringReversed: !st.wiringReversed });
      }
    };

    const onGameKeyUp = (e: KeyboardEvent) => {
      heldKeys.delete(e.code);
    };

    const onWindowBlur = () => {
      heldKeys.clear();
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onGameKeyDown);
    window.addEventListener('keyup', onGameKeyUp);
    window.addEventListener('blur', onWindowBlur);

    // =========================================================================
    // J. VÒNG LẶP ĐỒNG BỘ VẬT LÍ -> ĐỒ HỌA 3D & RENDER LOOP
    // =========================================================================
    const needleDynamics = new GalvanometerNeedleDynamics();
    const clock = new THREE.Clock();
    let carrierPhase = 0;
    let dustElapsedTime = 0;
    let gameElapsedTime = 0;
    let titleOrbitAngle = 0;
    let bounceTargetKey: ControllableObjectKey | null = null;
    let bounceTimer = 0;
    let lastCelebrationId = celebrationTriggerRef.current;
    let burstTimer = 0;
    let cameraShakeTimer = 0;
    let knifeAngleRad = stateRef.current.circuitClosed ? 0 : 0.72;
    let frameId = 0;
    let frameCount = 0;
    let fpsAccumTime = 0;
    let lastQualityMode = stateRef.current.qualityMode;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (status === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    const updateSceneFromPhysics = (dt: number) => {
      const st = stateRef.current;
      const phys = physicsRef.current;

      if (st.qualityMode !== lastQualityMode) {
        lastQualityMode = st.qualityMode;
        renderer.setPixelRatio(getTargetPixelRatio(st.qualityMode));
        renderer.shadowMap.enabled = !isSoftwareGl && st.qualityMode !== 'battery_saver';
      }

      // 0. Đồng bộ chế độ ánh sáng phòng thí nghiệm trong tối (Ambient Light + Night-Blue Spotlight)
      // Lưu ý: Chỉ thay đổi ánh sáng kết xuất 3D để làm nổi bật chùm sáng thực nghiệm, KHÔNG tự ý thay đổi dòng điện vật lí
      if (st.darkLabVisualMode) {
        scene.background = bgDarkNight;
        sceneFog.color.copy(bgDarkNight);
        sceneFog.density = 0.048;
        scene.environmentIntensity = 0.16;
        darkAmbientLight.color.setHex(0x1e3a8a);
        darkAmbientLight.intensity = 0.25;
        hemiLight.color.setHex(0x60a5fa);
        hemiLight.groundColor.setHex(0x050811);
        hemiLight.intensity = 0.18;
        nightBlueSpotLight.intensity = 3.8;
        nightBlueRimSpot.intensity = 2.2;
        studioKeyLight.intensity = 0.14;
        rimLight.intensity = 0.25;
      } else {
        scene.background = bgBrightStudio;
        sceneFog.color.copy(bgBrightStudio);
        sceneFog.density = 0.042;
        scene.environmentIntensity = 0.75;
        darkAmbientLight.color.setHex(0xdbeafe);
        darkAmbientLight.intensity = 0.35;
        hemiLight.color.setHex(0xdbeafe);
        hemiLight.groundColor.setHex(0x1e293b);
        hemiLight.intensity = 0.68;
        nightBlueSpotLight.intensity = 0;
        nightBlueRimSpot.intensity = 0;
        studioKeyLight.intensity = 0.72;
        rimLight.intensity = 0.4;
      }

      // 1. Đồng bộ vị trí & hướng của Đèn chiếu + Khớp nối chữ U nối liền trụ đèn với bầu đèn
      const lampTf = computeLampTransform(st);
      lampHeadGroup.position.set(lampTf.position.x, lampTf.position.y, lampTf.position.z);
      _vec3A.set(
        lampTf.position.x + lampTf.direction.x,
        lampTf.position.y + lampTf.direction.y,
        lampTf.position.z + lampTf.direction.z,
      );
      lampHeadGroup.lookAt(_vec3A);

      // Tâm bầu đèn (housingBody ở z = -0.22) nằm tại tọa độ thế giới: lampTf.position - 0.22 * lampTf.direction
      const standX = lampTf.position.x - lampTf.direction.x * 0.22;
      const mountY = lampTf.position.y - lampTf.direction.y * 0.22;
      const standZ = lampTf.position.z - lampTf.direction.z * 0.22;
      lampStandGroup.position.set(standX, 0, standZ);

      lampYokeGroup.position.set(0, mountY, 0);
      lampYokeGroup.rotation.y = THREE.MathUtils.degToRad(st.lampYawDeg);

      const colTopY = Math.max(0.24, mountY - 0.16);
      const colH = colTopY - 0.04;
      lampColumnMesh.scale.set(1, colH, 1);
      lampColumnMesh.position.y = 0.04 + colH / 2;
      lampCollarMesh.position.y = colTopY * 0.62;

      const hasLampLight = st.lampOn && st.lampIntensity > 0.001;

      if (hasLampLight) {
        // Độ sáng điều chỉnh mượt từ 0% đến 100%; 0% là tắt hẳn hoàn toàn không có ánh sáng
        bulbLensMat.emissiveIntensity =
          st.lampIntensity * (st.darkLabVisualMode ? 1.35 : 1.15);
        nozzleReflectorMat.emissiveIntensity =
          st.lampIntensity * (st.darkLabVisualMode ? 1.02 : 0.88);
        bulbDomeMat.opacity = st.lampIntensity * 0.32;
        nozzleMouthGlowMat.opacity =
          st.lampIntensity * (st.darkLabVisualMode ? 0.28 : 0.22);
        experimentSpotLight.intensity =
          st.lampIntensity * (st.darkLabVisualMode ? 7.2 : 4.8);
      } else {
        bulbLensMat.emissiveIntensity = 0;
        nozzleReflectorMat.emissiveIntensity = 0;
        bulbDomeMat.opacity = 0;
        nozzleMouthGlowMat.opacity = 0;
        experimentSpotLight.intensity = 0;
      }

      if (st.lampOn && st.lampIntensity > 0.001) {
        lampPowerButton.position.y = 0.056; // Nút nhấn hơi lún xuống khi đang BẬT
        lampPowerButtonMat.color.setHex(0x10b981);
        lampPowerButtonMat.emissive.setHex(0x059669);
        lampPowerButtonMat.emissiveIntensity = 0.85;
        lampSwitchHaloMat.color.setHex(0x34d399);
        lampSwitchHaloMat.emissive.setHex(0x10b981);
        lampSwitchHaloMat.emissiveIntensity = 1.15;
      } else {
        lampPowerButton.position.y = 0.068; // Nút nhô cao nổi bật khi đang TẮT (hoặc 0%)
        lampPowerButtonMat.color.setHex(0xef4444);
        lampPowerButtonMat.emissive.setHex(0xdc2626);
        lampPowerButtonMat.emissiveIntensity = 0.55;
        lampSwitchHaloMat.color.setHex(0xf97316);
        lampSwitchHaloMat.emissive.setHex(0xea580c);
        lampSwitchHaloMat.emissiveIntensity = 0.75;
      }

      // 2. Đồng bộ vị trí & hướng của Pin Quang Điện
      const pvBasis = computePVSurfaceBasis(st);
      pvStandGroup.position.set(pvBasis.center.x, 0, pvBasis.center.z);
      pvPanelGroup.position.set(pvBasis.center.x, pvBasis.center.y, pvBasis.center.z);
      _vec3A.set(
        pvBasis.center.x + pvBasis.normal.x,
        pvBasis.center.y + pvBasis.normal.y,
        pvBasis.center.z + pvBasis.normal.z,
      );
      pvPanelGroup.lookAt(_vec3A);
      pvNormalGuideGroup.visible = st.showLabels;

      // Cập nhật 36 ô (6x6) trên mặt Pin Quang Điện: phân biệt rõ Vùng sáng, Vùng nửa tối (Penumbra) và Vùng tối hoàn toàn (Umbra)
      const samples = phys.illumination.samplePoints;
      for (let i = 0; i < pvSamplePatches.length && i < samples.length; i++) {
        const sp = samples[i];
        const patch = pvSamplePatches[i];
        // Tọa độ local X trên pvPanelGroup hướng theo -tangentRight do lookAt(+normal)
        patch.mesh.position.set(-sp.localU, sp.localV, 0.004);
        if (!hasLampLight) {
          patch.mat.opacity = 0;
        } else if (sp.shadowState === 'umbra' && sp.inBeamWeight > 0.03) {
          // Vùng tối hoàn toàn (Umbra — bị vật cản che khuất 100% cửa phát sáng của đèn)
          patch.mat.color.setHex(0x020617);
          patch.mat.opacity = 0.86 * THREE.MathUtils.clamp(st.lampIntensity * 1.25, 0, 1);
        } else if (sp.shadowState === 'penumbra' && sp.inBeamWeight > 0.03) {
          // Vùng nửa tối (Penumbra — chỉ nhận được một phần diện tích cửa phát sáng của đèn)
          patch.mat.color.setHex(0x0f172a);
          patch.mat.opacity =
            THREE.MathUtils.clamp((1 - sp.visibilityRatio) * 0.72, 0.24, 0.68) *
            THREE.MathUtils.clamp(st.lampIntensity * 1.25, 0, 1);
        } else if (sp.netWeight > 0.02) {
          // Vùng sáng trực tiếp đều màu từ cửa đèn
          patch.mat.color.setHex(0xfef08a);
          patch.mat.opacity = THREE.MathUtils.clamp(sp.netWeight * st.lampIntensity * 0.38, 0, 0.36);
        } else {
          patch.mat.opacity = 0;
        }
      }

      const effIrr = phys.illumination.effectiveIrradiance;
      pvCellMat.emissiveIntensity = THREE.MathUtils.clamp(effIrr * 0.22, 0, 0.2);

      // 3. Đồng bộ Vật cản sáng (Occluder Stand & Screen)
      const occTf = computeOccluderTransform(st);
      occluderStandGroup.visible = st.occluderActive;
      if (st.occluderActive) {
        occluderStandGroup.position.set(occTf.standPos.x, 0, occTf.standPos.z);
        occluderStandGroup.rotation.y = THREE.MathUtils.degToRad(st.occluderYawDeg);
      }

      // 4. Đồng bộ Khóa mạch & Điện kế tại vị trí thực trên bàn
      switchGroup.position.set(st.switchPos.x, 0, st.switchPos.z);
      galvanoGroup.position.set(st.galvanoPos.x, 0, st.galvanoPos.z);

      // 5. Cập nhật Chùm sáng 3 lớp sáng đều nối liền họng đèn + Khối bóng tối 3D phía sau Vật cản + Lưới ánh sáng/bóng tối trên mặt bàn
      const showCone = hasLampLight && st.visualBeamMode === 'explanatory_cone';
      const showRays = hasLampLight && st.visualBeamMode === 'explanatory_rays';
      explanatoryConeMesh.visible = showCone;
      midConeMesh.visible = showCone;
      coreConeMesh.visible = showCone;
      raysGroup.visible = showRays;

      const maxBeamReach = 5.8;
      const outerConeRad = THREE.MathUtils.degToRad(SCENE_GEOMETRY.beamOuterHalfAngleDeg * 0.94);
      const midConeRad = THREE.MathUtils.degToRad(
        (SCENE_GEOMETRY.beamOuterHalfAngleDeg * 0.55 + SCENE_GEOMETRY.beamCoreHalfAngleDeg * 0.45) *
          0.92,
      );
      const innerConeRad = THREE.MathUtils.degToRad(SCENE_GEOMETRY.beamCoreHalfAngleDeg * 0.86);
      const tanOuter = Math.tan(outerConeRad);
      const tanMid = Math.tan(midConeRad);
      const tanInner = Math.tan(innerConeRad);
      const apertureRadius = 0.138;

      // Điểm gốc chùm sáng nhô nhẹ vào trong chóa đèn (0.015m) để nối liền mạch không đứt đoạn
      const nozzleOrigin = vecAdd(lampTf.position, vecScale(lampTf.direction, 0.015));

      const updateVolumetricShell = (
        geo: THREE.BufferGeometry,
        radiusScale: number,
        tanSpread: number,
        topColorHex: number,
        farColorHex: number,
      ) => {
        const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
        const colAttr = geo.getAttribute('color') as THREE.BufferAttribute;
        const cTop = new THREE.Color(topColorHex);
        const cFar = new THREE.Color(farColorHex);

        const rawDists = new Float32Array(radialSegments + 1);
        const startPtsX = new Float32Array(radialSegments + 1);
        const startPtsY = new Float32Array(radialSegments + 1);
        const startPtsZ = new Float32Array(radialSegments + 1);
        const rayDirsX = new Float32Array(radialSegments + 1);
        const rayDirsY = new Float32Array(radialSegments + 1);
        const rayDirsZ = new Float32Array(radialSegments + 1);

        const rAperture = apertureRadius * radiusScale;

        for (let i = 0; i <= radialSegments; i++) {
          const phi = (i / radialSegments) * Math.PI * 2;
          const cosP = Math.cos(phi);
          const sinP = Math.sin(phi);

          const startPt = vecAdd(
            nozzleOrigin,
            vecAdd(
              vecScale(lampTf.right, cosP * rAperture),
              vecScale(lampTf.up, sinP * rAperture),
            ),
          );

          const rayDirRaw = vecAdd(
            lampTf.direction,
            vecAdd(
              vecScale(lampTf.right, cosP * tanSpread),
              vecScale(lampTf.up, sinP * tanSpread),
            ),
          );
          const rayDir = vecScale(rayDirRaw, 1 / vecLen(rayDirRaw));

          let hitDist = maxBeamReach;

          const occHit = intersectRayWithOccluder(startPt, rayDir, hitDist, st);
          if (occHit !== null && occHit < hitDist) {
            hitDist = occHit;
          }

          const pvHit = intersectRayWithPVPanel(startPt, rayDir, hitDist, st);
          if (pvHit !== null && pvHit < hitDist) {
            hitDist = pvHit;
          }

          if (rayDir.y < -1e-4) {
            const tableHit = (0.003 - startPt.y) / rayDir.y;
            if (tableHit > 0.05 && tableHit < hitDist) {
              hitDist = tableHit;
            }
          }

          rawDists[i] = hitDist;
          startPtsX[i] = startPt.x;
          startPtsY[i] = startPt.y;
          startPtsZ[i] = startPt.z;
          rayDirsX[i] = rayDir.x;
          rayDirsY[i] = rayDir.y;
          rayDirsZ[i] = rayDir.z;
        }

        for (let i = 0; i <= radialSegments; i++) {
          const prevIdx = i === 0 ? radialSegments - 1 : i - 1;
          const nextIdx = i === radialSegments ? 1 : i + 1;
          let d = rawDists[i];
          const minNeighbor = Math.min(rawDists[prevIdx], rawDists[nextIdx]);
          // Nếu tia kề bên bị chặn bởi vật cản sáng (nhảy bậc chiều sâu > 0.16m), thu gọn biên chuyển tiếp
          // để vạt tam giác của chùm sáng KHÔNG đâm xuyên chéo ra vùng bóng tối phía sau vật cản!
          if (d - minNeighbor > 0.16) {
            d = minNeighbor;
          }

          const sx = startPtsX[i];
          const sy = startPtsY[i];
          const sz = startPtsZ[i];
          const ex = sx + rayDirsX[i] * d;
          const ey = sy + rayDirsY[i] * d;
          const ez = sz + rayDirsZ[i] * d;

          posAttr.setXYZ(i, sx, sy, sz);
          posAttr.setXYZ(radialSegments + 1 + i, ex, ey, ez);

          // Độ sáng và màu suy giảm đồng đều theo khoảng cách thực d (giúp chùm sáng đều màu từ đèn tới vật cản)
          const tDist = THREE.MathUtils.clamp(d / 3.8, 0, 1);
          const atten = THREE.MathUtils.clamp(1.0 - tDist * 0.36, 0.58, 1.0);
          colAttr.setXYZ(i, cTop.r, cTop.g, cTop.b);
          colAttr.setXYZ(
            radialSegments + 1 + i,
             THREE.MathUtils.lerp(cTop.r, cFar.r, tDist) * atten,
            THREE.MathUtils.lerp(cTop.g, cFar.g, tDist) * atten,
            THREE.MathUtils.lerp(cTop.b, cFar.b, tDist) * atten,
          );
        }

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
      };

      if (showCone) {
        updateVolumetricShell(dynamicConeGeo, 1.0, tanOuter, 0xfffbeb, 0xfbbf24);
        updateVolumetricShell(midConeGeo, 0.76, tanMid, 0xfffef2, 0xfde047);
        updateVolumetricShell(coreConeGeo, 0.48, tanInner, 0xffffff, 0xfef08a);

        // Độ sáng chùm nón tỉ lệ trực tiếp với lampIntensity (0% -> 100%, 0% = 0)
        coneMat.opacity =
          st.lampIntensity * (st.darkLabVisualMode ? 0.165 : 0.11);
        midConeMat.opacity =
          st.lampIntensity * (st.darkLabVisualMode ? 0.15 : 0.097);
        coreConeMat.opacity =
          st.lampIntensity * (st.darkLabVisualMode ? 0.19 : 0.125);
      }

      // Cập nhật Hạt bụi lơ lửng (Tyndall Dust Particles) dọc theo luồng sáng khi ở Chế độ Thí nghiệm Tối
      const showBeamDust = hasLampLight && st.darkLabVisualMode;
      beamDustGroup.visible = showBeamDust;
      if (showBeamDust) {
        dustElapsedTime += dt;
        const maxDustDistance = 3.35;

        const updateDustLayer = (layer: ReturnType<typeof createBeamDustLayer>, brightnessScale: number) => {
          const posAttr = layer.geo.getAttribute('position') as THREE.BufferAttribute;
          const colAttr = layer.geo.getAttribute('color') as THREE.BufferAttribute;

          for (let i = 0; i < layer.count; i++) {
            const sd = layer.seeds[i];
            // Trôi chậm dọc theo luồng không khí kết hợp chuyển động lơ lửng 3 chiều (Brownian / đối lưu nhẹ)
            let u = (sd.uAxial + dustElapsedTime * sd.axialDriftSpeed) % 0.96;
            if (u < 0) u += 0.96;
            u += 0.02;

            const swirlA = Math.sin(dustElapsedTime * sd.swirlSpeed + sd.phaseX) * 0.22;
            const swirlR = Math.cos(dustElapsedTime * (sd.swirlSpeed * 0.84) + sd.phaseY) * 0.075;
            const swirlZ = Math.sin(dustElapsedTime * (sd.swirlSpeed * 0.92) + sd.phaseZ) * 0.04;

            const ang = sd.theta + swirlA;
            const cosA = Math.cos(ang);
            const sinA = Math.sin(ang);
            const rFrac = THREE.MathUtils.clamp(sd.rNorm + swirlR, 0.02, 0.98);
            const distAlong = Math.max(0.05, u * maxDustDistance + swirlZ);

            // Điểm xuất phát trên cửa đèn và hướng tia chứa hạt bụi
            const rAp = apertureRadius * rFrac;
            const startPt = {
              x: nozzleOrigin.x + (lampTf.right.x * cosA + lampTf.up.x * sinA) * rAp,
              y: nozzleOrigin.y + (lampTf.right.y * cosA + lampTf.up.y * sinA) * rAp,
              z: nozzleOrigin.z + (lampTf.right.z * cosA + lampTf.up.z * sinA) * rAp,
            };

            const spread = tanOuter * rFrac;
            const rawDx = lampTf.direction.x + (lampTf.right.x * cosA + lampTf.up.x * sinA) * spread;
            const rawDy = lampTf.direction.y + (lampTf.right.y * cosA + lampTf.up.y * sinA) * spread;
            const rawDz = lampTf.direction.z + (lampTf.right.z * cosA + lampTf.up.z * sinA) * spread;
            const invLen = 1 / Math.max(1e-5, Math.hypot(rawDx, rawDy, rawDz));
            const rayDir = {
              x: rawDx * invLen,
              y: rawDy * invLen,
              z: rawDz * invLen,
            };

            // Kiểm tra vật cản sáng, tấm pin và mặt bàn: hạt bụi nằm trong vùng tối phía sau vật cản sẽ KHÔNG được chiếu sáng
            let clipDist = maxDustDistance + 0.2;
            const occHit = intersectRayWithOccluder(startPt, rayDir, clipDist, st);
            if (occHit !== null && occHit < clipDist) {
              clipDist = occHit;
            }
            const pvHit = intersectRayWithPVPanel(startPt, rayDir, clipDist, st);
            if (pvHit !== null && pvHit < clipDist) {
              clipDist = pvHit;
            }
            if (rayDir.y < -1e-4) {
              const tableHit = (0.015 - startPt.y) / rayDir.y;
              if (tableHit > 0.04 && tableHit < clipDist) {
                clipDist = tableHit;
              }
            }

            // Tọa độ thực trong không gian 3D của hạt bụi (thêm dao động nổi nhẹ theo phương thẳng đứng)
            const floatY = Math.sin(dustElapsedTime * (sd.swirlSpeed * 1.15) + sd.phaseY) * 0.018;
            const px = startPt.x + rayDir.x * distAlong;
            const py = startPt.y + rayDir.y * distAlong + floatY;
            const pz = startPt.z + rayDir.z * distAlong;

            posAttr.setXYZ(i, px, py, pz);

            if (distAlong >= clipDist - 0.02 || py < 0.018) {
              // Nằm trong vùng tối (Umbra) phía sau Vật cản sáng / Tấm pin hoặc dưới mặt bàn -> tắt sáng hạt bụi
              colAttr.setXYZ(i, 0, 0, 0);
            } else {
              // Hạt bụi đang lơ lửng trong luồng sáng -> tán xạ Tyndall lấp lánh dịu mắt
              const nearFade = THREE.MathUtils.smoothstep(distAlong, 0.04, 0.22);
              const farFade = 1 - THREE.MathUtils.smoothstep(distAlong, maxDustDistance * 0.68, maxDustDistance);
              const edgeFade = 1 - THREE.MathUtils.smoothstep(rFrac, 0.45, 0.98) * 0.65;
              const twinkle =
                0.55 + 0.45 * Math.sin(dustElapsedTime * sd.twinkleFreq + sd.twinklePhase);
              const lum =
                nearFade *
                farFade *
                edgeFade *
                twinkle *
                st.lampIntensity *
                brightnessScale;

              // Màu vàng nắng ấm pha trắng ngà ở lõi chùm sáng
              const rCol = lum * 1.0;
              const gCol = lum * THREE.MathUtils.lerp(0.97, 0.86, sd.warmth);
              const bCol = lum * THREE.MathUtils.lerp(0.84, 0.45, sd.warmth);
              colAttr.setXYZ(i, rCol, gCol, bCol);
            }
          }

          posAttr.needsUpdate = true;
          colAttr.needsUpdate = true;
        };

        updateDustLayer(dustFineLayer, 0.95);
        updateDustLayer(dustBokehLayer, 0.62);
      }

      // Cập nhật Khối Vùng Tối 3D (3D Umbra Shadow Frustum) phía sau Vật cản sáng khi đèn phát sáng (> 0%)
      if (hasLampLight && st.occluderActive) {
        const toOcc = vecSub(occTf.center, lampTf.position);
        const distToOcc = vecLen(toOcc);
        const dirToOcc = vecScale(toOcc, 1 / Math.max(1e-4, distToOcc));
        const cosOccInBeam =
          dirToOcc.x * lampTf.direction.x +
          dirToOcc.y * lampTf.direction.y +
          dirToOcc.z * lampTf.direction.z;
        const beamEdgeCos = Math.cos(
          THREE.MathUtils.degToRad(SCENE_GEOMETRY.beamOuterHalfAngleDeg * 1.45),
        );

        if (cosOccInBeam > beamEdgeCos && distToOcc > 0.18) {
          umbraVolumeMesh.visible = true;
          const uPosAttr = umbraVolumeGeo.getAttribute('position') as THREE.BufferAttribute;
          const halfW = SCENE_GEOMETRY.occluderWidth * 0.49;
          const halfH = SCENE_GEOMETRY.occluderHeight * 0.49;
          // Hướng pháp tuyến mặt lưng tấm chắn (cùng chiều tia sáng đi ra phía sau tấm chắn)
          const dotNorm =
            occTf.normal.x * dirToOcc.x +
            occTf.normal.y * dirToOcc.y +
            occTf.normal.z * dirToOcc.z;
          const backOffsetSign = dotNorm >= 0 ? 1 : -1;
          const backFaceCenter = vecAdd(
            occTf.center,
            vecScale(occTf.normal, backOffsetSign * 0.016),
          );

          let backAccumX = 0;
          let backAccumY = 0;
          let backAccumZ = 0;

          for (let i = 0; i <= shadowVolumeSegs; i++) {
            const u = i / shadowVolumeSegs;
            // Tham số hóa chu vi hình chữ nhật tấm chắn sáng (4 cạnh mượt)
            const angle = u * Math.PI * 2;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const maxAbs = Math.max(Math.abs(cosA), Math.abs(sinA), 1e-4);
            const localX = (cosA / maxAbs) * halfW;
            const localY = (sinA / maxAbs) * halfH;

            const pFront = vecAdd(
              backFaceCenter,
              vecAdd(
                vecScale(occTf.right, localX),
                vecScale(occTf.up, localY),
              ),
            );

            // Hướng tia bóng tối từ tâm đèn chiếu qua điểm biên P_i trên tấm chắn
            const sVec = vecSub(pFront, lampTf.position);
            const sLen = Math.max(1e-4, vecLen(sVec));
            const sDir = vecScale(sVec, 1 / sLen);

            let shadowReach = 1.95;
            const pvHit = intersectRayWithPVPanel(pFront, sDir, shadowReach, st);
            if (pvHit !== null && pvHit > 0.01 && pvHit < shadowReach) {
              shadowReach = pvHit;
            }
            if (sDir.y < -1e-4) {
              const tableHit = (0.0045 - pFront.y) / sDir.y;
              if (tableHit > 0.01 && tableHit < shadowReach) {
                shadowReach = tableHit;
              }
            }

            const pBack = vecAdd(pFront, vecScale(sDir, shadowReach));
            uPosAttr.setXYZ(i, pFront.x, pFront.y, pFront.z);
            uPosAttr.setXYZ(shadowVolumeSegs + 1 + i, pBack.x, pBack.y, pBack.z);

            backAccumX += pBack.x;
            backAccumY += pBack.y;
            backAccumZ += pBack.z;
          }

          const frontCenterIdx = (shadowVolumeSegs + 1) * 2;
          const backCenterIdx = frontCenterIdx + 1;
          const invSegs = 1 / (shadowVolumeSegs + 1);
          uPosAttr.setXYZ(frontCenterIdx, backFaceCenter.x, backFaceCenter.y, backFaceCenter.z);
          uPosAttr.setXYZ(
            backCenterIdx,
            backAccumX * invSegs,
            backAccumY * invSegs,
            backAccumZ * invSegs,
          );
          uPosAttr.needsUpdate = true;

          const inBeamFactor = THREE.MathUtils.clamp(
            (cosOccInBeam - beamEdgeCos) / (1 - beamEdgeCos),
            0,
            1,
          );
          umbraVolumeMat.opacity =
            inBeamFactor *
            st.lampIntensity *
            (st.darkLabVisualMode ? 0.56 : 0.44);
        } else {
          umbraVolumeMesh.visible = false;
        }
      } else {
        umbraVolumeMesh.visible = false;
      }

      if (showRays) {
        for (const rItem of rayMeshes) {
          const polarRad = THREE.MathUtils.degToRad(rItem.polarDeg);
          const azimRad = THREE.MathUtils.degToRad(rItem.azimuthDeg);
          const sinPol = Math.sin(polarRad);
          const cosPol = Math.cos(polarRad);
          const cosAz = Math.cos(azimRad);
          const sinAz = Math.sin(azimRad);

          const startOffsetR = (rItem.polarDeg / 22) * 0.115;
          const startPt = vecAdd(
            nozzleOrigin,
            vecAdd(
              vecScale(lampTf.right, cosAz * startOffsetR),
              vecScale(lampTf.up, sinAz * startOffsetR),
            ),
          );

          const rayDir = vecAdd(
            vecScale(lampTf.direction, cosPol),
            vecAdd(
              vecScale(lampTf.right, sinPol * cosAz),
              vecScale(lampTf.up, sinPol * sinAz),
            ),
          );

          let hitDist = maxBeamReach;
          let hitSurface: 'none' | 'occluder' | 'pv' | 'table' = 'none';

          const occHit = intersectRayWithOccluder(startPt, rayDir, hitDist, st);
          if (occHit !== null && occHit < hitDist) {
            hitDist = occHit;
            hitSurface = 'occluder';
          }

          const pvHit = intersectRayWithPVPanel(startPt, rayDir, hitDist, st);
          if (pvHit !== null && pvHit < hitDist) {
            hitDist = pvHit;
            hitSurface = 'pv';
          }

          if (rayDir.y < -1e-4) {
            const tableHit = (0.003 - startPt.y) / rayDir.y;
            if (tableHit > 0.05 && tableHit < hitDist) {
              hitDist = tableHit;
              hitSurface = 'table';
            }
          }

          const endPt = vecAdd(startPt, vecScale(rayDir, hitDist));
          rItem.shaft.position.set(startPt.x, startPt.y, startPt.z);
          rItem.shaft.scale.set(1, 1, Math.max(0.08, hitDist - 0.04));
          _vec3A.set(endPt.x, endPt.y, endPt.z);
          rItem.shaft.lookAt(_vec3A);

          rItem.tip.position.set(
            endPt.x - rayDir.x * 0.032,
            endPt.y - rayDir.y * 0.032,
            endPt.z - rayDir.z * 0.032,
          );
          _vec3B.set(endPt.x + rayDir.x, endPt.y + rayDir.y, endPt.z + rayDir.z);
          rItem.tip.lookAt(_vec3B);

          const blocked = hitSurface === 'occluder';
          rItem.shaft.material = blocked ? rayMatBlocked : rayMatFree;
          rItem.tip.material = blocked ? rayMatBlocked : rayMatFree;

          // Đốm sáng tại đúng điểm tia sáng chạm vào mặt bàn gỗ, tấm pin hoặc vật cản
          if (hitSurface === 'table' && Math.abs(endPt.x) < 3.32 && Math.abs(endPt.z) < 1.68) {
            rItem.hitSpot.visible = true;
            rItem.hitSpot.position.set(endPt.x, 0.004, endPt.z);
            rItem.hitSpot.rotation.set(-Math.PI / 2, 0, 0);
            rItem.hitSpot.scale.set(1.35, 0.95, 1);
          } else if (hitSurface === 'pv') {
            rItem.hitSpot.visible = true;
            rItem.hitSpot.position.set(
              endPt.x + pvBasis.normal.x * 0.005,
              endPt.y + pvBasis.normal.y * 0.005,
              endPt.z + pvBasis.normal.z * 0.005,
            );
            _vec3C.set(
              rItem.hitSpot.position.x + pvBasis.normal.x,
              rItem.hitSpot.position.y + pvBasis.normal.y,
              rItem.hitSpot.position.z + pvBasis.normal.z,
            );
            rItem.hitSpot.lookAt(_vec3C);
            rItem.hitSpot.scale.set(0.85, 0.85, 1);
          } else if (hitSurface === 'occluder') {
            rItem.hitSpot.visible = true;
            rItem.hitSpot.position.set(
              endPt.x - rayDir.x * 0.005,
              endPt.y - rayDir.y * 0.005,
              endPt.z - rayDir.z * 0.005,
            );
            _vec3C.set(
              rItem.hitSpot.position.x - occTf.normal.x,
              rItem.hitSpot.position.y - occTf.normal.y,
              rItem.hitSpot.position.z - occTf.normal.z,
            );
            rItem.hitSpot.lookAt(_vec3C);
            rItem.hitSpot.scale.set(0.75, 0.75, 1);
          } else {
            rItem.hitSpot.visible = false;
          }
        }
      }

      // Cập nhật Lưới Ánh Sáng Đều & Bóng Tối Đổ Dài Phía Sau Vật Cản / Tấm Pin Trên Mặt Bàn Gỗ
      if (hasLampLight) {
        tableLightPoolMesh.visible = true;
        tableShadowGridMesh.visible = true;

        const lightColAttr = tableLightGridGeo.getAttribute('color') as THREE.BufferAttribute;
        const shadColAttr = tableShadowGridGeo.getAttribute('color') as THREE.BufferAttribute;
        const posAttr = tableLightGridGeo.getAttribute('position') as THREE.BufferAttribute;

        const coneOuterCos = Math.cos(
          THREE.MathUtils.degToRad(SCENE_GEOMETRY.beamOuterHalfAngleDeg * 1.28),
        );
        const coneFlatCos = Math.cos(
          THREE.MathUtils.degToRad(SCENE_GEOMETRY.beamCoreHalfAngleDeg * 1.05),
        );
        const srcR = SCENE_GEOMETRY.sourceEmitterRadius;

        // 5 điểm lấy mẫu trên cửa phát sáng đèn (tâm + 4 mép) để tính bóng tối (Umbra) và bóng nửa tối (Penumbra) trên mặt bàn
        const emitOffsets: [number, number][] = [
          [0, 0],
          [srcR, 0],
          [-srcR, 0],
          [0, srcR],
          [0, -srcR],
        ];

        const numVerts = (tableGridCols + 1) * (tableGridRows + 1);
        for (let idx = 0; idx < numVerts; idx++) {
          const vx = posAttr.getX(idx);
          const vz = posAttr.getZ(idx);

          const dx0 = vx - lampTf.position.x;
          const dy0 = 0.0035 - lampTf.position.y;
          const dz0 = vz - lampTf.position.z;
          const dist0 = Math.hypot(dx0, dy0, dz0);
          const invD0 = 1 / Math.max(1e-4, dist0);
          const dirX0 = dx0 * invD0;
          const dirY0 = dy0 * invD0;
          const dirZ0 = dz0 * invD0;

          const cosAng =
            dirX0 * lampTf.direction.x +
            dirY0 * lampTf.direction.y +
            dirZ0 * lampTf.direction.z;

          if (cosAng <= coneOuterCos) {
            lightColAttr.setXYZ(idx, 0, 0, 0);
            shadColAttr.setXYZW(idx, 0, 0, 0, 0);
            continue;
          }

          const tCone = THREE.MathUtils.clamp(
            (cosAng - coneOuterCos) / Math.max(1e-4, coneFlatCos - coneOuterCos),
            0,
            1,
          );
          const smoothCone = tCone * tCone * (3 - 2 * tCone);
          const distAtten = THREE.MathUtils.clamp(
            1.25 / (0.65 + 0.14 * dist0 * dist0),
            0.22,
            1.0,
          );

          // Kiểm tra che khuất bởi Vật cản sáng và Tấm pin quang điện cho 5 điểm cửa đèn
          let blockedCount = 0;
          for (let k = 0; k < 5; k++) {
            const [ou, ov] = emitOffsets[k];
            const sx =
              lampTf.position.x + lampTf.right.x * ou + lampTf.up.x * ov;
            const sy =
              lampTf.position.y + lampTf.right.y * ou + lampTf.up.y * ov;
            const sz =
              lampTf.position.z + lampTf.right.z * ou + lampTf.up.z * ov;

            const rdx = vx - sx;
            const rdy = 0.0035 - sy;
            const rdz = vz - sz;
            const rLen = Math.hypot(rdx, rdy, rdz);
            const invRLen = 1 / Math.max(1e-4, rLen);
            const rayStart = { x: sx, y: sy, z: sz };
            const rayDir = {
              x: rdx * invRLen,
              y: rdy * invRLen,
              z: rdz * invRLen,
            };

            let isBlocked = false;
            if (st.occluderActive) {
              const occHit = intersectRayWithOccluder(
                rayStart,
                rayDir,
                rLen - 0.02,
                st,
              );
              if (occHit !== null && occHit > 0.04 && occHit < rLen - 0.02) {
                isBlocked = true;
              }
            }
            if (!isBlocked) {
              const pvHit = intersectRayWithPVPanel(
                rayStart,
                rayDir,
                rLen - 0.02,
                st,
              );
              if (pvHit !== null && pvHit > 0.04 && pvHit < rLen - 0.02) {
                isBlocked = true;
              }
            }
            if (isBlocked) {
              blockedCount++;
            }
          }

          const blockedRatio = blockedCount / 5;
          const visibleRatio = 1 - blockedRatio;

          // 1. Vùng sáng trên mặt bàn: giảm độ sáng xuống mức dịu nhẹ, đều đặn ở nơi không bị chắn
          const litStrength =
            smoothCone *
            distAtten *
            visibleRatio *
            st.lampIntensity *
            (st.darkLabVisualMode ? 0.52 : 0.38);
          lightColAttr.setXYZ(
            idx,
            litStrength * 1.0,
            litStrength * 0.89,
            litStrength * 0.42,
          );

          // 2. Bóng tối phía sau Vật cản sáng / Tấm pin trên mặt bàn: vùng tối (Umbra) đậm rõ nét + viền nửa tối (Penumbra)
          if (blockedRatio > 0.01) {
            const shadowAlpha =
              blockedRatio *
              smoothCone *
              THREE.MathUtils.clamp(0.45 + st.lampIntensity * 0.55, 0.45, 1.0) *
              (st.darkLabVisualMode ? 0.88 : 0.78);
            shadColAttr.setXYZW(idx, 0.01, 0.02, 0.05, shadowAlpha);
          } else {
            shadColAttr.setXYZW(idx, 0, 0, 0, 0);
          }
        }

        lightColAttr.needsUpdate = true;
        shadColAttr.needsUpdate = true;
        tableLightGridMat.opacity = st.darkLabVisualMode ? 0.28 : 0.19;
      } else {
        tableLightPoolMesh.visible = false;
        tableShadowGridMesh.visible = false;
      }

      // 6. Đồng bộ Khóa mạch & Dây nối mềm trên mặt bàn
      const targetKnifeAngle = st.circuitClosed ? 0 : 0.72;
      knifeAngleRad = THREE.MathUtils.damp(knifeAngleRad, targetKnifeAngle, 14, dt);
      knifeBladePivot.rotation.z = knifeAngleRad;

      rebuildWiresIfNeeded(st);

      // 7. Đồng bộ Lớp hạt tải điện khái niệm
      const showCarriers =
        st.showChargeFlowConceptual &&
        st.circuitClosed &&
        Math.abs(phys.circuit.normalizedCurrent) > 0.015;
      carrierInstanced.visible = showCarriers;

      if (showCarriers && curvePosA && curvePosB && curveNeg) {
        carrierPhase = (carrierPhase + dt * phys.circuit.normalizedCurrent * 0.85) % 1;
        if (carrierPhase < 0) carrierPhase += 1;

        for (let i = 0; i < carrierCount; i++) {
          const uTotal = (i / carrierCount + carrierPhase) % 1;
          let pt: THREE.Vector3;
          if (uTotal < 0.28) {
            pt = curvePosA.getPointAt(uTotal / 0.28);
          } else if (uTotal < 0.58) {
            pt = curvePosB.getPointAt((uTotal - 0.28) / 0.30);
          } else {
            pt = curveNeg.getPointAt((uTotal - 0.58) / 0.42);
          }
          _mat4.makeTranslation(pt.x, pt.y, pt.z);
          carrierInstanced.setMatrixAt(i, _mat4);
        }
        carrierInstanced.instanceMatrix.needsUpdate = true;
      }

      // 8. Đồng bộ Kim Điện Kế
      const currentNeedleDeg = needleDynamics.step(phys.galvanometer.targetAngleDeg, dt);
      needlePivotGroup.rotation.z = THREE.MathUtils.degToRad(-currentNeedleDeg);

      // 8B. Xử lý điều khiển bàn phím 60fps mượt mà (WASD / Phím mũi tên / Q-E / R-F) khi đang chơi
      gameElapsedTime += dt;
      if (gamePhaseRef.current === 'playing' && !activeDrag && heldKeys.size > 0) {
        const selObj = selectedObjectRef.current;
        let moveX = 0;
        let moveZ = 0;
        if (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft')) moveX -= 1;
        if (heldKeys.has('KeyD') || heldKeys.has('ArrowRight')) moveX += 1;
        if (heldKeys.has('KeyW') || heldKeys.has('ArrowUp')) moveZ -= 1;
        if (heldKeys.has('KeyS') || heldKeys.has('ArrowDown')) moveZ += 1;

        const patch: Partial<ExperimentState> = {};
        let hasPatch = false;

        if (moveX !== 0 || moveZ !== 0) {
          const norm = 1 / Math.hypot(moveX, moveZ);
          const speed = 1.45 * dt;
          const curXZ = getObjectXZ(st, selObj);
          const rawPos = {
            x: curXZ.x + moveX * norm * speed,
            z: curXZ.z + moveZ * norm * speed,
          };
          const resolved = resolveTableCollision(selObj, rawPos, st);

          if (selObj === 'lamp') {
            const newDist = vecLen(
              vecSub(
                { x: st.pvPos.x, y: SCENE_GEOMETRY.pvCenterY, z: st.pvPos.z },
                { x: resolved.x, y: st.lampHeight, z: resolved.z },
              ),
            );
            patch.lampPos = resolved;
            patch.lampDistance = Number(
              clamp(newDist, SCENE_GEOMETRY.minDistance, SCENE_GEOMETRY.maxDistance).toFixed(2),
            );
            hasPatch = true;
          } else if (selObj === 'pv') {
            const newDist = vecLen(
              vecSub(
                { x: resolved.x, y: SCENE_GEOMETRY.pvCenterY, z: resolved.z },
                { x: st.lampPos.x, y: st.lampHeight, z: st.lampPos.z },
              ),
            );
            patch.pvPos = resolved;
            patch.lampDistance = Number(
              clamp(newDist, SCENE_GEOMETRY.minDistance, SCENE_GEOMETRY.maxDistance).toFixed(2),
            );
            hasPatch = true;
          } else if (selObj === 'occluder') {
            patch.occluderActive = true;
            patch.occluderPos = resolved;
            patch.occluderInsertion = 1.0;
            hasPatch = true;
          } else if (selObj === 'switch') {
            patch.switchPos = resolved;
            hasPatch = true;
          } else if (selObj === 'galvano') {
            patch.galvanoPos = resolved;
            hasPatch = true;
          }
        }

        // Q / E: Xoay góc ngang (Yaw) của thiết bị đang chọn
        let rotDir = 0;
        if (heldKeys.has('KeyQ')) rotDir -= 1;
        if (heldKeys.has('KeyE')) rotDir += 1;
        if (rotDir !== 0) {
          const degDelta = rotDir * 68 * dt;
          if (selObj === 'lamp') {
            patch.lampYawDeg = Number(clamp(st.lampYawDeg + degDelta, -75, 75).toFixed(1));
            hasPatch = true;
          } else if (selObj === 'pv') {
            patch.pvYawDeg = Number(clamp(st.pvYawDeg + degDelta, -85, 85).toFixed(1));
            hasPatch = true;
          } else if (selObj === 'occluder') {
            patch.occluderYawDeg = Number(clamp(st.occluderYawDeg + degDelta, -75, 75).toFixed(1));
            hasPatch = true;
          }
        }

        // R / F: Tăng/giảm độ sáng đèn (0% -> 100%)
        let brightDir = 0;
        if (heldKeys.has('KeyR')) brightDir += 1;
        if (heldKeys.has('KeyF')) brightDir -= 1;
        if (brightDir !== 0) {
          const nextInt = Number(clamp(st.lampIntensity + brightDir * 0.55 * dt, 0, 1).toFixed(3));
          patch.lampIntensity = nextInt;
          patch.lampOn = nextInt > 0.001 ? true : st.lampOn;
          hasPatch = true;
        }

        if (hasPatch) {
          onUpdateStateRef.current(patch);
        }
      }

      // 8C. Cập nhật vòng tâm ngắm 3D & Mũi tên Beacon trên thiết bị đang chọn + hiệu ứng nhún (Squash-and-stretch)
      const activeKey = selectedObjectRef.current;
      const activeXZ = getObjectXZ(st, activeKey);
      activeSelectionGroup.visible = gamePhaseRef.current === 'playing';
      if (activeSelectionGroup.visible) {
        const selX = activeKey === 'lamp' ? standX : activeXZ.x;
        const selZ = activeKey === 'lamp' ? standZ : activeXZ.z;
        activeSelectionGroup.position.set(selX, 0, selZ);
        activeOuterRing.rotation.z = gameElapsedTime * 1.1;
        activeInnerRing.rotation.z = -gameElapsedTime * 1.6;
        const ringPulse = 1 + Math.sin(gameElapsedTime * 5.2) * 0.05;
        activeOuterRing.scale.set(ringPulse, ringPulse, 1);

        const beaconBaseY =
          activeKey === 'lamp'
            ? lampTf.position.y + 0.34
            : activeKey === 'pv'
              ? pvBasis.center.y + 0.42
              : activeKey === 'occluder'
                ? 1.42
                : activeKey === 'galvano'
                  ? 1.24
                  : 0.32;
        activeBeaconCone.position.y = beaconBaseY + Math.sin(gameElapsedTime * 5.5) * 0.045;
        activeBeaconCone.rotation.y = gameElapsedTime * 2.4;
      }

      if (bounceTimer > 0) {
        bounceTimer = Math.max(0, bounceTimer - dt);
        const s = 1 + Math.sin((bounceTimer / 0.18) * Math.PI) * 0.08;
        lampStandGroup.scale.set(
          bounceTargetKey === 'lamp' ? s : 1,
          1,
          bounceTargetKey === 'lamp' ? s : 1,
        );
        pvStandGroup.scale.set(
          bounceTargetKey === 'pv' ? s : 1,
          1,
          bounceTargetKey === 'pv' ? s : 1,
        );
        occluderStandGroup.scale.set(
          bounceTargetKey === 'occluder' ? s : 1,
          1,
          bounceTargetKey === 'occluder' ? s : 1,
        );
        switchGroup.scale.set(
          bounceTargetKey === 'switch' ? s : 1,
          1,
          bounceTargetKey === 'switch' ? s : 1,
        );
        galvanoGroup.scale.set(
          bounceTargetKey === 'galvano' ? s : 1,
          1,
          bounceTargetKey === 'galvano' ? s : 1,
        );
      } else {
        lampStandGroup.scale.set(1, 1, 1);
        pvStandGroup.scale.set(1, 1, 1);
        occluderStandGroup.scale.set(1, 1, 1);
        switchGroup.scale.set(1, 1, 1);
        galvanoGroup.scale.set(1, 1, 1);
      }

      // 8D. Kích hoạt & cập nhật hạt pháo sáng 3D khi hoàn thành Nhiệm vụ
      if (celebrationTriggerRef.current !== lastCelebrationId) {
        lastCelebrationId = celebrationTriggerRef.current;
        burstTimer = 1.35;
        cameraShakeTimer = 0.28;
        celebrationPoints.visible = true;
        burstMat.opacity = 1;
        const bPos = burstGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < burstCount; i++) {
          const originX = i % 2 === 0 ? pvBasis.center.x : st.galvanoPos.x;
          const originY = i % 2 === 0 ? pvBasis.center.y : 0.78;
          const originZ = i % 2 === 0 ? pvBasis.center.z : st.galvanoPos.z;
          bPos.setXYZ(i, originX, originY, originZ);
          const theta = (i / burstCount) * Math.PI * 2 + (i % 5) * 0.3;
          const speedH = 0.45 + (i % 7) * 0.16;
          burstVelocities[i].vx = Math.cos(theta) * speedH;
          burstVelocities[i].vy = 1.15 + (i % 5) * 0.28;
          burstVelocities[i].vz = Math.sin(theta) * speedH;
        }
        bPos.needsUpdate = true;
      }

      if (burstTimer > 0) {
        burstTimer = Math.max(0, burstTimer - dt);
        const bPos = burstGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < burstCount; i++) {
          const vx = burstVelocities[i].vx;
          const vy = burstVelocities[i].vy;
          const vz = burstVelocities[i].vz;
          burstVelocities[i].vy -= 2.4 * dt;
          bPos.setXYZ(
            i,
            bPos.getX(i) + vx * dt,
            Math.max(0.03, bPos.getY(i) + vy * dt),
            bPos.getZ(i) + vz * dt,
          );
        }
        bPos.needsUpdate = true;
        burstMat.opacity = THREE.MathUtils.clamp(burstTimer / 0.85, 0, 1);
        if (burstTimer <= 0) {
          celebrationPoints.visible = false;
        }
      }

      // 9. Chuyển góc nhìn Camera mượt hoặc quay toàn cảnh trên Màn hình Mở đầu (Title Screen Live Camera Pan)
      if (gamePhaseRef.current === 'title') {
        titleOrbitAngle += dt * 0.22;
        const radius = 4.15;
        camera.position.x = Math.sin(titleOrbitAngle) * radius * 0.55;
        camera.position.y = 2.28 + Math.sin(titleOrbitAngle * 0.7) * 0.18;
        camera.position.z = Math.cos(titleOrbitAngle) * 0.65 + 3.45;
        controls.target.set(-0.08, 0.74, -0.05);
      } else if (cameraAnimatingRef.current) {
        const preset = CAMERA_PRESETS[activeCameraPresetRef.current];
        const dampLambda = 7.5;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, preset.pos[0], dampLambda, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, preset.pos[1], dampLambda, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, preset.pos[2], dampLambda, dt);

        controls.target.x = THREE.MathUtils.damp(
          controls.target.x,
          preset.target[0],
          dampLambda,
          dt,
        );
        controls.target.y = THREE.MathUtils.damp(
          controls.target.y,
          preset.target[1],
          dampLambda,
          dt,
        );
        controls.target.z = THREE.MathUtils.damp(
          controls.target.z,
          preset.target[2],
          dampLambda,
          dt,
        );

        const distErr =
          Math.abs(camera.position.x - preset.pos[0]) +
          Math.abs(camera.position.y - preset.pos[1]) +
          Math.abs(camera.position.z - preset.pos[2]);
        if (distErr < 0.015) {
          cameraAnimatingRef.current = false;
        }
      }

      if (cameraShakeTimer > 0) {
        cameraShakeTimer = Math.max(0, cameraShakeTimer - dt);
        const mag = cameraShakeTimer * 0.032;
        camera.position.x += Math.sin(gameElapsedTime * 48) * mag;
        camera.position.y += Math.cos(gameElapsedTime * 54) * mag;
      }

      controls.update();

      // 10. Chiếu nhãn 2D sắc nét đặt phía sau / phía trên vật thể để KHÔNG che khuất nút bấm & thiết bị
      if (st.showLabels && gamePhaseRef.current !== 'title') {
        const w = renderer.domElement.clientWidth;
        const h = renderer.domElement.clientHeight;
        const projectPoint = (x: number, y: number, z: number) => {
          _vec3A.set(x, y, z).project(camera);
          return {
            x: (_vec3A.x * 0.5 + 0.5) * w,
            y: (-(_vec3A.y * 0.5) + 0.5) * h,
            visible:
              _vec3A.z < 1.0 &&
              _vec3A.x > -0.95 &&
              _vec3A.x < 0.95 &&
              _vec3A.y > -0.92 &&
              _vec3A.y < 0.92,
          };
        };

        // Đặt các điểm neo nhãn lùi ra phía sau (-Z) và cao hơn vật thể để không đè lên chi tiết 3D
        const pLamp = projectPoint(
          lampTf.position.x - 0.12,
          lampTf.position.y + 0.42,
          lampTf.position.z - 0.18,
        );
        // Đặt nhãn nút nguồn nằm ngang bên trái nút nhấn, nhích lên một chút nhỏ và tách rời hoàn toàn khỏi trụ đứng của đèn
        const pLampSwitch = projectPoint(standX - 0.25, 0.165, standZ + 0.21);
        const pPv = projectPoint(
          pvBasis.center.x,
          pvBasis.center.y + 0.48,
          pvBasis.center.z - 0.14,
        );
        const pGalv = projectPoint(st.galvanoPos.x, 1.32, st.galvanoPos.z - 0.16);
        const pSwitch = projectPoint(st.switchPos.x, 0.28, st.switchPos.z - 0.18);

        const umbraPct = Math.round(phys.illumination.umbraFractionOnPV * 100);
        const penumbraPct = Math.round(phys.illumination.penumbraFractionOnPV * 100);

        const nextLabels: ProjectedLabel[] = [
          {
            id: 'lamp',
            title:
              selectedObjectRef.current === 'lamp'
                ? '[1] Đèn chiếu · ĐANG ĐIỀU KHIỂN'
                : '[1] Đèn chiếu',
            subtitle: hasLampLight
              ? `Đang bật (${Math.round(st.lampIntensity * 100)}%)`
              : st.lampOn
                ? 'Độ sáng 0% (Không có ánh sáng)'
                : 'Đang tắt',
            x: pLamp.x,
            y: pLamp.y,
            visible: pLamp.visible,
            tone: hasLampLight ? 'amber' : 'default',
            onClick: () => {
              onSelectObjectRef.current?.('lamp');
              gameAudio.playSelectSound();
            },
          },
          {
            id: 'lamp-power-btn',
            title: hasLampLight ? 'BẬT ĐÈN' : 'TẮT ĐÈN',
            x: pLampSwitch.x,
            y: pLampSwitch.y,
            visible: pLampSwitch.visible,
            tone: hasLampLight ? 'emerald' : 'rose',
            placement: 'left',
            compact: true,
            onClick: () => {
              const cur = stateRef.current;
              const nextOn = !cur.lampOn || cur.lampIntensity <= 0.001;
              gameAudio.playLampPowerSound(nextOn);
              bounceTargetKey = 'lamp';
              bounceTimer = 0.18;
              onUpdateStateRef.current({
                lampOn: nextOn,
                lampIntensity: nextOn && cur.lampIntensity <= 0.001 ? 0.8 : cur.lampIntensity,
              });
            },
          },
          {
            id: 'pv',
            title:
              selectedObjectRef.current === 'pv'
                ? '[3] Pin quang điện · ĐANG ĐIỀU KHIỂN'
                : '[3] Pin quang điện + Pháp tuyến n⃗',
            subtitle:
              st.occluderActive && (umbraPct > 0 || penumbraPct > 0)
                ? `Vùng tối: ${umbraPct}% · Nửa tối: ${penumbraPct}% · Sáng hữu hiệu: ${Math.round(Math.min(1, phys.illumination.effectiveIrradiance) * 100)}%`
                : `Ánh sáng hữu hiệu: ${Math.round(Math.min(1, phys.illumination.effectiveIrradiance) * 100)}% (Góc tới ${Math.round(phys.illumination.incidenceAngleDeg)}°)`,
            x: pPv.x,
            y: pPv.y,
            visible: pPv.visible,
            tone: phys.illumination.effectiveIrradiance > 0.02 ? 'emerald' : 'default',
            onClick: () => {
              onSelectObjectRef.current?.('pv');
              gameAudio.playSelectSound();
            },
          },
          {
            id: 'galvano',
            title:
              selectedObjectRef.current === 'galvano'
                ? '[5] Điện kế · ĐANG ĐIỀU KHIỂN'
                : '[5] Điện kế (Thang tương đối)',
            subtitle:
              Math.abs(phys.galvanometer.targetScaleDivision) >= 0.08
                ? `Kim lệch: ${phys.galvanometer.targetScaleDivision > 0 ? '+' : ''}${phys.galvanometer.targetScaleDivision.toFixed(1)} vạch`
                : 'Kim ở vạch 0',
            x: pGalv.x,
            y: pGalv.y,
            visible: pGalv.visible,
            tone: Math.abs(phys.galvanometer.targetScaleDivision) >= 0.08 ? 'emerald' : 'default',
            onClick: () => {
              onSelectObjectRef.current?.('galvano');
              gameAudio.playSelectSound();
            },
          },
          {
            id: 'switch',
            title: st.circuitClosed ? '[4] Khóa mạch: Kín' : '[4] Khóa mạch: Hở',
            subtitle: 'Nhấn chuột hoặc phím C để Đóng/Mở',
            x: pSwitch.x,
            y: pSwitch.y,
            visible: pSwitch.visible,
            tone: st.circuitClosed ? 'default' : 'rose',
            onClick: () => {
              const nextClosed = !stateRef.current.circuitClosed;
              gameAudio.playSwitchSound(nextClosed);
              bounceTargetKey = 'switch';
              bounceTimer = 0.18;
              onUpdateStateRef.current({ circuitClosed: nextClosed });
            },
          },
        ];

        if (st.occluderActive) {
          const pOcc = projectPoint(occTf.center.x, occTf.center.y + 0.58, occTf.center.z - 0.14);
          nextLabels.push({
            id: 'occluder',
            title:
              selectedObjectRef.current === 'occluder'
                ? '[2] Vật cản sáng · ĐANG ĐIỀU KHIỂN'
                : '[2] Vật cản sáng (WASD / Kéo)',
            subtitle:
              umbraPct > 0 || penumbraPct > 0
                ? `Tạo vùng tối (${umbraPct}%) & vùng nửa tối (${penumbraPct}%) trên mặt pin`
                : 'Đang nằm ngoài đường truyền tia sáng tới pin',
            x: pOcc.x,
            y: pOcc.y,
            visible: pOcc.visible,
            tone: 'rose',
            onClick: () => {
              onSelectObjectRef.current?.('occluder');
              gameAudio.playSelectSound();
            },
          });
        }

        setLabels(nextLabels);
      } else {
        setLabels((prev) => (prev.length > 0 ? [] : prev));
      }
    };

    function tick() {
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);

      updateSceneFromPhysics(dt);
      renderer.render(scene, camera);

      frameCount++;
      fpsAccumTime += rawDt;
      if (fpsAccumTime >= 1.0) {
        const currentFps = Math.round(frameCount / fpsAccumTime);
        onFpsReportRef.current?.(currentFps, isSoftwareGl);
        frameCount = 0;
        fpsAccumTime = 0;
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      domElem.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onGameKeyDown);
      window.removeEventListener('keyup', onGameKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      controls.removeEventListener('start', onControlsStart);
      controls.dispose();

      dialTexture.dispose();
      pvCellTexture.dispose();
      brushedSilverTexture.dispose();
      benchTexture.dispose();
      contactShadowTexture.dispose();
      beamHitGlowTexture.dispose();

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh || (obj as THREE.Points).isPoints) {
          const renderObj = obj as THREE.Mesh | THREE.Points;
          renderObj.geometry?.dispose();
          if (Array.isArray(renderObj.material)) {
            renderObj.material.forEach((m) => m.dispose());
          } else {
            renderObj.material?.dispose();
          }
        }
      });

      renderer.dispose();
    };
  }, []);

  if (webglError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-950 p-6 text-center">
        <div className="max-w-md border border-slate-800 bg-slate-900 p-6 rounded-xl">
          <h2 className="text-lg font-semibold text-white mb-2">Không thể khởi tạo cảnh 3D</h2>
          <p className="text-sm text-slate-300">{webglError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full select-none overflow-hidden">
      {/* Dedicated WebGL Mount Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Thông báo khi đang kéo hoặc trỏ vào vật thể 3D */}
      {gamePhase === 'playing' && (activeDragLabel || hoveredInteractive) && (
        <div className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1 rounded-lg bg-slate-950/90 border border-amber-400/50 text-xs font-medium text-amber-100 shadow-lg whitespace-nowrap">
          {activeDragLabel || hoveredInteractive}
        </div>
      )}

      {/* Lớp nhãn 2D neo phía sau / bên trái vật thể 3D (không dùng backdrop-filter để giữ 60fps trên WebGL) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
        {labels.map(
          (lbl) =>
            lbl.visible && (
              <div
                key={lbl.id}
                style={{
                  transform:
                    lbl.placement === 'left'
                      ? `translate3d(${Math.round(lbl.x)}px, ${Math.round(lbl.y)}px, 0) translate(-100%, -72%)`
                      : `translate3d(${Math.round(lbl.x)}px, ${Math.round(lbl.y)}px, 0) translate(-50%, -100%)`,
                }}
                className={`absolute top-0 left-0 flex transition-opacity duration-150 ${
                  lbl.placement === 'left' ? 'flex-row items-center' : 'flex-col items-center'
                }`}
              >
                <div
                  onClick={lbl.onClick}
                  className={`${
                    lbl.compact ? 'px-2 py-0.5 rounded-md' : 'px-2.5 py-1 rounded-lg'
                  } border text-left shadow-sm ${
                    lbl.onClick
                      ? 'pointer-events-auto cursor-pointer hover:bg-slate-900/95 active:scale-95 transition-all'
                      : ''
                  } ${
                    lbl.tone === 'amber'
                      ? 'bg-slate-950/85 border-amber-400/50 text-amber-50'
                      : lbl.tone === 'emerald'
                        ? 'bg-slate-950/85 border-emerald-400/55 text-emerald-100'
                        : lbl.tone === 'rose'
                          ? 'bg-slate-950/85 border-rose-400/55 text-rose-100'
                          : 'bg-slate-950/85 border-white/20 text-slate-100'
                  }`}
                >
                  <div
                    className={`${
                      lbl.compact ? 'text-[10px] tracking-wide' : 'text-[11px]'
                    } font-semibold leading-tight whitespace-nowrap`}
                  >
                    {lbl.title}
                  </div>
                  {lbl.subtitle && (
                    <div className="text-[10px] text-slate-200/90 leading-tight mt-0.5 max-w-[240px]">
                      {lbl.subtitle}
                    </div>
                  )}
                </div>
                {lbl.placement === 'left' ? (
                  <div className="w-2.5 h-px bg-white/30" />
                ) : (
                  <div className="w-px h-3 bg-white/25" />
                )}
              </div>
            ),
        )}
      </div>
    </div>
  );
};
