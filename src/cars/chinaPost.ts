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
import { createCanvasTexture } from '../utils/textures';

export const CHINA_POST_SPEC: CarSpec = {
  id: 'china-post',
  name: '中国邮政微电小车',
  englishName: 'China Post EV',
  subtitle: '复古翠绿微面邮递车',
  description:
    '参考桌面实拍左下角的中国邮政新能源微型邮递车。圆润可爱的微电车身采用翠绿合金清漆，搭配亮黑悬浮车顶与大面积烟熏车窗，左右车门均清晰印制黄色邮政飞翼徽标与双语字样。',
  highlights: [
    '翠绿金属合金漆面 + 亮黑悬浮车顶与立柱',
    '双侧正面高清中国邮政飞翼徽标与中英字样',
    '新能源渐变绿牌照与五辐银色合金轮毂',
    '点击触发欢快弹性双跳、双闪警示与四轮快转',
  ],
  soundLabel: '清脆双响电车喇叭 + 新能源提示和弦',
  accentColor: '#16a34a',
  accentHex: 0x16a34a,
  position: [-4.8, 0.16, 0.75],
  rotationY: Math.PI - 0.35,
  focusOffset: [-2.25, 1.32, 2.75],
  focusTargetOffset: [0.35, 0.38, 0],
};

/**
 * 绘制中国邮政车门涂装贴图（透明底叠加在翠绿清漆车身上，保持左右两侧文字均正向可读）。
 */
function createChinaPostDoorTexture(side: 'left' | 'right'): THREE.CanvasTexture {
  return createCanvasTexture(512, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);

    // 车门轮廓缝线与黑色门把手，增强微电车门板立体层次
    ctx.strokeStyle = 'rgba(5, 46, 22, 0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(14, 14, w - 28, h - 26, 22);
    ctx.stroke();

    // 门把手靠近车尾方向（右侧面车尾在左、左侧面车尾在右）
    const handleX = side === 'left' ? w - 74 : 44;
    ctx.fillStyle = '#15191e';
    ctx.beginPath();
    ctx.roundRect(handleX, 34, 34, 12, 5);
    ctx.fill();

    // 黄色邮政飞翼徽标（左/右均保持徽标在左侧、文字正向从左向右排布，确保清晰可读）
    const cx = 112;
    const cy = h * 0.52;
    ctx.fillStyle = '#facc15';

    // 上下三道飞翼速度条纹
    for (let i = 0; i < 3; i++) {
      const yOffset = (i - 1) * 16;
      const barLen = 54 - i * 8;
      ctx.beginPath();
      ctx.moveTo(cx - 56, cy + yOffset - 4);
      ctx.lineTo(cx - 56 + barLen, cy + yOffset - 4);
      ctx.lineTo(cx - 64 + barLen, cy + yOffset + 4);
      ctx.lineTo(cx - 64, cy + yOffset + 4);
      ctx.closePath();
      ctx.fill();
    }

    // 邮徽信封/飞翼核心折角图形
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 22);
    ctx.lineTo(cx + 38, cy - 22);
    ctx.lineTo(cx + 22, cy + 2);
    ctx.lineTo(cx + 34, cy + 22);
    ctx.lineTo(cx - 22, cy + 22);
    ctx.lineTo(cx - 8, cy - 2);
    ctx.closePath();
    ctx.fill();

    // 中文与英文品牌字样
    ctx.fillStyle = '#fde047';
    ctx.textBaseline = 'middle';
    ctx.font = '900 46px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
    ctx.fillText('中国邮政', 176, cy - 16);

    ctx.font = '700 24px "Inter", "Helvetica Neue", Arial, sans-serif';
    ctx.fillStyle = '#fef08a';
    ctx.fillText('CHINA POST', 180, cy + 26);
  });
}

/**
 * 绘制新能源渐变绿微型牌照贴图。
 */
function createNevPlateTexture(): THREE.CanvasTexture {
  return createCanvasTexture(256, 96, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#f0fdf4');
    grad.addColorStop(0.55, '#86efac');
    grad.addColorStop(1, '#22c55e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#14532d';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 34px "PingFang SC", "Microsoft YaHei", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('京A·D0816', w / 2, h / 2 + 2);
  });
}

/**
 * 构建中国邮政微型电动车 3D 模型与动画控制器。
 * 局部坐标系约定：车头朝 +X，车尾朝 -X，左侧 -Z，右侧 +Z；车轮直接挂载于 root，车身置于 bodyGroup。
 */
export function createChinaPostCar(): CarObject {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const wheels: THREE.Group[] = [];
  const frontLights: THREE.Mesh[] = [];
  const rearLights: THREE.Mesh[] = [];
  const accentLights: THREE.Mesh[] = [];

  // 四轮挂载于 root（不随 bodyGroup 弹跳，避免穿模）
  const wheelRadius = 0.145;
  const wheelMounts = [
    { x: 0.49, y: wheelRadius, z: 0.425 },
    { x: 0.49, y: wheelRadius, z: -0.425 },
    { x: -0.49, y: wheelRadius, z: 0.425 },
    { x: -0.49, y: wheelRadius, z: -0.425 },
  ];
  mountWheels(root, wheels, wheelMounts, {
    radius: wheelRadius,
    width: 0.095,
    rimStyle: 'silver-5spoke',
  });

  // 共享材质
  const greenPaintMat = createDiecastMaterial(0x0f6d3a, {
    metalness: 0.34,
    roughness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });
  const blackGlossMat = createDiecastMaterial(0x14171c, {
    metalness: 0.28,
    roughness: 0.16,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x1a1d24,
    roughness: 0.72,
    metalness: 0.15,
  });
  const glassMat = createGlassMaterial({
    color: 0x111722,
    opacity: 0.84,
    roughness: 0.05,
  });

  // 1. 翠绿下车身主体（带真实半圆轮拱镂空与圆润导角）
  const archRadius = 0.192;
  const lowerShape = new THREE.Shape();
  lowerShape.moveTo(-0.82, 0.14);
  lowerShape.lineTo(-0.49 - archRadius, 0.14);
  lowerShape.absarc(-0.49, 0.145, archRadius, Math.PI, 0, true);
  lowerShape.lineTo(0.49 - archRadius, 0.14);
  lowerShape.absarc(0.49, 0.145, archRadius, Math.PI, 0, true);
  lowerShape.lineTo(0.81, 0.15);
  lowerShape.quadraticCurveTo(0.85, 0.24, 0.83, 0.34);
  lowerShape.quadraticCurveTo(0.75, 0.46, 0.50, 0.51);
  lowerShape.lineTo(-0.79, 0.50);
  lowerShape.quadraticCurveTo(-0.84, 0.46, -0.84, 0.20);
  lowerShape.closePath();

  const lowerDepth = 0.86;
  const lowerGeo = new THREE.ExtrudeGeometry(lowerShape, {
    depth: lowerDepth,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.03,
    bevelSegments: 4,
    curveSegments: 20,
  });
  // ExtrudeGeometry 默认沿 +Z 从 0 挤出，平移至 Z=0 居中（外侧面位于 ±(0.43 + 0.045) = ±0.475）
  lowerGeo.translate(0, 0, -lowerDepth / 2);
  const lowerBody = new THREE.Mesh(lowerGeo, greenPaintMat);
  bodyGroup.add(lowerBody);

  // 2. 窄于轮距的内底盘与轮拱内衬，防止从轮拱空隙透光
  const chassisMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.52, 0.16, 0.66),
    trimMat,
  );
  chassisMesh.position.set(0, 0.21, 0);
  bodyGroup.add(chassisMesh);

  const archWellGeo = new THREE.CylinderGeometry(
    archRadius * 0.94,
    archRadius * 0.94,
    0.68,
    18,
    1,
    false,
    -Math.PI / 2,
    Math.PI,
  );
  // Rx(-PI/2) 将 +Z 半圆柱翻转为朝上 +Y 的轮拱上罩，确保底部绝不低于轮轴
  archWellGeo.rotateX(-Math.PI / 2);
  for (const ax of [-0.49, 0.49]) {
    const well = new THREE.Mesh(archWellGeo, trimMat);
    well.position.set(ax, 0.145, 0);
    bodyGroup.add(well);
  }

  // 3. 内部简化座舱（双座 + 仪表台），配合透明烟熏玻璃展现真实纵深
  const interiorMat = new THREE.MeshStandardMaterial({
    color: 0x2a2f3a,
    roughness: 0.85,
  });
  const seatGeo = new THREE.BoxGeometry(0.18, 0.24, 0.22);
  for (const sz of [-0.18, 0.18]) {
    const seat = new THREE.Mesh(seatGeo, interiorMat);
    seat.position.set(-0.08, 0.60, sz);
    seat.rotation.z = 0.14;
    bodyGroup.add(seat);
  }
  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.14, 0.68), interiorMat);
  dash.position.set(0.28, 0.56, 0);
  bodyGroup.add(dash);

  // 4. 亮黑悬浮车顶 + A/B/C 柱框架
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.74, 0.88);
  roofShape.quadraticCurveTo(-0.70, 0.94, -0.58, 0.945);
  roofShape.lineTo(0.16, 0.945);
  roofShape.quadraticCurveTo(0.27, 0.94, 0.30, 0.88);
  roofShape.lineTo(-0.74, 0.88);

  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth: 0.74,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.015,
    bevelSegments: 3,
  });
  roofGeo.translate(0, 0, -0.37);
  const roofMesh = new THREE.Mesh(roofGeo, blackGlossMat);
  bodyGroup.add(roofMesh);

  // 左右对称立柱与侧窗玻璃（A/B/C 柱略微向内收分，还原可爱微车上窄下宽比例）
  const buildSideGreenhouse = (side: 1 | -1): void => {
    const zBase = side * 0.435;
    const pillarSpecs: Array<{
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      thickness: number;
    }> = [
      // A 柱
      { x0: 0.50, y0: 0.51, x1: 0.27, y1: 0.89, thickness: 0.048 },
      // B 柱
      { x0: -0.14, y0: 0.51, x1: -0.14, y1: 0.89, thickness: 0.065 },
      // C 柱
      { x0: -0.78, y0: 0.50, x1: -0.69, y1: 0.89, thickness: 0.085 },
    ];

    for (const p of pillarSpecs) {
      const dx = p.x1 - p.x0;
      const dy = p.y1 - p.y0;
      const len = Math.hypot(dx, dy);
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(p.thickness, len, 0.055),
        blackGlossMat,
      );
      pillar.position.set((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, zBase);
      pillar.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
      pillar.rotation.x = side * -0.11;
      bodyGroup.add(pillar);
    }

    // 侧门大面积烟熏玻璃（以腰线中点 y=0.70 为局部原点，确保内倾角旋转后左右严格对称）
    const winShape = new THREE.Shape();
    winShape.moveTo(-0.68, -0.18);
    winShape.lineTo(0.46, -0.18);
    winShape.lineTo(0.25, 0.18);
    winShape.lineTo(-0.66, 0.18);
    winShape.closePath();

    const winGeo = new THREE.ExtrudeGeometry(winShape, {
      depth: 0.018,
      bevelEnabled: false,
    });
    winGeo.translate(0, 0, -0.009);
    const winMesh = new THREE.Mesh(winGeo, glassMat);
    winMesh.position.set(0, 0.70, side * 0.432);
    winMesh.rotation.x = side * -0.11;
    bodyGroup.add(winMesh);

    // 亮黑小巧后视镜
    const mirrorArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.024, 0.065),
      blackGlossMat,
    );
    mirrorArm.position.set(0.36, 0.555, side * 0.48);
    bodyGroup.add(mirrorArm);

    const mirrorCap = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.048, 0.068),
      blackGlossMat,
    );
    mirrorCap.position.set(0.35, 0.57, side * 0.515);
    bodyGroup.add(mirrorCap);

    // 车身两侧中国邮政飞翼与文字涂装（均采用独立 Canvas 纹理，保证左右正面不镜像）
    const doorTex = createChinaPostDoorTexture(side === 1 ? 'right' : 'left');
    const doorMat = new THREE.MeshPhysicalMaterial({
      map: doorTex,
      transparent: true,
      alphaTest: 0.04,
      depthWrite: false,
      roughness: 0.24,
      metalness: 0.15,
      clearcoat: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const doorDecal = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 0.28),
      doorMat,
    );
    doorDecal.position.set(-0.02, 0.345, side * 0.478);
    if (side === -1) {
      doorDecal.rotation.y = Math.PI;
    }
    doorDecal.userData.noShadow = true;
    bodyGroup.add(doorDecal);
  };

  buildSideGreenhouse(1);
  buildSideGreenhouse(-1);

  // 前风挡与后尾门玻璃（使用绕 Z 轴倾斜的薄盒体，避免多轴欧拉角顺序偏差）
  const frontGlass = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.44, 0.78),
    glassMat,
  );
  frontGlass.position.set(0.385, 0.70, 0);
  frontGlass.rotation.z = 0.544;
  bodyGroup.add(frontGlass);

  const rearGlass = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.40, 0.76),
    glassMat,
  );
  rearGlass.position.set(-0.735, 0.695, 0);
  rearGlass.rotation.z = -0.227;
  bodyGroup.add(rearGlass);

  // 5. 前脸细节：小黑中网、圆形/椭圆大灯、转向灯与新能源牌照
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.085, 0.42), blackGlossMat);
  grille.position.set(0.854, 0.35, 0);
  bodyGroup.add(grille);

  const lowerBumper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.74), trimMat);
  lowerBumper.position.set(0.85, 0.20, 0);
  bodyGroup.add(lowerBumper);

  const headLightGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.042, 18);
  headLightGeo.rotateZ(Math.PI / 2);
  const turnDotGeo = new THREE.SphereGeometry(0.019, 12, 12);

  for (const sz of [-0.30, 0.30]) {
    const headlight = createEmissiveLight(headLightGeo, 0xfff5d8, 1.5);
    headlight.position.set(0.856, 0.355, sz);
    headlight.scale.set(1, 0.82, 1.15);
    bodyGroup.add(headlight);
    frontLights.push(headlight);

    const frontBlinker = createEmissiveLight(turnDotGeo, 0xffaa1d, 0.9);
    frontBlinker.position.set(0.856, 0.305, sz * 1.18);
    bodyGroup.add(frontBlinker);
    accentLights.push(frontBlinker);
  }

  const plateMat = new THREE.MeshStandardMaterial({
    map: createNevPlateTexture(),
    roughness: 0.35,
    metalness: 0.1,
  });
  const frontPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.078), plateMat);
  frontPlate.position.set(0.875, 0.225, 0);
  frontPlate.rotation.y = Math.PI / 2;
  bodyGroup.add(frontPlate);

  // 6. 车尾细节：尾灯、后双闪转向灯与尾部牌照
  const tailLightGeo = new THREE.BoxGeometry(0.036, 0.10, 0.085);
  const rearBlinkerGeo = new THREE.BoxGeometry(0.036, 0.036, 0.065);
  for (const sz of [-0.34, 0.34]) {
    const taillight = createEmissiveLight(tailLightGeo, 0xff242c, 1.45);
    taillight.position.set(-0.866, 0.39, sz);
    bodyGroup.add(taillight);
    rearLights.push(taillight);

    const rearBlinker = createEmissiveLight(rearBlinkerGeo, 0xffaa1d, 0.9);
    rearBlinker.position.set(-0.866, 0.315, sz);
    bodyGroup.add(rearBlinker);
    accentLights.push(rearBlinker);
  }

  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.075, 0.74), trimMat);
  rearBumper.position.set(-0.862, 0.19, 0);
  bodyGroup.add(rearBumper);

  const rearPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.078), plateMat);
  rearPlate.position.set(-0.878, 0.25, 0);
  rearPlate.rotation.y = -Math.PI / 2;
  bodyGroup.add(rearPlate);

  // 精准接地并写入交互标识
  groundToZero(root);
  tagCarInteractive(root, CHINA_POST_SPEC.id);

  // 记录接地后的 bodyGroup 基准 Y，点击弹跳仅作用于 bodyGroup
  const baseBodyY = bodyGroup.position.y;
  const pulseTimer = createCarPulseTimer(1.25);

  return {
    id: CHINA_POST_SPEC.id,
    spec: CHINA_POST_SPEC,
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
        // 欢快弹性双跳：前段大跳 + 后段俏皮回弹小跳
        const hop1 =
          progress < 0.5
            ? Math.sin((progress / 0.5) * Math.PI) * 0.155
            : 0;
        const hop2 =
          progress >= 0.5 && progress < 0.88
            ? Math.sin(((progress - 0.5) / 0.38) * Math.PI) * 0.075
            : 0;
        const amp = Math.min(1.35, pulseTimer.intensity);
        bodyGroup.position.y = baseBodyY + (hop1 + hop2) * amp;
        bodyGroup.rotation.z =
          Math.sin(progress * Math.PI * 4) * 0.045 * envelope;
        bodyGroup.rotation.x =
          Math.sin(progress * Math.PI * 6) * 0.035 * envelope;

        // 四轮随欢快节奏快速向前滚动
        spinWheels(wheels, dt * (20 * (1 - progress * 0.65) * amp));

        // 前后车灯与双闪脉冲
        const hazardWave = Math.max(0, Math.sin(progress * Math.PI * 8));
        const flashPulse = 1 + hazardWave * 1.45 * amp;
        applyLightPulse(frontLights, flashPulse, hazardWave * 0.4);
        applyLightPulse(rearLights, flashPulse, hazardWave * 0.35);
        applyLightPulse(accentLights, 0.8 + hazardWave * 2.6 * amp, hazardWave * 0.9);
      } else {
        bodyGroup.position.y = baseBodyY;
        bodyGroup.rotation.z = 0;
        bodyGroup.rotation.x = 0;
        // 静置待机微弱呼吸灯效
        const idle = 0.95 + Math.sin(elapsed * 2.2) * 0.08;
        applyLightPulse(frontLights, idle);
        applyLightPulse(rearLights, idle);
        applyLightPulse(accentLights, 0.55);
      }
    },
  };
}
