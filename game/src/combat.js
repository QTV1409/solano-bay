// Combat, on foot: Mara aims with the mouse and shoots with a click; the guards in the
// heist shoot back. Bullets are circles against circles, enemies are circles against
// buildings, and every hit bursts particles so a still frame shows the fight.
import { COMBAT, PLAYER, WANTED } from './config.js';
import { addCrime, addParticles, collideBuildings } from './world.js';
import { range } from './random.js';

/** Fire one bullet from Mara toward a world point; shooting in public draws the heat. */
export function playerShoot(state, targetX, targetY, audio) {
  const player = state.player;
  if (!player.onFoot || player.shootTimer > 0) return false;
  player.shootTimer = COMBAT.playerShotCooldown;
  const angle = Math.atan2(targetX - player.x, -(targetY - player.y));
  player.angle = angle;
  state.bullets.push({
    x: player.x + Math.sin(angle) * 18,
    y: player.y - Math.cos(angle) * 18,
    vx: Math.sin(angle) * COMBAT.bulletSpeed,
    vy: -Math.cos(angle) * COMBAT.bulletSpeed,
    life: COMBAT.bulletLife,
    from: 'player',
  });
  state.stats.shots += 1;
  addParticles(state, player.x + Math.sin(angle) * 22, player.y - Math.cos(angle) * 22, 3, '#ffd23f', 90);
  if (state.shootCooldown <= 0) {
    state.shootCooldown = WANTED.shootCooldown;
    addCrime(state, 1);
  }
  if (audio) audio.sfx.gunshot(0);
  return true;
}

/** Guards for the heist shootout, ringed around a point on the road. */
export function spawnEnemies(state, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + range(state.rng, -0.3, 0.3);
    const dist = range(state.rng, 120, 220);
    state.enemies.push({
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      hp: COMBAT.enemyHealth,
      angle: 0,
      shootTimer: range(state.rng, 0.6, 1.6),
      cool: 0,
    });
  }
  if (state.mission) state.mission.killsLeft = count;
}

function enemyShoot(state, enemy, audio) {
  const player = state.player;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy) || 1;
  const spread = range(state.rng, -0.12, 0.12);
  const angle = Math.atan2(dx, dy) + spread;
  state.bullets.push({
    x: enemy.x + Math.sin(angle) * 16,
    y: enemy.y + Math.cos(angle) * 16,
    vx: Math.sin(angle) * COMBAT.enemyBulletSpeed,
    vy: Math.cos(angle) * COMBAT.enemyBulletSpeed,
    life: 1.1,
    from: 'enemy',
  });
  if (audio) audio.sfx.gunshot((enemy.x - player.x) / 600);
}

/** Guards close in, stop at range, and shoot; a dead guard bursts and counts down the job. */
export function stepEnemies(state, dt, audio) {
  const player = state.player;
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = state.enemies[i];
    if (enemy.cool > 0) enemy.cool -= dt;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    enemy.angle = Math.atan2(dx, -dy);
    if (dist > COMBAT.enemyRange) {
      enemy.x += (dx / dist) * COMBAT.enemySpeed * dt;
      enemy.y += (dy / dist) * COMBAT.enemySpeed * dt;
      collideBuildings(state.city, enemy, 12);
    }
    enemy.shootTimer -= dt;
    if (enemy.shootTimer <= 0 && dist < 520) {
      enemy.shootTimer = COMBAT.enemyShotInterval + range(state.rng, 0, 0.6);
      enemyShoot(state, enemy, audio);
    }
    if (enemy.hp <= 0) {
      addParticles(state, enemy.x, enemy.y, 22, '#ff5a4e', 220);
      state.enemies.splice(i, 1);
      if (state.mission) state.mission.killsLeft = Math.max(0, state.mission.killsLeft - 1);
      if (audio) audio.sfx.crash(0);
    }
  }
}

/** Bullets fly, spark on buildings, and hurt whoever they were not fired by. */
export function stepBullets(state, dt) {
  const player = state.player;
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = state.bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    let dead = bullet.life <= 0;
    if (!dead) {
      for (const b of state.city.buildings) {
        if (bullet.x > b.x && bullet.x < b.x + b.w && bullet.y > b.y && bullet.y < b.y + b.h) {
          addParticles(state, bullet.x, bullet.y, 4, '#cfd6df', 80);
          dead = true;
          break;
        }
      }
    }
    if (!dead && bullet.from === 'player') {
      for (const enemy of state.enemies) {
        const dx = enemy.x - bullet.x;
        const dy = enemy.y - bullet.y;
        if (dx * dx + dy * dy < 15 * 15) {
          enemy.hp -= COMBAT.bulletDamage;
          addParticles(state, bullet.x, bullet.y, 6, '#ff8a7a', 130);
          dead = true;
          break;
        }
      }
    }
    if (!dead && bullet.from === 'enemy' && player.onFoot) {
      const dx = player.x - bullet.x;
      const dy = player.y - bullet.y;
      if (dx * dx + dy * dy < PLAYER.radius * PLAYER.radius && player.invuln === 0) {
        state.health -= 12;
        player.invuln = 0.5;
        addParticles(state, player.x, player.y, 8, '#ff5a4e', 150);
        dead = true;
      }
    }
    if (dead) state.bullets.splice(i, 1);
  }
}
