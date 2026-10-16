import * as THREE from 'three';
import { GAME_CONFIG } from '../game/config.ts';
import { DeliveryVan } from '../game/car.ts';
import { InputHandler } from '../game/input.ts';
import { PackageManager, PackageResolution } from '../game/package.ts';
import { DeliveryTarget, Point } from '../game/types.ts';
import { SoundFx } from '../game/audio.ts';
import { EffectsManager } from '../game/effects.ts';

// --- CONFIG & CONSTANTS ---
const INTERSECTION_CENTER: Point = { x: 2300, y: 1800 };

class ThreeJsVisualSpike {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;

  // Cameras
  private orthoCamera: THREE.OrthographicCamera;
  private perspCamera: THREE.PerspectiveCamera;
  private topCamera: THREE.OrthographicCamera;
  private activeCamera: THREE.Camera;
  private cameraMode: 'ortho' | 'persp' | 'top' = 'ortho';

  // Game Logic Reused Directly
  private van: DeliveryVan;
  private input: InputHandler;
  private packages: PackageManager;
  private sound: SoundFx;
  private effects: EffectsManager;

  // 3D Visual Meshes & Entities
  private vanGroup: THREE.Group = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private targetGroup: THREE.Group = new THREE.Group();
  private trajectoryLine: THREE.Line;
  private landingReticle: THREE.Group = new THREE.Group();
  private active3DPackages: Map<number, THREE.Mesh> = new Map();

  // Representative Target in the intersection corridor
  private targetData: DeliveryTarget;

  // Performance Tracking
  private frameCount: number = 0;
  private lastFpsTime: number = performance.now();
  private currentFps: number = 60;
  private lastTime: number = performance.now();

  // HTML UI Elements
  private fpsElem: HTMLElement;
  private drawsElem: HTMLElement;
  private trisElem: HTMLElement;
  private geomElem: HTMLElement;
  private speedElem: HTMLElement;
  private lockElem: HTMLElement;

  constructor() {
    const canvas = document.getElementById('three-canvas') as HTMLCanvasElement;
    if (!canvas) throw new Error('Could not find #three-canvas');
    this.canvas = canvas;

    this.fpsElem = document.getElementById('val-fps')!;
    this.drawsElem = document.getElementById('val-draws')!;
    this.trisElem = document.getElementById('val-tris')!;
    this.geomElem = document.getElementById('val-geom')!;
    this.speedElem = document.getElementById('val-speed')!;
    this.lockElem = document.getElementById('val-lock')!;

    // 1. WebGL Renderer with High-Performance Settings & Soft Shadows
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(1280, 720);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // 2. Scene with Warm Atmospheric Sky
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#151922');
    this.scene.fog = new THREE.FogExp2('#151922', 0.00075);

    // 3. Cameras
    const aspect = 1280 / 720;
    const viewSize = 580; // Frustum vertical size in world units

    // A. Orthographic 45° Isometric Camera (Art of Rally / Monument Valley style)
    this.orthoCamera = new THREE.OrthographicCamera(
      (-viewSize * aspect) / 2,
      (viewSize * aspect) / 2,
      viewSize / 2,
      -viewSize / 2,
      1,
      3000
    );
    this.orthoCamera.position.set(INTERSECTION_CENTER.x + 420, 520, INTERSECTION_CENTER.y + 420);
    this.orthoCamera.lookAt(INTERSECTION_CENTER.x, 0, INTERSECTION_CENTER.y);

    // B. Perspective 45° Camera
    this.perspCamera = new THREE.PerspectiveCamera(45, aspect, 10, 3500);
    this.perspCamera.position.set(INTERSECTION_CENTER.x + 480, 560, INTERSECTION_CENTER.y + 480);
    this.perspCamera.lookAt(INTERSECTION_CENTER.x, 0, INTERSECTION_CENTER.y);

    // C. Top-Down 90° Orthographic (Canvas equivalent)
    this.topCamera = new THREE.OrthographicCamera(
      (-viewSize * aspect) / 2,
      (viewSize * aspect) / 2,
      viewSize / 2,
      -viewSize / 2,
      1,
      3000
    );
    this.topCamera.position.set(INTERSECTION_CENTER.x, 700, INTERSECTION_CENTER.y);
    this.topCamera.lookAt(INTERSECTION_CENTER.x, 0, INTERSECTION_CENTER.y);
    this.topCamera.up.set(0, 0, -1);

    this.activeCamera = this.orthoCamera;

    // 4. Initialize Core Simulation
    this.van = new DeliveryVan(INTERSECTION_CENTER.x, INTERSECTION_CENTER.y);
    this.input = new InputHandler();
    this.packages = new PackageManager();
    this.sound = new SoundFx();
    this.effects = new EffectsManager();

    // Representative target in corridor: 'SUNNY VILLA' at (2225, 1530)
    this.targetData = {
      id: 'target-spike',
      name: '🍕 SUNNY VILLA',
      type: 'PIZZA',
      district: 'RESIDENTIAL',
      x: 2225,
      y: 1530,
      radius: GAME_CONFIG.TARGETS.ZONE_RADIUS,
      active: true,
      color: '#ff5400',
      icon: '🍕',
      customerHappyTimer: 0,
    };

    // 5. Build 3D World Geometry
    this.setupLighting();
    this.buildIntersectionEnvironment();
    this.buildVan3D();
    this.buildTarget3D();
    this.buildAimingReticle3D();

    // Trajectory Line
    const lineGeo = new THREE.BufferGeometry();
    const lineMat = new THREE.LineDashedMaterial({
      color: 0x00f5d4,
      dashSize: 8,
      gapSize: 6,
      linewidth: 3,
    });
    this.trajectoryLine = new THREE.Line(lineGeo, lineMat);
    this.trajectoryLine.frustumCulled = false;
    this.scene.add(this.trajectoryLine);

    this.setupEventListeners();
  }

  private setupLighting(): void {
    // 1. Ambient / Hemisphere Light (soft sky bounce)
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.7);
    this.scene.add(hemiLight);

    // 2. Key Sun Directional Light casting crisp soft shadows
    const sunLight = new THREE.DirectionalLight(0xfff7ed, 1.35);
    sunLight.position.set(INTERSECTION_CENTER.x + 360, 650, INTERSECTION_CENTER.y + 280);
    sunLight.target.position.set(INTERSECTION_CENTER.x, 0, INTERSECTION_CENTER.y);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 100;
    sunLight.shadow.camera.far = 1400;

    const d = 520;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.radius = 2.5;

    this.scene.add(sunLight);
    this.scene.add(sunLight.target);

    // 3. Warm Ambient Streetlight accent
    const streetLight = new THREE.PointLight(0xfef08a, 1.2, 280, 1.2);
    streetLight.position.set(2210, 65, 1660);
    this.scene.add(streetLight);
  }

  private buildIntersectionEnvironment(): void {
    // 1. Asphalt Road Network
    // Grand Central Boulevard: Y in 2D = 1680 to 1940 (height 260) -> Z in 3D
    // Central Parkway: X in 2D = 2180 to 2440 (width 260) -> X in 3D
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x242833,
      roughness: 0.85,
      metalness: 0.05,
    });

    const groundSpan = 1400;
    const baseGroundGeo = new THREE.PlaneGeometry(groundSpan, groundSpan);
    const baseGround = new THREE.Mesh(baseGroundGeo, roadMat);
    baseGround.rotation.x = -Math.PI / 2;
    baseGround.position.set(INTERSECTION_CENTER.x, 0, INTERSECTION_CENTER.y);
    baseGround.receiveShadow = true;
    this.scene.add(baseGround);

    // 2. Road Markings (Yellow double centerlines + White crosswalks)
    this.addRoadMarkings();

    // 3. Four Corner Raised Sidewalks with Beveled Stone Curbs
    this.addCornerBlock(2280 - 450, 1780 - 400, 380, 320, 'RESIDENTIAL'); // Top-Left: Suburban Cottage
    this.addCornerBlock(2320 + 70, 1780 - 400, 380, 320, 'PARK');        // Top-Right: Park Pavilion & Lake
    this.addCornerBlock(2280 - 450, 1820 + 80, 380, 320, 'DOWNTOWN');    // Bottom-Left: Cyber Ramen & Pizza
    this.addCornerBlock(2320 + 70, 1820 + 80, 380, 320, 'COMMERCIAL');  // Bottom-Right: Retro Arcade & Tech
  }

  private addRoadMarkings(): void {
    const yellowMat = new THREE.MeshBasicMaterial({ color: 0xffc83b });
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });

    // Double yellow lines on Central Parkway (Vertical in 2D, along Z in 3D)
    for (let offset of [-3, 3]) {
      const lineGeo = new THREE.PlaneGeometry(3, 480);
      const lineMesh = new THREE.Mesh(lineGeo, yellowMat);
      lineMesh.rotation.x = -Math.PI / 2;
      lineMesh.position.set(2300 + offset, 0.4, 1480);
      this.scene.add(lineMesh);

      const lineMeshSouth = new THREE.Mesh(lineGeo, yellowMat);
      lineMeshSouth.rotation.x = -Math.PI / 2;
      lineMeshSouth.position.set(2300 + offset, 0.4, 2120);
      this.scene.add(lineMeshSouth);
    }

    // Double yellow lines on Grand Central Boulevard (Horizontal in 2D, along X in 3D)
    for (let offset of [-3, 3]) {
      const lineGeo = new THREE.PlaneGeometry(480, 3);
      const lineMesh = new THREE.Mesh(lineGeo, yellowMat);
      lineMesh.rotation.x = -Math.PI / 2;
      lineMesh.position.set(1980, 0.4, 1800 + offset);
      this.scene.add(lineMesh);

      const lineMeshEast = new THREE.Mesh(lineGeo, yellowMat);
      lineMeshEast.rotation.x = -Math.PI / 2;
      lineMeshEast.position.set(2620, 0.4, 1800 + offset);
      this.scene.add(lineMeshEast);
    }

    // White Zebra Crosswalk stripes at intersection corners
    for (let i = 0; i < 6; i++) {
      const stripeGeo = new THREE.PlaneGeometry(12, 38);
      const stripe = new THREE.Mesh(stripeGeo, whiteMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(2210 + i * 18, 0.45, 1670);
      this.scene.add(stripe);

      const stripeSouth = stripe.clone();
      stripeSouth.position.set(2210 + i * 18, 0.45, 1930);
      this.scene.add(stripeSouth);
    }
  }

  private addCornerBlock(bx: number, bz: number, bw: number, bh: number, type: string): void {
    // 1. Raised Sidewalk Base
    const curbHeight = 4.5;
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.8 });

    // Curb edge
    const curbGeo = new THREE.BoxGeometry(bw, curbHeight, bh);
    const curbMesh = new THREE.Mesh(curbGeo, curbMat);
    curbMesh.position.set(bx + bw / 2, curbHeight / 2, bz + bh / 2);
    curbMesh.receiveShadow = true;
    curbMesh.castShadow = true;
    this.scene.add(curbMesh);

    // Inner grass turf lawn
    const grassColor = type === 'PARK' ? 0x2d6a4f : (type === 'RESIDENTIAL' ? 0x406343 : 0x334155);
    const grassMat = new THREE.MeshStandardMaterial({ color: grassColor, roughness: 0.9 });
    const grassGeo = new THREE.BoxGeometry(bw - 30, 2.5, bh - 30);
    const grassMesh = new THREE.Mesh(grassGeo, grassMat);
    grassMesh.position.set(bx + bw / 2, curbHeight + 1.25, bz + bh / 2);
    grassMesh.receiveShadow = true;
    this.scene.add(grassMesh);

    // 2. Architectural Building
    if (type === 'RESIDENTIAL') {
      this.buildSuburbanCottage(bx + 40, bz + 40, bw - 80, bh - 80);
    } else if (type === 'PARK') {
      this.buildParkPavilionAndTrees(bx + 30, bz + 30, bw - 60, bh - 60);
    } else if (type === 'DOWNTOWN') {
      this.buildDowntownShop(bx + 35, bz + 35, bw - 70, bh - 70, 'PIZZA PLANET', 0xff5400, 0xef4444);
    } else {
      this.buildDowntownShop(bx + 35, bz + 35, bw - 70, bh - 70, 'RETRO ARCADE', 0x00f5d4, 0x3b82f6);
    }

    // 3. Streetlights at Sidewalk Corners
    this.addStreetlight(bx + bw - 15, curbHeight, bz + bh - 15);
  }

  private buildSuburbanCottage(x: number, z: number, w: number, d: number): void {
    const group = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf4e3b2, roughness: 0.7 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xb84a39, roughness: 0.65 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, metalness: 0.4 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.8 });

    const wallHeight = 48;
    const bodyGeo = new THREE.BoxGeometry(w, wallHeight, d);
    const bodyMesh = new THREE.Mesh(bodyGeo, wallMat);
    bodyMesh.position.set(w / 2, wallHeight / 2 + 5, d / 2);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);

    // Pitched Gable Roof with overhang
    const roofHeight = 36;
    const roofGeo = new THREE.ConeGeometry(w * 0.72, roofHeight, 4);
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.rotation.y = Math.PI / 4;
    roofMesh.position.set(w / 2, wallHeight + roofHeight / 2 + 4, d / 2);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    group.add(roofMesh);

    // Front Porch & Entrance Door
    const doorGeo = new THREE.BoxGeometry(14, 24, 2);
    const doorMesh = new THREE.Mesh(doorGeo, doorMat);
    doorMesh.position.set(w / 2, 16, d + 1);
    group.add(doorMesh);

    // Windows with dimensional frames
    for (let offset of [-w * 0.28, w * 0.28]) {
      const winFrameGeo = new THREE.BoxGeometry(18, 18, 3);
      const winFrame = new THREE.Mesh(winFrameGeo, trimMat);
      winFrame.position.set(w / 2 + offset, 24, d + 1.5);
      winFrame.castShadow = true;
      group.add(winFrame);

      const winGlassGeo = new THREE.BoxGeometry(14, 14, 3.5);
      const winGlass = new THREE.Mesh(winGlassGeo, glassMat);
      winGlass.position.set(w / 2 + offset, 24, d + 1.5);
      group.add(winGlass);
    }

    // Brick Chimney
    const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.9 });
    const chimneyGeo = new THREE.BoxGeometry(12, 42, 12);
    const chimney = new THREE.Mesh(chimneyGeo, chimneyMat);
    chimney.position.set(w * 0.78, wallHeight + 20, d * 0.35);
    chimney.castShadow = true;
    group.add(chimney);

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  private buildDowntownShop(x: number, z: number, w: number, d: number, _name: string, signColor: number, awningColor: number): void {
    const group = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x242d3d, roughness: 0.65 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.15, metalness: 0.7 });
    const awningMat = new THREE.MeshStandardMaterial({ color: awningColor, roughness: 0.8 });
    const signMat = new THREE.MeshStandardMaterial({ color: signColor, emissive: signColor, emissiveIntensity: 0.45 });

    // Main Storefront Building Tower (2.5 storeys)
    const towerH = 75;
    const towerGeo = new THREE.BoxGeometry(w, towerH, d);
    const tower = new THREE.Mesh(towerGeo, wallMat);
    tower.position.set(w / 2, towerH / 2 + 5, d / 2);
    tower.castShadow = true;
    tower.receiveShadow = true;
    group.add(tower);

    // Large Commercial Glass Display Windows
    const displayH = 28;
    const displayGeo = new THREE.BoxGeometry(w * 0.85, displayH, 4);
    const display = new THREE.Mesh(displayGeo, glassMat);
    display.position.set(w / 2, displayH / 2 + 7, d + 1);
    group.add(display);

    // Protruding Fabric Store Awning
    const awningGeo = new THREE.BoxGeometry(w * 0.92, 4, 20);
    const awning = new THREE.Mesh(awningGeo, awningMat);
    awning.rotation.x = 0.22;
    awning.position.set(w / 2, displayH + 9, d + 8);
    awning.castShadow = true;
    group.add(awning);

    // Illuminated 3D Store Sign Board
    const signBoardGeo = new THREE.BoxGeometry(w * 0.75, 12, 4);
    const signBoard = new THREE.Mesh(signBoardGeo, signMat);
    signBoard.position.set(w / 2, displayH + 22, d + 2);
    group.add(signBoard);

    // Rooftop AC Unit & Water Tank
    const acGeo = new THREE.BoxGeometry(16, 12, 16);
    const acMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5 });
    const ac = new THREE.Mesh(acGeo, acMat);
    ac.position.set(w * 0.3, towerH + 11, d * 0.4);
    ac.castShadow = true;
    group.add(ac);

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  private buildParkPavilionAndTrees(x: number, z: number, w: number, d: number): void {
    const group = new THREE.Group();

    // Central Fountain Basin
    const fountainMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6 });
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.8 });

    const basinGeo = new THREE.CylinderGeometry(28, 28, 6, 12);
    const basin = new THREE.Mesh(basinGeo, fountainMat);
    basin.position.set(w / 2, 7, d / 2);
    basin.castShadow = true;
    basin.receiveShadow = true;
    group.add(basin);

    const waterGeo = new THREE.CylinderGeometry(24, 24, 6.5, 12);
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(w / 2, 7.5, d / 2);
    group.add(water);

    // Stylized Low-Poly Park Trees
    this.addStylizedTree(group, 45, 45);
    this.addStylizedTree(group, w - 45, 45);
    this.addStylizedTree(group, 50, d - 45);
    this.addStylizedTree(group, w - 50, d - 45);

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  private addStylizedTree(parent: THREE.Group, x: number, z: number): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.7, flatShading: true });

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(3.5, 5.5, 26, 6);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 17, z);
    trunk.castShadow = true;
    parent.add(trunk);

    // Layered Foliage Clusters (Icosahedral geometric leaves)
    for (let i = 0; i < 3; i++) {
      const r = 18 - i * 3.5;
      const leafGeo = new THREE.IcosahedronGeometry(r, 0);
      const leaf = new THREE.Mesh(leafGeo, leavesMat);
      leaf.position.set(x, 30 + i * 11, z);
      leaf.castShadow = true;
      parent.add(leaf);
    }
  }

  private addStreetlight(x: number, y: number, z: number): void {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.8 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

    const poleGeo = new THREE.CylinderGeometry(1.5, 2, 55, 6);
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, y + 27.5, z);
    pole.castShadow = true;
    this.scene.add(pole);

    const headGeo = new THREE.BoxGeometry(6, 4, 10);
    const head = new THREE.Mesh(headGeo, lampMat);
    head.position.set(x, y + 54, z + 4);
    this.scene.add(head);
  }

  private buildVan3D(): void {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xfffae8, roughness: 0.5 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xff3366, roughness: 0.45 });
    const bumperMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.1, metalness: 0.85 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.9 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });

    const vanW = GAME_CONFIG.VAN.WIDTH;  // 34
    const vanL = GAME_CONFIG.VAN.HEIGHT; // 64
    const vanH = 32;

    // 1. Lower Chassis & Bumpers
    const chassisGeo = new THREE.BoxGeometry(vanW, 8, vanL + 6);
    const chassis = new THREE.Mesh(chassisGeo, bumperMat);
    chassis.position.set(0, 9, 0);
    chassis.castShadow = true;
    this.vanGroup.add(chassis);

    // 2. Main Van Cabin Body
    const bodyGeo = new THREE.BoxGeometry(vanW - 2, vanH, vanL - 6);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, vanH / 2 + 8, -1);
    body.castShadow = true;
    body.receiveShadow = true;
    this.vanGroup.add(body);

    // 3. Signature Accent Roof
    const roofGeo = new THREE.BoxGeometry(vanW - 1, 5, vanL - 4);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, vanH + 9, -1);
    roof.castShadow = true;
    this.vanGroup.add(roof);

    // 4. Windshield & Windows
    const windshieldGeo = new THREE.BoxGeometry(vanW - 4, 12, 3);
    const windshield = new THREE.Mesh(windshieldGeo, glassMat);
    windshield.position.set(0, vanH - 4, -vanL / 2 + 1);
    this.vanGroup.add(windshield);

    // Side windows
    for (let side of [-vanW / 2 + 1, vanW / 2 - 1]) {
      const sideWinGeo = new THREE.BoxGeometry(2, 10, 20);
      const sideWin = new THREE.Mesh(sideWinGeo, glassMat);
      sideWin.position.set(side, vanH - 4, -vanL / 4);
      this.vanGroup.add(sideWin);
    }

    // 5. Headlights
    for (let offset of [-vanW * 0.32, vanW * 0.32]) {
      const lightGeo = new THREE.BoxGeometry(6, 5, 2);
      const light = new THREE.Mesh(lightGeo, lightMat);
      light.position.set(offset, 13, -vanL / 2 - 2);
      this.vanGroup.add(light);
    }

    // 6. Wheels (4 functional spinning wheels)
    const wheelR = 7;
    const wheelThickness = 4.5;
    const wheelPositions = [
      [-vanW / 2 - 2, 7, -vanL * 0.28], // Front-Left
      [vanW / 2 + 2, 7, -vanL * 0.28],  // Front-Right
      [-vanW / 2 - 2, 7, vanL * 0.28],  // Rear-Left
      [vanW / 2 + 2, 7, vanL * 0.28],   // Rear-Right
    ];

    for (const [wx, wy, wz] of wheelPositions) {
      const wGroup = new THREE.Group();
      wGroup.position.set(wx, wy, wz);

      const tireGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelThickness, 12);
      const tire = new THREE.Mesh(tireGeo, wheelMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wGroup.add(tire);

      const rimGeo = new THREE.CylinderGeometry(3.5, 3.5, wheelThickness + 0.4, 8);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;
      wGroup.add(rim);

      this.vanGroup.add(wGroup);
      this.wheels.push(tire);
    }

    this.vanGroup.position.set(this.van.x, 0, this.van.y);
    this.scene.add(this.vanGroup);
  }

  private buildTarget3D(): void {
    const t = this.targetData;
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff5400, wireframe: false, transparent: true, opacity: 0.6 });
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xff5400, transparent: true, opacity: 0.25 });

    // Ground Decal Cylinder
    const baseCylGeo = new THREE.CylinderGeometry(t.radius, t.radius, 1.5, 24);
    const baseCyl = new THREE.Mesh(baseCylGeo, innerMat);
    baseCyl.position.set(0, 0.75, 0);
    this.targetGroup.add(baseCyl);

    // Glowing Ring Edge
    const ringGeo = new THREE.RingGeometry(t.radius - 4, t.radius, 24);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 1.6, 0);
    this.targetGroup.add(ring);

    // Floating 3D Diamond Beacon
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xff5400,
      emissive: 0xff5400,
      emissiveIntensity: 0.6,
      roughness: 0.3,
    });
    const beaconGeo = new THREE.OctahedronGeometry(14, 0);
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 48, 0);
    beacon.castShadow = true;
    this.targetGroup.add(beacon);

    this.targetGroup.position.set(t.x, 0, t.y);
    this.scene.add(this.targetGroup);
  }

  private buildAimingReticle3D(): void {
    const mat = new THREE.MeshBasicMaterial({ color: 0x00f5d4, transparent: true, opacity: 0.8 });

    // Reticle Center Bullseye
    const centerGeo = new THREE.RingGeometry(14, 18, 16);
    const centerRing = new THREE.Mesh(centerGeo, mat);
    centerRing.rotation.x = -Math.PI / 2;
    centerRing.position.set(0, 1.8, 0);
    this.landingReticle.add(centerRing);

    // Reticle Corner Brackets
    const bracketMat = new THREE.LineBasicMaterial({ color: 0x00f5d4, linewidth: 2 });
    const bracketSize = 10;
    const bOffset = 24;

    const corners = [
      [-bOffset, -bOffset, 1, 1],
      [bOffset, -bOffset, -1, 1],
      [-bOffset, bOffset, 1, -1],
      [bOffset, bOffset, -1, -1],
    ];

    for (const [cx, cz, dx, dz] of corners) {
      const bPoints = [
        new THREE.Vector3(cx, 2.0, cz + dz * bracketSize),
        new THREE.Vector3(cx, 2.0, cz),
        new THREE.Vector3(cx + dx * bracketSize, 2.0, cz),
      ];
      const bGeo = new THREE.BufferGeometry().setFromPoints(bPoints);
      const bLine = new THREE.Line(bGeo, bracketMat);
      this.landingReticle.add(bLine);
    }

    this.landingReticle.visible = false;
    this.scene.add(this.landingReticle);
  }

  private setupEventListeners(): void {
    document.getElementById('btn-cam-ortho')?.addEventListener('click', () => {
      this.activeCamera = this.orthoCamera;
      this.cameraMode = 'ortho';
    });

    document.getElementById('btn-cam-persp')?.addEventListener('click', () => {
      this.activeCamera = this.perspCamera;
      this.cameraMode = 'persp';
    });

    document.getElementById('btn-cam-top')?.addEventListener('click', () => {
      this.activeCamera = this.topCamera;
      this.cameraMode = 'top';
    });
  }

  public start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  private loop = (time: number): void => {
    const dt = Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;

    this.update(dt);
    this.render();

    // FPS & Metrics
    this.frameCount++;
    if (time - this.lastFpsTime >= 500) {
      this.currentFps = Math.round((this.frameCount * 1000) / (time - this.lastFpsTime));
      this.frameCount = 0;
      this.lastFpsTime = time;

      this.fpsElem.textContent = `${this.currentFps}`;
      this.drawsElem.textContent = `${this.renderer.info.render.calls}`;
      this.trisElem.textContent = `${this.renderer.info.render.triangles.toLocaleString()}`;
      this.geomElem.textContent = `${this.renderer.info.memory.geometries}`;
    }

    requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    // 1. Vehicle Physics (Reusing DeliveryVan directly)
    this.van.update(
      dt,
      this.input.up,
      this.input.down,
      this.input.left,
      this.input.right,
      this.input.drift,
      [], // No building collision in small spike
      this.effects
    );

    // Update 3D Van Mesh position and heading rotation
    this.vanGroup.position.set(this.van.x, 0, this.van.y);
    // Heading in 2D is angle (Up = -PI/2). In 3D: facing -Z is rotation.y = 0.
    this.vanGroup.rotation.y = -this.van.angle - Math.PI / 2;

    // Body roll when steering + throttle pitch
    this.vanGroup.rotation.z = -this.van.bodyRoll;
    this.vanGroup.rotation.x = this.van.speed * 0.0004;

    // Wheel rotation
    const wheelSpin = (this.van.speed / 7) * dt;
    for (const wheel of this.wheels) {
      wheel.rotation.x += wheelSpin;
    }

    // 2. Space Hold-to-Charge Throwing (Reusing PackageManager)
    const spacePressed = this.input.consumeSpace();
    if (spacePressed && !this.packages.isCharging) {
      this.packages.startCharging('EXPRESS');
    }

    let autoRelease = false;
    if (this.input.space) {
      if (!this.packages.isCharging) {
        this.packages.startCharging('EXPRESS');
      }
      autoRelease = this.packages.updateCharge(dt);
    }

    if (autoRelease || (!this.input.space && this.packages.isCharging)) {
      this.packages.releaseAndThrow(
        this.van.x,
        this.van.y,
        this.van.angle,
        this.van.speed,
        this.sound
      );
    }

    // 3. Aiming Trajectory & Landing Reticle in 3D
    const indicator = this.packages.getAimingIndicator(
      this.van.x,
      this.van.y,
      this.van.angle,
      this.van.speed,
      [this.targetData]
    );

    if (indicator) {
      this.landingReticle.visible = true;
      this.landingReticle.position.set(indicator.landingX, 0, indicator.landingY);

      // Trajectory 3D Parabola Arc
      const segments = 24;
      const points: THREE.Vector3[] = [];
      const peakY = 48 + indicator.chargeRatio * 18;

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = indicator.originX + (indicator.landingX - indicator.originX) * t;
        const z = indicator.originY + (indicator.landingY - indicator.originY) * t;
        const y = 14 + 4 * peakY * t * (1 - t);
        points.push(new THREE.Vector3(x, y, z));
      }

      this.trajectoryLine.geometry.setFromPoints(points);
      this.trajectoryLine.visible = true;

      const reticleColor = indicator.targetLock ? 0x00f5d4 : 0xfee440;
      (this.trajectoryLine.material as THREE.LineDashedMaterial).color.setHex(reticleColor);
      this.lockElem.textContent = indicator.targetLock ? 'YES (LOCKED)' : 'NO';
      this.lockElem.style.color = indicator.targetLock ? '#00f5d4' : '#fee440';
    } else {
      this.landingReticle.visible = false;
      this.trajectoryLine.visible = false;
      this.lockElem.textContent = 'NO';
      this.lockElem.style.color = '#fee440';
    }

    // 4. Update Packages & Animate 3D Parcels
    this.packages.update(
      dt,
      [this.targetData],
      this.effects,
      this.sound,
      (res: PackageResolution) => {
        if (res.type === 'HIT') {
          // Pulse target
          this.targetData.customerHappyTimer = 1.0;
        }
      }
    );

    // Synchronize 3D Package Meshes
    for (const p of this.packages.activePackages) {
      let mesh = this.active3DPackages.get(p.id);
      if (!mesh) {
        const boxGeo = new THREE.BoxGeometry(14, 14, 14);
        const boxMat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.85 });
        mesh = new THREE.Mesh(boxGeo, boxMat);
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.active3DPackages.set(p.id, mesh);
      }

      const heightOffset = 4 * p.peakHeight * p.progress * (1 - p.progress);
      mesh.position.set(p.currentX, 10 + heightOffset, p.currentY);
      mesh.rotation.x = p.rotation;
      mesh.rotation.y = p.rotation * 0.7;
    }

    // Remove resolved packages
    for (const [id, mesh] of this.active3DPackages.entries()) {
      if (!this.packages.activePackages.some(p => p.id === id)) {
        this.scene.remove(mesh);
        this.active3DPackages.delete(id);
      }
    }

    // Animate Target Floating Diamond
    const beacon = this.targetGroup.children[2] as THREE.Mesh;
    if (beacon) {
      beacon.rotation.y += dt * 1.5;
      beacon.position.y = 48 + Math.sin(performance.now() * 0.003) * 6;
    }

    // Camera Centering / Smooth Tracking
    if (this.cameraMode === 'ortho') {
      this.orthoCamera.position.set(this.van.x + 380, 520, this.van.y + 380);
      this.orthoCamera.lookAt(this.van.x, 0, this.van.y);
    } else if (this.cameraMode === 'persp') {
      this.perspCamera.position.set(this.van.x + 440, 540, this.van.y + 440);
      this.perspCamera.lookAt(this.van.x, 0, this.van.y);
    } else {
      this.topCamera.position.set(this.van.x, 700, this.van.y);
      this.topCamera.lookAt(this.van.x, 0, this.van.y);
    }

    this.speedElem.textContent = `${Math.round(this.van.speed)} px/s`;
  }

  private render(): void {
    this.renderer.render(this.scene, this.activeCamera);
  }
}

// Start Spike
window.addEventListener('DOMContentLoaded', () => {
  const spike = new ThreeJsVisualSpike();
  spike.start();
});
