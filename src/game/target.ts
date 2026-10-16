import { GAME_CONFIG } from './config.ts';
import { DeliveryTarget, DeliveryType, Point } from './types.ts';

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
  private deliverySpots: Point[];
  private pulseTimer: number = 0;

  constructor(deliverySpots: Point[]) {
    this.deliverySpots = [...deliverySpots];
    this.spawnInitialTargets();
  }

  public reset(): void {
    this.targets = [];
    this.pulseTimer = 0;
    this.spawnInitialTargets();
  }

  private spawnInitialTargets(): void {
    const count = GAME_CONFIG.TARGETS.MAX_ACTIVE;
    for (let i = 0; i < count; i++) {
      this.spawnNewTarget();
    }
  }

  public spawnNewTarget(): DeliveryTarget | null {
    if (this.deliverySpots.length === 0) return null;

    // Pick a spot reasonably distant from existing targets
    const availableSpots = this.deliverySpots.filter((spot) => {
      return !this.targets.some((t) => {
        const dx = t.x - spot.x;
        const dy = t.y - spot.y;
        return Math.sqrt(dx * dx + dy * dy) < 450;
      });
    });

    const pool = availableSpots.length > 0 ? availableSpots : this.deliverySpots;
    const randomSpot = pool[Math.floor(Math.random() * pool.length)];

    // Ensure we cycle varieties so player always has a mix of Pizza, Express and Fragile
    const existingTypes = this.targets.map(t => t.type);
    let candidateThemes = DISTRICT_THEMES.filter(theme => !existingTypes.includes(theme.type));
    if (candidateThemes.length === 0) {
      candidateThemes = DISTRICT_THEMES;
    }
    const theme = candidateThemes[Math.floor(Math.random() * candidateThemes.length)];

    const newTarget: DeliveryTarget = {
      id: Math.random().toString(36).substring(2, 9),
      name: `${theme.icon} ${theme.name}`,
      type: theme.type,
      district: theme.district,
      x: randomSpot.x,
      y: randomSpot.y,
      radius: GAME_CONFIG.TARGETS.ZONE_RADIUS,
      active: true,
      color: theme.color,
      icon: theme.icon,
      customerHappyTimer: 0,
    };

    this.targets.push(newTarget);
    return newTarget;
  }

  public update(dt: number): void {
    this.pulseTimer += dt * GAME_CONFIG.TARGETS.PULSE_SPEED;

    for (const t of this.targets) {
      if (t.customerHappyTimer > 0) {
        t.customerHappyTimer -= dt;
      }
    }

    while (this.targets.filter((t) => t.active).length < GAME_CONFIG.TARGETS.MAX_ACTIVE) {
      this.spawnNewTarget();
    }
  }

  public markDelivered(targetId: string): void {
    const idx = this.targets.findIndex((t) => t.id === targetId);
    if (idx !== -1) {
      this.targets[idx].active = false;
      this.targets[idx].customerHappyTimer = 1.2; // Customer cheers
      this.targets.splice(idx, 1);
      this.spawnNewTarget();
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
