import { useRef, useMemo, useState, useEffect } from 'react';
import { Group, Mesh, Color, Object3D, Vector3 } from 'three';
import { GameState, PlayerState, Bomb, Explosion, GridCell } from '@/game/simulation';
import { PowerUpType } from '@/types/shared';
import { Html } from '@react-three/drei';
import { ENV } from '@/utils/env';
import { willSpawnPowerUpAtPosition, getPowerUpTypeAtPosition } from '@/utils/random';
import { useFrame } from '@react-three/fiber';
import CustomRoundedBox, { InstancedRoundedBox } from './RoundedBox';
import { WALL_COLOR, BREAKABLE_WALL_COLOR, FLOOR_COLOR, POWER_UP_COLORS, MATERIAL_PROPERTIES } from '../utils/colors';

let alreadyRedirected = false;
function redirectToNextJam() {
  if (alreadyRedirected) return;
  alreadyRedirected = true;
  window.location.href = 'https://portal.pieter.com';
}

// Portal constants
const PORTAL_POSITION = { x: 20, y: 15 }; // Changed from center to a more visible position
const PORTAL_COLOR = "#00ff66"; // Bright green color
const PORTAL_INNER_COLOR = "#88ffaa"; // Lighter green for inner glow

interface GameSceneProps {
  gameState: GameState;
}

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
  gameState: GameState;
}

const PlayerCharacter = ({ player, tick, gameState }: PlayerCharacterProps) => {
  const bodyRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const targetRotationRef = useRef(0);
  const movementAlpha = 0.15;
  const rotationAlpha = 0.2;
  const isMovingRef = useRef(false);
  const legAnimationTimeRef = useRef(0);

  // Add portal state tracking
  const [isFallingInPortal, setIsFallingInPortal] = useState(false);
  const fallStartTickRef = useRef(0);

  // Calculate leg positions and animations
  const legPositions = useMemo(() => {
    return [
      { x: 0.35, z: 0 },  // Front leg
      { x: -0.35, z: 0 },   // Back leg
    ];
  }, []);

  // Memoize legs to improve performance
  const legs = useMemo(() => {
    return legPositions.map((pos, index) => {
      return {
        position: pos,
        index,
        phaseOffset: index * Math.PI
      };
    });
  }, [legPositions]);

  // Use useFrame to update position with lerp
  useFrame(({}, deltaTime) => {
    const group = groupRef.current;
    if (!group) return;

    // Calculate world coordinates of the portal
    const portalWorldX = PORTAL_POSITION.x - gameState.gridSize / 2 + 0.5;
    const portalWorldY = PORTAL_POSITION.y - gameState.gridSize / 2 + 0.5;

    // Check if player is on the portal cell and portal is enabled
    const isOnPortalCell = Math.abs(player.x - portalWorldX) < 0.5 &&
                           Math.abs(player.y - portalWorldY) < 0.5;

    // Handle falling animation
    if (isOnPortalCell && PORTAL_ENABLED && !isFallingInPortal) {
      setIsFallingInPortal(true);
      fallStartTickRef.current = Date.now();
      group.position.x = portalWorldX;
      group.position.y = portalWorldY;
    }
    if (isFallingInPortal) {
      const fallDuration = 2000; // ms
      const fallProgress = (Date.now() - fallStartTickRef.current) / fallDuration;

      if (fallProgress <= 1) {
        // Scale down and move down
        const scale = 1 - fallProgress * 0.9;
        group.scale.set(scale, scale, scale);
        group.position.y = 0.5 - fallProgress * 3;
        group.rotation.z += deltaTime * 2;

        // Skip normal positioning logic during portal fall
        return;
      } else {
        redirectToNextJam();
      }
    }

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

    group.position.y = 0.5;

    // animate the body
    const body = bodyRef.current;
    if (!body) return;
    const bounce = Math.sin(tick * 0.2) * 0.02;
    body.position.y = bounce;

    // Calculate if the character is moving
    isMovingRef.current = Math.abs(group.position.x - prevX) > 0.001 || Math.abs(group.position.z - prevZ) > 0.001;

    // Update leg animation time based on movement
    if (isMovingRef.current) {
      legAnimationTimeRef.current += deltaTime * 5; // Speed factor can be adjusted
    }

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

  // If the player is deep in the portal fall animation, don't render them
  if (isFallingInPortal && (tick - fallStartTickRef.current) > 60) {
    return null;
  }

  return (
    <group ref={groupRef}>
      {/* Main blob body */}
      <group ref={bodyRef}>
        <mesh castShadow receiveShadow position={[0, 0, 0]} scale={[1, 1, 1]}>
            <sphereGeometry args={[0.5, 16, 16]}/>
            <meshPhysicalMaterial
            color={player.color}
            roughness={MATERIAL_PROPERTIES.STANDARD.ROUGHNESS}
            metalness={MATERIAL_PROPERTIES.STANDARD.METALNESS}
            clearcoat={MATERIAL_PROPERTIES.CLEAR_COAT.VALUE}
            clearcoatRoughness={MATERIAL_PROPERTIES.CLEAR_COAT.ROUGHNESS}
            reflectivity={MATERIAL_PROPERTIES.REFLECTIVITY}
            emissive={new Color(player.color).multiplyScalar(MATERIAL_PROPERTIES.EMISSIVE_INTENSITY.LOW)}
            />
        </mesh>
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


      </group>

      {/* Stubby legs */}
      {legs.map((leg) => {
        // Calculate leg animation - only animate when moving
        const legPhase = isMovingRef.current
          ? (legAnimationTimeRef.current + leg.phaseOffset) % (Math.PI * 2)
          : leg.phaseOffset;
        const legBounce = isMovingRef.current ? Math.sin(legPhase) * 0.2 : 0;
        const legSquish = isMovingRef.current ? Math.cos(legPhase) * 0.5 : 0;

        // Calculate leg position based on character rotation
        const angle = targetRotationRef.current;

        // Apply rotation matrix to original position
        const offsetX = leg.position.x;
        const offsetZ = legPhase * 0.05 - 0.2;

        return (
          <group
            key={`leg-${leg.index}`}
            position={[offsetX, -0.3 + legBounce, offsetZ]}
            rotation={[0, angle, 0]}
          >
            {/* Foot */}
            <mesh
              castShadow
              position={[0, 0, 0]}
              scale={[1 + Math.abs(legSquish * 0.7), 1 - Math.abs(legSquish * 0.7), 1 + Math.abs(legSquish * 0.7)]}
            >
              <sphereGeometry args={[0.22, 16, 8]} />
              <meshPhysicalMaterial
                color={player.color}
                roughness={MATERIAL_PROPERTIES.STANDARD.ROUGHNESS}
                metalness={MATERIAL_PROPERTIES.STANDARD.METALNESS}
                clearcoat={MATERIAL_PROPERTIES.CLEAR_COAT.VALUE}
                clearcoatRoughness={MATERIAL_PROPERTIES.CLEAR_COAT.ROUGHNESS}
                reflectivity={MATERIAL_PROPERTIES.REFLECTIVITY}
              />
            </mesh>
          </group>
        );
      })}

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
  const scale = (0.3 + bombProgress * 0.7) + pulsate * (bombProgress * 2);
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

// Add this new function for batching similar grid cells
interface CellInstance {
  posX: number;
  posY: number;
  posZ: number;
  height: number;
  color: string;
  castShadow: boolean;
}

// Check if portal is enabled via URL parameter
const PORTAL_ENABLED = ((): boolean => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const enabled = params.get('portal') === 'true';
    return enabled;
  }
  return false;
})();

// Add the Portal component
interface PortalProps {
  position: { x: number, y: number };
  tick: number;
  gameState: GameState;
}

const Portal = ({ position, tick, gameState }: PortalProps) => {
  // Portal animation
  const rotationSpeed = 0.02;
  const portalRef = useRef<Group>(null);
  const innerRingRef = useRef<Mesh>(null);

  // Ensure portal is within grid bounds
  const gridPosition = {
    x: Math.min(Math.max(position.x, 0), gameState.gridSize - 1),
    y: Math.min(Math.max(position.y, 0), gameState.gridSize - 1)
  };

  // Calculate world position
  const worldX = gridPosition.x - gameState.gridSize / 2 + 0.5;
  const worldZ = gridPosition.y - gameState.gridSize / 2 + 0.5;

  // Portal effect - pulsing and rotation
  useFrame((_, delta) => {
    if (portalRef.current) {
      // Rotate the portal
      //portalRef.current.rotation.y += rotationSpeed;

      // Pulsing effect
      const pulse = Math.sin(tick * 0.1) * 0.2 + 0.8;
      if (innerRingRef.current) {
        innerRingRef.current.scale.set(pulse, 1, pulse);
      }
    }
  });

  return (
    <group ref={portalRef} position={[worldX, 0.15, worldZ]} rotation={[Math.PI/2, 0, 0]}>
      {/* Outer ring */}
      <mesh receiveShadow>
        <torusGeometry args={[0.4, 0.08, 16, 32]} />
        <meshPhysicalMaterial
          color={PORTAL_COLOR}
          emissive={PORTAL_COLOR}
          emissiveIntensity={1.0}
          roughness={0.1}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
          reflectivity={0.8}
        />
      </mesh>

      {/* Inner ring with pulse animation */}
      <mesh ref={innerRingRef} position={[0, -0.01, 0]}>
        <torusGeometry args={[0.3, 0.04, 16, 32]} />
        <meshPhysicalMaterial
          color={PORTAL_INNER_COLOR}
          emissive={PORTAL_INNER_COLOR}
          emissiveIntensity={0.6}
          transparent
          opacity={0.7}
          roughness={0.1}
          clearcoat={1.0}
        />
      </mesh>

      {/* Portal center void */}
      <mesh position={[0, -0.02, 0]}>
        <circleGeometry args={[0.25, 32]} />
        <meshPhysicalMaterial
          color="black"
          emissive="black"
          roughness={0}
          metalness={0}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Swirling particles in the portal */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const radius = 0.15 + Math.sin(tick * 0.05 + i) * 0.05;
        const x = Math.cos(angle + tick * 0.1) * radius;
        const z = Math.sin(angle + tick * 0.1) * radius;
        return (
          <mesh key={`particle-${i}`} position={[x, -0.01, z]} rotation={[0, tick * 0.1 + i, 0]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshPhysicalMaterial
              color={PORTAL_COLOR}
              emissive={PORTAL_COLOR}
              emissiveIntensity={1.5}
              transparent
              opacity={0.8}
            />
          </mesh>
        );
      })}

      {/* Portal glow - make larger for more visibility */}
      <pointLight
        color={PORTAL_COLOR}
        intensity={1.5}
        distance={3}
        position={[0, 0.3, 0]}
      />
    </group>
  );
};

const GameScene = ({ gameState }: GameSceneProps) => {
  const wallInstancesRef = useRef<Object3D>(new Object3D());
  const breakableWallInstancesRef = useRef<Object3D>(new Object3D());
  const floorInstancesRef = useRef<Object3D>(new Object3D());

  // Track wall destruction animations
  const [destroyedWalls, setDestroyedWalls] = useState<{x: number, y: number, gridX: number, gridY: number, tick: number}[]>([]);
  const lastGridRef = useRef<GridCell[][]>(gameState.grid);

  // Group cells by type for instancing
  const { wallCells, breakableWallCells, floorCells } = useMemo(() => {
    const walls: CellInstance[] = [];
    const breakableWalls: CellInstance[] = [];
    const floors: CellInstance[] = [];

    gameState.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        // Calculate position in 3D space
        const posX = x - gameState.gridSize / 2 + 0.5;
        const posZ = y - gameState.gridSize / 2 + 0.5;
        let posY = 0;
        let cellColor = FLOOR_COLOR;
        let cellHeight = 0.1;
        let castShadow = false;

        if (cell.content === 'wall') {
          cellColor = WALL_COLOR;
          cellHeight = 1;
          castShadow = true;
          walls.push({
            posX,
            posY: posY + cellHeight / 2,
            posZ,
            height: cellHeight,
            color: cellColor,
            castShadow
          });
        } else if (cell.content === 'breakableWall') {
          cellColor = BREAKABLE_WALL_COLOR;
          cellHeight = getBreakableWallHeight(x, y);
          castShadow = true;
          breakableWalls.push({
            posX,
            posY: posY + cellHeight / 2,
            posZ,
            height: cellHeight,
            color: cellColor,
            castShadow
          });
        } else {
          if (cell.paintedBy) {
            // If painted, use player's color
            const player = gameState.players.get(cell.paintedBy);
            if (player) {
              cellColor = player.color;
            }
          }
          floors.push({
            posX,
            posY: posY + cellHeight / 2,
            posZ,
            height: cellHeight,
            color: cellColor,
            castShadow
          });
        }
      });
    });

    return {
      wallCells: walls,
      breakableWallCells: breakableWalls,
      floorCells: floors
    };
  }, [gameState.grid, gameState.gridSize, gameState.players]);

  // Setup instancing for walls
  const { wallPositions, wallScales } = useMemo(() => {
    const positions = new Float32Array(wallCells.length * 3);
    const scales = new Float32Array(wallCells.length * 3);

    wallCells.forEach((cell, i) => {
      const idx = i * 3;
      positions[idx] = cell.posX;
      positions[idx + 1] = cell.posY;
      positions[idx + 2] = cell.posZ;

      scales[idx] = 0.95;
      scales[idx + 1] = cell.height;
      scales[idx + 2] = 0.95;
    });

    return { wallPositions: positions, wallScales: scales };
  }, [wallCells]);

  // Setup instancing for breakable walls
  const { breakableWallPositions, breakableWallScales } = useMemo(() => {
    const positions = new Float32Array(breakableWallCells.length * 3);
    const scales = new Float32Array(breakableWallCells.length * 3);

    breakableWallCells.forEach((cell, i) => {
      const idx = i * 3;
      positions[idx] = cell.posX;
      positions[idx + 1] = cell.posY;
      positions[idx + 2] = cell.posZ;

      scales[idx] = 0.95;
      scales[idx + 1] = cell.height;
      scales[idx + 2] = 0.95;
    });

    return {
      breakableWallPositions: positions,
      breakableWallScales: scales
    };
  }, [breakableWallCells]);

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
      {/* vibejam portal */}
      {PORTAL_ENABLED && (
        <Portal
          position={PORTAL_POSITION}
          tick={gameState.tick}
          gameState={gameState}
        />
      )}

      {/* Render walls using instancing */}
      {wallCells.length > 0 && (
        <InstancedRoundedBox
          count={wallCells.length}
          positions={wallPositions}
          scales={wallScales}
          width={1}
          height={1}
          depth={1}
          radius={0.05}
          segments={2}
          roughness={0.2}
          metalness={0.1}
          clearcoat={0.8}
          clearcoatRoughness={0.2}
          reflectivity={0.5}
          castShadow
          receiveShadow
          color={WALL_COLOR}
        />
      )}

      {/* Render breakable walls using instancing */}
      {breakableWallCells.length > 0 && (
        <InstancedRoundedBox
          count={breakableWallCells.length}
          positions={breakableWallPositions}
          scales={breakableWallScales}
          width={1}
          height={1}
          depth={1}
          radius={0.05}
          segments={2}
          roughness={0.2}
          metalness={0.1}
          clearcoat={0.8}
          clearcoatRoughness={0.2}
          reflectivity={0.5}
          castShadow
          receiveShadow
          color={BREAKABLE_WALL_COLOR}
        />
      )}

      {/* Render floor cells by grouping by color */}
      {gameState.players.size > 0 && Array.from(gameState.players.values()).map(player => {
        // Filter floor cells by this player's color
        const playerFloorCells = floorCells.filter(cell => cell.color === player.color);

        if (playerFloorCells.length === 0) return null;

        // Create positions and scales for this player's floor cells
        const positions = new Float32Array(playerFloorCells.length * 3);
        const scales = new Float32Array(playerFloorCells.length * 3);

        playerFloorCells.forEach((cell, i) => {
          const idx = i * 3;
          positions[idx] = cell.posX;
          positions[idx + 1] = cell.posY;
          positions[idx + 2] = cell.posZ;

          scales[idx] = 0.95;
          scales[idx + 1] = cell.height;
          scales[idx + 2] = 0.95;
        });

        return (
          <InstancedRoundedBox
            key={`floor-${player.playerId}`}
            count={playerFloorCells.length}
            positions={positions}
            scales={scales}
            width={1}
            height={1}
            depth={1}
            radius={0.05}
            segments={2}
            roughness={MATERIAL_PROPERTIES.STANDARD.ROUGHNESS}
            metalness={MATERIAL_PROPERTIES.STANDARD.METALNESS}
            clearcoat={MATERIAL_PROPERTIES.CLEAR_COAT.VALUE}
            clearcoatRoughness={MATERIAL_PROPERTIES.CLEAR_COAT.ROUGHNESS}
            reflectivity={MATERIAL_PROPERTIES.REFLECTIVITY}
            emissive={new Color(player.color).multiplyScalar(MATERIAL_PROPERTIES.EMISSIVE_INTENSITY.LOW)}
            castShadow={false}
            receiveShadow
            color={player.color}
          />
        );
      })}

      {/* Render unpainted floor cells */}
      {(() => {
        // Filter floor cells that are unpainted (default floor color)
        const unpaintedFloorCells = floorCells.filter(cell => cell.color === FLOOR_COLOR);

        if (unpaintedFloorCells.length === 0) return null;

        // Create positions and scales for unpainted floor cells
        const positions = new Float32Array(unpaintedFloorCells.length * 3);
        const scales = new Float32Array(unpaintedFloorCells.length * 3);

        unpaintedFloorCells.forEach((cell, i) => {
          const idx = i * 3;
          positions[idx] = cell.posX;
          positions[idx + 1] = cell.posY;
          positions[idx + 2] = cell.posZ;

          scales[idx] = 0.95;
          scales[idx + 1] = cell.height;
          scales[idx + 2] = 0.95;
        });

        return (
          <InstancedRoundedBox
            count={unpaintedFloorCells.length}
            positions={positions}
            scales={scales}
            width={1}
            height={1}
            depth={1}
            radius={0.05}
            segments={2}
            roughness={0.2}
            metalness={0.1}
            clearcoat={0.8}
            clearcoatRoughness={0.2}
            reflectivity={0.5}
            castShadow={false}
            receiveShadow
            color={FLOOR_COLOR}
          />
        );
      })()}

      {/* Render dev mode power-up indicators */}
      {ENV.DEV_MODE && gameState.grid.map((row, y) =>
        row.map((cell, x) => {
          if (!PORTAL_ENABLED && PORTAL_POSITION.x === x && PORTAL_POSITION.y === y) return null;
          if (cell.content !== 'breakableWall') return null;

          const posX = x - gameState.gridSize / 2 + 0.5;
          const posZ = y - gameState.gridSize / 2 + 0.5;
          const cellHeight = getBreakableWallHeight(x, y);

          const wouldSpawnPowerUp = willSpawnPowerUpAtPosition(POWERUP_SPAWN_CHANCE, x, y);
          if (!wouldSpawnPowerUp) return null;

          const predictedPowerUpType = getPowerUpTypeAtPosition([
            PowerUpType.ExtraBomb,
            PowerUpType.LongerSplat,
            PowerUpType.ShorterFuse,
            PowerUpType.SpeedBoost,
            PowerUpType.SplatShield,
            PowerUpType.SplashJump
          ], x, y);

          return (
            <Html
              key={`powerup-indicator-${x}-${y}`}
              position={[posX, cellHeight + 0.5, posZ]}
              center
              zIndexRange={[1, 10]}
            >
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
        <PlayerCharacter key={player.playerId} player={player} tick={gameState.tick} gameState={gameState} />
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
