import { useRef } from 'react';
import { GridHelper } from 'three';
import { GameState, PowerUpType } from '@/game/simulation';
import { Html } from '@react-three/drei';
import { ENV } from '@/utils/env';
import { willSpawnPowerUpAtPosition, getPowerUpTypeAtPosition } from '@/utils/random';

interface GameSceneProps {
  gameState: GameState;
}

// Colors for different cell types
const WALL_COLOR = '#555555';
const BREAKABLE_WALL_COLOR = '#8a6d3b';
const FLOOR_COLOR = '#aaaaaa';

// Colors for different power-up types
const POWER_UP_COLORS = {
  [PowerUpType.ExtraBomb]: '#ff5500',    // Orange-red
  [PowerUpType.LongerSplat]: '#00aaff',  // Light blue
  [PowerUpType.ShorterFuse]: '#ffaa00'   // Amber
};

// Constants for power-up spawning (matching those in simulation.ts)
const POWERUP_SPAWN_CHANCE = 0.4; // 40% chance to spawn a power-up

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

          // For dev mode: Deterministically predict if this breakable wall would spawn a power-up
          // This should use the same logic as in spawnPowerUp function in simulation.ts
          const wouldSpawnPowerUp = cell.content === 'breakableWall' &&
            willSpawnPowerUpAtPosition(POWERUP_SPAWN_CHANCE, x, y);

          // Choose a power-up type deterministically (matching the logic in spawnPowerUp)
          let predictedPowerUpType = null;
          if (wouldSpawnPowerUp) {
            const powerUpTypes = [
              PowerUpType.ExtraBomb,
              PowerUpType.LongerSplat,
              PowerUpType.ShorterFuse
            ];
            predictedPowerUpType = getPowerUpTypeAtPosition(powerUpTypes, x, y);
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

              {/* Dev mode power-up indicator */}
              {ENV.DEV_MODE && wouldSpawnPowerUp && predictedPowerUpType && (
                <Html position={[0, cellHeight/2 + 0.5, 0]} center zIndexRange={[1, 10]}>
                  <div style={{
                    background: POWER_UP_COLORS[predictedPowerUpType],
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    boxShadow: '0 0 3px rgba(0,0,0,0.5)',
                    opacity: '0.8',
                    pointerEvents: 'none'
                  }}>
                    {predictedPowerUpType === PowerUpType.ExtraBomb ? '💣' :
                     predictedPowerUpType === PowerUpType.LongerSplat ? '🎯' : '⏱️'}
                  </div>
                </Html>
              )}
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

      {/* Render power-ups */}
      {gameState.powerUps.map((powerUp, index) => {
        const powerUpColor = POWER_UP_COLORS[powerUp.type] || '#ffffff';

        // Animate power-up by making it hover and rotate
        const hoverHeight = 0.3 + Math.sin(gameState.tick * 0.1) * 0.1;
        const rotationY = gameState.tick * 0.05;

        return (
          <group
            key={`powerup-${index}`}
            position={[powerUp.x, hoverHeight, powerUp.y]}
            rotation={[0, rotationY, 0]}
          >
            {/* Base shape */}
            <mesh castShadow>
              {powerUp.type === PowerUpType.ExtraBomb ? (
                <sphereGeometry args={[0.25, 16, 16]} />
              ) : powerUp.type === PowerUpType.LongerSplat ? (
                <cylinderGeometry args={[0.15, 0.25, 0.3, 16]} />
              ) : (
                <boxGeometry args={[0.3, 0.3, 0.3]} />
              )}
              <meshStandardMaterial
                color={powerUpColor}
                emissive={powerUpColor}
                emissiveIntensity={0.5}
              />
            </mesh>

            {/* Glowing effect */}
            <pointLight
              color={powerUpColor}
              distance={2}
              intensity={0.5}
            />
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
    </>
  );
};

export default GameScene;
