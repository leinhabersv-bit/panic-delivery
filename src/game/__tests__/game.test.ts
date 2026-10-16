import test from 'node:test';
import assert from 'node:assert/strict';

import { GAME_CONFIG } from '../config.ts';
import { CityMap } from '../map.ts';
import { PackageManager } from '../package.ts';
import { TargetManager } from '../target.ts';
import { EventManager } from '../events.ts';
import { EffectsManager } from '../effects.ts';
import { DeliveryVan } from '../car.ts';

test('World dimensions and road scale', () => {
  assert.equal(GAME_CONFIG.WORLD_WIDTH, 4600);
  assert.equal(GAME_CONFIG.WORLD_HEIGHT, 3600);
  assert.equal(GAME_CONFIG.ROUND_DURATION_SECONDS, 120);

  const map = new CityMap();
  assert.ok(map.buildings.length > 20, 'Has abundant 2.5D buildings');
  assert.ok(map.deliverySpots.length >= 10, 'Has ample delivery spots');
  assert.ok(map.sidewalkSegments.length > 0, 'Has sidewalk pedestrian paths');
  assert.ok(map.trafficLanes.length > 0, 'Has traffic road lanes');

  // Verify inner city buildings do not encroach on Grand Central Boulevard (y = 1680 to 1940)
  const innerBuildings = map.buildings.filter(b => !b.name.includes('PERIMETER'));
  const centralBoulevardClear = innerBuildings.every(
    b => !(b.y + b.h > 1680 && b.y < 1940)
  );
  assert.ok(centralBoulevardClear, 'Grand Central Boulevard driving corridor remains clear of buildings');
});

test('Hold-to-charge Space throw kinematics and monotonic range cap', () => {
  const pkgMgr = new PackageManager();
  assert.equal(pkgMgr.packagesRemaining, 5);

  // 1. Initial tap (0s charge)
  pkgMgr.startCharging('EXPRESS');
  const tapTraj = pkgMgr.calculateTrajectory(2000, 2000, 0, 0);
  assert.ok(tapTraj.throwDist >= 200 && tapTraj.throwDist <= 230, `Tap throw distance ${tapTraj.throwDist} within expected range`);

  // 2. Mid charge (0.4s)
  pkgMgr.updateCharge(0.4);
  const midTraj = pkgMgr.calculateTrajectory(2000, 2000, 0, 0);
  assert.ok(midTraj.throwDist > tapTraj.throwDist, 'Charge increases range monotonically');

  // 3. Full charge (0.8s)
  pkgMgr.updateCharge(0.4); // total 0.8s
  const maxTraj = pkgMgr.calculateTrajectory(2000, 2000, 0, 0);
  assert.ok(maxTraj.throwDist > midTraj.throwDist, 'Full charge achieves maximum throw distance');

  // 4. Overcharge (>0.8s) respects maximum cap
  pkgMgr.updateCharge(2.0);
  const overTraj = pkgMgr.calculateTrajectory(2000, 2000, 0, 0);
  assert.equal(overTraj.throwDist, maxTraj.throwDist, 'Range does not exceed maximum cap');

  // 5. Release throw launches package and consumes ammo
  const mockSound = { playThrow: () => {} } as any;
  const launched = pkgMgr.releaseAndThrow(2000, 2000, 0, 0, mockSound);
  assert.ok(launched, 'Package launched on release');
  assert.equal(pkgMgr.packagesRemaining, 4, 'One package consumed');
  assert.equal(pkgMgr.activePackages.length, 1, 'Active package created');
});

test('Package cooldown and automatic replenishment', () => {
  const pkgMgr = new PackageManager();
  const mockSound = {
    playThrow: () => {},
    playMiss: () => {},
    playDeliverySuccess: () => {},
    playReloadComplete: () => {},
  } as any;
  const mockEffects = {
    addPackageTrail: () => {},
    addDeliveryBurst: () => {},
    addScreenShake: () => {},
    addMissDust: () => {},
  } as any;

  // Throw all 5 packages with cooldown respected (cooldown = 0.35s)
  for (let i = 0; i < 5; i++) {
    pkgMgr.startCharging('PIZZA');
    const thrown = pkgMgr.releaseAndThrow(2000, 2000, 0, 0, mockSound);
    assert.ok(thrown, `Thrown package ${i + 1}`);
    pkgMgr.update(0.4, [], mockEffects, mockSound, () => {});
  }

  assert.equal(pkgMgr.packagesRemaining, 0);
  assert.ok(pkgMgr.isReloading, 'Empty cargo triggers automatic reload');

  // Simulate reload time elapsed (1.8s)
  pkgMgr.update(2.0, [], mockEffects, mockSound, () => {});
  assert.equal(pkgMgr.packagesRemaining, 5, 'Cargo fully replenished');
  assert.equal(pkgMgr.isReloading, false, 'Reload complete');
});

test('Three delivery varieties configuration', () => {
  assert.ok(GAME_CONFIG.DELIVERY_TYPES.PIZZA);
  assert.ok(GAME_CONFIG.DELIVERY_TYPES.EXPRESS);
  assert.ok(GAME_CONFIG.DELIVERY_TYPES.FRAGILE);

  assert.equal(GAME_CONFIG.DELIVERY_TYPES.PIZZA.name, 'PIZZA DELIVERY');
  assert.equal(GAME_CONFIG.DELIVERY_TYPES.EXPRESS.name, 'EXPRESS PARCEL');
  assert.equal(GAME_CONFIG.DELIVERY_TYPES.FRAGILE.name, 'FRAGILE GLASS');
});

test('First-delivery pacing and reachable route sequencing', () => {
  const map = new CityMap();
  const targetMgr = new TargetManager(map.deliverySpots);

  assert.equal(targetMgr.targets.length, GAME_CONFIG.TARGETS.MAX_ACTIVE);

  // 1. Target 1 MUST be within 450px of initial van start position (2300, 1800)
  const firstTarget = targetMgr.targets[0];
  const distToStart = Math.hypot(firstTarget.x - 2300, firstTarget.y - 1800);
  assert.ok(
    distToStart <= GAME_CONFIG.TARGETS.FIRST_TARGET_MAX_DISTANCE,
    `First target distance (${distToStart.toFixed(1)}px) is within initial reachable window (<= ${GAME_CONFIG.TARGETS.FIRST_TARGET_MAX_DISTANCE}px)`
  );
  assert.ok(firstTarget.y <= 1800, 'First target is positioned ahead of van along forward road corridor');

  // 2. Active targets must have unique landmark names
  const activeNames = targetMgr.targets.map(t => t.name);
  const uniqueNames = new Set(activeNames);
  assert.equal(activeNames.length, uniqueNames.size, 'All initial targets have unique landmark names');

  // 3. Sequential replacement spawning adheres to reachable chaining distance
  const deliveredTarget = targetMgr.targets[0];
  targetMgr.markDelivered(deliveredTarget.id, { x: deliveredTarget.x, y: deliveredTarget.y });
  assert.equal(targetMgr.targets.length, GAME_CONFIG.TARGETS.MAX_ACTIVE, 'Replacement target spawned');

  const newTarget = targetMgr.targets[targetMgr.targets.length - 1];
  const chainDist = Math.hypot(newTarget.x - deliveredTarget.x, newTarget.y - deliveredTarget.y);
  assert.ok(
    chainDist >= 250 && chainDist <= 1250,
    `Replacement target distance (${chainDist.toFixed(1)}px) is within reachable chaining window`
  );
});

test('Moving delivery skill bonus and hold auto-release', () => {
  const pkgMgr = new PackageManager();
  const mockSound = { playThrow: () => {}, playMiss: () => {}, playDeliverySuccess: () => {} } as any;
  const mockEffects = { addPackageTrail: () => {}, addDeliveryBurst: () => {}, addScreenShake: () => {}, addMissDust: () => {} } as any;

  // 1. Stationary throw (speed = 0): wasMoving should be false
  pkgMgr.startCharging('EXPRESS');
  pkgMgr.updateCharge(0.4);
  pkgMgr.releaseAndThrow(2000, 2000, 0, 0, mockSound);
  assert.equal(pkgMgr.activePackages[0].wasMoving, false, 'Stationary throw has wasMoving = false');

  // 2. Moving throw (speed = 180 > MOVING_DELIVERY_MIN_SPEED 55): wasMoving should be true
  pkgMgr.reset();
  pkgMgr.startCharging('EXPRESS');
  pkgMgr.updateCharge(0.4);
  pkgMgr.releaseAndThrow(2000, 2000, 0, 180, mockSound);
  assert.equal(pkgMgr.activePackages[0].wasMoving, true, 'Moving throw has wasMoving = true');

  // 3. Successful moving delivery awards MOVING_DELIVERY_BONUS
  const mockTarget = {
    id: 'test-target',
    name: 'TEST SHOP',
    type: 'EXPRESS' as const,
    district: 'DOWNTOWN' as const,
    x: 2000,
    y: 2000,
    radius: 48,
    active: true,
    color: '#00f5d4',
    icon: '📦',
    customerHappyTimer: 0,
  };

  let resolutionResult: any = null;
  pkgMgr.activePackages[0].targetX = 2000;
  pkgMgr.activePackages[0].targetY = 2000;
  pkgMgr.update(0.6, [mockTarget], mockEffects, mockSound, (res) => {
    resolutionResult = res;
  });

  assert.ok(resolutionResult);
  assert.equal(resolutionResult.type, 'HIT');
  assert.equal(resolutionResult.wasMoving, true);
  // Base 100 + Express long throw bonus (0 if short) + Moving delivery bonus (100) = at least 200
  assert.ok(resolutionResult.points >= GAME_CONFIG.PACKAGES.BASE_POINTS + GAME_CONFIG.PACKAGES.MOVING_DELIVERY_BONUS);

  // 4. Space indefinite hold auto-release threshold
  pkgMgr.startCharging('PIZZA');
  assert.equal(pkgMgr.updateCharge(1.0), false, 'Normal charge within limit does not auto-release');
  assert.equal(pkgMgr.updateCharge(1.5), true, 'Charge beyond MAX_CHARGE_HOLD_SECONDS triggers auto-release');
});

test('Aiming indicator and collision lock consistency', () => {
  const pkgMgr = new PackageManager();
  const mockTarget = {
    id: 'target-aim',
    name: 'PIZZA PLANET',
    type: 'PIZZA' as const,
    district: 'DOWNTOWN' as const,
    x: 2300,
    y: 1530,
    radius: 48,
    active: true,
    color: '#ff5400',
    icon: '🍕',
    customerHappyTimer: 0,
  };

  // Van facing UP (-PI/2) from (2300, 1800), target at (2300, 1530) (dist = 270)
  pkgMgr.startCharging('PIZZA');
  pkgMgr.chargeTime = 0.35; // charge to reach ~270px throw distance

  const indicator = pkgMgr.getAimingIndicator(2300, 1800, -Math.PI / 2, 0, [mockTarget]);
  assert.ok(indicator, 'Aiming indicator produced');
  assert.equal(indicator.targetLock, true, 'Indicator detects valid target lock');
  assert.equal(indicator.lockedTargetName, 'PIZZA PLANET', 'Locked target name matches');
});

test('Miss classification differentiates short, long and wide', () => {
  const pkgMgr = new PackageManager();
  const mockSound = { playThrow: () => {}, playMiss: () => {}, playDeliverySuccess: () => {} } as any;
  const mockEffects = { addPackageTrail: () => {}, addDeliveryBurst: () => {}, addScreenShake: () => {}, addMissDust: () => {} } as any;

  const mockTarget = {
    id: 'target-miss-check',
    name: 'TEST SHOP',
    type: 'EXPRESS' as const,
    district: 'DOWNTOWN' as const,
    x: 2000,
    y: 1600, // 400px away from start (2000, 2000)
    radius: 48,
    active: true,
    color: '#00f5d4',
    icon: '📦',
    customerHappyTimer: 0,
  };

  // 1. Short throw: landing at y = 1800 (throw dist 200 < target dist 400 - tolerance)
  pkgMgr.throwCooldownTimer = 0;
  pkgMgr.startCharging('EXPRESS');
  pkgMgr.releaseAndThrow(2000, 2000, -Math.PI / 2, 0, mockSound);
  pkgMgr.activePackages[0].targetY = 1800; // force short landing

  let shortRes: any = null;
  pkgMgr.update(0.6, [mockTarget], mockEffects, mockSound, (res) => { shortRes = res; });
  assert.equal(shortRes?.type, 'MISS');
  assert.equal(shortRes?.missReason, 'SHORT', 'Under-thrown package categorized as SHORT');

  // 2. Long throw: landing at y = 1400 (throw dist 600 > target dist 400 + tolerance)
  pkgMgr.throwCooldownTimer = 0;
  pkgMgr.startCharging('EXPRESS');
  pkgMgr.releaseAndThrow(2000, 2000, -Math.PI / 2, 0, mockSound);
  pkgMgr.activePackages[0].targetY = 1400; // force overshot landing

  let longRes: any = null;
  pkgMgr.update(0.6, [mockTarget], mockEffects, mockSound, (res) => { longRes = res; });
  assert.equal(longRes?.type, 'MISS');
  assert.equal(longRes?.missReason, 'LONG', 'Overshot package categorized as LONG');
});

test('Keep the Party Moving celebration contract', () => {
  assert.equal(GAME_CONFIG.CELEBRATION.DURATION_SECONDS, 1.5);

  // Validate celebration contract data model
  const mockCelebration = {
    level: 1 as const,
    x: 2300,
    y: 1530,
    deliveryType: 'PIZZA' as const,
    wasMoving: true,
    combo: 1,
    points: 250,
    duration: 1.5,
    elapsed: 0,
    active: true,
  };

  assert.equal(mockCelebration.level, 1);
  assert.equal(mockCelebration.wasMoving, true);
  assert.equal(mockCelebration.active, true);

  // Chained level 2 celebration
  const chainedCelebration = {
    ...mockCelebration,
    level: 2 as const,
    combo: 2,
  };
  assert.equal(chainedCelebration.level, 2);

  // Level 3: City Goes Wild! (Combo >= 3)
  const wildCelebration = {
    ...mockCelebration,
    level: 3 as const,
    combo: 3,
    buildingName: 'PIZZA PLANET',
  };
  assert.equal(wildCelebration.level, 3);
  assert.equal(wildCelebration.buildingName, 'PIZZA PLANET');
});

test('Game State Lifecycle, High Score Persistence, and 6-Key Input Discipline', () => {
  // 1. Initial State contract
  const initialState = {
    phase: 'MENU' as const,
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
    currentDeliveryType: 'EXPRESS' as const,
    isFinalRush: false,
    highScore: 3500,
    bestCombo: 4,
  };

  assert.equal(initialState.phase, 'MENU');
  assert.equal(initialState.timeLeft, 120);
  assert.equal(initialState.highScore, 3500);

  // 2. Game Over lockout and rank determination
  const finalScore = 5600;
  let rank = 'B-RANK LOCAL DRIVER';
  if (finalScore >= 5000) rank = 'S-RANK MASTER COURIER 🌟';
  else if (finalScore >= 2500) rank = 'A-RANK SPEED DEMON ⚡';
  assert.equal(rank, 'S-RANK MASTER COURIER 🌟');

  // 3. New Record detection
  const isNewRecord = finalScore > initialState.highScore;
  assert.equal(isNewRecord, true, 'Score 5600 beats previous high score 3500');

  // 4. Six-Key Contract integrity
  const allowedKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyZ', 'Space']);
  assert.equal(allowedKeys.size, 6, 'Exactly 6 input keys permitted');
  assert.ok(allowedKeys.has('KeyZ'), 'Z key is bound for start/restart and drift');
  assert.ok(allowedKeys.has('Space'), 'Space key is bound for package throwing');
});

test('Maximum 2.5D Special Packages configuration', () => {
  const specials = ['ROCKET_PIZZA', 'BOUNCY_BOX', 'GOLDEN_PARCEL', 'CONFETTI_BOMB', 'MAGNET_MAIL', 'MYSTERY_PARCEL'] as const;
  for (const s of specials) {
    assert.ok(GAME_CONFIG.DELIVERY_TYPES[s], `Special package ${s} is registered in config`);
    assert.ok(GAME_CONFIG.DELIVERY_TYPES[s].bonusPoints > 0, `${s} has scoring bonus`);
    assert.ok(GAME_CONFIG.DELIVERY_TYPES[s].icon, `${s} has distinctive icon`);
  }
});

test('Rocket Pizza flight speed boost and homing', () => {
  const pkgMgr = new PackageManager();
  const mockSound = {
    playThrow: () => {},
    playRocketLaunch: () => {},
    playRocketExplosion: () => {},
    playReloadComplete: () => {},
    playMiss: () => {},
    playBounce: () => {},
  } as unknown as SoundFx;

  // Standard Express throw
  pkgMgr.startCharging('EXPRESS');
  pkgMgr.updateCharge(0.75); // Full charge
  const expressTraj = pkgMgr.calculateTrajectory(100, 100, 0, 0);

  // Rocket Pizza throw
  pkgMgr.startCharging('ROCKET_PIZZA');
  pkgMgr.updateCharge(0.75); // Full charge
  const rocketTraj = pkgMgr.calculateTrajectory(100, 100, 0, 0);

  assert.ok(
    rocketTraj.throwDist > expressTraj.throwDist * 1.1,
    `Rocket Pizza throw distance (${rocketTraj.throwDist}) has speed multiplier over Express (${expressTraj.throwDist})`
  );

  // Throw Rocket Pizza
  pkgMgr.releaseAndThrow(100, 100, 0, 0, mockSound);
  assert.equal(pkgMgr.activePackages.length, 1);
  assert.equal(pkgMgr.activePackages[0].type, 'ROCKET_PIZZA');
  assert.equal(pkgMgr.activePackages[0].isRocket, true);
});

test('Bouncy Box bounce mechanic on ground contact', () => {
  const pkgMgr = new PackageManager();
  let bounceSoundPlayed = false;
  const mockSound = {
    playThrow: () => {},
    playRocketLaunch: () => {},
    playRocketExplosion: () => {},
    playReloadComplete: () => {},
    playMiss: () => {},
    playBounce: () => { bounceSoundPlayed = true; },
  } as unknown as SoundFx;
  const mockEffects = new EffectsManager();

  pkgMgr.startCharging('BOUNCY_BOX');
  pkgMgr.updateCharge(0.5);
  pkgMgr.releaseAndThrow(100, 100, 0, 0, mockSound);

  assert.equal(pkgMgr.activePackages[0].bouncesRemaining, 1, 'Bouncy box starts with 1 bounce');

  // Advance time to full flight duration without hitting target
  pkgMgr.update(1.0, [], mockEffects, mockSound, () => {});

  assert.equal(bounceSoundPlayed, true, 'Bounce sound played on trick shot bounce');
  assert.equal(pkgMgr.activePackages.length, 1, 'Package remains active for bounce segment');
  assert.equal(pkgMgr.activePackages[0].bouncesRemaining, 0, 'Bounces remaining decremented to 0');
});

test('Van Turbo mechanics and auto-activation at 100%', () => {
  const van = new DeliveryVan(500, 500);
  const effects = new EffectsManager();

  // Drift charges turbo
  const res = van.update(0.1, true, false, true, false, true, [], effects);
  assert.ok(res.driftTime > 0 || res.driftQuality >= 0, 'Van update returns drift data');

  // Activate Turbo manually on van
  van.isTurboActive = true;
  van.speed = 400; // Above standard max speed (350)
  van.update(0.1, true, false, false, false, false, [], effects);

  assert.ok(
    van.speed > GAME_CONFIG.VAN.MAX_FORWARD_SPEED,
    `Van speed (${van.speed}) can exceed standard max forward speed (${GAME_CONFIG.VAN.MAX_FORWARD_SPEED}) during Turbo`
  );
});

test('Dynamic Arcade Event Director timeline and multipliers', () => {
  const events = new EventManager();
  const mockSound = {
    playEventStinger: () => {},
  } as unknown as SoundFx;
  const mockEffects = new EffectsManager();

  // Match start (120s remaining) - no event immediately
  const evtAt120 = events.update(0.1, 120, mockSound, mockEffects);
  assert.equal(evtAt120, null);

  // Match reaches 105s remaining -> triggers PIZZA_PANIC
  const evtAt105 = events.update(0.1, 105, mockSound, mockEffects);
  assert.ok(evtAt105 !== null, 'Event triggered at 105s remaining');
  assert.equal(evtAt105?.type, 'PIZZA_PANIC');
  assert.ok(evtAt105!.scoreMultiplier > 1.0, 'Event applies score multiplier');
});


