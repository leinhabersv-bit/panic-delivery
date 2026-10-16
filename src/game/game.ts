import { GAME_CONFIG } from './config.ts';
import { GameState } from './types.ts';
import { InputHandler } from './input.ts';
import { SoundFx } from './audio.ts';
import { CityMap } from './map.ts';
import { DeliveryVan } from './car.ts';
import { TargetManager } from './target.ts';
import { PackageManager, PackageResolution } from './package.ts';
import { EffectsManager } from './effects.ts';
import { TemporaryHUD } from './hud.ts';
import { LivingCityManager } from './living_city.ts';
import { ThreeRenderer } from './three_renderer.ts';

export class Game {
  public readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private threeRenderer?: ThreeRenderer;

  private input: InputHandler;
  private sound: SoundFx;
  private map: CityMap;
  private van: DeliveryVan;
  private targets: TargetManager;
  private packages: PackageManager;
  private effects: EffectsManager;
  private hud: TemporaryHUD;
  private livingCity: LivingCityManager;

  private state: GameState;

  // Camera & viewport
  private cameraX: number = 0;
  private cameraY: number = 0;
  private cameraZoom: number = 1.0;
  private dpr: number = 1.0;

  private gameOverLockoutTimer: number = 0;
  private lastTime: number = 0;
  private isRunning: boolean = false;

  constructor(canvas: HTMLCanvasElement, threeCanvas?: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');
    this.ctx = ctx;

    this.input = new InputHandler();
    this.sound = new SoundFx();
    this.map = new CityMap();
    this.van = new DeliveryVan(2300, 1800); // Start centered on wide Central Boulevard
    this.targets = new TargetManager(this.map.deliverySpots);
    this.packages = new PackageManager();
    this.effects = new EffectsManager();
    this.hud = new TemporaryHUD();
    this.livingCity = new LivingCityManager(this.map);

    if (threeCanvas) {
      try {
        this.threeRenderer = new ThreeRenderer(threeCanvas, this.map);
      } catch (err) {
        console.warn('Three.js WebGL initialization fallback to 2.5D Canvas:', err);
      }
    }

    this.state = this.createInitialState();

    this.setupResizeHandler();
  }

  private setupResizeHandler(): void {
    const handleResize = () => {
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = this.canvas.getBoundingClientRect();
      const targetW = rect.width || GAME_CONFIG.CANVAS_WIDTH;
      const targetH = rect.height || GAME_CONFIG.CANVAS_HEIGHT;

      this.canvas.width = targetW * this.dpr;
      this.canvas.height = targetH * this.dpr;
    };

    window.addEventListener('resize', handleResize);
    handleResize();
  }

  private getSavedHighScore(): number {
    try {
      return parseInt(localStorage.getItem('panic_delivery_highscore') || '0', 10) || 0;
    } catch {
      return 0;
    }
  }

  private getSavedBestCombo(): number {
    try {
      return parseInt(localStorage.getItem('panic_delivery_bestcombo') || '1', 10) || 1;
    } catch {
      return 1;
    }
  }

  private saveHighScore(score: number, combo: number): void {
    try {
      if (score > this.getSavedHighScore()) {
        localStorage.setItem('panic_delivery_highscore', score.toString());
      }
      if (combo > this.getSavedBestCombo()) {
        localStorage.setItem('panic_delivery_bestcombo', combo.toString());
      }
    } catch {
      // safe fallback if storage unavailable
    }
  }

  private createInitialState(): GameState {
    const savedHighScore = this.getSavedHighScore();
    const savedBestCombo = this.getSavedBestCombo();
    return {
      phase: 'MENU',
      score: 0,
      timeLeft: GAME_CONFIG.ROUND_DURATION_SECONDS,
      combo: 1,
      maxCombo: 1,
      deliveries: 0,
      misses: 0,
      crashes: 0,
      packagesRemaining: GAME_CONFIG.PACKAGES.MAX_CAPACITY,
      maxPackages: GAME_CONFIG.PACKAGES.MAX_CAPACITY,
      isReloading: false,
      reloadProgress: 0,
      comboTimeLeft: 0,
      lastScoreEvent: null,
      activeCelebration: null,
      currentDeliveryType: 'EXPRESS',
      isFinalRush: false,
      highScore: savedHighScore,
      bestCombo: savedBestCombo,
    };
  }

  public getGameState(): GameState {
    return { ...this.state };
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  public startMatch(): void {
    this.sound.init();
    this.state = {
      ...this.createInitialState(),
      phase: 'PLAYING',
    };
    this.gameOverLockoutTimer = 0;
    this.van.reset(2300, 1800);
    this.van.currentDeliveryType = 'EXPRESS';
    this.targets.reset();
    this.packages.reset();
    this.livingCity.reset();
    this.effects.clear();
    this.effects.addScorePopup(2300, 1740, 'LET\'S DELIVER!', '#00f5d4');
    this.effects.triggerFlash('#00f5d4', 0.25);
  }

  private loop = (time: number): void => {
    if (!this.isRunning) return;

    const dt = Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;

    this.update(dt);
    this.render();

    requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    // Discrete edge-triggered key events
    const zPressed = this.input.consumeZ();
    const spacePressed = this.input.consumeSpace();

    // Menu state: fresh Z press starts match (Space must NOT trigger start)
    if (this.state.phase === 'MENU') {
      if (zPressed) {
        this.startMatch();
      }
      return;
    }

    // Results / Game Over state: mandatory 1-second lockout, then fresh Z press restarts
    if (this.state.phase === 'GAMEOVER') {
      this.sound.stopLoops();
      if (this.gameOverLockoutTimer > 0) {
        this.gameOverLockoutTimer = Math.max(0, this.gameOverLockoutTimer - dt);
      } else if (zPressed) {
        this.startMatch();
      }
      return;
    }

    // --- PLAYING STATE ---
    // 1. 120-second timer countdown
    this.state.timeLeft -= dt;
    if (this.state.timeLeft <= 0) {
      this.state.timeLeft = 0;
      this.state.phase = 'GAMEOVER';
      this.gameOverLockoutTimer = 1.0; // Mandatory 1-second lockout
      this.saveHighScore(this.state.score, this.state.maxCombo);
      this.state.highScore = Math.max(this.state.highScore, this.state.score);
      this.state.bestCombo = Math.max(this.state.bestCombo, this.state.maxCombo);
      this.sound.stopLoops();
      this.effects.triggerFlash('#fee440', 0.35);
      return;
    }

    // 2. Combo decay
    if (this.state.combo > 1) {
      this.state.comboTimeLeft -= dt;
      if (this.state.comboTimeLeft <= 0) {
        this.state.combo = 1;
        this.state.comboTimeLeft = 0;
      }
    }

    // 2b. Celebration event decay (Keep the Party Moving)
    if (this.state.activeCelebration) {
      this.state.activeCelebration.elapsed += dt;
      if (this.state.activeCelebration.elapsed >= this.state.activeCelebration.duration) {
        this.state.activeCelebration = null;
      }
    }

    // 3. Van Physics & Collision
    const collisionResult = this.van.update(
      dt,
      this.input.up,
      this.input.down,
      this.input.left,
      this.input.right,
      this.input.drift,
      this.map.buildings,
      this.effects
    );

    // Audio update for engine & drift
    const speedRatio = this.van.speed / GAME_CONFIG.VAN.MAX_FORWARD_SPEED;
    this.sound.updateEngine(speedRatio, this.van.isDrifting);

    // Hard crash breaks combo
    if (collisionResult.crashed) {
      this.state.crashes++;
      this.sound.playCrash();
      if (this.state.combo > 1) {
        this.state.combo = 1;
        this.state.comboTimeLeft = 0;
        this.effects.addScorePopup(this.van.x, this.van.y - 35, 'COMBO LOST!', '#ff0055');
      }
    }

    // Final Rush tracking (last 15 seconds)
    this.state.isFinalRush = this.state.timeLeft <= GAME_CONFIG.FINAL_RUSH_SECONDS;

    // 4. HOLD-TO-CHARGE SPACE THROWING
    // Edge-triggered Space down begins charging
    if (spacePressed && !this.packages.isCharging) {
      this.packages.startCharging(this.state.currentDeliveryType || 'EXPRESS');
    }

    // While Space is held down, smoothly accumulate charge
    let autoRelease = false;
    if (this.input.space) {
      if (!this.packages.isCharging) {
        this.packages.startCharging(this.state.currentDeliveryType || 'EXPRESS');
      }
      autoRelease = this.packages.updateCharge(dt);
    }

    if (autoRelease || (!this.input.space && this.packages.isCharging)) {
      // Space released OR max hold limit reached: Launch package with charged velocity
      const threw = this.packages.releaseAndThrow(
        this.van.x,
        this.van.y,
        this.van.angle,
        this.van.speed,
        this.sound
      );
      if (!threw && this.packages.packagesRemaining === 0) {
        this.effects.addScorePopup(this.van.x, this.van.y - 30, 'RELOADING!', '#ffbe0b');
      }
    }

    // 5. Living City (Pedestrians, Ambient Traffic, Leaves, Birds)
    this.livingCity.update(dt, this.van.x, this.van.y, this.effects, (pts: number) => {
      // Gentle Near-Miss bonus with passing traffic
      this.state.score += pts;
      this.sound.playDeliverySuccess(1);
    });

    // 6. Packages Update & Resolution
    this.packages.update(
      dt,
      this.targets.targets,
      this.effects,
      this.sound,
      (res: PackageResolution) => this.handlePackageResolution(res)
    );

    // Update package state for HUD
    this.state.packagesRemaining = this.packages.packagesRemaining;
    this.state.maxPackages = this.packages.maxPackages;
    this.state.isReloading = this.packages.isReloading;
    this.state.reloadProgress = this.packages.isReloading
      ? this.packages.reloadTimer / GAME_CONFIG.PACKAGES.RELOAD_TIME_SECONDS
      : 0;

    // 7. Targets & Map Update
    this.targets.update(dt);
    this.map.update(dt);

    // 8. Visual Effects & Speed Streaks Update
    this.effects.update(dt);
    this.effects.updateSpeedStreaks(Math.abs(this.van.speed), GAME_CONFIG.CANVAS_WIDTH, GAME_CONFIG.CANVAS_HEIGHT);

    // 9. Camera Tracking: Restrained lookahead and subtle speed zoom for stable framing
    const lookaheadDistance = Math.min(48, this.van.speed * 0.12);
    const lookaheadX = Math.cos(this.van.angle) * lookaheadDistance;
    const lookaheadY = Math.sin(this.van.angle) * lookaheadDistance;

    const targetCamX = this.van.x + lookaheadX - GAME_CONFIG.CANVAS_WIDTH / 2;
    const targetCamY = this.van.y + lookaheadY - GAME_CONFIG.CANVAS_HEIGHT / 2;

    this.cameraX += (targetCamX - this.cameraX) * Math.min(1.0, dt * 7);
    this.cameraY += (targetCamY - this.cameraY) * Math.min(1.0, dt * 7);

    // Subtle, gentle zoom: 1.0 down to 0.96 at top speed
    const targetZoom = 1.0 - (Math.abs(this.van.speed) / GAME_CONFIG.VAN.MAX_FORWARD_SPEED) * 0.04;
    this.cameraZoom += (targetZoom - this.cameraZoom) * Math.min(1.0, dt * 4);

    // Clamp camera within map bounds
    this.cameraX = Math.max(0, Math.min(GAME_CONFIG.WORLD_WIDTH - GAME_CONFIG.CANVAS_WIDTH, this.cameraX));
    this.cameraY = Math.max(0, Math.min(GAME_CONFIG.WORLD_HEIGHT - GAME_CONFIG.CANVAS_HEIGHT, this.cameraY));
  }

  private handlePackageResolution(res: PackageResolution): void {
    if (res.type === 'HIT' && res.target) {
      this.state.deliveries++;

      this.state.combo = Math.min(GAME_CONFIG.COMBO.MAX_MULTIPLIER, this.state.combo + 1);
      this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo);
      this.state.comboTimeLeft = GAME_CONFIG.COMBO.TIMER_SECONDS;

      let multiplier = this.state.combo;
      if (this.state.isFinalRush) {
        multiplier *= 2; // Final rush double score bonus
      }

      const totalPoints = res.points * multiplier;
      this.state.score += totalPoints;

      this.sound.playDeliverySuccess(this.state.combo);

      let popupText = `+${totalPoints}`;
      if (res.isLongShot) {
        popupText += ' 🎯 LONG THROW!';
      }
      if (res.wasMoving) {
        popupText += ' 🚗 MOVING BONUS!';
      }
      if (this.state.isFinalRush) {
        popupText += ' ⚡ 2X RUSH!';
      }
      if (this.state.combo > 1) {
        popupText += ` x${this.state.combo}`;
      }

      const popupColor = res.deliveryType === 'PIZZA' ? '#f97316' : res.deliveryType === 'FRAGILE' ? '#d946ef' : '#00f5d4';
      this.effects.addScorePopup(res.x, res.y - 25, popupText, popupColor);
      this.state.lastScoreEvent = {
        points: totalPoints,
        text: popupText,
        x: res.x,
        y: res.y,
        color: popupColor,
      };

      // --- SIGNATURE CHAOS CHAIN SYSTEM: THE CITY GOES WILD ---
      // Level 1: DELIVERY SPARK (First delivery)
      // Level 2: NEIGHBORHOOD PARTY (Consecutive chained delivery, combo >= 2)
      // Level 3: CITY GOES WILD! (Third consecutive delivery, combo >= 3)
      let celebrationLevel: 1 | 2 | 3 = 1;
      if (this.state.combo >= 3) {
        celebrationLevel = 3;
      } else if (this.state.combo === 2 || (this.state.activeCelebration !== null && this.state.activeCelebration.active)) {
        celebrationLevel = 2;
      }

      // Visual particles based on Chaos Chain level
      if (celebrationLevel === 3) {
        this.effects.addCityGoesWildBurst(res.x, res.y);
        this.sound.playCityGoesWild();
        this.effects.addScorePopup(res.x, res.y - 65, '🔥 CITY GOES WILD! 🔥', '#fee440');
      } else if (celebrationLevel === 2) {
        this.effects.addNeighborhoodPartyBurst(res.x, res.y, popupColor);
        this.effects.addScorePopup(res.x, res.y - 50, '🎉 NEIGHBORHOOD PARTY! 🎉', '#00f5d4');
      }

      // Ignite receiving building and neighboring blocks
      this.map.triggerBuildingCelebration(res.x, res.y, celebrationLevel, popupColor, res.target.name);

      // Trigger nearby pedestrians jumping and cheering
      this.livingCity.triggerPedestrianCheer(res.x, res.y, celebrationLevel === 3 ? 600 : 380, celebrationLevel === 3 ? 2.8 : 2.0);

      this.state.activeCelebration = {
        level: celebrationLevel,
        x: res.x,
        y: res.y,
        deliveryType: res.deliveryType,
        wasMoving: res.wasMoving,
        combo: this.state.combo,
        points: totalPoints,
        duration: celebrationLevel === 3 ? 2.5 : (celebrationLevel === 2 ? 2.0 : GAME_CONFIG.CELEBRATION.DURATION_SECONDS),
        elapsed: 0,
        active: true,
        buildingName: res.target.name,
      };

      // Route sequencing: spawn replacement target reachable from current delivered spot
      this.targets.markDelivered(res.target.id, { x: res.x, y: res.y });

      // Cycle next active delivery variety to match next closest target
      const remainingTargets = this.targets.targets.filter((t) => t.active);
      if (remainingTargets.length > 0) {
        const nextTarget = remainingTargets[0];
        this.state.currentDeliveryType = nextTarget.type;
        this.van.currentDeliveryType = nextTarget.type;
      }
    } else {
      this.state.misses++;
      let missText = 'MISSED!';
      if (res.missReason === 'SHORT') {
        missText = 'SHORT! CHARGE MORE';
      } else if (res.missReason === 'LONG') {
        missText = 'OVERSHOT!';
      } else if (res.missReason === 'WIDE') {
        missText = 'OFF TARGET!';
      }

      if (this.state.combo > 1) {
        missText += ' (COMBO RESET)';
      }
      this.effects.addScorePopup(res.x, res.y - 18, missText, '#ff595e');

      this.state.combo = 1;
      this.state.comboTimeLeft = 0;
      this.state.activeCelebration = null;
    }
  }

  private render(): void {
    const ctx = this.ctx;
    const viewW = GAME_CONFIG.CANVAS_WIDTH;
    const viewH = GAME_CONFIG.CANVAS_HEIGHT;

    ctx.save();

    // Scale for devicePixelRatio and responsive canvas
    const scaleX = this.canvas.width / (viewW * this.dpr);
    const scaleY = this.canvas.height / (viewH * this.dpr);
    ctx.scale(this.dpr * scaleX, this.dpr * scaleY);

    ctx.clearRect(0, 0, viewW, viewH);

    // Apply Screen Shake
    ctx.translate(this.effects.shakeOffsetX, this.effects.shakeOffsetY);

    // If 3D Three.js renderer is active, drive the full 3D miniature city scene!
    if (this.threeRenderer) {
      const aimingIndicator = this.packages.getAimingIndicator(
        this.van.x,
        this.van.y,
        this.van.angle,
        this.van.speed,
        this.targets.targets
      );
      this.threeRenderer.update(
        this.van,
        this.targets.targets,
        this.packages.activePackages,
        aimingIndicator,
        this.livingCity,
        this.state.activeCelebration
      );

      // Render 2D juice particles & popups over 3D world
      ctx.save();
      ctx.translate(-this.cameraX, -this.cameraY);
      this.effects.renderParticles(ctx);
      this.effects.renderFloatingTexts(ctx);
      ctx.restore();

      // Final Rush edge pulse overlay
      if (this.state.isFinalRush) {
        const pulse = Math.sin(Date.now() * 0.015) * 0.5 + 0.5;
        ctx.strokeStyle = `rgba(239, 68, 68, ${0.2 + pulse * 0.25})`;
        ctx.lineWidth = 10;
        ctx.strokeRect(0, 0, viewW, viewH);
      }

      this.effects.renderSpeedStreaks(ctx);
      this.effects.renderFlash(ctx, viewW, viewH);
      this.hud.render(ctx, this.state, this.van.x, this.van.y, this.targets.targets, this.cameraX, this.cameraY);
      ctx.restore();
      return;
    }

    if (this.state.phase === 'MENU') {
      ctx.save();
      ctx.translate(-this.cameraX, -this.cameraY);
      this.map.render(ctx, this.cameraX, this.cameraY, viewW, viewH);
      this.targets.render(ctx);
      this.van.render(ctx);
      ctx.restore();

      this.hud.render(ctx, this.state, this.van.x, this.van.y, this.targets.targets, this.cameraX, this.cameraY);
    } else {
      // World space with Camera Zoom and Translation
      ctx.save();

      // Zoom around center of screen
      ctx.translate(viewW / 2, viewH / 2);
      ctx.scale(this.cameraZoom, this.cameraZoom);
      ctx.translate(-viewW / 2, -viewH / 2);

      ctx.translate(-this.cameraX, -this.cameraY);

      // 1. City ground, roads, markings, crosswalks, trees, buildings
      this.map.render(ctx, this.cameraX, this.cameraY, viewW, viewH);

      // 2. Tire skid marks
      this.effects.renderSkids(ctx);

      // 3. Living City: Pedestrians, traffic cars, ambient leaves/birds
      this.livingCity.render(ctx, this.cameraX, this.cameraY, viewW, viewH);

      // 4. Delivery target zones
      this.targets.render(ctx);

      // 5. Delivery van
      this.van.render(ctx);

      // 6. Thrown packages
      this.packages.render(ctx);

      // 7. Visual Aiming System (Trajectory arc & glowing landing zone while charging Space)
      const aimingIndicator = this.packages.getAimingIndicator(
        this.van.x,
        this.van.y,
        this.van.angle,
        this.van.speed,
        this.targets.targets
      );
      if (aimingIndicator) {
        this.packages.renderAimingTrajectory(ctx, aimingIndicator);
      }

      // 8. Particle effects (smoke, confetti, sparks)
      this.effects.renderParticles(ctx);

      // 9. Floating score popups in world space
      this.effects.renderFloatingTexts(ctx);

      ctx.restore();

      // Final Rush edge pulse overlay
      if (this.state.isFinalRush) {
        const pulse = Math.sin(Date.now() * 0.015) * 0.5 + 0.5;
        ctx.strokeStyle = `rgba(239, 68, 68, ${0.2 + pulse * 0.25})`;
        ctx.lineWidth = 10;
        ctx.strokeRect(0, 0, viewW, viewH);
      }

      // Speed streaks overlay in screen space
      this.effects.renderSpeedStreaks(ctx);

      // Screen Flash overlay
      this.effects.renderFlash(ctx, viewW, viewH);

      // Screen space HUD (fixed relative to canvas)
      this.hud.render(ctx, this.state, this.van.x, this.van.y, this.targets.targets, this.cameraX, this.cameraY);
    }

    ctx.restore();
  }
}
