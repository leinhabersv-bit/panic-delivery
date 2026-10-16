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
    let baseSpeed = minSpd + (maxSpd - minSpd) * chargeRatio;

    // Rocket Pizza speed boost
    if (this.currentDeliveryType === 'ROCKET_PIZZA') {
      baseSpeed *= GAME_CONFIG.DELIVERY_TYPES.ROCKET_PIZZA.flightSpeedMultiplier || 1.4;
    }

    // Modest forward van velocity inheritance
    const forwardBoost = Math.max(0, carSpeed * 0.35);
    const flightSpeed = baseSpeed + forwardBoost;
    const flightDuration = this.currentDeliveryType === 'ROCKET_PIZZA' ? 0.48 : GAME_CONFIG.PACKAGES.FLIGHT_TIME;
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

    const isRocket = this.currentDeliveryType === 'ROCKET_PIZZA';
    const isBouncy = this.currentDeliveryType === 'BOUNCY_BOX';

    this.isCharging = false;
    this.chargeTime = 0;
    this.packagesRemaining--;
    this.throwCooldownTimer = GAME_CONFIG.PACKAGES.THROW_COOLDOWN_SECONDS;

    if (isRocket) {
      sound.playRocketLaunch();
    } else {
      sound.playThrow();
    }

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
      peakHeight: isRocket ? 36 : (52 + this.getChargeRatio() * 15),
      rotation: isRocket ? carAngle : Math.random() * Math.PI,
      rotationSpeed: isRocket ? 0 : (Math.random() - 0.5) * 12,
      resolved: false,
      wasMoving,
      isRocket,
      bouncesRemaining: isBouncy ? 1 : 0,
      trailTimer: 0,
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

      if (!p.isRocket) {
        p.rotation += p.rotationSpeed * dt;
      }

      // Visual particle trails per type
      if (p.isRocket) {
        const flightAngle = Math.atan2(p.targetY - p.startY, p.targetX - p.startX);
        effects.addRocketExhaust(p.currentX, p.currentY, flightAngle);
        p.rotation = flightAngle;

        // Mild, bounded target homing assistance (steer up to 35px toward nearest active target)
        if (p.progress < 0.85) {
          const nearest = this.getClosestTarget(p.targetX, p.targetY, targets, 180);
          if (nearest) {
            const hx = nearest.x - p.targetX;
            const hy = nearest.y - p.targetY;
            const hDist = Math.hypot(hx, hy);
            if (hDist > 5) {
              p.targetX += (hx / hDist) * Math.min(hDist, 45 * dt);
              p.targetY += (hy / hDist) * Math.min(hDist, 45 * dt);
            }
          }
        }
      } else if (p.type === 'GOLDEN_PARCEL') {
        effects.addGoldSparkle(p.currentX, p.currentY);
      } else if (p.type === 'MAGNET_MAIL') {
        effects.addPackageTrail(p.currentX, p.currentY, '#4cc9f0');
        // Magnetic attraction near target
        if (p.progress > 0.4) {
          const nearest = this.getClosestTarget(p.targetX, p.targetY, targets, 100);
          if (nearest) {
            p.targetX += (nearest.x - p.targetX) * dt * 2.5;
            p.targetY += (nearest.y - p.targetY) * dt * 2.5;
          }
        }
      } else {
        effects.addPackageTrail(p.currentX, p.currentY, p.type === 'CONFETTI_BOMB' ? '#f72585' : '#ffd166');
      }

      // Consistent collision acceptance: check hit at intended landing coordinates as package descends (progress >= 0.85)
      if (p.progress >= 0.85 && !p.resolved) {
        const hitTarget = this.checkTargetHit(p.targetX, p.targetY, targets);
        if (hitTarget) {
          p.resolved = true;
          this.resolveSuccessfulHit(p, hitTarget, effects, sound, onResolution);
          this.activePackages.splice(i, 1);
          continue;
        }
      }

      // Final landing check
      if (p.progress >= 1.0 && !p.resolved) {
        const hitTarget = this.checkTargetHit(p.targetX, p.targetY, targets);
        if (hitTarget) {
          p.resolved = true;
          this.resolveSuccessfulHit(p, hitTarget, effects, sound, onResolution);
          this.activePackages.splice(i, 1);
        } else if (p.bouncesRemaining && p.bouncesRemaining > 0) {
          // Bouncy Box trick shot bounce!
          p.bouncesRemaining--;
          effects.addBouncePoof(p.targetX, p.targetY);
          sound.playBounce();

          const throwDirX = p.targetX - p.startX;
          const throwDirY = p.targetY - p.startY;
          const throwMag = Math.max(1, Math.hypot(throwDirX, throwDirY));

          p.startX = p.targetX;
          p.startY = p.targetY;
          p.targetX = p.startX + (throwDirX / throwMag) * 140;
          p.targetY = p.startY + (throwDirY / throwMag) * 140;
          p.elapsedTime = 0;
          p.flightDuration = 0.32;
          p.progress = 0;
          p.peakHeight = 32;
        } else {
          p.resolved = true;
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
          this.activePackages.splice(i, 1);
        }
      }
    }
  }

  private getClosestTarget(x: number, y: number, targets: DeliveryTarget[], maxRange: number): DeliveryTarget | null {
    let closest: DeliveryTarget | null = null;
    let closestDist = maxRange;
    for (const t of targets) {
      if (!t.active) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < closestDist) {
        closestDist = d;
        closest = t;
      }
    }
    return closest;
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
    sound: SoundFx,
    onResolution: (res: PackageResolution) => void
  ): void {
    const throwDist = Math.hypot(p.targetX - p.startX, p.targetY - p.startY);
    const isLongShot = throwDist >= GAME_CONFIG.PACKAGES.LONG_DISTANCE_THRESHOLD;

    let points = GAME_CONFIG.PACKAGES.BASE_POINTS;

    // Delivery Variety Bonuses from config
    const typeKey = p.type as keyof typeof GAME_CONFIG.DELIVERY_TYPES;
    if (GAME_CONFIG.DELIVERY_TYPES[typeKey]) {
      points += GAME_CONFIG.DELIVERY_TYPES[typeKey].bonusPoints;
    }

    // Moving Delivery Skill Bonus
    if (p.wasMoving) {
      points += GAME_CONFIG.PACKAGES.MOVING_DELIVERY_BONUS;
    }

    // Special package impact effects
    if (p.type === 'ROCKET_PIZZA') {
      effects.addRocketExplosion(hitTarget.x, hitTarget.y);
      sound.playRocketExplosion();
    } else if (p.type === 'CONFETTI_BOMB') {
      effects.addNeighborhoodPartyBurst(hitTarget.x, hitTarget.y, '#f72585');
    } else if (p.type === 'GOLDEN_PARCEL') {
      effects.addGoldSparkle(hitTarget.x, hitTarget.y);
      effects.addDeliveryBurst(hitTarget.x, hitTarget.y, '#ffd700');
    } else {
      effects.addDeliveryBurst(hitTarget.x, hitTarget.y, hitTarget.color);
    }
    effects.addScreenShake(0.28);

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

      if (p.type === 'ROCKET_PIZZA') {
        // --- ROCKET PIZZA: SIGNATURE WEAPON OF SPEED ---
        // Pizza Slice wedge pointing forward
        ctx.fillStyle = '#f59e0b'; // cheese
        ctx.beginPath();
        ctx.moveTo(14, 0); // nose tip
        ctx.lineTo(-12, -9);
        ctx.lineTo(-12, 9);
        ctx.closePath();
        ctx.fill();

        // Pizza crust
        ctx.fillStyle = '#b45309';
        ctx.beginPath();
        ctx.roundRect(-14, -10, 4, 20, 2);
        ctx.fill();

        // Pepperoni slices
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(-2, -3, 2.5, 0, Math.PI * 2);
        ctx.arc(4, 1, 2.5, 0, Math.PI * 2);
        ctx.arc(-5, 4, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Twin Rocket Thrusters
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(-17, -8, 5, 4);
        ctx.fillRect(-17, 4, 5, 4);

        // Rocket Flame plume
        const flamePulse = Math.random() * 4;
        ctx.fillStyle = '#ff0055';
        ctx.beginPath();
        ctx.moveTo(-17, -6);
        ctx.lineTo(-24 - flamePulse, -6);
        ctx.lineTo(-17, -4);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-17, 6);
        ctx.lineTo(-24 - flamePulse, 6);
        ctx.lineTo(-17, 4);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fee440';
        ctx.fillRect(-20, -7, 3, 2);
        ctx.fillRect(-20, 5, 3, 2);
      } else if (p.type === 'BOUNCY_BOX') {
        // Yellow-Orange bouncy box with coil spring
        const size = 18;
        ctx.fillStyle = '#ffbe0b';
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.strokeStyle = '#fb5607';
        ctx.lineWidth = 2;
        ctx.strokeRect(-size / 2, -size / 2, size, size);

        // Bouncy coil bands
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === 'GOLDEN_PARCEL') {
        // Gleaming gold crate
        const size = 18;
        const goldGrad = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
        goldGrad.addColorStop(0, '#ffe49e');
        goldGrad.addColorStop(0.5, '#ffd700');
        goldGrad.addColorStop(1, '#b38f00');
        ctx.fillStyle = goldGrad;
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-size / 2, -size / 2, size, size);

        // Crown / diamond emblem
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(4, 0);
        ctx.lineTo(0, 5);
        ctx.lineTo(-4, 0);
        ctx.closePath();
        ctx.fill();
      } else if (p.type === 'CONFETTI_BOMB') {
        // Striped party cylinder
        ctx.fillStyle = '#f72585';
        ctx.beginPath();
        ctx.roundRect(-8, -10, 16, 20, 4);
        ctx.fill();
        ctx.fillStyle = '#fee440';
        ctx.fillRect(-8, -3, 16, 6);

        // Spark fuse on top
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(3, -14);
        ctx.stroke();

        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(3, -14, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'MAGNET_MAIL') {
        // Electric cyan box with horseshoe magnet
        const size = 18;
        ctx.fillStyle = '#0077b6';
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.strokeStyle = '#00b4d8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-size / 2, -size / 2, size, size);

        // Horseshoe magnet on top
        ctx.strokeStyle = '#ff0055';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 5, Math.PI, 0);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-6, 0, 3, 3);
        ctx.fillRect(3, 0, 3, 3);
      } else if (p.type === 'MYSTERY_PARCEL') {
        // Deep purple mystery parcel
        const size = 18;
        ctx.fillStyle = '#5a189a';
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.strokeStyle = '#9d4edd';
        ctx.lineWidth = 2;
        ctx.strokeRect(-size / 2, -size / 2, size, size);

        // Question mark
        ctx.font = 'bold 12px "Fredoka", sans-serif';
        ctx.fillStyle = '#fee440';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, 0);
      } else if (p.type === 'PIZZA') {
        // Flat stackable Pizza Box
        const pw = 24;
        const ph = 14;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
        ctx.strokeStyle = '#e63946';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
        ctx.fillStyle = '#e63946';
        ctx.beginPath();
        ctx.moveTo(0, -ph / 2 + 2);
        ctx.lineTo(-4, ph / 2 - 2);
        ctx.lineTo(4, ph / 2 - 2);
        ctx.closePath();
        ctx.fill();
      } else if (p.type === 'FRAGILE') {
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
