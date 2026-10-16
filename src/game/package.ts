import { GAME_CONFIG } from './config.ts';
import type { ThrownPackage, DeliveryTarget, DeliveryType, AimingIndicator } from './types.ts';
import { EffectsManager } from './effects.ts';
import { SoundFx } from './audio.ts';

export interface PackageResolution {
  type: 'HIT' | 'MISS';
  deliveryType: DeliveryType;
  target?: DeliveryTarget;
  distance: number;
  isLongShot: boolean;
  wasMoving: boolean;
  points: number;
  x: number;
  y: number;
  missReason?: 'SHORT' | 'LONG' | 'WIDE';
}

export class PackageManager {
  public packagesRemaining: number = GAME_CONFIG.PACKAGES.MAX_CAPACITY;
  public maxPackages: number = GAME_CONFIG.PACKAGES.MAX_CAPACITY;
  public isReloading: boolean = false;
  public reloadTimer: number = 0;
  public replenishTimer: number = 0;
  public throwCooldownTimer: number = 0;

  // Hold-to-Charge State (Phase 3)
  public isCharging: boolean = false;
  public chargeTime: number = 0;
  public currentDeliveryType: DeliveryType = 'EXPRESS';

  public activePackages: ThrownPackage[] = [];
  private nextPackageId: number = 1;

  public reset(): void {
    this.packagesRemaining = this.maxPackages;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.replenishTimer = 0;
    this.throwCooldownTimer = 0;
    this.isCharging = false;
    this.chargeTime = 0;
    this.currentDeliveryType = 'EXPRESS';
    this.activePackages = [];
  }

  public canThrow(): boolean {
    return this.packagesRemaining > 0 && this.throwCooldownTimer <= 0 && !this.isReloading;
  }

  public startCharging(deliveryType: DeliveryType): void {
    if (!this.canThrow()) return;
    this.isCharging = true;
    this.chargeTime = 0;
    this.currentDeliveryType = deliveryType;
  }

  public cancelCharging(): void {
    this.isCharging = false;
    this.chargeTime = 0;
  }

  public updateCharge(dt: number): boolean {
    if (this.isCharging) {
      this.chargeTime += dt;
      // Auto-release if held beyond maximum hold limit to prevent exploit
      if (this.chargeTime >= GAME_CONFIG.PACKAGES.MAX_CHARGE_HOLD_SECONDS) {
        return true;
      }
    }
    return false;
  }

  public getChargeRatio(): number {
    return Math.min(1.0, this.chargeTime / GAME_CONFIG.PACKAGES.CHARGE_DURATION_SECONDS);
  }

  public calculateTrajectory(
    carX: number,
    carY: number,
    carAngle: number,
    carSpeed: number
  ): { targetX: number; targetY: number; throwDist: number; flightDuration: number } {
    const chargeRatio = this.getChargeRatio();
    const minSpd = GAME_CONFIG.PACKAGES.MIN_THROW_SPEED;
    const maxSpd = GAME_CONFIG.PACKAGES.MAX_THROW_SPEED;
    const baseSpeed = minSpd + (maxSpd - minSpd) * chargeRatio;

    // Modest forward van velocity inheritance
    const forwardBoost = Math.max(0, carSpeed * 0.35);
    const flightSpeed = baseSpeed + forwardBoost;
    const flightDuration = GAME_CONFIG.PACKAGES.FLIGHT_TIME;
    const throwDist = flightSpeed * flightDuration;

    const forwardX = Math.cos(carAngle);
    const forwardY = Math.sin(carAngle);

    return {
      targetX: carX + forwardX * throwDist,
      targetY: carY + forwardY * throwDist,
      throwDist,
      flightDuration,
    };
  }

  public releaseAndThrow(
    carX: number,
    carY: number,
    carAngle: number,
    carSpeed: number,
    sound: SoundFx
  ): boolean {
    if (!this.isCharging || !this.canThrow()) {
      this.isCharging = false;
      this.chargeTime = 0;
      return false;
    }

    const { targetX, targetY, flightDuration } = this.calculateTrajectory(carX, carY, carAngle, carSpeed);
    const wasMoving = Math.abs(carSpeed) >= GAME_CONFIG.PACKAGES.MOVING_DELIVERY_MIN_SPEED;

    this.isCharging = false;
    this.chargeTime = 0;
    this.packagesRemaining--;
    this.throwCooldownTimer = GAME_CONFIG.PACKAGES.THROW_COOLDOWN_SECONDS;
    sound.playThrow();

    this.activePackages.push({
      id: this.nextPackageId++,
      type: this.currentDeliveryType,
      startX: carX,
      startY: carY,
      currentX: carX,
      currentY: carY,
      targetX,
      targetY,
      progress: 0,
      flightDuration,
      elapsedTime: 0,
      peakHeight: 52 + this.getChargeRatio() * 15,
      rotation: Math.random() * Math.PI,
      rotationSpeed: (Math.random() - 0.5) * 12,
      resolved: false,
      wasMoving,
    });

    if (this.packagesRemaining === 0 && !this.isReloading) {
      this.isReloading = true;
      this.reloadTimer = 0;
    }

    return true;
  }

  public getAimingIndicator(
    carX: number,
    carY: number,
    carAngle: number,
    carSpeed: number,
    targets: DeliveryTarget[]
  ): AimingIndicator | null {
    if (!this.isCharging) return null;

    const { targetX, targetY, throwDist } = this.calculateTrajectory(carX, carY, carAngle, carSpeed);

    // Exact lock-on check matching collision acceptance criteria
    const hitTolerance = GAME_CONFIG.PACKAGES.HIT_RADIUS_TOLERANCE;
    let lockedTarget: DeliveryTarget | null = null;
    for (const t of targets) {
      if (!t.active) continue;
      if (Math.hypot(targetX - t.x, targetY - t.y) <= t.radius + hitTolerance) {
        lockedTarget = t;
        break;
      }
    }

    return {
      isCharging: true,
      chargeRatio: this.getChargeRatio(),
      originX: carX,
      originY: carY,
      landingX: targetX,
      landingY: targetY,
      predictedDistance: Math.round(throwDist),
      deliveryType: this.currentDeliveryType,
      targetLock: lockedTarget !== null,
      lockedTargetName: lockedTarget ? lockedTarget.name : undefined,
    };
  }

  public update(
    dt: number,
    targets: DeliveryTarget[],
    effects: EffectsManager,
    sound: SoundFx,
    onResolution: (res: PackageResolution) => void
  ): void {
    if (this.throwCooldownTimer > 0) {
      this.throwCooldownTimer -= dt;
    }

    // Reload cycle
    if (this.isReloading) {
      this.reloadTimer += dt;
      if (this.reloadTimer >= GAME_CONFIG.PACKAGES.RELOAD_TIME_SECONDS) {
        this.packagesRemaining = this.maxPackages;
        this.isReloading = false;
        this.reloadTimer = 0;
        this.replenishTimer = 0;
        sound.playReloadComplete();
      }
    } else if (this.packagesRemaining < this.maxPackages) {
      this.replenishTimer += dt;
      if (this.replenishTimer >= GAME_CONFIG.PACKAGES.AUTO_REPLENISH_SECONDS) {
        this.packagesRemaining++;
        this.replenishTimer = 0;
      }
    }

    // Active thrown packages update
    for (let i = this.activePackages.length - 1; i >= 0; i--) {
      const p = this.activePackages[i];
      p.elapsedTime += dt;
      p.progress = Math.min(1.0, p.elapsedTime / p.flightDuration);

      p.currentX = p.startX + (p.targetX - p.startX) * p.progress;
      p.currentY = p.startY + (p.targetY - p.startY) * p.progress;
      p.rotation += p.rotationSpeed * dt;

      effects.addPackageTrail(p.currentX, p.currentY);

      // Consistent collision acceptance: check hit at intended landing coordinates as package descends (progress >= 0.85)
      if (p.progress >= 0.85 && !p.resolved) {
        const hitTarget = this.checkTargetHit(p.targetX, p.targetY, targets);
        if (hitTarget) {
          p.resolved = true;
          this.resolveSuccessfulHit(p, hitTarget, effects, onResolution);
          this.activePackages.splice(i, 1);
          continue;
        }
      }

      // Final landing check
      if (p.progress >= 1.0 && !p.resolved) {
        p.resolved = true;
        const hitTarget = this.checkTargetHit(p.targetX, p.targetY, targets);
        if (hitTarget) {
          this.resolveSuccessfulHit(p, hitTarget, effects, onResolution);
        } else {
          effects.addMissDust(p.targetX, p.targetY);
          sound.playMiss();
          const throwDist = Math.hypot(p.targetX - p.startX, p.targetY - p.startY);
          const missReason = this.classifyMiss(p, targets);
          onResolution({
            type: 'MISS',
            deliveryType: p.type,
            distance: throwDist,
            isLongShot: false,
            wasMoving: p.wasMoving,
            points: 0,
            x: p.targetX,
            y: p.targetY,
            missReason,
          });
        }
        this.activePackages.splice(i, 1);
      }
    }
  }

  private classifyMiss(p: ThrownPackage, targets: DeliveryTarget[]): 'SHORT' | 'LONG' | 'WIDE' {
    let nearestTarget: DeliveryTarget | null = null;
    let nearestDist = Infinity;

    for (const t of targets) {
      if (!t.active) continue;
      const d = Math.hypot(t.x - p.startX, t.y - p.startY);
      if (d < nearestDist) {
        nearestDist = d;
        nearestTarget = t;
      }
    }

    if (!nearestTarget) return 'WIDE';

    const throwDist = Math.hypot(p.targetX - p.startX, p.targetY - p.startY);
    const targetDist = nearestDist;
    const tolerance = nearestTarget.radius + GAME_CONFIG.PACKAGES.HIT_RADIUS_TOLERANCE;

    if (throwDist < targetDist - tolerance) {
      return 'SHORT';
    } else if (throwDist > targetDist + tolerance) {
      return 'LONG';
    }
    return 'WIDE';
  }

  private checkTargetHit(x: number, y: number, targets: DeliveryTarget[]): DeliveryTarget | null {
    let closestTarget: DeliveryTarget | null = null;
    let closestDist = Infinity;
    const hitTolerance = GAME_CONFIG.PACKAGES.HIT_RADIUS_TOLERANCE;

    for (const t of targets) {
      if (!t.active) continue;
      const dist = Math.hypot(x - t.x, y - t.y);
      if (dist <= t.radius + hitTolerance) {
        if (dist < closestDist) {
          closestDist = dist;
          closestTarget = t;
        }
      }
    }
    return closestTarget;
  }

  private resolveSuccessfulHit(
    p: ThrownPackage,
    hitTarget: DeliveryTarget,
    effects: EffectsManager,
    onResolution: (res: PackageResolution) => void
  ): void {
    const throwDist = Math.hypot(p.targetX - p.startX, p.targetY - p.startY);
    const isLongShot = throwDist >= GAME_CONFIG.PACKAGES.LONG_DISTANCE_THRESHOLD;

    let points = GAME_CONFIG.PACKAGES.BASE_POINTS;

    // Delivery Variety Bonuses (Phase 4)
    if (p.type === 'PIZZA') {
      points += GAME_CONFIG.DELIVERY_TYPES.PIZZA.bonusPoints;
    } else if (p.type === 'EXPRESS' && isLongShot) {
      points += GAME_CONFIG.DELIVERY_TYPES.EXPRESS.bonusPoints;
    } else if (p.type === 'FRAGILE') {
      const accuracyDist = Math.hypot(p.targetX - hitTarget.x, p.targetY - hitTarget.y);
      if (accuracyDist < 25) {
        points += GAME_CONFIG.DELIVERY_TYPES.FRAGILE.bonusPoints;
      }
    }

    // Moving Delivery Skill Bonus (Phase 2 Rescue)
    if (p.wasMoving) {
      points += GAME_CONFIG.PACKAGES.MOVING_DELIVERY_BONUS;
    }

    effects.addDeliveryBurst(hitTarget.x, hitTarget.y, hitTarget.color);
    effects.addScreenShake(0.25);

    onResolution({
      type: 'HIT',
      deliveryType: p.type,
      target: hitTarget,
      distance: throwDist,
      isLongShot,
      wasMoving: p.wasMoving,
      points,
      x: hitTarget.x,
      y: hitTarget.y,
    });
  }

  public renderAimingTrajectory(ctx: CanvasRenderingContext2D, indicator: AimingIndicator): void {
    ctx.save();

    // 1. Dotted Aiming Trajectory Arc
    const segments = 16;
    ctx.strokeStyle = indicator.targetLock ? '#00f5d4' : (indicator.chargeRatio >= 0.95 ? '#ff0055' : '#fee440');
    ctx.lineWidth = indicator.targetLock ? 3.5 : 2.5;
    ctx.setLineDash([8, 6]);

    ctx.beginPath();
    ctx.moveTo(indicator.originX, indicator.originY);
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const x = indicator.originX + (indicator.landingX - indicator.originX) * t;
      const y = indicator.originY + (indicator.landingY - indicator.originY) * t;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Glowing Landing Zone Bullseye & Lock Brackets
    const landingRadius = 18 + Math.sin(Date.now() * 0.01) * 3;
    ctx.fillStyle = indicator.targetLock ? 'rgba(0, 245, 212, 0.35)' : 'rgba(254, 228, 64, 0.25)';
    ctx.beginPath();
    ctx.arc(indicator.landingX, indicator.landingY, landingRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = indicator.targetLock ? '#00f5d4' : '#fee440';
    ctx.lineWidth = indicator.targetLock ? 3 : 2;
    ctx.stroke();

    if (indicator.targetLock) {
      // Corner reticle brackets when locked on valid target zone
      const bSize = 12;
      const bOffset = landingRadius + 6;
      ctx.strokeStyle = '#00f5d4';
      ctx.lineWidth = 2.5;

      // Top-Left
      ctx.beginPath();
      ctx.moveTo(indicator.landingX - bOffset, indicator.landingY - bOffset + bSize);
      ctx.lineTo(indicator.landingX - bOffset, indicator.landingY - bOffset);
      ctx.lineTo(indicator.landingX - bOffset + bSize, indicator.landingY - bOffset);
      ctx.stroke();

      // Top-Right
      ctx.beginPath();
      ctx.moveTo(indicator.landingX + bOffset - bSize, indicator.landingY - bOffset);
      ctx.lineTo(indicator.landingX + bOffset, indicator.landingY - bOffset);
      ctx.lineTo(indicator.landingX + bOffset, indicator.landingY - bOffset + bSize);
      ctx.stroke();

      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(indicator.landingX - bOffset, indicator.landingY + bOffset - bSize);
      ctx.lineTo(indicator.landingX - bOffset, indicator.landingY + bOffset);
      ctx.lineTo(indicator.landingX - bOffset + bSize, indicator.landingY + bOffset);
      ctx.stroke();

      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(indicator.landingX + bOffset - bSize, indicator.landingY + bOffset);
      ctx.lineTo(indicator.landingX + bOffset, indicator.landingY + bOffset);
      ctx.lineTo(indicator.landingX + bOffset, indicator.landingY + bOffset - bSize);
      ctx.stroke();

      // Center lock crosshair
      ctx.beginPath();
      ctx.moveTo(indicator.landingX - 5, indicator.landingY);
      ctx.lineTo(indicator.landingX + 5, indicator.landingY);
      ctx.moveTo(indicator.landingX, indicator.landingY - 5);
      ctx.lineTo(indicator.landingX, indicator.landingY + 5);
      ctx.stroke();
    }

    // 3. Compact Charge Meter above Van
    const barW = 44;
    const barH = 7;
    const barX = indicator.originX - barW / 2;
    const barY = indicator.originY - 50;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(barX - 2, barY - 2, barW + 4, barH + 4, 3);
    ctx.fill();

    const chargeColor = indicator.chargeRatio >= 0.95 ? '#ff0055' : (indicator.chargeRatio > 0.5 ? '#fee440' : '#00f5d4');
    ctx.fillStyle = chargeColor;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * indicator.chargeRatio, barH, 2);
    ctx.fill();

    ctx.restore();
  }

  public render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.activePackages) {
      const heightOffset = 4 * p.peakHeight * p.progress * (1 - p.progress);

      // Ground Shadow
      ctx.save();
      ctx.translate(p.currentX, p.currentY);
      const shadowScale = Math.max(0.35, 1.0 - heightOffset / 65);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 12 * shadowScale, 7 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Elevated Package box (Rendered according to variety)
      ctx.save();
      ctx.translate(p.currentX, p.currentY - heightOffset);
      ctx.rotate(p.rotation);

      if (p.type === 'PIZZA') {
        // Flat stackable Pizza Box
        const pw = 24;
        const ph = 14;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
        ctx.strokeStyle = '#e63946';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
        // Pizza slice icon stamp
        ctx.fillStyle = '#e63946';
        ctx.beginPath();
        ctx.moveTo(0, -ph / 2 + 2);
        ctx.lineTo(-4, ph / 2 - 2);
        ctx.lineTo(4, ph / 2 - 2);
        ctx.closePath();
        ctx.fill();
      } else if (p.type === 'FRAGILE') {
        // Purple fragile parcel with yellow caution tape
        const size = 18;
        ctx.fillStyle = '#7209b7';
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.strokeStyle = '#f72585';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-size / 2, -size / 2, size, size);
        ctx.fillStyle = '#fee440';
        ctx.fillRect(-size / 2 + 2, -2, size - 4, 4);
      } else {
        // Standard Express Cardboard Box
        const size = 18;
        ctx.fillStyle = '#d4a373';
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.strokeStyle = '#6b4423';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-size / 2, -size / 2, size, size);
        ctx.strokeStyle = '#faedcd';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-size / 2, 0);
        ctx.lineTo(size / 2, 0);
        ctx.moveTo(0, -size / 2);
        ctx.lineTo(0, size / 2);
        ctx.stroke();
      }

      ctx.restore();
    }
  }
}
