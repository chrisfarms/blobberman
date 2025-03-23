import { useEffect, useRef, useState } from 'react';
import nipplejs, { JoystickManager, JoystickOutputData, EventData, Direction as JoystickDirection } from 'nipplejs';
import { Direction } from '@/types/shared';

interface ControlsProps {
  onControlsChange: (direction: Direction | null, isPlacingBlob: boolean) => void;
}

const Controls = ({ onControlsChange }: ControlsProps) => {
  const joystickContainerRef = useRef<HTMLDivElement>(null);
  const joystickManagerRef = useRef<JoystickManager | null>(null);
  const [currentDirection, setCurrentDirection] = useState<Direction | null>(null);
  const [isPlacingBlob, setIsPlacingBlob] = useState(false);

  // Send input changes to parent
  useEffect(() => {
    onControlsChange(currentDirection, isPlacingBlob);
  }, [currentDirection, isPlacingBlob, onControlsChange]);

  useEffect(() => {
    if (!joystickContainerRef.current) return;

    // Initialize joystick
    joystickManagerRef.current = nipplejs.create({
      zone: joystickContainerRef.current,
      mode: 'static',
      position: { left: '50%', bottom: '80px' },
      color: 'rgba(255, 100, 200, 0.5)',
      size: 120,
    });

    // Handle joystick movement
    const handleMove = (_evt: EventData, data: JoystickOutputData) => {
      const dir = data.direction.angle as Direction;
      setCurrentDirection(dir);
    };

    const handleEnd = () => {
      setCurrentDirection(null);
    };

    joystickManagerRef.current.on('dir', handleMove);
    joystickManagerRef.current.on('end', handleEnd);

    // Clean up
    return () => {
      joystickManagerRef.current?.destroy();
    };
  }, []);

  // Handle keyboard input
  useEffect(() => {
    const keysPressed = new Set<string>();

    const updateDirection = () => {
      if (keysPressed.has('ArrowUp') || keysPressed.has('w') || keysPressed.has('W')) {
        setCurrentDirection('up');
      } else if (keysPressed.has('ArrowDown') || keysPressed.has('s') || keysPressed.has('S')) {
        setCurrentDirection('down');
      } else if (keysPressed.has('ArrowLeft') || keysPressed.has('a') || keysPressed.has('A')) {
        setCurrentDirection('left');
      } else if (keysPressed.has('ArrowRight') || keysPressed.has('d') || keysPressed.has('D')) {
        setCurrentDirection('right');
      } else {
        setCurrentDirection(null);
      }

      // Space key for placing blob
      setIsPlacingBlob(keysPressed.has(' '));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.add(e.key);
      updateDirection();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.delete(e.key);
      updateDirection();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <>
      <div
        ref={joystickContainerRef}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: '200px',
          pointerEvents: 'auto',
          zIndex: 100,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end'
        }}
      />

      {/* Blob button for touch devices */}
      <div
        style={{
          position: 'absolute',
          bottom: '80px',
          right: '80px',
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          backgroundColor: isPlacingBlob ? 'rgba(255, 0, 0, 0.7)' : 'rgba(255, 100, 100, 0.5)',
          zIndex: 100,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          userSelect: 'none',
          cursor: 'pointer',
          touchAction: 'none'
        }}
        onTouchStart={() => setIsPlacingBlob(true)}
        onTouchEnd={() => setIsPlacingBlob(false)}
        onMouseDown={() => setIsPlacingBlob(true)}
        onMouseUp={() => setIsPlacingBlob(false)}
        onMouseLeave={() => setIsPlacingBlob(false)}
      >
        BOMB
      </div>
    </>
  );
};

export default Controls;
