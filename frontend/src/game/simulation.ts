import { GameTick, PlayerInput, Direction } from '@/types/shared';
import { initializeRandom, random, randomChance, randomInt } from '@/utils/random';

// Grid cell contents
export type CellContent = 'empty' | 'wall' | 'breakableWall';

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
  tick: number;
  gridSize: number;
  paintedCounts: Map<string, number>; // Count of cells painted by each player
  randomInitialized: boolean; // Track if random is initialized
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
    tick: 0,
    gridSize: GRID_SIZE,
    paintedCounts: new Map<string, number>(),
    randomInitialized: false
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
    if (tick - bomb.placedAt >= BOMB_TIMER && !bomb.exploded) {
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

          // If it's a breakable wall, mark it for destruction
          if (grid[cellY][cellX].content === 'breakableWall') {
            grid[cellY][cellX].content = 'empty';
            hit = true;
          }

          // Add this position to the explosion arm
          arms.push({ x: expX, y: expY, hit });
        }
      }

      // Create the explosion
      newExplosions.push({
        playerId: bomb.playerId,
        x: bomb.x,
        y: bomb.y,
        arms,
        startedAt: tick
      });

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

  // Process active explosions
  const remainingExplosions: Explosion[] = [];

  for (const explosion of explosions) {
    // Check if explosion is still active
    if (tick - explosion.startedAt < EXPLOSION_DURATION) {
      // Paint cells affected by the explosion
      paintExplosionCells(state, explosion);
      remainingExplosions.push(explosion);
    }
  }

  // Update explosions
  state.explosions = remainingExplosions;
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
      cell.paintedBy = playerId;

      // Update painted count
      const playerCount = paintedCounts.get(playerId) || 0;
      paintedCounts.set(playerId, playerCount + 1);
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
        cell.paintedBy = playerId;

        // Update painted count
        const playerCount = paintedCounts.get(playerId) || 0;
        paintedCounts.set(playerId, playerCount + 1);
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
      // Skip if it's the player's own explosion
      if (explosion.playerId === playerId) continue;

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
    tick: tick.tick,
    gridSize: currentState.gridSize,
    paintedCounts: new Map(currentState.paintedCounts),
    randomInitialized: currentState.randomInitialized
  };

  // Ensure random is initialized
  ensureRandomInitialized(newState, tick);

  // Initialize grid if it hasn't been created yet (after random is initialized)
  if (newState.grid.length === 0) {
    newState.grid = createInitialGrid(GRID_SIZE);
  }

  // Process explosions first
  processExplosions(newState);

  // Check if any players are hit by explosions
  checkPlayerHit(newState);

  // Process each input
  for (const input of tick.inputs) {
    // Get or create player
    if (!newState.players.has(input.playerId)) {
      // Find a spawn point that's not a wall
      let spawnX = 0, spawnY = 0;
      let attempts = 0;

      while (attempts < 100) {
        // Try random positions in the grid
        const x = randomInt(2, newState.gridSize - 2) - newState.gridSize/2;
        const y = randomInt(2, newState.gridSize - 2) - newState.gridSize/2;

        // Check if position is valid
        if (canMoveTo(newState.grid, x, y)) {
          spawnX = x;
          spawnY = y;
          break;
        }

        attempts++;
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
        explosionSize: 3
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

      const moveAmount = 0.1;

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
            exploded: false
          });

          // Increment player's active bomb count
          player.bombsPlaced++;
        }
      }
    }
  }

  return newState;
}
