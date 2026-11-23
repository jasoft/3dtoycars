import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createSoundEngine } from './audio/soundEngine';
import { createAllCars } from './cars';
import { CameraRig, EffectsManager } from './scene/effects';
import { createEnvironment } from './scene/environment';
import './style.css';
import type { CarId, CarObject, LightingMode } from './types';
import { createHud } from './ui/hud';

const CLICK_MAX_DIST_PX = 6;
const CLICK_MAX_DURATION_MS = 420;
const SHOWTIME_INTERVAL_MS = 4200;

function bootstrap(): void {
  const app = document.getElementById('app');
  if (!app) {
    throw new Error('找不到挂载节点 #app');
  }

  const width = window.innerWidth || 1280;
  const height = window.innerHeight || 720;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // 渲染器配置：ACES 色调映射配合 HalfFloat 后期通道实现通透高亮车灯
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'scene-canvas';
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);

  // 后期管线：HalfFloat 渲染目标保留 MSAA 与 HDR 发光溢出，交由 OutputPass 统一完成色调映射
  const renderTarget = new THREE.WebGLRenderTarget(
    Math.max(1, Math.floor(width * dpr)),
    Math.max(1, Math.floor(height * dpr)),
    {
      type: THREE.HalfFloatType,
      samples: 4,
    },
  );
  const composer = new EffectComposer(renderer, renderTarget);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.26,
    0.45,
    0.9,
  );
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);

  const env = createEnvironment(scene, renderer);
  const effects = new EffectsManager(scene);
  const cameraRig = new CameraRig(camera, renderer.domElement);
  const soundEngine = createSoundEngine();
  const fleet = createAllCars(scene);

  const interactiveRoots: THREE.Object3D[] = [
    ...fleet.cars.map((car) => car.root),
    env.busStopGroup,
  ];

  // 应用初始灯光与 Bloom 参数
  const applyLighting = (mode: LightingMode): void => {
    const preset = env.setLightingMode(mode);
    bloomPass.strength = preset.bloomStrength;
    bloomPass.radius = preset.bloomRadius;
    bloomPass.threshold = preset.bloomThreshold;
    hud.setLightingMode(mode);
  };

  let selectedCarId: CarId | null = null;
  let hoveredTarget: { kind: 'car'; carId: CarId } | { kind: 'bus-stop' } | null =
    null;
  let showtimeEnabled = false;
  let showtimeTimer: number | null = null;
  let showtimeIndex = -1;

  const stopShowtime = (): void => {
    if (!showtimeEnabled && showtimeTimer === null) return;
    showtimeEnabled = false;
    if (showtimeTimer !== null) {
      window.clearInterval(showtimeTimer);
      showtimeTimer = null;
    }
    hud.setShowtime(false);
  };

  const triggerCarBurst = (car: CarObject, intensity = 1): void => {
    const burstPos = car.root.position.clone();
    const scale = car.id === 'dhl-truck' ? 1.45 : car.id === 'china-post' ? 0.92 : 1.15;
    car.triggerAnimation(intensity);
    effects.triggerBurst(burstPos, car.spec.accentHex, scale);
    soundEngine.playCarSound(car.id);
    hud.pulseSoundIndicator(car.id);
  };

  const selectCar = (
    carId: CarId,
    options: { moveCamera?: boolean; userInitiated?: boolean } = {},
  ): void => {
    const car = fleet.carMap.get(carId);
    if (!car) return;

    if (options.userInitiated !== false) {
      stopShowtime();
    }

    soundEngine.unlock();
    selectedCarId = carId;
    hud.dismissHint();
    hud.setSelectedCar(carId);
    effects.setFocusCar(car);
    triggerCarBurst(car, 1.0);

    if (options.moveCamera !== false) {
      cameraRig.focusCar(car);
    }
  };

  const returnToOverview = (): void => {
    stopShowtime();
    soundEngine.playUiTick();
    selectedCarId = null;
    hud.setSelectedCar(null);
    effects.setFocusCar(null);
    cameraRig.focusOverview();
  };

  const triggerBusStop = (): void => {
    stopShowtime();
    soundEngine.unlock();
    hud.dismissHint();
    env.triggerBusStopAnimation();
    soundEngine.playBusStopSound();
    const pos = env.busStopGroup.position.clone();
    effects.triggerBurst(pos, 0x38bdf8, 0.72);
  };

  const advanceShowtime = (): void => {
    showtimeIndex = (showtimeIndex + 1) % fleet.cars.length;
    const nextCar = fleet.cars[showtimeIndex];
    if (nextCar) {
      selectCar(nextCar.id, { moveCamera: true, userInitiated: false });
    }
  };

  const toggleShowtime = (): void => {
    soundEngine.unlock();
    hud.dismissHint();
    if (showtimeEnabled) {
      stopShowtime();
      soundEngine.playUiTick();
      return;
    }

    showtimeEnabled = true;
    hud.setShowtime(true);
    if (!cameraRig.isAutoRotate()) {
      cameraRig.setAutoRotate(true);
      hud.setAutoRotate(true);
    }

    const currentIdx = selectedCarId
      ? fleet.cars.findIndex((c) => c.id === selectedCarId)
      : -1;
    showtimeIndex = currentIdx;
    advanceShowtime();
    showtimeTimer = window.setInterval(advanceShowtime, SHOWTIME_INTERVAL_MS);
  };

  const hud = createHud(app, fleet.specs, {
    onSelectCar: (carId) => selectCar(carId),
    onOverview: () => returnToOverview(),
    onTriggerEffect: (carId) => {
      const car = fleet.carMap.get(carId);
      if (!car) return;
      soundEngine.unlock();
      triggerCarBurst(car, 1.15);
    },
    onChangeLighting: (mode) => {
      soundEngine.unlock();
      soundEngine.playUiTick();
      hud.dismissHint();
      applyLighting(mode);
    },
    onToggleAutoRotate: () => {
      soundEngine.unlock();
      soundEngine.playUiTick();
      hud.dismissHint();
      const next = !cameraRig.isAutoRotate();
      cameraRig.setAutoRotate(next);
      hud.setAutoRotate(next);
    },
    onToggleShowtime: () => toggleShowtime(),
    onToggleMute: () => {
      soundEngine.unlock();
      const nextMuted = !soundEngine.isMuted();
      soundEngine.setMuted(nextMuted);
      hud.setMuted(nextMuted);
      if (!nextMuted) {
        soundEngine.playUiTick();
      }
    },
  });

  // 初始化为桌面暖光模式
  applyLighting('desk');

  // 射线检测：精确区分鼠标拖拽旋转视角与点击选中
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const worldScratch = new THREE.Vector3();
  const boxScratch = new THREE.Box3();

  let downX = 0;
  let downY = 0;
  let downTime = 0;
  let pointerIsDown = false;

  const updatePointerNdc = (clientX: number, clientY: number): void => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  };

  const pickInteractiveTarget = (
    clientX: number,
    clientY: number,
  ): { kind: 'car'; carId: CarId } | { kind: 'bus-stop' } | null => {
    updatePointerNdc(clientX, clientY);
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(interactiveRoots, true);
    for (const hit of hits) {
      let curr: THREE.Object3D | null = hit.object;
      while (curr) {
        if (typeof curr.userData.carId === 'string') {
          return { kind: 'car', carId: curr.userData.carId as CarId };
        }
        if (curr.userData.interactiveId === 'bus-stop') {
          return { kind: 'bus-stop' };
        }
        curr = curr.parent;
      }
    }
    return null;
  };

  const refreshHoverBadge = (): void => {
    if (!hoveredTarget) {
      hud.setHoverBadge(null);
      return;
    }

    let anchorObj: THREE.Object3D;
    let label: string;
    let accentColor: string;

    if (hoveredTarget.kind === 'car') {
      const car = fleet.carMap.get(hoveredTarget.carId);
      if (!car) {
        hud.setHoverBadge(null);
        return;
      }
      anchorObj = car.root;
      label = car.spec.name;
      accentColor = car.spec.accentColor;
    } else {
      anchorObj = env.busStopGroup;
      label = '公交站牌 BUS STOP';
      accentColor = '#38bdf8';
    }

    boxScratch.setFromObject(anchorObj);
    worldScratch.set(
      (boxScratch.min.x + boxScratch.max.x) * 0.5,
      boxScratch.max.y + 0.18,
      (boxScratch.min.z + boxScratch.max.z) * 0.5,
    );
    worldScratch.project(camera);

    if (worldScratch.z > 1) {
      hud.setHoverBadge(null);
      return;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    const screenX = rect.left + (worldScratch.x * 0.5 + 0.5) * rect.width;
    const screenY = rect.top + (-worldScratch.y * 0.5 + 0.5) * rect.height;
    hud.setHoverBadge(label, screenX, screenY, accentColor);
  };

  const onPointerDown = (ev: PointerEvent): void => {
    soundEngine.unlock();
    if (ev.button !== 0) return;
    pointerIsDown = true;
    downX = ev.clientX;
    downY = ev.clientY;
    downTime = performance.now();
  };

  const onPointerMove = (ev: PointerEvent): void => {
    if (pointerIsDown) {
      // 用户开始拖拽旋转画布时，若在巡演模式则停止巡演以便自由观摩
      const moveDist = Math.hypot(ev.clientX - downX, ev.clientY - downY);
      if (moveDist > CLICK_MAX_DIST_PX && showtimeEnabled) {
        stopShowtime();
      }
      if (hoveredTarget) {
        hoveredTarget = null;
        renderer.domElement.style.cursor = 'grabbing';
        hud.setHoverBadge(null);
      }
      return;
    }

    hoveredTarget = pickInteractiveTarget(ev.clientX, ev.clientY);
    renderer.domElement.style.cursor = hoveredTarget ? 'pointer' : 'grab';
    refreshHoverBadge();
  };

  const onPointerUp = (ev: PointerEvent): void => {
    if (!pointerIsDown || ev.button !== 0) return;
    pointerIsDown = false;

    const dist = Math.hypot(ev.clientX - downX, ev.clientY - downY);
    const elapsedMs = performance.now() - downTime;
    if (dist > CLICK_MAX_DIST_PX || elapsedMs > CLICK_MAX_DURATION_MS) {
      renderer.domElement.style.cursor = hoveredTarget ? 'pointer' : 'grab';
      return;
    }

    const hit = pickInteractiveTarget(ev.clientX, ev.clientY);
    if (hit?.kind === 'car') {
      selectCar(hit.carId);
    } else if (hit?.kind === 'bus-stop') {
      triggerBusStop();
    } else if (selectedCarId !== null) {
      returnToOverview();
    }
  };

  const onPointerLeave = (): void => {
    pointerIsDown = false;
    hoveredTarget = null;
    renderer.domElement.style.cursor = 'grab';
    hud.setHoverBadge(null);
  };

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (
      ev.target instanceof HTMLInputElement ||
      ev.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    if (ev.key >= '1' && ev.key <= '5') {
      const idx = Number(ev.key) - 1;
      const targetCar = fleet.cars[idx];
      if (targetCar) selectCar(targetCar.id);
      return;
    }

    switch (ev.key) {
      case 'ArrowLeft': {
        ev.preventDefault();
        const currentIdx = selectedCarId
          ? fleet.cars.findIndex((c) => c.id === selectedCarId)
          : 0;
        const prevIdx =
          (currentIdx - 1 + fleet.cars.length) % fleet.cars.length;
        selectCar(fleet.cars[prevIdx].id);
        break;
      }
      case 'ArrowRight': {
        ev.preventDefault();
        const currentIdx = selectedCarId
          ? fleet.cars.findIndex((c) => c.id === selectedCarId)
          : -1;
        const nextIdx = (currentIdx + 1) % fleet.cars.length;
        selectCar(fleet.cars[nextIdx].id);
        break;
      }
      case ' ': {
        ev.preventDefault();
        if (selectedCarId) {
          const car = fleet.carMap.get(selectedCarId);
          if (car) {
            soundEngine.unlock();
            triggerCarBurst(car, 1.15);
          }
        } else {
          selectCar(fleet.cars[0].id);
        }
        break;
      }
      case 'r':
      case 'R': {
        soundEngine.unlock();
        soundEngine.playUiTick();
        const next = !cameraRig.isAutoRotate();
        cameraRig.setAutoRotate(next);
        hud.setAutoRotate(next);
        break;
      }
      case 'Escape': {
        if (selectedCarId !== null || showtimeEnabled) {
          returnToOverview();
        }
        break;
      }
    }
  };

  const onResize = (): void => {
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 720;
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(nextDpr);
    renderer.setSize(w, h);
    composer.setPixelRatio(nextDpr);
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
  };

  renderer.domElement.style.cursor = 'grab';
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);

  // 主渲染循环
  const clock = new THREE.Clock();
  let animFrameId = 0;

  const animate = (): void => {
    animFrameId = window.requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;

    for (const car of fleet.cars) {
      car.update(dt, elapsed);
    }
    env.update(dt, elapsed);
    effects.update(dt, elapsed);
    cameraRig.update(dt);

    if (hoveredTarget && !pointerIsDown) {
      refreshHoverBadge();
    }

    composer.render();
  };

  animate();

  // 清理挂载以便热更新测试时释放资源
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      window.cancelAnimationFrame(animFrameId);
      stopShowtime();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      hud.dispose();
      cameraRig.dispose();
      effects.dispose();
      env.dispose();
      soundEngine.dispose();
      composer.dispose();
      renderTarget.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    });
  }
}

bootstrap();
