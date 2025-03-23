/**
 * A deterministic pseudorandom number generator based on a simple algorithm.
 *
 * This is based on a mulberry32 algorithm that creates a sequence of
 * pseudorandom numbers based on a seed value. Using the same seed will
 * always produce the same sequence of numbers.
 */
export class DeterministicRandom {
  private state: number;

  /**
   * Create a new PRNG with the given seed value
   *
   * @param seed Initial seed for the PRNG
   */
  constructor(seed: number) {
    this.state = seed >>> 0; // Convert to 32-bit unsigned integer
  }

  /**
   * Generate a random number between 0 (inclusive) and 1 (exclusive)
   * This is a drop-in replacement for Math.random()
   */
  random(): number {
    // Update the state using the mulberry32 algorithm
    let t = this.state + 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const result = ((t ^ (t >>> 14)) >>> 0) / 4294967296;

    // Update the state for the next call (with the integer value, not the normalized result)
    this.state = (t ^ (t >>> 14)) >>> 0;

    return result;
  }

  /**
   * Generate a random integer between min (inclusive) and max (exclusive)
   *
   * @param min Minimum value (inclusive)
   * @param max Maximum value (exclusive)
   */
  randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min)) + min;
  }

  /**
   * Generate a random integer between min (inclusive) and max (inclusive)
   *
   * @param min Minimum value (inclusive)
   * @param max Maximum value (inclusive)
   */
  randomIntInclusive(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /**
   * Return true with the given probability (0-1)
   *
   * @param probability Probability of returning true (0-1)
   */
  randomChance(probability: number): boolean {
    return this.random() < probability;
  }
}

/**
 * Global instance for game-wide consistent randomness
 * This will be initialized with the game seed derived from the first tick
 */
let globalRandom: DeterministicRandom | null = null;

/**
 * Initialize the global random number generator with a seed
 *
 * @param seed The seed to use for random generation
 */
export function initializeRandom(seed: number): void {
  globalRandom = new DeterministicRandom(seed);
}

/**
 * Get a random number between 0 (inclusive) and 1 (exclusive)
 * Replacement for Math.random()
 */
export function random(): number {
  if (!globalRandom) {
    throw new Error('Random not initialized. Call initializeRandom first.');
  }
  return globalRandom.random();
}

/**
 * Get a random integer between min (inclusive) and max (exclusive)
 *
 * @param min Minimum value (inclusive)
 * @param max Maximum value (exclusive)
 */
export function randomInt(min: number, max: number): number {
  if (!globalRandom) {
    throw new Error('Random not initialized. Call initializeRandom first.');
  }
  return globalRandom.randomInt(min, max);
}

/**
 * Return true with the given probability (0-1)
 *
 * @param probability Probability of returning true (0-1)
 */
export function randomChance(probability: number): boolean {
  if (!globalRandom) {
    throw new Error('Random not initialized. Call initializeRandom first.');
  }
  return globalRandom.randomChance(probability);
}

/**
 * A simple deterministic hash function for generating consistent random values
 * based on position. This is useful for dev mode indicators to show which
 * breakable walls will spawn power-ups when broken.
 *
 * @param x X coordinate
 * @param y Y coordinate
 * @returns A value between 0-1 that can be used like a random number
 */
export function deterministicRandomFromPosition(x: number, y: number): number {
  // Simple hash function
  const hash = ((x * 1987) + (y * 27689)) % 10000;
  return hash / 10000;
}

/**
 * Deterministically check if a power-up should spawn at a given position
 * with a specific probability.
 *
 * @param probability Probability of returning true (0-1)
 * @param x X coordinate
 * @param y Y coordinate
 * @returns true if a power-up should spawn, false otherwise
 */
export function willSpawnPowerUpAtPosition(probability: number, x: number, y: number): boolean {
  return deterministicRandomFromPosition(x, y) < probability;
}

/**
 * Deterministically get a power-up type for a given position
 *
 * @param options Array of options to choose from
 * @param x X coordinate
 * @param y Y coordinate
 * @returns One of the provided options
 */
export function getPowerUpTypeAtPosition<T>(options: T[], x: number, y: number): T {
  // Use a simple hash that produces more varied results across grid positions
  // Add prime numbers to shift the values for different positions
  const hash = ((x * 1987) + (y * 27689) + (x * y * 31)) % options.length;

  // Use abs to ensure non-negative, and ensure we get a valid index
  const index = Math.abs(hash) % options.length;

  return options[index];
}
