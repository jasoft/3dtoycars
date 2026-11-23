import type { CarId, CarSpec, LightingMode } from '../types';

export interface HudCallbacks {
  onSelectCar: (carId: CarId) => void;
  onOverview: () => void;
  onTriggerEffect: (carId: CarId) => void;
  onChangeLighting: (mode: LightingMode) => void;
  onToggleAutoRotate: () => void;
  onToggleShowtime: () => void;
  onToggleMute: () => void;
}

export interface HudController {
  setSelectedCar: (carId: CarId | null) => void;
  setLightingMode: (mode: LightingMode) => void;
  setAutoRotate: (enabled: boolean) => void;
  setShowtime: (enabled: boolean) => void;
  setMuted: (muted: boolean) => void;
  setHoverBadge: (label: string | null, screenX?: number, screenY?: number, accentColor?: string) => void;
  pulseSoundIndicator: (carId: CarId) => void;
  dismissHint: () => void;
  dispose: () => void;
}

interface LightingOption {
  mode: LightingMode;
  label: string;
}

const LIGHTING_OPTIONS: LightingOption[] = [
  { mode: 'desk', label: '桌面暖光' },
  { mode: 'neon', label: '霓虹展厅' },
  { mode: 'studio', label: '极速影棚' },
];

const LIGHTING_LABELS: Record<LightingMode, string> = {
  desk: '桌面暖光',
  neon: '霓虹展厅',
  studio: '极速影棚',
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const HINT_AUTO_DISMISS_MS = 6000;
const SOUND_PULSE_DURATION_MS = 1350;

function createSvgIcon(paths: string[], viewBox = '0 0 24 24'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('hud-icon');

  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * 构建并管理现代玻璃拟态 3D 展厅交互 HUD。
 * 采用贴边悬浮布局，除控件本体外保持 pointer-events: none，不遮挡中心 3D 车辆与画布操作。
 */
export function createHud(
  container: HTMLElement,
  cars: CarSpec[],
  callbacks: HudCallbacks,
): HudController {
  const carMap = new Map<CarId, CarSpec>();
  cars.forEach((car) => carMap.set(car.id, car));

  let selectedCarId: CarId | null = null;
  let currentMode: LightingMode = 'desk';
  let hintDismissed = false;
  let hintTimer: number | null = null;
  let detailPulseTimer: number | null = null;
  const dockPulseTimers = new Map<CarId, number>();

  const hudRoot = createEl('div', 'hud-root');
  hudRoot.dataset.theme = currentMode;
  container.dataset.theme = currentMode;

  // ==================== 1. 顶部控制胶囊栏 ====================
  const topbar = createEl('header', 'hud-topbar');

  // 左侧品牌标题与状态点
  const brandPill = createEl('div', 'hud-glass hud-brand');
  const brandDot = createEl('span', 'hud-brand-dot');
  const brandTitles = createEl('div', 'hud-brand-titles');
  const brandMain = createEl('span', 'hud-brand-main', '桌面玩具车展厅');
  const brandSub = createEl('span', 'hud-brand-sub', 'DIECAST 3D');
  brandTitles.append(brandMain, brandSub);

  const modeChip = createEl('span', 'hud-mode-chip', LIGHTING_LABELS[currentMode]);
  brandPill.append(brandDot, brandTitles, modeChip);

  // 右侧灯光氛围 + 环绕 + 巡演 + 静音控件组
  const controlsGroup = createEl('div', 'hud-glass hud-controls');

  const lightingGroup = createEl('div', 'hud-segmented');
  lightingGroup.setAttribute('role', 'group');
  lightingGroup.setAttribute('aria-label', '展厅灯光氛围');

  const lightingButtons = new Map<LightingMode, HTMLButtonElement>();
  for (const opt of LIGHTING_OPTIONS) {
    const btn = createEl('button', 'hud-seg-btn', opt.label);
    btn.type = 'button';
    btn.dataset.lighting = opt.mode;
    btn.setAttribute('aria-pressed', opt.mode === currentMode ? 'true' : 'false');
    if (opt.mode === currentMode) btn.classList.add('is-active');
    btn.addEventListener('click', () => {
      dismissHint();
      callbacks.onChangeLighting(opt.mode);
    });
    lightingButtons.set(opt.mode, btn);
    lightingGroup.appendChild(btn);
  }

  const dividerTop = createEl('span', 'hud-divider');

  const rotateBtn = createEl('button', 'hud-action-btn');
  rotateBtn.type = 'button';
  rotateBtn.setAttribute('aria-pressed', 'false');
  const rotateIcon = createSvgIcon([
    'M21 12a9 9 0 1 1-3.2-6.9',
    'M21 3v5h-5',
  ]);
  const rotateText = createEl('span', undefined, '360° 环绕');
  rotateBtn.append(rotateIcon, rotateText);
  rotateBtn.addEventListener('click', () => {
    dismissHint();
    callbacks.onToggleAutoRotate();
  });

  const showtimeBtn = createEl('button', 'hud-action-btn hud-showtime-btn');
  showtimeBtn.type = 'button';
  showtimeBtn.setAttribute('aria-pressed', 'false');
  const showtimeIcon = createSvgIcon([
    'M5 3l14 9-14 9V3z',
  ]);
  const showtimeText = createEl('span', undefined, '一键巡演');
  showtimeBtn.append(showtimeIcon, showtimeText);
  showtimeBtn.addEventListener('click', () => {
    dismissHint();
    callbacks.onToggleShowtime();
  });

  const muteBtn = createEl('button', 'hud-action-btn hud-mute-btn');
  muteBtn.type = 'button';
  muteBtn.setAttribute('aria-pressed', 'false');
  const soundOnIcon = createSvgIcon([
    'M11 5L6 9H2v6h4l5 4V5z',
    'M15.54 8.46a5 5 0 0 1 0 7.07',
    'M19.07 4.93a10 10 0 0 1 0 14.14',
  ]);
  const soundOffIcon = createSvgIcon([
    'M11 5L6 9H2v6h4l5 4V5z',
    'M23 9l-6 6',
    'M17 9l6 6',
  ]);
  soundOffIcon.style.display = 'none';
  const muteText = createEl('span', undefined, '音效开');
  muteBtn.append(soundOnIcon, soundOffIcon, muteText);
  muteBtn.addEventListener('click', () => {
    dismissHint();
    callbacks.onToggleMute();
  });

  controlsGroup.append(lightingGroup, dividerTop, rotateBtn, showtimeBtn, muteBtn);
  topbar.append(brandPill, controlsGroup);

  // ==================== 2. 顶部下方轻量操作提示条 ====================
  const hintBanner = createEl('div', 'hud-glass hud-hint');
  const hintPulse = createEl('span', 'hud-hint-dot');
  const hintText = createEl(
    'span',
    'hud-hint-text',
    '点击任意小车听音效并进入特写 · 左键拖拽 360° 旋转 · 滚轮缩放',
  );
  const hintCloseBtn = createEl('button', 'hud-hint-close');
  hintCloseBtn.type = 'button';
  hintCloseBtn.setAttribute('aria-label', '关闭提示');
  hintCloseBtn.appendChild(createSvgIcon(['M18 6L6 18', 'M6 6l12 12']));
  hintCloseBtn.addEventListener('click', () => dismissHint());
  hintBanner.append(hintPulse, hintText, hintCloseBtn);

  // ==================== 3. 右侧特写详情卡片 ====================
  const detailCard = createEl('aside', 'hud-glass hud-detail-card');
  detailCard.setAttribute('aria-hidden', 'true');

  const detailHeader = createEl('div', 'hud-detail-header');
  const detailBadge = createEl('div', 'hud-detail-badge');
  const detailBadgeDot = createEl('span', 'hud-detail-badge-dot');
  const detailIndexText = createEl('span', 'hud-detail-index', '01 / 05');
  const detailModeLabel = createEl('span', undefined, '特写模式');
  detailBadge.append(detailBadgeDot, detailIndexText, detailModeLabel);

  const detailCloseBtn = createEl('button', 'hud-icon-btn');
  detailCloseBtn.type = 'button';
  detailCloseBtn.title = '返回全景 (Esc)';
  detailCloseBtn.setAttribute('aria-label', '返回全景 (Esc)');
  detailCloseBtn.appendChild(createSvgIcon(['M18 6L6 18', 'M6 6l12 12']));
  detailCloseBtn.addEventListener('click', () => {
    dismissHint();
    callbacks.onOverview();
  });
  detailHeader.append(detailBadge, detailCloseBtn);

  const detailTitle = createEl('h2', 'hud-detail-title');
  const detailEn = createEl('div', 'hud-detail-en');
  const detailSub = createEl('div', 'hud-detail-sub');
  const detailDesc = createEl('p', 'hud-detail-desc');
  const detailTags = createEl('div', 'hud-detail-tags');

  // 音效波形指示条
  const soundStrip = createEl('div', 'hud-sound-strip');
  const waveBars = createEl('div', 'hud-wave-bars');
  for (let i = 0; i < 9; i++) {
    const bar = createEl('span', 'hud-wave-bar');
    bar.style.setProperty('--bar-index', String(i));
    waveBars.appendChild(bar);
  }
  const soundMeta = createEl('div', 'hud-sound-meta');
  const soundTitle = createEl('span', 'hud-sound-title', '专属声效');
  const soundLabelEl = createEl('span', 'hud-sound-label');
  soundMeta.append(soundTitle, soundLabelEl);
  soundStrip.append(waveBars, soundMeta);

  // 详情操作按钮区
  const detailActions = createEl('div', 'hud-detail-actions');

  const replayBtn = createEl('button', 'hud-btn-replay');
  replayBtn.type = 'button';
  const replayIcon = createSvgIcon([
    'M11 5L6 9H2v6h4l5 4V5z',
    'M15.54 8.46a5 5 0 0 1 0 7.07',
  ]);
  const replayLabel = createEl('span', undefined, '再来一次音效与特效');
  replayBtn.append(replayIcon, replayLabel);
  replayBtn.addEventListener('click', () => {
    if (!selectedCarId) return;
    dismissHint();
    callbacks.onTriggerEffect(selectedCarId);
  });

  const navRow = createEl('div', 'hud-detail-nav');
  const prevBtn = createEl('button', 'hud-nav-btn');
  prevBtn.type = 'button';
  prevBtn.append(
    createSvgIcon(['M15 18l-6-6 6-6']),
    createEl('span', undefined, '上一辆'),
  );
  prevBtn.addEventListener('click', () => stepCarSelection(-1));

  const nextBtn = createEl('button', 'hud-nav-btn');
  nextBtn.type = 'button';
  nextBtn.append(
    createEl('span', undefined, '下一辆'),
    createSvgIcon(['M9 18l6-6-6-6']),
  );
  nextBtn.addEventListener('click', () => stepCarSelection(1));
  navRow.append(prevBtn, nextBtn);

  const overviewBackBtn = createEl('button', 'hud-btn-overview');
  overviewBackBtn.type = 'button';
  overviewBackBtn.append(
    createSvgIcon(['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z']),
    createEl('span', undefined, '返回全景 (Esc)'),
  );
  overviewBackBtn.addEventListener('click', () => {
    dismissHint();
    callbacks.onOverview();
  });

  detailActions.append(replayBtn, navRow, overviewBackBtn);

  detailCard.append(
    detailHeader,
    detailTitle,
    detailEn,
    detailSub,
    detailDesc,
    detailTags,
    soundStrip,
    detailActions,
  );

  // ==================== 4. 底部 5 车车库 Dock ====================
  const dock = createEl('nav', 'hud-glass hud-dock');
  dock.setAttribute('aria-label', '展厅车辆快速切换栏');

  const overviewBtn = createEl('button', 'hud-dock-item hud-dock-overview is-active');
  overviewBtn.type = 'button';
  overviewBtn.setAttribute('aria-pressed', 'true');
  const overviewIcon = createSvgIcon([
    'M3 3h7v7H3z',
    'M14 3h7v7h-7z',
    'M14 14h7v7h-7z',
    'M3 14h7v7H3z',
  ]);
  const overviewLabel = createEl('span', 'hud-dock-name', '全景视角');
  overviewBtn.append(overviewIcon, overviewLabel);
  overviewBtn.addEventListener('click', () => {
    dismissHint();
    callbacks.onOverview();
  });

  const dockDivider = createEl('span', 'hud-dock-divider');
  dock.append(overviewBtn, dockDivider);

  const dockButtons = new Map<CarId, HTMLButtonElement>();
  cars.forEach((car, index) => {
    const btn = createEl('button', 'hud-dock-item');
    btn.type = 'button';
    btn.dataset.carId = car.id;
    btn.style.setProperty('--car-accent', car.accentColor);
    btn.setAttribute('aria-pressed', 'false');

    const dot = createEl('span', 'hud-dock-dot');
    const nameEl = createEl('span', 'hud-dock-name', car.name);
    const keyHint = createEl('kbd', 'hud-dock-key', String(index + 1));

    btn.append(dot, nameEl, keyHint);
    btn.addEventListener('click', () => {
      dismissHint();
      callbacks.onSelectCar(car.id);
    });

    dockButtons.set(car.id, btn);
    dock.appendChild(btn);
  });

  // ==================== 5. 指针上方悬浮胶囊气泡 ====================
  const hoverBadge = createEl('div', 'hud-glass hud-hover-badge');
  hoverBadge.setAttribute('aria-hidden', 'true');
  const hoverDot = createEl('span', 'hud-hover-dot');
  const hoverTexts = createEl('div', 'hud-hover-texts');
  const hoverName = createEl('span', 'hud-hover-name');
  const hoverTip = createEl('span', 'hud-hover-tip', '点击特写 & 音效');
  hoverTexts.append(hoverName, hoverTip);
  hoverBadge.append(hoverDot, hoverTexts);

  hudRoot.append(topbar, hintBanner, detailCard, dock, hoverBadge);
  container.appendChild(hudRoot);

  // 自动 6 秒后渐隐操作提示
  hintTimer = window.setTimeout(() => {
    dismissHint();
  }, HINT_AUTO_DISMISS_MS);

  function stepCarSelection(delta: number): void {
    if (cars.length === 0) return;
    dismissHint();
    const currentIndex = selectedCarId
      ? cars.findIndex((c) => c.id === selectedCarId)
      : -1;
    const nextIndex =
      currentIndex < 0
        ? 0
        : (currentIndex + delta + cars.length) % cars.length;
    callbacks.onSelectCar(cars[nextIndex].id);
  }

  function renderDetailCard(car: CarSpec): void {
    const idx = cars.findIndex((c) => c.id === car.id);
    const indexStr = String((idx >= 0 ? idx : 0) + 1).padStart(2, '0');
    const totalStr = String(cars.length).padStart(2, '0');

    detailCard.scrollTop = 0;
    detailCard.style.setProperty('--car-accent', car.accentColor);
    detailIndexText.textContent = `${indexStr} / ${totalStr}`;
    detailTitle.textContent = car.name;
    detailEn.textContent = car.englishName;
    detailSub.textContent = car.subtitle;
    detailDesc.textContent = car.description;
    soundLabelEl.textContent = car.soundLabel;

    detailTags.replaceChildren();
    for (const tag of car.highlights) {
      const chip = createEl('span', 'hud-tag', tag);
      detailTags.appendChild(chip);
    }
  }

  function dismissHint(): void {
    if (hintDismissed) return;
    hintDismissed = true;
    if (hintTimer !== null) {
      window.clearTimeout(hintTimer);
      hintTimer = null;
    }
    hintBanner.classList.add('is-dismissed');
    hintBanner.setAttribute('aria-hidden', 'true');
  }

  function triggerPulseClass(el: HTMLElement, prevTimer: number | null, onDone: () => void): number {
    if (prevTimer !== null) {
      window.clearTimeout(prevTimer);
    }
    el.classList.remove('is-pulsing');
    // 强制回流以确保连续点击能立即重播波形跳动动画
    void el.offsetWidth;
    el.classList.add('is-pulsing');
    return window.setTimeout(() => {
      el.classList.remove('is-pulsing');
      onDone();
    }, SOUND_PULSE_DURATION_MS);
  }

  return {
    setSelectedCar(carId: CarId | null): void {
      selectedCarId = carId;

      const isOverview = carId === null;
      overviewBtn.classList.toggle('is-active', isOverview);
      overviewBtn.setAttribute('aria-pressed', String(isOverview));

      dockButtons.forEach((btn, id) => {
        const active = id === carId;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
      });

      if (carId !== null) {
        const car = carMap.get(carId);
        if (car) {
          renderDetailCard(car);
          detailCard.classList.add('is-visible');
          detailCard.setAttribute('aria-hidden', 'false');
          return;
        }
      }

      detailCard.classList.remove('is-visible');
      detailCard.setAttribute('aria-hidden', 'true');
    },

    setLightingMode(mode: LightingMode): void {
      currentMode = mode;
      hudRoot.dataset.theme = mode;
      container.dataset.theme = mode;
      modeChip.textContent = showtimeBtn.classList.contains('is-active')
        ? `${LIGHTING_LABELS[mode]} · 巡演中`
        : LIGHTING_LABELS[mode];

      lightingButtons.forEach((btn, btnMode) => {
        const active = btnMode === mode;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    },

    setAutoRotate(enabled: boolean): void {
      rotateBtn.classList.toggle('is-active', enabled);
      rotateBtn.setAttribute('aria-pressed', String(enabled));
    },

    setShowtime(enabled: boolean): void {
      showtimeBtn.classList.toggle('is-active', enabled);
      showtimeBtn.setAttribute('aria-pressed', String(enabled));
      showtimeText.textContent = enabled ? '停止巡演' : '一键巡演';
      brandDot.classList.toggle('is-showtime', enabled);
      modeChip.textContent = enabled
        ? `${LIGHTING_LABELS[currentMode]} · 巡演中`
        : LIGHTING_LABELS[currentMode];
    },

    setMuted(muted: boolean): void {
      muteBtn.classList.toggle('is-muted', muted);
      muteBtn.setAttribute('aria-pressed', String(muted));
      soundOnIcon.style.display = muted ? 'none' : '';
      soundOffIcon.style.display = muted ? '' : 'none';
      muteText.textContent = muted ? '已静音' : '音效开';
    },

    setHoverBadge(
      label: string | null,
      screenX?: number,
      screenY?: number,
      accentColor?: string,
    ): void {
      if (!label) {
        hoverBadge.classList.remove('is-visible');
        return;
      }

      hoverName.textContent = label;
      if (accentColor) {
        hoverBadge.style.setProperty('--hover-accent', accentColor);
      } else {
        hoverBadge.style.removeProperty('--hover-accent');
      }

      if (typeof screenX === 'number' && typeof screenY === 'number') {
        const padX = 96;
        const padTop = 76;
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
        const clampedX = Math.max(padX, Math.min(vw - padX, screenX));
        const clampedY = Math.max(padTop, Math.min(vh - 24, screenY - 18));
        hoverBadge.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0) translate(-50%, -100%)`;
      }

      hoverBadge.classList.add('is-visible');
    },

    pulseSoundIndicator(carId: CarId): void {
      const dockBtn = dockButtons.get(carId);
      if (dockBtn) {
        const nextTimer = triggerPulseClass(
          dockBtn,
          dockPulseTimers.get(carId) ?? null,
          () => dockPulseTimers.delete(carId),
        );
        dockPulseTimers.set(carId, nextTimer);
      }

      if (selectedCarId === carId) {
        detailPulseTimer = triggerPulseClass(soundStrip, detailPulseTimer, () => {
          detailPulseTimer = null;
        });
      }
    },

    dismissHint,

    dispose(): void {
      if (hintTimer !== null) {
        window.clearTimeout(hintTimer);
        hintTimer = null;
      }
      if (detailPulseTimer !== null) {
        window.clearTimeout(detailPulseTimer);
        detailPulseTimer = null;
      }
      dockPulseTimers.forEach((timerId) => window.clearTimeout(timerId));
      dockPulseTimers.clear();
      hudRoot.remove();
    },
  };
}
