import { GAME_CONFIG } from './config.ts';
import { BuildingTile } from './map.ts';
import { EffectsManager } from './effects.ts';
import { Point, DeliveryType } from './types.ts';

export interface CarCollisionResult {
  crashed: boolean;
  impactSpeed: number;
  driftTime: number;
  driftQuality: number;
}

export class DeliveryVan {
  public x: number;
  public y: number;
  public angle: number = -Math.PI / 2; // Facing Up initially
  public speed: number = 0;
  public lateralVelocity: number = 0;
  public steerAngle: number = 0;
  public isDrifting: boolean = false;
  public isBraking: boolean = false;
  public isTurboActive: boolean = false;

  public width: number = GAME_CONFIG.VAN.WIDTH;
  public height: number = GAME_CONFIG.VAN.HEIGHT;
  public currentDeliveryType: DeliveryType = 'EXPRESS';

  // Visual polish fields
  public bodyRoll: number = 0;
  private cargoWobble: number = 0;
  private exhaustTimer: number = 0;
  private currentDriftDuration: number = 0;

  // Previous tire positions for skid marks
  private lastLeftTire: Point | null = null;
  private lastRightTire: Point | null = null;
  private skidDistanceAccumulator: number = 0;

  constructor(startX: number, startY: number) {
    this.x = startX;
    this.y = startY;
  }

  public reset(startX: number, startY: number): void {
    this.x = startX;
    this.y = startY;
    this.angle = -Math.PI / 2;
    this.speed = 0;
    this.lateralVelocity = 0;
    this.steerAngle = 0;
    this.isDrifting = false;
    this.isBraking = false;
    this.isTurboActive = false;
    this.bodyRoll = 0;
    this.cargoWobble = 0;
    this.exhaustTimer = 0;
    this.currentDriftDuration = 0;
    this.lastLeftTire = null;
    this.lastRightTire = null;
  }

  public update(
    dt: number,
    up: boolean,
    down: boolean,
    left: boolean,
    right: boolean,
    driftKey: boolean,
    buildings: BuildingTile[],
    effects: EffectsManager
  ): CarCollisionResult {
    const cfg = GAME_CONFIG.VAN;

    // Apply Turbo multipliers if active
    const maxForward = this.isTurboActive
      ? cfg.MAX_FORWARD_SPEED * GAME_CONFIG.TURBO.SPEED_MULTIPLIER
      : cfg.MAX_FORWARD_SPEED;
    const accelRate = this.isTurboActive
      ? cfg.ACCELERATION * GAME_CONFIG.TURBO.ACCEL_MULTIPLIER
      : cfg.ACCELERATION;

    // 1. STEERING INPUT (Speed-Aware & High-Speed Damped)
    let steerInput = 0;
    if (left) steerInput -= 1;
    if (right) steerInput += 1;

    const speedFraction = Math.min(1.0, Math.abs(this.speed) / maxForward);
    const maxSteerLimit = 0.65 - speedFraction * 0.22;
    const targetSteer = steerInput * maxSteerLimit;

    // Responsive steering interpolation
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1.0, dt * 26);

    // 2. DRIFT & BRAKE STATES
    this.isDrifting = driftKey && this.speed > 70;
    this.isBraking = down && this.speed > 25;

    let driftQuality = 0;
    if (this.isDrifting) {
      this.currentDriftDuration += dt;
      driftQuality = Math.min(1.0, Math.abs(this.steerAngle) * 1.5) * (Math.abs(this.speed) / cfg.MAX_FORWARD_SPEED);
    } else {
      this.currentDriftDuration = 0;
    }

    // 3. ACCELERATION & BRAKING
    if (up) {
      if (this.speed < 0) {
        this.speed += cfg.BRAKE_FORCE * dt;
      } else {
        this.speed += accelRate * dt;
      }
    } else if (down) {
      if (this.speed > 0) {
        this.speed -= cfg.BRAKE_FORCE * dt;
      } else {
        this.speed -= cfg.REVERSE_ACCEL * dt;
      }
    } else {
      this.speed *= Math.pow(cfg.NATURAL_FRICTION, dt * 60);
      if (Math.abs(this.speed) < 4) this.speed = 0;
    }

    // Strict speed limits
    this.speed = Math.max(-cfg.MAX_REVERSE_SPEED, Math.min(maxForward, this.speed));

    // 4. NORMAL CORNERING vs DRIFTING
    const turningAuthority = Math.max(0.55, Math.min(1.0, Math.abs(this.speed) / 140));
    const direction = this.speed < -5 ? -1 : 1;
    const driftMultiplier = this.isDrifting ? cfg.DRIFT_TURN_MULTIPLIER : 1.0;
    const turnAmount = this.steerAngle * cfg.STEER_SPEED * turningAuthority * direction * driftMultiplier * dt;
    this.angle += turnAmount;

    // 5. LATERAL GRIP & DRIFT RECOVERY
    const forwardX = Math.cos(this.angle);
    const forwardY = Math.sin(this.angle);
    const rightX = -Math.sin(this.angle);
    const rightY = Math.cos(this.angle);

    if (this.isDrifting) {
      this.speed *= Math.pow(cfg.DRIFT_SPEED_RETENTION, dt * 60);
      this.lateralVelocity += turnAmount * 50 * (this.speed * 0.10);
      this.lateralVelocity *= Math.pow(cfg.DRIFT_LATERAL_GRIP, dt * 60);
      this.lateralVelocity = Math.max(-110, Math.min(110, this.lateralVelocity));
    } else {
      this.lateralVelocity *= Math.pow(0.15, dt * 60);
      if (Math.abs(this.lateralVelocity) < 1) this.lateralVelocity = 0;
    }

    // Apply movement
    const moveX = (forwardX * this.speed + rightX * this.lateralVelocity) * dt;
    const moveY = (forwardY * this.speed + rightY * this.lateralVelocity) * dt;

    this.x += moveX;
    this.y += moveY;

    // Visual roll & parcel wobbles
    const targetRoll = (this.steerAngle * (this.isDrifting ? 0.18 : 0.08)) * (Math.abs(this.speed) / maxForward);
    this.bodyRoll += (targetRoll - this.bodyRoll) * Math.min(1.0, dt * 14);
    this.cargoWobble += (Math.sin(Date.now() * 0.015) * (Math.abs(this.speed) / 250) - this.cargoWobble) * dt * 8;

    // Turbo flame exhaust puffs
    if (this.isTurboActive) {
      const cosA = Math.cos(this.angle);
      const sinA = Math.sin(this.angle);
      const rearX = this.x - cosA * (this.height * 0.5);
      const rearY = this.y - sinA * (this.height * 0.5);
      effects.addTurboFlame(rearX - sinA * 8, rearY + cosA * 8, this.angle + Math.PI);
      effects.addTurboFlame(rearX + sinA * 8, rearY - cosA * 8, this.angle + Math.PI);
    } else if (up && this.speed > 50) {
      this.exhaustTimer += dt;
      if (this.exhaustTimer > 0.08) {
        this.exhaustTimer = 0;
        const cosA = Math.cos(this.angle);
        const sinA = Math.sin(this.angle);
        const rearX = this.x - cosA * (this.height * 0.5) - sinA * 10;
        const rearY = this.y - sinA * (this.height * 0.5) + cosA * 10;
        effects.addTireSmoke(rearX, rearY, 'rgba(230, 240, 255, 0.4)');
      }
    }

    // Handle tire skid trails & smoke
    this.handleTireEffects(dt, effects);

    // 6. WALL RECOVERY & COLLISION
    return this.resolveCollisions(buildings, effects, this.currentDriftDuration, driftQuality);
  }

  private handleTireEffects(dt: number, effects: EffectsManager): void {
    const rearOffset = -this.height * 0.38;
    const tireWidthOffset = this.width * 0.44;

    const cosA = Math.cos(this.angle);
    const sinA = Math.sin(this.angle);

    const leftTireX = this.x + cosA * rearOffset - sinA * -tireWidthOffset;
    const leftTireY = this.y + sinA * rearOffset + cosA * -tireWidthOffset;

    const rightTireX = this.x + cosA * rearOffset - sinA * tireWidthOffset;
    const rightTireY = this.y + sinA * rearOffset + cosA * tireWidthOffset;

    const shouldSkid = this.isDrifting || (this.isBraking && Math.abs(this.speed) > 160);

    if (shouldSkid) {
      this.skidDistanceAccumulator += Math.abs(this.speed) * dt;

      if (this.lastLeftTire && this.lastRightTire && this.skidDistanceAccumulator > 10) {
        effects.addSkidMark(this.lastLeftTire.x, this.lastLeftTire.y, leftTireX, leftTireY, 0.55);
        effects.addSkidMark(this.lastRightTire.x, this.lastRightTire.y, rightTireX, rightTireY, 0.55);
        this.skidDistanceAccumulator = 0;
      }

      if (Math.random() < 0.8) {
        effects.addTireSmoke(leftTireX, leftTireY, 'rgba(240, 245, 255, 0.7)');
        effects.addTireSmoke(rightTireX, rightTireY, 'rgba(240, 245, 255, 0.7)');
      }
    }

    this.lastLeftTire = { x: leftTireX, y: leftTireY };
    this.lastRightTire = { x: rightTireX, y: rightTireY };
  }

  private getCorners(): Point[] {
    const halfW = this.width * 0.46;
    const halfH = this.height * 0.46;
    const cosA = Math.cos(this.angle);
    const sinA = Math.sin(this.angle);

    const offsets = [
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH },
    ];

    return offsets.map((o) => ({
      x: this.x + cosA * o.y - sinA * o.x,
      y: this.y + sinA * o.y + cosA * o.x,
    }));
  }

  private resolveCollisions(
    buildings: BuildingTile[],
    effects: EffectsManager,
    driftTime: number,
    driftQuality: number
  ): CarCollisionResult {
    let crashed = false;
    const impactSpeed = Math.abs(this.speed);

    for (const b of buildings) {
      const corners = this.getCorners();
      let hasOverlap = false;
      let pushX = 0;
      let pushY = 0;

      for (const pt of corners) {
        if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) {
          hasOverlap = true;

          const dLeft = pt.x - b.x;
          const dRight = b.x + b.w - pt.x;
          const dTop = pt.y - b.y;
          const dBottom = b.y + b.h - pt.y;
          const minD = Math.min(dLeft, dRight, dTop, dBottom);

          if (minD === dLeft) pushX -= dLeft;
          else if (minD === dRight) pushX += dRight;
          else if (minD === dTop) pushY -= dTop;
          else pushY += dBottom;
        }
      }

      if (hasOverlap) {
        // Push van fully out of obstacle + safe 3px margin to prevent sticky friction
        this.x += pushX * 1.15;
        this.y += pushY * 1.15;

        if (impactSpeed > GAME_CONFIG.VAN.CRASH_MIN_SPEED_TO_BREAK_COMBO) {
          crashed = true;
          effects.addCrashSparks(this.x, this.y);
        }

        // Soft bounce: dampen forward speed cleanly without violent sticking or trapping
        if (this.speed > 0) {
          this.speed = -Math.min(35, impactSpeed * GAME_CONFIG.VAN.CRASH_SPEED_PENALTY);
        } else {
          this.speed = Math.min(35, impactSpeed * GAME_CONFIG.VAN.CRASH_SPEED_PENALTY);
        }
        this.lateralVelocity = 0;
        break;
      }
    }

    return { crashed, impactSpeed, driftTime, driftQuality };
  }

  public render(ctx: CanvasRenderingContext2D): void {
    const C = GAME_CONFIG.COLORS;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2); // Rotate to heading

    // Drop Shadow
    ctx.fillStyle = 'rgba(10, 15, 25, 0.45)';
    ctx.beginPath();
    ctx.roundRect(-this.width / 2 + 5, -this.height / 2 + 9, this.width + 4, this.height + 4, 8);
    ctx.fill();

    // Headlight Beams
    const beamGrad = ctx.createRadialGradient(0, -this.height * 0.45, 8, 0, -this.height * 2.2, 170);
    beamGrad.addColorStop(0, 'rgba(255, 245, 200, 0.45)');
    beamGrad.addColorStop(0.3, 'rgba(255, 240, 180, 0.25)');
    beamGrad.addColorStop(1, 'rgba(255, 240, 180, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(-14, -this.height * 0.45);
    ctx.lineTo(-75, -this.height * 2.2);
    ctx.lineTo(75, -this.height * 2.2);
    ctx.lineTo(14, -this.height * 0.45);
    ctx.closePath();
    ctx.fill();

    // Turbo Underglow Aura
    if (this.isTurboActive) {
      const glow = ctx.createRadialGradient(0, 0, 10, 0, 0, this.height * 0.85);
      glow.addColorStop(0, 'rgba(0, 245, 212, 0.55)');
      glow.addColorStop(0.5, 'rgba(67, 97, 238, 0.35)');
      glow.addColorStop(1, 'rgba(0, 245, 212, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, this.height * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }

    // Wheels
    const wheelW = 7;
    const wheelH = 15;
    const frontY = -this.height * 0.31;
    const rearY = this.height * 0.30;
    const wheelSideX = this.width * 0.49;

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(-wheelSideX - wheelW / 2, rearY - wheelH / 2, wheelW, wheelH, 2);
    ctx.roundRect(wheelSideX - wheelW / 2, rearY - wheelH / 2, wheelW, wheelH, 2);
    ctx.fill();

    ctx.save();
    ctx.translate(-wheelSideX, frontY);
    ctx.rotate(this.steerAngle);
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(-wheelW / 2, -wheelH / 2, wheelW, wheelH, 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(wheelSideX, frontY);
    ctx.rotate(this.steerAngle);
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(-wheelW / 2, -wheelH / 2, wheelW, wheelH, 2);
    ctx.fill();
    ctx.restore();

    // Chassis Body
    ctx.save();
    ctx.rotate(this.bodyRoll);

    ctx.fillStyle = C.VAN_BUMPER;
    ctx.beginPath();
    ctx.roundRect(-this.width / 2 - 1, -this.height / 2 - 1, this.width + 2, this.height + 2, 8);
    ctx.fill();

    ctx.fillStyle = C.VAN_BODY;
    ctx.beginPath();
    ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, 7);
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.roundRect(-this.width / 2 + 4, -this.height / 2 - 2, this.width - 8, 4, 2);
    ctx.fill();

    ctx.fillStyle = '#fffbeb';
    ctx.beginPath();
    ctx.roundRect(-this.width / 2 + 3, -this.height / 2, 7, 4, 1.5);
    ctx.roundRect(this.width / 2 - 10, -this.height / 2, 7, 4, 1.5);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-this.width / 2 + 1, -this.height / 2 + 5, 2, 4);
    ctx.fillRect(this.width / 2 - 3, -this.height / 2 + 5, 2, 4);

    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(-8, -this.height / 2 + 6, 16, 3);

    ctx.fillStyle = C.VAN_GLASS;
    ctx.beginPath();
    ctx.roundRect(-this.width / 2 + 4, -this.height / 2 + 11, this.width - 8, 11, 3);
    ctx.fill();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = C.VAN_GLASS_SPEC;
    ctx.beginPath();
    ctx.moveTo(-this.width / 2 + 8, -this.height / 2 + 12);
    ctx.lineTo(-this.width / 2 + 15, -this.height / 2 + 12);
    ctx.lineTo(-this.width / 2 + 10, -this.height / 2 + 21);
    ctx.lineTo(-this.width / 2 + 6, -this.height / 2 + 21);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0284c7';
    ctx.fillRect(-this.width / 2 + 2, -this.height / 2 + 24, 3, 16);
    ctx.fillRect(this.width / 2 - 5, -this.height / 2 + 24, 3, 16);

    ctx.fillStyle = C.VAN_ROOF;
    ctx.beginPath();
    ctx.roundRect(-this.width / 2 + 3, -this.height / 2 + 23, this.width - 6, this.height - 29, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(-12, -7, 24, 26);

    ctx.save();
    ctx.translate(0, this.cargoWobble);

    const deliveryType = this.currentDeliveryType;
    if (deliveryType === 'ROCKET_PIZZA') {
      // Rocket Pizza with miniature rocket boosters on roof
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(-9, 7);
      ctx.lineTo(9, 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(0, -1, 3, 0, Math.PI * 2);
      ctx.arc(-3, 4, 2.5, 0, Math.PI * 2);
      ctx.arc(3, 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Mini rocket thrusters
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-10, 7, 4, 5);
      ctx.fillRect(6, 7, 4, 5);
      ctx.fillStyle = '#ff0055';
      ctx.fillRect(-9, 12, 2, 3);
      ctx.fillRect(7, 12, 2, 3);
    } else if (deliveryType === 'GOLDEN_PARCEL') {
      // Golden Crown crate
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(-10, -5, 20, 15);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-10, -5, 20, 15);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-3, 0, 6, 5);
    } else if (deliveryType === 'BOUNCY_BOX') {
      // Bouncy orange box
      ctx.fillStyle = '#ffbe0b';
      ctx.fillRect(-10, -5, 20, 15);
      ctx.strokeStyle = '#fb5607';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-10, -5, 20, 15);
      ctx.strokeStyle = '#ffffff';
      ctx.strokeRect(-5, -2, 10, 9);
    } else if (deliveryType === 'CONFETTI_BOMB') {
      // Party Bomb
      ctx.fillStyle = '#f72585';
      ctx.fillRect(-9, -6, 18, 16);
      ctx.fillStyle = '#fee440';
      ctx.fillRect(-9, -1, 18, 5);
    } else if (deliveryType === 'MAGNET_MAIL') {
      // Cyan magnet crate
      ctx.fillStyle = '#0077b6';
      ctx.fillRect(-10, -5, 20, 15);
      ctx.strokeStyle = '#00b4d8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-10, -5, 20, 15);
      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 2, 4, Math.PI, 0);
      ctx.stroke();
    } else if (deliveryType === 'MYSTERY_PARCEL') {
      // Mystery purple box
      ctx.fillStyle = '#5a189a';
      ctx.fillRect(-10, -5, 20, 15);
      ctx.strokeStyle = '#9d4edd';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-10, -5, 20, 15);
      ctx.font = 'bold 11px "Fredoka", sans-serif';
      ctx.fillStyle = '#fee440';
      ctx.textAlign = 'center';
      ctx.fillText('?', 0, 6);
    } else if (deliveryType === 'PIZZA') {
      // Stack of pizza boxes
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-11, -6, 22, 16);
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-11, -6, 22, 16);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, 2, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-9, -4, 18, 12);
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 1;
      ctx.strokeRect(-9, -4, 18, 12);
    } else if (deliveryType === 'FRAGILE') {
      ctx.fillStyle = '#9333ea';
      ctx.fillRect(-10, -5, 20, 15);
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-10, -5, 20, 15);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(-3, 0, 6, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-1, -3, 2, 4);
    } else {
      // Express parcel
      ctx.fillStyle = C.PARCEL_BOX;
      ctx.fillRect(-10, -5, 20, 14);
      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = 1;
      ctx.strokeRect(-10, -5, 20, 14);

      ctx.strokeStyle = C.PARCEL_TAPE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(0, 9);
      ctx.stroke();

      ctx.fillStyle = '#e0a96d';
      ctx.fillRect(-7, 10, 14, 10);
      ctx.strokeStyle = '#b07d62';
      ctx.lineWidth = 1;
      ctx.strokeRect(-7, 10, 14, 10);
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(0, 20);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = '#475569';
    ctx.fillRect(-9, this.height / 2 - 1, 3, 3);
    ctx.fillRect(6, this.height / 2 - 1, 3, 3);

    const brakeColor = this.isBraking ? '#ff0038' : '#b91c1c';
    ctx.fillStyle = brakeColor;
    ctx.beginPath();
    ctx.roundRect(-this.width / 2 + 3, this.height / 2 - 4, 7, 3, 1.5);
    ctx.roundRect(this.width / 2 - 10, this.height / 2 - 4, 7, 3, 1.5);
    ctx.fill();

    if (this.isBraking) {
      const flare = ctx.createRadialGradient(0, this.height / 2, 2, 0, this.height / 2, 24);
      flare.addColorStop(0, 'rgba(255, 0, 50, 0.7)');
      flare.addColorStop(1, 'rgba(255, 0, 50, 0)');
      ctx.fillStyle = flare;
      ctx.beginPath();
      ctx.arc(0, this.height / 2, 24, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    ctx.restore();
  }
}
