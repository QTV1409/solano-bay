// Seeded random numbers (mulberry32): one seed draws the same city, the same traffic and the
// same screenshot every time, so a bug can be replayed exactly and a frame can be reproduced.

export function createRandom(seed) {
  let state = seed | 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number in [min, max) from the seeded stream. */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** One element of an array, picked by the seeded stream. */
export function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}

/** An integer in [min, max] from the seeded stream. */
export function int(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}
