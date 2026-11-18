// The city and the game state, with no drawing and no browser in it: Solano Bay's roads,
// buildings, park and beach are drawn once from the seed, and stepPlayer moves Mara on foot
// or in her car, bounces her off buildings, and keeps the wanted clock ticking. Traffic,
// pedestrians, police, missions and combat live in their own files and work on this state.
import {
  BUSTED_FINE,
  CAR,
  PARKED,
  PLAYER,
  ROAD,
  ROAD_CENTRES,
  START,
  WANTED,
  WORLD,
} from './config.js';
import { createRandom, int, pick, range } from './random.js';

export const EVENT_BUSTED = 1;
export const EVENT_CRASH = 2;
export const EVENT_PICKUP = 4;

/** Five restrained roof palettes: a city of five roofs reads as a city, fifty hues read as confetti. */
const ROOFS = [
  { roof: '#8a8f96', edge: '#6e7278' },
  { roof: '#a9714b', edge: '#8a5738' },
  { roof: '#9c4f42', edge: '#7d3d33' },
  { roof: '#5d6f8a', edge: '#47566b' },
  { roof: '#6d8a5a', edge: '#557044' },
];

const CAR_PAINTS = [215, 8, 38, 145, 95, 265, 48, 330, 0, 190];

/** The one park block, between the 1120 and 1440 roads, at the heart of Neon Row. */
export const PARK = { x: 1168, y: 1168, w: 224, h: 224 };

/** The beach strip: water west of x=70, sand from 70 to the first road's sidewalk. */
export const BEACH = { waterTo: 70, sandTo: 112 };

function inPark(x, y) {
  return x > PARK.x && x < PARK.x + PARK.w && y > PARK.y && y < PARK.y + PARK.h;
}

function inBeach(x) {
  return x < BEACH.sandTo;
}

/** True when the point sits on a road (within half a road width of a centre on either axis). */
export function isRoad(x, y) {
  const half = ROAD.width / 2;
  let onVertical = false;
  let onHorizontal = false;
  for (const centre of ROAD_CENTRES) {
    if (Math.abs(x - centre) <= half) onVertical = true;
    if (Math.abs(y - centre) <= half) onHorizontal = true;
  }
  return onVertical || onHorizontal;
}

function nearestCentre(value) {
  let best = ROAD_CENTRES[0];
  for (const centre of ROAD_CENTRES) {
    if (Math.abs(centre - value) < Math.abs(best - value)) best = centre;
  }
  return best;
}

/** The nearest intersection to a point: where the road-following autopilot starts its route. */
export function nearestIntersection(x, y) {
  return { x: nearestCentre(x), y: nearestCentre(y) };
}

/** A point on a road inside a district, for mission markers and parked cars. */
export function roadPointInDistrict(random, district) {
  const quadrants = {
    'Old Town': [480, 480],
    'Palm Heights': [2080, 480],
    'Marina District': [480, 2080],
    'The Docks': [2080, 2080],
    'Neon Row': [1440, 1440],
  };
  const base = quadrants[district] ?? [1280, 1280];
  const centre = pick(random, ROAD_CENTRES);
  if (random() < 0.5) return { x: centre, y: base[1] + range(random, -140, 140) };
  return { x: base[0] + range(random, -140, 140), y: centre };
}

export function districtAt(x, y) {
  const dx = x - WORLD.size / 2;
  const dy = y - WORLD.size / 2;
  if (Math.abs(dx) < 500 && Math.abs(dy) < 500) return 'Neon Row';
  if (x < WORLD.size / 2) return y < WORLD.size / 2 ? 'Old Town' : 'Marina District';
  return y < WORLD.size / 2 ? 'Palm Heights' : 'The Docks';
}

/** Build the city from the seed: roads, buildings in the blocks, trees and lamps. */
export function createCity(random) {
  const roads = [];
  for (const centre of ROAD_CENTRES) {
    roads.push({ x: 0, y: centre - ROAD.width / 2, w: WORLD.size, h: ROAD.width, axis: 'h' });
    roads.push({ x: centre - ROAD.width / 2, y: 0, w: ROAD.width, h: WORLD.size, axis: 'v' });
  }
  const buildings = [];
  const trees = [];
  const lamps = [];
  for (let row = 0; row < ROAD_CENTRES.length - 1; row += 1) {
    for (let col = 0; col < ROAD_CENTRES.length - 1; col += 1) {
      const bx = ROAD_CENTRES[col] + ROAD.width / 2;
      const by = ROAD_CENTRES[row] + ROAD.width / 2;
      const bw = ROAD.spacing - ROAD.width;
      const bh = ROAD.spacing - ROAD.width;
      if (bx < BEACH.sandTo) continue;
      if (bx + bw > PARK.x && bx < PARK.x + PARK.w && by + bh > PARK.y && by < PARK.y + PARK.h) {
        for (let t = 0; t < 9; t += 1) {
          trees.push({ x: bx + range(random, 24, bw - 24), y: by + range(random, 24, bh - 24), variant: int(random, 0, 2) });
        }
        continue;
      }
      const palette = pick(random, ROOFS);
      const split = random() < 0.45;
      if (split) {
        const w1 = range(random, 80, 110);
        buildings.push({ x: bx + 8, y: by + 8, w: w1, h: bh - 16, ...palette, seed: random() });
        buildings.push({ x: bx + w1 + 16, y: by + 8, w: bw - w1 - 24, h: bh - 16, ...palette, seed: random() });
      } else {
        buildings.push({ x: bx + 8, y: by + 8, w: bw - 16, h: bh - 16, ...palette, seed: random() });
      }
      if (random() < 0.6) {
        trees.push({ x: bx + range(random, 10, bw - 10), y: by + range(random, 10, bh - 10), variant: int(random, 0, 2) });
      }
    }
  }
  for (const centre of ROAD_CENTRES) {
    for (const other of ROAD_CENTRES) {
      lamps.push({ x: centre + ROAD.width / 2 + 8, y: other + ROAD.width / 2 + 8 });
    }
  }
  return { roads, buildings, trees, lamps };
}

function makeCar(random, kind, x, y, angle) {
  return {
    kind,
    x,
    y,
    angle,
    speed: 0,
    hue: pick(random, CAR_PAINTS),
    style: pick(random, ['sedan', 'sedan', 'hatch', 'truck']),
    axis: random() < 0.5 ? 'h' : 'v',
    dir: random() < 0.5 ? 1 : -1,
    cool: 0,
    turnTimer: 0,
  };
}

export function createGame(seed) {
  const rng = createRandom(seed);
  const state = {
    seed,
    rng,
    city: createCity(rng),
    time: 0,
    sunset: 0.55,
    money: 0,
    wanted: 0,
    wantedIdle: 0,
    shootCooldown: 0,
    health: 100,
    player: {
      x: START.x,
      y: START.y,
      angle: START.angle,
      onFoot: false,
      speed: 0,
      car: null,
      invuln: 0,
      stepTimer: 0,
      shootTimer: 0,
    },
    cars: [],
    peds: [],
    bullets: [],
    enemies: [],
    particles: [],
    mission: null,
    storyIndex: 0,
    storyDone: false,
    jobsDone: 0,
    message: '',
    messageTimer: 0,
    camera: { x: START.x, y: START.y },
    busted: false,
    stats: { deliveries: 0, carsStolen: 0, shots: 0, crimes: 0 },
    ground: null,
    minimap: null,
    sprites: null,
  };
  return state;
}

/** Put Mara in her courier car and scatter traffic, pedestrians and parked cars. */
export function populate(state) {
  const { rng } = state;
  state.cars = [];
  state.peds = [];
  state.bullets = [];
  state.enemies = [];
  state.particles = [];
  const car = makeCar(rng, 'player', START.x, START.y, START.angle);
  car.hue = 48;
  car.style = 'sedan';
  state.cars.push(car);
  state.player.car = car;
  state.player.onFoot = false;
  state.player.x = START.x;
  state.player.y = START.y;
  state.player.angle = START.angle;
  state.player.speed = 0;
  for (let i = 0; i < PARKED.count; i += 1) {
    const spot = roadPointInDistrict(rng, pick(rng, ['Old Town', 'Palm Heights', 'Marina District', 'The Docks']));
    const parked = makeCar(rng, 'parked', spot.x, spot.y, pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]));
    state.cars.push(parked);
  }
}

/** Push a circle out of every building it overlaps; returns true when it hit one. */
export function collideBuildings(city, body, radius) {
  let hit = false;
  for (const b of city.buildings) {
    const nearestX = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const nearestY = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - nearestX;
    const dy = body.y - nearestY;
    const distSq = dx * dx + dy * dy;
    if (distSq >= radius * radius) continue;
    hit = true;
    if (distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      body.x = nearestX + (dx / dist) * radius;
      body.y = nearestY + (dy / dist) * radius;
    } else if (body.x < b.x + b.w / 2) {
      body.x = b.x - radius;
    } else {
      body.x = b.x + b.w + radius;
    }
  }
  return hit;
}

function clampToWorld(body, margin) {
  body.x = Math.max(margin, Math.min(WORLD.size - margin, body.x));
  body.y = Math.max(margin, Math.min(WORLD.size - margin, body.y));
}

export function addCrime(state, stars) {
  state.wanted = Math.min(WANTED.max, state.wanted + stars);
  state.wantedIdle = 0;
  state.stats.crimes += 1;
}

export function addParticles(state, x, y, count, color, speed) {
  for (let i = 0; i < count; i += 1) {
    const angle = state.rng() * Math.PI * 2;
    const vel = range(state.rng, speed * 0.3, speed);
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * vel,
      vy: Math.sin(angle) * vel,
      life: range(state.rng, 0.3, 0.7),
      maxLife: 0.7,
      color,
      size: range(state.rng, 2, 5),
    });
  }
  if (state.particles.length > 220) state.particles.splice(0, state.particles.length - 220);
}

function stepParticles(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.life -= dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

/** Drive or walk Mara for one fixed step. `drive` holds {up, down, left, right, brake}. */
export function stepPlayer(state, drive, dt) {
  const player = state.player;
  if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
  if (player.shootTimer > 0) player.shootTimer -= dt;
  if (player.onFoot) {
    const dx = (drive.right ? 1 : 0) - (drive.left ? 1 : 0);
    const dy = (drive.down ? 1 : 0) - (drive.up ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      player.x += (dx / len) * PLAYER.walkSpeed * dt;
      player.y += (dy / len) * PLAYER.walkSpeed * dt;
      player.angle = Math.atan2(dy, dx) + Math.PI / 2;
      player.stepTimer -= dt;
      if (player.stepTimer <= 0) {
        player.stepTimer = PLAYER.stepInterval;
        return 'step';
      }
    }
    collideBuildings(state.city, player, PLAYER.radius);
    clampToWorld(player, PLAYER.radius + 2);
    return null;
  }
  const car = player.car;
  if (!car) return null;
  const forward = drive.up ? 1 : 0;
  const reverse = drive.down ? 1 : 0;
  if (forward) car.speed += CAR.accel * dt;
  else if (reverse) car.speed -= CAR.accel * 0.8 * dt;
  else car.speed -= Math.sign(car.speed) * CAR.drag * 60 * dt;
  if (drive.brake) car.speed *= Math.pow(CAR.handbrake, dt * 60);
  car.speed = Math.max(-CAR.reverseMax, Math.min(CAR.maxSpeed, car.speed));
  if (Math.abs(car.speed) < 2 && !forward && !reverse) car.speed = 0;
  const steer = (drive.left ? -1 : 0) + (drive.right ? 1 : 0);
  const turnSign = car.speed >= 0 ? 1 : -1;
  const speedFactor = Math.min(1, Math.abs(car.speed) / 120);
  car.angle += steer * CAR.turnRate * speedFactor * turnSign * dt;
  car.x += Math.sin(car.angle) * car.speed * dt;
  car.y -= Math.cos(car.angle) * car.speed * dt;
  if (collideBuildings(state.city, car, CAR.radius)) {
    if (Math.abs(car.speed) > 160) return 'crash';
    car.speed *= 0.4;
  }
  clampToWorld(car, CAR.radius + 2);
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.speed = car.speed;
  return null;
}

/** The wanted clock: quiet for ten seconds and the heat cools off, one star at a time. */
export function stepWanted(state, dt) {
  if (state.shootCooldown > 0) state.shootCooldown -= dt;
  if (state.wanted === 0) return;
  state.wantedIdle += dt;
  if (state.wantedIdle >= WANTED.decayDelay) {
    state.wantedIdle = WANTED.decayDelay - WANTED.decayInterval;
    state.wanted = Math.max(0, state.wanted - 1);
    if (state.wanted === 0) state.message = 'You lost the cops. Stay clean.';
  }
}

/** Being busted: the fine, the reset, and a fresh car at the Old Town crossroads. */
export function bustPlayer(state) {
  state.money = Math.max(0, state.money - BUSTED_FINE);
  state.wanted = 0;
  state.wantedIdle = 0;
  state.health = 100;
  state.busted = true;
  for (const car of state.cars) {
    if (car.kind === 'police') car.kind = 'gone';
  }
  state.cars = state.cars.filter((car) => car.kind !== 'gone');
  state.enemies = [];
  state.bullets = [];
  // The car Mara was driving stays where it was, parked: the impound lot kept it, but the
  // street did not swallow it — and a later steal can take it back.
  if (state.player.car) {
    state.player.car.kind = 'parked';
    state.player.car.speed = 0;
  }
  const car = makeCar(state.rng, 'player', START.x, START.y, START.angle);
  car.hue = 48;
  car.style = 'sedan';
  state.cars.push(car);
  state.player.car = car;
  state.player.onFoot = false;
  state.player.x = START.x;
  state.player.y = START.y;
  state.player.angle = START.angle;
  state.player.speed = 0;
  state.camera.x = START.x;
  state.camera.y = START.y;
  if (state.mission) state.mission.timer = state.mission.fullTimer;
}

/** Ease the camera toward Mara so the frame never snaps. */
export function stepCamera(state, viewW, viewH, dt) {
  const targetX = state.player.x;
  const targetY = state.player.y;
  const ease = Math.min(1, dt * 5);
  state.camera.x += (targetX - state.camera.x) * ease;
  state.camera.y += (targetY - state.camera.y) * ease;
  const halfW = viewW / 2;
  const halfH = viewH / 2;
  state.camera.x = Math.max(halfW, Math.min(WORLD.size - halfW, state.camera.x));
  state.camera.y = Math.max(halfH, Math.min(WORLD.size - halfH, state.camera.y));
}

export function stepWorld(state, dt) {
  state.time += dt;
  state.sunset = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(state.time * 0.02));
  if (state.messageTimer > 0) {
    state.messageTimer -= dt;
    if (state.messageTimer <= 0) state.message = '';
  }
  stepParticles(state, dt);
  stepWanted(state, dt);
}

export function say(state, text, seconds) {
  state.message = text;
  state.messageTimer = seconds ?? 3;
}

export function resetRun(state) {
  state.money = 0;
  state.wanted = 0;
  state.wantedIdle = 0;
  state.health = 100;
  state.storyIndex = 0;
  state.storyDone = false;
  state.jobsDone = 0;
  state.mission = null;
  state.busted = false;
  state.time = 0;
  state.stats = { deliveries: 0, carsStolen: 0, shots: 0, crimes: 0 };
  populate(state);
}
