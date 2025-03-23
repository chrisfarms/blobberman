import { useEffect, useRef, useState } from 'react';
import { GameState, Explosion, PowerUp } from '@/game/simulation';

// Interface for tracking game state changes
interface GameStateChanges {
  newExplosions: boolean;
  newPowerUps: boolean;
  powerUpCollected: boolean;
  wallDestroyed: boolean;
  gameStarted: boolean;
  gameEnded: boolean;
}

export default function useSoundEffects(gameState: GameState | null) {
  // Track previous state to detect changes
  const prevExplosionsRef = useRef<number>(0);
  const prevPowerUpsRef = useRef<number>(0);
  const prevGameOverRef = useRef<boolean>(false);
  const gameStartedRef = useRef<boolean>(false);
  const prevPlayerPowerUpsRef = useRef<Map<string, number>>(new Map());

  // Audio elements cache
  const audioCache = useRef<Record<string, HTMLAudioElement>>({});

  // Function to get audio element (create if doesn't exist)
  const getAudio = (name: string): HTMLAudioElement => {
    if (!audioCache.current[name]) {
      audioCache.current[name] = new Audio(`/assets/sounds/${name}.mp3`);
    }
    return audioCache.current[name];
  };

  // Play a sound with optional volume adjustment
  const playSound = (name: string, volume: number = 1.0) => {
    try {
      const audio = getAudio(name);
      audio.volume = volume;
      audio.currentTime = 0; // Reset to beginning
      audio.play().catch(e => console.error("Error playing sound:", e));
    } catch (err) {
      console.error("Failed to play sound:", err);
    }
  };

  // Load and play background music
  useEffect(() => {
    const music = getAudio('background-music');
    music.loop = true;
    music.volume = 0.2;

    // Add event listener for user interaction to start music
    const startMusic = () => {
        // disable for now
      //music.play().catch(e => console.error("Error playing music:", e));
      // Clean up event listeners after first interaction
      document.removeEventListener('click', startMusic);
      document.removeEventListener('keydown', startMusic);
    };

    document.addEventListener('click', startMusic);
    document.addEventListener('keydown', startMusic);

    return () => {
      music.pause();
      document.removeEventListener('click', startMusic);
      document.removeEventListener('keydown', startMusic);
    };
  }, []);

  // Check for game events and play appropriate sounds
  useEffect(() => {
    if (!gameState) return;

    // Detect changes
    const changes: GameStateChanges = {
      newExplosions: gameState.explosions.length > prevExplosionsRef.current,
      newPowerUps: gameState.powerUps.length > prevPowerUpsRef.current,
      powerUpCollected: false, // Will check below
      wallDestroyed: false, // Will check based on explosions
      gameStarted: !gameStartedRef.current && gameState.tick > 0,
      gameEnded: gameState.gameOver && !prevGameOverRef.current
    };

    // Check for power-up collection by any player
    if (gameState.players.size > 0) {
      for (const [playerId, player] of gameState.players.entries()) {
        const prevPowerUpCount = prevPlayerPowerUpsRef.current.get(playerId) || 0;
        if (player.powerUps.length > prevPowerUpCount) {
          changes.powerUpCollected = true;
          break;
        }
      }

      // Update powerup counts for next check
      const newPowerUpCounts = new Map<string, number>();
      for (const [playerId, player] of gameState.players.entries()) {
        newPowerUpCounts.set(playerId, player.powerUps.length);
      }
      prevPlayerPowerUpsRef.current = newPowerUpCounts;
    }

    // Play sounds based on detected changes
    if (changes.newExplosions) {
      playSound('explosion', 0.7);
      // Assume wall destroyed when there's an explosion
      playSound('wall-break', 0.5);
    }

    if (changes.newPowerUps) {
      playSound('powerup-appear', 0.6);
    }

    if (changes.powerUpCollected) {
      playSound('powerup-collect', 0.8);
    }

    if (changes.gameStarted) {
      playSound('game-start', 0.7);
      gameStartedRef.current = true;
    }

    if (changes.gameEnded) {
      playSound('game-end', 0.8);
    }

    // Update refs for next check
    prevExplosionsRef.current = gameState.explosions.length;
    prevPowerUpsRef.current = gameState.powerUps.length;
    prevGameOverRef.current = gameState.gameOver;

  }, [gameState]);

  // Return the playSound function so it can be used manually if needed
  return { playSound };
}
