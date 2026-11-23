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

export const DHL_TRUCK_SPEC: CarSpec = {
  id: 'dhl-truck',
  name: 'DHL 快递双厢挂车',
  englishName: 'DHL Express Tandem',
  subtitle: '标志性亮黄双货厢快递重卡',
  description:
    '高度还原桌面亮黄 DHL 双厢拖挂卡车：平头驾驶室搭配梯形挡风玻璃与镀铬大灯组，前车后方通过黄色 A 型牵引三角连杆拖拽独立双轴后挂货厢，箱体两侧绘制经典红斜体 DHL 速度线标志与黑色标语。',
  highlights: [
    '平头驾驶室 + 独立双轴后挂厢',
    '黄色 A 型三角牵引连杆联动',
    '双面高清 DHL 红斜体速度线涂装',
    '前车与挂车相位差减震弹跳',
  ],
  soundLabel: '重卡柴油轰鸣 + 双音气喇叭 + 扫码滴声',
  accentColor: '#eab308',
  accentHex: 0xeab308,
  position: [3.3, 0.16, -0.85],
  rotationY: -0.02,
  focusOffset: [3.25, 2.35, 5.1],
  focusTargetOffset: [0.55, 0.62, 0],
};

const DHL_YELLOW = '#fbbf0a';
const DHL_RED = '#d40511';
const WHEEL_RADIUS = 0.165;
const BOX_WIDTH = 1.18;
const BOX_HEIGHT = 1.16;
const BOX_BASE_Y = 0.36;

interface CargoBoxOptions {
  length: number;
  width: number;
  height: number;
  centerX: number;
  baseY: number;
  yellowMat: THREE.Material;
  trimMat: THREE.Material;
  metalMat: THREE.Material;
  sideTextureFrontRight: THREE.Texture;
  sideTextureFrontLeft: THREE.Texture;
  rearDoorTexture: THREE.Texture;
}

/**
 * 绘制 DHL 货厢侧面高清涂装纹理。
 * 注意：+Z 侧与 -Z 侧平面朝向不同，为了保证两侧文字都正面可读且不镜像，
 * 文本统一按正常从左到右绘制，仅通过 frontOnRight 控制边缘缝线与标语锚点方向。
 */
function createDhlSideTexture(frontOnRight: boolean): THREE.CanvasTexture {
  return createCanvasTexture(1024, 640, (ctx, w, h) => {
    ctx.fillStyle = DHL_YELLOW;
    ctx.fillRect(0, 0, w, h);

    // 货厢外框微弱立体压边与竖向拼板线
    ctx.strokeStyle = 'rgba(135, 92, 0, 0.28)';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    const seamX = frontOnRight ? 36 : w - 36;
    ctx.fillStyle = 'rgba(120, 82, 0, 0.22)';
    ctx.fillRect(seamX - 1.5, 18, 3, h - 36);

    // 经典红色斜体 DHL 标志与左右各 3 条速度横线
    const centerX = w * 0.5;
    const logoY = h * 0.49;

    ctx.save();
    ctx.fillStyle = DHL_RED;

    // 两侧三道水平速度横线（略带斜切边缘呼应斜体字母）
    const stripeOffsets = [-22, 0, 22];
    const stripeH = 12;
    const leftInner = centerX - 210;
    const rightInner = centerX + 210;

    for (let i = 0; i < stripeOffsets.length; i++) {
      const sy = logoY + stripeOffsets[i] - stripeH / 2;
      const slant = (1 - i) * 7;

      // 左侧 3 条速度横线
      ctx.beginPath();
      ctx.moveTo(64, sy);
      ctx.lineTo(leftInner - slant, sy);
      ctx.lineTo(leftInner - slant - 9, sy + stripeH);
      ctx.lineTo(64, sy + stripeH);
      ctx.closePath();
      ctx.fill();

      // 右侧 3 条速度横线
      ctx.beginPath();
      ctx.moveTo(rightInner - slant + 8, sy);
      ctx.lineTo(w - 64, sy);
      ctx.lineTo(w - 64, sy + stripeH);
      ctx.lineTo(rightInner - slant - 1, sy + stripeH);
      ctx.closePath();
      ctx.fill();
    }

    // 粗斜体 DHL 主字样
    ctx.font = 'italic 900 162px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(centerX, logoY + 4);
    ctx.transform(1, 0, -0.22, 1, 0, 0);
    ctx.fillText('DHL', 0, 0);

    // 还原标准 DHL 横向速度分割细黄线，增添印刷锐利度
    ctx.fillStyle = DHL_YELLOW;
    ctx.fillRect(-205, -3, 410, 5);
    ctx.restore();

    // 下方经典黑色口号文字：EXCELLENCE. SIMPLY DELIVERED.
    ctx.fillStyle = '#18181b';
    ctx.font = '700 31px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = frontOnRight ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    const sloganX = frontOnRight ? 74 : w - 74;
    ctx.fillText('EXCELLENCE. SIMPLY DELIVERED.', sloganX, h - 54);
  });
}

/**
 * 绘制货厢后方双开尾门纹理（门缝、角件锁扣、底部小型反光警示条）。
 */
function createRearDoorTexture(): THREE.CanvasTexture {
  return createCanvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = DHL_YELLOW;
    ctx.fillRect(0, 0, w, h);

    // 外框线条
    ctx.strokeStyle = 'rgba(130, 88, 0, 0.35)';
    ctx.lineWidth = 8;
    ctx.strokeRect(14, 14, w - 28, h - 28);

    // 中央双开门竖向门缝
    ctx.fillStyle = 'rgba(85, 58, 0, 0.55)';
    ctx.fillRect(w / 2 - 2.5, 16, 5, h - 32);

    // 上下门框铆钉与合页块
    ctx.fillStyle = '#9ca3af';
    for (const hy of [74, 240, 416]) {
      ctx.fillRect(20, hy, 22, 14);
      ctx.fillRect(w - 42, hy, 22, 14);
    }

    // 右上角迷你红色 DHL 角标
    ctx.fillStyle = DHL_RED;
    ctx.font = 'italic 900 44px "Arial Black", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('DHL', w - 38, 36);

    // 底部红黄相间反光安全条
    const stripeW = 36;
    for (let x = 32; x < w - 32; x += stripeW * 2) {
      ctx.fillStyle = DHL_RED;
      ctx.fillRect(x, h - 40, stripeW, 12);
    }
  });
}

/**
 * 绘制平头驾驶室侧面车窗涂装（与实拍图一致的前倾下沉式梯形侧窗）。
 */
function createCabDoorWindowMesh(
  side: 1 | -1,
  glassMat: THREE.Material,
  frameMat: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();

  const winShape = new THREE.Shape();
  winShape.moveTo(-0.22, -0.10);
  winShape.lineTo(0.24, -0.17);
  winShape.lineTo(0.14, 0.16);
  winShape.lineTo(-0.22, 0.16);
  winShape.closePath();

  const glassGeo = new THREE.ShapeGeometry(winShape);
  const glass = new THREE.Mesh(glassGeo, glassMat);
  if (side === -1) {
    glass.rotation.y = Math.PI;
  }
  group.add(glass);

  // 黑色窗框细边条
  const borderShape = new THREE.Shape();
  borderShape.moveTo(-0.24, -0.12);
  borderShape.lineTo(0.26, -0.19);
  borderShape.lineTo(0.16, 0.18);
  borderShape.lineTo(-0.24, 0.18);
  borderShape.closePath();
  const borderMesh = new THREE.Mesh(
    new THREE.ShapeGeometry(borderShape),
    frameMat,
  );
  borderMesh.position.z = -0.002 * side;
  if (side === -1) {
    borderMesh.rotation.y = Math.PI;
  }
  group.add(borderMesh);

  return group;
}

/**
 * 构建 DHL 标准黄色方形货厢（前车货厢与独立后挂货厢复用同一构造函数，避免重复逻辑）。
 */
function createDhlCargoBox(opts: CargoBoxOptions): THREE.Group {
  const boxGroup = new THREE.Group();
  const centerY = opts.baseY + opts.height / 2;

  // 主黄色箱体
  const coreGeo = new THREE.BoxGeometry(opts.length, opts.height, opts.width);
  const coreMesh = new THREE.Mesh(coreGeo, opts.yellowMat);
  coreMesh.position.set(opts.centerX, centerY, 0);
  boxGroup.add(coreMesh);

  // 顶部与四角的微凸包边，增强玩具合金压铸层次感
  const roofCapGeo = new THREE.BoxGeometry(
    opts.length + 0.014,
    0.035,
    opts.width + 0.014,
  );
  const roofCap = new THREE.Mesh(roofCapGeo, opts.yellowMat);
  roofCap.position.set(opts.centerX, opts.baseY + opts.height - 0.012, 0);
  boxGroup.add(roofCap);

  const sideGeo = new THREE.PlaneGeometry(opts.length - 0.02, opts.height - 0.04);

  // 右侧 (+Z) 涂装面：外法线指向 +Z，无需旋转
  const rightMat = createDiecastMaterial(0xffffff, {
    map: opts.sideTextureFrontRight,
    metalness: 0.18,
    roughness: 0.28,
    clearcoat: 0.85,
  });
  const rightPanel = new THREE.Mesh(sideGeo, rightMat);
  rightPanel.position.set(opts.centerX, centerY, opts.width / 2 + 0.003);
  boxGroup.add(rightPanel);

  // 左侧 (-Z) 涂装面：绕 Y 轴旋转 180° 使外法线指向 -Z 且文字正面朝外可读
  const leftMat = createDiecastMaterial(0xffffff, {
    map: opts.sideTextureFrontLeft,
    metalness: 0.18,
    roughness: 0.28,
    clearcoat: 0.85,
  });
  const leftPanel = new THREE.Mesh(sideGeo, leftMat);
  leftPanel.rotation.y = Math.PI;
  leftPanel.position.set(opts.centerX, centerY, -opts.width / 2 - 0.003);
  boxGroup.add(leftPanel);

  // 后方双开尾门 (-X 端，rotation.y = -PI/2 朝向 -X)
  const rearX = opts.centerX - opts.length / 2;
  const doorGeo = new THREE.PlaneGeometry(opts.width - 0.04, opts.height - 0.04);
  const doorMat = createDiecastMaterial(0xffffff, {
    map: opts.rearDoorTexture,
    metalness: 0.2,
    roughness: 0.3,
    clearcoat: 0.75,
  });
  const doorPanel = new THREE.Mesh(doorGeo, doorMat);
  doorPanel.rotation.y = -Math.PI / 2;
  doorPanel.position.set(rearX - 0.003, centerY, 0);
  boxGroup.add(doorPanel);

  // 真实 3D 银色门锁竖杆
  const rodGeo = new THREE.CylinderGeometry(0.011, 0.011, opts.height - 0.16, 10);
  for (const rz of [-0.14, 0.14]) {
    const rod = new THREE.Mesh(rodGeo, opts.metalMat);
    rod.position.set(rearX - 0.014, centerY, rz);
    boxGroup.add(rod);
  }

  // 底部下沿黑色托梁框
  const skirtGeo = new THREE.BoxGeometry(
    opts.length + 0.01,
    0.04,
    opts.width + 0.01,
  );
  const skirt = new THREE.Mesh(skirtGeo, opts.trimMat);
  skirt.position.set(opts.centerX, opts.baseY - 0.015, 0);
  boxGroup.add(skirt);

  return boxGroup;
}

/**
 * 构建带双组亮黄货厢、A 型牵引杆与多轴轮胎的 DHL 快递重卡。
 */
export function createDhlTruckCar(): CarObject {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  const trailerGroup = new THREE.Group();
  const wheels: THREE.Group[] = [];

  const frontLights: THREE.Mesh[] = [];
  const rearLights: THREE.Mesh[] = [];
  const accentLights: THREE.Mesh[] = [];

  // 共享材质与纹理
  const yellowMat = createDiecastMaterial(DHL_YELLOW, {
    metalness: 0.24,
    roughness: 0.26,
    clearcoat: 0.92,
  });
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x1a1d23,
    roughness: 0.72,
    metalness: 0.22,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.25,
    metalness: 0.85,
  });
  const glassMat = createGlassMaterial({
    color: 0x151a22,
    opacity: 0.86,
  });

  const sideTexRight = createDhlSideTexture(true);
  const sideTexLeft = createDhlSideTexture(false);
  const rearDoorTex = createRearDoorTexture();

  // ======================== 1. 前卡车车头与前货厢 (bodyGroup) ========================
  // 平头驾驶室侧轮廓（底部含真实前轮拱镂空，避免与前轮干涉）
  const cabShape = new THREE.Shape();
  cabShape.moveTo(1.78, 0.29);
  cabShape.lineTo(2.06, 0.29);
  cabShape.absarc(2.24, 0.165, 0.215, Math.PI * 0.8, Math.PI * 0.2, true);
  cabShape.lineTo(2.74, 0.29);
  cabShape.lineTo(2.74, 0.63);
  cabShape.lineTo(2.55, 1.07);
  cabShape.lineTo(2.44, 1.15);
  cabShape.lineTo(1.78, 1.15);
  cabShape.closePath();

  const cabGeo = new THREE.ExtrudeGeometry(cabShape, {
    depth: 1.02,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  cabGeo.translate(0, 0, -0.51);
  const cabMesh = new THREE.Mesh(cabGeo, yellowMat);
  bodyGroup.add(cabMesh);

  // 前轮拱黑色护眉
  for (const side of [1, -1] as const) {
    const cabArch = new THREE.Mesh(
      new THREE.TorusGeometry(0.215, 0.022, 8, 18, Math.PI * 0.64),
      chassisMat,
    );
    cabArch.rotation.z = Math.PI * 0.18;
    cabArch.position.set(2.24, 0.165, side * 0.532);
    bodyGroup.add(cabArch);
  }

  // 驾驶室梯形前挡风玻璃（与前倾角度贴合）
  const windshieldGeo = new THREE.BoxGeometry(0.02, 0.41, 0.94);
  const windshield = new THREE.Mesh(windshieldGeo, glassMat);
  windshield.position.set(2.655, 0.855, 0);
  windshield.rotation.z = Math.atan2(2.74 - 2.55, 1.07 - 0.63);
  bodyGroup.add(windshield);

  // 挡风玻璃黑框与雨刮器饰条
  const wiperBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.024, 0.03, 0.96),
    chassisMat,
  );
  wiperBar.position.set(2.745, 0.635, 0);
  bodyGroup.add(wiperBar);

  // 驾驶室左右侧窗 + 后视镜
  for (const side of [1, -1] as const) {
    const doorWin = createCabDoorWindowMesh(side, glassMat, chassisMat);
    doorWin.position.set(2.28, 0.86, side * 0.537);
    bodyGroup.add(doorWin);

    // 侧门把手
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.024, 0.02),
      chassisMat,
    );
    handle.position.set(2.04, 0.58, side * 0.542);
    bodyGroup.add(handle);

    // 外伸重卡后视镜
    const mirrorArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.02, 0.10),
      chassisMat,
    );
    mirrorArm.position.set(2.58, 0.84, side * 0.56);
    bodyGroup.add(mirrorArm);

    const mirrorHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.14, 0.035),
      chassisMat,
    );
    mirrorHead.position.set(2.60, 0.78, side * 0.61);
    bodyGroup.add(mirrorHead);
  }

  // 驾驶室前脸黑色中网、保险杠与大灯组
  const frontBumper = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.15, 1.14),
    chassisMat,
  );
  frontBumper.position.set(2.72, 0.255, 0);
  bodyGroup.add(frontBumper);

  const frontGrille = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.18, 0.66),
    chassisMat,
  );
  frontGrille.position.set(2.755, 0.46, 0);
  bodyGroup.add(frontGrille);

  // 中网横条镀铬饰件
  for (const gy of [0.41, 0.46, 0.51]) {
    const slat = new THREE.Mesh(
      new THREE.BoxGeometry(0.046, 0.015, 0.60),
      metalMat,
    );
    slat.position.set(2.76, gy, 0);
    bodyGroup.add(slat);
  }

  // 前大灯（明亮白黄光）与转向角灯（琥珀黄）
  const headLampGeo = new THREE.BoxGeometry(0.036, 0.085, 0.13);
  const turnLampGeo = new THREE.BoxGeometry(0.036, 0.06, 0.07);
  const roofBeaconGeo = new THREE.BoxGeometry(0.05, 0.035, 0.08);
  for (const side of [1, -1] as const) {
    const headLamp = createEmissiveLight(headLampGeo, 0xfff6d4, 1.55);
    headLamp.position.set(2.76, 0.42, side * 0.42);
    bodyGroup.add(headLamp);
    frontLights.push(headLamp);

    const turnLamp = createEmissiveLight(turnLampGeo, 0xff9f1c, 1.1);
    turnLamp.position.set(2.755, 0.42, side * 0.52);
    bodyGroup.add(turnLamp);
    accentLights.push(turnLamp);

    // 车顶示廓警示灯
    const beacon = createEmissiveLight(roofBeaconGeo, 0xffaa00, 1.0);
    beacon.position.set(2.43, 1.18, side * 0.34);
    bodyGroup.add(beacon);
    accentLights.push(beacon);
  }

  // 前车底盘大梁、油箱与电池箱
  const truckChassis = new THREE.Mesh(
    new THREE.BoxGeometry(2.54, 0.14, 0.88),
    chassisMat,
  );
  truckChassis.position.set(1.47, 0.24, 0);
  bodyGroup.add(truckChassis);

  const fuelTank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.085, 0.48, 16),
    metalMat,
  );
  fuelTank.rotation.z = Math.PI / 2;
  fuelTank.position.set(1.42, 0.22, 0.46);
  bodyGroup.add(fuelTank);

  const batteryBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.15, 0.16),
    chassisMat,
  );
  batteryBox.position.set(1.42, 0.22, -0.46);
  bodyGroup.add(batteryBox);

  // 前车黄色货厢（x ∈ [+0.20, +1.74]）
  const frontBox = createDhlCargoBox({
    length: 1.54,
    width: BOX_WIDTH,
    height: BOX_HEIGHT,
    centerX: 0.97,
    baseY: BOX_BASE_Y,
    yellowMat,
    trimMat: chassisMat,
    metalMat,
    sideTextureFrontRight: sideTexRight,
    sideTextureFrontLeft: sideTexLeft,
    rearDoorTexture: rearDoorTex,
  });
  bodyGroup.add(frontBox);

  // 前车尾部保险杠、牵引钩座与尾灯
  const truckRearBumper = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 0.10, 1.12),
    chassisMat,
  );
  truckRearBumper.position.set(0.22, 0.22, 0);
  bodyGroup.add(truckRearBumper);

  const hitchSocket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.07, 12),
    chassisMat,
  );
  hitchSocket.position.set(0.18, 0.21, 0);
  bodyGroup.add(hitchSocket);

  const tailLampGeo = new THREE.BoxGeometry(0.03, 0.065, 0.14);
  for (const side of [1, -1] as const) {
    const tail = createEmissiveLight(tailLampGeo, 0xff2a2a, 1.35);
    tail.position.set(0.17, 0.22, side * 0.41);
    bodyGroup.add(tail);
    rearLights.push(tail);
  }

  // ======================== 2. 独立后挂货厢与牵引连杆 (trailerGroup) ========================
  // 后挂黄色货厢（x ∈ [-2.74, -0.29]）
  const trailerBox = createDhlCargoBox({
    length: 2.45,
    width: BOX_WIDTH,
    height: BOX_HEIGHT,
    centerX: -1.515,
    baseY: BOX_BASE_Y,
    yellowMat,
    trimMat: chassisMat,
    metalMat,
    sideTextureFrontRight: sideTexRight,
    sideTextureFrontLeft: sideTexLeft,
    rearDoorTexture: rearDoorTex,
  });
  trailerGroup.add(trailerBox);

  // 挂车黑色底盘大梁与前黄色转向架下裙（还原实拍图中可见的挂车前底部黄色框架）
  const trailerChassis = new THREE.Mesh(
    new THREE.BoxGeometry(2.46, 0.13, 0.88),
    chassisMat,
  );
  trailerChassis.position.set(-1.515, 0.25, 0);
  trailerGroup.add(trailerChassis);

  const dollyApron = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.09, 0.72),
    yellowMat,
  );
  dollyApron.position.set(-0.46, 0.22, 0);
  trailerGroup.add(dollyApron);

  // 黄色 A 型三角牵引连杆（从挂车前底延伸至前卡车尾部挂钩处）
  const drawbarShape = new THREE.Shape();
  drawbarShape.moveTo(-0.32, 0.27);
  drawbarShape.lineTo(0.21, 0.04);
  drawbarShape.lineTo(0.21, -0.04);
  drawbarShape.lineTo(-0.32, -0.27);
  drawbarShape.lineTo(-0.32, -0.18);
  drawbarShape.lineTo(0.08, 0);
  drawbarShape.lineTo(-0.32, 0.18);
  drawbarShape.closePath();

  const drawbarGeo = new THREE.ExtrudeGeometry(drawbarShape, {
    depth: 0.045,
    bevelEnabled: false,
  });
  // 将 XY 平面造型转平放到 XZ 水平面
  drawbarGeo.rotateX(Math.PI / 2);
  const drawbarMesh = new THREE.Mesh(drawbarGeo, yellowMat);
  drawbarMesh.position.set(0, 0.23, 0);
  trailerGroup.add(drawbarMesh);

  // 牵引前端圆环销栓
  const hitchPin = new THREE.Mesh(
    new THREE.TorusGeometry(0.035, 0.012, 8, 16),
    chassisMat,
  );
  hitchPin.rotation.x = Math.PI / 2;
  hitchPin.position.set(0.20, 0.21, 0);
  trailerGroup.add(hitchPin);

  // 挂车后保险杠与尾灯、黄色防撞反光示廓灯
  const trailerRearBumper = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.10, 1.12),
    chassisMat,
  );
  trailerRearBumper.position.set(-2.74, 0.22, 0);
  trailerGroup.add(trailerRearBumper);

  for (const side of [1, -1] as const) {
    const trailerTail = createEmissiveLight(tailLampGeo, 0xff2a2a, 1.45);
    trailerTail.position.set(-2.785, 0.22, side * 0.41);
    trailerGroup.add(trailerTail);
    rearLights.push(trailerTail);

    const sideMarker = createEmissiveLight(
      new THREE.BoxGeometry(0.05, 0.025, 0.02),
      0xffb703,
      1.1,
    );
    sideMarker.position.set(-2.62, 0.31, side * 0.592);
    trailerGroup.add(sideMarker);
    accentLights.push(sideMarker);
  }

  // 挂车迷你车牌
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.015, 0.06, 0.18),
    new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 }),
  );
  plate.position.set(-2.79, 0.22, 0);
  trailerGroup.add(plate);

  // ======================== 3. 车轮直接挂载至 root，防止悬架晃动时轮胎穿模 ========================
  const wheelZ = 0.515;
  mountWheels(
    root,
    wheels,
    [
      // 前卡车前轴（2 轮）
      { x: 2.24, y: WHEEL_RADIUS, z: wheelZ },
      { x: 2.24, y: WHEEL_RADIUS, z: -wheelZ },
      // 前卡车后驱轴（2 轮，略宽拟真重卡后胎）
      { x: 0.78, y: WHEEL_RADIUS, z: wheelZ, options: { width: 0.135 } },
      { x: 0.78, y: WHEEL_RADIUS, z: -wheelZ, options: { width: 0.135 } },
      // 后挂车双轴轮组（4 轮）
      { x: -1.26, y: WHEEL_RADIUS, z: wheelZ },
      { x: -1.26, y: WHEEL_RADIUS, z: -wheelZ },
      { x: -1.74, y: WHEEL_RADIUS, z: wheelZ },
      { x: -1.74, y: WHEEL_RADIUS, z: -wheelZ },
    ],
    {
      radius: WHEEL_RADIUS,
      width: 0.12,
      rimStyle: 'silver-5spoke',
    },
  );

  root.add(bodyGroup);
  root.add(trailerGroup);

  // 落地归零与交互标记；踩坑点：必须在 groundToZero 后记录悬浮组初始 Y，避免 update() 覆盖归零偏移
  groundToZero(root);
  tagCarInteractive(root, 'dhl-truck');

  const baseBodyY = bodyGroup.position.y;
  const baseTrailerY = trailerGroup.position.y;

  // ======================== 4. 动画状态机（前车与挂车相位差联动） ========================
  const pulseTimer = createCarPulseTimer(1.25);

  function triggerAnimation(intensity = 1): void {
    triggerCarPulse(pulseTimer, intensity);
  }

  function update(dt: number): void {
    const { active, progress, envelope } = stepCarPulse(pulseTimer, dt);
    if (!active) {
      bodyGroup.position.y = baseBodyY;
      bodyGroup.rotation.set(0, 0, 0);
      trailerGroup.position.y = baseTrailerY;
      trailerGroup.rotation.set(0, 0, 0);
      applyLightPulse(frontLights, 1);
      applyLightPulse(rearLights, 1);
      applyLightPulse(accentLights, 1);
      return;
    }

    // 前车（bodyGroup）：柴油启动颠簸 + 左右微倾摇摆（+X 朝前时绕 X 轴为侧倾、绕 Z 轴为俯仰）
    const frontBounce = Math.abs(Math.sin(progress * Math.PI * 3.2)) * envelope * 0.08;
    bodyGroup.position.y = baseBodyY + frontBounce;
    bodyGroup.rotation.x = Math.sin(progress * Math.PI * 4.4) * envelope * 0.042;
    bodyGroup.rotation.z = Math.sin(progress * Math.PI * 3.2) * envelope * 0.022;

    // 后挂车（trailerGroup）：延迟约 85ms 产生相位差跟随晃动，从 0 平滑起振无跳变
    const trailerProgress = Math.max(0, (progress - 0.07) / 0.93);
    const trailerEnv =
      trailerProgress > 0
        ? Math.exp(-3.2 * trailerProgress) *
          (1 - trailerProgress) *
          pulseTimer.intensity
        : 0;
    const trailerBounce =
      Math.abs(Math.sin(trailerProgress * Math.PI * 3.2)) * trailerEnv * 0.075;
    trailerGroup.position.y = baseTrailerY + trailerBounce;
    trailerGroup.rotation.x =
      -Math.sin(trailerProgress * Math.PI * 4.4) * trailerEnv * 0.048;
    trailerGroup.rotation.z =
      Math.sin(trailerProgress * Math.PI * 3.2) * trailerEnv * 0.018;

    // 前灯、尾灯与示廓警示灯爆闪
    const strobe = Math.max(0, Math.sin(progress * Math.PI * 6.5));
    applyLightPulse(frontLights, 1 + strobe * 1.9 * pulseTimer.intensity);
    applyLightPulse(rearLights, 1 + strobe * 1.8 * pulseTimer.intensity);
    applyLightPulse(
      accentLights,
      1 + (0.5 + strobe * 2.1) * pulseTimer.intensity,
    );

    // 全部 8 只车轮联动旋转
    spinWheels(wheels, dt * 18 * envelope);
  }

  return {
    id: 'dhl-truck',
    spec: DHL_TRUCK_SPEC,
    root,
    bodyGroup,
    wheels,
    lights: {
      frontLights,
      rearLights,
      accentLights,
    },
    trailerGroup,
    triggerAnimation,
    update,
  };
}
