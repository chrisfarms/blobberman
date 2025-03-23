import React from 'react';
import { GameState, PowerUpType } from '@/game/simulation';
import styles from './HUD.module.css';
import { useWebSocket } from '@/hooks/useWebSocket';

interface HUDProps {
  gameState: GameState;
}

const HUD: React.FC<HUDProps> = ({ gameState }) => {
  const { playerId, connectionState } = useWebSocket();

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
        {playerId && <span className={styles.playerId}>ID: {playerId.substring(0, 6)}</span>}
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
                {score.playerId === playerId ? 'You' : `Player ${score.playerId.substring(0, 6)}`}
              </span>
              <span className={styles.playerCount}>
                {score.count} tiles
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Player info */}
      {currentPlayer && (
        <div className={styles.playerInfo}>
          <h2>Your Stats</h2>
          <div className={styles.playerInfoContent}>
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

            {/* Power-ups */}
            {currentPlayer.powerUps.length > 0 && (
              <div className={styles.powerUps}>
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

      {/* Game info */}
      <div className={styles.gameInfo}>
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

      {/* Game over message */}
      {gameState.gameOver && (
        <div className={styles.gameOverOverlay}>
          <div className={styles.gameOverMessage}>
            <h1>Game Over!</h1>
            {gameState.winner ? (
              <>
                <h2>Winner: {gameState.winner === playerId ? 'You' : `Player ${gameState.winner.substring(0, 6)}`}</h2>
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
                      {score.playerId === playerId ? 'You' : `Player ${score.playerId.substring(0, 6)}`}
                    </span>
                    <span>{score.count} tiles</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HUD;
