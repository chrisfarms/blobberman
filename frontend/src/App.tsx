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

  // Track input state
  const inputState = useRef({
    up: false,
    down: false,
    left: false,
    right: false,
    placeBlob: false
  });

  // Get current player data
  const currentPlayer = gameState ? gameState.players.get(playerId) : undefined;

  // Initialize sound effects
  useSoundEffects(gameState);

  // Handler for player controls - will be passed to the Controls component
  const handleControlsChange = (
    directionalInput: {up: boolean, down: boolean, left: boolean, right: boolean},
    isPlacingBlob: boolean
  ) => {
    // Update input state
    inputState.current = {
      ...directionalInput,
      placeBlob: isPlacingBlob
    };

    // Send input to server
    sendInput(inputState.current);
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
        backgroundColor: '#121212',
        flexDirection: 'column',
        fontFamily: 'Arial, sans-serif',
        color: '#e0e0e0'
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
        <color attach="background" args={['#121212']} />
        <ambientLight intensity={0.6} color="#b0c4de" />

        {/* Main directional light for general illumination */}
        <directionalLight
          position={[20, 30, 20]}
          intensity={0.9}
          color="#ffffff"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-30}
          shadow-camera-right={30}
          shadow-camera-top={30}
          shadow-camera-bottom={-30}
          shadow-bias={-0.0001}
        />

        {/* Secondary light from the opposite direction to reduce harsh shadows */}
        <directionalLight
          position={[-20, 20, -20]}
          intensity={0.5}
          color="#a0e6ff"
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-25}
          shadow-camera-right={25}
          shadow-camera-top={25}
          shadow-camera-bottom={-25}
          shadow-bias={-0.0001}
        />

        {/* Add a soft hemisphere light with more contrast */}
        <hemisphereLight
          args={['#80a0ff', '#403060', 0.7]}
        />

        {/* Add a subtle fog effect for depth */}
        <fog attach="fog" args={['#1a1a2e', 50, 100]} />

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
