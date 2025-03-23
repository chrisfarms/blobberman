import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface PlayerData {
  playerId: string;
  displayName: string | null;
}

export const usePlayerData = (): {
  playerId: string;
  displayName: string | null;
  setDisplayName: (name: string) => void;
  resetPlayerData: () => void;
} => {
  const [playerData, setPlayerData] = useState<PlayerData>(() => {
    // Try to load from localStorage on initialization
    const storedData = localStorage.getItem('blobberman_player_data');
    if (storedData) {
      try {
        return JSON.parse(storedData);
      } catch (e) {
        console.error('Failed to parse player data from localStorage:', e);
      }
    }

    // If no data in localStorage or parsing failed, create new player ID
    return {
      playerId: uuidv4(),
      displayName: null
    };
  });

  // Save to localStorage whenever playerData changes
  useEffect(() => {
    localStorage.setItem('blobberman_player_data', JSON.stringify(playerData));
  }, [playerData]);

  // Function to update display name
  const setDisplayName = (name: string) => {
    setPlayerData(prev => ({
      ...prev,
      displayName: name.trim() || null
    }));
  };

  // Function to reset player data
  const resetPlayerData = () => {
    const newPlayerData = {
      playerId: uuidv4(),
      displayName: null
    };
    setPlayerData(newPlayerData);
  };

  return {
    playerId: playerData.playerId,
    displayName: playerData.displayName,
    setDisplayName,
    resetPlayerData
  };
};
