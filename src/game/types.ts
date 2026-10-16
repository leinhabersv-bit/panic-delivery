export type GamePhase = 'MENU' | 'PLAYING' | 'GAMEOVER';

export type DeliveryType = 'PIZZA' | 'EXPRESS' | 'FRAGILE';

export interface ScoreEvent {
  points: number;
  text: string;
  x: number;
  y: number;
  color?: string;
}

export interface GameState {
  phase: GamePhase;
  score: number;
  timeLeft: number;
  combo: number;
  maxCombo: number;
  deliveries: number;
  misses: number;
  crashes: number;
  packagesRemaining: number;
  maxPackages: number;
  isReloading: boolean;
  reloadProgress: number; // 0 to 1
  comboTimeLeft: number;
  currentDeliveryType: DeliveryType;
  isFinalRush: boolean;
  lastScoreEvent: ScoreEvent | null;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DeliveryTarget {
  id: string;
  name: string;
  type: DeliveryType;
  district: 'RESIDENTIAL' | 'DOWNTOWN' | 'PARK';
  x: number;
  y: number;
  radius: number;
  active: boolean;
  color: string;
  icon: string;
  customerHappyTimer: number; // Celebration jump when delivered
}

export interface ThrownPackage {
  id: number;
  type: DeliveryType;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  progress: number; // 0 to 1
  flightDuration: number;
  elapsedTime: number;
  peakHeight: number;
  rotation: number;
  rotationSpeed: number;
  resolved: boolean;
}

export interface SkidSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alpha: number;
  width: number;
}

export interface AimingIndicator {
  isCharging: boolean;
  chargeRatio: number; // 0 to 1
  originX: number;
  originY: number;
  landingX: number;
  landingY: number;
  predictedDistance: number;
  deliveryType: DeliveryType;
  targetLock: boolean;
}

export interface Pedestrian {
  id: number;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speed: number;
  shirtColor: string;
  pantsColor: string;
  walkCycle: number;
  walkTimer: number;
  sidewalkSegmentId: number;
}

export interface TrafficVehicle {
  id: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  maxSpeed: number;
  color: string;
  type: 'compact' | 'sedan' | 'scooter';
  laneIndex: number;
  length: number;
  width: number;
  nearMissAwarded: boolean;
}

export interface EnvironmentalProp {
  type: 'fountain' | 'bench' | 'mailbox' | 'fence';
  x: number;
  y: number;
  angle?: number;
  w?: number;
  h?: number;
}

export interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  type: 'leaf' | 'bird';
  timer: number;
}
