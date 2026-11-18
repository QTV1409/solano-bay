// Every tuning number, colour and line of story text in one place. Solano Bay is a sun-soaked
// coastal city: five districts around a grid of roads, a beach on the west edge and a park at
// the centre. Nothing here is borrowed from any commercial game: the city, the people and the
// story are all invented for this game.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The city is a square this many pixels across; roads run on a 320 px grid inside it. */
export const WORLD = { size: 2560 };
export const ROAD = { spacing: 320, width: 96, firstCentre: 160 };
export const ROAD_CENTRES = [160, 480, 800, 1120, 1440, 1760, 2080, 2400];

/** Where Mara starts the game, at the Old Town crossroads, already in her courier car. */
export const START = { x: 480, y: 480, angle: 0 };

export const PLAYER = {
  walkSpeed: 155,
  radius: 13,
  invulnerable: 1.5,
  stepInterval: 0.34,
  healthRegen: 1.5,
};

export const CAR = {
  accel: 270,
  maxSpeed: 345,
  reverseMax: 125,
  turnRate: 2.45,
  handbrake: 0.86,
  drag: 0.35,
  radius: 17,
};

export const TRAFFIC = { count: 10, minSpeed: 90, maxSpeed: 145, radius: 17 };
export const PEDESTRIAN = { count: 12, minSpeed: 34, maxSpeed: 58, radius: 9 };
export const PARKED = { count: 4 };

export const POLICE = {
  maxSpeed: 362,
  accel: 300,
  turnRate: 2.7,
  ramDamage: 8,
  spawnDistance: 420,
  maxActive: 4,
};

export const WANTED = {
  max: 5,
  decayDelay: 10,
  decayInterval: 2,
  stealStars: 1,
  hitStars: 1,
  shootCooldown: 5,
};

export const COMBAT = {
  bulletSpeed: 720,
  bulletDamage: 34,
  bulletLife: 0.9,
  enemyHealth: 200,
  enemySpeed: 82,
  enemyRange: 270,
  enemyShotInterval: 1.5,
  enemyBulletSpeed: 430,
  playerShotCooldown: 0.22,
};

export const MISSION = {
  arriveRadius: 42,
  markerPulse: 2.2,
};

/** Money: a busted driver loses this much to the impound lot. */
export const BUSTED_FINE = 100;

export const PALETTE = {
  backdrop: '#101623',
  grass: '#5d8a4a',
  grassDark: '#527c41',
  sand: '#e0c98f',
  water: '#2e7fa8',
  waterDeep: '#256b90',
  asphalt: '#3a3f47',
  asphaltDark: '#33373f',
  sidewalk: '#9aa0a8',
  lineYellow: '#e8c832',
  lineWhite: '#dfe3e8',
  park: '#4c7a3d',
  pond: '#3f8fb5',
  buildingEdge: '#20242c',
  panel: '#171d2b',
  panelEdge: '#2c3648',
  text: '#f2f4f7',
  muted: '#9aa3b2',
  gold: '#f2c94c',
  pink: '#ff5d8f',
  policeBlue: '#3f8cff',
  policeRed: '#ff3b30',
  healthGreen: '#58d68d',
  healthRed: '#ff5a4e',
  sunset: '#ff7a2e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save lives between visits (this browser only). */
export const SAVE_KEY = 'solano-bay.save.v1';

export const DISTRICTS = ['Old Town', 'Palm Heights', 'Marina District', 'The Docks', 'Neon Row'];

/** The story: Mara Voss, a courier driver who takes one job too many. */
export const STORY = {
  hero: 'Mara Voss',
  city: 'Solano Bay',
  intro:
    'Mara Voss drives parcels for the Harbor Crew. Tonight the parcels are not parcels, ' +
    'the pay is too good, and the whole bay is about to learn her name.',
  acts: [
    'Act 1 — Courier Runs: deliver for Sal Marin and the Harbor Crew.',
    'Act 2 — The Getaway: lose the bay police, keep the package.',
    'Act 3 — The Vault Job: one last heist, then out of Solano Bay for good.',
  ],
};

export const CONTROLS = [
  'WASD / arrows — drive or walk',
  'E — enter / exit a car (stealing one raises your wanted level)',
  'Mouse — aim on foot, click — shoot',
  'Space — handbrake   ·   P — pause   ·   M — mute',
  'Touch — drag to move or steer, tap to shoot, double-tap to enter a car',
];
