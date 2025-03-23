import { useRef } from 'react';
import { GridHelper } from 'three';
import { GameState } from '@/game/simulation';

interface GameSceneProps {
  gameState: GameState;
}

// Colors for different cell types
const WALL_COLOR = '#555555';
const BREAKABLE_WALL_COLOR = '#8a6d3b';
const FLOOR_COLOR = '#aaaaaa';

const GameScene = ({ gameState }: GameSceneProps) => {
  const gridRef = useRef<GridHelper>(null);

  return (
    <>
      <gridHelper
        ref={gridRef}
        args={[gameState.gridSize, gameState.gridSize]}
        position={[0, 0.01, 0]}
      />

      {/* Render grid cells */}
      {gameState.grid.map((row, y) =>
        row.map((cell, x) => {
          // Calculate position in 3D space
          const posX = x - gameState.gridSize / 2 + 0.5;
          const posY = 0;
          const posZ = y - gameState.gridSize / 2 + 0.5;

          // Determine cell color based on content and paint
          let cellColor = FLOOR_COLOR;
          let cellHeight = 0.1;  // Regular floor height

          if (cell.content === 'wall') {
            cellColor = WALL_COLOR;
            cellHeight = 1;  // Wall height
          } else if (cell.content === 'breakableWall') {
            cellColor = BREAKABLE_WALL_COLOR;
            cellHeight = 0.8;  // Breakable wall height
          } else if (cell.paintedBy) {
            // If painted, use player's color
            const player = gameState.players.get(cell.paintedBy);
            if (player) {
              cellColor = player.color;
            }
          }

          return (
            <mesh
              key={`cell-${x}-${y}`}
              position={[posX, posY + cellHeight / 2, posZ]}
              castShadow={cell.content !== 'empty'}
              receiveShadow
            >
              <boxGeometry args={[0.95, cellHeight, 0.95]} />
              <meshStandardMaterial color={cellColor} />
            </mesh>
          );
        })
      )}

      {/* Render bombs */}
      {gameState.bombs.map((bomb, index) => (
        <mesh
          key={`bomb-${index}`}
          position={[bomb.x, 0.3, bomb.y]}
          castShadow
        >
          <sphereGeometry args={[0.3, 16, 16]} />
          <meshStandardMaterial
            color="black"
            emissive={gameState.players.get(bomb.playerId)?.color || 'red'}
            emissiveIntensity={0.3}
          />
        </mesh>
      ))}

      {/* Render explosions */}
      {gameState.explosions.map((explosion, expIndex) => {
        const player = gameState.players.get(explosion.playerId);
        const explosionColor = player ? player.color : 'red';

        // Render explosion center
        return (
          <group key={`explosion-${expIndex}`}>
            {/* Explosion center */}
            <mesh
              position={[explosion.x, 0.2, explosion.y]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[0.9, 0.9]} />
              <meshStandardMaterial
                color={explosionColor}
                transparent
                opacity={0.8}
                emissive={explosionColor}
                emissiveIntensity={0.5}
              />
            </mesh>

            {/* Explosion arms */}
            {explosion.arms.map((arm, armIndex) => (
              <mesh
                key={`explosion-${expIndex}-arm-${armIndex}`}
                position={[arm.x, 0.2, arm.y]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <planeGeometry args={[0.9, 0.9]} />
                <meshStandardMaterial
                  color={explosionColor}
                  transparent
                  opacity={0.7}
                  emissive={explosionColor}
                  emissiveIntensity={0.5}
                />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* Render all players */}
      {Array.from(gameState.players.values()).map(player => (
        <group key={player.playerId} position={[player.x, 0.5, player.y]}>
          <mesh castShadow>
            <boxGeometry args={[0.8, 0.8, 0.8]} />
            <meshStandardMaterial color={player.color} />
          </mesh>
        </group>
      ))}

      {/* Display scoreboard */}
      <group position={[-gameState.gridSize/2 + 1, 1, -gameState.gridSize/2 + 1]}>
        {Array.from(gameState.paintedCounts.entries())
          .sort((a, b) => b[1] - a[1]) // Sort by painted count descending
          .slice(0, 5) // Show top 5 players
          .map(([playerId, count], index) => {
            const player = gameState.players.get(playerId);
            if (!player) return null;

            return (
              <group key={`score-${playerId}`} position={[0, -index * 0.5, 0]}>
                <mesh>
                  <boxGeometry args={[0.4, 0.4, 0.4]} />
                  <meshStandardMaterial color={player.color} />
                </mesh>
                <mesh position={[1, 0, 0]}>
                  <boxGeometry args={[count/5, 0.2, 0.2]} />
                  <meshStandardMaterial color={player.color} />
                </mesh>
              </group>
            );
          })
        }
      </group>
    </>
  );
};

export default GameScene;
