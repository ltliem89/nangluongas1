import {
  DEFAULT_EXPERIMENT_STATE,
  ExperimentState,
  PhysicsEvaluation,
} from '../physics/SimulationEngine';

export type ControllableObjectKey = 'lamp' | 'occluder' | 'pv' | 'switch' | 'galvano';

export type GamePhase = 'title' | 'playing' | 'paused' | 'mission_clear' | 'victory';

export interface ControllableObjectMeta {
  key: ControllableObjectKey;
  hotkey: string;
  shortName: string;
  fullName: string;
  hint: string;
}

export const CONTROLLABLE_OBJECTS: ControllableObjectMeta[] = [
  {
    key: 'lamp',
    hotkey: '1',
    shortName: 'Đèn chiếu',
    fullName: 'Đèn chiếu thực nghiệm',
    hint: 'WASD: Trượt đèn trên bàn · Q/E: Xoay hướng ngang · R/F: Chỉnh độ sáng · Space: Bật/Tắt',
  },
  {
    key: 'occluder',
    hotkey: '2',
    shortName: 'Vật cản sáng',
    fullName: 'Tấm chắn sáng đục (Vật cản)',
    hint: 'WASD: Đưa vật cản vào/ra chùm sáng · Q/E: Xoay góc chắn · V: Bật/Cất vật cản',
  },
  {
    key: 'pv',
    hotkey: '3',
    shortName: 'Pin quang điện',
    fullName: 'Tấm Pin quang điện vân bạc',
    hint: 'WASD: Di chuyển Pin trên mặt bàn · Q/E: Xoay góc mặt nhận sáng đón chùm tia',
  },
  {
    key: 'switch',
    hotkey: '4',
    shortName: 'Khóa mạch',
    fullName: 'Khóa mạch điện (Cầu dao)',
    hint: 'WASD: Di chuyển vị trí khóa mạch · Phím C hoặc Nhấn chuột: Đóng / Mở mạch điện',
  },
  {
    key: 'galvano',
    hotkey: '5',
    shortName: 'Điện kế',
    fullName: 'Điện kế kim (Vạch 0 giữa)',
    hint: 'WASD: Di chuyển vị trí Điện kế trên mặt bàn thí nghiệm',
  },
];

export interface LabMission {
  id: string;
  stepNumber: number;
  title: string;
  subtitle: string;
  goalText: string;
  hintText: string;
  scienceTakeaway: string;
  holdDurationSec: number;
  basePoints: number;
  recommendedObject: ControllableObjectKey;
  initialPatch: Partial<ExperimentState>;
  evaluate: (state: ExperimentState, physics: PhysicsEvaluation) => {
    satisfied: boolean;
    progress01: number;
    metricLabel: string;
    currentValueText: string;
    targetValueText: string;
  };
}

export const LAB_MISSIONS: LabMission[] = [
  {
    id: 'mission_1_harvest_light',
    stepNumber: 1,
    title: 'Nhiệm vụ 1: Thu Năng Lượng Ánh Sáng',
    subtitle: 'Chuyển hóa quang năng thành điện năng (Hình 15.2 SGK)',
    goalText:
      'Bật đèn (Space), đóng khóa mạch (C) và điều khiển Đèn / Pin quang điện (WASD, Q/E) để kim Điện kế đạt từ +3.8 vạch trở lên.',
    hintText:
      'Nhấn Space để BẬT ĐÈN, phím C để ĐÓNG MẠCH, sau đó dùng Q/E xoay thẳng chùm sáng vào tâm Pin quang điện và di chuyển lại gần.',
    scienceTakeaway:
      'Ánh sáng mang năng lượng: Khi chiếu chùm sáng mạnh và vuông góc vào tấm pin quang điện trong mạch kín, quang năng chuyển hóa thành điện năng làm kim điện kế lệch cực đại.',
    holdDurationSec: 1.5,
    basePoints: 250,
    recommendedObject: 'lamp',
    initialPatch: {
      ...DEFAULT_EXPERIMENT_STATE,
      lampOn: false,
      lampIntensity: 0.85,
      lampYawDeg: 22,
      pvYawDeg: -20,
      occluderActive: false,
      circuitClosed: true,
      darkLabVisualMode: true,
    },
    evaluate: (state, physics) => {
      const div = physics.galvanometer.targetScaleDivision;
      const targetDiv = 3.8;
      const satisfied = state.lampOn && state.circuitClosed && !state.occluderActive && div >= targetDiv;
      const progress01 = Math.max(0, Math.min(1, div / targetDiv));
      return {
        satisfied,
        progress01,
        metricLabel: 'Độ lệch kim Điện kế',
        currentValueText: `${div > 0 ? '+' : ''}${div.toFixed(1)} vạch`,
        targetValueText: '≥ +3.8 vạch',
      };
    },
  },
  {
    id: 'mission_2_umbra_shadow',
    stepNumber: 2,
    title: 'Nhiệm vụ 2: Tạo Vùng Tối (Umbra)',
    subtitle: 'Sự truyền thẳng của ánh sáng & Vùng tối phía sau vật cản',
    goalText:
      'Giữ đèn sáng từ 75% trở lên, đặt Vật cản sáng (Phím V hoặc phím 2 + WASD) che chắn chùm sáng sao cho Vùng tối trên mặt Pin đạt ≥ 75% và kim điện kế tụt xuống ≤ 0.6 vạch.',
    hintText:
      'Nhấn phím 2 để chọn Vật cản sáng (hoặc V để đặt lên bàn), dùng WASD di chuyển tấm chắn vào chính giữa Đèn chiếu và Pin quang điện.',
    scienceTakeaway:
      'Vùng tối (Umbra) là vùng nằm phía sau vật cản không nhận được ánh sáng từ nguồn sáng truyền tới. Khi mặt pin nằm trong vùng tối, dòng điện giảm về gần bằng 0.',
    holdDurationSec: 1.6,
    basePoints: 300,
    recommendedObject: 'occluder',
    initialPatch: {
      lampOn: true,
      lampIntensity: 0.9,
      lampYawDeg: 0,
      lampPitchDeg: -9,
      pvYawDeg: 0,
      occluderActive: true,
      occluderPos: { x: -0.92, z: 0.62 },
      occluderInsertion: 1.0,
      circuitClosed: true,
      darkLabVisualMode: true,
    },
    evaluate: (state, physics) => {
      const umbraPct = Math.round(physics.illumination.umbraFractionOnPV * 100);
      const div = Math.abs(physics.galvanometer.targetScaleDivision);
      const lampReady = state.lampOn && state.lampIntensity >= 0.75;
      const satisfied = lampReady && state.occluderActive && umbraPct >= 75 && div <= 0.6;
      const progress01 = lampReady && state.occluderActive ? Math.min(1, umbraPct / 75) : 0;
      return {
        satisfied,
        progress01,
        metricLabel: 'Vùng tối (Umbra) trên Pin',
        currentValueText: `${umbraPct}% (Kim: ${div.toFixed(1)} vạch)`,
        targetValueText: 'Umbra ≥ 75% · Kim ≤ 0.6',
      };
    },
  },
  {
    id: 'mission_3_penumbra_calibration',
    stepNumber: 3,
    title: 'Nhiệm vụ 3: Cân Chỉnh Vùng Nửa Tối',
    subtitle: 'Bóng nửa tối (Penumbra) từ nguồn sáng rộng & điều tiết quang năng',
    goalText:
      'Dịch chuyển nhẹ Vật cản sáng (WASD) để chỉ che một phần chùm sáng sao cho kim Điện kế giữ ổn định trong khoảng từ +1.4 đến +2.6 vạch.',
    hintText:
      'Chọn Vật cản sáng (Phím 2), nhấn W/S để dịch tấm chắn ra mép chùm tia sao cho trên mặt Pin xuất hiện cả phần sáng và phần tối/nửa tối.',
    scienceTakeaway:
      'Khi vật cản chỉ che khuất một phần chùm sáng từ nguồn sáng rộng, bề mặt pin nhận được một phần năng lượng ánh sáng nên kim điện kế lệch ở mức trung gian.',
    holdDurationSec: 1.8,
    basePoints: 350,
    recommendedObject: 'occluder',
    initialPatch: {
      lampOn: true,
      lampIntensity: 0.9,
      lampYawDeg: 0,
      lampPitchDeg: -9,
      pvYawDeg: 0,
      occluderActive: true,
      occluderPos: { x: -0.92, z: -0.08 },
      occluderInsertion: 1.0,
      circuitClosed: true,
      wiringReversed: false,
      darkLabVisualMode: true,
    },
    evaluate: (state, physics) => {
      const div = physics.galvanometer.targetScaleDivision;
      const inWindow = div >= 1.4 && div <= 2.6;
      const satisfied = state.lampOn && state.circuitClosed && state.occluderActive && inWindow;
      const distFromCenter = Math.abs(div - 2.0);
      const progress01 =
        !state.lampOn || !state.circuitClosed || !state.occluderActive
          ? 0
          : inWindow
            ? 1
            : Math.max(0, 1 - (distFromCenter - 0.6) / 2.2);
      return {
        satisfied,
        progress01,
        metricLabel: 'Vạch kim mục tiêu',
        currentValueText: `${div > 0 ? '+' : ''}${div.toFixed(1)} vạch`,
        targetValueText: '+1.4 đến +2.6 vạch',
      };
    },
  },
  {
    id: 'mission_4_cosine_polarity',
    stepNumber: 4,
    title: 'Nhiệm vụ 4: Góc Tới & Đảo Cực Điện Kế',
    subtitle: 'Định luật cosin góc tới & Chiều dòng điện một chiều',
    goalText:
      'Cất vật cản (V), đảo cực dây nối Điện kế (Phím X hoặc bảng dưới) và tinh chỉnh góc xoay mặt Pin (Phím 3 + Q/E) để kim lệch âm trong khoảng −3.5 đến −2.2 vạch.',
    hintText:
      'Nhấn V để tắt vật cản, nhấn X để Đảo 2 dây tại Điện kế (kim lệch chiều −), rồi chọn Pin (Phím 3) và dùng Q/E nghiêng nhẹ góc đón sáng.',
    scienceTakeaway:
      'Đảo hai đầu dây nối vào điện kế làm kim lệch theo chiều ngược lại (−). Đồng thời, khi nghiêng mặt pin hợp góc θ với tia sáng, quang thông giảm theo cos(θ).',
    holdDurationSec: 1.8,
    basePoints: 400,
    recommendedObject: 'pv',
    initialPatch: {
      lampOn: true,
      lampIntensity: 0.85,
      lampYawDeg: 0,
      lampPitchDeg: -9,
      pvYawDeg: 0,
      occluderActive: true,
      circuitClosed: true,
      wiringReversed: false,
      darkLabVisualMode: true,
    },
    evaluate: (state, physics) => {
      const div = physics.galvanometer.targetScaleDivision;
      const inTarget = div <= -2.2 && div >= -3.5;
      const satisfied =
        state.lampOn && state.circuitClosed && !state.occluderActive && state.wiringReversed && inTarget;
      let progress01 = 0;
      if (state.lampOn && state.circuitClosed && state.wiringReversed && !state.occluderActive) {
        if (inTarget) {
          progress01 = 1;
        } else {
          const dist = Math.min(Math.abs(div - -2.85), 3.5);
          progress01 = Math.max(0.15, 1 - dist / 3.5);
        }
      } else if (state.wiringReversed) {
        progress01 = 0.35;
      }
      return {
        satisfied,
        progress01,
        metricLabel: 'Kim lệch chiều âm (−)',
        currentValueText: `${div > 0 ? '+' : ''}${div.toFixed(1)} vạch`,
        targetValueText: '−3.5 đến −2.2 vạch',
      };
    },
  },
];
