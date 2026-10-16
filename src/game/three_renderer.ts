import * as THREE from 'three';
import { GAME_CONFIG } from './config.ts';
import { CityMap } from './map.ts';
import { DeliveryVan } from './car.ts';
import { DeliveryTarget, ThrownPackage, AimingIndicator, CelebrationEvent } from './types.ts';
import { LivingCityManager } from './living_city.ts';

export class ThreeRenderer {
  public readonly canvas: HTMLCanvasElement;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.OrthographicCamera;

  // Van 3D Mesh
  private vanGroup: THREE.Group = new THREE.Group();
  private wheels: THREE.Mesh[] = [];

  // Target Meshes
  private targetMeshes: Map<string, THREE.Group> = new Map();

  // Thrown Packages
  private active3DPackages: Map<number, THREE.Mesh> = new Map();

  // Trajectory & Aiming
  private trajectoryLine!: THREE.Line;
  private landingReticle: THREE.Group = new THREE.Group();

  // Traffic & Pedestrians
  private trafficMeshes: Map<number, THREE.Group> = new Map();
  private pedestrianMeshes: Map<number, THREE.Group> = new Map();

  // Building Meshes with celebration materials
  private buildingGroups: Map<string, { group: THREE.Group; wallMesh: THREE.Mesh; signMesh?: THREE.Mesh; defaultColor: number }> = new Map();

  // Lighting
  private dirLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;

  constructor(canvas: HTMLCanvasElement, map: CityMap) {
    this.canvas = canvas;

    // 1. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(GAME_CONFIG.CANVAS_WIDTH, GAME_CONFIG.CANVAS_HEIGHT);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // 2. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#161a23');
    this.scene.fog = new THREE.FogExp2('#161a23', 0.00045);

    // 3. Orthographic Isometric Camera (45° angle)
    const aspect = GAME_CONFIG.CANVAS_WIDTH / GAME_CONFIG.CANVAS_HEIGHT;
    const viewSize = 560; // World unit vertical span
    this.camera = new THREE.OrthographicCamera(
      (-viewSize * aspect) / 2,
      (viewSize * aspect) / 2,
      viewSize / 2,
      -viewSize / 2,
      1,
      4000
    );
    this.camera.position.set(2300 + 400, 520, 1800 + 400);
    this.camera.lookAt(2300, 0, 1800);

    // 4. Lighting
    this.ambientLight = new THREE.AmbientLight(0xdbeafe, 1.25);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xfffaed, 2.2);
    this.dirLight.position.set(2300 + 350, 650, 1800 - 300);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 10;
    this.dirLight.shadow.camera.far = 1800;
    const d = 520;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.001;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // 5. Build Environment
    this.buildGroundAndRoads(map);
    this.buildCityBuildings(map);
    this.buildTreesAndProps(map);
    this.buildVan3D();
    this.buildAimingAndTrajectory();
  }

  private buildGroundAndRoads(map: CityMap): void {
    // 1. Base Ground Lawn
    const groundGeo = new THREE.PlaneGeometry(map.width, map.height);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x2d4a3e,
      roughness: 0.85,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(map.width / 2, 0, map.height / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 2. Asphalt Roads
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x1f232c,
      roughness: 0.9,
    });
    const markingMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

    // Horizontal roads
    for (const hr of map.hRoads) {
      const roadGeo = new THREE.PlaneGeometry(map.width, hr.h);
      const road = new THREE.Mesh(roadGeo, roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(map.width / 2, 0.4, hr.y + hr.h / 2);
      road.receiveShadow = true;
      this.scene.add(road);

      // Yellow Center Dash
      const lineGeo = new THREE.PlaneGeometry(map.width - 120, 4);
      const line = new THREE.Mesh(lineGeo, markingMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(map.width / 2, 0.5, hr.y + hr.h / 2);
      this.scene.add(line);
    }

    // Vertical roads
    for (const vr of map.vRoads) {
      const roadGeo = new THREE.PlaneGeometry(vr.w, map.height);
      const road = new THREE.Mesh(roadGeo, roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(vr.x + vr.w / 2, 0.42, map.height / 2);
      road.receiveShadow = true;
      this.scene.add(road);

      // Yellow Center Dash
      const lineGeo = new THREE.PlaneGeometry(4, map.height - 120);
      const line = new THREE.Mesh(lineGeo, markingMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(vr.x + vr.w / 2, 0.51, map.height / 2);
      this.scene.add(line);
    }
  }

  private buildCityBuildings(map: CityMap): void {
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.75 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.15, metalness: 0.6 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });

    for (const b of map.buildings) {
      if (b.w > 2000 || b.h > 2000) continue; // Skip perimeter boundary barriers

      const group = new THREE.Group();
      const wallColorHex = parseInt(b.color.replace('#', '0x'), 16) || 0x3b82f6;
      const roofColorHex = parseInt(b.roofColor.replace('#', '0x'), 16) || 0x1e3a8a;

      // 1. Sidewalk Slab around building
      const sw = 16;
      const curbH = 4;
      const curbGeo = new THREE.BoxGeometry(b.w + sw * 2, curbH, b.h + sw * 2);
      const curbMesh = new THREE.Mesh(curbGeo, sidewalkMat);
      curbMesh.position.set(b.x + b.w / 2, curbH / 2, b.y + b.h / 2);
      curbMesh.receiveShadow = true;
      this.scene.add(curbMesh);

      // 2. Building Body
      let wallH = b.district === 'DOWNTOWN' ? 70 : 46;
      const wallMat = new THREE.MeshStandardMaterial({ color: wallColorHex, roughness: 0.7 });
      const wallGeo = new THREE.BoxGeometry(b.w, wallH, b.h);
      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.position.set(b.x + b.w / 2, wallH / 2 + curbH, b.y + b.h / 2);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      group.add(wallMesh);

      // 3. Roof Architecture
      if (b.style === 'residential_gable') {
        const roofH = 32;
        const roofMat = new THREE.MeshStandardMaterial({ color: roofColorHex, roughness: 0.65 });
        const roofGeo = new THREE.ConeGeometry(b.w * 0.72, roofH, 4);
        const roofMesh = new THREE.Mesh(roofGeo, roofMat);
        roofMesh.rotation.y = Math.PI / 4;
        roofMesh.position.set(b.x + b.w / 2, wallH + roofH / 2 + curbH, b.y + b.h / 2);
        roofMesh.castShadow = true;
        roofMesh.receiveShadow = true;
        group.add(roofMesh);

        // Door
        const doorGeo = new THREE.BoxGeometry(14, 22, 2);
        const doorMesh = new THREE.Mesh(doorGeo, doorMat);
        doorMesh.position.set(b.x + b.w / 2, 11 + curbH, b.y + b.h + 1);
        group.add(doorMesh);

        // Windows
        for (const offset of [-b.w * 0.28, b.w * 0.28]) {
          const winFrame = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 2.5), trimMat);
          winFrame.position.set(b.x + b.w / 2 + offset, 24 + curbH, b.y + b.h + 1);
          group.add(winFrame);

          const winGlass = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 3), glassMat);
          winGlass.position.set(b.x + b.w / 2 + offset, 24 + curbH, b.y + b.h + 1.2);
          group.add(winGlass);
        }
      } else {
        // Commercial / Storefront Flat Roof with AC and Signboard
        const roofBorderMat = new THREE.MeshStandardMaterial({ color: roofColorHex, roughness: 0.6 });
        const roofBorderGeo = new THREE.BoxGeometry(b.w + 2, 5, b.h + 2);
        const roofBorder = new THREE.Mesh(roofBorderGeo, roofBorderMat);
        roofBorder.position.set(b.x + b.w / 2, wallH + 2.5 + curbH, b.y + b.h / 2);
        roofBorder.castShadow = true;
        group.add(roofBorder);

        // Display Windows
        const displayH = 26;
        const displayGeo = new THREE.BoxGeometry(b.w * 0.85, displayH, 3);
        const display = new THREE.Mesh(displayGeo, glassMat);
        display.position.set(b.x + b.w / 2, displayH / 2 + 5 + curbH, b.y + b.h + 1);
        group.add(display);

        // Storefront Awning
        if (b.hasAwning) {
          const awningColorHex = b.awningColor ? parseInt(b.awningColor.replace('#', '0x'), 16) : 0xff3366;
          const awningMat = new THREE.MeshStandardMaterial({ color: awningColorHex, roughness: 0.8 });
          const awningGeo = new THREE.BoxGeometry(b.w * 0.9, 3.5, 18);
          const awning = new THREE.Mesh(awningGeo, awningMat);
          awning.rotation.x = 0.22;
          awning.position.set(b.x + b.w / 2, displayH + 8 + curbH, b.y + b.h + 8);
          awning.castShadow = true;
          group.add(awning);
        }

        // Signboard
        const signMat = new THREE.MeshStandardMaterial({
          color: wallColorHex,
          emissive: wallColorHex,
          emissiveIntensity: 0.4,
          roughness: 0.3,
        });
        const signGeo = new THREE.BoxGeometry(Math.min(b.w - 18, 140), 12, 3.5);
        const signMesh = new THREE.Mesh(signGeo, signMat);
        signMesh.position.set(b.x + b.w / 2, displayH + 21 + curbH, b.y + b.h + 2);
        group.add(signMesh);

        // Rooftop AC unit
        const acGeo = new THREE.BoxGeometry(16, 12, 16);
        const acMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5 });
        const ac = new THREE.Mesh(acGeo, acMat);
        ac.position.set(b.x + b.w * 0.35, wallH + 11 + curbH, b.y + b.h * 0.4);
        ac.castShadow = true;
        group.add(ac);
      }

      this.scene.add(group);
      this.buildingGroups.set(b.name, {
        group,
        wallMesh,
        defaultColor: wallColorHex,
      });
    }
  }

  private buildTreesAndProps(map: CityMap): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.7, flatShading: true });

    // Trees
    for (const tree of map.trees) {
      const treeGroup = new THREE.Group();

      const trunkGeo = new THREE.CylinderGeometry(3, 5, 24, 6);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(0, 12, 0);
      trunk.castShadow = true;
      treeGroup.add(trunk);

      // Layered geometric crown
      for (let i = 0; i < 3; i++) {
        const r = (tree.radius || 24) * (1 - i * 0.2);
        const leafGeo = new THREE.IcosahedronGeometry(r, 0);
        const leaf = new THREE.Mesh(leafGeo, leavesMat);
        leaf.position.set(0, 24 + i * 10, 0);
        leaf.castShadow = true;
        treeGroup.add(leaf);
      }

      treeGroup.position.set(tree.x, 0, tree.y);
      this.scene.add(treeGroup);
    }

    // Fountains in parks
    for (const prop of map.props) {
      if (prop.type === 'fountain') {
        const fGroup = new THREE.Group();
        const r = (prop.w || 90) / 2;
        const basinMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6 });
        const waterMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.8 });

        const basinGeo = new THREE.CylinderGeometry(r, r, 7, 16);
        const basin = new THREE.Mesh(basinGeo, basinMat);
        basin.position.set(0, 3.5, 0);
        basin.castShadow = true;
        fGroup.add(basin);

        const waterGeo = new THREE.CylinderGeometry(r - 7, r - 7, 7.5, 16);
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.position.set(0, 4, 0);
        fGroup.add(water);

        fGroup.position.set(prop.x, 0, prop.y);
        this.scene.add(fGroup);
      }
    }
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

    // 1. Lower Chassis
    const chassisGeo = new THREE.BoxGeometry(vanW, 8, vanL + 6);
    const chassis = new THREE.Mesh(chassisGeo, bumperMat);
    chassis.position.set(0, 9, 0);
    chassis.castShadow = true;
    this.vanGroup.add(chassis);

    // 2. Main Cabin Body
    const bodyGeo = new THREE.BoxGeometry(vanW - 2, vanH, vanL - 6);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, vanH / 2 + 8, -1);
    body.castShadow = true;
    body.receiveShadow = true;
    this.vanGroup.add(body);

    // 3. Accent Roof
    const roofGeo = new THREE.BoxGeometry(vanW - 1, 5, vanL - 4);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, vanH + 9, -1);
    roof.castShadow = true;
    this.vanGroup.add(roof);

    // 4. Windshield
    const windshieldGeo = new THREE.BoxGeometry(vanW - 4, 12, 3);
    const windshield = new THREE.Mesh(windshieldGeo, glassMat);
    windshield.position.set(0, vanH - 4, -vanL / 2 + 1);
    this.vanGroup.add(windshield);

    // 5. Headlights
    for (const offset of [-vanW * 0.32, vanW * 0.32]) {
      const lightGeo = new THREE.BoxGeometry(6, 5, 2);
      const light = new THREE.Mesh(lightGeo, lightMat);
      light.position.set(offset, 13, -vanL / 2 - 2);
      this.vanGroup.add(light);
    }

    // 6. Wheels
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

    this.vanGroup.position.set(2300, 0, 1800);
    this.scene.add(this.vanGroup);
  }

  private buildAimingAndTrajectory(): void {
    // Parabolic trajectory line (30 vertices)
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 30; i++) {
      points.push(new THREE.Vector3(0, 0, 0));
    }
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00f5d4, linewidth: 2 });
    this.trajectoryLine = new THREE.Line(lineGeo, lineMat);
    this.trajectoryLine.visible = false;
    this.scene.add(this.trajectoryLine);

    // Glowing target landing reticle
    const reticleMat = new THREE.MeshBasicMaterial({ color: 0x00f5d4, wireframe: true });
    const reticleGeo = new THREE.RingGeometry(16, 22, 16);
    const reticleMesh = new THREE.Mesh(reticleGeo, reticleMat);
    reticleMesh.rotation.x = -Math.PI / 2;
    this.landingReticle.add(reticleMesh);
    this.landingReticle.visible = false;
    this.scene.add(this.landingReticle);
  }

  public update(
    van: DeliveryVan,
    targets: DeliveryTarget[],
    packages: ThrownPackage[],
    aiming: AimingIndicator | null,
    livingCity: LivingCityManager,
    celebration: CelebrationEvent | null
  ): void {
    // 1. Update Van Position, Heading & Body Roll
    this.vanGroup.position.set(van.x, 0, van.y);
    this.vanGroup.rotation.y = -van.angle - Math.PI / 2;
    this.vanGroup.rotation.z = van.bodyRoll * 0.35; // body roll leaning into turns

    // Wheel spin
    const spin = (van.speed * 0.05) % (Math.PI * 2);
    for (const wheel of this.wheels) {
      wheel.rotation.x = spin;
    }

    // 2. Camera Tracking with Smooth Follow
    const lookaheadDistance = Math.min(65, van.speed * 0.16);
    const lookX = van.x + Math.cos(van.angle) * lookaheadDistance;
    const lookZ = van.y + Math.sin(van.angle) * lookaheadDistance;

    const targetCamX = lookX + 400;
    const targetCamZ = lookZ + 400;

    this.camera.position.x += (targetCamX - this.camera.position.x) * 0.12;
    this.camera.position.z += (targetCamZ - this.camera.position.z) * 0.12;
    this.camera.lookAt(lookX, 0, lookZ);

    // Keep directional sunlight centered on camera frustum
    this.dirLight.position.set(lookX + 350, 650, lookZ - 300);
    this.dirLight.target.position.set(lookX, 0, lookZ);

    // 3. Update Delivery Targets
    for (const t of targets) {
      let tGroup = this.targetMeshes.get(t.id);
      if (!tGroup) {
        tGroup = new THREE.Group();
        const colorHex = parseInt(t.color.replace('#', '0x'), 16) || 0x00f5d4;

        // Ground Ring
        const ringGeo = new THREE.RingGeometry(t.radius - 4, t.radius, 24);
        const ringMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.7 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(0, 1.2, 0);
        tGroup.add(ring);

        // Floating Diamond Beacon
        const beaconGeo = new THREE.OctahedronGeometry(12, 0);
        const beaconMat = new THREE.MeshStandardMaterial({
          color: colorHex,
          emissive: colorHex,
          emissiveIntensity: 0.65,
          roughness: 0.3,
        });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.set(0, 26, 0);
        tGroup.add(beacon);

        this.scene.add(tGroup);
        this.targetMeshes.set(t.id, tGroup);
      }

      tGroup.visible = t.active;
      if (t.active) {
        tGroup.position.set(t.x, 0, t.y);
        const beacon = tGroup.children[1] as THREE.Mesh;
        if (beacon) {
          beacon.rotation.y += 0.035;
          beacon.position.y = 26 + Math.sin(Date.now() * 0.005) * 4;
        }
      }
    }

    // 4. Update Thrown Packages in Air
    const currentPkgIds = new Set(packages.map((p) => p.id));
    for (const [id, mesh] of this.active3DPackages.entries()) {
      if (!currentPkgIds.has(id)) {
        this.scene.remove(mesh);
        this.active3DPackages.delete(id);
      }
    }

    for (const p of packages) {
      let mesh = this.active3DPackages.get(p.id);
      if (!mesh) {
        const pkgGeo = new THREE.BoxGeometry(10, 10, 10);
        const pkgMat = new THREE.MeshStandardMaterial({
          color: p.type === 'PIZZA' ? 0xff5400 : (p.type === 'FRAGILE' ? 0xb5179e : 0xd4a373),
          roughness: 0.6,
        });
        mesh = new THREE.Mesh(pkgGeo, pkgMat);
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.active3DPackages.set(p.id, mesh);
      }

      const h = Math.sin(p.progress * Math.PI) * p.peakHeight;
      mesh.position.set(p.currentX, 7 + h, p.currentY);
      mesh.rotation.x = p.rotation;
      mesh.rotation.y = p.rotation * 1.5;
    }

    // 5. Update Aiming Trajectory Preview
    if (aiming && aiming.isCharging) {
      this.trajectoryLine.visible = true;
      this.landingReticle.visible = true;

      const positions = (this.trajectoryLine.geometry as THREE.BufferGeometry).attributes.position;
      const count = 30;
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const lx = aiming.originX + (aiming.landingX - aiming.originX) * t;
        const lz = aiming.originY + (aiming.landingY - aiming.originY) * t;
        const ly = 12 + Math.sin(t * Math.PI) * (45 + aiming.chargeRatio * 45);
        positions.setXYZ(i, lx, ly, lz);
      }
      positions.needsUpdate = true;

      this.landingReticle.position.set(aiming.landingX, 1.5, aiming.landingY);
      const reticleColor = aiming.targetLock ? 0x00f5d4 : 0xfee440;
      ((this.landingReticle.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(reticleColor);
    } else {
      this.trajectoryLine.visible = false;
      this.landingReticle.visible = false;
    }

    // 6. Update Traffic Vehicles
    const trafficIds = new Set(livingCity.traffic.map((v) => v.id));
    for (const [id, grp] of this.trafficMeshes.entries()) {
      if (!trafficIds.has(id)) {
        this.scene.remove(grp);
        this.trafficMeshes.delete(id);
      }
    }
    for (const veh of livingCity.traffic) {
      let grp = this.trafficMeshes.get(veh.id);
      if (!grp) {
        grp = new THREE.Group();
        const vMat = new THREE.MeshStandardMaterial({
          color: parseInt(veh.color.replace('#', '0x'), 16) || 0x3b82f6,
          roughness: 0.6,
        });
        const vGeo = new THREE.BoxGeometry(veh.width, 14, veh.length);
        const vMesh = new THREE.Mesh(vGeo, vMat);
        vMesh.position.set(0, 7, 0);
        vMesh.castShadow = true;
        grp.add(vMesh);

        this.scene.add(grp);
        this.trafficMeshes.set(veh.id, grp);
      }
      grp.position.set(veh.x, 0, veh.y);
      grp.rotation.y = -veh.angle - Math.PI / 2;
    }

    // 7. Update Pedestrians
    const pedIds = new Set(livingCity.pedestrians.map((ped) => ped.id));
    for (const [id, grp] of this.pedestrianMeshes.entries()) {
      if (!pedIds.has(id)) {
        this.scene.remove(grp);
        this.pedestrianMeshes.delete(id);
      }
    }
    for (const ped of livingCity.pedestrians) {
      let grp = this.pedestrianMeshes.get(ped.id);
      if (!grp) {
        grp = new THREE.Group();
        const shirtMat = new THREE.MeshStandardMaterial({
          color: parseInt(ped.shirtColor.replace('#', '0x'), 16) || 0xff595e,
          roughness: 0.7,
        });
        const bodyGeo = new THREE.CylinderGeometry(3.5, 3.5, 12, 8);
        const body = new THREE.Mesh(bodyGeo, shirtMat);
        body.position.set(0, 6, 0);
        body.castShadow = true;
        grp.add(body);

        const headGeo = new THREE.SphereGeometry(3.2, 8, 8);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xffdfba, roughness: 0.8 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(0, 14, 0);
        grp.add(head);

        this.scene.add(grp);
        this.pedestrianMeshes.set(ped.id, grp);
      }
      const jump = ped.cheerJump || 0;
      grp.position.set(ped.x, jump, ped.y);
    }

    // 8. Chaos Chain 3D Environmental Reaction
    if (celebration && celebration.active) {
      const celColorHex = parseInt((celebration.deliveryType === 'PIZZA' ? '#ff5400' : (celebration.deliveryType === 'FRAGILE' ? '#b5179e' : '#00f5d4')).replace('#', '0x'), 16);
      if (celebration.buildingName) {
        const bData = this.buildingGroups.get(celebration.buildingName);
        if (bData) {
          const pulse = Math.sin(Date.now() * 0.02) * 0.5 + 0.5;
          (bData.wallMesh.material as THREE.MeshStandardMaterial).emissive.setHex(celColorHex);
          (bData.wallMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = celebration.level === 3 ? 0.8 * pulse : 0.45 * pulse;
        }
      }
    }

    // 9. Render Scene
    this.renderer.render(this.scene, this.camera);
  }
}
