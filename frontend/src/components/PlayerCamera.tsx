import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { PlayerState, Explosion } from '@/game/simulation';

interface PlayerCameraProps {
  player: PlayerState | undefined;
  gridSize: number;
  explosions: Explosion[];
}

const lerpVector = (current: number, target: number, alpha: number, deltaTime: number): number => {
  // Calculate smooth factor based on deltaTime (60fps is our reference)
  const smoothFactor = 1.0 - Math.pow(1.0 - alpha, deltaTime * 60);
  return current + (target - current) * smoothFactor;
};

export default function PlayerCamera({ player, gridSize, explosions }: PlayerCameraProps) {
  const { camera } = useThree();

  // Lower alpha for smoother transitions, higher for more responsive
  const positionAlpha = 0.15;

  const shakeRef = useRef({ intensity: 0, decay: 0.9 });
  const lastExplosionsLength = useRef(0);

  // Calculate height and distance based on grid size
  const cameraHeight = Math.max(10, gridSize * 0.25);
  const cameraDistance = Math.max(8, gridSize * 0.25);

  useEffect(() => {
    // Set initial camera position to be above and slightly behind the camera target
    if (camera) {
      camera.position.set(0, 20, 10);
      camera.lookAt(0, 0, 0);
    }
  }, [camera, cameraHeight, cameraDistance]);

  useFrame(({ camera }, deltaTime) => {
    if (!player) return;

    // Check for new explosions to trigger screen shake
    if (explosions.length > lastExplosionsLength.current) {
      // New explosion detected, apply screen shake
      shakeRef.current.intensity = 0.2; // Adjust intensity as needed
    }
    lastExplosionsLength.current = explosions.length;

    // Apply screen shake effect and decay over time
    const shake = shakeRef.current;
    const shakeOffset = new Vector3(
      (Math.random() - 0.5) * 2 * shake.intensity,
      (Math.random() - 0.5) * 2 * shake.intensity,
      (Math.random() - 0.5) * 2 * shake.intensity
    );

    // Decay the shake intensity each frame
    shake.intensity *= Math.pow(shake.decay, deltaTime * 60);
    if (shake.intensity < 0.001) shake.intensity = 0;

    // Smoothly interpolate the camera position using lerp and deltaTime
    camera.position.x = lerpVector(
      camera.position.x,
      player.x + shakeOffset.x,
      positionAlpha,
      deltaTime
    );
    camera.position.z = lerpVector(
      camera.position.z,
      player.y + 10 + shakeOffset.z,
      positionAlpha,
      deltaTime
    );
    camera.position.y = 20 + shakeOffset.y;

    // Look at the interpolated target position with a small shake offset
    // camera.lookAt(
    //   1,
    //   1,
    //   1,
    // );
  });

  return null; // This component doesn't render anything
}
