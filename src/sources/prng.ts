// A tiny seedable PRNG so the live feed is deterministic: the same seed always
// produces the same stream of events. That is what makes the live simulator
// unit-testable (src/sources/liveSource.test.ts).

export interface Rng {
  /** float in [0, 1) */
  next(): number
  /** float in [min, max) */
  range(min: number, max: number): number
  /** integer in [min, max] inclusive */
  int(min: number, max: number): number
  /** true with probability p */
  chance(p: number): boolean
  /** uniform pick from a non-empty array */
  pick<T>(arr: readonly T[]): T
}

// mulberry32 — small, fast, good enough for a simulation (not for cryptography).
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  }
}
