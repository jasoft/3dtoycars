import * as THREE from 'three';
import type { CarObject, CarSpec } from '../types';
import {
  applyLightPulse,
  createCarPulseTimer,
  createDiecastMaterial,
  createEmissiveLight,
  createGlassMaterial,
  groundToZero,
  mountWheels,
  spinWheels,
  stepCarPulse,
  tagCarInteractive,
  triggerCarPulse,
} from '../utils/carBuilder';
import { createBrushedMetalTexture } from '../utils/textures';

export const CYBERTRUCK_SPEC: CarSpec = {
  id: 'cybertruck',
  name: '特斯拉 Cybertruck',
  englishName: 'Tesla Cybertruck',
  subtitle: '冷轧不锈钢赛博越野皮卡',
  description:
    '参考桌面后排银色赛博越野皮卡。以极简三角形尖顶楔形外骨骼搭配拉丝冷轧不锈钢车漆，拥有全宽冰青前贯穿日行灯、赤红尾灯带、全景黑烟玻璃天幕与下凹黑色敞开式货斗。',
  highlights: [
    '三角尖顶楔形外壳 + 冷轧拉丝不锈钢质感',
    '前脸冰青 / 车尾赤红全宽 LED 贯穿光剑灯带',
    '全景黑烟天幕、下凹货斗与梯形越野轮眉',
    '点击触发空气悬架蓄力弹起与灯带能量扫描',
  ],
  soundLabel: '科幻低频脉冲 + 电机升频啸叫',
  accentColor: '#38bdf8',
  accentHex: 0x38bdf8,
  position: [-2.3, 0.16, -0.85],
  rotationY: 0.05,
  focusOffset: [-1.75, 1.78, 3.65],
  focusTargetOffset: [0.45, 0.45, 0],
};

/**
 * 构建单个梯形黑色越野轮眉（外梯形挖去内梯形轮拱空腔）。
 */
function createTrapezoidFlare(
  centerX: number,
  mat: THREE.Material,
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(centerX - 0.30, 0.21);
  shape.lineTo(centerX - 0.18, 0.545);
  shape.lineTo(centerX + 0.18, 0.545);
  shape.lineTo(centerX + 0.30, 0.21);
  shape.lineTo(centerX + 0.24, 0.21);
  shape.lineTo(centerX + 0.145, 0.495);
  shape.lineTo(centerX - 0.145, 0.495);
  shape.lineTo(centerX - 0.24, 0.21);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.105,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -0.0525);
  return new THREE.Mesh(geo, mat);
}

/**
 * 构建分段式全宽 LED 贯穿灯带（静止时无缝连贯，点击时支持沿 Z 轴能量波扫描爆闪）。
 */
function createSegmentedLightbar(
  x: number,
  y: number,
  totalWidth: number,
  height: number,
  depth: number,
  segments: number,
  color: THREE.ColorRepresentation,
  emissiveIntensity: number,
  parent: THREE.Group,
  outList: THREE.Mesh[],
): THREE.Mesh[] {
  const created: THREE.Mesh[] = [];
  const segWidth = totalWidth / segments;
  const segGeo = new THREE.BoxGeometry(depth, height, segWidth + 0.001);

  for (let i = 0; i < segments; i++) {
    const z = -totalWidth / 2 + segWidth * (i + 0.5);
    const seg = createEmissiveLight(segGeo, color, emissiveIntensity);
    seg.position.set(x, y, z);
    // 记录归一化横向位置 [-1, +1] 供能量扫描计算
    seg.userData.scanU = segments === 1 ? 0 : (i / (segments - 1)) * 2 - 1;
    parent.add(seg);
    outList.push(seg);
    created.push(seg);
  }
  return created;
}

/**
 * 构建 Tesla Cybertruck 3D 模型与空气悬架交互动画控制器。
 * 局部坐标系约定：车头朝 +X，车尾朝 -X，左侧 -Z，右侧 +Z；车轮在 root 下，车身在 bodyGroup 下。
 */
export function createCybertruckCar(): CarObject {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const wheels: THREE.Group[] = [];
  const frontLights: THREE.Mesh[] = [];
  const rearLights: THREE.Mesh[] = [];
  const accentLights: THREE.Mesh[] = [];

  // 大号越野黑轮毂挂载在 root（确保悬架蓄力下沉与弹起时轮胎贴地不穿模）
  const wheelRadius = 0.215;
  const wheelMounts = [
    { x: 0.92, y: wheelRadius, z: 0.525 },
    { x: 0.92, y: wheelRadius, z: -0.525 },
    { x: -0.92, y: wheelRadius, z: 0.525 },
    { x: -0.92, y: wheelRadius, z: -0.525 },
  ];
  mountWheels(root, wheels, wheelMounts, {
    radius: wheelRadius,
    width: 0.145,
    rimStyle: 'offroad-black',
  });

  // 冷轧拉丝不锈钢材质（调整 repeat 匹配 ExtrudeGeometry 世界坐标 UV 尺度）
  const brushedTex = createBrushedMetalTexture();
  brushedTex.repeat.set(0.45, 0.45);
  const stainlessMat = createDiecastMaterial(0xe3e8ee, {
    map: brushedTex,
    metalness: 0.78,
    roughness: 0.26,
    clearcoat: 0.55,
    clearcoatRoughness: 0.14,
  });

  const matteBlackMat = new THREE.MeshStandardMaterial({
    color: 0x171a20,
    roughness: 0.78,
    metalness: 0.18,
  });
  const trimBlackMat = createDiecastMaterial(0x13161c, {
    metalness: 0.3,
    roughness: 0.22,
    clearcoat: 0.75,
  });
  const smokedGlassMat = createGlassMaterial({
    color: 0x0f141d,
    opacity: 0.88,
    roughness: 0.04,
  });

  // 1. 不锈钢下车身 + 前鼻楔形外壳（含梯形轮拱切口与后部下凹货斗基准面）
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-1.49, 0.34);
  hullShape.lineTo(-1.26, 0.21);
  // 后梯形轮拱切口（顶边 y = 0.50，留足悬架下沉余量）
  hullShape.lineTo(-1.17, 0.21);
  hullShape.lineTo(-1.06, 0.50);
  hullShape.lineTo(-0.78, 0.50);
  hullShape.lineTo(-0.67, 0.21);
  // 中段底裙
  hullShape.lineTo(0.67, 0.21);
  // 前梯形轮拱切口
  hullShape.lineTo(0.78, 0.50);
  hullShape.lineTo(1.06, 0.50);
  hullShape.lineTo(1.17, 0.21);
  // 前防撞护板与锐利楔形车鼻
  hullShape.lineTo(1.28, 0.21);
  hullShape.lineTo(1.44, 0.30);
  hullShape.lineTo(1.51, 0.568);
  // 倾斜前备箱盖延展至前挡风玻璃下沿
  hullShape.lineTo(1.02, 0.725);
  hullShape.lineTo(0.96, 0.675);
  hullShape.lineTo(-0.42, 0.71);
  // 货斗段下凹至地板基准线
  hullShape.lineTo(-0.42, 0.54);
  hullShape.lineTo(-1.43, 0.54);
  hullShape.lineTo(-1.49, 0.71);
  hullShape.closePath();

  const hullDepth = 1.12;
  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: hullDepth,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  hullGeo.translate(0, 0, -hullDepth / 2);
  const hullMesh = new THREE.Mesh(hullGeo, stainlessMat);
  bodyGroup.add(hullMesh);

  // 2. 货斗两侧三角形楔形飞翼侧墙（左/右夹出真正的下凹式敞开货斗）
  const sailShape = new THREE.Shape();
  sailShape.moveTo(-1.49, 0.53);
  sailShape.lineTo(-0.41, 0.53);
  sailShape.lineTo(-0.41, 0.935);
  sailShape.lineTo(-1.49, 0.715);
  sailShape.closePath();

  const sailGeo = new THREE.ExtrudeGeometry(sailShape, {
    depth: 0.09,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.008,
    bevelSegments: 2,
  });
  sailGeo.translate(0, 0, -0.045);

  for (const side of [-1, 1] as const) {
    const sail = new THREE.Mesh(sailGeo, stainlessMat);
    sail.position.z = side * 0.525;
    bodyGroup.add(sail);
  }

  // 3. 敞开式黑色货斗内衬与防滑条纹地板
  const bedFloor = new THREE.Mesh(
    new THREE.BoxGeometry(1.02, 0.03, 0.95),
    matteBlackMat,
  );
  bedFloor.position.set(-0.92, 0.545, 0);
  bodyGroup.add(bedFloor);

  const ribGeo = new THREE.BoxGeometry(0.94, 0.014, 0.032);
  for (let i = -3; i <= 3; i++) {
    const rib = new THREE.Mesh(ribGeo, trimBlackMat);
    rib.position.set(-0.92, 0.562, i * 0.115);
    bodyGroup.add(rib);
  }

  // 货斗前隔板与尾门内衬、尾门黑色顶盖护板
  const bulkhead = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.39, 0.96),
    matteBlackMat,
  );
  bulkhead.position.set(-0.42, 0.73, 0);
  bodyGroup.add(bulkhead);

  const tailgateInner = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.18, 0.96),
    matteBlackMat,
  );
  tailgateInner.position.set(-1.44, 0.625, 0);
  bodyGroup.add(tailgateInner);

  const tailgateCap = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.025, 1.15),
    matteBlackMat,
  );
  tailgateCap.position.set(-1.48, 0.725, 0);
  bodyGroup.add(tailgateCap);

  // 4. 窄体底盘内衬与轮拱内腔挡板（避免透空穿帮）
  const underbody = new THREE.Mesh(
    new THREE.BoxGeometry(2.64, 0.16, 0.80),
    matteBlackMat,
  );
  underbody.position.set(0, 0.28, 0);
  bodyGroup.add(underbody);

  // 5. 座舱内部结构（冷灰仪表台 + 双赛博座椅）
  const interiorMat = new THREE.MeshStandardMaterial({
    color: 0x242832,
    roughness: 0.85,
  });
  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.86), interiorMat);
  dash.position.set(0.62, 0.72, 0);
  bodyGroup.add(dash);

  for (const sz of [-0.22, 0.22]) {
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.24, 0.26),
      interiorMat,
    );
    seat.position.set(0.18, 0.77, sz);
    seat.rotation.z = 0.22;
    bodyGroup.add(seat);
  }

  // 6. 标志性尖顶三角形前挡风玻璃 + 全景天幕 + 两侧梯形烟熏车窗
  // 前挡风玻璃：精准连接 (1.02, 0.725) 与尖顶 (0.14, 1.055)
  const frontGlassLen = Math.hypot(1.02 - 0.14, 1.055 - 0.725);
  const frontWindshield = new THREE.Mesh(
    new THREE.BoxGeometry(frontGlassLen + 0.02, 0.02, 0.98),
    smokedGlassMat,
  );
  frontWindshield.position.set((1.02 + 0.14) / 2, (0.725 + 1.055) / 2, 0);
  frontWindshield.rotation.z = -Math.atan2(1.055 - 0.725, 1.02 - 0.14);
  bodyGroup.add(frontWindshield);

  // 全景天幕玻璃：精准连接尖顶 (0.14, 1.055) 与后舱尾沿 (-0.42, 0.935)
  const roofGlassLen = Math.hypot(0.14 - -0.42, 1.055 - 0.935);
  const roofGlass = new THREE.Mesh(
    new THREE.BoxGeometry(roofGlassLen + 0.02, 0.02, 0.98),
    smokedGlassMat,
  );
  roofGlass.position.set((0.14 - 0.42) / 2, (1.055 + 0.935) / 2, 0);
  roofGlass.rotation.z = Math.atan2(1.055 - 0.935, 0.14 - -0.42);
  bodyGroup.add(roofGlass);

  // 两侧不锈钢车顶纵梁（Cantrail）与倾斜侧车窗（以 y=0.85 为原点旋转，保证两侧严格对称贴合）
  const sideWinPivotY = 0.85;
  const sideWinShape = new THREE.Shape();
  sideWinShape.moveTo(-0.40, 0.705 - sideWinPivotY);
  sideWinShape.lineTo(0.95, 0.675 - sideWinPivotY);
  sideWinShape.lineTo(0.14, 1.02 - sideWinPivotY);
  sideWinShape.lineTo(-0.40, 0.91 - sideWinPivotY);
  sideWinShape.closePath();

  const sideWinGeo = new THREE.ExtrudeGeometry(sideWinShape, {
    depth: 0.02,
    bevelEnabled: false,
  });
  sideWinGeo.translate(0, 0, -0.01);

  for (const side of [-1, 1] as const) {
    // 侧梯形黑烟玻璃，绕腰窗中线略微内倾营造赛博楔形截面
    const sideWin = new THREE.Mesh(sideWinGeo, smokedGlassMat);
    sideWin.position.set(0, sideWinPivotY, side * 0.53);
    sideWin.rotation.x = side * -0.15;
    bodyGroup.add(sideWin);

    // 锋利 B 柱与 C 柱黑框分割线
    const bPillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.34, 0.03),
      trimBlackMat,
    );
    bPillar.position.set(0.14, 0.85, side * 0.53);
    bPillar.rotation.x = side * -0.15;
    bodyGroup.add(bPillar);

    // 不锈钢 A 柱与顶边梁（连接车身与尖顶天幕）
    const frontBeam = new THREE.Mesh(
      new THREE.BoxGeometry(frontGlassLen + 0.03, 0.036, 0.068),
      stainlessMat,
    );
    frontBeam.position.set((1.02 + 0.14) / 2, (0.725 + 1.055) / 2, side * 0.52);
    frontBeam.rotation.z = -Math.atan2(1.055 - 0.725, 1.02 - 0.14);
    bodyGroup.add(frontBeam);

    const rearBeam = new THREE.Mesh(
      new THREE.BoxGeometry(roofGlassLen + 0.03, 0.036, 0.068),
      stainlessMat,
    );
    rearBeam.position.set((0.14 - 0.42) / 2, (1.055 + 0.935) / 2, side * 0.52);
    rearBeam.rotation.z = Math.atan2(1.055 - 0.935, 0.14 - -0.42);
    bodyGroup.add(rearBeam);

    // 三角形小后视镜
    const mirror = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.045, 0.085),
      trimBlackMat,
    );
    mirror.position.set(0.84, 0.695, side * 0.60);
    bodyGroup.add(mirror);

    // 前后梯形黑色越野轮眉（先设置自身 z 偏移再 add，避免链式调用误改 bodyGroup.position）
    const frontFlare = createTrapezoidFlare(0.92, matteBlackMat);
    frontFlare.position.z = side * 0.562;
    bodyGroup.add(frontFlare);

    const rearFlare = createTrapezoidFlare(-0.92, matteBlackMat);
    rearFlare.position.z = side * 0.562;
    bodyGroup.add(rearFlare);

    // 侧裙越野防擦护板
    const rocker = new THREE.Mesh(
      new THREE.BoxGeometry(1.26, 0.065, 0.07),
      matteBlackMat,
    );
    rocker.position.set(0, 0.225, side * 0.565);
    bodyGroup.add(rocker);
  }

  // 前后黑色越野保险杠
  const frontBumper = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.14, 1.15),
    matteBlackMat,
  );
  frontBumper.position.set(1.42, 0.28, 0);
  frontBumper.rotation.z = -0.25;
  bodyGroup.add(frontBumper);

  const rearBumper = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 0.13, 1.15),
    matteBlackMat,
  );
  rearBumper.position.set(-1.46, 0.28, 0);
  rearBumper.rotation.z = 0.18;
  bodyGroup.add(rearBumper);

  // 7. 核心高光：全宽冰白/冷青 LED 前贯穿式日行灯带 (emissiveIntensity = 2.0) + 全宽赤红后贯穿灯带 (1.9)
  const frontLightbarSegments = createSegmentedLightbar(
    1.518,
    0.565,
    1.12,
    0.036,
    0.036,
    7,
    0xd8f8ff,
    2.0,
    bodyGroup,
    frontLights,
  );

  // 前保险杠两侧辅助照明灯（贴合前杠斜面外缘）
  const bumperLedGeo = new THREE.BoxGeometry(0.025, 0.032, 0.15);
  for (const sz of [-0.42, 0.42]) {
    const auxLed = createEmissiveLight(bumperLedGeo, 0xe0f7ff, 1.25);
    auxLed.position.set(1.495, 0.335, sz);
    auxLed.rotation.z = -0.25;
    bodyGroup.add(auxLed);
    accentLights.push(auxLed);
  }

  const rearLightbarSegments = createSegmentedLightbar(
    -1.505,
    0.70,
    1.12,
    0.038,
    0.036,
    7,
    0xff1e2d,
    1.9,
    bodyGroup,
    rearLights,
  );

  // 精确贴地与交互标记
  groundToZero(root);
  tagCarInteractive(root, CYBERTRUCK_SPEC.id);

  const baseBodyY = bodyGroup.position.y;
  const pulseTimer = createCarPulseTimer(1.45);

  return {
    id: CYBERTRUCK_SPEC.id,
    spec: CYBERTRUCK_SPEC,
    root,
    bodyGroup,
    wheels,
    lights: {
      frontLights,
      rearLights,
      accentLights,
    },
    triggerAnimation(intensity = 1) {
      triggerCarPulse(pulseTimer, intensity);
    },
    update(dt, elapsed) {
      const { active, progress, envelope } = stepCarPulse(pulseTimer, dt);
      if (active) {
        const amp = Math.min(1.25, pulseTimer.intensity);
        // 赛博空气悬架：前段 0~0.25 蓄力下沉，随后弹起至峰值并阻尼回稳
        let suspensionY = 0;
        let pitchZ = 0;
        if (progress < 0.25) {
          const t = progress / 0.25;
          const squat = Math.sin(t * Math.PI * 0.5);
          suspensionY = -0.046 * squat * amp;
          pitchZ = -0.015 * squat * amp;
        } else {
          const t = (progress - 0.25) / 0.75;
          // 从下沉 (-0.046) 弹性跃升 (+0.11) 后阻尼衰减归零
          const lift =
            Math.sin(t * Math.PI * 2.2) * Math.exp(-3.2 * t) * 0.135;
          const recover = -0.046 * (1 - Math.min(1, t * 4));
          suspensionY = (recover + lift) * amp;
          pitchZ = Math.sin(t * Math.PI * 1.8) * Math.exp(-2.8 * t) * 0.038 * amp;
        }

        bodyGroup.position.y = baseBodyY + suspensionY;
        bodyGroup.rotation.z = pitchZ;

        // 越野车轮蓄力起步后高速扭矩转动再平滑收刹
        const torqueCurve =
          progress < 0.25
            ? 3.5 + (progress / 0.25) * 10
            : 20 * (1 - (progress - 0.25) * 0.85);
        spinWheels(wheels, dt * torqueCurve * amp);

        // 前后贯穿灯带能量扫描高亮爆闪
        const scanPos = Math.sin(progress * Math.PI * 3.5);
        const globalStrobe = 1 + Math.abs(Math.sin(progress * Math.PI * 6)) * 0.75 * amp;

        const updateScanBar = (segs: THREE.Mesh[]): void => {
          for (const seg of segs) {
            const u = typeof seg.userData.scanU === 'number' ? seg.userData.scanU : 0;
            const wave = Math.exp(-Math.pow((u - scanPos) * 3.0, 2));
            applyLightPulse([seg], globalStrobe, wave * 2.8 * envelope * amp);
          }
        };
        updateScanBar(frontLightbarSegments);
        updateScanBar(rearLightbarSegments);
        applyLightPulse(accentLights, 1 + 1.8 * envelope * amp);
      } else {
        bodyGroup.position.y = baseBodyY;
        bodyGroup.rotation.z = 0;

        // 待机时保留微弱科幻呼吸感，凸显 Bloom 赛博灯带
        const idlePulse = 0.96 + Math.sin(elapsed * 2.0 + 0.8) * 0.07;
        applyLightPulse(frontLights, idlePulse);
        applyLightPulse(rearLights, idlePulse);
        applyLightPulse(accentLights, 0.85);
      }
    },
  };
}
