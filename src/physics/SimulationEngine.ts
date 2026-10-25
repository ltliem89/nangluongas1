/**
 * BÀI 15 — NĂNG LƯỢNG ÁNH SÁNG. TIA SÁNG, VÙNG TỐI (KHTN 7 - Kết nối tri thức)
 * Mô hình Vật lí & Hình học Quang học 3D Độc lập (Phiên bản Cải tiến V2.5)
 *
 * Các nâng cấp từ Đánh giá Độc lập:
 * 1. Tích phân bức xạ từng điểm trên bề mặt cell (6x6 = 36 phần tử diện tích dA):
 *    Tính trực tiếp khoảng cách cục bộ r_k, góc tới cục bộ cos(θ_k) và phân bố góc chùm tia w(α_k)
 *    tại từng phần tử diện tích thay vì chỉ nhân hệ số tại tâm pin.
 * 2. Mô hình Nguồn sáng Khẩu độ Hữu hạn 5 điểm phát (Finite-Aperture Multi-Ray Umbra & Penumbra):
 *    Kiểm tra đường truyền từ 5 điểm trên mặt đèn chiếu (tâm + 4 rìa khẩu độ) qua Vật cản sáng
 *    để phân biệt chính xác:
 *    - Vùng sáng hoàn toàn (visibility = 1.0)
 *    - Vùng nửa tối / Penumbra (0 < visibility < 1.0, chỉ nhận được một phần mặt đèn)
 *    - Vùng tối hoàn toàn / Umbra (visibility = 0.0, bị che khuất toàn bộ mặt đèn)
 * 3. Chống xuyên thấu vật lí trên mặt bàn (Collision Resolution theo bán kính chân đế thực).
 */

export type AmbientLightMode = 'sgk_controlled' | 'classroom_ambient';
export type VisualBeamMode = 'realistic' | 'explanatory_cone' | 'explanatory_rays';
export type QualityMode = 'auto' | 'high' | 'balanced' | 'battery_saver';
export type CameraPreset = 'overview' | 'pv_closeup' | 'galvanometer_closeup';
export type DragInteractionMode = 'translate' | 'rotate';
export type MovableObjectKey = 'lamp' | 'pv' | 'occluder' | 'switch' | 'galvano';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec2XZ {
  x: number;
  z: number;
}

export interface ExperimentState {
  // Nguồn sáng thí nghiệm (LightSourceModel)
  lampOn: boolean;
  lampIntensity: number; // Chuẩn hóa 0.0 -> 1.0 (0% -> 100%, mặc định 0.8; 0% là không có ánh sáng)
  lampDistance: number; // Khoảng cách chuẩn hóa 3D từ đèn tới pin: 0.95 -> 3.40 (mặc định 1.70)
  lampPos: Vec2XZ; // Vị trí tâm cửa phát sáng trên mặt phẳng bàn (X, Z)
  lampHeight: number; // Độ cao tâm cửa phát sáng so với mặt bàn (mặc định 1.51)
  lampYawDeg: number; // Góc quay ngang của đèn: -75° -> +75°
  lampPitchDeg: number; // Góc chúc/ngẩng của đèn: -35° -> +35°

  // Pin quang điện (Photovoltaic position & orientation)
  pvPos: Vec2XZ; // Vị trí tâm pin quang điện trên mặt bàn (X, Z)
  pvYawDeg: number; // Góc xoay ngang mặt pin: -90° -> +90°
  pvPitchDeg: number; // Góc nghiêng mặt pin: -45° -> +45°

  // Vật cản sáng (Movable Opaque Obstacle / Screen creating Umbra & Penumbra)
  occluderActive: boolean;
  occluderInsertion: number; // Mức đưa vật cản vào chùm tia (0.0 -> 1.0)
  occluderPos: Vec2XZ; // Vị trí chân vật cản sáng trên mặt bàn (X, Z)
  occluderYawDeg: number; // Góc xoay tấm chắn sáng trên bàn (-75° -> +75°)

  // Vị trí Khóa mạch và Điện kế trên mặt bàn gỗ
  switchPos: Vec2XZ;
  galvanoPos: Vec2XZ;

  // Chế độ kéo thả chuột/cảm ứng trên vật thể 3D
  dragInteractionMode: DragInteractionMode;

  // Mạch điện ngoài (CircuitModel)
  circuitClosed: boolean;
  wiringReversed: boolean;

  // Ánh sáng môi trường (Ambient Light Physics Toggle - tách biệt khỏi đèn studio 3D)
  ambientMode: AmbientLightMode;
  ambientIntensity: number;

  // Lớp hiển thị trực quan (Visual / Pedagogical Overlays - KHÔNG ảnh hưởng vật lí)
  darkLabVisualMode: boolean; // Chế độ phòng thí nghiệm trong tối + đèn spotlight màu xanh đêm
  visualBeamMode: VisualBeamMode;
  showChargeFlowConceptual: boolean;
  showLabels: boolean;
  qualityMode: QualityMode;
  cameraPreset: CameraPreset;
}

export interface SamplePointEvaluation {
  worldPoint: Vec3;
  localU: number;
  localV: number;
  inBeamWeight: number; // 0 -> 1
  visibilityRatio: number; // 1.0 = sáng hoàn toàn, (0..1) = vùng nửa tối (penumbra), 0.0 = vùng tối (umbra)
  blockedByOccluder: boolean;
  shadowState: 'lit' | 'penumbra' | 'umbra';
  netWeight: number;
}

export interface IlluminationResult {
  lampPosition: Vec3;
  lampDirection: Vec3;
  pvCenter: Vec3;
  pvNormal: Vec3;
  distance: number;
  fDistance: number;
  incidenceAngleDeg: number;
  fAngle: number;
  beamOverlap: number;
  fOcclusion: number; // Tỉ lệ thông lượng truyền qua vật cản (0 -> 1)
  shadowCoverageOnPV: number; // Tổng mức suy giảm do bóng tối + bán tối (1 - fOcclusion)
  umbraFractionOnPV: number; // Tỉ lệ diện tích mặt pin nằm trong vùng tối hoàn toàn (Umbra)
  penumbraFractionOnPV: number; // Tỉ lệ diện tích mặt pin nằm trong vùng nửa tối (Penumbra)
  lampEffectiveIrradiance: number;
  ambientIrradiance: number;
  effectiveIrradiance: number;
  illuminationCategory: 'none' | 'low' | 'medium' | 'high';
  samplePoints: SamplePointEvaluation[];
}

export interface PhotovoltaicResult {
  openCircuitVoltageNorm: number;
  photocurrentCapacityNorm: number;
  absorbedFractionNote: string;
}

export interface CircuitResult {
  circuitClosed: boolean;
  polaritySign: 1 | -1;
  normalizedCurrent: number;
  currentMagnitudeNorm: number;
}

export interface GalvanometerResult {
  targetAngleDeg: number;
  targetScaleDivision: number;
  statusText: string;
}

export interface PhysicsEvaluation {
  illumination: IlluminationResult;
  pv: PhotovoltaicResult;
  circuit: CircuitResult;
  galvanometer: GalvanometerResult;
  causalSummary: string;
  detailedChain: string[];
}

export const SCENE_GEOMETRY = {
  defaultPvPos: { x: -0.35, z: -0.08 } as Vec2XZ,
  pvCenterY: 0.74,
  pvActiveWidth: 0.72,
  pvActiveHeight: 0.50,
  defaultRayElevationDeg: 27,
  referenceDistance: 1.70,
  minDistance: 0.95,
  maxDistance: 3.40,
  defaultLampPos: {
    x: -0.35 - Math.cos((27 * Math.PI) / 180) * 1.70, // -1.8647
    z: -0.08,
  } as Vec2XZ,
  defaultLampHeight: 0.74 + Math.sin((27 * Math.PI) / 180) * 1.70, // 1.5118
  defaultOccluderPos: {
    x: -0.35 - Math.cos((27 * Math.PI) / 180) * 0.62, // -0.9024
    z: -0.08,
  } as Vec2XZ,
  occluderCenterY: 0.90,
  occluderWidth: 0.86,
  occluderHeight: 0.78,
  defaultSwitchPos: { x: 0.48, z: 0.62 } as Vec2XZ,
  defaultGalvanoPos: { x: 1.48, z: -0.10 } as Vec2XZ,
  tableBounds: {
    minX: -2.95,
    maxX: 2.85,
    minZ: -1.45,
    maxZ: 1.45,
  },
  // Bán kính chân đế vật lí trên mặt bàn gỗ để chống kéo xuyên vật thể
  footprintRadii: {
    lamp: 0.38,
    pv: 0.34,
    occluder: 0.28,
    switch: 0.26,
    galvano: 0.54,
  } as Record<MovableObjectKey, number>,
  finiteApertureRadius: 0.42,
  sourceEmitterRadius: 0.115, // Bán kính thực của cửa phát sáng đèn chiếu để tính Vùng nửa tối (Penumbra)
  beamCoreHalfAngleDeg: 14.0,
  beamOuterHalfAngleDeg: 24.5,
  maxNeedleAngleDeg: 45,
  maxScaleDivisions: 5,
};

export const DEFAULT_EXPERIMENT_STATE: ExperimentState = {
  lampOn: false,
  lampIntensity: 0.80,
  lampDistance: 1.70,
  lampPos: { ...SCENE_GEOMETRY.defaultLampPos },
  lampHeight: SCENE_GEOMETRY.defaultLampHeight,
  lampYawDeg: 0,
  lampPitchDeg: 0,
  pvPos: { ...SCENE_GEOMETRY.defaultPvPos },
  pvYawDeg: 0,
  pvPitchDeg: 0,
  occluderActive: false,
  occluderInsertion: 1.0,
  occluderPos: { ...SCENE_GEOMETRY.defaultOccluderPos },
  occluderYawDeg: 0,
  switchPos: { ...SCENE_GEOMETRY.defaultSwitchPos },
  galvanoPos: { ...SCENE_GEOMETRY.defaultGalvanoPos },
  dragInteractionMode: 'translate',
  circuitClosed: true,
  wiringReversed: false,
  ambientMode: 'sgk_controlled',
  ambientIntensity: 0.12,
  darkLabVisualMode: true,
  visualBeamMode: 'explanatory_cone',
  showChargeFlowConceptual: true,
  showLabels: true,
  qualityMode: 'auto',
  cameraPreset: 'overview',
};

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function vecSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vecScale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vecDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vecLen(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function vecNormalize(v: Vec3): Vec3 {
  const l = vecLen(v);
  if (l < 1e-8) return { x: 0, y: 1, z: 0 };
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

export function vecCross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function rotateAroundAxis(v: Vec3, axis: Vec3, angleRad: number): Vec3 {
  const k = vecNormalize(axis);
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const crossKV = vecCross(k, v);
  const dotKV = vecDot(k, v);
  return {
    x: v.x * cosA + crossKV.x * sinA + k.x * dotKV * (1 - cosA),
    y: v.y * cosA + crossKV.y * sinA + k.y * dotKV * (1 - cosA),
    z: v.z * cosA + crossKV.z * sinA + k.z * dotKV * (1 - cosA),
  };
}

/**
 * Chống chồng lấn / xuyên vật thể khi kéo thả trên mặt bàn gỗ (Physical Footprint Collision Avoidance)
 */
export function resolveTableCollision(
  movingKey: MovableObjectKey,
  candidateXZ: Vec2XZ,
  state: ExperimentState,
): Vec2XZ {
  let x = clamp(candidateXZ.x, SCENE_GEOMETRY.tableBounds.minX, SCENE_GEOMETRY.tableBounds.maxX);
  let z = clamp(candidateXZ.z, SCENE_GEOMETRY.tableBounds.minZ, SCENE_GEOMETRY.tableBounds.maxZ);

  const obstacles: { key: MovableObjectKey; pos: Vec2XZ }[] = [
    { key: 'lamp', pos: state.lampPos },
    { key: 'pv', pos: state.pvPos },
    ...(state.occluderActive ? [{ key: 'occluder' as MovableObjectKey, pos: state.occluderPos }] : []),
    { key: 'switch', pos: state.switchPos },
    { key: 'galvano', pos: state.galvanoPos },
  ];

  const myRadius = SCENE_GEOMETRY.footprintRadii[movingKey];

  for (let pass = 0; pass < 2; pass++) {
    for (const obs of obstacles) {
      if (obs.key === movingKey) continue;
      const minSep = myRadius + SCENE_GEOMETRY.footprintRadii[obs.key];
      const dx = x - obs.pos.x;
      const dz = z - obs.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < minSep) {
        if (dist < 1e-4) {
          x += minSep;
        } else {
          const push = (minSep - dist) / dist;
          x += dx * push;
          z += dz * push;
        }
        x = clamp(x, SCENE_GEOMETRY.tableBounds.minX, SCENE_GEOMETRY.tableBounds.maxX);
        z = clamp(z, SCENE_GEOMETRY.tableBounds.minZ, SCENE_GEOMETRY.tableBounds.maxZ);
      }
    }
  }

  return {
    x: Number(x.toFixed(3)),
    z: Number(z.toFixed(3)),
  };
}

/**
 * Đồng bộ vị trí đèn khi người dùng chỉnh thanh trượt lampDistance
 */
export function computeLampPosFromDistance(pvPos: Vec2XZ, distance: number): {
  lampPos: Vec2XZ;
  lampHeight: number;
} {
  const elevRad = degToRad(SCENE_GEOMETRY.defaultRayElevationDeg);
  const r = clamp(distance, SCENE_GEOMETRY.minDistance, SCENE_GEOMETRY.maxDistance);
  return {
    lampPos: {
      x: clamp(
        pvPos.x - Math.cos(elevRad) * r,
        SCENE_GEOMETRY.tableBounds.minX,
        SCENE_GEOMETRY.tableBounds.maxX,
      ),
      z: clamp(pvPos.z, SCENE_GEOMETRY.tableBounds.minZ, SCENE_GEOMETRY.tableBounds.maxZ),
    },
    lampHeight: clamp(SCENE_GEOMETRY.pvCenterY + Math.sin(elevRad) * r, 0.95, 2.15),
  };
}

/**
 * Tính vị trí cửa phát sáng của đèn và vector hướng chiếu của đèn
 */
export function computeLampTransform(state: ExperimentState): {
  position: Vec3;
  direction: Vec3;
  right: Vec3;
  up: Vec3;
  emitterPoints: Vec3[]; // 5 điểm phát sáng trên khẩu độ mặt đèn (Tâm + 4 điểm rìa)
} {
  const elevRad = degToRad(SCENE_GEOMETRY.defaultRayElevationDeg);
  const u0: Vec3 = {
    x: -Math.cos(elevRad),
    y: Math.sin(elevRad),
    z: 0,
  };

  const isDefaultLampXZ =
    Math.abs(state.lampPos.x - SCENE_GEOMETRY.defaultLampPos.x) < 1e-3 &&
    Math.abs(state.lampPos.z - SCENE_GEOMETRY.defaultLampPos.z) < 1e-3 &&
    Math.abs(state.lampDistance - SCENE_GEOMETRY.referenceDistance) > 1e-3;

  let position: Vec3;
  if (isDefaultLampXZ) {
    const r = clamp(state.lampDistance, SCENE_GEOMETRY.minDistance, SCENE_GEOMETRY.maxDistance);
    const pvCenter: Vec3 = {
      x: state.pvPos.x,
      y: SCENE_GEOMETRY.pvCenterY,
      z: state.pvPos.z,
    };
    position = vecAdd(pvCenter, vecScale(u0, r));
  } else {
    position = {
      x: state.lampPos.x,
      y: state.lampHeight,
      z: state.lampPos.z,
    };
  }

  const baseForward: Vec3 = vecScale(u0, -1);
  const worldUp: Vec3 = { x: 0, y: 1, z: 0 };

  const yawRad = degToRad(state.lampYawDeg);
  const dirAfterYaw = rotateAroundAxis(baseForward, worldUp, yawRad);
  const rightAxis = vecNormalize(vecCross(dirAfterYaw, worldUp));

  const pitchRad = degToRad(state.lampPitchDeg);
  const direction = vecNormalize(rotateAroundAxis(dirAfterYaw, rightAxis, pitchRad));
  const up = vecNormalize(vecCross(rightAxis, direction));

  const rad = SCENE_GEOMETRY.sourceEmitterRadius;
  const emitterPoints: Vec3[] = [
    position,
    vecAdd(position, vecScale(rightAxis, rad)),
    vecAdd(position, vecScale(rightAxis, -rad)),
    vecAdd(position, vecScale(up, rad)),
    vecAdd(position, vecScale(up, -rad)),
  ];

  return { position, direction, right: rightAxis, up, emitterPoints };
}

/**
 * Tính hệ trục tọa độ mặt nhận sáng của pin quang điện tại vị trí thực pvPos
 */
export function computePVSurfaceBasis(state: ExperimentState): {
  center: Vec3;
  normal: Vec3;
  tangentRight: Vec3;
  tangentUp: Vec3;
} {
  const elevRad = degToRad(SCENE_GEOMETRY.defaultRayElevationDeg);
  const baseNormal: Vec3 = {
    x: -Math.cos(elevRad),
    y: Math.sin(elevRad),
    z: 0,
  };
  const worldUp: Vec3 = { x: 0, y: 1, z: 0 };

  const yawRad = degToRad(state.pvYawDeg);
  const normalAfterYaw = rotateAroundAxis(baseNormal, worldUp, yawRad);
  const tangentRight = vecNormalize(vecCross(worldUp, normalAfterYaw));

  const pitchRad = degToRad(state.pvPitchDeg);
  const normal = vecNormalize(rotateAroundAxis(normalAfterYaw, tangentRight, pitchRad));
  const tangentUp = vecNormalize(vecCross(normal, tangentRight));

  return {
    center: {
      x: state.pvPos.x,
      y: SCENE_GEOMETRY.pvCenterY,
      z: state.pvPos.z,
    },
    normal,
    tangentRight,
    tangentUp,
  };
}

/**
 * Tính vị trí và hệ trục của Vật cản sáng
 */
export function computeOccluderTransform(state: ExperimentState): {
  center: Vec3;
  standPos: Vec2XZ;
  normal: Vec3;
  right: Vec3;
  up: Vec3;
  width: number;
  height: number;
} {
  const worldUp: Vec3 = { x: 0, y: 1, z: 0 };
  const baseNormal: Vec3 = { x: -1, y: 0, z: 0 };
  const yawRad = degToRad(state.occluderYawDeg);
  const normal = vecNormalize(rotateAroundAxis(baseNormal, worldUp, yawRad));
  const right = vecNormalize(vecCross(worldUp, normal));
  const up = worldUp;

  const insertionOffsetZ = (1 - clamp(state.occluderInsertion, 0, 1)) * 0.88;
  const standX = state.occluderPos.x;
  const standZ = state.occluderPos.z + insertionOffsetZ;

  return {
    center: {
      x: standX,
      y: SCENE_GEOMETRY.occluderCenterY,
      z: standZ,
    },
    standPos: { x: standX, z: standZ },
    normal,
    right,
    up,
    width: SCENE_GEOMETRY.occluderWidth,
    height: SCENE_GEOMETRY.occluderHeight,
  };
}

/**
 * Kiểm tra một đoạn tia từ origin theo hướng rayDir (độ dài maxDist) có bị Vật cản sáng chặn lại không
 */
export function intersectRayWithOccluder(
  origin: Vec3,
  rayDir: Vec3,
  maxDist: number,
  state: ExperimentState,
): number | null {
  if (!state.occluderActive || state.occluderInsertion <= 0.01) return null;
  const occ = computeOccluderTransform(state);

  const denom = vecDot(rayDir, occ.normal);
  if (Math.abs(denom) < 1e-6) return null;

  const t = vecDot(vecSub(occ.center, origin), occ.normal) / denom;
  if (t <= 0.04 || t >= maxDist - 0.01) return null;

  const hitPt = vecAdd(origin, vecScale(rayDir, t));
  const rel = vecSub(hitPt, occ.center);
  const localX = Math.abs(vecDot(rel, occ.right));
  const localY = Math.abs(vecDot(rel, occ.up));

  if (localX <= occ.width * 0.5 && localY <= occ.height * 0.5) {
    return t;
  }
  return null;
}

/**
 * Kiểm tra giao cắt tia với mặt phẳng Pin Quang Điện
 */
export function intersectRayWithPVPanel(
  origin: Vec3,
  rayDir: Vec3,
  maxDist: number,
  state: ExperimentState,
): number | null {
  const pv = computePVSurfaceBasis(state);
  const denom = vecDot(rayDir, pv.normal);
  if (Math.abs(denom) < 1e-6) return null;

  const t = vecDot(vecSub(pv.center, origin), pv.normal) / denom;
  if (t <= 0.05 || t >= maxDist) return null;

  const hitPt = vecAdd(origin, vecScale(rayDir, t));
  const rel = vecSub(hitPt, pv.center);
  const localX = Math.abs(vecDot(rel, pv.tangentRight));
  const localY = Math.abs(vecDot(rel, pv.tangentUp));

  const frameHalfW = (SCENE_GEOMETRY.pvActiveWidth + 0.12) * 0.5;
  const frameHalfH = (SCENE_GEOMETRY.pvActiveHeight + 0.12) * 0.5;
  if (localX <= frameHalfW && localY <= frameHalfH) {
    return t;
  }
  return null;
}

/**
 * Tính toán toàn bộ mô hình vật lí độc lập từ ExperimentState
 * Tích hợp tích phân bức xạ diện tích 36 điểm (6x6) và mô hình nguồn phát hữu hạn 5 điểm (Umbra & Penumbra)
 */
export function evaluateExperimentPhysics(state: ExperimentState): PhysicsEvaluation {
  const lamp = computeLampTransform(state);
  const pv = computePVSurfaceBasis(state);

  const centerRayVec = vecSub(pv.center, lamp.position);
  const distance = vecLen(centerRayVec);
  const centerRayDir = vecNormalize(centerRayVec);

  const a2 = SCENE_GEOMETRY.finiteApertureRadius * SCENE_GEOMETRY.finiteApertureRadius;
  const rMin2 = 1.10 * 1.10;
  const fDistanceCenter = clamp((rMin2 + a2) / (distance * distance + a2), 0.08, 1.05);

  const cosIncidenceCenter = vecDot(vecScale(centerRayDir, -1), pv.normal);
  const clampedCosCenter = clamp(cosIncidenceCenter, -1, 1);
  const incidenceAngleDeg = radToDeg(Math.acos(clampedCosCenter));
  const fAngleCenter = Math.max(0, cosIncidenceCenter);

  // Tích phân số trên lưới 6x6 = 36 phần tử diện tích mặt bán dẫn
  const gridN = 6;
  let unoccludedFluxSum = 0;
  let occludedFluxSum = 0;
  let inBeamAreaSum = 0;
  let umbraCount = 0;
  let penumbraCount = 0;
  let activeInBeamCount = 0;

  const samplePoints: SamplePointEvaluation[] = [];

  for (let ix = 0; ix < gridN; ix++) {
    for (let iy = 0; iy < gridN; iy++) {
      const localU = ((ix + 0.5) / gridN - 0.5) * SCENE_GEOMETRY.pvActiveWidth;
      const localV = ((iy + 0.5) / gridN - 0.5) * SCENE_GEOMETRY.pvActiveHeight;

      const samplePt = vecAdd(
        pv.center,
        vecAdd(vecScale(pv.tangentRight, localU), vecScale(pv.tangentUp, localV)),
      );

      const rayToSample = vecSub(samplePt, lamp.position);
      const sampleDist = vecLen(rayToSample);
      const sampleDir = vecNormalize(rayToSample);

      // Hệ số suy giảm khoảng cách cục bộ tại điểm mẫu (ix, iy)
      const localFDist = clamp((rMin2 + a2) / (sampleDist * sampleDist + a2), 0.08, 1.05);

      // Góc lệch giữa tia tới điểm mẫu và trục quang học của đèn
      const cosSpot = clamp(vecDot(sampleDir, lamp.direction), -1, 1);
      const spotAngleDeg = radToDeg(Math.acos(cosSpot));

      const spotWeight =
        1 -
        smoothstep(
          SCENE_GEOMETRY.beamCoreHalfAngleDeg,
          SCENE_GEOMETRY.beamOuterHalfAngleDeg,
          spotAngleDeg,
        );

      // Góc tới cục bộ trên mặt phẳng pin tại điểm mẫu
      const localCosIncidence = Math.max(0, vecDot(vecScale(sampleDir, -1), pv.normal));
      const inBeamWeight = localCosIncidence > 0 ? spotWeight : 0;

      // Thông lượng tới phần tử diện tích này khi chưa có vật cản
      const localUnoccludedFlux = localFDist * localCosIncidence * spotWeight;
      unoccludedFluxSum += localUnoccludedFlux;
      inBeamAreaSum += inBeamWeight;

      // Kiểm tra 5 điểm phát sáng trên khẩu độ mặt đèn tới điểm mẫu để xác định Vùng tối (Umbra) & Vùng nửa tối (Penumbra)
      let unblockedEmitters = 5;
      if (state.occluderActive && state.occluderInsertion > 0.01) {
        unblockedEmitters = 0;
        for (const emitterPt of lamp.emitterPoints) {
          const vecFromEmitter = vecSub(samplePt, emitterPt);
          const distFromEmitter = vecLen(vecFromEmitter);
          const dirFromEmitter = vecNormalize(vecFromEmitter);
          const hitOcc = intersectRayWithOccluder(
            emitterPt,
            dirFromEmitter,
            distFromEmitter,
            state,
          );
          if (hitOcc === null) {
            unblockedEmitters++;
          }
        }
      }

      const visibilityRatio = unblockedEmitters / lamp.emitterPoints.length; // 0.0, 0.2, 0.4, 0.6, 0.8, 1.0
      const blockedByOccluder = visibilityRatio < 0.99;

      let shadowState: SamplePointEvaluation['shadowState'] = 'lit';
      if (inBeamWeight > 0.05) {
        activeInBeamCount++;
        if (visibilityRatio === 0) {
          shadowState = 'umbra';
          umbraCount++;
        } else if (visibilityRatio < 1.0) {
          shadowState = 'penumbra';
          penumbraCount++;
        }
      }

      occludedFluxSum += localUnoccludedFlux * visibilityRatio;

      samplePoints.push({
        worldPoint: samplePt,
        localU,
        localV,
        inBeamWeight,
        visibilityRatio,
        blockedByOccluder,
        shadowState,
        netWeight: inBeamWeight * localCosIncidence * visibilityRatio,
      });
    }
  }

  const totalSamples = gridN * gridN;
  const beamOverlap = clamp(inBeamAreaSum / totalSamples, 0, 1);
  const fOcclusion =
    unoccludedFluxSum > 1e-5
      ? clamp(occludedFluxSum / unoccludedFluxSum, 0, 1)
      : state.occluderActive
        ? 0
        : 1.0;
  const shadowCoverageOnPV = clamp(1 - fOcclusion, 0, 1);
  const umbraFractionOnPV = activeInBeamCount > 0 ? umbraCount / activeInBeamCount : 0;
  const penumbraFractionOnPV = activeInBeamCount > 0 ? penumbraCount / activeInBeamCount : 0;

  const hasActiveLamp = state.lampOn && state.lampIntensity > 1e-4;
  const E0 = hasActiveLamp ? clamp(state.lampIntensity, 0, 1) : 0;
  const distanceNormalization = 1.48;
  // Tính bức xạ hữu hiệu trực tiếp từ trung bình tích phân diện tích 36 điểm mẫu
  const meanOccludedFlux = occludedFluxSum / totalSamples;
  const lampEffectiveIrradiance = hasActiveLamp
    ? clamp(E0 * meanOccludedFlux * distanceNormalization, 0, 1.15)
    : 0;

  const upwardExposure = clamp((pv.normal.y + 0.6) / 1.6, 0.25, 1.0);
  const ambientOcclusionFactor = state.occluderActive ? 1 - 0.55 * shadowCoverageOnPV : 1.0;
  const ambientIrradiance =
    state.ambientMode === 'classroom_ambient'
      ? clamp(state.ambientIntensity * upwardExposure * ambientOcclusionFactor, 0, 0.25)
      : 0;

  const effectiveIrradiance = clamp(lampEffectiveIrradiance + ambientIrradiance, 0, 1.2);

  let illuminationCategory: IlluminationResult['illuminationCategory'] = 'none';
  if (effectiveIrradiance < 0.015) {
    illuminationCategory = 'none';
  } else if (effectiveIrradiance < 0.28) {
    illuminationCategory = 'low';
  } else if (effectiveIrradiance < 0.62) {
    illuminationCategory = 'medium';
  } else {
    illuminationCategory = 'high';
  }

  const openCircuitVoltageNorm =
    effectiveIrradiance > 0.002
      ? clamp(Math.log(1 + 14 * effectiveIrradiance) / Math.log(15), 0, 1)
      : 0;

  const photocurrentCapacityNorm = clamp(
    (1.18 * effectiveIrradiance) / (1 + 0.22 * effectiveIrradiance),
    0,
    1.0,
  );

  const absorbedFractionNote =
    effectiveIrradiance > 0.015
      ? 'Bán dẫn hấp thụ một phần quang năng để tạo hạt tải điện; phần còn lại phản xạ hoặc tỏa nhiệt.'
      : 'Chưa có năng lượng ánh sáng đáng kể chiếu tới vùng bán dẫn của pin.';

  const polaritySign: 1 | -1 = state.wiringReversed ? -1 : 1;
  const chiClosed = state.circuitClosed ? 1 : 0;
  const currentMagnitudeNorm = photocurrentCapacityNorm * chiClosed;
  const normalizedCurrent = polaritySign * currentMagnitudeNorm;

  const targetScaleDivision = clamp(
    normalizedCurrent * SCENE_GEOMETRY.maxScaleDivisions,
    -SCENE_GEOMETRY.maxScaleDivisions,
    SCENE_GEOMETRY.maxScaleDivisions,
  );
  const targetAngleDeg = clamp(
    normalizedCurrent * SCENE_GEOMETRY.maxNeedleAngleDeg,
    -SCENE_GEOMETRY.maxNeedleAngleDeg,
    SCENE_GEOMETRY.maxNeedleAngleDeg,
  );

  let galvanometerStatusText = 'Kim ở vạch 0 (không có dòng điện)';
  if (Math.abs(targetScaleDivision) >= 0.08) {
    const dirLabel = targetScaleDivision > 0 ? 'chiều thuận (+)' : 'chiều ngược (−)';
    galvanometerStatusText = `Lệch ${dirLabel} khoảng ${Math.abs(targetScaleDivision).toFixed(1)} vạch chia tương đối`;
  }

  let causalSummary = '';
  if (!state.circuitClosed) {
    if (effectiveIrradiance > 0.02) {
      causalSummary =
        'Pin quang điện đang nhận ánh sáng và tạo thế quang điện, nhưng mạch ngoài bị hở nên không có dòng điện chạy qua điện kế (kim ở vạch 0).';
    } else {
      causalSummary =
        'Đèn đang tắt và mạch ngoài đang hở; không có dòng điện trong mạch nên kim điện kế đứng yên ở vạch 0.';
    }
  } else if (!state.lampOn) {
    if (state.ambientMode === 'classroom_ambient' && effectiveIrradiance > 0.015) {
      causalSummary =
        'Đèn chiếu đã tắt nhưng chế độ ánh sáng môi trường phòng học đang bật, làm pin tạo một dòng điện nền rất nhỏ khiến kim lệch nhẹ khỏi vạch 0.';
    } else {
      causalSummary =
        'Khi chưa bật đèn chiếu (và không có ánh sáng môi trường gây nhiễu), pin quang điện không nhận được năng lượng ánh sáng nên kim điện kế ở vạch 0.';
    }
  } else if (state.lampIntensity <= 1e-4) {
    causalSummary =
      'Độ sáng đèn đang chỉnh ở mức 0% (không có ánh sáng phát ra), nên pin quang điện không nhận được quang năng từ đèn và kim điện kế ở vạch 0.';
  } else if (state.occluderActive && fOcclusion < 0.03) {
    causalSummary =
      'Vật cản sáng đục đang chắn trọn chùm sáng; toàn bộ mặt pin nằm trong vùng tối hoàn toàn (umbra) phía sau vật cản nên kim điện kế về vạch 0.';
  } else if (beamOverlap < 0.04) {
    causalSummary =
      'Đèn đang bật nhưng vị trí hoặc hướng chùm sáng lệch ra ngoài vùng nhận sáng của pin quang điện, nên pin không thu được quang năng từ đèn.';
  } else if (fAngleCenter <= 0.02) {
    causalSummary =
      'Mặt nhận sáng của pin quang điện đang quay khuất khỏi hướng tia sáng tới (góc tới ≥ 90°), nên không thu được chùm sáng từ đèn.';
  } else {
    const polarityNote = state.wiringReversed
      ? ' Do hai đầu dây nối vào điện kế đang đảo cực nên kim lệch về phía ngược lại.'
      : '';
    if (state.occluderActive && fOcclusion < 0.96) {
      causalSummary = `Vật cản sáng đang tạo vùng tối (${Math.round(umbraFractionOnPV * 100)}%) và vùng nửa tối (${Math.round(penumbraFractionOnPV * 100)}%) trên mặt pin, làm quang thông giảm ${Math.round(shadowCoverageOnPV * 100)}% và độ lệch kim giảm tương ứng.${polarityNote}`;
    } else if (incidenceAngleDeg > 38) {
      causalSummary = `Mặt pin đang nghiêng góc ${Math.round(incidenceAngleDeg)}° so với tia tới nên quang năng thu được trên một đơn vị diện tích giảm theo cosin góc tới.${polarityNote}`;
    } else {
      causalSummary = `Pin quang điện hấp thụ năng lượng ánh sáng từ đèn và chuyển hóa một phần thành điện năng; mạch kín nên dòng điện chạy qua làm kim điện kế lệch.${polarityNote}`;
    }
  }

  const detailedChain: string[] = [
    hasActiveLamp
      ? `1. Nguồn sáng (Khẩu độ hữu hạn): Đèn bật ${Math.round(state.lampIntensity * 100)}%, khoảng cách thực ${(distance / SCENE_GEOMETRY.referenceDistance).toFixed(2)}×.`
      : state.lampOn && state.lampIntensity <= 1e-4
        ? '1. Nguồn sáng: Độ sáng đèn đang ở 0% (không có ánh sáng).'
        : '1. Nguồn sáng: Đèn chiếu đang tắt.',
    `2. Tích phân bề mặt (36 ô) & Vùng tối: Chồng chùm tia ${Math.round(beamOverlap * 100)}%, góc tới tâm ${Math.round(incidenceAngleDeg)}°, vùng tối (umbra) ${Math.round(umbraFractionOnPV * 100)}%, vùng nửa tối (penumbra) ${Math.round(penumbraFractionOnPV * 100)}%.`,
    `3. Pin quang điện: Mức chiếu sáng hữu hiệu tích phân đạt ${Math.round(clamp(effectiveIrradiance, 0, 1) * 100)}% thang mô hình → ${effectiveIrradiance > 0.015 ? 'sinh hạt tải điện trong bán dẫn' : 'không sinh dòng quang điện đáng kể'}.`,
    state.circuitClosed
      ? `4. Mạch ngoài & Điện kế: Mạch kín (${state.wiringReversed ? 'đấu dây đảo cực' : 'đấu dây chuẩn'}) → ${galvanometerStatusText}.`
      : '4. Mạch ngoài & Điện kế: Mạch đang hở → dòng điện qua điện kế bằng 0, kim ở vạch 0.',
  ];

  return {
    illumination: {
      lampPosition: lamp.position,
      lampDirection: lamp.direction,
      pvCenter: pv.center,
      pvNormal: pv.normal,
      distance,
      fDistance: fDistanceCenter,
      incidenceAngleDeg,
      fAngle: fAngleCenter,
      beamOverlap,
      fOcclusion,
      shadowCoverageOnPV,
      umbraFractionOnPV,
      penumbraFractionOnPV,
      lampEffectiveIrradiance,
      ambientIrradiance,
      effectiveIrradiance,
      illuminationCategory,
      samplePoints,
    },
    pv: {
      openCircuitVoltageNorm,
      photocurrentCapacityNorm,
      absorbedFractionNote,
    },
    circuit: {
      circuitClosed: state.circuitClosed,
      polaritySign,
      normalizedCurrent,
      currentMagnitudeNorm,
    },
    galvanometer: {
      targetAngleDeg,
      targetScaleDivision,
      statusText: galvanometerStatusText,
    },
    causalSummary,
    detailedChain,
  };
}

export class GalvanometerNeedleDynamics {
  public currentAngleDeg = 0;
  public angularVelocityDegPerSec = 0;

  private readonly omegaN = 14.5;
  private readonly zeta = 0.82;

  public step(targetAngleDeg: number, dtSeconds: number): number {
    const dt = clamp(dtSeconds, 0.001, 0.05);
    const error = this.currentAngleDeg - targetAngleDeg;
    const accel =
      -2 * this.zeta * this.omegaN * this.angularVelocityDegPerSec -
      this.omegaN * this.omegaN * error;

    this.angularVelocityDegPerSec += accel * dt;
    this.currentAngleDeg += this.angularVelocityDegPerSec * dt;

    const maxLim = SCENE_GEOMETRY.maxNeedleAngleDeg + 1.5;
    if (this.currentAngleDeg > maxLim) {
      this.currentAngleDeg = maxLim;
      if (this.angularVelocityDegPerSec > 0) this.angularVelocityDegPerSec = 0;
    } else if (this.currentAngleDeg < -maxLim) {
      this.currentAngleDeg = -maxLim;
      if (this.angularVelocityDegPerSec < 0) this.angularVelocityDegPerSec = 0;
    }

    if (Math.abs(error) < 0.008 && Math.abs(this.angularVelocityDegPerSec) < 0.02) {
      this.currentAngleDeg = targetAngleDeg;
      this.angularVelocityDegPerSec = 0;
    }

    return this.currentAngleDeg;
  }

  public reset(angleDeg = 0): void {
    this.currentAngleDeg = angleDeg;
    this.angularVelocityDegPerSec = 0;
  }
}
