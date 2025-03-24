import { Canvas } from '@react-three/fiber';
import GameScene from './components/GameScene';
import Controls from './components/Controls';
import HUD from './components/HUD';
import Minimap from './components/Minimap';
import NameInputModal from './components/NameInputModal';
import { useWebSocket } from './hooks/useWebSocket';
import { useRef } from 'react';
import { Direction } from './types/shared';
import PlayerCamera from './components/PlayerCamera';
import useSoundEffects from './hooks/useSoundEffects';

function App() {
  const { connectionState, playerId, displayName, gameState, sendInput, setDisplayName } = useWebSocket();

  // Reference to store the current direction for sending to the server
  const currentDirectionRef = useRef<Direction | null>(null);
  const placeBlob = useRef(false);

  // Get current player data
  const currentPlayer = gameState ? gameState.players.get(playerId) : undefined;

  // Initialize sound effects
  useSoundEffects(gameState);

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

  // Handler for name input submission
  const handleNameSubmit = (name: string) => {
    setDisplayName(name);
  };

  if (gameState === null) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f0f0f0',
        flexDirection: 'column',
        fontFamily: 'Arial, sans-serif',
        color: '#333'
      }}>
        <h2>Loading game...</h2>
        <p>Connecting to server: {connectionState}</p>
      </div>
    );
  }

  // Determine if name modal should be shown (no displayName set)
  const showNameModal = !displayName;

  return (
    <>
      <HUD gameState={gameState} />

      <Canvas
        shadows
        camera={{ position: [15, 15, 15], fov: 50 }}
        style={{
          width: '100vw',
          height: '100vh',
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: showNameModal ? 'none' : 'auto' // Disable pointer events when modal is active
        }}
      >
        <color attach="background" args={['#e6e6e6']} />
        <ambientLight intensity={0.5} />

        {/* Main directional light for general illumination */}
        <directionalLight
          position={[20, 30, 20]}
          intensity={0.7}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-30}
          shadow-camera-right={30}
          shadow-camera-top={30}
          shadow-camera-bottom={-30}
        />

        {/* Secondary light from the opposite direction to reduce harsh shadows */}
        <directionalLight
          position={[-20, 20, -20]}
          intensity={0.3}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-25}
          shadow-camera-right={25}
          shadow-camera-top={25}
          shadow-camera-bottom={-25}
        />

        {/* Add a soft hemisphere light with more contrast */}
        <hemisphereLight
          args={['#e0e0ff', '#c0c0c0', 0.5]}
        />

        {/* Add a subtle fog effect for depth */}
        <fog attach="fog" args={['#d0d0d0', 40, 90]} />

        <GameScene gameState={gameState} />
        {currentPlayer && (
          <PlayerCamera
            player={currentPlayer}
            gridSize={gameState.gridSize}
            explosions={gameState.explosions}
          />
        )}
      </Canvas>

      {/* Only show controls if player has set a display name */}
      {!showNameModal && <Controls onControlsChange={handleControlsChange} />}

      {/* Show the minimap when player is in game */}
      {!showNameModal && <Minimap gameState={gameState} currentPlayerId={playerId} />}

      {/* Show name input modal if no display name set */}
      <NameInputModal
        isVisible={showNameModal}
        onNameSubmit={handleNameSubmit}
      />
    </>
  );
}

export default App;
