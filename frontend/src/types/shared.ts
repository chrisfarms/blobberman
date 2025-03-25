// Player Input types
export interface PlayerInput {
  playerId: string;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  placeBlob: boolean;
}

// For backward compatibility and type safety
export type Direction = 'up' | 'down' | 'left' | 'right';

// Game Tick types
export interface GameTick {
  tick: number;
  inputs: PlayerInput[];
}

// Power-up types
export enum PowerUpType {
  ExtraBomb = 'extraBomb',         // Increases max bombs
  LongerSplat = 'longerSplat',     // Increases explosion range
  ShorterFuse = 'shorterFuse',     // Debuff - reduces bomb timer
  SpeedBoost = 'speedBoost',       // Temporarily increases movement speed
  SplatShield = 'splatShield',     // Prevents losing territory and power-ups when hit (temporary)
  SplashJump = 'splashJump'        // Allows a short jump over one tile
}

// Message Types
export type MessageType = 'connect' | 'input' | 'tick' | 'historySync';

export interface ConnectMessage {
  type: 'connect';
  playerId: string;
  maxTicks: number;
  tickInterval: number;
}

export interface InputMessage {
  type: 'input';
  input: PlayerInput;
}

export interface TickMessage {
  type: 'tick';
  tick: GameTick;
}

export interface HistorySyncMessage {
  type: 'historySync';
  history: GameTick[];
  fromTick: number;
  toTick: number;
}

export type ResetMessage = {
  type: 'reset';
  resetTimeSec: number;   // Total duration of the reset period in seconds
  countdownSec: number;   // Current countdown value in seconds
};

export type DisplayNameUpdateMessage = {
  type: 'displayName';
  displayNames: Record<string, string>;  // Map of player IDs to display names
};

export type ClientIdMessage = {
  type: 'clientId';
  playerId: string;       // Client's persistent player ID
};

export type GameMessage = ConnectMessage | InputMessage | TickMessage | HistorySyncMessage | ResetMessage | DisplayNameUpdateMessage | ClientIdMessage;
