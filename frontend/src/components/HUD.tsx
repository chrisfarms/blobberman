import React, { useState, useEffect } from 'react';
import { GameState, PowerUpType } from '@/game/simulation';
import styles from './HUD.module.css';
import { useWebSocket } from '@/hooks/useWebSocket';

interface HUDProps {
  gameState: GameState;
}

const HUD: React.FC<HUDProps> = ({ gameState }) => {
  const {
    playerId,
    displayName,
    connectionState,
    resetCountdown,
    playerDisplayNames,
    setDisplayName,
    resetPlayerData
  } = useWebSocket();

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(displayName || '');
  // Add state for showing/hiding stats panel on mobile
  const [showStatsPanelOnMobile, setShowStatsPanelOnMobile] = useState(false);

  // Update name input when display name changes
  useEffect(() => {
    setNameInput(displayName || '');
  }, [displayName]);

  // Helper function to get player display name or fallback to ID
  const getPlayerName = (id: string) => {
    if (id === playerId) return displayName || 'You';
    return playerDisplayNames[id] || `Player ${id.substring(0, 6)}`;
  };

  // Handle display name submit
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDisplayName(nameInput);
    setIsEditingName(false);
  };

  // Handle player data reset
  const handleResetData = () => {
    if (window.confirm('Are you sure you want to reset your player data? This will generate a new player ID.')) {
      resetPlayerData();
    }
  };

  // Toggle stats panel visibility on mobile
  const toggleStatsPanelOnMobile = () => {
    setShowStatsPanelOnMobile(!showStatsPanelOnMobile);
  };

  // Get current player data
  const currentPlayer = playerId ? gameState.players.get(playerId) : null;
  const currentPlayerTiles = playerId ? gameState.paintedCounts.get(playerId) || 0 : 0;

  // Sort players by painted count for scoreboard
  const playerScores = Array.from(gameState.paintedCounts.entries())
    .map(([id, count]) => {
      const player = gameState.players.get(id);
      return {
        playerId: id,
        count,
        color: player?.color || '#ffffff'
      };
    })
    .sort((a, b) => b.count - a.count) // Sort by count descending
    .slice(0, 5); // Top 5 players

  // Calculate player's rank
  const playerRank = playerScores.findIndex(score => score.playerId === playerId) + 1;

  // Calculate total active bombs on the map
  const totalBombs = gameState.bombs.length;

  // Calculate total painted tiles
  const totalPaintedTiles = Array.from(gameState.paintedCounts.values()).reduce((sum, count) => sum + count, 0);

  // Calculate remaining time
  const calculateRemainingTime = () => {
    if (!gameState.maxTicks || !gameState.tickInterval) return 'N/A';

    const remainingTicks = Math.max(0, gameState.maxTicks - gameState.tick);
    const remainingMs = remainingTicks * gameState.tickInterval;

    // Format as mm:ss
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Function to get human-readable power-up name
  const getPowerUpName = (type: PowerUpType): string => {
    switch (type) {
      case PowerUpType.ExtraBomb:
        return 'Extra Bomb';
      case PowerUpType.LongerSplat:
        return 'Longer Splat';
      case PowerUpType.ShorterFuse:
        return 'Shorter Fuse';
      default:
        return 'Unknown';
    }
  };

  // Function to get power-up icon (emoji)
  const getPowerUpIcon = (type: PowerUpType): string => {
    switch (type) {
      case PowerUpType.ExtraBomb:
        return '💣';
      case PowerUpType.LongerSplat:
        return '🎯';
      case PowerUpType.ShorterFuse:
        return '⏱️';
      default:
        return '❓';
    }
  };

  return (
    <div className={styles.hudContainer}>
      {/* Connection status */}
      <div className={styles.connectionStatus}>
        <div className={`${styles.statusIndicator} ${styles[connectionState]}`}></div>
        <span>{connectionState}</span>
        <div className={styles.playerInfo}>
          {/* Only show player name edit form if there's a display name and we're in edit mode */}
          {displayName && isEditingName ? (
            <form onSubmit={handleNameSubmit} className={styles.nameEditForm}>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Enter your name"
                maxLength={15}
                className={styles.nameInput}
                autoFocus
              />
              <button type="submit" className={styles.saveButton}>Save</button>
            </form>
          ) : displayName ? (
            <div className={styles.playerName} onClick={() => setIsEditingName(true)}>
              {displayName} ✏️
            </div>
          ) : null}
          {displayName && <button onClick={handleResetData} className={styles.resetButton}>Reset Player Data</button>}
        </div>
      </div>

      {/* Scoreboard */}
      <div className={styles.scoreboard}>
        <h2>Leaderboard</h2>
        <ul className={styles.playerList}>
          {playerScores.map((score, index) => (
            <li
              key={score.playerId}
              className={`${styles.playerScore} ${score.playerId === playerId ? styles.currentPlayer : ''}`}
            >
              <div
                className={styles.playerColor}
                style={{ backgroundColor: score.color }}
              />
              <span className={styles.playerName}>
                {getPlayerName(score.playerId)}
              </span>
              <span className={styles.playerCount}>
                {score.count} tiles
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Stats toggle button (only visible on mobile) */}
      {currentPlayer && (
        <button
          className={styles.statsToggleButton}
          onClick={toggleStatsPanelOnMobile}
        >
          {showStatsPanelOnMobile ? 'Hide Stats' : 'Show Stats'}
        </button>
      )}

      {/* Combined Player & Game Info Panel */}
      {currentPlayer && (
        <div className={`${styles.combinedInfoPanel} ${!showStatsPanelOnMobile ? styles.hiddenOnMobile : ''}`}>
          <h2>Game Stats</h2>
          <div className={styles.infoContent}>
            {/* Player Info Section */}
            <div className={styles.infoSection}>
              <h3>Your Stats</h3>
              <div className={styles.statRow}>
                <div
                  className={styles.playerColorLarge}
                  style={{ backgroundColor: currentPlayer.color }}
                />
                <div className={styles.playerDetails}>
                  <div className={styles.detailRow}>
                    <span>Rank:</span>
                    <span>{playerRank > 0 ? `#${playerRank}` : 'N/A'}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span>Tiles:</span>
                    <span>{currentPlayerTiles}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span>Bombs:</span>
                    <span>{currentPlayer.bombsPlaced}/{currentPlayer.maxBombs}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span>Explosion Size:</span>
                    <span>{currentPlayer.explosionSize}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span>Fuse Speed:</span>
                    <span>{Math.round((1 / currentPlayer.fuseMultiplier) * 100)}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Game Info Section */}
            <div className={styles.infoSection}>
              <h3>Match Info</h3>
              <div className={styles.detailRow}>
                <span>Time Left:</span>
                <span>{calculateRemainingTime()}</span>
              </div>
              <div className={styles.detailRow}>
                <span>Active Bombs:</span>
                <span>{totalBombs}</span>
              </div>
              <div className={styles.detailRow}>
                <span>Total Painted:</span>
                <span>{totalPaintedTiles} tiles</span>
              </div>
              <div className={styles.detailRow}>
                <span>Players:</span>
                <span>{gameState.players.size}</span>
              </div>
            </div>

            {/* Power-ups Section */}
            {currentPlayer.powerUps.length > 0 && (
              <div className={styles.infoSection}>
                <h3>Power-ups</h3>
                <div className={styles.powerUpList}>
                  {currentPlayer.powerUps.map((powerUp, index) => (
                    <div key={index} className={styles.powerUpItem}>
                      <span className={styles.powerUpIcon}>{getPowerUpIcon(powerUp)}</span>
                      <span className={styles.powerUpName}>{getPowerUpName(powerUp)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Game over message */}
      {gameState.gameOver && (
        <div className={styles.gameOverOverlay}>
          <div className={styles.gameOverMessage}>
            <h1>Game Over!</h1>
            {gameState.winner ? (
              <>
                <h2>Winner: {getPlayerName(gameState.winner)}</h2>
                {gameState.players.get(gameState.winner) && (
                  <div
                    className={styles.winnerColor}
                    style={{ backgroundColor: gameState.players.get(gameState.winner)?.color }}
                  />
                )}
              </>
            ) : (
              <h2>It's a tie!</h2>
            )}
            <div className={styles.finalScoreboard}>
              <h3>Final Scores</h3>
              <ul>
                {playerScores.map((score) => (
                  <li key={score.playerId}>
                    <div
                      className={styles.playerColor}
                      style={{ backgroundColor: score.color }}
                    />
                    <span>
                      {getPlayerName(score.playerId)}
                    </span>
                    <span>{score.count} tiles</span>
                  </li>
                ))}
              </ul>
            </div>

            {resetCountdown !== null && (
              <div className={styles.resetCountdown}>
                <h3>New Game Starting In</h3>
                <div className={styles.countdownTimer}>{resetCountdown}</div>
                <p>seconds</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HUD;
