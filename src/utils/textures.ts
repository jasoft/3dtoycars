import * as THREE from 'three';

export interface CanvasTextureOptions {
  /** 是否使用 sRGB 色彩空间（颜色/涂装贴图默认 true，粗糙度/凹凸贴图设为 false） */
  srgb?: boolean;
  repeatX?: number;
  repeatY?: number;
  anisotropy?: number;
  wrapS?: THREE.Wrapping;
  wrapT?: THREE.Wrapping;
}

/**
 * 通用 Canvas 2D 高清纹理生成工厂。
 * 所有车身涂装、站牌、木纹桌面与路板质感均通过此函数创建，保证色彩空间与各向异性过滤一致。
 */
export function createCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  options: CanvasTextureOptions = {},
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建 2D Canvas 上下文');
  }

  draw(ctx, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace =
    options.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.anisotropy = options.anisotropy ?? 8;

  if (options.wrapS !== undefined) {
    texture.wrapS = options.wrapS;
  }
  if (options.wrapT !== undefined) {
    texture.wrapT = options.wrapT;
  }
  if (options.repeatX !== undefined || options.repeatY !== undefined) {
    texture.wrapS = options.wrapS ?? THREE.RepeatWrapping;
    texture.wrapT = options.wrapT ?? THREE.RepeatWrapping;
    texture.repeat.set(options.repeatX ?? 1, options.repeatY ?? 1);
  }

  texture.needsUpdate = true;
  return texture;
}

/** 伪随机确定性噪声，用于生成自然木纹与塑料微颗粒 */
function seededNoise(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * 生成暖调胡桃木桌面贴图与对应的粗糙度贴图，还原实拍图中的温润实木纹理。
 */
export function createWoodTextures(): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const rand = seededNoise(202606);

  const map = createCanvasTexture(
    1024,
    1024,
    (ctx, w, h) => {
      const baseGrad = ctx.createLinearGradient(0, 0, 0, h);
      baseGrad.addColorStop(0, '#8a5228');
      baseGrad.addColorStop(0.35, '#995c2d');
      baseGrad.addColorStop(0.7, '#7f4922');
      baseGrad.addColorStop(1, '#8f5629');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, w, h);

      // 水平方向实木年轮纤维
      for (let i = 0; i < 420; i++) {
        const y = rand() * h;
        const thickness = 1 + rand() * 5;
        const dark = rand() > 0.45;
        ctx.strokeStyle = dark
          ? `rgba(64, 30, 10, ${0.06 + rand() * 0.16})`
          : `rgba(195, 130, 68, ${0.05 + rand() * 0.12})`;
        ctx.lineWidth = thickness;
        ctx.beginPath();
        ctx.moveTo(0, y);
        const waveAmp = 2 + rand() * 8;
        const waveFreq = 0.004 + rand() * 0.008;
        const phase = rand() * Math.PI * 2;
        for (let x = 32; x <= w; x += 32) {
          ctx.lineTo(x, y + Math.sin(x * waveFreq + phase) * waveAmp);
        }
        ctx.stroke();
      }

      // 细微木孔隙与桌板拼接微缝
      for (let i = 0; i < 1800; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const len = 8 + rand() * 28;
        ctx.fillStyle = `rgba(48, 22, 8, ${0.05 + rand() * 0.1})`;
        ctx.fillRect(x, y, len, 1.2);
      }

      // 模拟几条浅淡桌面拼接木板线
      const plankLines = [256, 512, 768];
      for (const py of plankLines) {
        ctx.fillStyle = 'rgba(42, 18, 6, 0.22)';
        ctx.fillRect(0, py, w, 2);
      }
    },
    { repeatX: 2.2, repeatY: 1.6, anisotropy: 16 },
  );

  const roughnessMap = createCanvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(0, 0, w, h);
      const rRand = seededNoise(9911);
      for (let i = 0; i < 320; i++) {
        const y = rRand() * h;
        const val = Math.floor(115 + rRand() * 95);
        ctx.fillStyle = `rgba(${val}, ${val}, ${val}, 0.25)`;
        ctx.fillRect(0, y, w, 1 + rRand() * 4);
      }
    },
    { srgb: false, repeatX: 2.2, repeatY: 1.6, anisotropy: 8 },
  );

  return { map, roughnessMap };
}

/**
 * 生成 Cybertruck 专用水平拉丝冷轧不锈钢贴图。
 */
export function createBrushedMetalTexture(): THREE.CanvasTexture {
  const rand = seededNoise(4042);
  return createCanvasTexture(
    512,
    512,
    (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#cfd4da');
      grad.addColorStop(0.5, '#dee3e8');
      grad.addColorStop(1, '#bcc3cb');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < 900; i++) {
        const y = rand() * h;
        const bright = rand() > 0.5;
        ctx.fillStyle = bright
          ? `rgba(255, 255, 255, ${0.03 + rand() * 0.08})`
          : `rgba(85, 92, 102, ${0.03 + rand() * 0.09})`;
        ctx.fillRect(0, y, w, 0.8 + rand() * 1.4);
      }
    },
    { repeatX: 1, repeatY: 1, anisotropy: 8 },
  );
}

/**
 * 生成灰白色 Tomica 拼接路板的注塑哑光微颗粒表面贴图。
 */
export function createRoadMatTexture(): THREE.CanvasTexture {
  const rand = seededNoise(7731);
  return createCanvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#dde2ea';
      ctx.fillRect(0, 0, w, h);

      // 路板微颗粒质感
      for (let i = 0; i < 5000; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const tone = rand() > 0.5 ? 245 : 196;
        ctx.fillStyle = `rgba(${tone}, ${tone + 2}, ${tone + 5}, 0.18)`;
        ctx.fillRect(x, y, 2, 2);
      }

      // 上下人行道边缘浅色压槽提示线
      ctx.fillStyle = 'rgba(165, 173, 186, 0.55)';
      ctx.fillRect(0, 46, w, 4);
      ctx.fillRect(0, h - 50, w, 4);

      // 中央浅淡虚线车道引导印痕（极浅，保持照片中素净注塑感）
      ctx.fillStyle = 'rgba(182, 190, 204, 0.35)';
      for (let x = 24; x < w; x += 64) {
        ctx.fillRect(x, h / 2 - 2, 34, 4);
      }
    },
    { anisotropy: 8 },
  );
}
