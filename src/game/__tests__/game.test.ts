import test from 'node:test';
import assert from 'node:assert/strict';

import { GAME_CONFIG } from '../config.ts';
import { CityMap } from '../map.ts';
import { PackageManager } from '../package.ts';

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
