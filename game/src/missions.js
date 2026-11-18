// Missions and the story: three acts for Mara Voss, then repeatable taxi and delivery jobs
// for money. A mission is a marker on a road with a timer; reaching it pays, timing out
// restarts it for free. The final heist has three phases: drive to the bank, take out the
// guards on foot, then escape across the bay.
import { MISSION } from './config.js';
import { addCrime, roadPointInDistrict, say } from './world.js';
import { spawnEnemies } from './combat.js';
import { pick } from './random.js';

/** The story, in order: act, title, objective line, district, timer, reward. */
export const STORY_MISSIONS = [
  {
    id: 'first-drop',
    act: 1,
    title: 'Act 1 — First Drop',
    text: 'Deliver the parcel to Sal Marin’s warehouse in the Marina District.',
    district: 'Marina District',
    type: 'drive',
    timer: 60,
    reward: 250,
  },
  {
    id: 'double-shift',
    act: 1,
    title: 'Act 1 — Double Shift',
    text: 'A second parcel, Neon Row, no questions. The Harbor Crew pays in cash.',
    district: 'Neon Row',
    type: 'drive',
    timer: 60,
    reward: 300,
  },
  {
    id: 'long-haul',
    act: 1,
    title: 'Act 1 — The Long Haul',
    text: 'Cross the bay to The Docks. The parcel rattles. Do not open it.',
    district: 'The Docks',
    type: 'drive',
    timer: 75,
    reward: 350,
  },
  {
    id: 'hot-wheels',
    act: 2,
    title: 'Act 2 — Hot Wheels',
    text: 'The crew sold you out. Lose the police and reach Palm Heights with the package.',
    district: 'Palm Heights',
    type: 'drive',
    timer: 75,
    reward: 450,
    wanted: 2,
  },
  {
    id: 'vault-job',
    act: 3,
    title: 'Act 3 — The Vault Job',
    text: 'Drive to the Old Town bank. Then it gets loud: clear the guards, then run.',
    district: 'Old Town',
    type: 'drive',
    timer: 75,
    reward: 800,
    shootout: true,
  },
];

const JOB_TITLES = [
  { title: 'Taxi Fare', text: 'Pick up a fare and drop them off across town.', reward: 150, timer: 45 },
  { title: 'Parcel Run', text: 'A parcel, a deadline, no questions asked.', reward: 200, timer: 50 },
  { title: 'Late Delivery', text: 'Somebody’s dinner is getting cold. Drive like it matters.', reward: 180, timer: 45 },
  { title: 'Harbor Pickup', text: 'Collect a crate from the docks and bring it back.', reward: 220, timer: 55 },
];

function buildMission(state, spec, district) {
  const target = roadPointInDistrict(state.rng, district);
  return {
    id: spec.id ?? 'job',
    act: spec.act ?? 0,
    title: spec.title,
    text: spec.text,
    target,
    timer: spec.timer,
    fullTimer: spec.timer,
    type: spec.type ?? 'drive',
    reward: spec.reward,
    phase: 'drive',
    wanted: spec.wanted ?? 0,
    shootout: spec.shootout ?? false,
    killsLeft: 0,
  };
}

/** Start the story mission at `state.storyIndex`, or a repeatable job once the story is done. */
export function startNextMission(state) {
  if (state.storyIndex < STORY_MISSIONS.length) {
    const spec = STORY_MISSIONS[state.storyIndex];
    state.mission = buildMission(state, spec, spec.district);
    if (spec.wanted) addCrime(state, spec.wanted);
    say(state, `${spec.title} — ${spec.text}`, 4);
  } else {
    startJob(state);
  }
}

/** A repeatable job: a fare or a parcel somewhere else in the city. */
export function startJob(state) {
  const spec = pick(state.rng, JOB_TITLES);
  const district = pick(state.rng, ['Old Town', 'Palm Heights', 'Marina District', 'The Docks', 'Neon Row']);
  state.mission = buildMission(state, spec, district);
  say(state, `${spec.title} — ${spec.text}`, 3);
}

function completeMission(state, audio) {
  const mission = state.mission;
  state.money += mission.reward;
  state.stats.deliveries += 1;
  if (audio) audio.sfx.pickup();
  if (mission.act > 0) {
    state.storyIndex += 1;
    if (state.storyIndex >= STORY_MISSIONS.length) {
      state.storyDone = true;
      say(state, `Story complete! Mara is free of Solano Bay. +$${mission.reward} — jobs keep coming.`, 5);
    } else {
      say(state, `${mission.title} done! +$${mission.reward}`, 4);
    }
  } else {
    state.jobsDone += 1;
    say(state, `${mission.title} done! +$${mission.reward}`, 3);
  }
  state.mission = null;
  startNextMission(state);
}

/** Advance the mission clock; arrival, shootout phases and timeouts. */
export function stepMissions(state, dt, audio) {
  const mission = state.mission;
  if (!mission) {
    startNextMission(state);
    return;
  }
  mission.timer -= dt;
  if (mission.timer <= 0) {
    say(state, 'Too slow — the job moved on. A new marker is up.', 3);
    state.mission = null;
    startNextMission(state);
    return;
  }
  const dx = mission.target.x - state.player.x;
  const dy = mission.target.y - state.player.y;
  const dist = Math.hypot(dx, dy);
  if (mission.type === 'drive' && dist < MISSION.arriveRadius) {
    if (mission.shootout && mission.phase === 'drive') {
      mission.phase = 'shoot';
      mission.type = 'shoot';
      mission.timer = 90;
      mission.fullTimer = 90;
      mission.text = 'Clear the guards — mouse to aim, click to shoot. They shoot back.';
      spawnEnemies(state, mission.target.x, mission.target.y, 5);
      say(state, 'Guards! Get out of the car and clear them — mouse to aim, click to shoot.', 5);
      return;
    }
    completeMission(state, audio);
    return;
  }
  if (mission.type === 'shoot') {
    if (mission.killsLeft <= 0 && state.enemies.length === 0) {
      mission.phase = 'escape';
      mission.type = 'escape';
      mission.target = roadPointInDistrict(state.rng, 'Marina District');
      mission.timer = 60;
      mission.fullTimer = 60;
      mission.text = 'Vault clear! Escape to the Marina District before the whole bay wakes up.';
      say(state, 'Vault clear! Get to the Marina District before the whole bay wakes up.', 4);
    }
    return;
  }
  if (mission.type === 'escape' && dist < MISSION.arriveRadius) {
    completeMission(state, audio);
  }
}

/** Distance from Mara to the current marker, for the HUD. */
export function missionDistance(state) {
  if (!state.mission) return 0;
  return Math.hypot(state.mission.target.x - state.player.x, state.mission.target.y - state.player.y);
}
