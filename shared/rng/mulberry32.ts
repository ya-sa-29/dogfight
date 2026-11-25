/**
 * Mulberry32 PRNG implementation.
 * Fast, deterministic, and good enough for game simulation.
 * @param seed - 32-bit unsigned integer seed
 * @returns Function that returns next random float in [0, 1)
 */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function (): number {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seeded random number generator class.
 * Provides deterministic random number generation for reproducible simulations.
 */
export class SeededRNG {
  public readonly seed: number;
  private readonly next: () => number;

  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }

  /**
   * Returns the next random float in [0, 1).
   */
  random(): number {
    return this.next();
  }

  /**
   * Returns a random integer in [min, max] (inclusive).
   */
  randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /**
   * Returns a random float in [min, max).
   */
  randomFloat(min: number, max: number): number {
    return this.random() * (max - min) + min;
  }

  /**
   * Returns either -1 or 1 with equal probability.
   */
  randomSign(): number {
    return this.random() < 0.5 ? -1 : 1;
  }
}

/**
 * Factory function to create a new SeededRNG instance.
 * @param seed - 32-bit unsigned integer seed
 * @returns New SeededRNG instance
 */
export function createRNG(seed: number): SeededRNG {
  return new SeededRNG(seed);
}