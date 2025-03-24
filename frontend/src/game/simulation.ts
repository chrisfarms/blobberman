import { GameTick, Direction } from '@/types/shared';
import { initializeRandom, randomChance, randomInt, willSpawnPowerUpAtPosition, getPowerUpTypeAtPosition, random } from '@/utils/random';

// Grid cell contents
export type CellContent = 'empty' | 'wall' | 'breakableWall';

// Power-up types
export enum PowerUpType {
  ExtraBomb = 'extraBomb',         // Increases max bombs
  LongerSplat = 'longerSplat',     // Increases explosion range
  ShorterFuse = 'shorterFuse',     // Debuff - reduces bomb timer
  SpeedBoost = 'speedBoost',       // Temporarily increases movement speed
  SplatShield = 'splatShield',     // Prevents losing territory and power-ups when hit (temporary)
  SplashJump = 'splashJump'        // Allows a short jump over one tile
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
  speedMultiplier: number; // Multiplier for movement speed
  speedBoostEndTick: number; // Tick when the speed boost ends
  hasShield: boolean; // Whether the player has a shield
  shieldEndTick: number; // Tick when the shield ends
  canJump: boolean; // Whether the player can jump
  diagonalDirection: string | null; // Track diagonal movement for rendering
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

const GRID_SIZE = 40; // Increased from 20 to 40 for a larger game board
const BOMB_TIMER = 60; // 3 seconds at 20 ticks per second
const EXPLOSION_DURATION = 20; // 1 second at 20 ticks per second
const DEFAULT_GAME_SEED = 1234567890; // Default seed to use if no players

// Power-up constants
const POWERUP_SPAWN_CHANCE = 0.4; // 40% chance to spawn a power-up when a breakable wall is destroyed
const EXTRA_BOMB_MAX = 5; // Maximum number of bombs a player can have
const LONGER_SPLAT_MAX = 6; // Maximum explosion size
const SHORTER_FUSE_MIN = 0.5; // Minimum fuse time multiplier (50% of normal)
const SPEED_BOOST_MAX = 1.3; // Maximum speed multiplier

// Define player collision radius
const PLAYER_COLLISION_RADIUS = 0.4; // Size of the circular collision area around the player

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
      // Create some internal walls in an expanded grid pattern
      else if ((x % 6 === 0 && y % 6 === 0) || (x % 12 === 6 && y % 12 === 6)) {
        content = 'wall';
      }
      // Create a more interesting pattern of breakable walls
      else {
        // Different patterns in different regions of the map

        // Larger open center area with very sparse breakables (15% chance)
        const centerRadius = size / 3.5; // Increased from size/5 to size/3.5
        const distFromCenter = Math.sqrt(Math.pow(x - size/2, 2) + Math.pow(y - size/2, 2));
        if (distFromCenter < centerRadius) {
          if (randomChance(0.15) && (x % 3 === 0 || y % 3 === 0)) { // Reduced from 0.25 to 0.15 and changed pattern
            content = 'breakableWall';
          }
        }
        // Dense area in the corners (80% chance)
        else if (
          (x < size / 4 && y < size / 4) ||
          (x > 3 * size / 4 && y < size / 4) ||
          (x < size / 4 && y > 3 * size / 4) ||
          (x > 3 * size / 4 && y > 3 * size / 4)
        ) {
          if (randomChance(0.8) && (x % 3 !== 0 || y % 3 !== 0)) {
            content = 'breakableWall';
          }
        }
        // Diagonal pathways
        else if (Math.abs(x - y) < 2 || Math.abs(x + y - size) < 2) {
          // Keep these areas more open
          if (randomChance(0.3)) {
            content = 'breakableWall';
          }
        }
        // Maze-like areas in the rest of the map
        else if (((x % 3 === 0) !== (y % 3 === 0)) && randomChance(0.7)) {
          content = 'breakableWall';
        }
        // Scattered breakable walls elsewhere
        else if (randomChance(0.5)) {
          content = 'breakableWall';
        }
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

// Ensure the random is initialized with a consistent seed
function ensureRandomInitialized(state: GameState, tick: GameTick): void {
  if (state.randomInitialized) {
    return;
  }

  // We need a consistent seed across all clients
  // Get the first player ID from the inputs or use a fixed default
  let seed = DEFAULT_GAME_SEED;

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
  // Check the center point
  if (!isValidCell(grid, x, y)) {
    return false;
  }

  // Check points around the player in a circle to create a circular collision
  // We'll check 8 points around the player's position
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
    const checkX = x + Math.cos(angle) * PLAYER_COLLISION_RADIUS;
    const checkY = y + Math.sin(angle) * PLAYER_COLLISION_RADIUS;

    if (!isValidCell(grid, checkX, checkY)) {
      return false;
    }
  }

  return true;
}

// Helper function to check if a cell is valid for movement
function isValidCell(grid: GridCell[][], x: number, y: number): boolean {
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
    player.speedMultiplier = 1.0;
    player.speedBoostEndTick = 0;
    player.hasShield = false;
    player.shieldEndTick = 0;
    player.canJump = false;
    player.diagonalDirection = null;
  }
}

export function processGameTick(currentState: GameState, tick: GameTick): GameState {
  if (tick.tick <= currentState.tick) {
    console.warn(`Tick ${tick.tick} is less than current tick ${currentState.tick}`);
    return currentState;
  }

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
      let foundSafeSpot = false;

      // Define center arena as the primary spawn area
      const centerRadius = newState.gridSize / 3.5; // Match the open center area radius

      // Try to spawn in center first
      while (attempts < 100 && !foundSafeSpot) {
        // Generate random angle and distance within the center circle
        const angle = random() * Math.PI * 2; // Use deterministic random() instead of Math.random()
        // Use square root for distance to ensure even distribution
        const distance = Math.sqrt(random()) * centerRadius * 0.7; // Use deterministic random() instead of Math.random()

        // Convert to cartesian coordinates
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;

        if (canMoveTo(newState.grid, x, y)) {
          // Check if too close to other players (use smaller distance in center)
          let tooCloseToOtherPlayer = false;
          const MIN_CENTER_DISTANCE = 3.5; // Smaller minimum distance for center area to encourage combat

          for (const [_, otherPlayer] of newState.players.entries()) {
            const distance = Math.sqrt(
              Math.pow(x - otherPlayer.x, 2) +
              Math.pow(y - otherPlayer.y, 2)
            );

            if (distance < MIN_CENTER_DISTANCE) {
              tooCloseToOtherPlayer = true;
              break;
            }
          }

          if (!tooCloseToOtherPlayer) {
            spawnX = x;
            spawnY = y;
            foundSafeSpot = true;
            console.log(`Player ${input.playerId} spawning in center arena at (${spawnX.toFixed(2)}, ${spawnY.toFixed(2)})`);
            break;
          }
        }

        attempts++;
      }

      // Fallback to other spawn areas if center spawning fails
      if (!foundSafeSpot) {
        console.log(`Could not spawn player ${input.playerId} in center, trying alternate areas`);

        // Define alternate spawn areas (four quadrants)
        const spawnAreas = [
          // Top-left quadrant
          {
            minX: -newState.gridSize/2 + 4, maxX: -newState.gridSize/4,
            minY: -newState.gridSize/2 + 4, maxY: -newState.gridSize/4
          },
          // Top-right quadrant
          {
            minX: newState.gridSize/4, maxX: newState.gridSize/2 - 4,
            minY: -newState.gridSize/2 + 4, maxY: -newState.gridSize/4
          },
          // Bottom-left quadrant
          {
            minX: -newState.gridSize/2 + 4, maxX: -newState.gridSize/4,
            minY: newState.gridSize/4, maxY: newState.gridSize/2 - 4
          },
          // Bottom-right quadrant
          {
            minX: newState.gridSize/4, maxX: newState.gridSize/2 - 4,
            minY: newState.gridSize/4, maxY: newState.gridSize/2 - 4
          }
        ];

        attempts = 0;
        while (attempts < 100 && !foundSafeSpot) {
          // Select a random spawn area
          const spawnArea = spawnAreas[randomInt(0, spawnAreas.length - 1)];

          // Try random positions in the selected spawn area
          const x = randomInt(spawnArea.minX, spawnArea.maxX);
          const y = randomInt(spawnArea.minY, spawnArea.maxY);

          // Check if position is valid
          if (canMoveTo(newState.grid, x, y)) {
            // Check distance from other players to avoid spawning too close
            let tooCloseToOtherPlayer = false;
            const MIN_PLAYER_DISTANCE = 5; // Regular minimum distance for outer areas

            for (const [_, otherPlayer] of newState.players.entries()) {
              const distance = Math.sqrt(
                Math.pow(x - otherPlayer.x, 2) +
                Math.pow(y - otherPlayer.y, 2)
              );

              if (distance < MIN_PLAYER_DISTANCE) {
                tooCloseToOtherPlayer = true;
                break;
              }
            }

            if (!tooCloseToOtherPlayer) {
              spawnX = x;
              spawnY = y;
              foundSafeSpot = true;
              console.log(`Player ${input.playerId} spawning in alternate area at (${spawnX}, ${spawnY})`);
              break;
            }
          }

          attempts++;
        }
      }

      // Last resort fallback
      if (!foundSafeSpot) {
        console.warn(`Could not find optimal spawn point for player ${input.playerId}, using fallback position`);

        // Fallback to a simple spawn algorithm
        attempts = 0;
        while (attempts < 50) {
          // Try random positions in the grid that are not too close to the edge
          const x = randomInt(3, newState.gridSize - 3) - newState.gridSize/2;
          const y = randomInt(3, newState.gridSize - 3) - newState.gridSize/2;

          if (canMoveTo(newState.grid, x, y)) {
            spawnX = x;
            spawnY = y;
            break;
          }

          attempts++;
        }
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
        powerUps: [],
        speedMultiplier: 1.0,
        speedBoostEndTick: 0,
        hasShield: false,
        shieldEndTick: 0,
        canJump: false,
        diagonalDirection: null
      });

      // Initialize painted count
      newState.paintedCounts.set(input.playerId, 0);
    }

    const player = newState.players.get(input.playerId)!;

    // Update player based on input - now handling multi-directional movement
    let newX = player.x;
    let newY = player.y;

    // Move 0.2 units per tick (at 20 ticks per second, this is 4 units per second)
    const moveAmount = 0.2 * player.speedMultiplier;
    let movingDiagonally = false;

    // Check if moving diagonally (both vertical and horizontal at the same time)
    if ((input.up || input.down) && (input.left || input.right)) {
      movingDiagonally = true;
    }

    // Apply diagonal movement at reduced speed (multiply by ~0.7071 to normalize)
    const diagonalMultiplier = movingDiagonally ? 0.7071 : 1.0;

    // Apply vertical movement
    if (input.up) {
      newY -= moveAmount * diagonalMultiplier;
      player.lastDirection = 'up';
    } else if (input.down) {
      newY += moveAmount * diagonalMultiplier;
      player.lastDirection = 'down';
    }

    // Apply horizontal movement
    if (input.left) {
      newX -= moveAmount * diagonalMultiplier;
      player.lastDirection = 'left';
    } else if (input.right) {
      newX += moveAmount * diagonalMultiplier;
      player.lastDirection = 'right';
    }

    // Set diagonal direction for rendering
    if (input.up && input.left) {
      player.diagonalDirection = 'up-left';
    } else if (input.up && input.right) {
      player.diagonalDirection = 'up-right';
    } else if (input.down && input.left) {
      player.diagonalDirection = 'down-left';
    } else if (input.down && input.right) {
      player.diagonalDirection = 'down-right';
    } else {
      player.diagonalDirection = null;
    }

    // Check collision and update position
    if (canMoveTo(newState.grid, newX, newY)) {
      player.x = newX;
      player.y = newY;
    } else {
      // If diagonal movement fails, try to move horizontally or vertically
      if (movingDiagonally) {
        // Try moving just horizontally
        newX = player.x;
        if (input.left) {
          newX -= moveAmount;
        } else if (input.right) {
          newX += moveAmount;
        }

        if (canMoveTo(newState.grid, newX, player.y)) {
          player.x = newX;
        }

        // Try moving just vertically
        newY = player.y;
        if (input.up) {
          newY -= moveAmount;
        } else if (input.down) {
          newY += moveAmount;
        }

        if (canMoveTo(newState.grid, player.x, newY)) {
          player.y = newY;
        }
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
    PowerUpType.ExtraBomb,
    PowerUpType.LongerSplat,
    PowerUpType.ShorterFuse,
    PowerUpType.SpeedBoost,
    PowerUpType.SplatShield,
    PowerUpType.SplashJump
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

    case PowerUpType.SpeedBoost:
      // Increase movement speed
      player.speedMultiplier = Math.min(player.speedMultiplier + 0.3, SPEED_BOOST_MAX);
      player.speedBoostEndTick = state.tick + 300; // Speed boost lasts for ~5 seconds
      break;

    case PowerUpType.SplatShield:
      // Give player a shield against explosions
      player.hasShield = true;
      player.shieldEndTick = state.tick + 600; // Shield lasts for ~10 seconds
      break;

    case PowerUpType.SplashJump:
      // Allow player to jump over one tile
      player.canJump = true;
      break;
  }
}
