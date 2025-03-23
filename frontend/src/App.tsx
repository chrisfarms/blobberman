import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import GameScene from './components/GameScene';
import Controls from './components/Controls';
import { useWebSocket } from './hooks/useWebSocket';
import { useRef } from 'react';
import { Direction } from './types/shared';

function App() {
  const { connectionState, playerId, latestTick, sendInput } = useWebSocket();

  // Reference to store the current direction for sending to the server
  const currentDirectionRef = useRef<Direction | null>(null);
  const placeBlob = useRef(false);

  // Handler for player controls - will be passed to the Controls component
  const handleControlsChange = (direction: Direction | null, isPlacingBlob: boolean) => {
    // Update refs
    currentDirectionRef.current = direction;
    placeBlob.current = isPlacingBlob;

    // Send input to server
    sendInput({
      direction,
      placeBlob: isPlacingBlob
    });
  };

  return (
    <>
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10 }}>
        Status: {connectionState} {playerId && `(ID: ${playerId.substring(0, 6)})`}
      </div>

      <Canvas
        shadows
        camera={{ position: [15, 15, 15], fov: 50 }}
      >
        <color attach="background" args={['#f0f0f0']} />
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 10, 10]}
          intensity={1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />

        <GameScene latestTick={latestTick} />
        <OrbitControls />
      </Canvas>

      <Controls onControlsChange={handleControlsChange} />
    </>
  );
}

export default App;
