import { PowerUpType } from '../types/shared';

// Player colors
export const PLAYER_COLORS = [
  '#ff0000', // red
  '#00ff00', // green
  '#0000ff', // blue
  '#ffff00', // yellow
  '#ff00ff', // magenta
  '#00ffff', // cyan
  '#ff8800', // orange
  '#8800ff', // purple
];

// Game world colors
export const WALL_COLOR = '#666666';  // Slightly lighter gray
export const BREAKABLE_WALL_COLOR = '#c09458';  // Warmer, more saturated tan
export const FLOOR_COLOR = '#b0b0b0';  // Lighter gray

// PowerUp colors
export const POWER_UP_COLORS: { [key in PowerUpType]: string } = {
  [PowerUpType.ExtraBomb]: '#ff4400',     // Brighter orange-red
  [PowerUpType.LongerSplat]: '#00ccff',   // Brighter blue
  [PowerUpType.ShorterFuse]: '#ffaa00',   // Amber
  [PowerUpType.SpeedBoost]: '#33dd44',    // Brighter green
  [PowerUpType.SplatShield]: '#bb66ff',   // Brighter purple
  [PowerUpType.SplashJump]: '#ff44dd'     // Brighter pink
};

// UI colors
export const UI_COLORS = {
  MODAL_BACKGROUND: 'rgba(0, 0, 0, 0.8)',
  MODAL_CONTENT_BACKGROUND: 'rgba(0, 0, 0, 0.9)',
  MODAL_TEXT: 'white',
  MODAL_SHADOW: 'rgba(255, 204, 0, 0.3)',
  MODAL_BORDER: 'rgba(255, 204, 0, 0.2)',
  HEADER_TEXT: '#ffcc00',
  TEXT_SHADOW: 'rgba(255, 204, 0, 0.5)',
  SUBTEXT: 'rgba(255, 255, 255, 0.8)',
  INPUT_BORDER: 'rgba(255, 204, 0, 0.5)',
  INPUT_BACKGROUND: 'rgba(0, 0, 0, 0.3)',
  INPUT_TEXT: 'white',
  INPUT_FOCUS_BORDER: '#ffcc00',
  INPUT_FOCUS_SHADOW: 'rgba(255, 204, 0, 0.3)',
  ERROR_TEXT: '#ff5252',
  BUTTON_BACKGROUND: '#ffcc00',
  BUTTON_TEXT: '#000',
  BUTTON_HOVER_BACKGROUND: '#ffd740',
  DISABLED_BUTTON_BACKGROUND: '#444',
  DISABLED_BUTTON_TEXT: 'white',
  DISABLED_BUTTON_HOVER_BACKGROUND: '#555',
};

// Material properties
export const MATERIAL_PROPERTIES = {
  STANDARD: {
    ROUGHNESS: 0.1,
    METALNESS: 0.0,
  },
  CLEAR_COAT: {
    VALUE: 1.0,
    ROUGHNESS: 0.1,
  },
  REFLECTIVITY: 0.8,
  EMISSIVE_INTENSITY: {
    LOW: 0.2,
    MEDIUM: 0.5,
    HIGH: 0.7,
  },
  OPACITY: {
    TRANSPARENT: 0.4,
    SEMI_TRANSPARENT: 0.8,
  },
  TRANSMISSION: 0.2,
};

// Helper functions
export function getMultipliedColor(color: string, multiplier: number): string {
  // This is a placeholder - in a real implementation, we would use Three.js Color
  // to multiply the color. Since this is just the utility file, we'll keep it simple.
  return color;
}

// Exports a default theme object with all colors
export default {
  player: PLAYER_COLORS,
  world: {
    wall: WALL_COLOR,
    breakableWall: BREAKABLE_WALL_COLOR,
    floor: FLOOR_COLOR,
  },
  powerUps: POWER_UP_COLORS,
  ui: UI_COLORS,
  materials: MATERIAL_PROPERTIES,
};
