import { GameTick, PlayerInput } from '@/types/shared';

export interface GameState {
  players: Map<string, PlayerState>;
  tick: number;
}

export interface PlayerState {
  playerId: string;
  x: number;
  y: number;
  color: string;
  lastDirection: string | null;
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

export function createInitialGameState(): GameState {
  return {
    players: new Map<string, PlayerState>(),
    tick: 0,
  };
}

export function getRandomColor(playerId: string): string {
  // Use player ID to deterministically select a color
  const hash = Array.from(playerId).reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);

  return PLAYER_COLORS[Math.abs(hash) % PLAYER_COLORS.length];
}

export function processGameTick(currentState: GameState, tick: GameTick): GameState {
  // Create a new state object to avoid mutating the current state
  const newState: GameState = {
    players: new Map(currentState.players),
    tick: tick.tick,
  };

  // Process each input
  for (const input of tick.inputs) {
    // Get or create player
    if (!newState.players.has(input.playerId)) {
      // New player, create initial state
      newState.players.set(input.playerId, {
        playerId: input.playerId,
        x: 0,
        y: 0,
        color: getRandomColor(input.playerId),
        lastDirection: null,
      });
    }

    const player = newState.players.get(input.playerId)!;

    // Update player based on input
    if (input.direction) {
      // Store last direction
      player.lastDirection = input.direction;

      // Move player
      switch (input.direction) {
        case 'up':
          player.y -= 0.1;
          break;
        case 'down':
          player.y += 0.1;
          break;
        case 'left':
          player.x -= 0.1;
          break;
        case 'right':
          player.x += 0.1;
          break;
      }
    }

    // Handle blob placement (to be implemented)
    if (input.placeBlob) {
      // Place a blob at the player's position
      console.log(`Player ${input.playerId} placed a blob at (${player.x}, ${player.y})`);
    }
  }

  return newState;
}
