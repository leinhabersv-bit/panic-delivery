import { GAME_CONFIG } from './config.ts';
import { Pedestrian, TrafficVehicle, AmbientParticle } from './types.ts';
import { CityMap } from './map.ts';
import { EffectsManager } from './effects.ts';

export class LivingCityManager {
  public pedestrians: Pedestrian[] = [];
  public traffic: TrafficVehicle[] = [];
  public ambientParticles: AmbientParticle[] = [];

  private map: CityMap;
  private nextEntityId: number = 1;

  constructor(map: CityMap) {
    this.map = map;
    this.spawnInitialPopulation();
  }

  public reset(): void {
    this.pedestrians = [];
    this.traffic = [];
    this.ambientParticles = [];
    this.spawnInitialPopulation();
  }

  private spawnInitialPopulation(): void {
    // 1. Spawn Pedestrians on Sidewalk Segments
    const shirtColors = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#f72585', '#ffffff'];
    const pantsColors = ['#1d3557', '#334155', '#457b9d', '#2b2d42', '#3d405b'];

    for (let i = 0; i < GAME_CONFIG.CITY.MAX_PEDESTRIANS; i++) {
      if (this.map.sidewalkSegments.length === 0) break;
      const seg = this.map.sidewalkSegments[i % this.map.sidewalkSegments.length];
      const t = Math.random();
      const px = seg.startX + (seg.endX - seg.startX) * t;
      const py = seg.startY + (seg.endY - seg.startY) * t;

      const dx = seg.endX - seg.startX;
      const dy = seg.endY - seg.startY;
      const len = Math.hypot(dx, dy) || 1;
      const dir = Math.random() > 0.5 ? 1 : -1;

      this.pedestrians.push({
        id: this.nextEntityId++,
        x: px,
        y: py,
        dirX: (dx / len) * dir,
        dirY: (dy / len) * dir,
        speed: GAME_CONFIG.CITY.PEDESTRIAN_SPEED * (0.85 + Math.random() * 0.3),
        shirtColor: shirtColors[i % shirtColors.length],
        pantsColor: pantsColors[i % pantsColors.length],
        walkCycle: Math.random() * Math.PI * 2,
        walkTimer: 0,
        sidewalkSegmentId: seg.id,
      });
    }

    // 2. Spawn Traffic on Road Lanes
    const carColors = ['#3a86ff', '#fb5607', '#ff006e', '#8338ec', '#ffbe0b', '#06d6a0', '#e2e8f0'];
    const carTypes: ('compact' | 'sedan' | 'scooter')[] = ['compact', 'sedan', 'scooter'];

    for (let i = 0; i < GAME_CONFIG.CITY.MAX_TRAFFIC; i++) {
      if (this.map.trafficLanes.length === 0) break;
      const lane = this.map.trafficLanes[i % this.map.trafficLanes.length];
      const t = (i / GAME_CONFIG.CITY.MAX_TRAFFIC) + Math.random() * 0.15;
      const tx = lane.startX + (lane.endX - lane.startX) * (t % 1.0);
      const ty = lane.startY + (lane.endY - lane.startY) * (t % 1.0);

      const type = carTypes[i % carTypes.length];
      const length = type === 'scooter' ? 24 : (type === 'sedan' ? 48 : 38);
      const width = type === 'scooter' ? 12 : 24;

      this.traffic.push({
        id: this.nextEntityId++,
        x: tx,
        y: ty,
        angle: lane.angle,
        speed: GAME_CONFIG.CITY.TRAFFIC_SPEED * (type === 'scooter' ? 1.15 : 0.95),
        maxSpeed: GAME_CONFIG.CITY.TRAFFIC_SPEED,
        color: carColors[i % carColors.length],
        type,
        laneIndex: i % this.map.trafficLanes.length,
        length,
        width,
        nearMissAwarded: false,
      });
    }

    // 3. Spawn Ambient Life (Birds & Drifting Leaves)
    for (let i = 0; i < 18; i++) {
      this.ambientParticles.push({
        x: Math.random() * this.map.width,
        y: Math.random() * this.map.height,
        vx: 30 + Math.random() * 50,
        vy: -15 + (Math.random() - 0.5) * 20,
        size: Math.random() > 0.5 ? 4 : 3,
        color: Math.random() > 0.4 ? '#ffffff' : '#d4a373',
        alpha: 0.6 + Math.random() * 0.4,
        type: Math.random() > 0.5 ? 'bird' : 'leaf',
        timer: Math.random() * Math.PI * 2,
      });
    }
  }

  public update(dt: number, carX: number, carY: number, effects: EffectsManager, addScore: (pts: number, txt: string) => void): void {
    // 1. Update Pedestrians
    for (const ped of this.pedestrians) {
      if (ped.cheerTimer && ped.cheerTimer > 0) {
        ped.cheerTimer -= dt;
        ped.cheerJump = Math.abs(Math.sin(ped.cheerTimer * 12)) * 12; // Excited jumping animation
      } else {
        ped.cheerJump = 0;
        ped.walkTimer += dt * 6;
        ped.walkCycle = Math.sin(ped.walkTimer);

        ped.x += ped.dirX * ped.speed * dt;
        ped.y += ped.dirY * ped.speed * dt;

        // Turn around if reaching segment boundaries
        const seg = this.map.sidewalkSegments.find(s => s.id === ped.sidewalkSegmentId);
        if (seg) {
          const minX = Math.min(seg.startX, seg.endX);
          const maxX = Math.max(seg.startX, seg.endX);
          const minY = Math.min(seg.startY, seg.endY);
          const maxY = Math.max(seg.startY, seg.endY);

          if (ped.x < minX || ped.x > maxX || ped.y < minY || ped.y > maxY) {
            ped.dirX *= -1;
            ped.dirY *= -1;
          }
        }
      }
    }

    // 2. Update Traffic Vehicles & Near-Miss Detection
    for (const veh of this.traffic) {
      const lane = this.map.trafficLanes[veh.laneIndex];
      const cosA = Math.cos(veh.angle);
      const sinA = Math.sin(veh.angle);

      // Check distance to player van
      const distToPlayer = Math.hypot(veh.x - carX, veh.y - carY);

      // Safe yielding: vehicle slows if player van is directly in front
      const dxPlayer = carX - veh.x;
      const dyPlayer = carY - veh.y;
      const dotAhead = cosA * dxPlayer + sinA * dyPlayer;

      if (distToPlayer < 90 && dotAhead > 0) {
        veh.speed = Math.max(0, veh.speed - dt * 250); // Gentle brake
      } else {
        veh.speed = Math.min(veh.maxSpeed, veh.speed + dt * 100);
      }

      // Near-Miss Bonus (Passing traffic cleanly at high speed)
      if (distToPlayer < GAME_CONFIG.CITY.NEAR_MISS_DISTANCE && distToPlayer > 35 && !veh.nearMissAwarded) {
        veh.nearMissAwarded = true;
        addScore(GAME_CONFIG.CITY.NEAR_MISS_POINTS, 'NEAR MISS!');
        effects.addScorePopup(veh.x, veh.y - 20, `+${GAME_CONFIG.CITY.NEAR_MISS_POINTS} NEAR MISS!`, '#00f5d4');
      } else if (distToPlayer > 180) {
        veh.nearMissAwarded = false;
      }

      // Move along lane
      veh.x += cosA * veh.speed * dt;
      veh.y += sinA * veh.speed * dt;

      // Wrap around lane ends seamlessly
      const laneLen = Math.hypot(lane.endX - lane.startX, lane.endY - lane.startY);
      const currentDist = Math.hypot(veh.x - lane.startX, veh.y - lane.startY);
      if (currentDist >= laneLen) {
        veh.x = lane.startX;
        veh.y = lane.startY;
      }
    }

    // 3. Update Ambient Birds & Leaves
    for (const amb of this.ambientParticles) {
      amb.timer += dt * 3;
      amb.x += amb.vx * dt;
      amb.y += (amb.vy + Math.sin(amb.timer) * 12) * dt;

      // Wrap around world edges
      if (amb.x > this.map.width + 40) amb.x = -20;
      if (amb.y > this.map.height + 40) amb.y = -20;
      if (amb.y < -40) amb.y = this.map.height + 20;
    }
  }

  public triggerPedestrianCheer(x: number, y: number, radius: number = 380, duration: number = 2.0): void {
    for (const ped of this.pedestrians) {
      const dist = Math.hypot(ped.x - x, ped.y - y);
      if (dist <= radius) {
        ped.cheerTimer = duration * (0.8 + Math.random() * 0.4);
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number, viewW: number, viewH: number): void {
    const pad = 90; // Viewport spatial culling

    // 1. Render Ambient Leaves / Shadows
    for (const amb of this.ambientParticles) {
      if (amb.x < cameraX - pad || amb.x > cameraX + viewW + pad || amb.y < cameraY - pad || amb.y > cameraY + viewH + pad) continue;

      ctx.save();
      ctx.globalAlpha = amb.alpha;
      ctx.translate(amb.x, amb.y);

      if (amb.type === 'bird') {
        const wing = Math.sin(amb.timer * 4) * 5;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-6, wing);
        ctx.lineTo(0, 0);
        ctx.lineTo(6, wing);
        ctx.stroke();
      } else {
        ctx.fillStyle = amb.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, amb.size, amb.size * 0.5, amb.timer, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 2. Render Pedestrians (Cute cartoon walkers with leg animation)
    for (const ped of this.pedestrians) {
      if (ped.x < cameraX - pad || ped.x > cameraX + viewW + pad || ped.y < cameraY - pad || ped.y > cameraY + viewH + pad) continue;

      ctx.save();
      const jumpY = ped.cheerJump || 0;
      ctx.translate(ped.x, ped.y - jumpY);

      // Ground shadow (remains on ground with slight shrink when jumping)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      const shadowScale = Math.max(0.6, 1 - jumpY * 0.03);
      ctx.ellipse(0, 4 + jumpY, 6 * shadowScale, 3 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();

      // Animated legs
      const legOffset = ped.walkCycle * 3;
      ctx.strokeStyle = ped.pantsColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.lineTo(-2, 4 + legOffset);
      ctx.moveTo(2, 0);
      ctx.lineTo(2, 4 - legOffset);
      ctx.stroke();

      // Torso / shirt
      ctx.fillStyle = ped.shirtColor;
      ctx.beginPath();
      ctx.roundRect(-4, -6, 8, 7, 2);
      ctx.fill();

      // Head
      ctx.fillStyle = '#ffdfba';
      ctx.beginPath();
      ctx.arc(0, -9, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // 3. Render Traffic Vehicles (Stylized Sedans, Compacts & Scooters)
    for (const veh of this.traffic) {
      if (veh.x < cameraX - pad || veh.x > cameraX + viewW + pad || veh.y < cameraY - pad || veh.y > cameraY + viewH + pad) continue;

      ctx.save();
      ctx.translate(veh.x, veh.y);
      ctx.rotate(veh.angle + Math.PI / 2);

      // Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
      ctx.beginPath();
      ctx.roundRect(-veh.width / 2 + 3, -veh.length / 2 + 5, veh.width, veh.length, 5);
      ctx.fill();

      if (veh.type === 'scooter') {
        // Scooter body
        ctx.fillStyle = veh.color;
        ctx.beginPath();
        ctx.roundRect(-veh.width / 2, -veh.length / 2, veh.width, veh.length, 3);
        ctx.fill();
        // Rider helmet
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
        ctx.fill();
        // Headlight
        ctx.fillStyle = '#fffae0';
        ctx.fillRect(-2, -veh.length / 2, 4, 2);
      } else {
        // Car chassis
        ctx.fillStyle = veh.color;
        ctx.beginPath();
        ctx.roundRect(-veh.width / 2, -veh.length / 2, veh.width, veh.length, 6);
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Windshield
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.roundRect(-veh.width / 2 + 3, -veh.length / 2 + 8, veh.width - 6, 8, 2);
        ctx.fill();

        // Roof panel
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.roundRect(-veh.width / 2 + 2, -veh.length / 2 + 18, veh.width - 4, veh.length - 24, 3);
        ctx.fill();

        // Headlights & Tail lights
        ctx.fillStyle = '#fffbeb';
        ctx.fillRect(-veh.width / 2 + 2, -veh.length / 2, 5, 2);
        ctx.fillRect(veh.width / 2 - 7, -veh.length / 2, 5, 2);

        ctx.fillStyle = '#ff0055';
        ctx.fillRect(-veh.width / 2 + 2, veh.length / 2 - 2, 5, 2);
        ctx.fillRect(veh.width / 2 - 7, veh.length / 2 - 2, 5, 2);
      }

      ctx.restore();
    }
  }
}
