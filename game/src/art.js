// All art is drawn in code: every sprite is pre-rendered once to an offscreen canvas and
// blitted per frame, so a frame is a few dozen drawImage calls and nothing re-draws paths.
// Cars point UP in their sprite and are rotated at draw time, so one sprite serves every
// heading. The ground (grass, beach, roads, park, buildings) is baked once into a single
// 2560x2560 canvas; the minimap is baked once too.
import { BEACH, PARK } from './world.js';
import { PALETTE, ROAD, ROAD_CENTRES, WORLD } from './config.js';
import { int, pick, range } from './random.js';

/** A rounded-rectangle path; roundRect is missing on older browsers, this works everywhere. */
export function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function paintCss(h, s, l) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/** One tile of wrapping value noise, used as a repeating pattern for grass, sand and water. */
export function noiseTile(random, size, base, spread) {
  const canvas = makeCanvas(size, size);
  const g = canvas.getContext('2d');
  const grid = 8;
  const values = [];
  for (let i = 0; i <= grid; i += 1) {
    values.push([]);
    for (let j = 0; j <= grid; j += 1) values[i].push(random() * 2 - 1);
  }
  // Wrap the grid so the tile repeats seamlessly: right edge equals left edge.
  for (let i = 0; i <= grid; i += 1) values[i][grid] = values[i][0];
  for (let j = 0; j <= grid; j += 1) values[grid][j] = values[0][j];
  const image = g.createImageData(size, size);
  const cell = size / grid;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      const fx = (x % cell) / cell;
      const fy = (y % cell) / cell;
      const smooth = (t) => t * t * (3 - 2 * t);
      const sx = smooth(fx);
      const sy = smooth(fy);
      const top = values[gy][gx] + (values[gy][gx + 1] - values[gy][gx]) * sx;
      const bottom = values[gy + 1][gx] + (values[gy + 1][gx + 1] - values[gy + 1][gx]) * sx;
      const noise = top + (bottom - top) * sy;
      const index = (y * size + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        image.data[index + c] = Math.max(0, Math.min(255, Math.round(base[c] + noise * spread)));
      }
      image.data[index + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  return canvas;
}

/**
 * A car sprite, pointing up: drop shadow, body with a lighter spine, dark glass, headlights at
 * the front and red taillights. Styles: sedan 30x54, hatch 30x44, truck 32x68, police 30x54.
 */
export function carSprite(random, options) {
  const style = options.style ?? 'sedan';
  const hue = options.hue ?? 215;
  const police = style === 'police';
  const w = style === 'truck' ? 32 : 30;
  const h = style === 'sedan' || police ? 54 : style === 'hatch' ? 44 : 68;
  const canvas = makeCanvas(w + 8, h + 8);
  const g = canvas.getContext('2d');
  const ox = 4;
  const oy = 4;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  rr(g, ox + 2, oy + 3, w, h, 7);
  g.fill();
  const body = police ? '#eef1f5' : paintCss(hue, 68, 48);
  const bodyLight = police ? '#ffffff' : paintCss(hue, 68, 62);
  const bodyDark = police ? '#c9ced6' : paintCss(hue, 68, 26);
  g.fillStyle = body;
  rr(g, ox, oy, w, h, 7);
  g.fill();
  g.fillStyle = bodyLight;
  rr(g, ox + w * 0.28, oy + 4, w * 0.44, h - 8, 5);
  g.fill();
  g.strokeStyle = bodyDark;
  g.lineWidth = 1.5;
  rr(g, ox, oy, w, h, 7);
  g.stroke();
  g.fillStyle = '#1d2733';
  if (style === 'truck') {
    g.fillRect(ox + 3, oy + 6, w - 6, 12);
    g.fillStyle = '#39424e';
    for (let y = oy + 24; y < oy + h - 6; y += 8) g.fillRect(ox + 3, y, w - 6, 3);
  } else {
    g.fillRect(ox + 3, oy + 7, w - 6, 9);
    g.fillRect(ox + 4, oy + h * 0.42, w - 8, 10);
    g.fillRect(ox + 3, oy + h - 14, w - 6, 8);
  }
  if (police) {
    g.fillStyle = '#20242c';
    g.fillRect(ox, oy + h * 0.45, w, 7);
    g.fillStyle = '#ff3b30';
    g.fillRect(ox + 5, oy + 12, 8, 5);
    g.fillStyle = '#3f8cff';
    g.fillRect(ox + w - 13, oy + 12, 8, 5);
  }
  g.fillStyle = '#ffe9a8';
  g.fillRect(ox + 3, oy + 1, 5, 3);
  g.fillRect(ox + w - 8, oy + 1, 5, 3);
  g.fillStyle = '#ff3b30';
  g.fillRect(ox + 3, oy + h - 3, 5, 2);
  g.fillRect(ox + w - 8, oy + h - 3, 5, 2);
  return canvas;
}

/** A person, top-down: shadow, two feet (frame swaps which is forward), shoulders, head, hair. */
export function personSprite(random, options) {
  const frame = options.frame ?? 0;
  const shirt = options.shirt ?? 200;
  const skin = options.skin ?? 32;
  const canvas = makeCanvas(22, 22);
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath();
  g.ellipse(11, 13, 7, 8, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2b2f36';
  const step = frame === 0 ? 2 : -2;
  g.fillRect(7, 15 + step, 3, 4);
  g.fillRect(12, 15 - step, 3, 4);
  g.fillStyle = paintCss(shirt, 62, 52);
  g.beginPath();
  g.arc(11, 11, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = `hsl(${skin}, 45%, 62%)`;
  g.beginPath();
  g.arc(11, 9, 4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = pick(random, ['#20242c', '#4a3220', '#8a6a3b', '#5a3a28']);
  g.beginPath();
  g.arc(11, 7.5, 4, Math.PI, 0);
  g.fill();
  return canvas;
}

/** A tree: trunk peeking below three overlapping canopy circles and a pale highlight. */
export function treeSprite(random, variant) {
  const canvas = makeCanvas(46, 46);
  const g = canvas.getContext('2d');
  const greens = ['#3f7a34', '#4c8a3d', '#35702c'];
  const base = greens[variant % greens.length];
  g.fillStyle = '#5a4632';
  g.fillRect(21, 30, 4, 12);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.ellipse(23, 26, 17, 15, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = base;
  g.beginPath();
  g.arc(15, 20, 10, 0, Math.PI * 2);
  g.arc(30, 18, 11, 0, Math.PI * 2);
  g.arc(22, 12, 10, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.arc(20, 12, 6, 0, Math.PI * 2);
  g.fill();
  return canvas;
}

/** Draw a sprite centred on (x, y), rotated so its front points along `angle` (0 = up). */
export function drawSprite(g, sprite, x, y, angle) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
  g.restore();
}

/** Build every sprite the game needs, once, from the seed. */
export function buildSprites(random) {
  const cars = {};
  for (const style of ['sedan', 'hatch', 'truck', 'police']) {
    cars[style] = {};
    for (const hue of [215, 8, 38, 145, 95, 265, 48, 330, 0, 190]) {
      cars[style][hue] = carSprite(random, { style, hue });
    }
  }
  cars.police[0] = carSprite(random, { style: 'police', hue: 0 });
  const people = [];
  for (let i = 0; i < 8; i += 1) {
    people.push({
      frame0: personSprite(random, { frame: 0, shirt: int(random, 0, 360), skin: int(random, 20, 45) }),
      frame1: personSprite(random, { frame: 1, shirt: int(random, 0, 360), skin: int(random, 20, 45) }),
    });
  }
  const trees = [treeSprite(random, 0), treeSprite(random, 1), treeSprite(random, 2)];
  return { cars, people, trees };
}

/** The whole city baked once: grass, beach, water, roads, sidewalks, park, buildings, lamps. */
export function buildGround(random, city) {
  const size = WORLD.size;
  const canvas = makeCanvas(size, size);
  const g = canvas.getContext('2d');
  const grassTile = noiseTile(random, 128, [93, 138, 74], 16);
  const grassPattern = g.createPattern(grassTile, 'repeat');
  g.fillStyle = grassPattern;
  g.fillRect(0, 0, size, size);

  // Beach: deep water, then water, then sand, along the whole west edge.
  g.fillStyle = PALETTE.waterDeep;
  g.fillRect(0, 0, 34, size);
  const waterTile = noiseTile(random, 128, [46, 127, 168], 12);
  g.fillStyle = g.createPattern(waterTile, 'repeat');
  g.fillRect(34, 0, BEACH.waterTo - 34, size);
  const sandTile = noiseTile(random, 128, [224, 201, 143], 14);
  g.fillStyle = g.createPattern(sandTile, 'repeat');
  g.fillRect(BEACH.waterTo, 0, BEACH.sandTo - BEACH.waterTo, size);
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 3;
  g.beginPath();
  for (let y = 0; y <= size; y += 64) {
    g.moveTo(BEACH.waterTo - 6, y);
    g.quadraticCurveTo(BEACH.waterTo + 4, y + 32, BEACH.waterTo - 6, y + 64);
  }
  g.stroke();

  // Sidewalks first (wider, pale), roads on top: a sidewalk is a border around a road.
  for (const road of city.roads) {
    g.fillStyle = PALETTE.sidewalk;
    if (road.axis === 'h') g.fillRect(road.x, road.y - 14, road.w, road.h + 28);
    else g.fillRect(road.x - 14, road.y, road.w + 28, road.h);
  }
  for (const road of city.roads) {
    g.fillStyle = PALETTE.asphalt;
    g.fillRect(road.x, road.y, road.w, road.h);
  }
  // Centre dashes and edge lines, per road.
  g.strokeStyle = PALETTE.lineYellow;
  g.lineWidth = 3;
  g.setLineDash([18, 16]);
  for (const centre of ROAD_CENTRES) {
    g.beginPath();
    g.moveTo(0, centre);
    g.lineTo(size, centre);
    g.moveTo(centre, 0);
    g.lineTo(centre, size);
    g.stroke();
  }
  g.setLineDash([]);
  g.strokeStyle = PALETTE.lineWhite;
  g.lineWidth = 2;
  for (const centre of ROAD_CENTRES) {
    const half = ROAD.width / 2;
    g.beginPath();
    g.moveTo(0, centre - half + 4);
    g.lineTo(size, centre - half + 4);
    g.moveTo(0, centre + half - 4);
    g.lineTo(size, centre + half - 4);
    g.moveTo(centre - half + 4, 0);
    g.lineTo(centre - half + 4, size);
    g.moveTo(centre + half - 4, 0);
    g.lineTo(centre + half - 4, size);
    g.stroke();
  }

  // The park: darker green, a pond, paths, and a ring of trees is drawn per frame.
  g.fillStyle = PALETTE.park;
  g.fillRect(PARK.x, PARK.y, PARK.w, PARK.h);
  g.fillStyle = PALETTE.pond;
  g.beginPath();
  g.ellipse(PARK.x + PARK.w / 2, PARK.y + PARK.h / 2, 52, 36, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#c9b48a';
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(PARK.x, PARK.y + PARK.h / 2);
  g.lineTo(PARK.x + PARK.w, PARK.y + PARK.h / 2);
  g.moveTo(PARK.x + PARK.w / 2, PARK.y);
  g.lineTo(PARK.x + PARK.w / 2, PARK.y + PARK.h);
  g.stroke();

  // Buildings: roof, speckle, dark parapet rim, AC boxes and a skylight on most roofs.
  for (const b of city.buildings) {
    const local = (function seeded(s) {
      let a = Math.floor(s * 4294967296) | 0;
      return function random() {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })(b.seed);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(b.x + 5, b.y + 6, b.w, b.h);
    g.fillStyle = b.roof;
    g.fillRect(b.x, b.y, b.w, b.h);
    g.fillStyle = 'rgba(0,0,0,0.10)';
    const dots = Math.floor((b.w * b.h) / 220);
    for (let i = 0; i < dots; i += 1) {
      g.fillRect(b.x + local() * b.w, b.y + local() * b.h, 2, 2);
    }
    g.strokeStyle = b.edge;
    g.lineWidth = 4;
    g.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
    g.fillStyle = '#6a6f76';
    if (b.w > 90) {
      g.fillRect(b.x + 12, b.y + 12, 16, 12);
      if (local() < 0.6) g.fillRect(b.x + b.w - 30, b.y + b.h - 26, 18, 14);
    }
    if (local() < 0.6) {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(b.x + b.w / 2 - 14, b.y + b.h / 2 - 10, 28, 20);
    }
  }

  // Street lamps as small dark posts with a pale head; their glow is drawn per frame at dusk.
  for (const lamp of city.lamps) {
    g.fillStyle = '#2c313a';
    g.fillRect(lamp.x - 2, lamp.y - 2, 4, 4);
  }
  return canvas;
}

/** The minimap baked once: dark panel, grey roads, roof-coloured buildings, park and beach. */
export function buildMinimap(city) {
  const size = 256;
  const scale = size / WORLD.size;
  const canvas = makeCanvas(size, size);
  const g = canvas.getContext('2d');
  g.fillStyle = '#1c2432';
  g.fillRect(0, 0, size, size);
  g.fillStyle = PALETTE.water;
  g.fillRect(0, 0, BEACH.waterTo * scale, size);
  g.fillStyle = PALETTE.sand;
  g.fillRect(BEACH.waterTo * scale, 0, (BEACH.sandTo - BEACH.waterTo) * scale, size);
  g.fillStyle = PALETTE.park;
  g.fillRect(PARK.x * scale, PARK.y * scale, PARK.w * scale, PARK.h * scale);
  g.fillStyle = '#565d66';
  for (const road of city.roads) {
    g.fillRect(road.x * scale, road.y * scale, Math.max(2, road.w * scale), Math.max(2, road.h * scale));
  }
  for (const b of city.buildings) {
    g.fillStyle = b.roof;
    g.fillRect(b.x * scale, b.y * scale, Math.max(2, b.w * scale), Math.max(2, b.h * scale));
  }
  return canvas;
}

/** A soft radial halo for lamps and headlights, drawn after the dusk tint with 'lighter'. */
export function glow(g, x, y, radius, color) {
  const gradient = g.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gradient;
  g.beginPath();
  g.arc(x, y, radius, 0, Math.PI * 2);
  g.fill();
}
