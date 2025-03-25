import { useRef, useMemo, useState, useEffect } from 'react';
import { GridHelper, Group, Mesh, MeshStandardMaterial, Vector3, MeshPhysicalMaterial, Color, MathUtils } from 'three';
import { GameState, PowerUpType, Bomb, Explosion, PlayerState, GridCell } from '@/game/simulation';
import { Html } from '@react-three/drei';
import { ENV } from '@/utils/env';
import { willSpawnPowerUpAtPosition, getPowerUpTypeAtPosition } from '@/utils/random';
import { useFrame } from '@react-three/fiber';
import CustomRoundedBox from './RoundedBox';

interface GameSceneProps {
  gameState: GameState;
}

// Colors for different cell types - using brighter, more vibrant colors for a toy-like feel
const WALL_COLOR = '#666666';  // Slightly lighter gray
const BREAKABLE_WALL_COLOR = '#c09458';  // Warmer, more saturated tan
const FLOOR_COLOR = '#b0b0b0';  // Lighter gray

// Colors for different power-up types - more saturated for toy-like appearance
const POWER_UP_COLORS = {
  [PowerUpType.ExtraBomb]: '#ff4400',     // Brighter orange-red
  [PowerUpType.LongerSplat]: '#00ccff',   // Brighter blue
  [PowerUpType.ShorterFuse]: '#ffaa00',   // Amber
  [PowerUpType.SpeedBoost]: '#33dd44',    // Brighter green
  [PowerUpType.SplatShield]: '#bb66ff',   // Brighter purple
  [PowerUpType.SplashJump]: '#ff44dd'     // Brighter pink
};

// Constants for power-up spawning (matching those in simulation.ts)
const POWERUP_SPAWN_CHANCE = 0.4; // 40% chance to spawn a power-up

// Add the lerpVector helper function at the top of the file, similar to the one in PlayerCamera
// Improved lerp function that takes into account deltaTime
const lerpVector = (current: number, target: number, alpha: number, deltaTime: number): number => {
  // Calculate smooth factor based on deltaTime (60fps is our reference)
  const smoothFactor = 1.0 - Math.pow(1.0 - alpha, deltaTime * 60);
  return current + (target - current) * smoothFactor;
};

// Add a PlayerCharacter component for better visual representation
interface PlayerCharacterProps {
  player: PlayerState;
  tick: number;
}

const PlayerCharacter = ({ player, tick }: PlayerCharacterProps) => {
  const meshRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const targetRotationRef = useRef(0);
  const movementAlpha = 0.15;
  const rotationAlpha = 0.2;
  const isMovingRef = useRef(false);

  // Calculate base bounce and wiggle animations based on game tick
  const bounce = Math.sin(tick * 0.1) * 0.05;

  // Calculate leg positions and animations
  const legPositions = useMemo(() => {
    return [
      { x: -0.3, z: -0.3 }, // Front Left
      { x: 0.3, z: -0.3 },  // Front Right
      { x: -0.3, z: 0.3 },  // Back Left
      { x: 0.3, z: 0.3 },   // Back Right
    ];
  }, []);

  // Use useFrame to update position with lerp
  useFrame(({ camera }, deltaTime) => {
    const group = groupRef.current;
    if (!group) return;

    // Previous position tracking for movement detection
    const prevX = group.position.x;
    const prevZ = group.position.z;

    group.position.x = lerpVector(
      group.position.x,
      player.x,
      movementAlpha,
      deltaTime
    );
    group.position.z = lerpVector(
      group.position.z,
      player.y,
      movementAlpha,
      deltaTime
    );
    group.position.y = 0.5 + bounce;

    // Calculate if the character is moving
    isMovingRef.current = Math.abs(group.position.x - prevX) > 0.001 || Math.abs(group.position.z - prevZ) > 0.001;

    // Calculate rotation based on movement direction
    type DirectionMap = {
      [key: string]: number;
    };

    const rotations: DirectionMap = {
      'up': 0,
      'down': Math.PI,
      'left': Math.PI / 2,
      'right': -Math.PI / 2,
      'up-left': Math.PI / 4,
      'up-right': -Math.PI / 4,
      'down-left': 3 * Math.PI / 4,
      'down-right': -3 * Math.PI / 4
    };

    const directionKey = player.diagonalDirection || player.lastDirection;

    if (directionKey) {
      targetRotationRef.current = rotations[directionKey] || 0;
    }

    let currentRotation = group.rotation.y;
    let targetRotation = targetRotationRef.current;

    while (currentRotation > Math.PI) currentRotation -= Math.PI * 2;
    while (currentRotation < -Math.PI) currentRotation += Math.PI * 2;
    while (targetRotation > Math.PI) targetRotation -= Math.PI * 2;
    while (targetRotation < -Math.PI) targetRotation += Math.PI * 2;

    let rotationDiff = targetRotation - currentRotation;
    if (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
    if (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

    group.rotation.y = lerpVector(
      currentRotation,
      currentRotation + rotationDiff,
      rotationAlpha,
      deltaTime
    );

    const movementWiggle = isMovingRef.current ? Math.sin(tick * 0.2) * 0.05 : 0;
    group.rotation.y += movementWiggle;
  });

  return (
    <group ref={groupRef}>
      {/* Main blob body */}
      <mesh ref={meshRef} castShadow receiveShadow position={[0, 0, 0]}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshPhysicalMaterial
          color={player.color}
          roughness={0.1}
          metalness={0.0}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
          reflectivity={0.8}
          emissive={new Color(player.color).multiplyScalar(0.2)}
        />
      </mesh>

      {/* Stubby legs */}
      {legPositions.map((pos, index) => {
        // Calculate leg animation - only animate when moving
        const legPhase = isMovingRef.current ? (tick * 0.35 + index * Math.PI / 2) % (Math.PI * 2) : index * Math.PI / 2;
        const legBounce = isMovingRef.current ? Math.sin(legPhase) * 0.18 : 0;
        const legSquish = isMovingRef.current ? Math.cos(legPhase) * 0.2 : 0;

        // Add a slight outward angle to the legs
        const legAngle = Math.atan2(pos.x, pos.z) * 0.3;

        return (
          <group
            key={`leg-${index}`}
            position={[pos.x, -0.3 + legBounce, pos.z]}
            rotation={[legAngle, 0, 0]}
          >
            {/* Foot */}
            <mesh
              castShadow
              position={[0, 0, 0]}
              scale={[1 + Math.abs(legSquish * 0.6), 1 - Math.abs(legSquish * 0.6), 1 + Math.abs(legSquish * 0.6)]}
            >
              <sphereGeometry args={[0.15, 8, 8]} />
              <meshPhysicalMaterial
                color={player.color}
                roughness={0.3}
                metalness={0.0}
                clearcoat={1.0}
                clearcoatRoughness={0.3}
                reflectivity={0.4}
              />
            </mesh>
          </group>
        );
      })}

      {/* Eyes */}
      <group position={[0, 0.2, -0.35]} rotation={[0, 0, 0]}>
        {/* Left eye */}
        <mesh position={[-0.2, 0, 0]}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshPhysicalMaterial
            color="white"
            roughness={0.05}
            clearcoat={1.0}
          />
        </mesh>
        {/* Left pupil */}
        <mesh position={[-0.2, 0, -0.08]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshPhysicalMaterial
            color="black"
            roughness={0.05}
            clearcoat={1.0}
          />
        </mesh>

        {/* Right eye */}
        <mesh position={[0.2, 0, 0]}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshPhysicalMaterial
            color="white"
            roughness={0.05}
            clearcoat={1.0}
          />
        </mesh>
        {/* Right pupil */}
        <mesh position={[0.2, 0, -0.08]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshPhysicalMaterial
            color="black"
            roughness={0.05}
            clearcoat={1.0}
          />
        </mesh>
      </group>

      {/* Shield effect when player has the shield power-up */}
      {player.hasShield && (
        <>
          {/* Shield sphere */}
          <mesh>
            <sphereGeometry args={[0.7, 16, 16]} />
            <meshPhysicalMaterial
              color={POWER_UP_COLORS[PowerUpType.SplatShield]}
              transparent
              opacity={0.4}
              emissive={POWER_UP_COLORS[PowerUpType.SplatShield]}
              emissiveIntensity={0.7}
              clearcoat={1.0}
              transmission={0.2}
              roughness={0.1}
            />
          </mesh>
          {/* Shield glow effect */}
          <pointLight
            color={POWER_UP_COLORS[PowerUpType.SplatShield]}
            distance={1.8}
            intensity={0.7}
            position={[0, 0, 0]}
          />
        </>
      )}

      {/* Jump power-up indicator */}
      {player.canJump && (
        <mesh position={[0, -0.5, 0]}>
          <coneGeometry args={[0.2, 0.4, 16]} />
          <meshPhysicalMaterial
            color={POWER_UP_COLORS[PowerUpType.SplashJump]}
            emissive={POWER_UP_COLORS[PowerUpType.SplashJump]}
            emissiveIntensity={0.7}
            clearcoat={1.0}
            clearcoatRoughness={0.1}
            roughness={0.2}
          />
        </mesh>
      )}

      {/* Speed boost effect */}
      {player.speedMultiplier > 1.0 && (
        <mesh position={[0, -0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.6, 0.7, 16]} />
          <meshPhysicalMaterial
            color={POWER_UP_COLORS[PowerUpType.SpeedBoost]}
            transparent
            opacity={0.8}
            emissive={POWER_UP_COLORS[PowerUpType.SpeedBoost]}
            emissiveIntensity={0.5}
            clearcoat={0.8}
            side={2} // Double-sided
          />
        </mesh>
      )}
    </group>
  );
};

// Animated bomb with timer visual
interface PaintBombProps {
  bomb: Bomb;
  tick: number;
  playerColor: string;
}

const PaintBomb = ({ bomb, tick, playerColor }: PaintBombProps) => {
  // Calculate bomb size pulsation based on fuse timer
  const bombProgress = Math.min(1, (tick - bomb.placedAt) / (60 * bomb.fuseMultiplier));
  const pulsate = Math.sin(bombProgress * Math.PI * 10) * 0.1;
  const scale = 0.3 + pulsate;
  const intensity = 0.3 + bombProgress * 0.7; // Increase glow as bomb nears explosion

  return (
    <group position={[bomb.x, 0.3, bomb.y]}>
      <mesh castShadow>
        <sphereGeometry args={[scale, 16, 16]} />
        <meshPhysicalMaterial
          color="black"
          emissive={playerColor}
          emissiveIntensity={intensity}
          roughness={0.2}
          metalness={0.0}
          clearcoat={0.8}
          clearcoatRoughness={0.2}
          reflectivity={0.5}
        />
      </mesh>

      {/* Timer visualization */}
      <mesh position={[0, 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.25, 32]} />
        <meshPhysicalMaterial color="white" transparent opacity={0.8} clearcoat={0.5} />
      </mesh>
      <mesh position={[0, 0.51, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.25, 32, 1, 0, bombProgress * Math.PI * 2]} />
        <meshPhysicalMaterial color="red" emissive="red" emissiveIntensity={0.5} clearcoat={1.0} />
      </mesh>
    </group>
  );
};

// Paint splat explosion effect
interface PaintExplosionProps {
  explosion: Explosion;
  playerColor: string;
  tick: number;
}

const PaintExplosion = ({ explosion, playerColor, tick }: PaintExplosionProps) => {
  // Calculate explosion lifetime progress (0 to 1)
  const progress = Math.min(1, (tick - explosion.startedAt) / 20);

  // Scale up quickly at the start, then stay expanded
  const scalePattern = progress < 0.3 ? progress / 0.3 : 1;
  const armScale = scalePattern * 0.95;

  // Opacity fades out near the end
  const opacity = progress > 0.7 ? 1 - ((progress - 0.7) / 0.3) : 1;

  // Splatter effect - random offsets for paint blobs
  const splatters = useMemo(() => {
    const result = [];
    const count = 20;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const distance = 0.2 + Math.random() * 0.5;
      result.push({
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        scale: 0.1 + Math.random() * 0.2,
        rotation: Math.random() * Math.PI
      });
    }
    return result;
  }, []);

  return (
    <group key={`explosion-${explosion.playerId}-${explosion.startedAt}`}>
      {/* Explosion center with splatter effect */}
      <group position={[explosion.x, 0.15, explosion.y]}>
        {/* Main center splat */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.2 * scalePattern, 1.2 * scalePattern]} />
          <meshStandardMaterial
            color={playerColor}
            transparent
            opacity={opacity * 0.9}
            emissive={playerColor}
            emissiveIntensity={0.5}
          />
        </mesh>

        {/* Small paint splatters around the center */}
        {splatters.map((splat, i) => (
          <mesh
            key={`splat-${i}`}
            position={[splat.x * scalePattern, 0, splat.y * scalePattern]}
            rotation={[-Math.PI / 2, 0, splat.rotation]}
          >
            <circleGeometry args={[splat.scale * scalePattern, 6]} />
            <meshStandardMaterial
              color={playerColor}
              transparent
              opacity={opacity * 0.8}
            />
          </mesh>
        ))}
      </group>

      {/* Explosion arms with growing animation */}
      {explosion.arms.map((arm, armIndex) => (
        <mesh
          key={`explosion-arm-${armIndex}`}
          position={[arm.x, 0.15, arm.y]}
          rotation={[-Math.PI / 2, 0, Math.random() * Math.PI]}
        >
          <planeGeometry args={[armScale, armScale]} />
          <meshStandardMaterial
            color={playerColor}
            transparent
            opacity={opacity * 0.8}
            emissive={playerColor}
            emissiveIntensity={0.3}
          />
        </mesh>
      ))}
    </group>
  );
};

// Add a component for wall destruction effect
interface WallDestructionProps {
  x: number;
  y: number;
  gridX: number;
  gridY: number;
  tick: number;
  startTick: number;
  color: string;
}

const WallDestruction = ({ x, y, gridX, gridY, tick, startTick, color }: WallDestructionProps) => {
  // Animation progress based on time since wall was destroyed
  const progress = Math.min(1, (tick - startTick) / 15);
  const duration = 15; // Animation lasts for 15 ticks

  // If animation is complete, don't render anything
  if (progress >= 1) return null;

  // Get the original wall height
  const originalHeight = getBreakableWallHeight(gridX, gridY);

  // Generate debris fragments
  const fragments = useMemo(() => {
    const count = 10;
    const pieces = [];
    for (let i = 0; i < count; i++) {
      // Random starting position within the wall bounds
      const offsetX = (Math.random() - 0.5) * 0.5;
      // Adjust Y offset based on the original wall height
      const offsetY = (Math.random() - 0.5) * originalHeight;
      const offsetZ = (Math.random() - 0.5) * 0.5;

      // Random ending position (flying outward)
      const endOffsetX = (Math.random() - 0.5) * 2;
      const endOffsetY = Math.random() * 2 + 1; // Always fly upward
      const endOffsetZ = (Math.random() - 0.5) * 2;

      // Random size for each fragment
      const size = 0.1 + Math.random() * 0.2;

      // Random rotation rates
      const rotateX = Math.random() * 10;
      const rotateY = Math.random() * 10;
      const rotateZ = Math.random() * 10;

      pieces.push({
        offsetX, offsetY, offsetZ,
        endOffsetX, endOffsetY, endOffsetZ,
        size, rotateX, rotateY, rotateZ
      });
    }
    return pieces;
  }, [originalHeight]);

  // Update the starting position to account for the original wall height
  const centerY = originalHeight / 2;

  return (
    <group position={[x, centerY, y]}>
      {/* Render wall fragments */}
      {fragments.map((fragment, i) => {
        // Calculate current position based on animation progress using easing
        const ease = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // Ease in-out quad
        const easedProgress = ease(progress);

        // Interpolate position
        const currentX = fragment.offsetX + (fragment.endOffsetX - fragment.offsetX) * easedProgress;
        const currentY = fragment.offsetY + (fragment.endOffsetY - fragment.offsetY) * easedProgress;
        const currentZ = fragment.offsetZ + (fragment.endOffsetZ - fragment.offsetZ) * easedProgress;

        // Calculate rotation based on progress
        const rotX = fragment.rotateX * progress * Math.PI;
        const rotY = fragment.rotateY * progress * Math.PI;
        const rotZ = fragment.rotateZ * progress * Math.PI;

        // Fade out opacity near the end
        const opacity = 1 - easedProgress;

        return (
          <CustomRoundedBox
            key={`fragment-${i}`}
            position={[currentX, currentY, currentZ]}
            rotation={[rotX, rotY, rotZ]}
            width={fragment.size}
            height={fragment.size}
            depth={fragment.size}
            radius={0.02} // Smaller radius for fragments
            color={color}
            roughness={0.2}
            metalness={0.1}
            transparent
            opacity={opacity}
          />
        );
      })}
    </group>
  );
};

// Function to deterministically calculate height variation based on x,y coordinates
// This ensures all clients see the same height variations
const getBreakableWallHeight = (x: number, y: number): number => {
  // Base height for breakable walls
  const baseHeight = 0.8;

  // Use sine functions on the coordinates for a wave-like pattern
  // Using prime numbers as multipliers helps avoid obvious patterns
  const variation = Math.sin(x * 0.7 + y * 1.3) * 0.05 +
                    Math.sin(x * 1.1 - y * 0.9) * 0.04;

  // Return the base height plus a small variation (±10%)
  return baseHeight + variation;
};

const GameScene = ({ gameState }: GameSceneProps) => {
  const gridRef = useRef<GridHelper>(null);

  // Track wall destruction animations
  const [destroyedWalls, setDestroyedWalls] = useState<{x: number, y: number, gridX: number, gridY: number, tick: number}[]>([]);
  const lastGridRef = useRef<GridCell[][]>(gameState.grid);

  // Check for newly destroyed walls by comparing current grid with previous grid
  useEffect(() => {
    const newDestroyedWalls: {x: number, y: number, gridX: number, gridY: number, tick: number}[] = [];

    // Skip initial render
    if (lastGridRef.current !== gameState.grid) {
      // Go through each cell in the grid
      gameState.grid.forEach((row, y) => {
        row.forEach((cell, x) => {
          // Get the previous state of this cell
          const prevRow = lastGridRef.current[y];
          if (!prevRow) return;

          const prevCell = prevRow[x];
          if (!prevCell) return;

          // Check if a breakable wall was destroyed
          if (prevCell.content === 'breakableWall' && cell.content === 'empty') {
            // This wall was just destroyed
            // Calculate world position
            const worldX = x - gameState.gridSize / 2 + 0.5;
            const worldY = y - gameState.gridSize / 2 + 0.5;

            newDestroyedWalls.push({
              x: worldX, // World position
              y: worldY, // World position
              gridX: x,  // Grid coordinates for height calculation
              gridY: y,  // Grid coordinates for height calculation
              tick: gameState.tick
            });
          }
        });
      });

      // If we found any newly destroyed walls, update the state
      if (newDestroyedWalls.length > 0) {
        setDestroyedWalls(prev => [...prev, ...newDestroyedWalls]);
      }

      // Clean up old animations (remove those older than the duration)
      setDestroyedWalls(prev =>
        prev.filter(wall => (gameState.tick - wall.tick) < 15)
      );
    }

    // Update the reference to the current grid
    lastGridRef.current = gameState.grid;
  }, [gameState.grid, gameState.tick, gameState.gridSize]);

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
            // Use our deterministic function to get varying heights
            cellHeight = getBreakableWallHeight(x, y);
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
              PowerUpType.ShorterFuse,
              PowerUpType.SpeedBoost,
              PowerUpType.SplatShield,
              PowerUpType.SplashJump
            ];
            predictedPowerUpType = getPowerUpTypeAtPosition(powerUpTypes, x, y);
          }

          return (
            <CustomRoundedBox
              key={`cell-${x}-${y}`}
              position={[posX, posY + cellHeight / 2, posZ]}
              width={0.95}
              height={cellHeight}
              depth={0.95}
              radius={0.05}
              segments={2}
              castShadow={cell.content !== 'empty'}
              receiveShadow
              color={cellColor}
              roughness={0.2}
              metalness={0.1}
              clearcoat={0.8}
              clearcoatRoughness={0.2}
              reflectivity={0.5}
              emissive={cell.content !== 'empty' ? cellColor : undefined}
              emissiveIntensity={cell.content !== 'empty' ? 0.15 : 0}
            >
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
                     predictedPowerUpType === PowerUpType.LongerSplat ? '🎯' :
                     predictedPowerUpType === PowerUpType.ShorterFuse ? '⏱️' :
                     predictedPowerUpType === PowerUpType.SpeedBoost ? '🏃' :
                     predictedPowerUpType === PowerUpType.SplatShield ? '🛡️' :
                     predictedPowerUpType === PowerUpType.SplashJump ? '🦘' : '❓'}
                  </div>
                </Html>
              )}
            </CustomRoundedBox>
          );
        })
      )}

      {/* Render bombs with enhanced visual */}
      {gameState.bombs.map((bomb, index) => {
        const player = gameState.players.get(bomb.playerId);
        const playerColor = player ? player.color : 'red';

        return (
          <PaintBomb
            key={`bomb-${index}`}
            bomb={bomb}
            tick={gameState.tick}
            playerColor={playerColor}
          />
        );
      })}

      {/* Render explosions with enhanced visuals */}
      {gameState.explosions.map((explosion, expIndex) => {
        const player = gameState.players.get(explosion.playerId);
        const explosionColor = player ? player.color : 'red';

        return (
          <PaintExplosion
            key={`explosion-${expIndex}`}
            explosion={explosion}
            playerColor={explosionColor}
            tick={gameState.tick}
          />
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
              ) : powerUp.type === PowerUpType.ShorterFuse ? (
                <boxGeometry args={[0.3, 0.3, 0.3]} />
              ) : powerUp.type === PowerUpType.SpeedBoost ? (
                <torusGeometry args={[0.2, 0.08, 16, 32]} />
              ) : powerUp.type === PowerUpType.SplatShield ? (
                <dodecahedronGeometry args={[0.25, 0]} />
              ) : (
                <coneGeometry args={[0.2, 0.4, 16]} />
              )}
              <meshPhysicalMaterial
                color={powerUpColor}
                emissive={powerUpColor}
                emissiveIntensity={0.7}
                roughness={0.1}
                metalness={0.1}
                clearcoat={1.0}
                clearcoatRoughness={0.1}
                reflectivity={0.8}
                transmission={0.2}
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

      {/* Replace the player rendering with our new PlayerCharacter component */}
      {Array.from(gameState.players.values()).map(player => (
        <PlayerCharacter key={player.playerId} player={player} tick={gameState.tick} />
      ))}

      {/* Render wall destruction effects */}
      {destroyedWalls.map((wall, index) => (
        <WallDestruction
          key={`wall-destruction-${index}-${wall.tick}`}
          x={wall.x}
          y={wall.y}
          gridX={wall.gridX}
          gridY={wall.gridY}
          tick={gameState.tick}
          startTick={wall.tick}
          color={BREAKABLE_WALL_COLOR}
        />
      ))}
    </>
  );
};

export default GameScene;
