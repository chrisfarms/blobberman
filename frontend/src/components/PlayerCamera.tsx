import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { PlayerState, Explosion } from '@/game/simulation';

interface PlayerCameraProps {
  player: PlayerState | undefined;
  gridSize: number;
  explosions: Explosion[];
}

// Improved lerp function that takes into account deltaTime
const lerpVector = (current: Vector3, target: Vector3, alpha: number, deltaTime: number): Vector3 => {
  // Calculate smooth factor based on deltaTime (60fps is our reference)
  const smoothFactor = 1.0 - Math.pow(1.0 - alpha, deltaTime * 60);

  return current.clone().lerp(target, smoothFactor);
};

export default function PlayerCamera({ player, gridSize, explosions }: PlayerCameraProps) {
  const { camera } = useThree();
  const targetPosition = useRef(new Vector3(0, 15, 5));
  const currentLookAt = useRef(new Vector3(0, 0, 0));
  const targetLookAt = useRef(new Vector3(0, 0, 0));

  // Lower alpha for smoother transitions, higher for more responsive
  const positionAlpha = 0.05;
  const lookAtAlpha = 0.1;

  const shakeRef = useRef({ intensity: 0, decay: 0.9 });
  const lastExplosionsLength = useRef(0);

  useEffect(() => {
    // Set initial camera position to be above and slightly behind the camera target
    if (camera) {
      camera.position.set(0, 15, 5);
      camera.lookAt(0, 0, 0);

      // Initialize our current look-at position
      currentLookAt.current.set(0, 0, 0);
    }
  }, [camera]);

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

    // Calculate world position for the player
    const worldX = player.x;
    const worldZ = player.y; // Y coordinate in game state is Z in 3D space

    // Update target positions for the camera
    const cameraTargetX = worldX;
    const cameraTargetY = 15; // Height above ground
    const cameraTargetZ = worldZ + 5; // Distance behind player

    // Set the target position for the camera
    targetPosition.current.set(cameraTargetX, cameraTargetY, cameraTargetZ);

    // Update the look-at target
    targetLookAt.current.set(worldX, 0, worldZ);

    // Smoothly interpolate the camera position using lerp and deltaTime
    const newPosition = lerpVector(
      new Vector3(camera.position.x, camera.position.y, camera.position.z),
      targetPosition.current,
      positionAlpha,
      deltaTime
    );

    // Smoothly interpolate the look-at position using lerp and deltaTime
    currentLookAt.current = lerpVector(
      currentLookAt.current,
      targetLookAt.current,
      lookAtAlpha,
      deltaTime
    );

    // Update camera position with the interpolated position and shake
    camera.position.copy(newPosition).add(shakeOffset);

    // Look at the interpolated target position with a small shake offset
    camera.lookAt(
      currentLookAt.current.x + shakeOffset.x * 0.5,
      currentLookAt.current.y + shakeOffset.y * 0.5,
      currentLookAt.current.z + shakeOffset.z * 0.5
    );
  });

  return null; // This component doesn't render anything
}
