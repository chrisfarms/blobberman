import React, { useEffect, useRef } from 'react';
import { GameState } from '@/game/simulation';
import styles from './Minimap.module.css';

interface MinimapProps {
  gameState: GameState;
  currentPlayerId: string;
}

const Minimap: React.FC<MinimapProps> = ({ gameState, currentPlayerId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Update the minimap whenever the game state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { grid, gridSize } = gameState;

    // Make sure we have valid grid data before rendering
    if (!grid || !gridSize || grid.length === 0 || grid[0]?.length === 0) {
      console.warn("Minimap: Invalid grid data", { gridSize, gridLength: grid?.length });
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pixelSize = Math.floor(canvas.width / gridSize);

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid cells
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const cell = grid[y][x];

        // Calculate position
        const posX = x * pixelSize;
        const posY = y * pixelSize;

        // Determine cell color based on content
        let cellColor = '#eaeaea'; // Default empty cell color

        if (cell.content === 'wall') {
          cellColor = '#555555'; // Wall color
        } else if (cell.content === 'breakableWall') {
          cellColor = '#8a6d3b'; // Breakable wall color
        } else if (cell.paintedBy) {
          // If painted, use player's color
          const player = gameState.players.get(cell.paintedBy);
          if (player) {
            cellColor = player.color;
          }
        }

        // Draw the cell
        ctx.fillStyle = cellColor;
        ctx.fillRect(posX, posY, pixelSize, pixelSize);
      }
    }

    // Draw player positions
    for (const [playerId, player] of gameState.players.entries()) {
      // Convert player coordinates to canvas coordinates
      const playerX = Math.floor((player.x + gridSize / 2) * pixelSize);
      const playerY = Math.floor((player.y + gridSize / 2) * pixelSize);

      // Draw a dot for each player
      ctx.fillStyle = playerId === currentPlayerId ? '#ffffff' : player.color;
      ctx.beginPath();
      ctx.arc(playerX, playerY, pixelSize * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Add outline for current player
      if (playerId === currentPlayerId) {
        ctx.strokeStyle = player.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [gameState, currentPlayerId]);

  return (
    <div className={styles.minimap}>
      <canvas
        ref={canvasRef}
        width={150}
        height={150}
        className={styles.minimapCanvas}
      />
    </div>
  );
};

export default Minimap;
