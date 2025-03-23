import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { GridHelper } from 'three';
import { GameTick } from '@/types/shared';
import { createInitialGameState, GameState, processGameTick } from '@/game/simulation';

interface GameSceneProps {
  latestTick: GameTick | null;
}

const GameScene = ({ latestTick }: GameSceneProps) => {
  const gridRef = useRef<GridHelper>(null);
  const [gameState, setGameState] = useState<GameState>(createInitialGameState());

  // Process incoming ticks
  useEffect(() => {
    if (latestTick) {
      // Update game state based on the tick
      setGameState(currentState => processGameTick(currentState, latestTick));
    }
  }, [latestTick]);

  return (
    <>
      <gridHelper
        ref={gridRef}
        args={[20, 20]}
        position={[0, 0.01, 0]}
      />

      {/* Temporary ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#aaaaaa" />
      </mesh>

      {/* Render all players */}
      {Array.from(gameState.players.values()).map(player => (
        <group key={player.playerId} position={[player.x, 0.5, player.y]}>
          <mesh castShadow>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={player.color} />
          </mesh>
        </group>
      ))}

      {/* Display current tick for debugging */}
      {latestTick && (
        <group position={[-9, 1, -9]}>
          <mesh>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshStandardMaterial color="green" />
          </mesh>
        </group>
      )}
    </>
  );
};

export default GameScene;
