import * as THREE from 'three';
import type { CarId } from '../types';

export interface DiecastMaterialOptions {
  metalness?: number;
  roughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  map?: THREE.Texture;
  bumpMap?: THREE.Texture;
  bumpScale?: number;
}

/**
 * 创建金属合金玩具车漆材质（带高光泽清漆 clearcoat）。
 */
export function createDiecastMaterial(
  color: THREE.ColorRepresentation,
  options: DiecastMaterialOptions = {},
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.38,
    roughness: options.roughness ?? 0.24,
    clearcoat: options.clearcoat ?? 1.0,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.08,
    map: options.map ?? null,
    bumpMap: options.bumpMap ?? null,
    bumpScale: options.bumpScale ?? 0.005,
  });
}

export interface GlassMaterialOptions {
  color?: THREE.ColorRepresentation;
  opacity?: number;
  roughness?: number;
  transparent?: boolean;
  doubleSided?: boolean;
}

/**
 * 创建车窗/全景天窗深色烟熏透明玻璃材质。
 */
export function createGlassMaterial(
  options: GlassMaterialOptions = {},
): THREE.MeshPhysicalMaterial {
  const transparent = options.transparent ?? true;
  return new THREE.MeshPhysicalMaterial({
    color: options.color ?? 0x161b24,
    metalness: 0.1,
    roughness: options.roughness ?? 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    opacity: options.opacity ?? (transparent ? 0.78 : 1.0),
    transparent,
    side: options.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
}

export type WheelRimStyle =
  | 'silver-5spoke'
  | 'offroad-black'
  | 'bus-chrome'
  | 'retro-yellow';

export interface WheelOptions {
  /** 轮胎外半径 */
  radius?: number;
  /** 轮胎宽度（沿 Z 轴） */
  width?: number;
  /** 轮毂风格 */
  rimStyle?: WheelRimStyle;
  /** 外侧朝向（+1 表示在 +Z 侧，-1 表示在 -Z 侧，用于区分轮毂装饰朝向） */
  side?: 1 | -1;
}

/**
 * 构建带橡胶胎面、轮毂圈与轮辐细节的标准玩具车轮。
 * 轮轴位于局部坐标原点且沿 Z 轴方向，滚动时绕局部 Z 轴旋转即可。
 */
export function createWheel(options: WheelOptions = {}): THREE.Group {
  const radius = options.radius ?? 0.17;
  const width = options.width ?? 0.12;
  const rimStyle = options.rimStyle ?? 'silver-5spoke';
  const side = options.side ?? 1;

  const group = new THREE.Group();

  // 黑色橡胶轮胎
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x181b20,
    roughness: 0.78,
    metalness: 0.06,
  });
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 28);
  tireGeo.rotateX(Math.PI / 2);
  const tireMesh = new THREE.Mesh(tireGeo, tireMat);
  tireMesh.castShadow = true;
  tireMesh.receiveShadow = true;
  group.add(tireMesh);

  // 轮毂色配置
  const rimRadius = radius * 0.62;
  let rimColor = 0xd6dce5;
  let rimMetalness = 0.85;
  let rimRoughness = 0.22;

  if (rimStyle === 'offroad-black') {
    rimColor = 0x262a31;
    rimMetalness = 0.45;
    rimRoughness = 0.4;
  } else if (rimStyle === 'bus-chrome') {
    rimColor = 0xe9eef4;
    rimMetalness = 0.92;
    rimRoughness = 0.14;
  } else if (rimStyle === 'retro-yellow') {
    rimColor = 0xf4c41c;
    rimMetalness = 0.25;
    rimRoughness = 0.3;
  }

  const rimMat = new THREE.MeshStandardMaterial({
    color: rimColor,
    metalness: rimMetalness,
    roughness: rimRoughness,
  });
  const rimGeo = new THREE.CylinderGeometry(
    rimRadius,
    rimRadius,
    width + 0.008,
    24,
  );
  rimGeo.rotateX(Math.PI / 2);
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  group.add(rimMesh);

  // 轮辐/轮心装饰（摆放在轮毂外侧，旋转时清晰可见转动感）
  const spokeCount = rimStyle === 'offroad-black' ? 6 : 5;
  const hubMat = new THREE.MeshStandardMaterial({
    color: rimStyle === 'retro-yellow' ? 0x202226 : 0x1e232a,
    metalness: 0.5,
    roughness: 0.35,
  });

  const capGeo = new THREE.CylinderGeometry(
    rimRadius * 0.32,
    rimRadius * 0.32,
    width + 0.016,
    16,
  );
  capGeo.rotateX(Math.PI / 2);
  const capMesh = new THREE.Mesh(capGeo, hubMat);
  group.add(capMesh);

  const outerZ = side * (width * 0.5 + 0.005);
  const spokeMat = new THREE.MeshStandardMaterial({
    color: rimStyle === 'offroad-black' ? 0x5d6573 : 0xffffff,
    metalness: 0.8,
    roughness: 0.2,
  });

  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2;
    const spokeGeo = new THREE.BoxGeometry(
      rimRadius * 0.82,
      rimRadius * 0.16,
      0.012,
    );
    const spoke = new THREE.Mesh(spokeGeo, spokeMat);
    spoke.position.set(
      Math.cos(angle) * rimRadius * 0.46,
      Math.sin(angle) * rimRadius * 0.46,
      outerZ,
    );
    spoke.rotation.z = angle;
    group.add(spoke);
  }

  return group;
}

/**
 * 创建发光车灯网格（配合 UnrealBloomPass 实现通透灯带与爆闪效果）。
 */
export function createEmissiveLight(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  emissiveIntensity = 1.4,
): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity,
    roughness: 0.18,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.userData.baseEmissiveIntensity = emissiveIntensity;
  return mesh;
}

/**
 * 将车辆根容器内所有子物体的最低点精准对齐到局部 y = 0（保证轮胎贴地不悬空不穿模）。
 */
export function groundToZero(root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (!Number.isFinite(box.min.y)) return;
  const offsetY = -box.min.y;
  for (const child of root.children) {
    child.position.y += offsetY;
  }
  root.updateMatrixWorld(true);
}

/**
 * 为整辆车的所有子物体打上交互标记 carId 并开启阴影投射/接收。
 */
export function tagCarInteractive(root: THREE.Group, carId: CarId): void {
  root.userData.carId = carId;
  root.traverse((obj) => {
    obj.userData.carId = carId;
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      if (!mesh.userData.noShadow) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    }
  });
}

/**
 * 统一按脉冲倍率驱动车辆灯组的自发光强度（避免各车重复写灯光遍历逻辑）。
 */
export function applyLightPulse(
  meshes: THREE.Mesh[],
  pulseMultiplier: number,
  extraIntensity = 0,
): void {
  for (const mesh of meshes) {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat || typeof mat.emissiveIntensity !== 'number') continue;
    const base =
      typeof mesh.userData.baseEmissiveIntensity === 'number'
        ? mesh.userData.baseEmissiveIntensity
        : 1.2;
    mat.emissiveIntensity = base * pulseMultiplier + extraIntensity;
  }
}

/**
 * 统一旋转车辆所有车轮（车头朝向局部 +X，沿 +X 向前行驶时绕 Z 轴负向转动）。
 */
export function spinWheels(wheels: THREE.Group[], radians: number): void {
  for (const wheel of wheels) {
    wheel.rotation.z -= radians;
  }
}

export interface WheelMountSpec {
  x: number;
  y: number;
  z: number;
  options?: Omit<WheelOptions, 'side'>;
}

/**
 * 批量创建并挂载车轮到目标容器，自动根据 z 坐标符号设置轮毂外侧朝向（避免重复循环代码）。
 */
export function mountWheels(
  parent: THREE.Group,
  wheelsOut: THREE.Group[],
  mounts: WheelMountSpec[],
  defaultOptions: Omit<WheelOptions, 'side'> = {},
): THREE.Group[] {
  const created: THREE.Group[] = [];
  for (const m of mounts) {
    const wheel = createWheel({
      ...defaultOptions,
      ...m.options,
      side: m.z >= 0 ? 1 : -1,
    });
    wheel.position.set(m.x, m.y, m.z);
    parent.add(wheel);
    wheelsOut.push(wheel);
    created.push(wheel);
  }
  return created;
}

/** 点击动画触发与衰减状态器，避免每辆车重复手写计时与衰减分支 */
export interface CarPulseTimer {
  active: boolean;
  elapsed: number;
  duration: number;
  intensity: number;
}

export function createCarPulseTimer(duration = 1.15): CarPulseTimer {
  return { active: false, elapsed: 0, duration, intensity: 1 };
}

export function triggerCarPulse(
  timer: CarPulseTimer,
  intensity = 1,
): void {
  timer.active = true;
  timer.elapsed = 0;
  timer.intensity = Math.max(0.4, intensity);
}

/**
 * 推进脉冲计时器并返回归一化进度 progress ∈ [0, 1] 与指数衰减包络 envelope。
 * 未激活时返回 { active: false, progress: 0, envelope: 0 }。
 */
export function stepCarPulse(
  timer: CarPulseTimer,
  dt: number,
): { active: boolean; progress: number; envelope: number } {
  if (!timer.active) {
    return { active: false, progress: 0, envelope: 0 };
  }
  timer.elapsed += dt;
  const progress = Math.min(1, timer.elapsed / timer.duration);
  const envelope = Math.exp(-3.4 * progress) * (1 - progress) * timer.intensity;
  if (progress >= 1) {
    timer.active = false;
  }
  return { active: true, progress, envelope };
}

