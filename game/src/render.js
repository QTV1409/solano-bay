// Drawing only: the world's state and the current screen in, pixels out. The ground is one
// baked canvas, sprites are blitted, and the HUD (money, wanted stars, health, speed, mission
// timer and distance, objective line) and the minimap sit on top, so one still frame shows
// the whole game: city, traffic, police, a mission and the HUD at once.
import { BUSTED_FINE, CAR, COMBAT, CONTROLS, FONT, PALETTE, STORY, WORLD } from './config.js';
import { districtAt } from './world.js';
import { missionDistance } from './missions.js';
import { drawSprite, glow } from './art.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';

const BAR_HEIGHT = 46;
const MAP_SIZE = 150;
const MAP_MARGIN = 10;

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const fonts = new Map();

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${size}:${weight ?? ''}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ?? ''} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function viewRect(state) {
    const w = canvas.width;
    const h = canvas.height;
    return {
      x: state.camera.x - w / 2,
      y: state.camera.y - h / 2,
      w,
      h,
    };
  }

  function drawWorld(state) {
    const view = viewRect(state);
    const g = context;
    g.fillStyle = PALETTE.backdrop;
    g.fillRect(0, 0, canvas.width, canvas.height);
    if (state.ground) {
      const sx = Math.max(0, view.x);
      const sy = Math.max(0, view.y);
      const sw = Math.min(view.w, WORLD.size - sx);
      const sh = Math.min(view.h, WORLD.size - sy);
      g.drawImage(state.ground, sx, sy, sw, sh, sx - view.x, sy - view.y, sw, sh);
    }
    const sprites = state.sprites;
    const dusk = state.sunset > 0.55;
    // Trees and lamps, then every moving thing, then the mission marker.
    for (const tree of state.city.trees) {
      if (tree.x < view.x - 60 || tree.x > view.x + view.w + 60 || tree.y < view.y - 60 || tree.y > view.y + view.h + 60) continue;
      g.drawImage(sprites.trees[tree.variant], tree.x - 23, tree.y - 23);
    }
    if (dusk) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const lamp of state.city.lamps) {
        if (lamp.x < view.x || lamp.x > view.x + view.w || lamp.y < view.y || lamp.y > view.y + view.h) continue;
        glow(g, lamp.x - view.x, lamp.y - view.y, 26, 'rgba(255, 214, 130, 0.20)');
      }
      g.restore();
    }
    for (const car of state.cars) {
      if (car.kind === 'gone') continue;
      if (car.x < view.x - 80 || car.x > view.x + view.w + 80 || car.y < view.y - 80 || car.y > view.y + view.h + 80) continue;
      const sprite = car.kind === 'police' ? sprites.cars.police[0] : sprites.cars[car.style][car.hue];
      drawSprite(g, sprite, car.x - view.x, car.y - view.y, car.angle);
      if (car.kind === 'police') {
        const flash = Math.floor(state.time * 4) % 2 === 0;
        g.fillStyle = flash ? 'rgba(255,59,48,0.9)' : 'rgba(63,140,255,0.9)';
        g.beginPath();
        g.arc(car.x - view.x - 7, car.y - view.y - 8, 3.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = flash ? 'rgba(63,140,255,0.9)' : 'rgba(255,59,48,0.9)';
        g.beginPath();
        g.arc(car.x - view.x + 7, car.y - view.y - 8, 3.5, 0, Math.PI * 2);
        g.fill();
      }
      if (dusk && car.kind !== 'parked') {
        g.save();
        g.globalCompositeOperation = 'lighter';
        const fx = car.x - view.x + Math.sin(car.angle) * 40;
        const fy = car.y - view.y - Math.cos(car.angle) * 40;
        glow(g, fx, fy, 30, 'rgba(255, 233, 168, 0.16)');
        g.restore();
      }
    }
    for (const ped of state.peds) {
      if (ped.x < view.x - 30 || ped.x > view.x + view.w + 30 || ped.y < view.y - 30 || ped.y > view.y + view.h + 30) continue;
      const pair = sprites.people[ped.sprite];
      const sprite = ped.frame === 0 ? pair.frame0 : pair.frame1;
      drawSprite(g, sprite, ped.x - view.x, ped.y - view.y, ped.angle);
    }
    for (const enemy of state.enemies) {
      if (enemy.x < view.x - 30 || enemy.x > view.x + view.w + 30 || enemy.y < view.y - 30 || enemy.y > view.y + view.h + 30) continue;
      const pair = sprites.people[3];
      drawSprite(g, pair.frame0, enemy.x - view.x, enemy.y - view.y, enemy.angle);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(enemy.x - view.x - 14, enemy.y - view.y - 22, 28, 5);
      g.fillStyle = PALETTE.healthRed;
      g.fillRect(enemy.x - view.x - 14, enemy.y - view.y - 22, 28 * Math.max(0, enemy.hp / COMBAT.enemyHealth), 5);
      g.strokeStyle = '#20242c';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(enemy.x - view.x, enemy.y - view.y);
      g.lineTo(enemy.x - view.x + Math.sin(enemy.angle) * 26, enemy.y - view.y - Math.cos(enemy.angle) * 26);
      g.stroke();
    }
    if (state.player.onFoot) {
      const p = state.player;
      const pair = sprites.people[1];
      if (p.invuln === 0 || Math.floor(p.invuln * 10) % 2 === 1) {
        drawSprite(g, pair.frame0, p.x - view.x, p.y - view.y, p.angle);
      }
      // Aim line on foot: a short guide toward the mouse so the shot reads in a still frame.
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(p.x - view.x, p.y - view.y);
      g.lineTo(p.x - view.x + Math.sin(p.angle) * 34, p.y - view.y - Math.cos(p.angle) * 34);
      g.stroke();
    }
    for (const bullet of state.bullets) {
      g.fillStyle = '#ffe9a8';
      g.beginPath();
      g.arc(bullet.x - view.x, bullet.y - view.y, 3, 0, Math.PI * 2);
      g.fill();
    }
    for (const particle of state.particles) {
      g.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      g.fillStyle = particle.color;
      g.fillRect(particle.x - view.x - particle.size / 2, particle.y - view.y - particle.size / 2, particle.size, particle.size);
    }
    g.globalAlpha = 1;
    // Mission marker: a pulsing ring with a $ (or a ! in the shootout), plus a beacon.
    const mission = state.mission;
    if (mission) {
      const mx = mission.target.x - view.x;
      const my = mission.target.y - view.y;
      const pulse = 1 + 0.18 * Math.sin(state.time * 4);
      g.strokeStyle = PALETTE.pink;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(mx, my, 26 * pulse, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(255, 93, 143, 0.25)';
      g.beginPath();
      g.arc(mx, my, 26 * pulse, 0, Math.PI * 2);
      g.fill();
      text(mission.type === 'shoot' ? '!' : '$', mx, my + 9, 26, '#ffffff', 'center', 'bold');
      if (mx < -40 || mx > canvas.width + 40 || my < -40 || my > canvas.height + 40) {
        const cx = Math.max(60, Math.min(canvas.width - 60, mx));
        const cy = Math.max(BAR_HEIGHT + 60, Math.min(canvas.height - 60, my));
        const angle = Math.atan2(my - cy, mx - cx);
        g.save();
        g.translate(cx, cy);
        g.rotate(angle);
        g.fillStyle = PALETTE.pink;
        g.beginPath();
        g.moveTo(14, 0);
        g.lineTo(-10, -10);
        g.lineTo(-10, 10);
        g.closePath();
        g.fill();
        g.restore();
      }
    }
    // Sunset: a warm veil that deepens with the day, drawn over the world but under the HUD.
    const warmth = Math.max(0, state.sunset - 0.2);
    if (warmth > 0.02) {
      g.fillStyle = `rgba(255, 110, 40, ${(warmth * 0.10).toFixed(3)})`;
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = `rgba(16, 20, 48, ${(warmth * 0.22).toFixed(3)})`;
      g.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function drawHud(state, ui) {
    const g = context;
    const w = canvas.width;
    g.fillStyle = 'rgba(16, 20, 32, 0.88)';
    g.fillRect(0, 0, w, BAR_HEIGHT);
    g.fillStyle = PALETTE.panelEdge;
    g.fillRect(0, BAR_HEIGHT - 2, w, 2);
    text(`$${state.money}`, 16, 30, 24, PALETTE.gold, 'left', 'bold');
    let starX = 150;
    for (let i = 0; i < 5; i += 1) {
      text(i < state.wanted ? '★' : '☆', starX, 30, 24, i < state.wanted ? '#ffb02e' : '#5a6373', 'left');
      starX += 28;
    }
    // Health bar, clear of the five wanted stars.
    const healthX = 330;
    g.fillStyle = '#20242c';
    g.fillRect(healthX, 15, 120, 16);
    g.fillStyle = state.health > 40 ? PALETTE.healthGreen : PALETTE.healthRed;
    g.fillRect(healthX, 15, 120 * Math.max(0, state.health / 100), 16);
    g.strokeStyle = PALETTE.panelEdge;
    g.lineWidth = 1;
    g.strokeRect(healthX, 15, 120, 16);
    text('HP', healthX - 8, 30, 14, PALETTE.muted, 'right', 'bold');
    // Mission timer and distance, centred.
    const mission = state.mission;
    if (mission) {
      const dist = Math.round(missionDistance(state) / 10);
      const timer = Math.max(0, Math.ceil(mission.timer));
      const timerColor = mission.timer < 10 ? PALETTE.healthRed : PALETTE.text;
      text(`${mission.title}  ·  ${timer}s  ·  ${dist}m`, w / 2, 30, 20, timerColor, 'center', 'bold');
    } else {
      text('Free roam — take a job from the map', w / 2, 30, 18, PALETTE.muted, 'center');
    }
    const speed = state.player.onFoot ? 0 : Math.round(Math.abs(state.player.speed ?? 0) * 0.5);
    text(state.player.onFoot ? 'On foot' : `${speed} km/h`, w - 190, 30, 20, PALETTE.text, 'right', 'bold');
    text(ui.muted ? 'MUTED (M)' : 'Sound on (M)', w - 16, 30, 14, PALETTE.muted, 'right');
    // Objective line under the bar, clear of the minimap.
    if (mission) {
      text(mission.text, 16, BAR_HEIGHT + 26, 17, '#ffffff', 'left');
    }
    // District and sunset clock, bottom-left.
    const hour = 17 + Math.floor(state.time / 120);
    const minute = Math.floor((state.time % 120) / 2);
    text(`${districtAt(state.player.x, state.player.y)}  ·  ${hour}:${String(minute).padStart(2, '0')}`, 16, canvas.height - 16, 15, 'rgba(255,255,255,0.85)', 'left', 'bold');
    text('WASD drive · E enter car · click shoot · P pause', canvas.width - 16, canvas.height - 16, 14, 'rgba(255,255,255,0.65)', 'right');
    // Toast message, centre-bottom.
    if (state.message) {
      const tw = context.measureText(state.message).width + 32;
      g.fillStyle = 'rgba(16, 20, 32, 0.85)';
      g.fillRect((w - tw) / 2, canvas.height - 84, tw, 36);
      text(state.message, w / 2, canvas.height - 59, 17, PALETTE.text, 'center');
    }
  }

  function drawMinimap(state) {
    const g = context;
    const x = canvas.width - MAP_SIZE - MAP_MARGIN;
    const y = BAR_HEIGHT + MAP_MARGIN;
    g.fillStyle = 'rgba(16, 20, 32, 0.9)';
    g.fillRect(x - 4, y - 4, MAP_SIZE + 8, MAP_SIZE + 8);
    if (state.minimap) g.drawImage(state.minimap, x, y, MAP_SIZE, MAP_SIZE);
    g.strokeStyle = '#4a5568';
    g.lineWidth = 2;
    g.strokeRect(x - 4, y - 4, MAP_SIZE + 8, MAP_SIZE + 8);
    g.fillStyle = 'rgba(10, 14, 22, 0.9)';
    g.fillRect(x, y, MAP_SIZE, 20);
    text('MAP · SOLANO BAY', x + MAP_SIZE / 2, y + 14, 11, '#ffffff', 'center', 'bold');
    const scale = MAP_SIZE / WORLD.size;
    const dot = (px, py, color, radius) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(x + px * scale, y + py * scale, radius, 0, Math.PI * 2);
      g.fill();
    };
    if (state.mission) dot(state.mission.target.x, state.mission.target.y, PALETTE.pink, 5);
    for (const car of state.cars) {
      if (car.kind === 'police') dot(car.x, car.y, PALETTE.policeBlue, 3);
    }
    for (const enemy of state.enemies) dot(enemy.x, enemy.y, PALETTE.healthRed, 3);
    dot(state.player.x, state.player.y, '#ffd23f', 4);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(x + state.player.x * scale, y + state.player.y * scale, 6, 0, Math.PI * 2);
    g.stroke();
  }

  function drawPanel(title, lines, prompt) {
    const g = context;
    const width = Math.min(680, canvas.width - 80);
    const lineHeight = 27;
    const height = 150 + lines.length * lineHeight + 64;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;
    g.fillStyle = 'rgba(8, 10, 16, 0.55)';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = PALETTE.panel;
    g.fillRect(x, y, width, height);
    g.strokeStyle = PALETTE.panelEdge;
    g.lineWidth = 2;
    g.strokeRect(x, y, width, height);
    text(title, canvas.width / 2, y + 58, 44, PALETTE.text, 'center', 'bold');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], canvas.width / 2, y + 108 + i * lineHeight, 19, PALETTE.muted, 'center');
    }
    text(prompt, canvas.width / 2, y + height - 26, 21, PALETTE.gold, 'center', 'bold');
  }

  function drawTitle(state, ui) {
    // Short lines, wrapped by hand: a centred line wider than the panel spills past its edges.
    const lines = [
      `${STORY.city} — a sun-soaked coastal city,`,
      'five districts, one driver with nothing to lose.',
      'Mara Voss drives parcels for the Harbor Crew.',
      'Tonight the parcels are not parcels, the pay is too good,',
      'and the whole bay is about to learn her name.',
      '',
      ...STORY.acts,
      '',
      ...CONTROLS,
    ];
    const prompt = ui.hasSave ? 'Press Space or click to start — C to continue your save' : 'Press Space or click to start';
    drawPanel('SOLANO BAY', lines, prompt);
  }

  function drawBusted(state) {
    drawPanel('BUSTED', [
      'The bay police hauled you in. The impound lot kept your car —',
      `and $${BUSTED_FINE} of your money.`,
      '',
      `You kept $${state.money}. The Harbor Crew is still waiting.`,
    ], 'Press Space or click to get back out there');
  }

  /** Paint one frame: the world, then the HUD and minimap, then a screen panel on top. */
  function draw(state, screen, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    drawWorld(state);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui);
      return;
    }
    drawHud(state, ui);
    drawMinimap(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The bay will wait for you.', 'Your progress is saved.'], 'Press P or click to resume');
    } else if (screen === SCREEN_BUSTED) {
      drawBusted(state);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize };
}
