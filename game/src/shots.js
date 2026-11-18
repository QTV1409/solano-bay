// The screenshot scenes behind ?shot=cover|drive|foot|title. Each one plays the real rules
// forward from a fresh run for a fixed number of steps, so the frame is what a short game
// really looks like and the same seed always gives the same frame. The driving autopilot
// follows roads — it routes through intersections, never in a straight line through blocks —
// brakes into sharp turns, and never stalls facing the wrong way.
import { STEP } from './config.js';
import { nearestIntersection } from './world.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const COVER_SECONDS = 10;
const DRIVE_SECONDS = 8;
const FOOT_SECONDS = 3;
const TITLE_SECONDS = 5;

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

/** Grid waypoints from Mara to the mission: nearest intersection, one road across, then in. */
function buildWaypoints(state) {
  const target = state.mission.target;
  const start = nearestIntersection(state.player.x, state.player.y);
  const end = nearestIntersection(target.x, target.y);
  return [start, { x: end.x, y: start.y }, end, target];
}

/**
 * Steer the car toward the current waypoint. Accelerate when roughly aligned or slow;
 * brake (reverse) when badly misaligned and fast — accelerating only when aligned stalls
 * the car facing the wrong way, and full speed into a turn wedges it into a building.
 */
function autopilotDrive(state, waypoints) {
  const player = state.player;
  const car = player.car;
  if (!car) return { up: false, down: false, left: false, right: false, brake: false };
  let target = waypoints[0];
  while (waypoints.length > 1) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    if (dx * dx + dy * dy < 34 * 34) {
      waypoints.shift();
      target = waypoints[0];
    } else break;
  }
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const targetAngle = Math.atan2(dx, -dy);
  const error = wrapAngle(targetAngle - car.angle);
  const speed = Math.abs(car.speed);
  const drive = { up: false, down: false, left: false, right: false, brake: false };
  if (error > 0.12) drive.right = true;
  else if (error < -0.12) drive.left = true;
  if (Math.abs(error) < 0.6 || speed < 90) drive.up = true;
  if (Math.abs(error) > 0.6 && speed > 140) drive.down = true;
  return drive;
}

/** On foot, walk toward a point: the drive flags are just the sign of the offset. */
function walkToward(state, x, y) {
  const dx = x - state.player.x;
  const dy = y - state.player.y;
  return {
    up: dy < -12,
    down: dy > 12,
    left: dx < -12,
    right: dx > 12,
    brake: false,
  };
}

function nearestEnemy(state) {
  let best = null;
  let bestDist = Infinity;
  for (const enemy of state.enemies) {
    const dist = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = enemy;
    }
  }
  return best;
}

/**
 * Set `session` to the named scene and return the screen to draw over it. The session is
 * what main.js builds: { state, audio, startRun, step, shootAt, stageShootout }.
 */
export function stageShot(name, session) {
  const { state } = session;
  if (name === 'title') {
    session.startRun();
    for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) {
      session.step({ up: false, down: false, left: false, right: false, brake: false }, STEP);
    }
    state.camera.x = 1280;
    state.camera.y = 1150;
    return { screen: SCREEN_TITLE };
  }
  if (name === 'foot') {
    session.stageShootout();
    for (let i = 0; i < FOOT_SECONDS / STEP; i += 1) {
      const enemy = nearestEnemy(state);
      if (enemy) {
        session.shootAt(enemy.x, enemy.y);
        const drive = walkToward(state, enemy.x, enemy.y);
        // Hold fire range: stop walking once close enough to hit reliably.
        if (Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y) < 220) {
          drive.up = false;
          drive.down = false;
          drive.left = false;
          drive.right = false;
        }
        session.step(drive, STEP);
      } else {
        session.step({ up: false, down: false, left: false, right: false, brake: false }, STEP);
      }
    }
    return { screen: SCREEN_PLAY };
  }
  session.startRun();
  if (name === 'cover') session.forceWanted(3);
  const seconds = name === 'cover' ? COVER_SECONDS : DRIVE_SECONDS;
  let waypoints = buildWaypoints(state);
  for (let i = 0; i < seconds / STEP; i += 1) {
    if (!state.mission) break;
    if (waypoints.length === 0) waypoints = buildWaypoints(state);
    // Top the heat back up near the end: the wanted clock cools one star at 10 s, and the
    // cover wants three stars and three police cars in the frame.
    if (name === 'cover' && i === Math.round(9 / STEP)) session.forceWanted(1);
    session.step(autopilotDrive(state, waypoints), STEP);
    if (state.busted) break;
  }
  return { screen: SCREEN_PLAY };
}
