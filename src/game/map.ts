import { GAME_CONFIG } from './config.ts';
import type { Rect, Point, EnvironmentalProp } from './types.ts';

export type DistrictType = 'RESIDENTIAL' | 'DOWNTOWN' | 'PARK';

export interface RoadBand {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface BuildingTile extends Rect {
  name: string;
  district: DistrictType;
  color: string;
  roofColor: string;
  roofFacetColor: string; // Shaded facet for 2.5D pitched roof
  accentColor: string;
  style: 'residential_gable' | 'residential_hip' | 'commercial_tower' | 'commercial_shop';
  hasChimney?: boolean;
  hasPorch?: boolean;
  hasAwning?: boolean;
  awningColor?: string;
  roofType?: 'helipad' | 'ac' | 'water_tower' | 'solar';
  celebrationTimer?: number;
  celebrationLevel?: 1 | 2 | 3;
  celebrationColor?: string;
}

export interface TreeProp {
  x: number;
  y: number;
  radius: number;
  color: string;
  highlightColor: string;
}

export interface SidewalkSegment {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface TrafficLane {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  angle: number;
}

export interface DeliverySpot extends Point {
  buildingName?: string;
  district?: DistrictType;
}

export class CityMap {
  public width: number = GAME_CONFIG.WORLD_WIDTH;
  public height: number = GAME_CONFIG.WORLD_HEIGHT;

  public buildings: BuildingTile[] = [];
  public trees: TreeProp[] = [];
  public props: EnvironmentalProp[] = [];
  public deliverySpots: DeliverySpot[] = [];
  public sidewalkSegments: SidewalkSegment[] = [];
  public trafficLanes: TrafficLane[] = [];

  // Wide arcade road corridors across 4600 x 3600 world
  public readonly hRoads: { y: number; h: number }[] = [
    { y: 60, h: 220 },    // North ring
    { y: 840, h: 240 },   // Upper crossway
    { y: 1680, h: 260 },  // Grand Central Boulevard
    { y: 2520, h: 240 },  // Lower avenue
    { y: 3320, h: 220 },  // South ring
  ];

  public readonly vRoads: { x: number; w: number }[] = [
    { x: 60, w: 220 },    // West ring
    { x: 1040, w: 240 },  // West-central avenue
    { x: 2180, w: 260 },  // Central Parkway
    { x: 3320, w: 240 },  // East-central avenue
    { x: 4320, w: 220 },  // East ring
  ];

  constructor() {
    this.generateLayout();
    this.setupLivingCityWaypoints();
  }

  private generateLayout(): void {
    const margin = 60;

    // Outer boundary collision barriers
    this.buildings.push({ x: 0, y: 0, w: this.width, h: margin, name: 'NORTH PERIMETER', district: 'RESIDENTIAL', color: '#161920', roofColor: '#101217', roofFacetColor: '#0a0c10', accentColor: '#334155', style: 'commercial_tower' });
    this.buildings.push({ x: 0, y: this.height - margin, w: this.width, h: margin, name: 'SOUTH PERIMETER', district: 'DOWNTOWN', color: '#161920', roofColor: '#101217', roofFacetColor: '#0a0c10', accentColor: '#334155', style: 'commercial_tower' });
    this.buildings.push({ x: 0, y: 0, w: margin, h: this.height, name: 'WEST PERIMETER', district: 'RESIDENTIAL', color: '#161920', roofColor: '#101217', roofFacetColor: '#0a0c10', accentColor: '#334155', style: 'commercial_tower' });
    this.buildings.push({ x: this.width - margin, y: 0, w: margin, h: this.height, name: 'EAST PERIMETER', district: 'PARK', color: '#161920', roofColor: '#101217', roofFacetColor: '#0a0c10', accentColor: '#334155', style: 'commercial_tower' });

    // Block row intervals:
    // Row 0: y = 280 to 840 (h = 560)
    // Row 1: y = 1080 to 1680 (h = 600)
    // Row 2: y = 1940 to 2520 (h = 580)
    // Row 3: y = 2760 to 3320 (h = 560)
    const blockRows = [
      { y: 280, h: 560 },
      { y: 1080, h: 600 },
      { y: 1940, h: 580 },
      { y: 2760, h: 560 },
    ];

    // Block col intervals:
    // Col 0: x = 280 to 1040 (w = 760)
    // Col 1: x = 1280 to 2180 (w = 900)
    // Col 2: x = 2440 to 3320 (w = 880)
    // Col 3: x = 3560 to 4320 (w = 760)
    const blockCols = [
      { x: 280, w: 760 },
      { x: 1280, w: 900 },
      { x: 2440, w: 880 },
      { x: 3560, w: 760 },
    ];

    for (let r = 0; r < blockRows.length; r++) {
      for (let c = 0; c < blockCols.length; c++) {
        const row = blockRows[r];
        const col = blockCols[c];

        // Determine district
        let district: DistrictType = 'DOWNTOWN';
        if (r <= 1 && c <= 1) {
          district = 'RESIDENTIAL';
        } else if (c >= 2 && r <= 1) {
          district = 'PARK';
        }

        this.generateBlockContent(r, c, col.x, row.y, col.w, row.h, district);
      }
    }
  }

  private generateBlockContent(
    r: number,
    c: number,
    bx: number,
    by: number,
    bw: number,
    bh: number,
    district: DistrictType
  ): void {
    const margin = 26; // generous sidewalk buffer
    const innerX = bx + margin;
    const innerY = by + margin;
    const innerW = bw - margin * 2;
    const innerH = bh - margin * 2;

    if (district === 'RESIDENTIAL') {
      // 2.5D Pitched-Roof Suburban Houses with lawns, driveways, mailboxes, and fences
      const houseW = (innerW - 40) / 2;
      const houseH = (innerH - 40) / 2;

      const housePalettes = [
        { name: 'MAPLE COTTAGE', wall: '#e8dcc4', roof: '#b84a39', facet: '#8f3325', accent: '#ffeedd' },
        { name: 'SUNNY VILLA', wall: '#f4e3b2', roof: '#3d5a80', facet: '#293d56', accent: '#ffffff' },
        { name: 'BLUE SPRUCE', wall: '#d8e2dc', roof: '#4a6b58', facet: '#334c3d', accent: '#ffe5d9' },
        { name: 'CEDAR LODGE', wall: '#e0c3a2', roof: '#8c533e', facet: '#6b3d2b', accent: '#faedcd' },
      ];

      for (let hx = 0; hx < 2; hx++) {
        for (let hy = 0; hy < 2; hy++) {
          const pal = housePalettes[(r * 2 + c + hx + hy * 2) % housePalettes.length];
          const px = innerX + hx * (houseW + 40);
          const py = innerY + hy * (houseH + 40);

          this.buildings.push({
            x: px,
            y: py,
            w: houseW,
            h: houseH,
            name: pal.name,
            district: 'RESIDENTIAL',
            color: pal.wall,
            roofColor: pal.roof,
            roofFacetColor: pal.facet,
            accentColor: pal.accent,
            style: (hx + hy) % 2 === 0 ? 'residential_gable' : 'residential_hip',
            hasChimney: true,
            hasPorch: true,
          });

          // Mailbox and lawn props
          this.props.push({ type: 'mailbox', x: px + 12, y: py + houseH + 12 });
          this.trees.push({ x: px + houseW - 14, y: py - 10, radius: 15, color: '#386641', highlightColor: '#6a994e' });
        }
      }

      // Delivery spots along curbs with landmark bindings
      this.deliverySpots.push({ x: bx - 45, y: by + bh * 0.35, buildingName: housePalettes[0].name, district: 'RESIDENTIAL' });
      this.deliverySpots.push({ x: bx - 45, y: by + bh * 0.75, buildingName: housePalettes[1].name, district: 'RESIDENTIAL' });
      this.deliverySpots.push({ x: bx + bw * 0.35, y: by - 45, buildingName: housePalettes[2].name, district: 'RESIDENTIAL' });
      this.deliverySpots.push({ x: bx + bw * 0.75, y: by - 45, buildingName: housePalettes[3].name, district: 'RESIDENTIAL' });
      this.deliverySpots.push({ x: bx + bw + 45, y: by + bh * 0.35, buildingName: housePalettes[0].name, district: 'RESIDENTIAL' });
      this.deliverySpots.push({ x: bx + bw + 45, y: by + bh * 0.75, buildingName: housePalettes[1].name, district: 'RESIDENTIAL' });
      this.deliverySpots.push({ x: bx + bw * 0.35, y: by + bh + 45, buildingName: housePalettes[2].name, district: 'RESIDENTIAL' });
      this.deliverySpots.push({ x: bx + bw * 0.75, y: by + bh + 45, buildingName: housePalettes[3].name, district: 'RESIDENTIAL' });
    } else if (district === 'PARK') {
      // Park & Waterfront District: central lake/fountain, benches, pavilions, lush tree clusters
      const pavW = (innerW - 50) / 2;
      const pavH = innerH * 0.45;

      this.buildings.push({
        x: innerX,
        y: innerY,
        w: pavW,
        h: pavH,
        name: 'PARK BOTANICAL',
        district: 'PARK',
        color: '#2d6a4f',
        roofColor: '#1b4332',
        roofFacetColor: '#081c15',
        accentColor: '#52b788',
        style: 'commercial_shop',
        hasAwning: true,
        awningColor: '#52b788',
        roofType: 'solar',
      });

      this.buildings.push({
        x: innerX + pavW + 50,
        y: innerY + innerH - pavH,
        w: pavW,
        h: pavH,
        name: 'RIVER CAFE',
        district: 'PARK',
        color: '#403d39',
        roofColor: '#252422',
        roofFacetColor: '#181716',
        accentColor: '#eb5e28',
        style: 'commercial_shop',
        hasAwning: true,
        awningColor: '#eb5e28',
      });

      // Central park decorative fountain & benches
      this.props.push({ type: 'fountain', x: innerX + innerW / 2, y: innerY + innerH / 2, w: 90, h: 90 });
      this.props.push({ type: 'bench', x: innerX + innerW / 2 - 60, y: innerY + innerH / 2 + 50, angle: 0 });
      this.props.push({ type: 'bench', x: innerX + innerW / 2 + 60, y: innerY + innerH / 2 + 50, angle: 0 });

      // Grove of lush park trees
      const treeCoords = [
        { x: innerX + 40, y: innerY + innerH - 40 },
        { x: innerX + 90, y: innerY + innerH - 70 },
        { x: innerX + innerW - 50, y: innerY + 40 },
        { x: innerX + innerW - 100, y: innerY + 70 },
      ];
      for (const t of treeCoords) {
        this.trees.push({ x: t.x, y: t.y, radius: 20, color: '#1b4332', highlightColor: '#40916c' });
      }

      this.deliverySpots.push({ x: innerX + innerW * 0.35, y: by - 45, buildingName: 'PARK BOTANICAL', district: 'PARK' });
      this.deliverySpots.push({ x: innerX + innerW * 0.75, y: by - 45, buildingName: 'PARK BOTANICAL', district: 'PARK' });
      this.deliverySpots.push({ x: bx + bw + 45, y: by + bh * 0.35, buildingName: 'RIVER CAFE', district: 'PARK' });
      this.deliverySpots.push({ x: bx + bw + 45, y: by + bh * 0.75, buildingName: 'RIVER CAFE', district: 'PARK' });
      this.deliverySpots.push({ x: innerX + innerW * 0.5, y: by + bh + 45, buildingName: 'RIVER CAFE', district: 'PARK' });
      this.deliverySpots.push({ x: bx - 45, y: by + bh * 0.5, buildingName: 'PARK BOTANICAL', district: 'PARK' });
    } else {
      // Downtown / Commercial District: high-contrast shops & 2.5D skyscrapers
      const shopThemes = [
        { name: 'CYBER RAMEN', wall: '#2b2d42', roof: '#1a1b28', facet: '#0f1018', accent: '#ff0055', awning: '#ff0055', roofType: 'ac' as const },
        { name: 'RETRO ARCADE', wall: '#14213d', roof: '#0c1426', facet: '#060a14', accent: '#00f5d4', awning: '#4361ee', roofType: 'helipad' as const },
        { name: 'PIZZA PLANET', wall: '#6b2d5c', roof: '#4d1e42', facet: '#33122c', accent: '#fca311', awning: '#e63946', roofType: 'water_tower' as const },
        { name: 'TECH TOWER', wall: '#1d3557', roof: '#112238', facet: '#0a1524', accent: '#48cae4', awning: '#0077b6', roofType: 'solar' as const },
      ];

      const halfW = (innerW - 36) / 2;
      for (let i = 0; i < 2; i++) {
        const theme = shopThemes[(r + c + i) % shopThemes.length];
        const sx = innerX + i * (halfW + 36);

        this.buildings.push({
          x: sx,
          y: innerY,
          w: halfW,
          h: innerH,
          name: theme.name,
          district: 'DOWNTOWN',
          color: theme.wall,
          roofColor: theme.roof,
          roofFacetColor: theme.facet,
          accentColor: theme.accent,
          style: 'commercial_tower',
          hasAwning: true,
          awningColor: theme.awning,
          roofType: theme.roofType,
        });

        // Storefront trees
        this.trees.push({ x: sx + halfW - 20, y: innerY + innerH + 12, radius: 16, color: '#2b9348', highlightColor: '#55a630' });
      }

      this.deliverySpots.push({ x: bx - 45, y: by + bh * 0.35, buildingName: shopThemes[0].name, district: 'DOWNTOWN' });
      this.deliverySpots.push({ x: bx - 45, y: by + bh * 0.75, buildingName: shopThemes[1].name, district: 'DOWNTOWN' });
      this.deliverySpots.push({ x: bx + bw + 45, y: by + bh * 0.35, buildingName: shopThemes[2].name, district: 'DOWNTOWN' });
      this.deliverySpots.push({ x: bx + bw + 45, y: by + bh * 0.75, buildingName: shopThemes[3].name, district: 'DOWNTOWN' });
      this.deliverySpots.push({ x: bx + bw * 0.35, y: by - 45, buildingName: shopThemes[0].name, district: 'DOWNTOWN' });
      this.deliverySpots.push({ x: bx + bw * 0.75, y: by - 45, buildingName: shopThemes[1].name, district: 'DOWNTOWN' });
      this.deliverySpots.push({ x: bx + bw * 0.35, y: by + bh + 45, buildingName: shopThemes[2].name, district: 'DOWNTOWN' });
      this.deliverySpots.push({ x: bx + bw * 0.75, y: by + bh + 45, buildingName: shopThemes[3].name, district: 'DOWNTOWN' });
    }
  }

  private setupLivingCityWaypoints(): void {
    let segId = 1;
    // Walkways along sidewalks surrounding blocks
    const margin = 30;
    for (const b of this.buildings) {
      if (b.w > 1000 || b.h > 1000) continue;
      // North sidewalk
      this.sidewalkSegments.push({ id: segId++, startX: b.x - margin, startY: b.y - margin, endX: b.x + b.w + margin, endY: b.y - margin });
      // South sidewalk
      this.sidewalkSegments.push({ id: segId++, startX: b.x - margin, startY: b.y + b.h + margin, endX: b.x + b.w + margin, endY: b.y + b.h + margin });
      // West sidewalk
      this.sidewalkSegments.push({ id: segId++, startX: b.x - margin, startY: b.y - margin, endX: b.x - margin, endY: b.y + b.h + margin });
      // East sidewalk
      this.sidewalkSegments.push({ id: segId++, startX: b.x + b.w + margin, startY: b.y - margin, endX: b.x + b.w + margin, endY: b.y + b.h + margin });
    }

    // Traffic lanes along central axes of roads
    let laneId = 1;
    for (const hr of this.hRoads) {
      // Eastbound lane
      this.trafficLanes.push({ id: laneId++, startX: 100, startY: hr.y + hr.h * 0.3, endX: this.width - 100, endY: hr.y + hr.h * 0.3, angle: 0 });
      // Westbound lane
      this.trafficLanes.push({ id: laneId++, startX: this.width - 100, startY: hr.y + hr.h * 0.7, endX: 100, endY: hr.y + hr.h * 0.7, angle: Math.PI });
    }
    for (const vr of this.vRoads) {
      // Southbound lane
      this.trafficLanes.push({ id: laneId++, startX: vr.x + vr.w * 0.3, startY: 100, endX: vr.x + vr.w * 0.3, endY: this.height - 100, angle: Math.PI / 2 });
      // Northbound lane
      this.trafficLanes.push({ id: laneId++, startX: vr.x + vr.w * 0.7, startY: this.height - 100, endX: vr.x + vr.w * 0.7, endY: 100, angle: -Math.PI / 2 });
    }
  }

  public update(dt: number): void {
    for (const b of this.buildings) {
      if (b.celebrationTimer && b.celebrationTimer > 0) {
        b.celebrationTimer = Math.max(0, b.celebrationTimer - dt);
        if (b.celebrationTimer === 0) {
          b.celebrationLevel = undefined;
          b.celebrationColor = undefined;
        }
      }
    }
  }

  public triggerBuildingCelebration(x: number, y: number, level: 1 | 2 | 3, color: string = '#00f5d4', buildingName?: string): void {
    // 1. Target building directly
    let targetBuilding = buildingName
      ? this.buildings.find(b => b.name === buildingName)
      : null;

    if (!targetBuilding) {
      // Find closest building within 220px
      let minDist = 220;
      for (const b of this.buildings) {
        if (b.w > 2000 || b.h > 2000) continue;
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const dist = Math.hypot(cx - x, cy - y);
        if (dist < minDist) {
          minDist = dist;
          targetBuilding = b;
        }
      }
    }

    if (targetBuilding) {
      targetBuilding.celebrationTimer = level === 3 ? 3.0 : (level === 2 ? 2.2 : 1.6);
      targetBuilding.celebrationLevel = level;
      targetBuilding.celebrationColor = color;
    }

    // 2. If Level 2 or 3, ignite neighboring buildings in the district!
    if (level >= 2) {
      const radius = level === 3 ? 550 : 320;
      for (const b of this.buildings) {
        if (b.w > 2000 || b.h > 2000 || b === targetBuilding) continue;
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const dist = Math.hypot(cx - x, cy - y);
        if (dist <= radius) {
          b.celebrationTimer = (level === 3 ? 2.5 : 1.8) * (1 - dist / (radius * 1.5));
          b.celebrationLevel = level;
          b.celebrationColor = color;
        }
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number, viewW: number, viewH: number): void {
    const C = GAME_CONFIG.COLORS;
    const pad = 120; // viewport culling margin

    // 1. Lush District-Specific Turf
    ctx.fillStyle = C.GROUND_COMMERCIAL;
    ctx.fillRect(cameraX, cameraY, viewW, viewH);

    // Render district grass lawns
    const startGX = Math.max(0, Math.floor((cameraX - pad) / 60) * 60);
    const endGX = Math.min(this.width, Math.ceil((cameraX + viewW + pad) / 60) * 60);
    const startGY = Math.max(0, Math.floor((cameraY - pad) / 60) * 60);
    const endGY = Math.min(this.height, Math.ceil((cameraY + viewH + pad) / 60) * 60);

    for (let gx = startGX; gx < endGX; gx += 60) {
      for (let gy = startGY; gy < endGY; gy += 60) {
        if (gy < 1680 && gx < 2300) {
          ctx.fillStyle = (gx / 60 + gy / 60) % 2 === 0 ? C.GROUND_RESIDENTIAL : '#476e4a';
        } else if (gx >= 2300 && gy < 1800) {
          ctx.fillStyle = (gx / 60 + gy / 60) % 2 === 0 ? C.GROUND_PARK : '#357d5e';
        } else {
          ctx.fillStyle = (gx / 60 + gy / 60) % 2 === 0 ? C.GROUND_COMMERCIAL : '#2b3038';
        }
        ctx.fillRect(gx, gy, 60, 60);
      }
    }

    // 2. Wide Arcade Asphalt Roads
    ctx.fillStyle = C.ROAD;
    for (const hr of this.hRoads) {
      if (hr.y + hr.h >= cameraY - pad && hr.y <= cameraY + viewH + pad) {
        ctx.fillRect(60, hr.y, this.width - 120, hr.h);
      }
    }
    for (const vr of this.vRoads) {
      if (vr.x + vr.w >= cameraX - pad && vr.x <= cameraX + viewW + pad) {
        ctx.fillRect(vr.x, 60, vr.w, this.height - 120);
      }
    }

    // Road Curbs / Borders
    ctx.strokeStyle = C.ROAD_BORDER;
    ctx.lineWidth = 4;
    for (const hr of this.hRoads) {
      if (hr.y + hr.h >= cameraY - pad && hr.y <= cameraY + viewH + pad) {
        ctx.beginPath();
        ctx.moveTo(60, hr.y);
        ctx.lineTo(this.width - 60, hr.y);
        ctx.moveTo(60, hr.y + hr.h);
        ctx.lineTo(this.width - 60, hr.y + hr.h);
        ctx.stroke();
      }
    }
    for (const vr of this.vRoads) {
      if (vr.x + vr.w >= cameraX - pad && vr.x <= cameraX + viewW + pad) {
        ctx.beginPath();
        ctx.moveTo(vr.x, 60);
        ctx.lineTo(vr.x, this.height - 60);
        ctx.moveTo(vr.x + vr.w, 60);
        ctx.lineTo(vr.x + vr.w, this.height - 60);
        ctx.stroke();
      }
    }

    // Dashed Warm Yellow Divider Lines
    ctx.strokeStyle = C.ROAD_MARKING;
    ctx.lineWidth = 5;
    ctx.setLineDash([32, 22]);
    for (const hr of this.hRoads) {
      if (hr.y + hr.h >= cameraY - pad && hr.y <= cameraY + viewH + pad) {
        const centerY = hr.y + hr.h / 2;
        ctx.beginPath();
        ctx.moveTo(70, centerY);
        ctx.lineTo(this.width - 70, centerY);
        ctx.stroke();
      }
    }
    for (const vr of this.vRoads) {
      if (vr.x + vr.w >= cameraX - pad && vr.x <= cameraX + viewW + pad) {
        const centerX = vr.x + vr.w / 2;
        ctx.beginPath();
        ctx.moveTo(centerX, 70);
        ctx.lineTo(centerX, this.height - 70);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // 3. Sidewalk Slabs around buildings
    const sw = 18;
    for (const b of this.buildings) {
      if (b.w > 2000 || b.h > 2000) continue;
      // Viewport culling
      if (b.x + b.w < cameraX - pad || b.x > cameraX + viewW + pad || b.y + b.h < cameraY - pad || b.y > cameraY + viewH + pad) continue;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(b.x - sw + 4, b.y - sw + 4, b.w + sw * 2, b.h + sw * 2);

      ctx.fillStyle = C.SIDEWALK;
      ctx.fillRect(b.x - sw, b.y - sw, b.w + sw * 2, b.h + sw * 2);

      ctx.strokeStyle = C.CURB;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(b.x - sw, b.y - sw, b.w + sw * 2, b.h + sw * 2);
    }

    // 4. Environmental Props (Fountains, Mailboxes, Benches)
    for (const prop of this.props) {
      if (prop.x < cameraX - pad || prop.x > cameraX + viewW + pad || prop.y < cameraY - pad || prop.y > cameraY + viewH + pad) continue;

      if (prop.type === 'fountain') {
        const r = (prop.w || 90) / 2;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(prop.x + 4, prop.y + 6, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#adb5bd';
        ctx.beginPath();
        ctx.arc(prop.x, prop.y, r, 0, Math.PI * 2);
        ctx.fill();

        // Water basin
        ctx.fillStyle = '#00b4d8';
        ctx.beginPath();
        ctx.arc(prop.x, prop.y, r - 8, 0, Math.PI * 2);
        ctx.fill();

        // Water shimmer ring
        const wave = Math.sin(Date.now() * 0.005) * 4;
        ctx.strokeStyle = '#caf0f8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(prop.x, prop.y, r - 18 + wave, 0, Math.PI * 2);
        ctx.stroke();
      } else if (prop.type === 'mailbox') {
        ctx.fillStyle = '#1e3d59';
        ctx.fillRect(prop.x, prop.y, 6, 8);
        ctx.fillStyle = '#ff6e40';
        ctx.beginPath();
        ctx.roundRect(prop.x - 2, prop.y - 6, 10, 7, 2);
        ctx.fill();
      } else if (prop.type === 'bench') {
        ctx.fillStyle = '#4a3b32';
        ctx.fillRect(prop.x - 12, prop.y - 4, 24, 8);
        ctx.strokeStyle = '#252422';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(prop.x - 12, prop.y - 4, 24, 8);
      }
    }

    // 5. Convincing 2.5D Buildings (Houses & Commercial Towers)
    for (const b of this.buildings) {
      if (b.w > 2000 || b.h > 2000) continue;
      if (b.x + b.w < cameraX - pad || b.x > cameraX + viewW + pad || b.y + b.h < cameraY - pad || b.y > cameraY + viewH + pad) continue;

      // Deep 2.5D Directional Shadow
      ctx.fillStyle = C.BUILDING_SHADOW;
      ctx.beginPath();
      ctx.roundRect(b.x + 8, b.y + 16, b.w, b.h, 6);
      ctx.fill();

      // Main Wall Structure
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 6);
      ctx.fill();

      if (b.style === 'residential_gable') {
        // Residential Pitched Gable Roof with 2 visible roof planes
        const ridgeY = b.y + b.h * 0.45;

        // North roof plane (illuminated)
        ctx.fillStyle = b.roofColor;
        ctx.beginPath();
        ctx.moveTo(b.x + 6, b.y + 6);
        ctx.lineTo(b.x + b.w - 6, b.y + 6);
        ctx.lineTo(b.x + b.w - 6, ridgeY);
        ctx.lineTo(b.x + 6, ridgeY);
        ctx.closePath();
        ctx.fill();

        // South roof plane (shaded facet)
        ctx.fillStyle = b.roofFacetColor;
        ctx.beginPath();
        ctx.moveTo(b.x + 6, ridgeY);
        ctx.lineTo(b.x + b.w - 6, ridgeY);
        ctx.lineTo(b.x + b.w - 6, b.y + b.h - 6);
        ctx.lineTo(b.x + 6, b.y + b.h - 6);
        ctx.closePath();
        ctx.fill();

        // White roof ridge highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x + 6, ridgeY);
        ctx.lineTo(b.x + b.w - 6, ridgeY);
        ctx.stroke();

        // Chimney with soft puff
        if (b.hasChimney) {
          ctx.fillStyle = '#7f4f24';
          ctx.fillRect(b.x + 18, b.y + 12, 12, 12);
          ctx.fillStyle = '#936639';
          ctx.fillRect(b.x + 16, b.y + 10, 16, 4);
        }

        // Front porch door
        ctx.fillStyle = '#6c584c';
        ctx.fillRect(b.x + b.w / 2 - 8, b.y + b.h - 14, 16, 12);
        ctx.fillStyle = '#faedcd';
        ctx.beginPath();
        ctx.roundRect(b.x + b.w / 2 - 12, b.y + b.h - 4, 24, 6, 2);
        ctx.fill();
      } else if (b.style === 'residential_hip') {
        // Residential Hip Roof (Pyramidal 4 facets)
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;

        // North facet
        ctx.fillStyle = b.roofColor;
        ctx.beginPath();
        ctx.moveTo(b.x + 6, b.y + 6);
        ctx.lineTo(b.x + b.w - 6, b.y + 6);
        ctx.lineTo(cx, cy);
        ctx.closePath();
        ctx.fill();

        // South facet (darker)
        ctx.fillStyle = b.roofFacetColor;
        ctx.beginPath();
        ctx.moveTo(b.x + 6, b.y + b.h - 6);
        ctx.lineTo(b.x + b.w - 6, b.y + b.h - 6);
        ctx.lineTo(cx, cy);
        ctx.closePath();
        ctx.fill();

        // West/East facets
        ctx.fillStyle = b.roofColor;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(b.x + 6, b.y + 6);
        ctx.lineTo(b.x + 6, b.y + b.h - 6);
        ctx.lineTo(cx, cy);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1.0;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(b.x + 6, b.y + 6);
        ctx.lineTo(cx, cy);
        ctx.lineTo(b.x + b.w - 6, b.y + 6);
        ctx.moveTo(b.x + 6, b.y + b.h - 6);
        ctx.lineTo(cx, cy);
        ctx.lineTo(b.x + b.w - 6, b.y + b.h - 6);
        ctx.stroke();
      } else {
        // Commercial Flat Roof Tower with Rooftop Units
        const inset = 8;
        ctx.fillStyle = b.roofColor;
        ctx.beginPath();
        ctx.roundRect(b.x + inset, b.y + inset, b.w - inset * 2, b.h - inset * 2, 4);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x + inset, b.y + inset, b.w - inset * 2, b.h - inset * 2);

        // Striped storefront awning
        if (b.hasAwning) {
          const awningH = 14;
          const awningY = b.y + b.h - 4;
          const stripeW = 12;
          for (let ax = b.x + 12; ax < b.x + b.w - 12; ax += stripeW * 2) {
            ctx.fillStyle = b.awningColor || '#ff3366';
            ctx.fillRect(ax, awningY, stripeW, awningH);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(ax + stripeW, awningY, stripeW, awningH);
          }
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.fillRect(b.x + 12, awningY + awningH, b.w - 24, 4);
        }

        // Rooftop features
        if (b.roofType === 'helipad') {
          const centerX = b.x + b.w / 2;
          const centerY = b.y + b.h / 2;
          ctx.strokeStyle = b.accentColor;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(centerX, centerY, 28, 0, Math.PI * 2);
          ctx.stroke();
          ctx.font = '900 20px "Fredoka", sans-serif';
          ctx.fillStyle = b.accentColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('H', centerX, centerY);
        } else if (b.roofType === 'water_tower') {
          const tx = b.x + b.w - 38;
          const ty = b.y + 38;
          ctx.fillStyle = '#b07d62';
          ctx.beginPath();
          ctx.arc(tx, ty, 18, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#d4a373';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (b.roofType === 'solar') {
          const px = b.x + 22;
          const py = b.y + 22;
          ctx.fillStyle = '#1d3557';
          ctx.fillRect(px, py, 48, 32);
          ctx.strokeStyle = '#457b9d';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px, py, 48, 32);
        } else {
          ctx.fillStyle = '#181e2b';
          ctx.fillRect(b.x + 22, b.y + 22, 34, 24);
          ctx.fillStyle = '#334155';
          ctx.fillRect(b.x + 26, b.y + 26, 26, 16);
        }

        // Storefront Signboard
        const signW = Math.min(b.w - 28, 170);
        const signH = 24;
        const signX = b.x + (b.w - signW) / 2;
        const signY = b.y + b.h / 2 - (b.roofType === 'helipad' ? 45 : 0);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.beginPath();
        ctx.roundRect(signX, signY, signW, signH, 6);
        ctx.fill();
        ctx.strokeStyle = b.accentColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = '800 11px "Outfit", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.name, signX + signW / 2, signY + signH / 2);
      }

      // --- CHAOS CHAIN: BUILDING CELEBRATION REACTIONS ---
      if (b.celebrationTimer && b.celebrationTimer > 0) {
        const lvl = b.celebrationLevel || 1;
        const color = b.celebrationColor || '#00f5d4';
        const pulse = Math.sin(Date.now() * 0.015) * 0.5 + 0.5;

        ctx.save();
        // Glowing Neon Aura around the building
        ctx.shadowColor = color;
        ctx.shadowBlur = lvl === 3 ? 35 : (lvl === 2 ? 22 : 12);
        ctx.strokeStyle = color;
        ctx.lineWidth = lvl === 3 ? 6 : (lvl === 2 ? 4 : 3);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.shadowBlur = 0;

        // Illuminated party windows & beacon
        if (lvl >= 2) {
          // Party roof bunting / party flags
          const flagCount = Math.floor(b.w / 24);
          for (let f = 0; f < flagCount; f++) {
            const fx = b.x + 8 + f * 24;
            const fy = b.y - 2;
            const flagColor = (f % 3 === 0) ? '#fee440' : (f % 3 === 1 ? '#ff0055' : '#00f5d4');
            ctx.fillStyle = flagColor;
            ctx.beginPath();
            ctx.moveTo(fx, fy);
            ctx.lineTo(fx + 12, fy);
            ctx.lineTo(fx + 6, fy + 12 + Math.sin(Date.now() * 0.008 + f) * 3);
            ctx.closePath();
            ctx.fill();
          }

          // Shimmering illuminated storefront windows
          ctx.fillStyle = `rgba(254, 228, 64, ${0.4 + pulse * 0.4})`;
          ctx.fillRect(b.x + 14, b.y + b.h - 18, b.w - 28, 12);
        }

        // Level 3 City Goes Wild: Party light beams & floating star beacon
        if (lvl === 3) {
          const cx = b.x + b.w / 2;
          const cy = b.y + b.h / 2;
          const beamAngle = Date.now() * 0.003;
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 + pulse * 0.35})`;
          ctx.lineWidth = 2.5;
          for (let a = 0; a < 4; a++) {
            const rot = beamAngle + (a * Math.PI) / 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(rot) * (b.w * 0.8), cy + Math.sin(rot) * (b.h * 0.8));
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }

    // 6. Layered Foliage Trees
    for (const tree of this.trees) {
      if (tree.x < cameraX - pad || tree.x > cameraX + viewW + pad || tree.y < cameraY - pad || tree.y > cameraY + viewH + pad) continue;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(tree.x + 4, tree.y + 6, tree.radius * 1.1, tree.radius * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = tree.color;
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, tree.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = tree.highlightColor;
      ctx.beginPath();
      ctx.arc(tree.x - tree.radius * 0.25, tree.y - tree.radius * 0.25, tree.radius * 0.65, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.arc(tree.x - tree.radius * 0.35, tree.y - tree.radius * 0.35, tree.radius * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
