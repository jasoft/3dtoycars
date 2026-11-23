import * as THREE from 'three';
import type { CarId, CarObject, CarSpec } from '../types';
import { CHINA_POST_SPEC, createChinaPostCar } from './chinaPost';
import { CYBERTRUCK_SPEC, createCybertruckCar } from './cybertruck';
import { DHL_TRUCK_SPEC, createDhlTruckCar } from './dhlTruck';
import { DISNEY_BUS_SPEC, createDisneyBusCar } from './disneyBus';
import { JR_BUS_SPEC, createJrBusCar } from './jrBus';

/** 按从左到右陈列顺序排列的五辆车元数据列表 */
export const CAR_SPECS: CarSpec[] = [
  CHINA_POST_SPEC,
  CYBERTRUCK_SPEC,
  JR_BUS_SPEC,
  DHL_TRUCK_SPEC,
  DISNEY_BUS_SPEC,
];

export interface CarFleet {
  cars: CarObject[];
  carMap: Map<CarId, CarObject>;
  specs: CarSpec[];
  group: THREE.Group;
}

/**
 * 统一创建并按真实桌面相对位置摆设全部 5 辆合金玩具小车。
 */
export function createAllCars(scene: THREE.Scene): CarFleet {
  const factories: Array<() => CarObject> = [
    createChinaPostCar,
    createCybertruckCar,
    createJrBusCar,
    createDhlTruckCar,
    createDisneyBusCar,
  ];

  const group = new THREE.Group();
  group.name = 'toy-car-fleet';

  const cars: CarObject[] = [];
  const carMap = new Map<CarId, CarObject>();

  for (const createCar of factories) {
    const car = createCar();
    car.root.position.set(...car.spec.position);
    car.root.rotation.y = car.spec.rotationY;
    group.add(car.root);
    cars.push(car);
    carMap.set(car.id, car);
  }

  scene.add(group);

  return {
    cars,
    carMap,
    specs: cars.map((car) => car.spec),
    group,
  };
}
