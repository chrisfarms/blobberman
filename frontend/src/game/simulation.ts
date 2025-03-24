import { GameTick, PlayerInput, Direction } from '@/types/shared';
import { initializeRandom, random, randomChance, randomInt, willSpawnPowerUpAtPosition, getPowerUpTypeAtPosition } from '@/utils/random';

// Grid cell contents
export type CellContent = 'empty' | 'wall' | 'breakableWall';

// Power-up types
export enum PowerUpType {
  ExtraBomb = 'extraBomb',         // Increases max bombs
  LongerSplat = 'longerSplat',     // Increases explosion range
  ShorterFuse = 'shorterFuse'      // Debuff - reduces bomb timer
}

// Grid cell state
export interface GridCell {
  content: CellContent;
  paintedBy: string | null; // playerId who painted this cell, null if not painted
}

// Bomb entity
export interface Bomb {
  playerId: string;
  x: number;
  y: number;
  placedAt: number; // Tick when the bomb was placed
  exploded: boolean;
  fuseMultiplier: number; // Multiplier for fuse time (affected by ShorterFuse power-up)
}

// Power-up entity
export interface PowerUp {
  type: PowerUpType;
  x: number;
  y: number;
  spawnedAt: number; // Tick when the power-up spawned
}

// Explosion entity (for tracking active explosions)
export interface Explosion {
  playerId: string;
  x: number;
  y: number;
  arms: { x: number, y: number, hit: boolean }[]; // Explosion arms in each direction
  startedAt: number; // Tick when the explosion started
}

export interface GameState {
  players: Map<string, PlayerState>;
  grid: GridCell[][];
  bombs: Bomb[];
  explosions: Explosion[];
  powerUps: PowerUp[]; // Active power-ups on the map
  tick: number;
  maxTicks: number; // Maximum number of ticks in the game session
  tickInterval: number; // Milliseconds between ticks
  gridSize: number;
  paintedCounts: Map<string, number>; // Count of cells painted by each player
  randomInitialized: boolean; // Track if random is initialized
  gameOver: boolean; // Whether the game is over
  winner: string | null; // ID of the winning player, null if game is not over or it's a tie
}

export interface PlayerState {
  playerId: string;
  x: number;
  y: number;
  color: string;
  lastDirection: Direction | null;
  bombsPlaced: number; // How many bombs placed by this player are currently active
  maxBombs: number; // Maximum number of bombs a player can place simultaneously
  explosionSize: number; // How far explosions travel
  fuseMultiplier: number; // Multiplier for bomb fuse time (1.0 is normal, lower is faster)
  powerUps: PowerUpType[]; // Active power-ups this player has
}

const PLAYER_COLORS = [
  '#ff0000', // red
  '#00ff00', // green
  '#0000ff', // blue
  '#ffff00', // yellow
  '#ff00ff', // magenta
  '#00ffff', // cyan
  '#ff8800', // orange
  '#8800ff', // purple
];

const GRID_SIZE = 20; // 20x20 grid
const BOMB_TIMER = 60; // 3 seconds at 20 ticks per second
const EXPLOSION_DURATION = 20; // 1 second at 20 ticks per second
const DEFAULT_GAME_SEED = 1234567890; // Default seed to use if no players

// Power-up constants
const POWERUP_SPAWN_CHANCE = 0.4; // 40% chance to spawn a power-up when a breakable wall is destroyed
const EXTRA_BOMB_MAX = 5; // Maximum number of bombs a player can have
const LONGER_SPLAT_MAX = 6; // Maximum explosion size
const SHORTER_FUSE_MIN = 0.5; // Minimum fuse time multiplier (50% of normal)

// Create a grid with walls and breakable walls
function createInitialGrid(size: number): GridCell[][] {
  const grid: GridCell[][] = [];

  for (let y = 0; y < size; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < size; x++) {
      let content: CellContent = 'empty';

      // Create outer walls
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) {
        content = 'wall';
      }
      // Create some internal walls in a grid pattern
      else if (x % 4 === 0 && y % 4 === 0) {
        content = 'wall';
      }
      // Add some breakable walls
      else if ((x % 2 === 0 && y % 2 === 0) && randomChance(0.7)) {
        content = 'breakableWall';
      }

      row.push({
        content,
        paintedBy: null
      });
    }
    grid.push(row);
  }

  return grid;
}

// Generate seed from string (player ID)
function generateSeedFromString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// Ensure the random is initialized with a consistent seed
function ensureRandomInitialized(state: GameState, tick: GameTick): void {
  if (state.randomInitialized) {
    return;
  }

  // We need a consistent seed across all clients
  // Get the first player ID from the inputs or use a fixed default
  let seed = DEFAULT_GAME_SEED;

//   if (tick.inputs.length > 0) {
//     // Use the player ID with the lowest alphanumeric value to ensure consistency
//     const sortedInputs = [...tick.inputs].sort((a, b) =>
//       a.playerId.localeCompare(b.playerId)
//     );
//     seed = generateSeedFromString(sortedInputs[0].playerId);
//   }

  // Initialize the deterministic random generator
  initializeRandom(seed);
  state.randomInitialized = true;
  console.log(`Initialized random with seed: ${seed}`);
}

export function createInitialGameState(): GameState {
  // Initialize with random not yet set up
  return {
    players: new Map<string, PlayerState>(),
    grid: [], // We'll initialize the grid after we have a proper seed
    bombs: [],
    explosions: [],
    powerUps: [],
    tick: 0,
    maxTicks: 0, // Maximum number of ticks in the game session
    tickInterval: 0, // Milliseconds between ticks
    gridSize: GRID_SIZE,
    paintedCounts: new Map<string, number>(),
    randomInitialized: false,
    gameOver: false, // Whether the game is over
    winner: null // ID of the winning player, null if game is not over or it's a tie
  };
}

export function getRandomColor(playerId: string): string {
  // Use player ID to deterministically select a color
  const hash = Array.from(playerId).reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);

  return PLAYER_COLORS[Math.abs(hash) % PLAYER_COLORS.length];
}

// Get cell coordinates for a position
function getCellCoords(x: number, y: number): { cellX: number, cellY: number } {
  const cellX = Math.floor(x + GRID_SIZE / 2);
  const cellY = Math.floor(y + GRID_SIZE / 2);
  return { cellX, cellY };
}

// Check if a position is valid for movement
function canMoveTo(grid: GridCell[][], x: number, y: number): boolean {
  const { cellX, cellY } = getCellCoords(x, y);

  // Check grid boundaries
  if (cellX < 0 || cellY < 0 || cellX >= GRID_SIZE || cellY >= GRID_SIZE) {
    return false;
  }

  // Check cell content
  const cell = grid[cellY][cellX];
  return cell.content === 'empty';
}

// Process bomb explosions
function processExplosions(state: GameState): void {
  const { grid, bombs, explosions, tick, gridSize } = state;

  // Check for bombs that should explode
  const newExplosions: Explosion[] = [];
  const remainingBombs: Bomb[] = [];

  for (const bomb of bombs) {
    // Apply fuse multiplier to the bomb timer
    const adjustedBombTimer = Math.floor(BOMB_TIMER * bomb.fuseMultiplier);

    if (tick - bomb.placedAt >= adjustedBombTimer && !bomb.exploded) {
      // Bomb should explode
      bomb.exploded = true;

      // Create explosion arms in four directions
      const arms = [];

      // Check explosion in each direction (up, right, down, left)
      const directions = [
        { x: 0, y: -1 }, // up
        { x: 1, y: 0 },  // right
        { x: 0, y: 1 },  // down
        { x: -1, y: 0 }  // left
      ];

      const player = state.players.get(bomb.playerId);
      if (!player) continue;

      const explosionSize = player.explosionSize;

      for (const dir of directions) {
        let hit = false;
        for (let dist = 1; dist <= explosionSize && !hit; dist++) {
          const expX = bomb.x + dir.x * dist;
          const expY = bomb.y + dir.y * dist;
          const { cellX, cellY } = getCellCoords(expX, expY);

          // Check grid boundaries
          if (cellX < 0 || cellY < 0 || cellX >= gridSize || cellY >= gridSize) {
            hit = true;
            continue;
          }

          // Check if hitting a wall
          if (grid[cellY][cellX].content === 'wall') {
            hit = true;
            continue;
          }

          // If it's a breakable wall, mark it for destruction and possibly spawn a power-up
          if (grid[cellY][cellX].content === 'breakableWall') {
            grid[cellY][cellX].content = 'empty';

            // Check if a power-up should spawn
            if (shouldSpawnPowerUp(state, cellX, cellY)) {
              spawnPowerUp(state, cellX, cellY);
            }

            hit = true;
          }

          // Add this position to the explosion arm
          arms.push({ x: expX, y: expY, hit });
        }
      }

      // Create the explosion
      const explosion = {
        playerId: bomb.playerId,
        x: bomb.x,
        y: bomb.y,
        arms,
        startedAt: tick
      };

      // Check for hits immediately when the explosion starts
      checkExplosionHits(state, explosion);

      newExplosions.push(explosion);

      // Decrement the player's active bomb count
      const bombPlayer = state.players.get(bomb.playerId);
      if (bombPlayer) {
        bombPlayer.bombsPlaced--;
      }
    } else {
      remainingBombs.push(bomb);
    }
  }

  // Update bombs
  state.bombs = remainingBombs;

  // Add new explosions
  state.explosions.push(...newExplosions);

  // Process active explosions (only for visual effects)
  const remainingExplosions: Explosion[] = [];

  for (const explosion of explosions) {
    // Check if explosion is still active
    if (tick - explosion.startedAt < EXPLOSION_DURATION) {
      // Paint cells affected by the explosion
      paintExplosionCells(state, explosion);

      // Check if any power-ups are hit by the explosion
      checkPowerUpHit(state, explosion);

      remainingExplosions.push(explosion);
    }
  }

  // Update explosions
  state.explosions = remainingExplosions;
}

// Check if any players are hit by an explosion (called only when explosion starts)
function checkExplosionHits(state: GameState, explosion: Explosion): void {
  const { players } = state;

  // Check for other bombs in the explosion radius
  checkBombsInExplosion(state, explosion);

  for (const [playerId, player] of players.entries()) {
    // Skip hit detection for players who have no painted areas
    const paintedCount = state.paintedCounts.get(playerId) || 0;
    if (paintedCount === 0) continue;

    // Check if the player is in the explosion radius
    const playerCellX = Math.floor(player.x + state.gridSize / 2);
    const playerCellY = Math.floor(player.y + state.gridSize / 2);
    const expCellX = Math.floor(explosion.x + state.gridSize / 2);
    const expCellY = Math.floor(explosion.y + state.gridSize / 2);

    // Check center of explosion
    if (playerCellX === expCellX && playerCellY === expCellY) {
      // Player is hit, reset their painted areas
      resetPlayerPaintedAreas(state, playerId);
      continue;
    }

    // Check explosion arms
    for (const arm of explosion.arms) {
      const armCellX = Math.floor(arm.x + state.gridSize / 2);
      const armCellY = Math.floor(arm.y + state.gridSize / 2);

      if (playerCellX === armCellX && playerCellY === armCellY) {
        // Player is hit, reset their painted areas
        resetPlayerPaintedAreas(state, playerId);
        break;
      }
    }
  }
}

// Check if other bombs are hit by an explosion and trigger chain reactions
function checkBombsInExplosion(state: GameState, explosion: Explosion): void {
  // Look for bombs in the explosion radius
  for (const bomb of state.bombs) {
    // Skip bombs that have already exploded
    if (bomb.exploded) continue;

    // Skip the bomb that caused this explosion
    if (bomb.x === explosion.x && bomb.y === explosion.y) continue;

    const bombCellX = Math.floor(bomb.x + state.gridSize / 2);
    const bombCellY = Math.floor(bomb.y + state.gridSize / 2);
    const expCellX = Math.floor(explosion.x + state.gridSize / 2);
    const expCellY = Math.floor(explosion.y + state.gridSize / 2);

    // Check if bomb is at the center of the explosion
    if (bombCellX === expCellX && bombCellY === expCellY) {
      // Trigger immediate explosion
      bomb.placedAt = state.tick - Math.floor(BOMB_TIMER * bomb.fuseMultiplier);
      console.log("Chain reaction: bomb triggered by explosion!");
      continue;
    }

    // Check if bomb is in any explosion arm
    for (const arm of explosion.arms) {
      const armCellX = Math.floor(arm.x + state.gridSize / 2);
      const armCellY = Math.floor(arm.y + state.gridSize / 2);

      if (bombCellX === armCellX && bombCellY === armCellY) {
        // Trigger immediate explosion
        bomb.placedAt = state.tick - Math.floor(BOMB_TIMER * bomb.fuseMultiplier);
        console.log("Chain reaction: bomb triggered by explosion!");
        break;
      }
    }
  }
}

// Paint cells affected by an explosion
function paintExplosionCells(state: GameState, explosion: Explosion): void {
  const { grid, paintedCounts } = state;
  const playerId = explosion.playerId;

  // Get the player's color
  const player = state.players.get(playerId);
  if (!player) return;

  // Paint the center cell
  const { cellX: centerX, cellY: centerY } = getCellCoords(explosion.x, explosion.y);
  if (centerX >= 0 && centerY >= 0 && centerX < state.gridSize && centerY < state.gridSize) {
    const cell = grid[centerY][centerX];
    if (cell.content === 'empty') {
      // If cell was painted by another player, decrement their count
      if (cell.paintedBy && cell.paintedBy !== playerId) {
        const prevCount = paintedCounts.get(cell.paintedBy) || 0;
        paintedCounts.set(cell.paintedBy, Math.max(0, prevCount - 1));
      }

      // Paint the cell
      if (cell.paintedBy !== playerId) {
        cell.paintedBy = playerId;
        const playerCount = paintedCounts.get(playerId) || 0;
        paintedCounts.set(playerId, playerCount + 1);
      }
    }
  }

  // Paint cells in explosion arms
  for (const arm of explosion.arms) {
    const { cellX, cellY } = getCellCoords(arm.x, arm.y);
    if (cellX >= 0 && cellY >= 0 && cellX < state.gridSize && cellY < state.gridSize) {
      const cell = grid[cellY][cellX];
      if (cell.content === 'empty') {
        // If cell was painted by another player, decrement their count
        if (cell.paintedBy && cell.paintedBy !== playerId) {
          const prevCount = paintedCounts.get(cell.paintedBy) || 0;
          paintedCounts.set(cell.paintedBy, Math.max(0, prevCount - 1));
        }

        // Paint the cell
        if (cell.paintedBy !== playerId) {
            cell.paintedBy = playerId;

            // Update painted count
            const playerCount = paintedCounts.get(playerId) || 0;
            paintedCounts.set(playerId, playerCount + 1);
        }
      }
    }
  }
}

// Check if a player is hit by an explosion
function checkPlayerHit(state: GameState): void {
  const { players, explosions } = state;

  for (const [playerId, player] of players.entries()) {
    // Skip hit detection for players who have no painted areas
    const paintedCount = state.paintedCounts.get(playerId) || 0;
    if (paintedCount === 0) continue;

    // Check if the player is in the explosion radius
    for (const explosion of explosions) {
      // Check center of explosion
      const playerCellX = Math.floor(player.x + state.gridSize / 2);
      const playerCellY = Math.floor(player.y + state.gridSize / 2);
      const expCellX = Math.floor(explosion.x + state.gridSize / 2);
      const expCellY = Math.floor(explosion.y + state.gridSize / 2);

      if (playerCellX === expCellX && playerCellY === expCellY) {
        // Player is hit, reset their painted areas
        resetPlayerPaintedAreas(state, playerId);
        break;
      }

      // Check explosion arms
      let hit = false;
      for (const arm of explosion.arms) {
        const armCellX = Math.floor(arm.x + state.gridSize / 2);
        const armCellY = Math.floor(arm.y + state.gridSize / 2);

        if (playerCellX === armCellX && playerCellY === armCellY) {
          // Player is hit, reset their painted areas
          resetPlayerPaintedAreas(state, playerId);
          hit = true;
          break;
        }
      }

      if (hit) break;
    }
  }
}

// Reset all cells painted by a player
function resetPlayerPaintedAreas(state: GameState, playerId: string): void {
  const { grid, paintedCounts } = state;

  // Reset all cells painted by this player
  for (let y = 0; y < state.gridSize; y++) {
    for (let x = 0; x < state.gridSize; x++) {
      if (grid[y][x].paintedBy === playerId) {
        grid[y][x].paintedBy = null;
      }
    }
  }

  // Reset painted count
  paintedCounts.set(playerId, 0);

  // Reset player's power-ups to default values
  const player = state.players.get(playerId);
  if (player) {
    player.maxBombs = 1;
    player.explosionSize = 3;
    player.fuseMultiplier = 1.0;
    player.powerUps = []; // Clear all power-ups
  }
}

export function processGameTick(currentState: GameState, tick: GameTick): GameState {
  // Create a new state object to avoid mutating the current state
  const newState: GameState = {
    players: new Map(currentState.players),
    grid: currentState.grid.length > 0
      ? JSON.parse(JSON.stringify(currentState.grid)) // Deep copy grid if it exists
      : [], // Otherwise, start with empty grid
    bombs: [...currentState.bombs],
    explosions: [...currentState.explosions],
    powerUps: [...currentState.powerUps],
    tick: tick.tick,
    maxTicks: currentState.maxTicks,
    tickInterval: currentState.tickInterval,
    gridSize: currentState.gridSize,
    paintedCounts: new Map(currentState.paintedCounts),
    randomInitialized: currentState.randomInitialized,
    gameOver: currentState.gameOver,
    winner: currentState.winner
  };

  // Ensure random is initialized
  ensureRandomInitialized(newState, tick);

  // Initialize grid if it hasn't been created yet (after random is initialized)
  if (newState.grid.length === 0) {
    newState.grid = createInitialGrid(GRID_SIZE);
  }

  // Check if the game is over due to reaching max ticks
  if (newState.maxTicks > 0 && newState.tick >= newState.maxTicks && !newState.gameOver) {
    // Find the winner (player with the most painted tiles)
    let maxPaintedCount = 0;
    let winner: string | null = null;

    for (const [playerId, count] of newState.paintedCounts.entries()) {
      if (count > maxPaintedCount) {
        maxPaintedCount = count;
        winner = playerId;
      } else if (count === maxPaintedCount && count > 0) {
        // If there's a tie, set winner to null
        winner = null;
      }
    }

    console.log(`Game over! Winner: ${winner || 'Tie'}`);
    newState.gameOver = true;
    newState.winner = winner;
  }

  // If the game is over, only process existing bombs and explosions but don't allow new inputs
  if (newState.gameOver) {
    // Process explosions (only for existing bombs, don't allow new ones)
    processExplosions(newState);

    // Check if any players collect power-ups
    checkPowerUpCollection(newState);

    return newState;
  }

  // Normal gameplay - process bombs, explosions, player hits, and inputs
  processExplosions(newState);
  checkPowerUpCollection(newState);

  // Process each input
  for (const input of tick.inputs) {
    // Get or create player
    if (!newState.players.has(input.playerId)) {
      // Find a spawn point that's not a wall
      let spawnX = 0, spawnY = 0;
      let attempts = 0;

      while (attempts < 100) {
        // Try random positions in the grid that are not too close to the edge
        const x = randomInt(3, newState.gridSize - 3) - newState.gridSize/2;
        const y = randomInt(3, newState.gridSize - 3) - newState.gridSize/2;

        console.log(`Spawn attempt ${attempts} for ${input.playerId}: position (${x}, ${y})`);

        // Check if position is valid
        if (canMoveTo(newState.grid, x, y)) {
          spawnX = x;
          spawnY = y;
          console.log(`Player ${input.playerId} spawning at (${spawnX}, ${spawnY})`);
          break;
        }

        attempts++;
      }

      if (attempts >= 100) {
        console.warn(`Could not find spawn point for player ${input.playerId} after 100 attempts, using default position`);
      }

      // New player, create initial state
      newState.players.set(input.playerId, {
        playerId: input.playerId,
        x: spawnX,
        y: spawnY,
        color: getRandomColor(input.playerId),
        lastDirection: null,
        bombsPlaced: 0,
        maxBombs: 1,
        explosionSize: 3,
        fuseMultiplier: 1.0,
        powerUps: []
      });

      // Initialize painted count
      newState.paintedCounts.set(input.playerId, 0);
    }

    const player = newState.players.get(input.playerId)!;

    // Update player based on input
    if (input.direction) {
      // Store last direction
      player.lastDirection = input.direction;

      // Calculate new position
      let newX = player.x;
      let newY = player.y;

      // Move 0.2 units per tick (at 20 ticks per second, this is 4 units per second)
      const moveAmount = 0.2;

      switch (input.direction) {
        case 'up':
          newY -= moveAmount;
          break;
        case 'down':
          newY += moveAmount;
          break;
        case 'left':
          newX -= moveAmount;
          break;
        case 'right':
          newX += moveAmount;
          break;
      }

      // Check collision and update position
      if (canMoveTo(newState.grid, newX, newY)) {
        player.x = newX;
        player.y = newY;
      }
    }

    // Handle bomb placement
    if (input.placeBlob) {
      // Check if player can place a bomb
      if (player.bombsPlaced < player.maxBombs) {
        // Get grid cell coordinates
        const { cellX, cellY } = getCellCoords(player.x, player.y);
        const cellCenterX = cellX - newState.gridSize / 2 + 0.5;
        const cellCenterY = cellY - newState.gridSize / 2 + 0.5;

        // Check if there's already a bomb at this position
        const bombAtPosition = newState.bombs.some(bomb => {
          const bombCell = getCellCoords(bomb.x, bomb.y);
          return bombCell.cellX === cellX && bombCell.cellY === cellY;
        });

        // Only place if the cell is empty and there's no bomb there
        if (!bombAtPosition && cellX >= 0 && cellY >= 0 &&
            cellX < newState.gridSize && cellY < newState.gridSize &&
            newState.grid[cellY][cellX].content === 'empty') {

          // Place a bomb at the cell center
          newState.bombs.push({
            playerId: player.playerId,
            x: cellCenterX,
            y: cellCenterY,
            placedAt: newState.tick,
            exploded: false,
            fuseMultiplier: player.fuseMultiplier
          });

          // Increment player's active bomb count
          player.bombsPlaced++;
        }
      }
    }
  }

  return newState;
}

// Check if a power-up should spawn when a breakable wall is destroyed
function shouldSpawnPowerUp(state: GameState, cellX: number, cellY: number): boolean {
  return willSpawnPowerUpAtPosition(POWERUP_SPAWN_CHANCE, cellX, cellY);
}

// Spawn a power-up at the given cell coordinates
function spawnPowerUp(state: GameState, cellX: number, cellY: number): void {
  // Convert cell coordinates to world coordinates
  const x = cellX - state.gridSize / 2 + 0.5;
  const y = cellY - state.gridSize / 2 + 0.5;

  // Deterministically choose a power-up type based on position
  const powerUpTypes = [
    PowerUpType.ShorterFuse,
    PowerUpType.ExtraBomb,
    PowerUpType.LongerSplat,
  ];

  const powerUpType = getPowerUpTypeAtPosition(powerUpTypes, cellX, cellY);

  // Create the power-up
  state.powerUps.push({
    type: powerUpType,
    x,
    y,
    spawnedAt: state.tick
  });
}

// Check if any power-ups are hit by an explosion
function checkPowerUpHit(state: GameState, explosion: Explosion): void {
  const remainingPowerUps: PowerUp[] = [];
  const currentTick = state.tick;
  const POWERUP_IMMUNITY_DURATION = 20; // Immunity period in ticks after spawning, must be longer than the explosion duration

  for (const powerUp of state.powerUps) {
    // Skip power-ups that were recently spawned
    // This ensures power-ups revealed by an explosion aren't immediately destroyed by it
    if (currentTick - powerUp.spawnedAt < POWERUP_IMMUNITY_DURATION) {
      remainingPowerUps.push(powerUp);
      continue;
    }

    // Check if power-up is in the center of the explosion
    const powerUpCellX = Math.floor(powerUp.x + state.gridSize / 2);
    const powerUpCellY = Math.floor(powerUp.y + state.gridSize / 2);
    const expCellX = Math.floor(explosion.x + state.gridSize / 2);
    const expCellY = Math.floor(explosion.y + state.gridSize / 2);

    let hit = false;

    // Check if power-up is in the center of the explosion
    if (powerUpCellX === expCellX && powerUpCellY === expCellY) {
      hit = true;
    }

    // Check if power-up is in any of the explosion arms
    if (!hit) {
      for (const arm of explosion.arms) {
        const armCellX = Math.floor(arm.x + state.gridSize / 2);
        const armCellY = Math.floor(arm.y + state.gridSize / 2);

        if (powerUpCellX === armCellX && powerUpCellY === armCellY) {
          hit = true;
          break;
        }
      }
    }

    // If not hit, keep the power-up
    if (!hit) {
      remainingPowerUps.push(powerUp);
    }
  }

  // Update power-ups list
  state.powerUps = remainingPowerUps;
}

// Check if players collect any power-ups
function checkPowerUpCollection(state: GameState): void {
  const { players, powerUps } = state;
  const remainingPowerUps: PowerUp[] = [];

  for (const powerUp of powerUps) {
    const powerUpCellX = Math.floor(powerUp.x + state.gridSize / 2);
    const powerUpCellY = Math.floor(powerUp.y + state.gridSize / 2);

    let collected = false;

    // Check if any player is on this power-up
    for (const [playerId, player] of players.entries()) {
      const playerCellX = Math.floor(player.x + state.gridSize / 2);
      const playerCellY = Math.floor(player.y + state.gridSize / 2);

      if (playerCellX === powerUpCellX && playerCellY === powerUpCellY) {
        // Player collected the power-up
        applyPowerUp(state, player, powerUp.type);
        collected = true;
        break;
      }
    }

    // If not collected, keep the power-up
    if (!collected) {
      remainingPowerUps.push(powerUp);
    }
  }

  // Update power-ups list
  state.powerUps = remainingPowerUps;
}

// Apply a power-up effect to a player
function applyPowerUp(state: GameState, player: PlayerState, powerUpType: PowerUpType): void {
  // Add the power-up to the player's collection
  player.powerUps.push(powerUpType);

  // Apply the effect
  switch (powerUpType) {
    case PowerUpType.ExtraBomb:
      // Increase max bombs
      player.maxBombs = Math.min(player.maxBombs + 1, EXTRA_BOMB_MAX);
      break;

    case PowerUpType.LongerSplat:
      // Increase explosion size
      player.explosionSize = Math.min(player.explosionSize + 1, LONGER_SPLAT_MAX);
      break;

    case PowerUpType.ShorterFuse:
      // Reduce fuse time (this is a debuff)
      player.fuseMultiplier = Math.max(player.fuseMultiplier * 0.8, SHORTER_FUSE_MIN);
      break;
  }
}
