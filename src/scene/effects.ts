import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CarId, CarObject } from '../types';
import { createCanvasTexture } from '../utils/textures';

interface BurstEffect {
  age: number;
  maxAge: number;
  update: (dt: number) => boolean;
  dispose: () => void;
}

/** 根据车型尺码调节选中底部呼吸光环的包络尺寸 */
const CAR_HALO_SCALE: Record<CarId, number> = {
  'china-post': 0.86,
  cybertruck: 1.18,
  'jr-bus': 1.24,
  'dhl-truck': 1.62,
  'disney-bus': 1.22,
};

/** 粒子星芒柔和发光精灵贴图 */
function createSparkSpriteTexture(): THREE.CanvasTexture {
  return createCanvasTexture(128, 128, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    const radial = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.48);
    radial.addColorStop(0, 'rgba(255, 255, 255, 1)');
    radial.addColorStop(0.24, 'rgba(255, 255, 255, 0.85)');
    radial.addColorStop(0.55, 'rgba(255, 255, 255, 0.22)');
    radial.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, w, h);

    // 十字星芒高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.42, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy, 3.5, h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** 同心冲击波 / 车底呼吸光环贴图 */
function createRingGlowTexture(): THREE.CanvasTexture {
  return createCanvasTexture(256, 256, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    const grad = ctx.createRadialGradient(cx, cy, w * 0.18, cx, cy, w * 0.49);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.12)');
    grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.84, 'rgba(255, 255, 255, 0.5)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
}

/** 竖向全息光柱渐隐贴图（底部亮、顶部与底边边缘柔化） */
function createPillarGradientTexture(): THREE.CanvasTexture {
  return createCanvasTexture(128, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.16)');
    grad.addColorStop(0.76, 'rgba(255, 255, 255, 0.78)');
    grad.addColorStop(0.92, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
}

/**
 * 3D 交互特效管理器：
 * 负责点击车辆/站牌时的三重爆裂特效（双层地面冲击波、3D 星芒粒子喷发、全息收束光柱）
 * 以及特写选中态的顶部追光灯与车底呼吸光环。
 */
export class EffectsManager {
  private readonly scene: THREE.Scene;
  private readonly sparkTex: THREE.CanvasTexture;
  private readonly ringTex: THREE.CanvasTexture;
  private readonly pillarTex: THREE.CanvasTexture;
  private readonly bursts: BurstEffect[] = [];

  // 选中态追随聚光灯与车底呼吸高亮环
  private readonly focusSpotLight: THREE.SpotLight;
  private readonly focusHaloMesh: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly focusTargetPos = new THREE.Vector3(0, 0.35, 0);
  private readonly focusLightPos = new THREE.Vector3(0.4, 5.4, 0.8);
  private readonly focusColor = new THREE.Color(0xffffff);
  private focusIntensityTarget = 0;
  private focusHaloScaleTarget = 1;
  private focusHaloWeight = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sparkTex = createSparkSpriteTexture();
    this.ringTex = createRingGlowTexture();
    this.pillarTex = createPillarGradientTexture();

    // 顶部柔和聚焦聚光灯
    this.focusSpotLight = new THREE.SpotLight(
      0xffffff,
      0,
      14,
      Math.PI / 7.2,
      0.72,
      1.3,
    );
    this.focusSpotLight.position.copy(this.focusLightPos);
    this.focusSpotLight.target.position.copy(this.focusTargetPos);
    this.scene.add(this.focusSpotLight);
    this.scene.add(this.focusSpotLight.target);

    // 车底呼吸态高亮光环
    const haloGeo = new THREE.PlaneGeometry(3.1, 3.1);
    haloGeo.rotateX(-Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: this.ringTex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.focusHaloMesh = new THREE.Mesh(haloGeo, haloMat);
    this.focusHaloMesh.position.set(0, 0.168, 0);
    this.focusHaloMesh.visible = false;
    this.scene.add(this.focusHaloMesh);
  }

  /**
   * 在指定世界坐标触发三重酷炫点击特效：
   * 1) 双层地面扩散冲击波光环；
   * 2) 76 颗主题色 + 金白高光 3D 星芒粒子喷发；
   * 3) 瞬间向上收束的全息光柱脉冲。
   */
  triggerBurst(
    worldPos: THREE.Vector3,
    colorHex: number,
    scale = 1,
  ): void {
    const accent = new THREE.Color(colorHex);
    const brightHighlight = accent.clone().lerp(new THREE.Color(0xffffff), 0.55);
    const baseY = worldPos.y;

    // 1. 双层地面冲击波光环
    const ringGeo = new THREE.PlaneGeometry(1, 1);
    ringGeo.rotateX(-Math.PI / 2);

    const outerRingMat = new THREE.MeshBasicMaterial({
      color: accent,
      map: this.ringTex,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const outerRing = new THREE.Mesh(ringGeo, outerRingMat);
    outerRing.position.set(worldPos.x, baseY + 0.014, worldPos.z);

    const innerRingMat = new THREE.MeshBasicMaterial({
      color: brightHighlight,
      map: this.ringTex,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const innerRing = new THREE.Mesh(ringGeo, innerRingMat);
    innerRing.position.set(worldPos.x, baseY + 0.02, worldPos.z);

    this.scene.add(outerRing, innerRing);

    // 2. 76 颗 3D 璀璨光粒星芒喷发
    const particleCount = 76;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const goldColor = new THREE.Color(0xfff3b0);

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radialStart = (0.12 + Math.random() * 0.45) * scale;
      positions[i * 3] = worldPos.x + Math.cos(angle) * radialStart;
      positions[i * 3 + 1] = baseY + 0.14 + Math.random() * 0.35 * scale;
      positions[i * 3 + 2] = worldPos.z + Math.sin(angle) * radialStart;

      const radialSpeed = (1.5 + Math.random() * 2.8) * scale;
      velocities[i * 3] = Math.cos(angle) * radialSpeed;
      velocities[i * 3 + 1] = (2.1 + Math.random() * 2.8) * scale;
      velocities[i * 3 + 2] = Math.sin(angle) * radialSpeed;

      const pColor =
        Math.random() < 0.36
          ? goldColor.clone().lerp(new THREE.Color(0xffffff), Math.random() * 0.6)
          : accent.clone().offsetHSL(
              (Math.random() - 0.5) * 0.04,
              0,
              Math.random() * 0.18,
            );
      colors[i * 3] = pColor.r;
      colors[i * 3 + 1] = pColor.g;
      colors[i * 3 + 2] = pColor.b;
    }

    const pointsGeo = new THREE.BufferGeometry();
    pointsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pointsGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const pointsMat = new THREE.PointsMaterial({
      size: 0.32 * scale,
      map: this.sparkTex,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(pointsGeo, pointsMat);
    this.scene.add(points);

    // 3. 向上收束全息光柱脉冲（外层主光柱 + 内层高光束芯）
    const pillarHeight = 3.0 * scale;
    const outerPillarGeo = new THREE.CylinderGeometry(
      0.42 * scale,
      0.92 * scale,
      pillarHeight,
      32,
      1,
      true,
    );
    outerPillarGeo.translate(0, pillarHeight / 2, 0);
    const outerPillarMat = new THREE.MeshBasicMaterial({
      color: accent,
      map: this.pillarTex,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const outerPillar = new THREE.Mesh(outerPillarGeo, outerPillarMat);
    outerPillar.position.set(worldPos.x, baseY, worldPos.z);

    const innerPillarGeo = new THREE.CylinderGeometry(
      0.14 * scale,
      0.34 * scale,
      pillarHeight * 1.08,
      24,
      1,
      true,
    );
    innerPillarGeo.translate(0, (pillarHeight * 1.08) / 2, 0);
    const innerPillarMat = new THREE.MeshBasicMaterial({
      color: brightHighlight,
      map: this.pillarTex,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const innerPillar = new THREE.Mesh(innerPillarGeo, innerPillarMat);
    innerPillar.position.set(worldPos.x, baseY, worldPos.z);

    this.scene.add(outerPillar, innerPillar);

    const maxAge = 1.0;
    const burst: BurstEffect = {
      age: 0,
      maxAge,
      update: (dt: number) => {
        burst.age += dt;
        const p = Math.min(1, burst.age / maxAge);

        // 双层冲击波动画
        const outerP = Math.min(1, burst.age / 0.82);
        const outerEase = 1 - Math.pow(1 - outerP, 3);
        const outerScale = (0.7 + outerEase * 3.8) * scale;
        outerRing.scale.set(outerScale, 1, outerScale);
        outerRingMat.opacity = Math.max(0, (1 - outerP) * (1 - outerP) * 0.92);

        const innerP = Math.min(1, burst.age / 0.62);
        const innerEase = 1 - Math.pow(1 - innerP, 2.5);
        const innerScale = (0.45 + innerEase * 2.9) * scale;
        innerRing.scale.set(innerScale, 1, innerScale);
        innerRingMat.opacity = Math.max(0, (1 - innerP) * (1 - innerP) * 0.95);

        // 3D 星芒粒子运动（空气阻力 + 重力回落 + 渐隐）
        const posAttr = pointsGeo.getAttribute('position') as THREE.BufferAttribute;
        const drag = Math.exp(-2.1 * dt);
        for (let i = 0; i < particleCount; i++) {
          const ix = i * 3;
          velocities[ix] *= drag;
          velocities[ix + 1] = velocities[ix + 1] * drag - 5.8 * dt;
          velocities[ix + 2] *= drag;

          positions[ix] += velocities[ix] * dt;
          positions[ix + 1] = Math.max(
            baseY + 0.03,
            positions[ix + 1] + velocities[ix + 1] * dt,
          );
          positions[ix + 2] += velocities[ix + 2] * dt;
        }
        posAttr.needsUpdate = true;
        pointsMat.opacity = Math.pow(1 - p, 1.35);
        pointsMat.size = (0.34 - 0.14 * p) * scale;

        // 全息光柱：半径迅速向中心收束 + 垂直拉伸 + 高亮闪现
        const pillarP = Math.min(1, burst.age / 0.68);
        const converge = 1 - Math.pow(pillarP, 0.65) * 0.72;
        const stretchY = 0.65 + pillarP * 0.85;
        const pillarFade =
          pillarP < 0.16
            ? pillarP / 0.16
            : Math.pow(1 - (pillarP - 0.16) / 0.84, 1.6);

        outerPillar.scale.set(converge, stretchY, converge);
        outerPillar.rotation.y += dt * 1.4;
        outerPillarMat.opacity = Math.max(0, pillarFade * 0.72);

        innerPillar.scale.set(converge * 0.9, stretchY * 1.06, converge * 0.9);
        innerPillarMat.opacity = Math.max(0, pillarFade * 0.86);

        return burst.age < maxAge;
      },
      dispose: () => {
        this.scene.remove(outerRing, innerRing, points, outerPillar, innerPillar);
        ringGeo.dispose();
        outerRingMat.dispose();
        innerRingMat.dispose();
        pointsGeo.dispose();
        pointsMat.dispose();
        outerPillarGeo.dispose();
        outerPillarMat.dispose();
        innerPillarGeo.dispose();
        innerPillarMat.dispose();
      },
    };

    this.bursts.push(burst);
  }

  /**
   * 设定当前特写聚焦车辆，激活顶部聚光灯追踪与车底呼吸光环。
   */
  setFocusCar(car: CarObject | null): void {
    if (!car) {
      this.focusIntensityTarget = 0;
      this.focusHaloWeight = 0;
      return;
    }

    const pos = car.root.position;
    this.focusTargetPos.set(pos.x, pos.y + 0.35, pos.z);
    this.focusLightPos.set(pos.x + 0.35, 5.4, pos.z + 0.75);
    this.focusColor
      .setHex(0xffffff)
      .lerp(new THREE.Color(car.spec.accentHex), 0.22);
    this.focusIntensityTarget = 4.5;
    this.focusHaloScaleTarget = CAR_HALO_SCALE[car.id] ?? 1.15;
    this.focusHaloWeight = 1;
    this.focusHaloMesh.material.color.setHex(car.spec.accentHex);
  }

  /** 每帧驱动全部爆发特效与聚焦灯光动画 */
  update(dt: number, elapsed: number): void {
    const clampedDt = Math.min(dt, 0.05);

    // 更新并清理已结束的爆裂粒子与光环
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const alive = this.bursts[i].update(clampedDt);
      if (!alive) {
        this.bursts[i].dispose();
        this.bursts.splice(i, 1);
      }
    }

    // 聚光灯与车底呼吸光环平滑追踪
    const lerpAlpha = 1 - Math.exp(-8 * clampedDt);
    this.focusSpotLight.position.lerp(this.focusLightPos, lerpAlpha);
    this.focusSpotLight.target.position.lerp(this.focusTargetPos, lerpAlpha);
    this.focusSpotLight.target.updateMatrixWorld();
    this.focusSpotLight.color.lerp(this.focusColor, lerpAlpha);
    this.focusSpotLight.intensity = THREE.MathUtils.lerp(
      this.focusSpotLight.intensity,
      this.focusIntensityTarget,
      lerpAlpha,
    );

    const haloMat = this.focusHaloMesh.material;
    const currentOpacity = haloMat.opacity;
    const targetBaseOpacity =
      this.focusHaloWeight * (0.28 + 0.11 * Math.sin(elapsed * 3.2));
    const nextOpacity = THREE.MathUtils.lerp(
      currentOpacity,
      targetBaseOpacity,
      lerpAlpha,
    );
    haloMat.opacity = nextOpacity;
    this.focusHaloMesh.visible = nextOpacity > 0.008;

    if (this.focusHaloMesh.visible) {
      this.focusHaloMesh.position.x = THREE.MathUtils.lerp(
        this.focusHaloMesh.position.x,
        this.focusTargetPos.x,
        lerpAlpha,
      );
      this.focusHaloMesh.position.z = THREE.MathUtils.lerp(
        this.focusHaloMesh.position.z,
        this.focusTargetPos.z,
        lerpAlpha,
      );
      const breathe = 1 + 0.035 * Math.sin(elapsed * 3.2);
      const s = THREE.MathUtils.lerp(
        this.focusHaloMesh.scale.x,
        this.focusHaloScaleTarget * breathe,
        lerpAlpha,
      );
      this.focusHaloMesh.scale.set(s, 1, s);
    }
  }

  dispose(): void {
    for (const burst of this.bursts) {
      burst.dispose();
    }
    this.bursts.length = 0;

    this.scene.remove(
      this.focusSpotLight,
      this.focusSpotLight.target,
      this.focusHaloMesh,
    );
    this.focusHaloMesh.geometry.dispose();
    this.focusHaloMesh.material.dispose();
    this.sparkTex.dispose();
    this.ringTex.dispose();
    this.pillarTex.dispose();
  }
}

const OVERVIEW_POS = new THREE.Vector3(0, 5.1, 11.2);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0.55, 0.05);

/**
 * 丝滑特写与全景运镜控制器：
 * - 集成带阻尼的 OrbitControls，防止穿入胡桃木桌面；
 * - 支持一键飞入特写、回到全景与 360° 自动环绕；
 * - 动画期间一旦检测到用户拖拽或滚轮（'start' 事件），立即无缝交还控制权，绝不抢鼠标。
 */
export class CameraRig {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;

  private readonly startPos = new THREE.Vector3();
  private readonly startTarget = new THREE.Vector3();
  private readonly goalPos = new THREE.Vector3();
  private readonly goalTarget = new THREE.Vector3();

  private transitioning = false;
  private transitionElapsed = 0;
  private transitionDuration = 0.9;
  private autoRotateEnabled = false;
  private viewMode: 'overview' | 'car' = 'overview';

  private readonly onControlsStart = (): void => {
    // 用户开始手动拖拽或缩放时，立刻中止脚本运镜过渡，防止与用户抢鼠标
    if (this.transitioning) {
      this.transitioning = false;
      this.controls.autoRotate = this.autoRotateEnabled;
    }
  };

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, domElement);

    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.minPolarAngle = 0.14;
    this.controls.maxPolarAngle = Math.PI * 0.475;
    this.controls.minDistance = 1.65;
    this.controls.maxDistance = 18.0;
    this.controls.rotateSpeed = 0.85;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.75;

    this.camera.position.copy(OVERVIEW_POS);
    this.controls.target.copy(OVERVIEW_TARGET);
    this.controls.update();

    this.controls.addEventListener('start', this.onControlsStart);
  }

  /** 丝滑飞回桌面全景陈列视角 */
  focusOverview(): void {
    this.viewMode = 'overview';
    this.beginTransition(OVERVIEW_POS, OVERVIEW_TARGET, 0.95);
  }

  /** 根据车辆位置与专属偏移参数丝滑飞入特写视角 */
  focusCar(car: CarObject): void {
    this.viewMode = 'car';
    const pos = car.root.position;
    const nextPos = new THREE.Vector3(
      pos.x + car.spec.focusOffset[0],
      Math.max(0.35, pos.y + car.spec.focusOffset[1]),
      pos.z + car.spec.focusOffset[2],
    );
    const nextTarget = new THREE.Vector3(
      pos.x + car.spec.focusTargetOffset[0],
      pos.y + car.spec.focusTargetOffset[1],
      pos.z + car.spec.focusTargetOffset[2],
    );
    this.beginTransition(nextPos, nextTarget, 0.85);
  }

  /** 开关 360° 自动环绕旋转（特写模式下围绕车辆旋转，全景模式下优雅巡航） */
  setAutoRotate(enabled: boolean): void {
    this.autoRotateEnabled = enabled;
    if (!this.transitioning) {
      this.controls.autoRotate = enabled;
    }
  }

  isAutoRotate(): boolean {
    return this.autoRotateEnabled;
  }

  isTransitioning(): boolean {
    return this.transitioning;
  }

  update(dt: number): void {
    const clampedDt = Math.min(dt, 0.05);

    if (this.transitioning) {
      this.transitionElapsed += clampedDt;
      const p = Math.min(1, this.transitionElapsed / this.transitionDuration);
      // 五次缓入缓出曲线：起步柔顺、落点无急停感
      const ease = p * p * p * (p * (p * 6 - 15) + 10);

      this.camera.position.lerpVectors(this.startPos, this.goalPos, ease);
      this.controls.target.lerpVectors(this.startTarget, this.goalTarget, ease);

      // 动画帧内关闭阻尼与自动旋转以同步 OrbitControls 内部球坐标，避免交接瞬间跳变
      this.controls.autoRotate = false;
      this.controls.enableDamping = false;
      this.controls.update();
      this.controls.enableDamping = true;

      if (p >= 1) {
        this.transitioning = false;
        this.controls.autoRotate = this.autoRotateEnabled;
      }
      return;
    }

    this.controls.autoRotate = this.autoRotateEnabled;
    this.controls.autoRotateSpeed = this.viewMode === 'car' ? 1.55 : 0.52;
    this.controls.update(clampedDt);

    // 限制右键平移后焦点不沉入桌面之下
    if (this.controls.target.y < 0.05) {
      this.controls.target.y = 0.05;
    }
  }

  dispose(): void {
    this.controls.removeEventListener('start', this.onControlsStart);
    this.controls.dispose();
  }

  private beginTransition(
    targetCamPos: THREE.Vector3,
    targetFocus: THREE.Vector3,
    duration: number,
  ): void {
    // 先清零残留惯性速度，保证每次飞行起点干脆丝滑
    this.controls.enableDamping = false;
    this.controls.autoRotate = false;
    this.controls.update();
    this.controls.enableDamping = true;

    this.startPos.copy(this.camera.position);
    this.startTarget.copy(this.controls.target);
    this.goalPos.copy(targetCamPos);
    this.goalTarget.copy(targetFocus);

    this.transitionDuration = duration;
    this.transitionElapsed = 0;
    this.transitioning = true;
  }
}
