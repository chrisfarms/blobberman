import { useEffect, useRef, useState } from 'react';
import nipplejs, { JoystickManager, JoystickOutputData, EventData } from 'nipplejs';
import styles from './Controls.module.css';

interface ControlsProps {
  onControlsChange: (directionalInput: {up: boolean, down: boolean, left: boolean, right: boolean}, isPlacingBlob: boolean) => void;
}

const Controls = ({ onControlsChange }: ControlsProps) => {
  const joystickContainerRef = useRef<HTMLDivElement>(null);
  const joystickManagerRef = useRef<JoystickManager | null>(null);
  const [directionalInput, setDirectionalInput] = useState({
    up: false,
    down: false,
    left: false,
    right: false
  });
  const [isPlacingBlob, setIsPlacingBlob] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect if device is mobile/touch
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia("(max-width: 768px)").matches);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Send input changes to parent
  useEffect(() => {
    onControlsChange(directionalInput, isPlacingBlob);
  }, [directionalInput, isPlacingBlob, onControlsChange]);

  useEffect(() => {
    if (!joystickContainerRef.current) return;

    // Initialize joystick with different positions for mobile vs desktop
    joystickManagerRef.current = nipplejs.create({
      zone: joystickContainerRef.current,
      mode: 'static',
      position: isMobile || true
        ? { left: '100px', bottom: '120px' }
        : { left: '50%', bottom: '80px' },
      color: 'rgba(255, 100, 200, 0.6)',
      size: isMobile ? 100 : 120,
    });

    // Handle joystick movement
    const handleMove = (_evt: EventData, data: JoystickOutputData) => {
      const angle = data.angle.degree;
      console.log(angle);
      const force = Math.min(data.force, 1.0); // Normalize force to 0-1

      // Convert angle to directional inputs
      // Using 8-way directional input for joystick
      // Directions are: 0 = right, π/2 = up, π = left, 3π/2 = down
      const directions = {
        up: false,
        down: false,
        left: false,
        right: false
      };

      // Apply force threshold to avoid accidental inputs
      if (force > 0.2) {
        // anything on top side of joystick
        directions.up = angle > 0 && angle < 180;

        // anything on bottom side of joystick
        directions.down = angle > 180 && angle < 360;

        // anything on left side of joystick
        directions.left = angle > 90 && angle < 270

        // anything on right side of joystick
        directions.right = angle < 90 || angle > 270
      }

      setDirectionalInput(directions);
    };

    const handleEnd = () => {
      setDirectionalInput({
        up: false,
        down: false,
        left: false,
        right: false
      });
    };

    joystickManagerRef.current.on('move', handleMove);
    joystickManagerRef.current.on('end', handleEnd);

    // Clean up
    return () => {
      joystickManagerRef.current?.destroy();
    };
  }, [isMobile]);

  // Handle keyboard input
  useEffect(() => {
    const keysPressed = new Set<string>();

    const updateDirection = () => {
      setDirectionalInput({
        up: keysPressed.has('ArrowUp') || keysPressed.has('w') || keysPressed.has('W'),
        down: keysPressed.has('ArrowDown') || keysPressed.has('s') || keysPressed.has('S'),
        left: keysPressed.has('ArrowLeft') || keysPressed.has('a') || keysPressed.has('A'),
        right: keysPressed.has('ArrowRight') || keysPressed.has('d') || keysPressed.has('D')
      });

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
      {/* Joystick container */}
      <div
        ref={joystickContainerRef}
        className={styles.joystickContainer}
      />

      {/* Blob button for touch devices */}
      <div
        className={`${styles.bombButton} ${isPlacingBlob ? styles.active : ''}`}
        onTouchStart={() => setIsPlacingBlob(true)}
        onTouchEnd={() => setIsPlacingBlob(false)}
        onMouseDown={() => setIsPlacingBlob(true)}
        onMouseUp={() => setIsPlacingBlob(false)}
        onMouseLeave={() => setIsPlacingBlob(false)}
      >
        <div className={styles.bombButtonInner}>
          BOMB
        </div>
      </div>
    </>
  );
};

export default Controls;
