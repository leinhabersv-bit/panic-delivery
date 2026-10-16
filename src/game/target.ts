import { GAME_CONFIG } from './config.ts';
import type { DeliveryTarget, DeliveryType, Point } from './types.ts';
import type { DeliverySpot } from './map.ts';

interface TargetTheme {
  name: string;
  type: DeliveryType;
  district: 'RESIDENTIAL' | 'DOWNTOWN' | 'PARK';
  color: string;
  icon: string;
}

const DISTRICT_THEMES: TargetTheme[] = [
  // Pizza deliveries
  { name: 'PIZZA PLANET', type: 'PIZZA', district: 'DOWNTOWN', color: '#ff5400', icon: '🍕' },
  { name: 'MAPLE COTTAGE', type: 'PIZZA', district: 'RESIDENTIAL', color: '#ff5400', icon: '🍕' },
  { name: 'SUNNY VILLA', type: 'PIZZA', district: 'RESIDENTIAL', color: '#ff5400', icon: '🍕' },
  // Express Parcel deliveries
  { name: 'TECH TOWER', type: 'EXPRESS', district: 'DOWNTOWN', color: '#00f5d4', icon: '📦' },
  { name: 'RETRO ARCADE', type: 'EXPRESS', district: 'DOWNTOWN', color: '#00f5d4', icon: '🕹️' },
  { name: 'PARK BOTANICAL', type: 'EXPRESS', district: 'PARK', color: '#00f5d4', icon: '📦' },
  // Fragile deliveries
  { name: 'RIVER CAFE', type: 'FRAGILE', district: 'PARK', color: '#b5179e', icon: '🏺' },
  { name: 'BLUE SPRUCE LAB', type: 'FRAGILE', district: 'RESIDENTIAL', color: '#b5179e', icon: '🧪' },
  { name: 'CYBER RAMEN', type: 'FRAGILE', district: 'DOWNTOWN', color: '#b5179e', icon: '🍜' },
];

export class TargetManager {
  public targets: DeliveryTarget[] = [];
  private deliverySpots: DeliverySpot[];
  private pulseTimer: number = 0;
  private readonly initialStartPos: Point = { x: 2300, y: 1800 };

  constructor(deliverySpots: DeliverySpot[]) {
    this.deliverySpots = [...deliverySpots];
    this.spawnInitialTargets();
  }

  public reset(): void {
    this.targets = [];
    this.pulseTimer = 0;
    this.spawnInitialTargets();
  }

  private spawnInitialTargets(): void {
    const startPos = this.initialStartPos;
    const maxFirstDist = GAME_CONFIG.TARGETS.FIRST_TARGET_MAX_DISTANCE;

    // 1. First target: explicitly place near initial van position ahead on the road corridor
    const closeSpots = this.deliverySpots
      .map(spot => ({
        spot,
        dist: Math.hypot(spot.x - startPos.x, spot.y - startPos.y),
        isAhead: spot.y <= startPos.y, // Ahead of van facing Up
      }))
      .filter(item => item.dist <= maxFirstDist)
      .sort((a, b) => {
        if (a.isAhead && !b.isAhead) return -1;
        if (!a.isAhead && b.isAhead) return 1;
        return a.dist - b.dist;
      });

    const firstSpot = closeSpots.length > 0 ? closeSpots[0].spot : this.deliverySpots[0];
    const firstTarget = this.createTargetAtSpot(firstSpot);
    if (firstTarget) {
      this.targets.push(firstTarget);
    }

    // 2. Subsequent initial targets: spawn in a reachable chain from the previous target
    let lastPoint: Point = firstTarget ? { x: firstTarget.x, y: firstTarget.y } : startPos;
    const count = GAME_CONFIG.TARGETS.MAX_ACTIVE;
    for (let i = 1; i < count; i++) {
      const nextTarget = this.spawnNewTarget(lastPoint);
      if (nextTarget) {
        lastPoint = { x: nextTarget.x, y: nextTarget.y };
      }
    }
  }

  public spawnNewTarget(referencePoint?: Point): DeliveryTarget | null {
    if (this.deliverySpots.length === 0) return null;

    // Avoid clustering right on top of existing active targets (min 300px separation)
    const nonOverlappingSpots = this.deliverySpots.filter(spot => {
      return !this.targets.some(t => {
        const dx = t.x - spot.x;
        const dy = t.y - spot.y;
        return Math.hypot(dx, dy) < 300;
      });
    });

    const candidatePool = nonOverlappingSpots.length > 0 ? nonOverlappingSpots : this.deliverySpots;

    // Filter out spots that repeat already active landmark names
    const activeNames = this.targets.map(t => t.name);
    const uniqueLandmarkSpots = candidatePool.filter(spot => {
      if (!spot.buildingName) return true;
      return !activeNames.some(activeName => activeName.includes(spot.buildingName!));
    });

    const nameFilteredPool = uniqueLandmarkSpots.length > 0 ? uniqueLandmarkSpots : candidatePool;

    let selectedSpot: DeliverySpot;

    if (referencePoint) {
      const minChain = GAME_CONFIG.TARGETS.ROUTE_MIN_CHAIN_DISTANCE;
      const maxChain = GAME_CONFIG.TARGETS.ROUTE_MAX_CHAIN_DISTANCE;

      // Primary filter: spots within reachable combo driving distance
      const routeChainSpots = nameFilteredPool.filter(spot => {
        const dist = Math.hypot(spot.x - referencePoint.x, spot.y - referencePoint.y);
        return dist >= minChain && dist <= maxChain;
      });

      if (routeChainSpots.length > 0) {
        selectedSpot = routeChainSpots[Math.floor(Math.random() * routeChainSpots.length)];
      } else {
        // Fallback: wider proximity window
        const fallbackSpots = nameFilteredPool.filter(spot => {
          const dist = Math.hypot(spot.x - referencePoint.x, spot.y - referencePoint.y);
          return dist >= 250 && dist <= 1250;
        });
        if (fallbackSpots.length > 0) {
          selectedSpot = fallbackSpots[Math.floor(Math.random() * fallbackSpots.length)];
        } else {
          selectedSpot = nameFilteredPool[Math.floor(Math.random() * nameFilteredPool.length)];
        }
      }
    } else {
      selectedSpot = nameFilteredPool[Math.floor(Math.random() * nameFilteredPool.length)];
    }

    const newTarget = this.createTargetAtSpot(selectedSpot);
    if (newTarget) {
      this.targets.push(newTarget);
    }
    return newTarget;
  }

  private createTargetAtSpot(spot: DeliverySpot): DeliveryTarget | null {
    // 1. Try to find a theme matching the spot's actual building landmark
    let matchedTheme: TargetTheme | undefined;
    if (spot.buildingName) {
      matchedTheme = DISTRICT_THEMES.find(theme =>
        theme.name === spot.buildingName || spot.buildingName!.includes(theme.name) || theme.name.includes(spot.buildingName!)
      );
    }

    // 2. If no direct theme match, balance delivery varieties (PIZZA, EXPRESS, FRAGILE)
    if (!matchedTheme) {
      const existingTypes = this.targets.map(t => t.type);
      const missingTypes = (['PIZZA', 'EXPRESS', 'FRAGILE'] as DeliveryType[]).filter(
        type => !existingTypes.includes(type)
      );

      const candidateThemes = DISTRICT_THEMES.filter(theme => {
        if (spot.district && theme.district !== spot.district) return false;
        if (missingTypes.length > 0 && !missingTypes.includes(theme.type)) return false;
        return true;
      });

      const pool = candidateThemes.length > 0 ? candidateThemes : DISTRICT_THEMES;
      matchedTheme = pool[Math.floor(Math.random() * pool.length)];
    }

    const theme = matchedTheme;
    const displayName = spot.buildingName || theme.name;

    return {
      id: Math.random().toString(36).substring(2, 9),
      name: `${theme.icon} ${displayName}`,
      type: theme.type,
      district: (spot.district || theme.district) as 'RESIDENTIAL' | 'DOWNTOWN' | 'PARK',
      x: spot.x,
      y: spot.y,
      radius: GAME_CONFIG.TARGETS.ZONE_RADIUS,
      active: true,
      color: theme.color,
      icon: theme.icon,
      customerHappyTimer: 0,
    };
  }

  public update(dt: number): void {
    this.pulseTimer += dt * GAME_CONFIG.TARGETS.PULSE_SPEED;

    for (const t of this.targets) {
      if (t.customerHappyTimer > 0) {
        t.customerHappyTimer -= dt;
      }
    }

    while (this.targets.filter((t) => t.active).length < GAME_CONFIG.TARGETS.MAX_ACTIVE) {
      const activeTargets = this.targets.filter(t => t.active);
      const ref = activeTargets.length > 0 ? { x: activeTargets[activeTargets.length - 1].x, y: activeTargets[activeTargets.length - 1].y } : undefined;
      this.spawnNewTarget(ref);
    }
  }

  public markDelivered(targetId: string, deliveredPos?: Point): void {
    const idx = this.targets.findIndex((t) => t.id === targetId);
    if (idx !== -1) {
      const target = this.targets[idx];
      const pos = deliveredPos || { x: target.x, y: target.y };
      target.active = false;
      target.customerHappyTimer = 1.2; // Customer cheers
      this.targets.splice(idx, 1);
      this.spawnNewTarget(pos);
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    for (const target of this.targets) {
      if (!target.active) continue;

      ctx.save();
      ctx.translate(target.x, target.y);

      const pulse = Math.sin(this.pulseTimer) * 0.12 + 1.0;
      const radius = target.radius * pulse;

      // 1. Expanding radar ripple
      const rippleProgress = (this.pulseTimer * 0.45) % 1.0;
      const rippleRadius = target.radius * (1.0 + rippleProgress * 0.7);
      const rippleAlpha = (1.0 - rippleProgress) * 0.55;

      ctx.strokeStyle = target.color;
      ctx.globalAlpha = rippleAlpha;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, rippleRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      // 2. Glowing ground pool
      const grad = ctx.createRadialGradient(0, 0, 8, 0, 0, radius * 1.4);
      grad.addColorStop(0, `${target.color}77`);
      grad.addColorStop(0.6, `${target.color}33`);
      grad.addColorStop(1, `${target.color}00`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // 3. Target zone boundary
      ctx.strokeStyle = target.color;
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 4. Inward-pointing directional chevrons
      const chevronCount = 4;
      const spinAngle = this.pulseTimer * 0.6;
      ctx.fillStyle = target.color;

      for (let i = 0; i < chevronCount; i++) {
        const a = spinAngle + (i * Math.PI * 2) / chevronCount;
        const dist = radius * 0.68;
        const cx = Math.cos(a) * dist;
        const cy = Math.sin(a) * dist;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a + Math.PI);

        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-4, -6);
        ctx.lineTo(-1, 0);
        ctx.lineTo(-4, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // 5. Central bullseye with Delivery Variety Icon
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = target.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 6. Floating 3D Beacon
      const bobY = -36 + Math.sin(this.pulseTimer * 1.4) * 8;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(0, bobY);
      ctx.shadowColor = target.color;
      ctx.shadowBlur = 12;

      ctx.fillStyle = target.color;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(-13, 0);
      ctx.lineTo(0, 15);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(13, 0);
      ctx.lineTo(0, 15);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1.0;

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(13, 0);
      ctx.lineTo(0, 15);
      ctx.lineTo(-13, 0);
      ctx.closePath();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.restore();

      // 7. Storefront Name & Type Badge
      ctx.font = 'bold 12px "Fredoka", "Outfit", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const text = `${target.name}`;
      const textMetrics = ctx.measureText(text);
      const pad = 10;
      const badgeY = -radius - 28;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.roundRect(-textMetrics.width / 2 - pad + 2, badgeY + 2, textMetrics.width + pad * 2, 22, 6);
      ctx.fill();

      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.beginPath();
      ctx.roundRect(-textMetrics.width / 2 - pad, badgeY, textMetrics.width + pad * 2, 22, 6);
      ctx.fill();
      ctx.strokeStyle = target.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, 0, badgeY + 11);

      // 8. Cheering customer nearby on sidewalk
      const custX = radius + 22;
      const custY = 6;
      ctx.save();
      ctx.translate(custX, custY);

      // Jumping animation when delivered
      const jumpY = target.customerHappyTimer > 0 ? Math.abs(Math.sin(target.customerHappyTimer * 12)) * -14 : 0;
      ctx.translate(0, jumpY);

      // Customer shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 4 - jumpY, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body & head
      ctx.fillStyle = target.color;
      ctx.fillRect(-3, -6, 6, 7);
      ctx.fillStyle = '#ffdfba';
      ctx.beginPath();
      ctx.arc(0, -9, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Waving arms
      const armWave = Math.sin(Date.now() * 0.008) * 4;
      ctx.strokeStyle = '#ffdfba';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-3, -4);
      ctx.lineTo(-6, -8 + armWave);
      ctx.moveTo(3, -4);
      ctx.lineTo(6, -8 - armWave);
      ctx.stroke();

      ctx.restore();

      ctx.restore();
    }
  }
}
