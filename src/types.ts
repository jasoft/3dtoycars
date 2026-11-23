import type * as THREE from 'three';

/** 五辆桌面玩具小车的唯一标识 */
export type CarId =
  | 'china-post'
  | 'cybertruck'
  | 'jr-bus'
  | 'dhl-truck'
  | 'disney-bus';

/** 展厅灯光氛围模式 */
export type LightingMode = 'desk' | 'neon' | 'studio';

/** 每辆车的展示信息、世界坐标与特写运镜参数 */
export interface CarSpec {
  id: CarId;
  /** 中文名称 */
  name: string;
  /** 英文型号/涂装名称 */
  englishName: string;
  /** 简短副标题 */
  subtitle: string;
  /** 车辆与涂装细节介绍 */
  description: string;
  /** 工艺亮点标签 */
  highlights: string[];
  /** 点击音效说明 */
  soundLabel: string;
  /** UI 主题色（CSS 十六进制） */
  accentColor: string;
  /** Three.js 十六进制主题色 */
  accentHex: number;
  /** 车辆在路板上的世界坐标（底面 y = 0.16） */
  position: [number, number, number];
  /** 车辆绕 Y 轴的朝向弧度（局部车头默认为 +X） */
  rotationY: number;
  /** 特写模式相机相对于车辆原点的世界空间偏移 */
  focusOffset: [number, number, number];
  /** 特写模式焦点（OrbitControls.target）相对于车辆原点的世界空间偏移 */
  focusTargetOffset: [number, number, number];
}

/** 车辆可控灯组集合 */
export interface CarLightGroup {
  frontLights: THREE.Mesh[];
  rearLights: THREE.Mesh[];
  accentLights?: THREE.Mesh[];
  pointLights?: THREE.PointLight[];
}

/** 统一车辆对象接口，所有车辆工厂函数均返回此结构 */
export interface CarObject {
  id: CarId;
  spec: CarSpec;
  /** 车辆根容器，摆放在 spec.position 与 spec.rotationY */
  root: THREE.Group;
  /** 车身悬浮/弹跳动画组（不含接地轮胎，防止穿模） */
  bodyGroup: THREE.Group;
  /** 全部可旋转车轮组（绕局部 Z 轴滚动） */
  wheels: THREE.Group[];
  /** 可脉冲闪烁的灯组 */
  lights: CarLightGroup;
  /** 可选拖挂/二段联动部件（如 DHL 后挂车厢） */
  trailerGroup?: THREE.Group;
  /** 触发点击专属动态演出（弹跳、爆闪、车轮转动） */
  triggerAnimation: (intensity?: number) => void;
  /** 每帧动画更新 */
  update: (dt: number, elapsed: number) => void;
}
