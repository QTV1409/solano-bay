// The city's other inhabitants: traffic that stays on the roads, pedestrians on the road
// edges, and the bay police who answer the wanted level. Traffic never leaves a road, so it
// never hits a building; police chase Mara with arcade car physics and ram her when close.
// Every cooldown here is load-bearing: without one, a single overlapping frame adds a star
// per frame and the wanted level jumps 0 to 5 in under a second.
import { CAR, PEDESTRIAN, POLICE, ROAD, ROAD_CENTRES, TRAFFIC, WANTED, WORLD } from './config.js';
import { addCrime, addParticles, collideBuildings, isRoad } from './world.js';
import { int, pick, range } from './random.js';

const TRAFFIC_HUES = [215, 8, 38, 145, 95, 265, 48, 330, 0, 190];

function randomRoadPoint(random) {
  const centre = pick(random, ROAD_CENTRES);
  if (random() < 0.5) return { x: range(random, 200, WORLD.size - 200), y: centre, axis: 'h' };
  return { x: centre, y: range(random, 200, WORLD.size - 200), axis: 'v' };
}

/** Ten traffic cars, each driving one road axis at 90–145 px/s. */
export function spawnTraffic(state) {
  const { rng } = state;
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const spot = randomRoadPoint(rng);
    const axis = spot.axis;
    const dir = rng() < 0.5 ? 1 : -1;
    const car = {
      kind: 'traffic',
      x: spot.x,
      y: spot.y,
      // Angle convention: 0 = up (-y), PI/2 = right (+x). Match the angle to the axis and direction.
      angle: axis === 'h' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? Math.PI : 0,
      speed: range(rng, TRAFFIC.minSpeed, TRAFFIC.maxSpeed),
      hue: pick(rng, TRAFFIC_HUES),
      style: pick(rng, ['sedan', 'sedan', 'hatch', 'truck']),
      axis,
      dir,
      cool: 0,
      turnTimer: 0,
    };
    state.cars.push(car);
  }
}

/** Twelve pedestrians walking the road edges, turning at random. */
export function spawnPeds(state) {
  const { rng } = state;
  for (let i = 0; i < PEDESTRIAN.count; i += 1) {
    const spot = randomRoadPoint(rng);
    const edge = pick(rng, [-1, 1]) * (ROAD.width / 2 + 10);
    state.peds.push({
      x: spot.x + edge,
      y: spot.y + edge,
      angle: rng() * Math.PI * 2,
      speed: range(rng, PEDESTRIAN.minSpeed, PEDESTRIAN.maxSpeed),
      sprite: int(rng, 0, 7),
      frame: 0,
      frameTimer: range(rng, 0, 0.3),
      turnTimer: range(rng, 1, 4),
      cool: 0,
      stunned: 0,
    });
  }
}

function onRoadCentre(value) {
  for (const centre of ROAD_CENTRES) {
    if (Math.abs(value - centre) <= 8) return centre;
  }
  return null;
}

function stepTrafficCar(state, car, dt) {
  if (car.cool > 0) car.cool -= dt;
  const centreX = onRoadCentre(car.x);
  const centreY = onRoadCentre(car.y);
  if (centreX !== null && centreY !== null) {
    car.turnTimer -= dt;
    if (car.turnTimer <= 0) {
      car.turnTimer = range(state.rng, 1.5, 4);
      if (state.rng() < 0.45) {
        if (car.axis === 'h') {
          car.axis = 'v';
          car.dir = state.rng() < 0.5 ? 1 : -1;
          car.x = centreX;
        } else {
          car.axis = 'h';
          car.dir = state.rng() < 0.5 ? 1 : -1;
          car.y = centreY;
        }
      }
    }
  }
  if (car.axis === 'h') {
    car.x += car.dir * car.speed * dt;
    car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    car.y += car.dir * car.speed * dt;
    car.angle = car.dir > 0 ? Math.PI : 0;
  }
  // Wrap around the far edge so the city never runs out of traffic.
  if (car.x < -60) car.x = WORLD.size + 60;
  if (car.x > WORLD.size + 60) car.x = -60;
  if (car.y < -60) car.y = WORLD.size + 60;
  if (car.y > WORLD.size + 60) car.y = -60;
}

/** Traffic drives on; a hard hit from Mara's car is a crime, a scrape is just a scrape. */
export function stepTraffic(state, dt, audio) {
  const player = state.player;
  for (const car of state.cars) {
    if (car.kind !== 'traffic') continue;
    stepTrafficCar(state, car, dt);
    const dx = car.x - player.x;
    const dy = car.y - player.y;
    const rr = TRAFFIC.radius + CAR.radius;
    if (dx * dx + dy * dy >= rr * rr) continue;
    const playerSpeed = player.onFoot ? 0 : Math.abs(player.car?.speed ?? 0);
    if (car.cool > 0) continue;
    car.cool = 3;
    if (!player.onFoot) {
      player.car.speed *= 0.45;
      car.speed *= 0.5;
    }
    addParticles(state, (car.x + player.x) / 2, (car.y + player.y) / 2, 12, '#ffd23f', 160);
    if (playerSpeed > 150) {
      addCrime(state, WANTED.hitStars);
      if (audio) audio.sfx.crash(0);
    } else if (audio) {
      audio.sfx.crash(0);
    }
  }
}

export function stepPeds(state, dt) {
  const player = state.player;
  for (const ped of state.peds) {
    if (ped.cool > 0) ped.cool -= dt;
    if (ped.stunned > 0) {
      ped.stunned -= dt;
      ped.x += Math.sin(ped.angle) * 60 * dt;
      ped.y -= Math.cos(ped.angle) * 60 * dt;
      continue;
    }
    ped.turnTimer -= dt;
    if (ped.turnTimer <= 0) {
      ped.turnTimer = range(state.rng, 2, 6);
      ped.angle += pick(state.rng, [-Math.PI / 2, Math.PI / 2, Math.PI]);
    }
    ped.x += Math.sin(ped.angle) * ped.speed * dt;
    ped.y -= Math.cos(ped.angle) * ped.speed * dt;
    if (!isRoad(ped.x, ped.y)) {
      ped.angle += Math.PI;
      ped.x += Math.sin(ped.angle) * ped.speed * dt * 2;
      ped.y -= Math.cos(ped.angle) * ped.speed * dt * 2;
    }
    ped.frameTimer -= dt;
    if (ped.frameTimer <= 0) {
      ped.frameTimer = 0.15;
      ped.frame = 1 - ped.frame;
    }
    const dx = ped.x - player.x;
    const dy = ped.y - player.y;
    const rr = PEDESTRIAN.radius + (player.onFoot ? 13 : CAR.radius);
    if (dx * dx + dy * dy >= rr * rr || ped.cool > 0) continue;
    ped.cool = 3;
    const playerSpeed = player.onFoot ? 0 : Math.abs(player.car?.speed ?? 0);
    if (!player.onFoot && playerSpeed > 100) {
      addCrime(state, WANTED.hitStars);
      addParticles(state, ped.x, ped.y, 10, '#ff5d8f', 140);
      ped.stunned = 1.2;
      ped.angle = Math.atan2(player.x - ped.x, -(player.y - ped.y));
    }
  }
}

/** One police car per wanted star, spawned on a road at least 420 px from Mara. */
export function stepPolice(state, dt, audio) {
  const { rng } = state;
  const player = state.player;
  const wantedPolice = Math.min(state.wanted, POLICE.maxActive);
  let police = state.cars.filter((car) => car.kind === 'police');
  while (police.length < wantedPolice) {
    const spot = randomRoadPoint(rng);
    const dx = spot.x - player.x;
    const dy = spot.y - player.y;
    if (dx * dx + dy * dy < POLICE.spawnDistance * POLICE.spawnDistance) continue;
    const car = {
      kind: 'police',
      x: spot.x,
      y: spot.y,
      angle: 0,
      speed: 0,
      hue: 0,
      style: 'police',
      axis: 'h',
      dir: 1,
      cool: 0,
      turnTimer: 0,
    };
    state.cars.push(car);
    police.push(car);
  }
  while (police.length > wantedPolice) {
    const car = police.pop();
    car.kind = 'gone';
  }
  state.cars = state.cars.filter((car) => car.kind !== 'gone');
  const policeList = state.cars.filter((car) => car.kind === 'police');
  policeList.forEach((car, index) => {
    if (car.cool > 0) car.cool -= dt;
    // Each car aims at its own offset beside Mara, so they fan out around her instead of
    // stacking on one point and ramming in rotation.
    const offset = (index - (policeList.length - 1) / 2) * 70;
    const tx = player.x + Math.cos(player.angle) * offset;
    const ty = player.y + Math.sin(player.angle) * offset;
    const dx = tx - car.x;
    const dy = ty - car.y;
    const dist = Math.hypot(dx, dy) || 1;
    const targetAngle = Math.atan2(dx, -dy);
    let diff = targetAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-POLICE.turnRate * dt, Math.min(POLICE.turnRate * dt, diff));
    car.speed = Math.min(POLICE.maxSpeed, car.speed + POLICE.accel * dt);
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.y -= Math.cos(car.angle) * car.speed * dt;
    if (collideBuildings(state.city, car, CAR.radius)) car.speed *= 0.5;
    const touchDist = Math.hypot(player.x - car.x, player.y - car.y);
    if (touchDist < CAR.radius + (player.onFoot ? 13 : CAR.radius) + 4) {
      // A ram is one hit, not a continuous drain: the car bumps Mara, falls back, and
      // comes around again. Cars draining health every frame would bust her in a second,
      // and a chase that ends before the frame is taken shows nothing.
      if (car.cool <= 0) {
        car.cool = 2.5;
        state.health -= POLICE.ramDamage;
        car.speed *= 0.3;
        if (player.invuln === 0) player.invuln = 0.4;
        addParticles(state, player.x, player.y, 8, '#ff5a4e', 140);
        if (audio) audio.sfx.crash(0);
      }
    }
  });
}
