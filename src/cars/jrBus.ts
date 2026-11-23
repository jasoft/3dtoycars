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

export const JR_BUS_SPEC: CarSpec = {
  id: 'jr-bus',
  name: 'JR 东北高速巴士',
  englishName: 'JR Bus Tohoku',
  subtitle: '日系红白高速长途客车',
  description:
    '参考桌面正前方的 JR Bus Tohoku 日系高速观光客车。方正修长车身配有亮红车顶与双空调机组、连续深色观光侧窗及前伸式后视镜，车身两侧完整还原红黑银斜切飘带与 JR 绿标涂装。',
  highlights: [
    '亮红高光车顶双空调机组 + 前伸观光后视镜',
    '双侧高清红黑银斜切飘带、JR BUS TOHOKU 与绿标',
    '盛岡・仙台日文 LED 方向牌与多排座椅内构',
    '点击模拟进站气刹点头下蹲、双闪与缓慢停稳',
  ],
  soundLabel: '气刹泄气声 + 车站双音铃 + 大巴喇叭',
  accentColor: '#ef4444',
  accentHex: 0xef4444,
  position: [-0.1, 0.16, 0.75],
  rotationY: Math.PI,
  focusOffset: [-2.85, 1.62, 3.55],
  focusTargetOffset: [0.48, 0.52, 0],
};

const SIDE_PANEL_X_MIN = -1.70;
const SIDE_PANEL_X_MAX = 1.67;
const SIDE_PANEL_LEN = SIDE_PANEL_X_MAX - SIDE_PANEL_X_MIN;
const SIDE_PANEL_Y_MIN = 0.165;
const SIDE_PANEL_Y_MAX = 0.675;
const SIDE_PANEL_H = SIDE_PANEL_Y_MAX - SIDE_PANEL_Y_MIN;
const AXLE_X = 0.98;
const ARCH_CUTOUT_R = 0.228;

/**
 * 绘制 JR Bus Tohoku 两侧高清涂装贴图（1536×256），包含红黑银斜切飘带、
 * JR BUS TOHOKU 标语、尾部绿色 JR 徽标、行李舱门线，并精准挖空前后轮拱。
 */
function createJrBusSideTexture(side: 'left' | 'right'): THREE.CanvasTexture {
  return createCanvasTexture(1536, 256, (ctx, w, h) => {
    const pxPerMeterX = w / SIDE_PANEL_LEN;
    const pxPerMeterY = h / SIDE_PANEL_H;
    const textScaleX = pxPerMeterX / pxPerMeterY;

    // 左侧(-Z)车头在画布左侧；右侧(+Z)车头在画布右侧，保证几何方向与文字读取均不镜像
    const toPxX = (wx: number): number =>
      side === 'left'
        ? ((SIDE_PANEL_X_MAX - wx) / SIDE_PANEL_LEN) * w
        : ((wx - SIDE_PANEL_X_MIN) / SIDE_PANEL_LEN) * w;
    const toPxY = (wy: number): number =>
      ((SIDE_PANEL_Y_MAX - wy) / SIDE_PANEL_H) * h;

    // 1. 亮白底漆
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, w, h);

    // 2. 顶部窗沿亮红腰线与细银黑腰带
    ctx.fillStyle = '#dc1e26';
    ctx.fillRect(0, 0, w, toPxY(0.622));

    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, toPxY(0.622), w, toPxY(0.606) - toPxY(0.622));

    ctx.fillStyle = '#181b22';
    ctx.fillRect(0, toPxY(0.606), w, toPxY(0.588) - toPxY(0.606));

    // 3. 车头段红黑银经典斜切飘带（严格对称于世界坐标 X）
    const fillWorldPoly = (
      color: string,
      pts: Array<[number, number]>,
    ): void => {
      ctx.fillStyle = color;
      ctx.beginPath();
      pts.forEach(([wx, wy], idx) => {
        const x = toPxX(wx);
        const y = toPxY(wy);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
    };

    fillWorldPoly('#dc1e26', [
      [1.67, 0.675],
      [0.44, 0.675],
      [0.74, 0.255],
      [1.22, 0.255],
      [1.22, 0.42],
      [1.67, 0.42],
    ]);

    fillWorldPoly('#d4dae3', [
      [0.44, 0.675],
      [0.35, 0.675],
      [0.65, 0.255],
      [0.74, 0.255],
    ]);

    fillWorldPoly('#171a21', [
      [0.35, 0.675],
      [0.24, 0.675],
      [0.56, 0.255],
      [0.65, 0.255],
    ]);

    // 4. 下裙亮红横向装饰带
    const skirtStart = toPxX(0.62);
    const skirtEnd = toPxX(-1.68);
    ctx.fillStyle = '#dc1e26';
    ctx.fillRect(
      Math.min(skirtStart, skirtEnd),
      toPxY(0.255),
      Math.abs(skirtEnd - skirtStart),
      toPxY(0.195) - toPxY(0.255),
    );

    // 5. 车身中部三段行李舱门缝线与黑色拉手槽
    const bayEdges = [0.54, 0.16, -0.22, -0.58];
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.65)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < bayEdges.length - 1; i++) {
      const x1 = toPxX(bayEdges[i]);
      const x2 = toPxX(bayEdges[i + 1]);
      const leftX = Math.min(x1, x2);
      const boxW = Math.abs(x2 - x1);
      const topY = toPxY(0.47);
      const botY = toPxY(0.185);
      ctx.strokeRect(leftX, topY, boxW, botY - topY);

      // 小型黑色行李舱门锁扣
      ctx.fillStyle = '#334155';
      ctx.fillRect(leftX + boxW * 0.5 - 10, toPxY(0.235), 20, 7);
    }

    // 6. 车身中部清晰 "JR BUS TOHOKU" 字体（使用等比缩放消除画布宽高比拉伸）
    ctx.save();
    const labelCenterX = (toPxX(0.42) + toPxX(-0.62)) / 2;
    const labelCenterY = toPxY(0.515);
    ctx.translate(labelCenterX, labelCenterY);
    ctx.scale(textScaleX, 1);
    ctx.fillStyle = '#141820';
    ctx.font = '800 32px "Inter", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('JR BUS TOHOKU', 0, 0);
    ctx.restore();

    // 7. 尾部绿色 JR 徽标
    ctx.save();
    const jrX = toPxX(-1.33);
    const jrY = toPxY(0.43);
    ctx.translate(jrX, jrY);
    ctx.scale(textScaleX, 1);
    ctx.fillStyle = '#009e49';
    ctx.font = 'italic 900 54px "Arial Black", "Helvetica Neue", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('JR', 0, 0);
    ctx.restore();

    // 8. 轮拱黑色橡胶包边 + 精确椭圆镂空（与 ExtrudeGeometry 圆形轮拱严格对齐）
    const rxPx = ARCH_CUTOUT_R * pxPerMeterX;
    const ryPx = ARCH_CUTOUT_R * pxPerMeterY;
    const archCenterY = toPxY(SIDE_PANEL_Y_MIN);

    for (const axleX of [-AXLE_X, AXLE_X]) {
      const cx = toPxX(axleX);
      ctx.strokeStyle = '#1a1e26';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.ellipse(cx, archCenterY, rxPx + 3, ryPx + 3, 0, Math.PI, Math.PI * 2);
      ctx.stroke();

      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(cx, archCenterY, rxPx, ryPx, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
}

/**
 * 绘制日文 LED 方向牌贴图（盛岡・仙台 / TOHOKU）。
 */
function createDestinationSignTexture(): THREE.CanvasTexture {
  return createCanvasTexture(384, 96, (ctx, w, h) => {
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, w - 6, h - 6);

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 34px "Hiragino Kaku Gothic ProN", "PingFang SC", "Yu Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('盛岡・仙台', w / 2, 34);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 20px "Inter", Arial, sans-serif';
    ctx.fillText('TOHOKU EXPRESS', w / 2, 72);
  });
}

/**
 * 绘制日本高速大巴绿底白字营业车牌。
 */
function createJapaneseBusPlateTexture(): THREE.CanvasTexture {
  return createCanvasTexture(256, 112, (ctx, w, h) => {
    ctx.fillStyle = '#15803d';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#dcfce7';
    ctx.lineWidth = 5;
    ctx.strokeRect(5, 5, w - 10, h - 10);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 24px "Hiragino Kaku Gothic ProN", "PingFang SC", sans-serif';
    ctx.fillText('岩手 200', w / 2, 30);
    ctx.font = 'bold 38px "Arial", monospace';
    ctx.fillText('か 18-04', w / 2, 76);
  });
}

/**
 * 构建 JR Bus Tohoku 东北高速巴士 3D 模型与气刹动画控制器。
 * 局部坐标系约定：车头朝 +X，车尾朝 -X，左侧 -Z，右侧 +Z；车轮在 root 下，车身在 bodyGroup 下。
 */
export function createJrBusCar(): CarObject {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const wheels: THREE.Group[] = [];
  const frontLights: THREE.Mesh[] = [];
  const rearLights: THREE.Mesh[] = [];
  const accentLights: THREE.Mesh[] = [];

  // 四轮挂载于 root（气刹点头下蹲时车轮贴地不动）
  const wheelRadius = 0.165;
  const wheelMounts = [
    { x: AXLE_X, y: wheelRadius, z: 0.515 },
    { x: AXLE_X, y: wheelRadius, z: -0.515 },
    { x: -AXLE_X, y: wheelRadius, z: 0.515 },
    { x: -AXLE_X, y: wheelRadius, z: -0.515 },
  ];
  mountWheels(root, wheels, wheelMounts, {
    radius: wheelRadius,
    width: 0.11,
    rimStyle: 'bus-chrome',
  });

  // 共享材质
  const whitePaintMat = createDiecastMaterial(0xf8fafc, {
    metalness: 0.24,
    roughness: 0.20,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });
  const redPaintMat = createDiecastMaterial(0xdc1e26, {
    metalness: 0.30,
    roughness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });
  const blackGlossMat = createDiecastMaterial(0x13161c, {
    metalness: 0.25,
    roughness: 0.18,
    clearcoat: 0.9,
  });
  const matteTrimMat = new THREE.MeshStandardMaterial({
    color: 0x1b1f27,
    roughness: 0.78,
    metalness: 0.14,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.92,
    roughness: 0.14,
  });
  const busGlassMat = createGlassMaterial({
    color: 0x0e131b,
    opacity: 0.62,
    roughness: 0.05,
    depthWrite: false,
  });

  // 1. 亮白下车身（带真实半圆轮拱镂空与前倾巴士鼻翼）
  const lowerShape = new THREE.Shape();
  lowerShape.moveTo(-1.72, 0.16);
  lowerShape.lineTo(-AXLE_X - ARCH_CUTOUT_R, 0.16);
  lowerShape.absarc(-AXLE_X, 0.165, ARCH_CUTOUT_R, Math.PI, 0, true);
  lowerShape.lineTo(AXLE_X - ARCH_CUTOUT_R, 0.16);
  lowerShape.absarc(AXLE_X, 0.165, ARCH_CUTOUT_R, Math.PI, 0, true);
  lowerShape.lineTo(1.70, 0.17);
  lowerShape.quadraticCurveTo(1.74, 0.26, 1.71, 0.50);
  lowerShape.lineTo(1.66, 0.68);
  lowerShape.lineTo(-1.72, 0.68);
  lowerShape.closePath();

  const lowerDepth = 1.09;
  const lowerGeo = new THREE.ExtrudeGeometry(lowerShape, {
    depth: lowerDepth,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 3,
    curveSegments: 20,
  });
  lowerGeo.translate(0, 0, -lowerDepth / 2);
  const lowerBody = new THREE.Mesh(lowerGeo, whitePaintMat);
  bodyGroup.add(lowerBody);

  // 窄于轮距的内底盘（避免轮拱透空）
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(3.26, 0.18, 0.80),
    matteTrimMat,
  );
  chassis.position.set(0, 0.26, 0);
  bodyGroup.add(chassis);

  // 2. 车身两侧红黑银涂装与 JR BUS TOHOKU / JR 绿标（使用 alphaTest 精确切出轮拱）
  for (const side of [-1, 1] as const) {
    const sideTex = createJrBusSideTexture(side === 1 ? 'right' : 'left');
    const sideMat = new THREE.MeshPhysicalMaterial({
      map: sideTex,
      alphaTest: 0.5,
      roughness: 0.2,
      metalness: 0.12,
      clearcoat: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(SIDE_PANEL_LEN, SIDE_PANEL_H),
      sideMat,
    );
    decal.position.set(
      (SIDE_PANEL_X_MIN + SIDE_PANEL_X_MAX) / 2,
      (SIDE_PANEL_Y_MIN + SIDE_PANEL_Y_MAX) / 2,
      side * 0.573,
    );
    if (side === -1) {
      decal.rotation.y = Math.PI;
    }
    decal.userData.noShadow = true;
    bodyGroup.add(decal);
  }

  // 3. 客舱内部结构（过道地板抬离 lowerBody 顶面 y=0.70 防止共面 Z-fighting）
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(3.15, 0.02, 0.94),
    matteTrimMat,
  );
  floor.position.set(-0.04, 0.712, 0);
  bodyGroup.add(floor);

  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a5f,
    roughness: 0.85,
  });
  const headrestMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.7,
  });
  const seatGeo = new THREE.BoxGeometry(0.16, 0.24, 0.30);
  const headGeo = new THREE.BoxGeometry(0.05, 0.09, 0.24);
  for (let i = 0; i < 7; i++) {
    const sx = -1.32 + i * 0.39;
    for (const sz of [-0.27, 0.27]) {
      const seat = new THREE.Mesh(seatGeo, seatMat);
      seat.position.set(sx, 0.82, sz);
      seat.rotation.z = 0.08;
      bodyGroup.add(seat);

      const head = new THREE.Mesh(headGeo, headrestMat);
      head.position.set(sx - 0.04, 0.95, sz);
      bodyGroup.add(head);
    }
  }
  const driverDash = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.16, 0.92),
    matteTrimMat,
  );
  driverDash.position.set(1.38, 0.785, 0);
  bodyGroup.add(driverDash);

  // 4. 整排连续深色观光侧窗与精致竖向立柱 + 亮黑窗框（ceilingLiner 低于 roofMesh 底面 y=1.10 避免穿插闪烁）
  const ceilingLiner = new THREE.Mesh(
    new THREE.BoxGeometry(3.18, 0.02, 0.98),
    matteTrimMat,
  );
  ceilingLiner.position.set(-0.06, 1.088, 0);
  bodyGroup.add(ceilingLiner);

  const sideWinShape = new THREE.Shape();
  sideWinShape.moveTo(-1.65, 0.685);
  sideWinShape.lineTo(1.63, 0.685);
  sideWinShape.lineTo(1.505, 1.12);
  sideWinShape.lineTo(-1.65, 1.12);
  sideWinShape.closePath();

  const sideWinGeo = new THREE.ExtrudeGeometry(sideWinShape, {
    depth: 0.012,
    bevelEnabled: false,
  });
  sideWinGeo.translate(0, 0, -0.006);

  const mullionGeo = new THREE.BoxGeometry(0.036, 0.445, 0.022);
  const bottomBarGeo = new THREE.BoxGeometry(3.34, 0.042, 0.022);
  const topBarGeo = new THREE.BoxGeometry(3.22, 0.042, 0.022);
  const mullionXs = [1.14, 0.68, 0.22, -0.24, -0.70, -1.16];

  for (const side of [-1, 1] as const) {
    const sideGlass = new THREE.Mesh(sideWinGeo, busGlassMat);
    sideGlass.position.set(0, 0, side * 0.542);
    sideGlass.userData.noShadow = true;
    bodyGroup.add(sideGlass);

    // 上下黑色窗框压条（外表面位于玻璃外侧，零交叉）
    const bottomBar = new THREE.Mesh(bottomBarGeo, blackGlossMat);
    bottomBar.position.set(-0.03, 0.695, side * 0.562);
    bodyGroup.add(bottomBar);

    const topBar = new THREE.Mesh(topBarGeo, blackGlossMat);
    topBar.position.set(-0.09, 1.12, side * 0.562);
    bodyGroup.add(topBar);

    // 竖向窗框立柱
    for (const mx of mullionXs) {
      const mullion = new THREE.Mesh(mullionGeo, blackGlossMat);
      mullion.position.set(mx, 0.905, side * 0.562);
      bodyGroup.add(mullion);
    }

    // A 柱与 C 柱黑红立柱收边（C 柱包覆后角防止后玻璃角缝隙）
    const aPillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.49, 0.055),
      blackGlossMat,
    );
    aPillar.position.set(1.58, 0.90, side * 0.555);
    aPillar.rotation.z = 0.28;
    bodyGroup.add(aPillar);

    const cPillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.46, 0.14),
      redPaintMat,
    );
    cPillar.position.set(-1.67, 0.90, side * 0.51);
    bodyGroup.add(cPillar);

    // 前伸式观光巴士双后视镜小臂
    const mirrorArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.024, 0.024),
      blackGlossMat,
    );
    mirrorArm.position.set(1.68, 1.07, side * 0.60);
    mirrorArm.rotation.y = side * -0.14;
    bodyGroup.add(mirrorArm);

    const mirrorDrop = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.08, 0.022),
      blackGlossMat,
    );
    mirrorDrop.position.set(1.79, 1.03, side * 0.62);
    bodyGroup.add(mirrorDrop);

    const mirrorHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.042, 0.13, 0.065),
      blackGlossMat,
    );
    mirrorHead.position.set(1.79, 0.97, side * 0.625);
    bodyGroup.add(mirrorHead);
  }

  // 5. 亮红车顶、前额头与双空调机组细节
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-1.74, 1.12);
  roofShape.lineTo(1.50, 1.12);
  roofShape.quadraticCurveTo(1.61, 1.12, 1.56, 1.21);
  roofShape.quadraticCurveTo(1.48, 1.26, 1.32, 1.265);
  roofShape.lineTo(-1.62, 1.265);
  roofShape.quadraticCurveTo(-1.74, 1.26, -1.74, 1.16);
  roofShape.closePath();

  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth: 1.08,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.02,
    bevelSegments: 3,
  });
  roofGeo.translate(0, 0, -0.54);
  const roofMesh = new THREE.Mesh(roofGeo, redPaintMat);
  bodyGroup.add(roofMesh);

  // 车顶纵向装饰筋线
  for (const rz of [-0.42, 0.42]) {
    const rib = new THREE.Mesh(
      new THREE.BoxGeometry(2.85, 0.018, 0.035),
      redPaintMat,
    );
    rib.position.set(-0.12, 1.285, rz);
    bodyGroup.add(rib);
  }

  // 双微凸车顶空调机组
  const acBodyGeo = new THREE.BoxGeometry(0.76, 0.068, 0.56);
  const acGrillGeo = new THREE.BoxGeometry(0.62, 0.015, 0.42);
  for (const acX of [0.46, -0.66]) {
    const acPod = new THREE.Mesh(acBodyGeo, redPaintMat);
    acPod.position.set(acX, 1.30, 0);
    bodyGroup.add(acPod);

    const acVent = new THREE.Mesh(acGrillGeo, matteTrimMat);
    acVent.position.set(acX, 1.332, 0);
    bodyGroup.add(acVent);
  }

  // 6. 大倾斜前挡风玻璃、雨刷与盛岡・仙台日文 LED 方向牌
  const frontGlass = new THREE.Mesh(
    new THREE.BoxGeometry(0.025, 0.49, 1.03),
    busGlassMat,
  );
  frontGlass.position.set(1.59, 0.90, 0);
  frontGlass.rotation.z = 0.28;
  frontGlass.userData.noShadow = true;
  bodyGroup.add(frontGlass);

  // 前风挡雨刷
  for (const wz of [-0.22, 0.22]) {
    const wiper = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.016, 0.34),
      blackGlossMat,
    );
    wiper.position.set(1.665, 0.70, wz);
    wiper.rotation.x = 0.16;
    bodyGroup.add(wiper);
  }

  // 前风挡顶部 LED 方向牌（微弱自发光在夜晚/霓虹模式清晰可见）
  const signTex = createDestinationSignTexture();
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    emissiveMap: signTex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.75,
    roughness: 0.25,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const frontSign = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.13), signMat);
  frontSign.position.set(1.565, 1.08, 0);
  // 先绕自身 X 轴后仰、再绕 Y 轴朝向 +X，严格贴合前风挡倾角
  frontSign.rotation.order = 'YXZ';
  frontSign.rotation.y = Math.PI / 2;
  frontSign.rotation.x = -0.28;
  bodyGroup.add(frontSign);

  // 7. 前脸大灯、转向灯、格栅饰条与日系车牌
  const frontBrow = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.055, 1.12),
    redPaintMat,
  );
  frontBrow.position.set(1.69, 0.65, 0);
  bodyGroup.add(frontBrow);

  const frontGrille = new THREE.Mesh(
    new THREE.BoxGeometry(0.032, 0.14, 0.56),
    matteTrimMat,
  );
  frontGrille.position.set(1.735, 0.42, 0);
  bodyGroup.add(frontGrille);

  const chromeBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.032, 0.025, 0.72),
    chromeMat,
  );
  chromeBar.position.set(1.736, 0.495, 0);
  bodyGroup.add(chromeBar);

  const busHeadlightGeo = new THREE.BoxGeometry(0.034, 0.072, 0.16);
  const busBlinkerGeo = new THREE.BoxGeometry(0.034, 0.048, 0.075);
  for (const sz of [-0.41, 0.41]) {
    const headlight = createEmissiveLight(busHeadlightGeo, 0xfff5dc, 1.5);
    headlight.position.set(1.738, 0.365, sz);
    bodyGroup.add(headlight);
    frontLights.push(headlight);

    const frontBlinker = createEmissiveLight(busBlinkerGeo, 0xff9f1c, 0.9);
    frontBlinker.position.set(1.728, 0.44, sz * 1.16);
    bodyGroup.add(frontBlinker);
    accentLights.push(frontBlinker);
  }

  const plateMat = new THREE.MeshStandardMaterial({
    map: createJapaneseBusPlateTexture(),
    roughness: 0.35,
  });
  const frontPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.105),
    plateMat,
  );
  frontPlate.position.set(1.748, 0.255, 0);
  frontPlate.rotation.y = Math.PI / 2;
  bodyGroup.add(frontPlate);

  // 8. 车尾细节：后挡风玻璃、尾灯、后双闪转向灯与车牌
  const rearGlass = new THREE.Mesh(
    new THREE.BoxGeometry(0.025, 0.36, 0.92),
    busGlassMat,
  );
  rearGlass.position.set(-1.735, 0.94, 0);
  rearGlass.userData.noShadow = true;
  bodyGroup.add(rearGlass);

  const rearSign = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.10), signMat);
  rearSign.position.set(-1.752, 1.07, 0);
  rearSign.rotation.y = -Math.PI / 2;
  bodyGroup.add(rearSign);

  const rearLouver = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.16, 0.62),
    matteTrimMat,
  );
  rearLouver.position.set(-1.742, 0.42, 0);
  bodyGroup.add(rearLouver);

  const tailGeo = new THREE.BoxGeometry(0.032, 0.12, 0.085);
  const rearTurnGeo = new THREE.BoxGeometry(0.032, 0.055, 0.085);
  for (const sz of [-0.45, 0.45]) {
    const taillight = createEmissiveLight(tailGeo, 0xff1f28, 1.45);
    taillight.position.set(-1.745, 0.38, sz);
    bodyGroup.add(taillight);
    rearLights.push(taillight);

    const rearBlinker = createEmissiveLight(rearTurnGeo, 0xff9f1c, 0.9);
    rearBlinker.position.set(-1.745, 0.48, sz);
    bodyGroup.add(rearBlinker);
    accentLights.push(rearBlinker);
  }

  const rearPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.105),
    plateMat,
  );
  rearPlate.position.set(-1.756, 0.255, 0);
  rearPlate.rotation.y = -Math.PI / 2;
  bodyGroup.add(rearPlate);

  // 精准接地并标记交互
  groundToZero(root);
  tagCarInteractive(root, JR_BUS_SPEC.id);

  const baseBodyY = bodyGroup.position.y;
  const pulseTimer = createCarPulseTimer(1.65);

  return {
    id: JR_BUS_SPEC.id,
    spec: JR_BUS_SPEC,
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
      const { active, progress } = stepCarPulse(pulseTimer, dt);
      if (active) {
        const amp = Math.min(1.2, pulseTimer.intensity);
        // 气动刹车：先缓慢收刹停止转动，同时车身向前点头并轻微下蹲回弹
        if (progress < 0.62) {
          const brakeRatio = 1 - progress / 0.62;
          spinWheels(wheels, dt * 15 * brakeRatio * brakeRatio * amp);
        }

        // 前段 0~0.36 进站制动下蹲点头，后段 0.36~1.0 气动回弹归位
        let heaveY = 0;
        let pitchZ = 0;
        if (progress < 0.36) {
          const t = progress / 0.36;
          const easeIn = Math.sin(t * Math.PI * 0.5);
          heaveY = -0.022 * easeIn * amp;
          pitchZ = -0.022 * easeIn * amp;
        } else {
          const t = (progress - 0.36) / 0.64;
          const spring = Math.cos(t * Math.PI * 1.5) * Math.exp(-3.0 * t);
          heaveY = -0.022 * spring * amp;
          pitchZ = -0.022 * spring * amp;
        }
        bodyGroup.position.y = baseBodyY + heaveY;
        bodyGroup.rotation.z = pitchZ;

        // 进站停靠前后双闪脉冲
        const hazard = Math.max(0, Math.sin(progress * Math.PI * 7));
        applyLightPulse(frontLights, 1 + hazard * 0.65 * amp);
        applyLightPulse(rearLights, 1.15 + hazard * 1.05 * amp, hazard * 0.3);
        applyLightPulse(accentLights, 0.75 + hazard * 2.5 * amp, hazard * 0.85);
      } else {
        bodyGroup.position.y = baseBodyY;
        bodyGroup.rotation.z = 0;
        const idle = 0.95 + Math.sin(elapsed * 1.8 + 1.4) * 0.06;
        applyLightPulse(frontLights, idle);
        applyLightPulse(rearLights, idle);
        applyLightPulse(accentLights, 0.45);
      }
    },
  };
}
