import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { LightingMode } from '../types';
import {
  createCanvasTexture,
  createRoadMatTexture,
  createWoodTextures,
} from '../utils/textures';

export interface BloomPreset {
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
}

export interface EnvironmentController {
  busStopGroup: THREE.Group;
  setLightingMode: (mode: LightingMode) => BloomPreset;
  triggerBusStopAnimation: () => void;
  update: (dt: number, elapsed: number) => void;
  dispose: () => void;
}

interface ModeTargetState {
  bgColor: THREE.Color;
  fogColor: THREE.Color;
  fogDensity: number;
  envIntensity: number;
  keyColor: THREE.Color;
  keyIntensity: number;
  keyPosition: THREE.Vector3;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  rimLeftColor: THREE.Color;
  rimLeftIntensity: number;
  rimRightColor: THREE.Color;
  rimRightIntensity: number;
  deskColor: THREE.Color;
  deskRoughness: number;
  deskMetalness: number;
  deskClearcoat: number;
  deskClearcoatRoughness: number;
  roadTint: THREE.Color;
  roadRoughness: number;
  vignetteOpacity: number;
  neonFactor: number;
  bloom: BloomPreset;
}

const MODE_CONFIGS: Record<LightingMode, ModeTargetState> = {
  desk: {
    bgColor: new THREE.Color(0xefe9df),
    fogColor: new THREE.Color(0xefe9df),
    fogDensity: 0,
    envIntensity: 0.65,
    keyColor: new THREE.Color(0xfff4e2),
    keyIntensity: 2.25,
    keyPosition: new THREE.Vector3(5.5, 10.8, 6.8),
    hemiSky: new THREE.Color(0xfffaf2),
    hemiGround: new THREE.Color(0x4a2c16),
    hemiIntensity: 0.42,
    rimLeftColor: new THREE.Color(0xbce0ff),
    rimLeftIntensity: 0.32,
    rimRightColor: new THREE.Color(0xffe7c2),
    rimRightIntensity: 0.22,
    deskColor: new THREE.Color(0xffffff),
    deskRoughness: 0.58,
    deskMetalness: 0.04,
    deskClearcoat: 0.28,
    deskClearcoatRoughness: 0.3,
    roadTint: new THREE.Color(0xe5e9f0),
    roadRoughness: 0.82,
    vignetteOpacity: 0,
    neonFactor: 0,
    bloom: { bloomStrength: 0, bloomRadius: 0, bloomThreshold: 2.0 },
  },
  neon: {
    bgColor: new THREE.Color(0x060914),
    fogColor: new THREE.Color(0x060914),
    fogDensity: 0.032,
    envIntensity: 0.5,
    keyColor: new THREE.Color(0xc4d8ff),
    keyIntensity: 0.75,
    keyPosition: new THREE.Vector3(3.5, 11.0, 5.5),
    hemiSky: new THREE.Color(0x1f3164),
    hemiGround: new THREE.Color(0x090c16),
    hemiIntensity: 0.34,
    rimLeftColor: new THREE.Color(0x00f0ff),
    rimLeftIntensity: 1.15,
    rimRightColor: new THREE.Color(0xff2a85),
    rimRightIntensity: 1.15,
    // 黑曜石反光桌面：压暗木纹基础色并提高清漆高光
    deskColor: new THREE.Color(0x1b2333),
    deskRoughness: 0.22,
    deskMetalness: 0.32,
    deskClearcoat: 0.94,
    deskClearcoatRoughness: 0.12,
    roadTint: new THREE.Color(0x6c7890),
    roadRoughness: 0.72,
    vignetteOpacity: 1,
    neonFactor: 1,
    bloom: { bloomStrength: 0.56, bloomRadius: 0.52, bloomThreshold: 1.08 },
  },
  studio: {
    bgColor: new THREE.Color(0xeef2f7),
    fogColor: new THREE.Color(0xeef2f7),
    fogDensity: 0.004,
    envIntensity: 1.08,
    keyColor: new THREE.Color(0xffffff),
    keyIntensity: 1.85,
    keyPosition: new THREE.Vector3(4.5, 12.0, 6.5),
    hemiSky: new THREE.Color(0xffffff),
    hemiGround: new THREE.Color(0xcad3df),
    hemiIntensity: 0.65,
    rimLeftColor: new THREE.Color(0xe6f1ff),
    rimLeftIntensity: 0.95,
    rimRightColor: new THREE.Color(0xfff7ed),
    rimRightIntensity: 0.85,
    deskColor: new THREE.Color(0xd2ccc2),
    deskRoughness: 0.52,
    deskMetalness: 0.06,
    deskClearcoat: 0.36,
    deskClearcoatRoughness: 0.24,
    roadTint: new THREE.Color(0xf4f6fa),
    roadRoughness: 0.8,
    vignetteOpacity: 0.45,
    neonFactor: 0,
    bloom: { bloomStrength: 0, bloomRadius: 0, bloomThreshold: 2.0 },
  },
};

/**
 * 将平面型几何体（ShapeGeometry / ExtrudeGeometry）的 UV 重新映射到 [0, 1] 区间。
 * Three.js 的 ShapeGeometry / ExtrudeGeometry 默认按世界单位写入 UV，
 * 不重映射会导致 Canvas 纹理在贴花或路板上异常平铺错位。
 */
function normalizePlanarUV(
  geometry: THREE.BufferGeometry,
  axes: 'xy' | 'xz',
  minA: number,
  spanA: number,
  minB: number,
  spanB: number,
  invertB = false,
): void {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  if (!pos || !uv) return;

  for (let i = 0; i < pos.count; i++) {
    const a = pos.getX(i);
    const b = axes === 'xy' ? pos.getY(i) : pos.getZ(i);
    const u = THREE.MathUtils.clamp((a - minA) / spanA, 0.002, 0.998);
    const rawV = THREE.MathUtils.clamp((b - minB) / spanB, 0.002, 0.998);
    const v = invertB ? 1 - rawV : rawV;
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

/** 创建圆角矩形 2D Shape（以中心为原点） */
function createRoundedRectShape(
  width: number,
  height: number,
  radius: number,
): THREE.Shape {
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);
  const shape = new THREE.Shape();

  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return shape;
}

/**
 * 构建单块灰白色 Tomica 拼图路板的 ExtrudeGeometry：
 * - 单块名义尺寸 3.0 × 3.7 × 0.16，顶面严格位于 y = 0.16，底面严格位于 y = 0；
 * - 左侧（-X）带 3 个外凸燕尾拼图卡耳，右侧（+X）带 3 个内凹卡槽，实现相邻块无缝咬合与真实拼接缝；
 * - 前缘（+Z）与后缘（-Z）各带 2 个小梯形卡扣凸起与微凹肩口。
 */
function createTomicaRoadPlateGeometry(): THREE.ExtrudeGeometry {
  const bevelSize = 0.008;
  const bevelThickness = 0.012;
  const seamHalf = 0.014; // 包含 bevelSize 后左右实际间隙约 0.012，形成清晰真实拼接缝
  const halfW = 1.5 - seamHalf;
  const halfD = 1.85 - bevelSize;

  const shape = new THREE.Shape();
  // 注意：绕 X 轴旋转 -PI/2 后，2D 的 -Y 对应世界 +Z（前缘），+Y 对应世界 -Z（后缘）
  shape.moveTo(-halfW, -halfD);

  // 1. 前缘（sy = -halfD -> worldZ = +1.85）：自左向右，含 2 个梯形卡扣凸耳与凹槽
  const frontLugs = [-0.76, 0.76];
  for (const cx of frontLugs) {
    shape.lineTo(cx - 0.21, -halfD);
    shape.lineTo(cx - 0.16, -halfD - 0.11);
    shape.lineTo(cx + 0.16, -halfD - 0.11);
    shape.lineTo(cx + 0.21, -halfD);
  }
  // 中央微凹卡口细节
  shape.lineTo(halfW, -halfD);

  // 2. 右缘（sx = +halfW）：自前向后，3 个内凹 Tomica T 型拼图卡槽（全部转角 >= 90°，消除锐角斜接伪影）
  const jigsawY = [-1.1, 0, 1.1];
  for (const cy of jigsawY) {
    shape.lineTo(halfW, cy - 0.14);
    shape.lineTo(halfW - 0.09, cy - 0.14);
    shape.lineTo(halfW - 0.23, cy - 0.23);
    shape.lineTo(halfW - 0.23, cy + 0.23);
    shape.lineTo(halfW - 0.09, cy + 0.14);
    shape.lineTo(halfW, cy + 0.14);
  }
  shape.lineTo(halfW, halfD);

  // 3. 后缘（sy = +halfD -> worldZ = -1.85）：自右向左，对称梯形小凸耳
  for (let i = frontLugs.length - 1; i >= 0; i--) {
    const cx = frontLugs[i];
    shape.lineTo(cx + 0.21, halfD);
    shape.lineTo(cx + 0.16, halfD + 0.11);
    shape.lineTo(cx - 0.16, halfD + 0.11);
    shape.lineTo(cx - 0.21, halfD);
  }
  shape.lineTo(-halfW, halfD);

  // 4. 左缘（sx = -halfW）：自后向前，3 个外凸 Tomica T 型拼图卡耳（最左一块露出于 X < -7.5）
  for (let i = jigsawY.length - 1; i >= 0; i--) {
    const cy = jigsawY[i];
    shape.lineTo(-halfW, cy + 0.115);
    shape.lineTo(-halfW - 0.09, cy + 0.115);
    shape.lineTo(-halfW - 0.21, cy + 0.205);
    shape.lineTo(-halfW - 0.21, cy - 0.205);
    shape.lineTo(-halfW - 0.09, cy - 0.115);
    shape.lineTo(-halfW, cy - 0.115);
  }
  shape.closePath();

  const targetThickness = 0.16;
  const extrudeDepth = targetThickness - bevelThickness * 2;

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: extrudeDepth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 2,
    curveSegments: 8,
  });

  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  if (geometry.boundingBox) {
    // 精确将底面归零、顶面对齐至 0.16（消除 bevel 对局部坐标的偏移）
    const minY = geometry.boundingBox.min.y;
    const height = geometry.boundingBox.max.y - minY;
    if (height > 0) {
      geometry.translate(0, -minY, 0);
      geometry.scale(1, targetThickness / height, 1);
    }
  }
  geometry.computeVertexNormals();

  // 重新将顶面 UV 归一化到单块 3.0 × 3.7 的范围，保证车道虚线与压槽精确居中
  normalizePlanarUV(geometry, 'xz', -1.5, 3.0, -1.85, 3.7, true);
  return geometry;
}

/** 创建桌面周边径向渐变透明遮罩贴图（中心纯黑表示完全透出桌面，外围纯白表示融入背景色） */
function createEdgeVignetteAlphaTexture(): THREE.CanvasTexture {
  return createCanvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      // 0.26 内完全透明保留胡桃木与路板质感，0.45 处已完全淡出到背景色（早于 36×26 桌板边缘）
      const grad = ctx.createRadialGradient(cx, cy, w * 0.26, cx, cy, w * 0.45);
      grad.addColorStop(0, '#000000');
      grad.addColorStop(0.55, '#585858');
      grad.addColorStop(0.85, '#d0d0d0');
      grad.addColorStop(1, '#ffffff');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },
    { srgb: false },
  );
}

/** 创建桌面远端极低对比度虚化氛围背景物体（黑圆盘旋钮、左支架、右收纳盒轮廓） */
function buildBackdropAtmosphere(
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();

  // 1. 照片正后方标志性的哑光黑色圆柱桌面旋钮/无线控制器轮廓
  const puckGroup = new THREE.Group();
  puckGroup.position.set(0.45, 0, -5.2);

  const puckMat = new THREE.MeshStandardMaterial({
    color: 0x181b21,
    roughness: 0.72,
    metalness: 0.14,
  });
  const puckRingMat = new THREE.MeshStandardMaterial({
    color: 0x262b34,
    roughness: 0.48,
    metalness: 0.35,
  });
  disposables.push(puckMat, puckRingMat);

  const puckBodyGeo = new THREE.CylinderGeometry(0.92, 0.96, 0.44, 36);
  const puckBody = new THREE.Mesh(puckBodyGeo, puckMat);
  puckBody.position.y = 0.22;
  puckBody.castShadow = true;
  puckBody.receiveShadow = true;

  const puckCapGeo = new THREE.CylinderGeometry(0.84, 0.92, 0.08, 36);
  const puckCap = new THREE.Mesh(puckCapGeo, puckRingMat);
  puckCap.position.y = 0.47;
  puckCap.castShadow = true;
  puckCap.receiveShadow = true;

  disposables.push(puckBodyGeo, puckCapGeo);
  puckGroup.add(puckBody, puckCap);
  group.add(puckGroup);

  return group;
}

/** 创建蓝色 BUS STOP 塑料站牌的浅浮雕纹理 */
function createBlueBusStopTexture(): THREE.CanvasTexture {
  return createCanvasTexture(384, 640, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#36beff');
    grad.addColorStop(0.5, '#1ca7ea');
    grad.addColorStop(1, '#128fd1');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 内凹塑料模压框线
    const pad = 26;
    const rw = w - pad * 2;
    const rh = h - pad * 2;
    const r = 115;
    ctx.strokeStyle = 'rgba(10, 96, 150, 0.45)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(pad, pad, rw, rh, r);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(186, 238, 255, 0.42)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(pad + 4, pad + 4, rw - 8, rh - 8, r - 4);
    ctx.stroke();

    // 浅浮雕感双行字样：BUS / STOP（底部微暗投影 + 顶部微亮高光）
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 84px "Arial Black", "Helvetica Neue", sans-serif';

    const drawEmbossed = (text: string, y: number) => {
      ctx.fillStyle = 'rgba(8, 76, 122, 0.55)';
      ctx.fillText(text, w / 2 + 2, y + 4);
      ctx.fillStyle = 'rgba(218, 245, 255, 0.72)';
      ctx.fillText(text, w / 2 - 1, y - 2);
      ctx.fillStyle = '#3dc4ff';
      ctx.fillText(text, w / 2, y);
    };

    drawEmbossed('BUS', h * 0.34);
    drawEmbossed('STOP', h * 0.54);
  });
}

/** 创建日式灰白站牌（トミカバス / ニュータウン行き + 时刻表）高清 Canvas 纹理 */
function createJapaneseTimetableTexture(): THREE.CanvasTexture {
  return createCanvasTexture(512, 768, (ctx, w, h) => {
    // 洁白偏暖塑料面板底色
    ctx.fillStyle = '#f3f5f8';
    ctx.fillRect(0, 0, w, h);

    // 顶部亮蓝条幅：トミカバス
    ctx.fillStyle = '#0c7ec8';
    ctx.fillRect(16, 16, w - 32, 92);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 48px "Hiragino Sans", "Yu Gothic", sans-serif';
    ctx.fillText('トミカバス', w / 2, 64);

    // 副标题栏：ニュータウン行き
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(16, 114, w - 32, 46);
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 26px "Hiragino Sans", "Yu Gothic", sans-serif';
    ctx.fillText('ニュータウン行き', w / 2, 138);

    // 时刻表外框
    const tableX = 24;
    const tableY = 176;
    const tableW = w - 48;
    const tableH = h - 246;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tableX, tableY, tableW, tableH);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    ctx.strokeRect(tableX, tableY, tableW, tableH);

    // 表头
    ctx.fillStyle = '#dbeafe';
    ctx.fillRect(tableX, tableY, tableW, 38);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px "Hiragino Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('時', tableX + 18, tableY + 20);
    ctx.fillText('平日・土曜・休日 時刻表', tableX + 78, tableY + 20);

    // 密排时刻表网格（6点 - 22点）
    const rows = 15;
    const rowH = (tableH - 38) / rows;
    ctx.font = 'bold 18px monospace';

    const schedules = [
      '05  25  45',
      '04  19  34  49',
      '02  15  30  45  58',
      '10  24  38  52',
      '06  20  35  50',
      '05  22  40  55',
      '10  28  44',
      '02  18  34  50',
      '06  22  38  54',
      '08  24  40  56',
      '10  25  40  55',
      '08  22  36  50',
      '04  18  32  46  59',
      '12  28  44',
      '05  30',
    ];

    for (let r = 0; r < rows; r++) {
      const ry = tableY + 38 + r * rowH;
      if (r % 2 === 1) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(tableX + 2, ry, tableW - 4, rowH);
      }
      // 左侧小时格背景
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(tableX + 2, ry, 54, rowH);

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tableX, ry);
      ctx.lineTo(tableX + tableW, ry);
      ctx.stroke();

      ctx.fillStyle = '#0369a1';
      ctx.textAlign = 'center';
      ctx.fillText(String(6 + r).padStart(2, '0'), tableX + 29, ry + rowH / 2 + 1);

      ctx.fillStyle = r >= 12 ? '#dc2626' : '#334155';
      ctx.textAlign = 'left';
      ctx.fillText(schedules[r] ?? '10  30  50', tableX + 74, ry + rowH / 2 + 1);
    }

    // 竖分隔线
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tableX + 56, tableY);
    ctx.lineTo(tableX + 56, tableY + tableH);
    ctx.stroke();

    // 底部站点提示条
    ctx.fillStyle = '#0c7ec8';
    ctx.fillRect(24, h - 54, w - 48, 32);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px "Hiragino Sans", sans-serif';
    ctx.fillText('トミカタウン駅前 停留所', w / 2, h - 37);
  });
}

/** 构建蓝色 BUS STOP 站牌（位置 (-2.95, 0.16, 1.72)，面向 +Z） */
function buildBlueBusStop(
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(-2.95, 0.16, 1.72);

  const bluePlasticMat = new THREE.MeshPhysicalMaterial({
    color: 0x1ca7ea,
    roughness: 0.28,
    metalness: 0.04,
    clearcoat: 0.65,
    clearcoatRoughness: 0.2,
  });

  const signFaceTex = createBlueBusStopTexture();
  const signFaceMat = new THREE.MeshPhysicalMaterial({
    map: signFaceTex,
    roughness: 0.3,
    metalness: 0.04,
    clearcoat: 0.55,
    clearcoatRoughness: 0.22,
  });
  disposables.push(bluePlasticMat, signFaceTex, signFaceMat);

  // 圆形阶梯塑料底座（底面在局部 y = 0）
  const baseBottomGeo = new THREE.CylinderGeometry(0.145, 0.195, 0.045, 28);
  const baseBottom = new THREE.Mesh(baseBottomGeo, bluePlasticMat);
  baseBottom.position.y = 0.0225;

  const baseCollarGeo = new THREE.CylinderGeometry(0.088, 0.132, 0.045, 24);
  const baseCollar = new THREE.Mesh(baseCollarGeo, bluePlasticMat);
  baseCollar.position.y = 0.0675;

  // 圆柱立杆
  const postGeo = new THREE.CylinderGeometry(0.042, 0.045, 0.26, 20);
  const post = new THREE.Mesh(postGeo, bluePlasticMat);
  post.position.y = 0.215;

  // 圆角矩形主体牌面（ExtrudeGeometry）
  const boardW = 0.42;
  const boardH = 0.72;
  const boardShape = createRoundedRectShape(boardW, boardH, 0.165);
  const boardGeo = new THREE.ExtrudeGeometry(boardShape, {
    depth: 0.068,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 16,
  });
  boardGeo.center();
  const boardMesh = new THREE.Mesh(boardGeo, bluePlasticMat);
  boardMesh.position.y = 0.68;

  // 正背面清晰贴花牌面（ShapeGeometry，手动归一化 UV）
  const faceShape = createRoundedRectShape(boardW - 0.02, boardH - 0.02, 0.155);
  const faceGeo = new THREE.ShapeGeometry(faceShape, 16);
  normalizePlanarUV(
    faceGeo,
    'xy',
    -(boardW - 0.02) / 2,
    boardW - 0.02,
    -(boardH - 0.02) / 2,
    boardH - 0.02,
  );

  const frontFace = new THREE.Mesh(faceGeo, signFaceMat);
  frontFace.position.set(0, 0.68, 0.0475);

  const backFace = new THREE.Mesh(faceGeo, signFaceMat);
  backFace.position.set(0, 0.68, -0.0475);
  backFace.rotation.y = Math.PI;

  disposables.push(baseBottomGeo, baseCollarGeo, postGeo, boardGeo, faceGeo);
  group.add(baseBottom, baseCollar, post, boardMesh, frontFace, backFace);

  // 为所有网格统一打上交互标记与阴影支持
  group.userData.interactiveId = 'bus-stop';
  group.traverse((obj) => {
    obj.userData.interactiveId = 'bus-stop';
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  return group;
}

/** 构建日式灰白时刻表站牌（位置 (-1.75, 0.16, 1.85)，面向 +Z） */
function buildJapaneseBusStop(
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(-1.75, 0.16, 1.85);

  const greyPlasticMat = new THREE.MeshStandardMaterial({
    color: 0xd9dee7,
    roughness: 0.65,
    metalness: 0.05,
  });
  const baseApronMat = new THREE.MeshStandardMaterial({
    color: 0xe6eaf0,
    roughness: 0.6,
    metalness: 0.05,
  });
  const timetableTex = createJapaneseTimetableTexture();
  const timetableMat = new THREE.MeshStandardMaterial({
    map: timetableTex,
    roughness: 0.42,
    metalness: 0.04,
  });
  disposables.push(greyPlasticMat, baseApronMat, timetableTex, timetableMat);

  // 两侧圆角卡扣垫块：卡在路板前缘（局部 y = 0..0.17）
  const clipShape = createRoundedRectShape(0.17, 0.26, 0.055);
  const clipGeo = new THREE.ExtrudeGeometry(clipShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  clipGeo.rotateX(-Math.PI / 2);
  clipGeo.computeBoundingBox();
  if (clipGeo.boundingBox) {
    clipGeo.translate(0, -clipGeo.boundingBox.min.y, 0);
  }

  const leftClip = new THREE.Mesh(clipGeo, greyPlasticMat);
  leftClip.position.set(-0.24, 0, -0.05);

  const rightClip = new THREE.Mesh(clipGeo, greyPlasticMat);
  rightClip.position.set(0.24, 0, -0.05);

  // 中央踏步底座：连接路板前缘并向下延伸至桌面 y_world = 0 (y_local = -0.16)，避免悬空
  const bridgeGeo = new THREE.BoxGeometry(0.42, 0.08, 0.24);
  const bridge = new THREE.Mesh(bridgeGeo, baseApronMat);
  bridge.position.set(0, 0.04, -0.02);

  const frontPlinthGeo = new THREE.BoxGeometry(0.36, 0.23, 0.26);
  const frontPlinth = new THREE.Mesh(frontPlinthGeo, baseApronMat);
  frontPlinth.position.set(0, -0.045, 0.13);

  // 中央立柱
  const postGeo = new THREE.BoxGeometry(0.085, 0.24, 0.065);
  const post = new THREE.Mesh(postGeo, greyPlasticMat);
  post.position.set(0, 0.18, 0.05);

  // 时刻表立牌盒体
  const signW = 0.34;
  const signH = 0.5;
  const signBoxGeo = new THREE.BoxGeometry(signW, signH, 0.082);
  const signBox = new THREE.Mesh(signBoxGeo, baseApronMat);
  signBox.position.set(0, 0.54, 0.05);

  // 正背面清晰时刻表贴图面
  const faceGeo = new THREE.PlaneGeometry(signW - 0.024, signH - 0.024);
  const frontFace = new THREE.Mesh(faceGeo, timetableMat);
  frontFace.position.set(0, 0.54, 0.05 + 0.042);

  const backFace = new THREE.Mesh(faceGeo, timetableMat);
  backFace.position.set(0, 0.54, 0.05 - 0.042);
  backFace.rotation.y = Math.PI;

  disposables.push(
    clipGeo,
    bridgeGeo,
    frontPlinthGeo,
    postGeo,
    signBoxGeo,
    faceGeo,
  );
  group.add(
    leftClip,
    rightClip,
    bridge,
    frontPlinth,
    post,
    signBox,
    frontFace,
    backFace,
  );

  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  return group;
}

/** 创建霓虹展厅专属的双色轮廓灯带与地面能量网格/扫描光圈 */
function buildNeonShowroomProps(
  disposables: Array<{ dispose: () => void }>,
): {
  group: THREE.Group;
  energyUniforms: { uTime: { value: number }; uOpacity: { value: number } };
  cyanMat: THREE.MeshStandardMaterial;
  magentaMat: THREE.MeshStandardMaterial;
} {
  const group = new THREE.Group();
  group.visible = false;

  const railHousingMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.4,
    metalness: 0.7,
  });
  const cyanMat = new THREE.MeshStandardMaterial({
    color: 0x00f0ff,
    emissive: new THREE.Color(0x00f0ff),
    emissiveIntensity: 3.0,
    roughness: 0.2,
    metalness: 0.1,
  });
  const magentaMat = new THREE.MeshStandardMaterial({
    color: 0xff2a85,
    emissive: new THREE.Color(0xff2a85),
    emissiveIntensity: 3.0,
    roughness: 0.2,
    metalness: 0.1,
  });

  const barGeo = new THREE.CapsuleGeometry(0.055, 4.4, 8, 16);
  barGeo.rotateX(Math.PI / 2);
  const capGeo = new THREE.CylinderGeometry(0.095, 0.11, 0.16, 16);

  const addSideBar = (x: number, mat: THREE.MeshStandardMaterial) => {
    const bar = new THREE.Mesh(barGeo, mat);
    bar.position.set(x, 0.09, 0);
    group.add(bar);

    for (const zSign of [-1, 1]) {
      const cap = new THREE.Mesh(capGeo, railHousingMat);
      cap.position.set(x, 0.08, zSign * 2.25);
      group.add(cap);
    }
  };

  addSideBar(-8.35, cyanMat);
  addSideBar(8.35, magentaMat);

  // 后方远端双段地坪霓虹灯条
  const rearBarGeo = new THREE.CapsuleGeometry(0.045, 6.2, 8, 16);
  rearBarGeo.rotateZ(Math.PI / 2);

  const rearCyan = new THREE.Mesh(rearBarGeo, cyanMat);
  rearCyan.position.set(-3.6, 0.07, -2.65);
  const rearMagenta = new THREE.Mesh(rearBarGeo, magentaMat);
  rearMagenta.position.set(3.6, 0.07, -2.65);
  group.add(rearCyan, rearMagenta);

  // 地面流动能量网格与动态扫描光圈 Shader
  const energyUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
  };
  const energyGridMat = new THREE.ShaderMaterial({
    uniforms: energyUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vWorldXZ;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldXZ = worldPos.xz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vWorldXZ;

      void main() {
        // 流动空间坐标网格线
        vec2 gridCoord = vWorldXZ * 1.15;
        vec2 cell = abs(fract(gridCoord - 0.5) - 0.5) / max(fwidth(gridCoord), vec2(0.001));
        float gridLine = 1.0 - min(min(cell.x, cell.y), 1.0);
        gridLine = clamp(gridLine, 0.0, 1.0);

        // 从路板中心向外扩散的椭圆能量扫描脉冲波
        float dist = length(vec2(vWorldXZ.x * 0.42, vWorldXZ.y * 0.92));
        float wavePos = fract(uTime * 0.24) * 5.8;
        float scanRing = smoothstep(0.32, 0.0, abs(dist - wavePos));

        // 左右青色 (#00f0ff) 到品红 (#ff2a85) 渐变
        float lrMix = smoothstep(-8.5, 8.5, vWorldXZ.x);
        vec3 colCyan = vec3(0.0, 0.94, 1.0);
        vec3 colPink = vec3(1.0, 0.165, 0.52);
        vec3 baseCol = mix(colCyan, colPink, lrMix);

        // 外缘自然衰减
        float radialFade = 1.0 - smoothstep(3.2, 6.2, dist);
        // 路板覆盖区域弱化内部网格，突出周边能量场
        float innerMask = smoothstep(1.6, 2.5, dist);

        float alpha = (gridLine * 0.28 * innerMask + scanRing * 0.65) * radialFade * uOpacity;
        gl_FragColor = vec4(baseCol * (1.1 + scanRing * 0.8), alpha);
      }
    `,
  });

  const gridPlaneGeo = new THREE.PlaneGeometry(28, 16);
  gridPlaneGeo.rotateX(-Math.PI / 2);
  const gridPlane = new THREE.Mesh(gridPlaneGeo, energyGridMat);
  gridPlane.position.set(0, 0.008, 0);
  group.add(gridPlane);

  disposables.push(
    railHousingMat,
    cyanMat,
    magentaMat,
    barGeo,
    capGeo,
    rearBarGeo,
    energyGridMat,
    gridPlaneGeo,
  );

  return { group, energyUniforms, cyanMat, magentaMat };
}

/**
 * 创建整个 3D 桌面展厅舞台环境、站牌、PMREM 金属反射及三档灯光氛围控制器。
 */
export function createEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
): EnvironmentController {
  const disposables: Array<{ dispose: () => void }> = [];

  // 1. PMREM 环境贴图（RoomEnvironment）：赋予车漆与不锈钢冷轧钢真实展厅高光反射
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const roomEnv = new RoomEnvironment();
  const envRenderTarget = pmremGenerator.fromScene(roomEnv, 0.04);
  scene.environment = envRenderTarget.texture;
  scene.environmentIntensity = MODE_CONFIGS.desk.envIntensity;
  roomEnv.dispose();
  pmremGenerator.dispose();
  disposables.push(envRenderTarget);

  // 2. 初始化场景背景与指数雾（默认桌面暖光彻底无雾）
  const initialMode = MODE_CONFIGS.desk;
  const bgColor = initialMode.bgColor.clone();
  const fog = new THREE.FogExp2(
    initialMode.fogColor.getHex(),
    initialMode.fogDensity,
  );
  scene.background = bgColor;
  scene.fog = initialMode.fogDensity > 0.0005 ? fog : null;

  // 3. 灯光系统（主方向光 + 半球光 + 左右轮廓补光）
  const keyLight = new THREE.DirectionalLight(
    initialMode.keyColor,
    initialMode.keyIntensity,
  );
  keyLight.position.copy(initialMode.keyPosition);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 32;
  keyLight.shadow.camera.left = -9;
  keyLight.shadow.camera.right = 9;
  keyLight.shadow.camera.top = 6;
  keyLight.shadow.camera.bottom = -6;
  keyLight.shadow.radius = 1.5;
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.025;
  scene.add(keyLight);

  const hemiLight = new THREE.HemisphereLight(
    initialMode.hemiSky,
    initialMode.hemiGround,
    initialMode.hemiIntensity,
  );
  scene.add(hemiLight);

  const rimLeftLight = new THREE.PointLight(
    initialMode.rimLeftColor,
    initialMode.rimLeftIntensity,
    24,
    1.2,
  );
  rimLeftLight.position.set(-8.6, 2.8, 1.8);
  scene.add(rimLeftLight);

  const rimRightLight = new THREE.PointLight(
    initialMode.rimRightColor,
    initialMode.rimRightIntensity,
    24,
    1.2,
  );
  rimRightLight.position.set(8.6, 2.8, 1.8);
  scene.add(rimRightLight);

  // 4. 胡桃木大桌面（36 × 26，顶面严格位于 y = 0）+ 柔和外缘渐隐裙边
  const { map: woodMap, roughnessMap: woodRoughnessMap } = createWoodTextures();
  const deskMat = new THREE.MeshPhysicalMaterial({
    color: initialMode.deskColor.clone(),
    map: woodMap,
    roughnessMap: woodRoughnessMap,
    roughness: initialMode.deskRoughness,
    metalness: initialMode.deskMetalness,
    clearcoat: initialMode.deskClearcoat,
    clearcoatRoughness: initialMode.deskClearcoatRoughness,
  });
  const deskGeo = new THREE.BoxGeometry(52, 0.8, 34);
  const deskMesh = new THREE.Mesh(deskGeo, deskMat);
  deskMesh.position.set(0, -0.4, 2);
  deskMesh.receiveShadow = true;
  scene.add(deskMesh);

  // 外围椭圆柔和渐隐裙边：仅在霓虹/影棚模式开启，桌面暖光模式下透明隐藏保证木纹锐利清晰
  const vignetteAlpha = createEdgeVignetteAlphaTexture();
  const vignetteMat = new THREE.MeshBasicMaterial({
    color: initialMode.bgColor.clone(),
    alphaMap: vignetteAlpha,
    opacity: initialMode.vignetteOpacity,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const vignetteGeo = new THREE.PlaneGeometry(38, 28);
  vignetteGeo.rotateX(-Math.PI / 2);
  const vignetteMesh = new THREE.Mesh(vignetteGeo, vignetteMat);
  vignetteMesh.position.set(0, 0.002, 0);
  vignetteMesh.visible = initialMode.vignetteOpacity > 0.005;
  scene.add(vignetteMesh);

  disposables.push(
    woodMap,
    woodRoughnessMap,
    deskMat,
    deskGeo,
    vignetteAlpha,
    vignetteMat,
    vignetteGeo,
  );

  // 5. 桌面后方虚化氛围背景物体（黑圆盘桌面旋钮 + 左支架 + 右收纳箱轮廓）
  const backdropGroup = buildBackdropAtmosphere(disposables);
  scene.add(backdropGroup);

  // 6. 5 块拼接灰白色 Tomica 路板（X ∈ [-7.5, +7.5], Z ∈ [-1.85, +1.85], 顶面 y = 0.16）
  const roadTex = createRoadMatTexture();
  roadTex.wrapS = THREE.ClampToEdgeWrapping;
  roadTex.wrapT = THREE.ClampToEdgeWrapping;

  const roadTopMat = new THREE.MeshStandardMaterial({
    color: initialMode.roadTint.clone(),
    map: roadTex,
    roughness: initialMode.roadRoughness,
    metalness: 0.03,
  });
  const roadEdgeMat = new THREE.MeshStandardMaterial({
    color: 0xd0d6e0,
    roughness: 0.72,
    metalness: 0.03,
  });
  const roadPlateGeo = createTomicaRoadPlateGeometry();
  const roadGroup = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const plate = new THREE.Mesh(roadPlateGeo, [roadTopMat, roadEdgeMat]);
    plate.position.set(-6.0 + i * 3.0, 0, 0);
    plate.castShadow = true;
    plate.receiveShadow = true;
    roadGroup.add(plate);
  }
  scene.add(roadGroup);
  disposables.push(roadTex, roadTopMat, roadEdgeMat, roadPlateGeo);

  // 7. 蓝色 BUS STOP 站牌与日式灰白时刻表站牌
  const busStopGroup = buildBlueBusStop(disposables);
  scene.add(busStopGroup);

  const jpBusStopGroup = buildJapaneseBusStop(disposables);
  scene.add(jpBusStopGroup);

  // 8. 霓虹展厅模式装饰与地面流动能量网格
  const neonProps = buildNeonShowroomProps(disposables);
  scene.add(neonProps.group);

  // 模式切换平滑插值状态
  let activeMode: LightingMode = 'desk';
  let currentNeonFactor = 0;

  // 蓝色站牌 Q 弹点击晃动动画状态
  let busStopAnimActive = false;
  let busStopAnimElapsed = 0;
  const BUS_STOP_ANIM_DURATION = 1.15;

  const setLightingMode = (mode: LightingMode): BloomPreset => {
    activeMode = mode;
    return { ...MODE_CONFIGS[mode].bloom };
  };

  const triggerBusStopAnimation = () => {
    busStopAnimActive = true;
    busStopAnimElapsed = 0;
  };

  const update = (dt: number, elapsed: number) => {
    const clampedDt = Math.min(dt, 0.05);
    const target = MODE_CONFIGS[activeMode];
    const alpha = 1 - Math.exp(-6.5 * clampedDt);

    // 平滑插值背景色、雾效、边缘渐隐、环境反射与各路灯光
    bgColor.lerp(target.bgColor, alpha);
    fog.color.lerp(target.fogColor, alpha);
    fog.density = THREE.MathUtils.lerp(fog.density, target.fogDensity, alpha);
    scene.fog = fog.density > 0.0005 ? fog : null;

    vignetteMat.color.copy(bgColor);
    vignetteMat.opacity = THREE.MathUtils.lerp(
      vignetteMat.opacity,
      target.vignetteOpacity,
      alpha,
    );
    vignetteMesh.visible = vignetteMat.opacity > 0.005;

    scene.environmentIntensity = THREE.MathUtils.lerp(
      scene.environmentIntensity,
      target.envIntensity,
      alpha,
    );

    keyLight.color.lerp(target.keyColor, alpha);
    keyLight.intensity = THREE.MathUtils.lerp(
      keyLight.intensity,
      target.keyIntensity,
      alpha,
    );
    keyLight.position.lerp(target.keyPosition, alpha);

    hemiLight.color.lerp(target.hemiSky, alpha);
    hemiLight.groundColor.lerp(target.hemiGround, alpha);
    hemiLight.intensity = THREE.MathUtils.lerp(
      hemiLight.intensity,
      target.hemiIntensity,
      alpha,
    );

    rimLeftLight.color.lerp(target.rimLeftColor, alpha);
    rimLeftLight.intensity = THREE.MathUtils.lerp(
      rimLeftLight.intensity,
      target.rimLeftIntensity,
      alpha,
    );

    rimRightLight.color.lerp(target.rimRightColor, alpha);
    rimRightLight.intensity = THREE.MathUtils.lerp(
      rimRightLight.intensity,
      target.rimRightIntensity,
      alpha,
    );

    // 桌面材质平滑切换（暖胡桃木 <-> 黑曜石高光 <-> 浅银棚拍）
    deskMat.color.lerp(target.deskColor, alpha);
    deskMat.roughness = THREE.MathUtils.lerp(
      deskMat.roughness,
      target.deskRoughness,
      alpha,
    );
    deskMat.metalness = THREE.MathUtils.lerp(
      deskMat.metalness,
      target.deskMetalness,
      alpha,
    );
    deskMat.clearcoat = THREE.MathUtils.lerp(
      deskMat.clearcoat,
      target.deskClearcoat,
      alpha,
    );
    deskMat.clearcoatRoughness = THREE.MathUtils.lerp(
      deskMat.clearcoatRoughness,
      target.deskClearcoatRoughness,
      alpha,
    );

    roadTopMat.color.lerp(target.roadTint, alpha);
    roadTopMat.roughness = THREE.MathUtils.lerp(
      roadTopMat.roughness,
      target.roadRoughness,
      alpha,
    );
    roadEdgeMat.color.copy(roadTopMat.color).multiplyScalar(0.92);
    roadEdgeMat.roughness = roadTopMat.roughness;

    // 霓虹能量网格与两侧灯带淡入淡出及呼吸脉冲
    currentNeonFactor = THREE.MathUtils.lerp(
      currentNeonFactor,
      target.neonFactor,
      alpha,
    );
    const showNeon = currentNeonFactor > 0.015;
    neonProps.group.visible = showNeon;
    if (showNeon) {
      neonProps.energyUniforms.uTime.value = elapsed;
      neonProps.energyUniforms.uOpacity.value = currentNeonFactor;
      const pulse = 2.6 + Math.sin(elapsed * 2.8) * 0.45;
      neonProps.cyanMat.emissiveIntensity = pulse * currentNeonFactor;
      neonProps.magentaMat.emissiveIntensity =
        (2.6 + Math.cos(elapsed * 2.8) * 0.45) * currentNeonFactor;
    }

    // 蓝色站牌 Q 弹点击晃动（围绕底部底座重心弹性摇摆 + 轻弹）
    if (busStopAnimActive) {
      busStopAnimElapsed += clampedDt;
      const p = Math.min(1, busStopAnimElapsed / BUS_STOP_ANIM_DURATION);
      const decay = Math.exp(-4.2 * p) * (1 - p);
      busStopGroup.rotation.z = Math.sin(p * Math.PI * 6.5) * 0.24 * decay;
      busStopGroup.rotation.x = Math.cos(p * Math.PI * 5.0) * 0.11 * decay;
      const bounceY = Math.abs(Math.sin(p * Math.PI * 3.0)) * 0.07 * decay;
      busStopGroup.position.y = 0.16 + bounceY;
      const squash = 1 + Math.sin(p * Math.PI * 5.5) * 0.06 * decay;
      busStopGroup.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));

      if (p >= 1) {
        busStopAnimActive = false;
        busStopGroup.rotation.set(0, 0, 0);
        busStopGroup.position.y = 0.16;
        busStopGroup.scale.set(1, 1, 1);
      }
    }
  };

  const dispose = () => {
    scene.remove(
      keyLight,
      hemiLight,
      rimLeftLight,
      rimRightLight,
      deskMesh,
      vignetteMesh,
      backdropGroup,
      roadGroup,
      busStopGroup,
      jpBusStopGroup,
      neonProps.group,
    );
    scene.environment = null;
    for (const item of disposables) {
      item.dispose();
    }
  };

  return {
    busStopGroup,
    setLightingMode,
    triggerBusStopAnimation,
    update,
    dispose,
  };
}
