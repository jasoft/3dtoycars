import type { CarId } from '../types';

interface ToneOptions {
  type: OscillatorType;
  freqStart: number;
  freqEnd?: number;
  freqRamp?: 'linear' | 'exponential';
  startTime: number;
  duration: number;
  peakGain: number;
  attack?: number;
  decayCurve?: 'exponential' | 'linear';
  detune?: number;
  filter?: {
    type: BiquadFilterType;
    freqStart: number;
    freqEnd?: number;
    q?: number;
  };
}

interface NoiseBurstOptions {
  startTime: number;
  duration: number;
  peakGain: number;
  attack?: number;
  filterType: BiquadFilterType;
  freqStart: number;
  freqEnd?: number;
  q?: number;
}

interface ChimeNote {
  freq: number;
  offset: number;
  duration: number;
  gain: number;
  harmonicGain?: number;
}

const MIN_GAIN = 0.0001;
const MIN_FREQ = 20;
const MASTER_VOLUME = 0.78;

/**
 * 纯 Web Audio API 程序化声效引擎。
 * 零外部音频文件依赖，内置总控动态压缩器防爆音，并支持交互自动解锁。
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private sfxInput: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private unlockListenersBound = false;

  private readonly handleFirstInteraction = (): void => {
    this.unlock();
  };

  constructor() {
    this.bindUnlockListeners();
  }

  /**
   * 尝试初始化并恢复 AudioContext，解除浏览器自动播放限制。
   */
  public unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running') {
            this.unbindUnlockListeners();
          }
        })
        .catch(() => {
          // 忽略非用户手势触发时的恢复拒绝，等待下一次真实交互
        });
    } else if (ctx.state === 'running') {
      this.unbindUnlockListeners();
    }
  }

  /**
   * 播放指定车辆的专属多层合成音效。
   */
  public playCarSound(carId: CarId): void {
    this.withReadyContext((ctx, dest) => {
      const now = ctx.currentTime + 0.008;
      switch (carId) {
        case 'china-post':
          this.synthChinaPost(ctx, dest, now);
          break;
        case 'cybertruck':
          this.synthCybertruck(ctx, dest, now);
          break;
        case 'jr-bus':
          this.synthJrBus(ctx, dest, now);
          break;
        case 'dhl-truck':
          this.synthDhlTruck(ctx, dest, now);
          break;
        case 'disney-bus':
          this.synthDisneyBus(ctx, dest, now);
          break;
      }
    });
  }

  /**
   * 播放公交站牌报站提示音（三音柔和上行钟琴）。
   */
  public playBusStopSound(): void {
    this.withReadyContext((ctx, dest) => {
      const now = ctx.currentTime + 0.008;
      this.playChimeSequence(ctx, dest, now, [
        { freq: 783.99, offset: 0.0, duration: 0.34, gain: 0.17, harmonicGain: 0.045 },
        { freq: 987.77, offset: 0.13, duration: 0.36, gain: 0.18, harmonicGain: 0.05 },
        { freq: 1174.66, offset: 0.26, duration: 0.52, gain: 0.2, harmonicGain: 0.055 },
      ]);
    });
  }

  /**
   * 播放轻量 UI 开关滴答音效。
   */
  public playUiTick(): void {
    this.withReadyContext((ctx, dest) => {
      const now = ctx.currentTime + 0.003;
      this.playTone(ctx, dest, {
        type: 'sine',
        freqStart: 1380,
        freqEnd: 820,
        freqRamp: 'exponential',
        startTime: now,
        duration: 0.028,
        peakGain: 0.065,
        attack: 0.002,
      });
      this.playNoiseBurst(ctx, dest, {
        startTime: now,
        duration: 0.012,
        peakGain: 0.028,
        attack: 0.001,
        filterType: 'bandpass',
        freqStart: 2800,
        q: 2.2,
      });
    });
  }

  /**
   * 设置全局静音状态。
   */
  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.masterGain) {
      const target = muted ? 0 : MASTER_VOLUME;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.015);
    }
    if (!muted) {
      this.unlock();
    }
  }

  /**
   * 返回当前是否处于静音状态。
   */
  public isMuted(): boolean {
    return this.muted;
  }

  /**
   * 释放音频上下文与全局监听（如页面卸载时）。
   */
  public dispose(): void {
    this.unbindUnlockListeners();
    this.sfxInput?.disconnect();
    this.compressor?.disconnect();
    this.masterGain?.disconnect();
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.sfxInput = null;
    this.compressor = null;
    this.masterGain = null;
    this.noiseBuffer = null;
  }

  /** 中国邮政微电小车：双响电动邮车小喇叭（880Hz + 1108Hz）+ 轻快三音新能源确认和弦 */
  private synthChinaPost(ctx: AudioContext, dest: AudioNode, t0: number): void {
    const hornStarts = [0, 0.145];
    for (const offset of hornStarts) {
      const t = t0 + offset;
      // 880Hz 主音（三角波）+ 1108Hz 大三度和声（正弦波），模拟可爱电动邮车喇叭
      this.playTone(ctx, dest, {
        type: 'triangle',
        freqStart: 865,
        freqEnd: 880,
        startTime: t,
        duration: 0.105,
        peakGain: 0.18,
        attack: 0.008,
        decayCurve: 'linear',
        filter: { type: 'lowpass', freqStart: 3600 },
      });
      this.playTone(ctx, dest, {
        type: 'sine',
        freqStart: 1092,
        freqEnd: 1108,
        startTime: t,
        duration: 0.105,
        peakGain: 0.16,
        attack: 0.008,
        decayCurve: 'linear',
      });
    }

    // 三音轻快新能源启动确认和弦（E5 -> A5 -> C#6）
    this.playChimeSequence(ctx, dest, t0 + 0.32, [
      { freq: 659.25, offset: 0.0, duration: 0.24, gain: 0.13, harmonicGain: 0.035 },
      { freq: 880.0, offset: 0.085, duration: 0.26, gain: 0.14, harmonicGain: 0.04 },
      { freq: 1108.73, offset: 0.17, duration: 0.42, gain: 0.16, harmonicGain: 0.045 },
    ]);
  }

  /** 特斯拉 Cybertruck：深沉低频脉冲（110->48Hz）+ 双振荡器失谐升频啸叫（240->960Hz）+ 空灵金属回响和弦 */
  private synthCybertruck(ctx: AudioContext, dest: AudioNode, t0: number): void {
    // 1. 深沉低频重低音脉冲（110Hz -> 48Hz）
    this.playTone(ctx, dest, {
      type: 'sine',
      freqStart: 110,
      freqEnd: 48,
      freqRamp: 'exponential',
      startTime: t0,
      duration: 0.56,
      peakGain: 0.34,
      attack: 0.012,
    });
    this.playTone(ctx, dest, {
      type: 'triangle',
      freqStart: 110,
      freqEnd: 48,
      freqRamp: 'exponential',
      startTime: t0,
      duration: 0.42,
      peakGain: 0.15,
      attack: 0.01,
      filter: { type: 'lowpass', freqStart: 220 },
    });

    // 2. 双振荡器失谐升频电机啸叫（240Hz -> 960Hz 带 bandpass 滤波扫频）
    for (const detune of [-11, 11]) {
      this.playTone(ctx, dest, {
        type: 'sawtooth',
        freqStart: 240,
        freqEnd: 960,
        freqRamp: 'exponential',
        startTime: t0 + 0.04,
        duration: 0.68,
        peakGain: 0.12,
        attack: 0.05,
        detune,
        filter: {
          type: 'bandpass',
          freqStart: 420,
          freqEnd: 2200,
          q: 3.4,
        },
      });
    }

    // 3. 空灵金属回响和弦（D4 / A4 / E5 / A5 + 微弱泛音闪耀）
    const chordFreqs = [293.66, 440.0, 659.25, 880.0];
    chordFreqs.forEach((freq, idx) => {
      this.playTone(ctx, dest, {
        type: 'sine',
        freqStart: freq,
        startTime: t0 + 0.26 + idx * 0.035,
        duration: 0.92,
        peakGain: 0.095,
        attack: 0.04,
        detune: idx % 2 === 0 ? -4 : 4,
      });
    });
    this.playTone(ctx, dest, {
      type: 'triangle',
      freqStart: 1318.51,
      startTime: t0 + 0.36,
      duration: 0.78,
      peakGain: 0.045,
      attack: 0.05,
      filter: { type: 'highpass', freqStart: 900 },
    });
  }

  /** JR 东北高速巴士：气动刹车泄气声（Pssshh!）+ 日系站内双音门铃（E5 -> C5）+ 浑厚巴士气笛 */
  private synthJrBus(ctx: AudioContext, dest: AudioNode, t0: number): void {
    // 1. 带通滤波白噪声模拟气动刹车泄气声（Pssshh!）
    this.playNoiseBurst(ctx, dest, {
      startTime: t0,
      duration: 0.33,
      peakGain: 0.24,
      attack: 0.012,
      filterType: 'bandpass',
      freqStart: 3100,
      freqEnd: 1350,
      q: 1.5,
    });
    this.playNoiseBurst(ctx, dest, {
      startTime: t0,
      duration: 0.075,
      peakGain: 0.14,
      attack: 0.004,
      filterType: 'highpass',
      freqStart: 4200,
      q: 0.9,
    });

    // 2. 日系站内双音门铃（叮-咚 E5 -> C5）
    this.playChimeSequence(ctx, dest, t0 + 0.33, [
      { freq: 659.25, offset: 0.0, duration: 0.28, gain: 0.2, harmonicGain: 0.045 },
      { freq: 523.25, offset: 0.21, duration: 0.42, gain: 0.21, harmonicGain: 0.045 },
    ]);

    // 3. 浑厚低沉的巴士气笛（F3 + A3 双簧管式柔化气笛）
    const hornTime = t0 + 0.84;
    const hornNotes: Array<[number, number, OscillatorType]> = [
      [174.61, 0.16, 'sawtooth'],
      [220.0, 0.14, 'sawtooth'],
      [87.31, 0.12, 'triangle'],
    ];
    for (const [freq, gain, type] of hornNotes) {
      this.playTone(ctx, dest, {
        type,
        freqStart: freq * 1.02,
        freqEnd: freq,
        startTime: hornTime,
        duration: 0.5,
        peakGain: gain,
        attack: 0.032,
        filter: {
          type: 'lowpass',
          freqStart: 920,
          freqEnd: 620,
          q: 1.1,
        },
      });
    }
  }

  /** DHL 快递双厢挂车：重卡柴油怠速脉冲 + 霸气双音气喇叭（220Hz + 277Hz）+ 快递扫码枪「滴！」 */
  private synthDhlTruck(ctx: AudioContext, dest: AudioNode, t0: number): void {
    // 1. 柴油机怠速突突脉冲（5 记连续低通滤波锯齿波气缸脉动 + 低沉机身震动噪声）
    const pulseCount = 5;
    for (let i = 0; i < pulseCount; i++) {
      const pulseTime = t0 + i * 0.072;
      this.playTone(ctx, dest, {
        type: 'sawtooth',
        freqStart: 58,
        freqEnd: 46,
        startTime: pulseTime,
        duration: 0.068,
        peakGain: 0.2,
        attack: 0.008,
        filter: {
          type: 'lowpass',
          freqStart: 280,
          freqEnd: 130,
          q: 2.0,
        },
      });
    }
    this.playNoiseBurst(ctx, dest, {
      startTime: t0,
      duration: 0.36,
      peakGain: 0.11,
      attack: 0.02,
      filterType: 'lowpass',
      freqStart: 190,
      q: 1.2,
    });

    // 2. 雄浑双响重卡气喇叭 HONK-HONK!（220Hz + 277Hz）
    const honkSegments: Array<[number, number]> = [
      [0.34, 0.18],
      [0.58, 0.31],
    ];
    for (const [offset, dur] of honkSegments) {
      const hTime = t0 + offset;
      for (const freq of [220, 277.18]) {
        this.playTone(ctx, dest, {
          type: 'sawtooth',
          freqStart: freq * 1.015,
          freqEnd: freq,
          startTime: hTime,
          duration: dur,
          peakGain: 0.17,
          attack: 0.018,
          decayCurve: 'linear',
          filter: {
            type: 'lowpass',
            freqStart: 1350,
            freqEnd: 980,
            q: 1.1,
          },
        });
      }
      // 浑厚八度基频支撑
      this.playTone(ctx, dest, {
        type: 'triangle',
        freqStart: 110,
        startTime: hTime,
        duration: dur,
        peakGain: 0.14,
        attack: 0.016,
      });
    }

    // 3. 末端快递扫码枪「滴！」高频电子音
    this.playTone(ctx, dest, {
      type: 'sine',
      freqStart: 2480,
      startTime: t0 + 0.96,
      duration: 0.085,
      peakGain: 0.14,
      attack: 0.003,
      decayCurve: 'linear',
    });
  }

  /** 迪士尼米奇双层巴士：复古车厢铜铃连敲（叮-叮！）+ 卡通马林巴上行琶音（C5-E5-G5-C6）+ 可爱老爷车喇叭 */
  private synthDisneyBus(ctx: AudioContext, dest: AudioNode, t0: number): void {
    // 1. 复古伦敦双层巴士铜铃清脆连敲（叮-叮！）
    const bellPartials: Array<[number, number]> = [
      [1567.98, 0.12],
      [2349.32, 0.07],
      [3180.0, 0.04],
      [4220.0, 0.025],
    ];
    for (const bellOffset of [0, 0.135]) {
      for (const [freq, gain] of bellPartials) {
        this.playTone(ctx, dest, {
          type: 'sine',
          freqStart: freq,
          startTime: t0 + bellOffset,
          duration: 0.24,
          peakGain: gain,
          attack: 0.002,
        });
      }
    }

    // 2. 俏皮欢快的卡通木琴/马林巴大调上行琶音（C5-E5-G5-C6）
    const marimbaNotes = [523.25, 659.25, 783.99, 1046.5];
    marimbaNotes.forEach((freq, idx) => {
      const noteTime = t0 + 0.27 + idx * 0.085;
      this.playTone(ctx, dest, {
        type: 'sine',
        freqStart: freq,
        startTime: noteTime,
        duration: 0.22,
        peakGain: 0.18,
        attack: 0.004,
      });
      // 短促木琴敲击泛音瞬态
      this.playTone(ctx, dest, {
        type: 'triangle',
        freqStart: freq * 4,
        startTime: noteTime,
        duration: 0.028,
        peakGain: 0.055,
        attack: 0.001,
      });
    });

    // 3. 可爱「叭噗」复古老爷车气囊喇叭
    const bulbTime = t0 + 0.68;
    this.playTone(ctx, dest, {
      type: 'sawtooth',
      freqStart: 350,
      freqEnd: 445,
      startTime: bulbTime,
      duration: 0.13,
      peakGain: 0.16,
      attack: 0.012,
      filter: {
        type: 'bandpass',
        freqStart: 920,
        freqEnd: 1120,
        q: 2.3,
      },
    });
    this.playTone(ctx, dest, {
      type: 'sawtooth',
      freqStart: 430,
      freqEnd: 325,
      startTime: bulbTime + 0.13,
      duration: 0.16,
      peakGain: 0.16,
      attack: 0.01,
      filter: {
        type: 'bandpass',
        freqStart: 1050,
        freqEnd: 780,
        q: 2.4,
      },
    });
  }

  /** 通用钟琴多音序列合成辅助函数 */
  private playChimeSequence(
    ctx: AudioContext,
    dest: AudioNode,
    baseTime: number,
    notes: ChimeNote[],
  ): void {
    for (const note of notes) {
      const t = baseTime + note.offset;
      this.playTone(ctx, dest, {
        type: 'sine',
        freqStart: note.freq,
        startTime: t,
        duration: note.duration,
        peakGain: note.gain,
        attack: 0.006,
      });
      if (note.harmonicGain) {
        this.playTone(ctx, dest, {
          type: 'sine',
          freqStart: note.freq * 2,
          startTime: t,
          duration: note.duration * 0.65,
          peakGain: note.harmonicGain,
          attack: 0.004,
        });
      }
    }
  }

  /** 通用单声部振荡器合成器（支持扫频、滤波器及防爆音包络，并在结束后自动回收节点） */
  private playTone(ctx: AudioContext, dest: AudioNode, opts: ToneOptions): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type;

    const startFreq = Math.max(MIN_FREQ, opts.freqStart);
    osc.frequency.setValueAtTime(startFreq, opts.startTime);

    if (opts.detune !== undefined) {
      osc.detune.setValueAtTime(opts.detune, opts.startTime);
    }

    if (opts.freqEnd !== undefined) {
      const endFreq = Math.max(MIN_FREQ, opts.freqEnd);
      const rampEnd = opts.startTime + opts.duration * 0.92;
      if (opts.freqRamp === 'exponential') {
        osc.frequency.exponentialRampToValueAtTime(endFreq, rampEnd);
      } else {
        osc.frequency.linearRampToValueAtTime(endFreq, rampEnd);
      }
    }

    let filterNode: BiquadFilterNode | null = null;
    if (opts.filter) {
      filterNode = ctx.createBiquadFilter();
      filterNode.type = opts.filter.type;
      filterNode.Q.setValueAtTime(opts.filter.q ?? 1.0, opts.startTime);
      filterNode.frequency.setValueAtTime(Math.max(MIN_FREQ, opts.filter.freqStart), opts.startTime);
      if (opts.filter.freqEnd !== undefined) {
        filterNode.frequency.exponentialRampToValueAtTime(
          Math.max(MIN_FREQ, opts.filter.freqEnd),
          opts.startTime + opts.duration,
        );
      }
    }

    const attack = Math.min(opts.attack ?? 0.01, opts.duration * 0.4);
    const peakTime = opts.startTime + attack;
    const stopTime = opts.startTime + opts.duration;

    gain.gain.setValueAtTime(MIN_GAIN, opts.startTime);
    gain.gain.linearRampToValueAtTime(Math.max(MIN_GAIN, opts.peakGain), peakTime);

    if (opts.decayCurve === 'linear') {
      const sustainEnd = Math.max(peakTime, stopTime - Math.min(0.025, opts.duration * 0.25));
      if (sustainEnd > peakTime) {
        gain.gain.linearRampToValueAtTime(Math.max(MIN_GAIN, opts.peakGain), sustainEnd);
      }
      gain.gain.linearRampToValueAtTime(MIN_GAIN, stopTime);
    } else {
      gain.gain.exponentialRampToValueAtTime(MIN_GAIN, stopTime);
    }

    if (filterNode) {
      osc.connect(filterNode);
      filterNode.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(dest);

    osc.onended = () => {
      osc.disconnect();
      filterNode?.disconnect();
      gain.disconnect();
    };

    osc.start(opts.startTime);
    osc.stop(stopTime + 0.015);
  }

  /** 通用滤波白噪声爆发合成器（用于气动刹车、机械气噪与瞬态滴答） */
  private playNoiseBurst(ctx: AudioContext, dest: AudioNode, opts: NoiseBurstOptions): void {
    const buffer = this.getNoiseBuffer(ctx);
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType;
    filter.Q.setValueAtTime(opts.q ?? 1.0, opts.startTime);
    filter.frequency.setValueAtTime(Math.max(MIN_FREQ, opts.freqStart), opts.startTime);
    if (opts.freqEnd !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(MIN_FREQ, opts.freqEnd),
        opts.startTime + opts.duration,
      );
    }

    const gain = ctx.createGain();
    const attack = Math.min(opts.attack ?? 0.008, opts.duration * 0.35);
    const stopTime = opts.startTime + opts.duration;

    gain.gain.setValueAtTime(MIN_GAIN, opts.startTime);
    gain.gain.linearRampToValueAtTime(Math.max(MIN_GAIN, opts.peakGain), opts.startTime + attack);
    gain.gain.exponentialRampToValueAtTime(MIN_GAIN, stopTime);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };

    source.start(opts.startTime);
    source.stop(stopTime + 0.015);
  }

  private withReadyContext(fn: (ctx: AudioContext, dest: AudioNode) => void): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxInput) return;
    const dest = this.sfxInput;

    if (ctx.state === 'running') {
      fn(ctx, dest);
      return;
    }

    void ctx
      .resume()
      .then(() => {
        if (!this.muted && ctx.state === 'running') {
          this.unbindUnlockListeners();
          fn(ctx, dest);
        }
      })
      .catch(() => {
        // 忽略未获手势解锁前的恢复错误
      });
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;

    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    const ctx = new AudioCtx();

    // 链路：sfxInput -> DynamicsCompressorNode -> masterGain -> destination
    const sfxInput = ctx.createGain();
    sfxInput.gain.setValueAtTime(0.9, ctx.currentTime);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-14, ctx.currentTime);
    compressor.knee.setValueAtTime(12, ctx.currentTime);
    compressor.ratio.setValueAtTime(6, ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    compressor.release.setValueAtTime(0.18, ctx.currentTime);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.muted ? 0 : MASTER_VOLUME, ctx.currentTime);

    sfxInput.connect(compressor);
    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    this.ctx = ctx;
    this.sfxInput = sfxInput;
    this.compressor = compressor;
    this.masterGain = masterGain;

    return ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = Math.floor(ctx.sampleRate * 1.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      channel[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private bindUnlockListeners(): void {
    if (this.unlockListenersBound || typeof window === 'undefined') return;
    this.unlockListenersBound = true;
    window.addEventListener('pointerdown', this.handleFirstInteraction, { passive: true });
    window.addEventListener('keydown', this.handleFirstInteraction, { passive: true });
    window.addEventListener('touchstart', this.handleFirstInteraction, { passive: true });
  }

  private unbindUnlockListeners(): void {
    if (!this.unlockListenersBound || typeof window === 'undefined') return;
    this.unlockListenersBound = false;
    window.removeEventListener('pointerdown', this.handleFirstInteraction);
    window.removeEventListener('keydown', this.handleFirstInteraction);
    window.removeEventListener('touchstart', this.handleFirstInteraction);
  }
}

let defaultSoundEngine: SoundEngine | null = null;

/**
 * 获取或创建默认 SoundEngine 单例。
 */
export function createSoundEngine(): SoundEngine {
  defaultSoundEngine ??= new SoundEngine();
  return defaultSoundEngine;
}
