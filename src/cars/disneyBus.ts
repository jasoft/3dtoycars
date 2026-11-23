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

export const DISNEY_BUS_SPEC: CarSpec = {
  id: 'disney-bus',
  name: '迪士尼米奇双层巴士',
  englishName: 'Disney Motors Mickey Bus',
  subtitle: '复古伦敦双层巴士 · 透明天窗版',
  description:
    '精细再现经典 Disney Motors 米奇双层巴士：上层深烟熏半透明穹顶搭配标志性黑色米奇双耳轮廓，内舱可见两排暖橙发光座椅；中层绯红腰带绘有 DISNEY MOTORS 与 08 徽章，下层纯白车身绘有米奇插画与复古字体，配合半凸引擎盖、波点中网与亮黄复古轮圈。',
  highlights: [
    '半透明烟熏天窗 + 黑色米奇双耳顶',
    '双排暖橙自发光上层座椅内舱',
    '绯红腰线 + 米奇复古纯白涂装',
    '复古圆灯波点中网 + 开放式尾梯',
  ],
  soundLabel: '复古铜铃叮叮 + 卡通马林巴琶音 + 老爷车喇叭',
  accentColor: '#f43f5e',
  accentHex: 0xf43f5e,
  position: [4.4, 0.16, 0.75],
  rotationY: Math.PI,
  focusOffset: [-2.85, 1.68, 3.55],
  focusTargetOffset: [0.48, 0.68, 0],
};

const BUS_CRIMSON = '#d91e2a';
const BUS_WHITE = '#f8fafc';
const BUS_BLACK = '#15171c';
const WHEEL_RADIUS = 0.17;

/**
 * 在 Canvas 上绘制经典黑色米奇三圆剪影图标。
 */
function drawMickeySilhouette(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  headRadius: number,
  color = BUS_BLACK,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, headRadius, 0, Math.PI * 2);
  ctx.fill();

  const earRadius = headRadius * 0.62;
  const earDx = headRadius * 0.88;
  const earDy = headRadius * 0.88;

  ctx.beginPath();
  ctx.arc(cx - earDx, cy - earDy, earRadius, 0, Math.PI * 2);
  ctx.arc(cx + earDx, cy - earDy, earRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * 在 Canvas 上绘制复古黑白米奇头像插画（笑脸、面罩轮廓、眼鼻与圆耳）。
 */
function drawClassicMickeyFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // 黑色圆头与双耳底形
  drawMickeySilhouette(ctx, 0, 4, 24, '#111318');

  // 米奇经典双弧形白色脸庞面罩
  ctx.fillStyle = '#fff9f2';
  ctx.beginPath();
  ctx.ellipse(-7, -2, 8.5, 11, -0.1, 0, Math.PI * 2);
  ctx.ellipse(7, -2, 8.5, 11, 0.1, 0, Math.PI * 2);
  ctx.ellipse(0, 10, 17, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // 微笑大嘴与下巴轮廓
  ctx.fillStyle = '#111318';
  ctx.beginPath();
  ctx.arc(0, 12, 9.5, 0.15, Math.PI - 0.15);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f43f5e';
  ctx.beginPath();
  ctx.ellipse(0, 17.5, 4.8, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // 眼睛
  ctx.fillStyle = '#111318';
  ctx.beginPath();
  ctx.ellipse(-4.8, -1.5, 2.4, 5.0, 0, 0, Math.PI * 2);
  ctx.ellipse(4.8, -1.5, 2.4, 5.0, 0, 0, Math.PI * 2);
  ctx.fill();

  // 眼睛高光点
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-5.4, -3.2, 0.9, 0, Math.PI * 2);
  ctx.arc(4.2, -3.2, 0.9, 0, Math.PI * 2);
  ctx.fill();

  // 标志性圆润黑鼻头
  ctx.fillStyle = '#111318';
  ctx.beginPath();
  ctx.ellipse(0, 6.2, 5.2, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * 生成中层绯红涂装腰带纹理。
 * 注意：+Z（右）与 -Z（左）均保持文字正常从左向右排版，仅按车头方向镜像布局位置。
 */
function createCrimsonBeltTexture(frontOnRight: boolean): THREE.CanvasTexture {
  return createCanvasTexture(1024, 192, (ctx, w, h) => {
    ctx.fillStyle = BUS_CRIMSON;
    ctx.fillRect(0, 0, w, h);

    // 顶部黑色窗台压边线与底部复古白色饰条
    ctx.fillStyle = '#16181d';
    ctx.fillRect(0, 0, w, 12);

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, h - 18, w, 10);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(0, h - 8, w, 8);

    // 布局坐标：车头端放置米奇剪影图标，车尾端放置 08 MOTORS H&L 黑底徽章
    const mickeyX = frontOnRight ? w * 0.84 : w * 0.16;
    const badgeX = frontOnRight ? w * 0.08 : w * 0.92;
    const textCenterX = frontOnRight ? w * 0.49 : w * 0.51;

    drawMickeySilhouette(ctx, mickeyX, h * 0.48, 22, '#111318');

    // DISNEY MOTORS 经典字样
    ctx.fillStyle = '#111318';
    ctx.font = '900 54px "Trebuchet MS", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DISNEY MOTORS', textCenterX, h * 0.49);

    // 尾部 08 MOTORS H&L 方形黑徽章
    const bw = 98;
    const bh = 110;
    ctx.fillStyle = '#14161b';
    ctx.fillRect(badgeX - bw / 2, h * 0.46 - bh / 2, bw, bh);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(badgeX - bw / 2 + 4, h * 0.46 - bh / 2 + 4, bw - 8, bh - 8);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 40px "Helvetica Neue", Arial, sans-serif';
    ctx.fillText('08', badgeX, h * 0.34);

    ctx.font = '700 16px "Helvetica Neue", Arial, sans-serif';
    ctx.fillText('MOTORS', badgeX, h * 0.56);
    ctx.font = '600 14px "Helvetica Neue", Arial, sans-serif';
    ctx.fillText('H&L', badgeX, h * 0.69);
  });
}

/**
 * 生成下层亮白车身侧涂装纹理（4 扇圆角小车窗 + 米奇头像插画 + 复古运输字体）。
 */
function createLowerWhiteTexture(frontOnRight: boolean): THREE.CanvasTexture {
  return createCanvasTexture(1024, 320, (ctx, w, h) => {
    ctx.fillStyle = BUS_WHITE;
    ctx.fillRect(0, 0, w, h);

    // 门板分割暗线
    ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
    ctx.fillRect(0, h - 10, w, 10);

    // 4 扇圆角小车窗（位于白腰带上半部分）
    const winCount = 4;
    const marginX = 76;
    const gap = 26;
    const winAreaW = w - marginX * 2;
    const winW = (winAreaW - gap * (winCount - 1)) / winCount;
    const winH = 98;
    const winY = 24;

    for (let i = 0; i < winCount; i++) {
      const wx = marginX + i * (winW + gap);
      // 黑色橡胶框
      ctx.fillStyle = '#181b22';
      ctx.beginPath();
      ctx.roundRect(wx - 5, winY - 5, winW + 10, winH + 10, 18);
      ctx.fill();

      // 深色渐变反光玻璃窗内面
      const glassGrad = ctx.createLinearGradient(wx, winY, wx, winY + winH);
      glassGrad.addColorStop(0, '#1e2633');
      glassGrad.addColorStop(0.45, '#2b3648');
      glassGrad.addColorStop(1, '#11161f');
      ctx.fillStyle = glassGrad;
      ctx.beginPath();
      ctx.roundRect(wx, winY, winW, winH, 13);
      ctx.fill();

      // 斜向玻璃反光高光条
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.beginPath();
      ctx.moveTo(wx + 18, winY + 6);
      ctx.lineTo(wx + 44, winY + 6);
      ctx.lineTo(wx + 22, winY + winH - 6);
      ctx.lineTo(wx + 4, winY + winH - 6);
      ctx.closePath();
      ctx.fill();
    }

    // 车窗下方（避开后轮眉区域）：米奇头像插画 + 复古文字
    // x ∈ [-1.16, +0.92] 中，后轮眉占靠近车尾侧的 [0.089, 0.276]（或左侧视角的 [0.724, 0.911]）
    const mickeyFaceX = frontOnRight ? w * 0.84 : w * 0.16;
    const textCenterX = frontOnRight ? w * 0.52 : w * 0.48;

    drawClassicMickeyFace(ctx, mickeyFaceX, 224, 1.42);

    // 复古装饰横线 + TRANSPORT / Double Decker Bus / MICKEY MOUSE
    ctx.fillStyle = '#111318';
    ctx.strokeStyle = '#111318';
    ctx.lineWidth = 2.5;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 第一行：横线夹心 TRANSPORT
    ctx.font = '700 17px "Helvetica Neue", Arial, sans-serif';
    ctx.fillText('TRANSPORT', textCenterX, 174);
    ctx.beginPath();
    ctx.moveTo(textCenterX - 138, 174);
    ctx.lineTo(textCenterX - 64, 174);
    ctx.moveTo(textCenterX + 64, 174);
    ctx.lineTo(textCenterX + 138, 174);
    ctx.stroke();

    // 第二行：斜体衬线 Double Decker Bus
    ctx.font = 'italic 700 34px Georgia, "Times New Roman", serif';
    ctx.fillText('Double Decker Bus', textCenterX, 214);

    // 第三行：横线托底 + 粗体 MICKEY MOUSE
    ctx.beginPath();
    ctx.moveTo(textCenterX - 146, 238);
    ctx.lineTo(textCenterX + 146, 238);
    ctx.stroke();

    ctx.font = '900 28px "Arial Black", Impact, sans-serif';
    ctx.fillText('MICKEY MOUSE', textCenterX, 266);
  });
}

/**
 * 构建带真实后轮拱半圆镂空的下层白车身侧面几何体，避免车轮与侧板穿模。
 * 同样保持 +Z / -Z 两侧文本从左到右正面可读。
 */
function createLowerSidePanelGeo(frontOnRight: boolean): THREE.ShapeGeometry {
  const minX = -1.16;
  const maxX = 0.92;
  const minY = 0.24;
  const maxY = 0.70;
  const archWorldX = -0.78;
  const archY = 0.17;
  const archR = 0.205;

  const mapX = (wx: number) => (frontOnRight ? wx : -wx);
  const shape = new THREE.Shape();

  if (frontOnRight) {
    shape.moveTo(minX, minY);
    shape.lineTo(archWorldX - archR, minY);
    shape.absarc(archWorldX, archY, archR, Math.PI * 0.89, Math.PI * 0.11, true);
    shape.lineTo(maxX, minY);
    shape.lineTo(maxX, maxY);
    shape.lineTo(minX, maxY);
    shape.closePath();
  } else {
    // 绕 Y 旋转 180° 后，本地 sx = -wx，故边界从 -maxX (-0.92) 到 -minX (+1.16)
    shape.moveTo(mapX(maxX), minY);
    shape.lineTo(mapX(archWorldX) - archR, minY);
    shape.absarc(
      mapX(archWorldX),
      archY,
      archR,
      Math.PI * 0.89,
      Math.PI * 0.11,
      true,
    );
    shape.lineTo(mapX(minX), minY);
    shape.lineTo(mapX(minX), maxY);
    shape.lineTo(mapX(maxX), maxY);
    shape.closePath();
  }

  const geo = new THREE.ShapeGeometry(shape, 24);
  const pos = geo.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const localMinX = frontOnRight ? minX : -maxX;

  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    uvs[i * 2] = (px - localMinX) / spanX;
    uvs[i * 2 + 1] = (py - minY) / spanY;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * 绘制前引擎盖与复古红黄米奇波点中网纹理。
 */
function createBonnetPolkaTexture(): THREE.CanvasTexture {
  return createCanvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = BUS_CRIMSON;
    ctx.fillRect(0, 0, w, h);

    // 亮黄与乳白米奇波点图案
    const dots: Array<[number, number, number, string]> = [
      [110, 110, 32, '#facc15'],
      [390, 105, 30, '#fef08a'],
      [256, 185, 36, '#facc15'],
      [135, 310, 28, '#ffffff'],
      [378, 320, 32, '#facc15'],
      [256, 420, 26, '#fef08a'],
    ];
    for (const [dx, dy, r, color] of dots) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 引擎盖中央纵向复古镀铬亮条
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(w / 2 - 12, 0, 24, h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(w / 2 - 14, 0, 2, h);
    ctx.fillRect(w / 2 + 12, 0, 2, h);
  });
}

/**
 * 绘制双层巴士上层额头路线牌纹理。
 */
function createDestinationSignTexture(): THREE.CanvasTexture {
  return createCanvasTexture(512, 160, (ctx, w, h) => {
    ctx.fillStyle = '#111318';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, w - 16, h - 16);

    ctx.fillStyle = '#fde68a';
    ctx.font = '800 54px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('08  MICKEY BUS', w / 2, h / 2 + 2);
  });
}

/**
 * 构造无重叠接缝的弧形烟熏透明玻璃穹顶几何体。
 * 使用单个无缝网格代替拼接球体与圆柱，彻底消除透明材质重叠导致的深色接缝线。
 */
function createSmokedDomeGeometry(
  length: number,
  width: number,
  height: number,
  capLen: number,
): THREE.BufferGeometry {
  const segX = 48;
  const segArc = 28;
  const halfL = length / 2;
  const halfW = width / 2;
  const straightHalf = halfL - capLen;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let ix = 0; ix <= segX; ix++) {
    const u = ix / segX;
    // 在两端略加密采样，使前后半球过渡更加圆润顺滑
    const linear = u * 2 - 1;
    const x = linear * halfL;
    const absX = Math.abs(x);

    let profileScale = 1;
    if (absX > straightHalf) {
      const t = Math.min(1, (absX - straightHalf) / capLen);
      profileScale = Math.sqrt(Math.max(0, 1 - t * t));
    }

    for (let ia = 0; ia <= segArc; ia++) {
      const v = ia / segArc;
      const theta = v * Math.PI;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // 略带方肩曲线（幂次 0.78），模拟真实巴士上层玻璃侧壁微弧收顶效果
      const z =
        -halfW *
        Math.sign(cosT) *
        Math.pow(Math.abs(cosT), 0.78) *
        profileScale;
      const y = height * Math.pow(sinT, 0.72) * profileScale;

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  const stride = segArc + 1;
  for (let ix = 0; ix < segX; ix++) {
    for (let ia = 0; ia < segArc; ia++) {
      const a = ix * stride + ia;
      const b = (ix + 1) * stride + ia;
      const c = (ix + 1) * stride + (ia + 1);
      const d = ix * stride + (ia + 1);
      // 外法线朝外（+X × +Z = -Y，故绕序用 a->d->b 与 b->d->c 使法线指向穹顶外侧）
      indices.push(a, d, b);
      indices.push(b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 构建贴合玻璃穹顶曲线的横向细微屋顶骨条。
 */
function createRoofRibMesh(
  width: number,
  height: number,
  mat: THREE.Material,
): THREE.Mesh {
  const halfW = width / 2 + 0.008;
  const ribH = height + 0.008;
  const pts: THREE.Vector3[] = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const z = -halfW * Math.sign(cosT) * Math.pow(Math.abs(cosT), 0.78);
    const y = ribH * Math.pow(sinT, 0.72);
    pts.push(new THREE.Vector3(0, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 24, 0.011, 8, false);
  return new THREE.Mesh(geo, mat);
}

/**
 * 构建上层内舱暖橙色带靠背发光座椅。
 */
function createAmberBusSeat(
  accentLightsOut: THREE.Mesh[],
  pedestalMat: THREE.Material,
): THREE.Group {
  const seat = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.06, 0.18),
    pedestalMat,
  );
  base.position.y = 0.03;
  seat.add(base);

  const cushionGeo = new THREE.BoxGeometry(0.18, 0.055, 0.23);
  const cushion = createEmissiveLight(cushionGeo, 0xf97316, 0.42);
  cushion.position.set(0.01, 0.075, 0);
  cushion.renderOrder = 1;
  seat.add(cushion);
  accentLightsOut.push(cushion);

  const backGeo = new THREE.BoxGeometry(0.06, 0.21, 0.22);
  const backrest = createEmissiveLight(backGeo, 0xfb923c, 0.48);
  backrest.position.set(-0.075, 0.165, 0);
  backrest.rotation.z = 0.18;
  backrest.renderOrder = 1;
  seat.add(backrest);
  accentLightsOut.push(backrest);

  return seat;
}

/**
 * 创建单侧黑色前轮拱弧形挡泥板翼子板（ExtrudeGeometry 精确包覆前轮）。
 */
function createFrontFender(mat: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0.76, 0.22);
  shape.lineTo(0.84, 0.22);
  // 绕前轮拱上拱曲线（圆心约 x=1.10, y=0.17）
  shape.absarc(1.10, 0.17, 0.225, Math.PI * 0.92, Math.PI * 0.08, true);
  shape.lineTo(1.58, 0.22);
  shape.lineTo(1.58, 0.42);
  shape.quadraticCurveTo(1.36, 0.48, 1.12, 0.47);
  shape.quadraticCurveTo(0.88, 0.46, 0.76, 0.28);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -0.11);
  return new THREE.Mesh(geo, mat);
}

/**
 * 构建 Disney Motors 复古伦敦米奇双层巴士（含半透明烟熏天窗与暖光双排座椅）。
 */
export function createDisneyBusCar(): CarObject {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  const wheels: THREE.Group[] = [];

  const frontLights: THREE.Mesh[] = [];
  const rearLights: THREE.Mesh[] = [];
  const accentLights: THREE.Mesh[] = [];
  const pointLights: THREE.PointLight[] = [];

  // 核心漆面与结构材质
  const crimsonMat = createDiecastMaterial(BUS_CRIMSON, {
    metalness: 0.25,
    roughness: 0.18,
    clearcoat: 1.0,
  });
  const whiteMat = createDiecastMaterial(BUS_WHITE, {
    metalness: 0.14,
    roughness: 0.22,
    clearcoat: 1.0,
  });
  const blackGlossMat = createDiecastMaterial(BUS_BLACK, {
    metalness: 0.24,
    roughness: 0.18,
    clearcoat: 1.0,
  });
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x181a20,
    roughness: 0.72,
    metalness: 0.24,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.92,
    roughness: 0.14,
  });

  // ======================== 1. 下层底盘、开放尾梯与亮白车身 ========================
  // 黑色底层大梁底盘
  const chassisBase = new THREE.Mesh(
    new THREE.BoxGeometry(3.26, 0.09, 1.18),
    chassisMat,
  );
  chassisBase.position.set(-0.02, 0.20, 0);
  bodyGroup.add(chassisBase);

  // 下层内缩主结构核（避开左右轮胎包络）+ 轮眉上方白顶檐，防止轮胎穿模
  const lowerCore = new THREE.Mesh(
    new THREE.BoxGeometry(2.08, 0.47, 0.90),
    whiteMat,
  );
  lowerCore.position.set(-0.12, 0.475, 0);
  bodyGroup.add(lowerCore);

  // 轮眉上方（y ≥ 0.39）横向铺满 1.20 宽度，形成真实现代/复古玩具车身厚壁
  const lowerUpperDeck = new THREE.Mesh(
    new THREE.BoxGeometry(2.08, 0.31, 1.20),
    whiteMat,
  );
  lowerUpperDeck.position.set(-0.12, 0.555, 0);
  bodyGroup.add(lowerUpperDeck);

  // 驾驶室前端下沿窄墙（x ∈ [+0.92, +1.28]，收窄嵌于前翼子板内侧）
  const cabLowerCore = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.47, 0.72),
    crimsonMat,
  );
  cabLowerCore.position.set(1.10, 0.475, 0);
  bodyGroup.add(cabLowerCore);

  // 前后轮之间的下裙实心段（x ∈ [-0.56, +0.92]），填满左右门板下方
  const midSkirt = new THREE.Mesh(
    new THREE.BoxGeometry(1.48, 0.16, 1.20),
    whiteMat,
  );
  midSkirt.position.set(0.18, 0.32, 0);
  bodyGroup.add(midSkirt);

  // 右侧 (+Z) 后半段全封闭白墙延长至 x = -1.64（仅左侧 -Z 开放作英伦登车口）
  const offsideRearWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.49, 0.47, 0.60),
    whiteMat,
  );
  offsideRearWall.position.set(-1.395, 0.475, 0.30);
  bodyGroup.add(offsideRearWall);

  // 下层左右白墙高清涂装面（带后轮拱真实镂空 + 4 窗 + 米奇插画 + 复古文字）
  const lowerTexRight = createLowerWhiteTexture(true);
  const lowerTexLeft = createLowerWhiteTexture(false);

  const lowerRightPanel = new THREE.Mesh(
    createLowerSidePanelGeo(true),
    createDiecastMaterial(0xffffff, {
      map: lowerTexRight,
      metalness: 0.12,
      roughness: 0.22,
      clearcoat: 1.0,
    }),
  );
  lowerRightPanel.position.z = 0.603;
  bodyGroup.add(lowerRightPanel);

  const lowerLeftPanel = new THREE.Mesh(
    createLowerSidePanelGeo(false),
    createDiecastMaterial(0xffffff, {
      map: lowerTexLeft,
      metalness: 0.12,
      roughness: 0.22,
      clearcoat: 1.0,
    }),
  );
  lowerLeftPanel.rotation.y = Math.PI;
  lowerLeftPanel.position.z = -0.603;
  bodyGroup.add(lowerLeftPanel);

  // 后部开放式上下车台阶、红色内隔断墙与镀铬扶手立柱
  const rearPlatformFloor = new THREE.Mesh(
    new THREE.BoxGeometry(0.50, 0.04, 0.62),
    chassisMat,
  );
  rearPlatformFloor.position.set(-1.39, 0.25, -0.28);
  bodyGroup.add(rearPlatformFloor);

  const bulkhead = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.45, 0.58),
    crimsonMat,
  );
  bulkhead.position.set(-1.16, 0.47, -0.29);
  bodyGroup.add(bulkhead);

  // 4 级登车阶梯
  for (let s = 0; s < 4; s++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.045, 0.36),
      s % 2 === 0 ? crimsonMat : chassisMat,
    );
    step.position.set(-1.21 - s * 0.075, 0.28 + s * 0.095, -0.14);
    bodyGroup.add(step);
  }

  // 后门镀铬垂直扶手栏杆与尾部撑柱
  const grabPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.46, 12),
    chromeMat,
  );
  grabPole.position.set(-1.55, 0.47, -0.52);
  bodyGroup.add(grabPole);

  const rearCornerPillar = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.47, 0.07),
    crimsonMat,
  );
  rearCornerPillar.position.set(-1.60, 0.47, 0.02);
  bodyGroup.add(rearCornerPillar);

  // 车尾红尾灯与复古车牌（+Z 尾墙）
  const tailLampGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.03, 16);
  tailLampGeo.rotateZ(Math.PI / 2);
  for (const tz of [0.22, 0.46]) {
    const tail = createEmissiveLight(tailLampGeo, 0xff2238, 1.5);
    tail.position.set(-1.645, 0.36, tz);
    bodyGroup.add(tail);
    rearLights.push(tail);
  }

  const rearPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.07, 0.18),
    new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.4 }),
  );
  rearPlate.position.set(-1.645, 0.25, 0.34);
  bodyGroup.add(rearPlate);

  // 后轮轮拱黑眉与内衬轮罩（完全遮蔽轮胎后侧；theta ∈ [PI/2, 3*PI/2] 经 Rx(PI/2) 后恰好朝上）
  const rearWellGeo = new THREE.CylinderGeometry(
    0.195,
    0.195,
    0.04,
    24,
    1,
    false,
    Math.PI / 2,
    Math.PI,
  );
  rearWellGeo.rotateX(Math.PI / 2);
  for (const side of [1, -1] as const) {
    const rearWell = new THREE.Mesh(rearWellGeo, chassisMat);
    rearWell.position.set(-0.78, 0.17, side * 0.465);
    bodyGroup.add(rearWell);

    const rearArch = new THREE.Mesh(
      new THREE.TorusGeometry(0.205, 0.026, 10, 20, Math.PI),
      blackGlossMat,
    );
    rearArch.position.set(-0.78, 0.17, side * 0.60);
    bodyGroup.add(rearArch);
  }

  // ======================== 2. 复古半凸引擎盖、中网、挡泥板与大灯 ========================
  // 引擎盖主体（x ∈ [+1.08, +1.64]）
  const bonnetBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.54, 0.29, 0.64),
    crimsonMat,
  );
  bonnetBase.position.set(1.36, 0.385, 0);
  bodyGroup.add(bonnetBase);

  // 引擎盖顶部红黄米奇波点涂装面（XYZ 欧拉先 Rz 再 Rx，故 PlaneGeometry 传入 (Z宽, X长)）
  const polkaTex = createBonnetPolkaTexture();
  const polkaMat = createDiecastMaterial(0xffffff, {
    map: polkaTex,
    metalness: 0.2,
    roughness: 0.2,
    clearcoat: 1.0,
  });
  const bonnetTop = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.52), polkaMat);
  bonnetTop.rotation.x = -Math.PI / 2;
  bonnetTop.rotation.z = Math.PI / 2;
  bonnetTop.position.set(1.36, 0.533, 0);
  bodyGroup.add(bonnetTop);

  // 复古波点前格栅与镀铬中网竖条
  const grilleFace = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.25, 0.54),
    polkaMat,
  );
  grilleFace.position.set(1.635, 0.39, 0);
  bodyGroup.add(grilleFace);

  const grilleBezel = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.27, 0.56),
    chromeMat,
  );
  grilleBezel.position.set(1.628, 0.39, 0);
  bodyGroup.add(grilleBezel);

  for (let i = -3; i <= 3; i++) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.052, 0.22, 0.016),
      chromeMat,
    );
    bar.position.set(1.635, 0.39, i * 0.068);
    bodyGroup.add(bar);
  }

  // 中网顶端镀铬米奇小徽章
  const noseEmblem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.036, 0.03, 16),
    chromeMat,
  );
  noseEmblem.rotation.z = Math.PI / 2;
  noseEmblem.position.set(1.655, 0.50, 0);
  bodyGroup.add(noseEmblem);

  // 下层驾驶室前挡风玻璃（位于半凸引擎盖正后上方）
  const lowerWindshield = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.20, 0.96),
    createGlassMaterial({ color: 0x141820, opacity: 0.85 }),
  );
  lowerWindshield.position.set(1.285, 0.61, 0);
  bodyGroup.add(lowerWindshield);

  // 左右弧形黑色前轮挡泥板（翼子板）与圆形复古大灯
  const headBezelGeo = new THREE.CylinderGeometry(0.072, 0.078, 0.05, 20);
  headBezelGeo.rotateZ(Math.PI / 2);
  const headLensGeo = new THREE.CylinderGeometry(0.058, 0.058, 0.03, 20);
  headLensGeo.rotateZ(Math.PI / 2);

  for (const side of [1, -1] as const) {
    const fender = createFrontFender(blackGlossMat);
    fender.position.z = side * 0.48;
    bodyGroup.add(fender);

    // 圆形镀铬复古大灯 + 暖白光源
    const bezel = new THREE.Mesh(headBezelGeo, chromeMat);
    bezel.position.set(1.57, 0.36, side * 0.48);
    bodyGroup.add(bezel);

    const headLamp = createEmissiveLight(headLensGeo, 0xfff3c4, 1.65);
    headLamp.position.set(1.59, 0.36, side * 0.48);
    bodyGroup.add(headLamp);
    frontLights.push(headLamp);

    // 复古前转向角灯
    const blink = createEmissiveLight(
      new THREE.SphereGeometry(0.028, 12, 12),
      0xff9f1c,
      1.1,
    );
    blink.position.set(1.59, 0.27, side * 0.48);
    bodyGroup.add(blink);
    accentLights.push(blink);
  }

  // 复古镀铬前保险杠
  const frontBumper = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.065, 1.14),
    chromeMat,
  );
  frontBumper.position.set(1.66, 0.21, 0);
  bodyGroup.add(frontBumper);

  // ======================== 3. 中层绯红涂装腰带 ========================
  const beltCore = new THREE.Mesh(
    new THREE.BoxGeometry(2.92, 0.34, 1.22),
    crimsonMat,
  );
  beltCore.position.set(-0.18, 0.87, 0);
  bodyGroup.add(beltCore);

  // 前后圆角腰带包边柱，消除生硬棱角
  const cornerPostGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.34, 16);
  for (const cx of [-1.62, 1.26]) {
    for (const cz of [-0.54, 0.54]) {
      const post = new THREE.Mesh(cornerPostGeo, crimsonMat);
      post.position.set(cx, 0.87, cz);
      bodyGroup.add(post);
    }
  }

  // 绯红腰带左右高清涂装（米奇剪影 + DISNEY MOTORS + 08 MOTORS H&L 徽章）
  const beltTexRight = createCrimsonBeltTexture(true);
  const beltTexLeft = createCrimsonBeltTexture(false);
  const beltPlaneGeo = new THREE.PlaneGeometry(2.80, 0.32);

  const beltRight = new THREE.Mesh(
    beltPlaneGeo,
    createDiecastMaterial(0xffffff, {
      map: beltTexRight,
      metalness: 0.18,
      roughness: 0.2,
      clearcoat: 1.0,
    }),
  );
  beltRight.position.set(-0.18, 0.87, 0.614);
  bodyGroup.add(beltRight);

  const beltLeft = new THREE.Mesh(
    beltPlaneGeo,
    createDiecastMaterial(0xffffff, {
      map: beltTexLeft,
      metalness: 0.18,
      roughness: 0.2,
      clearcoat: 1.0,
    }),
  );
  beltLeft.rotation.y = Math.PI;
  beltLeft.position.set(-0.18, 0.87, -0.614);
  bodyGroup.add(beltLeft);

  // 前脸目的地灯箱牌（08 MICKEY BUS）
  const destTex = createDestinationSignTexture();
  const destSign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.68, 0.16),
    new THREE.MeshStandardMaterial({
      map: destTex,
      emissive: new THREE.Color(0xfef08a),
      emissiveMap: destTex,
      emissiveIntensity: 0.45,
      roughness: 0.2,
    }),
  );
  destSign.rotation.y = Math.PI / 2;
  destSign.position.set(1.286, 0.88, 0);
  bodyGroup.add(destSign);

  // 车尾绯红腰带饰面与上层辅助刹车灯
  const rearUpperBrake = createEmissiveLight(
    new THREE.BoxGeometry(0.025, 0.045, 0.36),
    0xff1e38,
    1.25,
  );
  rearUpperBrake.position.set(-1.645, 0.96, 0);
  bodyGroup.add(rearUpperBrake);
  rearLights.push(rearUpperBrake);

  // ======================== 4. 上层暖光双排座椅内舱 + 烟熏透明穹顶 + 米奇双耳 ========================
  // 上层深色地板与过道
  const upperFloor = new THREE.Mesh(
    new THREE.BoxGeometry(2.68, 0.03, 1.08),
    chassisMat,
  );
  upperFloor.position.set(-0.18, 1.045, 0);
  bodyGroup.add(upperFloor);

  // 两侧各 5 张暖橙/琥珀色发光座椅（共 10 张，从玻璃穹顶外清晰可见）
  const seatXs = [-1.18, -0.66, -0.14, 0.38, 0.88];
  for (const sx of seatXs) {
    for (const sz of [-0.30, 0.30]) {
      const seat = createAmberBusSeat(accentLights, chassisMat);
      seat.position.set(sx, 1.055, sz);
      bodyGroup.add(seat);
    }
  }

  // 上层内舱顶部柔和暖橙灯条与点光源（透过烟熏玻璃穹顶散发玩具收藏灯效）
  const cabinStrip = createEmissiveLight(
    new THREE.BoxGeometry(1.90, 0.02, 0.08),
    0xffa94d,
    0.9,
  );
  cabinStrip.position.set(-0.22, 1.48, 0);
  cabinStrip.renderOrder = 1;
  bodyGroup.add(cabinStrip);
  accentLights.push(cabinStrip);

  const cabinLight = new THREE.PointLight(0xff9838, 1.35, 2.6, 1.8);
  cabinLight.position.set(-0.18, 1.42, 0);
  cabinLight.userData.baseIntensity = 1.35;
  bodyGroup.add(cabinLight);
  pointLights.push(cabinLight);

  // 无缝透明烟熏黑玻璃穹顶（opacity: 0.45 确保内舱座椅通透可见）
  const domeLength = 2.90;
  const domeWidth = 1.20;
  const domeHeight = 0.56;
  const domeGeo = createSmokedDomeGeometry(domeLength, domeWidth, domeHeight, 0.38);
  const domeMat = createGlassMaterial({
    color: 0x10141c,
    opacity: 0.45,
    roughness: 0.05,
    doubleSided: true,
  });
  // 踩坑规避：关闭玻璃深度写入并设置 noShadow，既防止半透明屋顶遮挡深部座椅，又防止屋顶把座椅投黑
  domeMat.depthWrite = false;
  const domeMesh = new THREE.Mesh(domeGeo, domeMat);
  domeMesh.position.set(-0.18, 1.04, 0);
  domeMesh.renderOrder = 3;
  domeMesh.userData.noShadow = true;
  bodyGroup.add(domeMesh);

  // 穹顶横向细微骨条压纹 + 纵向中脊饰条
  for (const rx of [-1.10, -0.70, -0.30, 0.10, 0.50, 0.90]) {
    const rib = createRoofRibMesh(domeWidth, domeHeight, blackGlossMat);
    rib.position.set(rx, 1.04, 0);
    bodyGroup.add(rib);
  }

  const spineRib = new THREE.Mesh(
    new THREE.BoxGeometry(2.14, 0.022, 0.035),
    blackGlossMat,
  );
  spineRib.position.set(-0.18, 1.04 + domeHeight + 0.004, 0);
  bodyGroup.add(spineRib);

  // 穹顶前额实心亮黑弧顶盖与红色点缀圆环
  const foreheadCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.48),
    blackGlossMat,
  );
  foreheadCap.scale.set(0.78, 0.62, 1.02);
  foreheadCap.position.set(0.92, 1.32, 0);
  bodyGroup.add(foreheadCap);

  const roofAccentRing = createEmissiveLight(
    new THREE.TorusGeometry(0.14, 0.018, 10, 24),
    0xe11d48,
    0.65,
  );
  roofAccentRing.rotation.x = Math.PI / 2;
  roofAccentRing.position.set(0.92, 1.60, 0);
  bodyGroup.add(roofAccentRing);
  accentLights.push(roofAccentRing);

  // 车顶前额左右两只经典黑色圆形米奇耳朵轮廓凸起
  const earGeo = new THREE.CylinderGeometry(0.155, 0.155, 0.055, 28);
  for (const side of [1, -1] as const) {
    const ear = new THREE.Mesh(earGeo, blackGlossMat);
    ear.position.set(0.86, 1.57, side * 0.34);
    ear.rotation.x = side * 0.42;
    ear.rotation.z = -0.18;
    bodyGroup.add(ear);
  }

  // ======================== 5. 复古亮黄轮圈车轮（挂载到 root 严格接地） ========================
  mountWheels(
    root,
    wheels,
    [
      { x: 1.10, y: WHEEL_RADIUS, z: 0.55 },
      { x: 1.10, y: WHEEL_RADIUS, z: -0.55 },
      { x: -0.78, y: WHEEL_RADIUS, z: 0.55 },
      { x: -0.78, y: WHEEL_RADIUS, z: -0.55 },
    ],
    {
      radius: WHEEL_RADIUS,
      width: 0.12,
      rimStyle: 'retro-yellow',
    },
  );

  root.add(bodyGroup);

  // 落地归零与交互标记；踩坑点：必须在 groundToZero 后读取 baseBodyY，防止动画帧覆盖接地偏移
  groundToZero(root);
  tagCarInteractive(root, 'disney-bus');

  const baseBodyY = bodyGroup.position.y;

  // ======================== 6. 点击动画（欢乐摇摆跳跃 + 暖光大灯同步闪烁 + 车轮转动） ========================
  const pulseTimer = createCarPulseTimer(1.2);

  function triggerAnimation(intensity = 1): void {
    triggerCarPulse(pulseTimer, intensity);
  }

  function update(dt: number, elapsed: number): void {
    const { active, progress, envelope } = stepCarPulse(pulseTimer, dt);
    if (!active) {
      bodyGroup.position.y = baseBodyY;
      bodyGroup.rotation.set(0, 0, 0);
      applyLightPulse(frontLights, 1);
      applyLightPulse(rearLights, 1);
      // 静止待机时上层暖舱保持温润微弱呼吸光韵
      const idleBreath = 1 + Math.sin(elapsed * 2.0) * 0.08;
      applyLightPulse(accentLights, idleBreath);
      cabinLight.intensity =
        (cabinLight.userData.baseIntensity as number) * idleBreath;
      return;
    }

    // 欢乐弹性双跳与左右微倾摇摆
    const hop = Math.abs(Math.sin(progress * Math.PI * 3.0)) * envelope * 0.095;
    bodyGroup.position.y = baseBodyY + hop;
    bodyGroup.rotation.x = Math.sin(progress * Math.PI * 4.0) * envelope * 0.068;
    bodyGroup.rotation.z = Math.sin(progress * Math.PI * 2.0) * envelope * 0.032;

    // 车厢暖光与复古圆灯欢快同步闪烁
    const cheerFlash = Math.abs(Math.sin(progress * Math.PI * 5.0));
    applyLightPulse(frontLights, 1 + cheerFlash * 1.9 * pulseTimer.intensity);
    applyLightPulse(rearLights, 1 + cheerFlash * 1.6 * pulseTimer.intensity);
    applyLightPulse(
      accentLights,
      1 + (0.35 + cheerFlash * 1.25) * pulseTimer.intensity,
    );
    cabinLight.intensity =
      (cabinLight.userData.baseIntensity as number) *
      (1 + cheerFlash * 1.6 * pulseTimer.intensity);

    // 复古亮黄车轮欢快旋转
    spinWheels(wheels, dt * 16 * envelope);
  }

  return {
    id: 'disney-bus',
    spec: DISNEY_BUS_SPEC,
    root,
    bodyGroup,
    wheels,
    lights: {
      frontLights,
      rearLights,
      accentLights,
      pointLights,
    },
    triggerAnimation,
    update,
  };
}
