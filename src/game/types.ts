export type GamePhase = 'MENU' | 'PLAYING' | 'GAMEOVER';

export type DeliveryType =
  | 'PIZZA'
  | 'EXPRESS'
  | 'FRAGILE'
  | 'ROCKET_PIZZA'
  | 'BOUNCY_BOX'
  | 'GOLDEN_PARCEL'
  | 'CONFETTI_BOMB'
  | 'MAGNET_MAIL'
  | 'MYSTERY_PARCEL';

export type ArcadeEventType =
  | 'PIZZA_PANIC'
  | 'RUSH_HOUR'
  | 'NEIGHBORHOOD_FESTIVAL'
  | 'GOLDEN_MINUTE'
  | 'CONFETTI_STORM'
  | 'TURBO_FEVER';

export interface ArcadeEvent {
  type: ArcadeEventType;
  title: string;
  description: string;
  duration: number; // in seconds
  elapsed: number;
  active: boolean;
  scoreMultiplier: number;
  color: string;
}

export interface ScoreEvent {
  points: number;
  text: string;
  x: number;
  y: number;
  color?: string;
}

export interface CelebrationEvent {
  level: 1 | 2 | 3; // Level 1: Delivery Spark, Level 2: Neighborhood Party, Level 3: City Goes Wild!
  x: number;
  y: number;
  deliveryType: DeliveryType;
  wasMoving: boolean;
  combo: number;
  points: number;
  duration: number; // in seconds (e.g. 1.8s)
  elapsed: number;  // in seconds
  active: boolean;
  buildingName?: string;
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
  activeCelebration: CelebrationEvent | null;
  highScore: number;
  bestCombo: number;

  // Maximum 2.5D Systems: Turbo, Drift Style, and Dynamic Events
  turboMeter: number; // 0 to 100
  isTurboActive: boolean;
  turboTimeLeft: number;
  driftStylePoints: number;
  activeEvent: ArcadeEvent | null;
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
  wasMoving: boolean;

  // Maximum 2.5D Special Packages
  bouncesRemaining?: number;
  isRocket?: boolean;
  trailTimer?: number;
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
  lockedTargetName?: string;
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
  cheerTimer?: number;
  cheerJump?: number;
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
