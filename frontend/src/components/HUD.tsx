import React from 'react';
import { GameState } from '@/game/simulation';
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
  console.log(gameState);

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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Game info */}
      <div className={styles.gameInfo}>
        <div className={styles.detailRow}>
          <span>Tick:</span>
          <span>{gameState.tick}</span>
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
    </div>
  );
};

export default HUD;
