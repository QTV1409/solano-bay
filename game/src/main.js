// Boot and the one loop: Solano Bay, an open-world crime game. Input is read every frame, the
// world advances in fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between four screens: title, play, paused and
// busted. ?seed=N fixes the city; ?shot=cover|drive|foot|title stages that scene instead of
// running the loop, paints it, and sets window.__shotReady for a screenshot.
import { CAR, PLAYER, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  addCrime,
  bustPlayer,
  createGame,
  populate,
  resetRun,
  say,
  stepCamera,
  stepPlayer,
  stepWorld,
} from './world.js';
import { buildGround, buildMinimap, buildSprites } from './art.js';
import { createAudio } from './audio.js';
import { spawnPeds, spawnTraffic, stepPeds, stepPolice, stepTraffic } from './entities.js';
import { startNextMission, stepMissions } from './missions.js';
import { playerShoot, spawnEnemies, stepBullets, stepEnemies } from './combat.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const state = createGame(seed);
state.sprites = buildSprites(createRandom(seed + 101));
state.ground = buildGround(createRandom(seed + 202), state.city);
state.minimap = buildMinimap(state.city);
populate(state);
spawnTraffic(state);
spawnPeds(state);
const renderer = createRenderer(canvas);

/** A full reset: fresh cars, traffic and pedestrians, then the caller starts the mission. */
function resetWorld() {
  resetRun(state);
  spawnTraffic(state);
  spawnPeds(state);
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.money !== 'number' || typeof save.storyIndex !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        money: state.money,
        storyIndex: state.storyIndex,
        storyDone: state.storyDone,
        jobsDone: state.jobsDone,
      }),
    );
  } catch {
    // Storage can be off (private windows): the save then lasts this visit only.
  }
}

/** One fixed step of gameplay, in the same order live play and the screenshot scenes use. */
function stepGameplay(drive, dt) {
  const stepEvent = stepPlayer(state, drive, dt);
  if (stepEvent === 'step') audio.sfx.footstep(0);
  else if (stepEvent === 'crash') audio.sfx.crash(0);
  stepTraffic(state, dt, audio);
  stepPeds(state, dt);
  stepPolice(state, dt, audio);
  stepEnemies(state, dt, audio);
  stepBullets(state, dt);
  stepMissions(state, dt, audio);
  stepWorld(state, dt);
  if (state.wanted === 0 && state.health < 100) {
    state.health = Math.min(100, state.health + PLAYER.healthRegen * dt);
  }
  stepCamera(state, canvas.width, canvas.height, dt);
  if (state.health <= 0 && !state.busted) {
    bustPlayer(state);
    writeSave();
    return 'busted';
  }
  return null;
}

/** Enter the nearest parked car (stealing it is a crime) or step out of the one Mara drives. */
function tryEnterCar() {
  const player = state.player;
  if (player.onFoot) {
    let best = null;
    let bestDist = Infinity;
    for (const car of state.cars) {
      if (car.kind !== 'parked') continue;
      const dist = Math.hypot(car.x - player.x, car.y - player.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = car;
      }
    }
    if (best && bestDist < 64) {
      best.kind = 'player';
      player.car = best;
      player.onFoot = false;
      player.angle = best.angle;
      player.speed = 0;
      addCrime(state, 1);
      state.stats.carsStolen += 1;
      say(state, 'You stole a car! The bay police noticed.', 3);
      audio.sfx.click();
    }
    return;
  }
  const car = player.car;
  if (!car) return;
  car.kind = 'parked';
  car.speed = 0;
  player.car = null;
  player.onFoot = true;
  player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 26;
  player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 26;
  player.speed = 0;
  audio.sfx.click();
}

/** The session the screenshot scenes drive: the same steps live play uses, staged by name. */
const session = {
  state,
  audio,
  startRun() {
    resetWorld();
    startNextMission(state);
  },
  step(drive, dt) {
    return stepGameplay(drive, dt);
  },
  shootAt(x, y) {
    return playerShoot(state, x, y, audio);
  },
  forceWanted(stars) {
    addCrime(state, stars);
  },
  stageShootout() {
    resetWorld();
    state.storyIndex = 4;
    startNextMission(state);
    const mission = state.mission;
    mission.phase = 'shoot';
    mission.type = 'shoot';
    mission.timer = 90;
    mission.fullTimer = 90;
    mission.text = 'Clear the guards — mouse to aim, click to shoot. They shoot back.';
    spawnEnemies(state, mission.target.x, mission.target.y, 5);
    const car = state.player.car;
    if (car) car.kind = 'parked';
    state.player.car = null;
    state.player.onFoot = true;
    state.player.x = mission.target.x - 180;
    state.player.y = mission.target.y + 60;
    state.player.angle = 0;
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    say(state, 'Guards! Mouse to aim, click to shoot.', 4);
  },
};

function runShot(name) {
  audio.setSilent(true);
  const scene = stageShot(name, session);
  renderer.draw(state, scene.screen, { hasSave: false, muted: true });
  status.textContent =
    `SOLANO_BAY_OK seed=${seed} shot=${name} money=${state.money} wanted=${state.wanted} ` +
    `health=${Math.round(state.health)} cars=${state.cars.length} peds=${state.peds.length} ` +
    `police=${state.cars.filter((car) => car.kind === 'police').length} ` +
    `mission=${state.mission ? state.mission.title : 'none'}`;
  window.__shotReady = true;
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;
  const ui = { hasSave: save !== null, muted: false };

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.ensure();
    audio.startMusic();
    audio.ambient.start();
    session.startRun();
    screen = SCREEN_PLAY;
    announce('Playing. Deliver the parcel for the Harbor Crew.');
  }

  function continueGame() {
    audio.ensure();
    audio.startMusic();
    audio.ambient.start();
    resetWorld();
    if (save) {
      state.money = save.money;
      state.storyIndex = save.storyIndex;
      state.storyDone = save.storyDone;
      state.jobsDone = save.jobsDone;
    }
    startNextMission(state);
    screen = SCREEN_PLAY;
    announce('Continuing your save. The Harbor Crew is waiting.');
  }

  function driveFromInput() {
    const touch = input.touchDrive();
    if (touch) {
      if (state.player.onFoot) {
        return {
          up: touch.y < -0.3,
          down: touch.y > 0.3,
          left: touch.x < -0.3,
          right: touch.x > 0.3,
          brake: false,
        };
      }
      const car = state.player.car;
      const desired = Math.atan2(touch.x, -touch.y);
      const diff = (function wrap(a) {
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        return a;
      })(desired - (car ? car.angle : 0));
      return {
        up: touch.strength > 0.2,
        down: false,
        left: diff < -0.15,
        right: diff > 0.15,
        brake: false,
      };
    }
    return input.drive();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      ui.muted = !ui.muted;
      audio.setMuted(ui.muted);
      if (!ui.muted) audio.ensure();
    }
    if (actions & ACTION_CONFIRM) {
      audio.ensure();
      if (screen === SCREEN_TITLE) startGame();
      else if (screen === SCREEN_BUSTED) {
        state.busted = false;
        screen = SCREEN_PLAY;
        announce('Back on the streets. Stay clean, Mara.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        writeSave();
        announce('Paused. Progress saved.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_ENTER && screen === SCREEN_PLAY) tryEnterCar();
  }

  /** One click per frame, dispatched by screen: start, resume, or shoot on foot. */
  function handleClick() {
    const clicked = input.takeClick();
    if (!clicked) return;
    audio.ensure();
    if (screen === SCREEN_TITLE) startGame();
    else if (screen === SCREEN_BUSTED) {
      state.busted = false;
      screen = SCREEN_PLAY;
      announce('Back on the streets. Stay clean, Mara.');
    } else if (screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    } else if (screen === SCREEN_PLAY && state.player.onFoot) {
      const worldX = input.mouse.x + state.camera.x - canvas.width / 2;
      const worldY = input.mouse.y + state.camera.y - canvas.height / 2;
      playerShoot(state, worldX, worldY, audio);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    handleClick();
    if (screen === SCREEN_TITLE) {
      // The city idles behind the title: traffic and pedestrians keep moving.
      while (accumulator >= STEP) {
        stepGameplay({ up: false, down: false, left: false, right: false, brake: false }, STEP);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      const player = state.player;
      if (player.onFoot) {
        const viewX = player.x - state.camera.x + canvas.width / 2;
        const viewY = player.y - state.camera.y + canvas.height / 2;
        player.angle = Math.atan2(input.mouse.x - viewX, -(input.mouse.y - viewY));
      }
      while (accumulator >= STEP) {
        if (stepGameplay(driveFromInput(), STEP) === 'busted') {
          screen = SCREEN_BUSTED;
          announce('Busted! The bay police hauled you in.');
          break;
        }
        accumulator -= STEP;
      }
      saveTimer += 1;
      if (saveTimer > 600) {
        saveTimer = 0;
        writeSave();
      }
      // Engine and siren follow the car and the wanted level.
      if (player.onFoot) audio.engine.stop();
      else {
        audio.engine.start();
        audio.engine.setSpeed(Math.abs(player.car?.speed ?? 0) / CAR.maxSpeed);
      }
      if (state.wanted > 0) audio.siren.start();
      else audio.siren.stop();
      audio.setChase(state.wanted >= 3);
    } else {
      accumulator = 0;
    }
    renderer.draw(state, screen, ui);
  }

  // 'C' on the title screen continues a save; nothing else on the page uses that key.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && screen === SCREEN_TITLE && save) {
      continueGame();
      save = readSave();
      ui.hasSave = save !== null;
    }
  });

  // Leaving the tab pauses a running game rather than letting the timer run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused. Progress saved.');
    }
  });

  announce('Solano Bay. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
