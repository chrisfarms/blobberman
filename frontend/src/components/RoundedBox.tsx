import React, { useRef, useMemo, useEffect } from 'react';
import { BoxGeometry, MeshPhysicalMaterial, Mesh, Color, InstancedMesh, Object3D, Matrix4, BufferAttribute, Float32BufferAttribute, BufferGeometry } from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Properties for our RoundedBox wrapper component
export type CustomRoundedBoxProps = {
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  segments?: number;
  color?: string;
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  reflectivity?: number;
  emissiveIntensity?: number;
  emissive?: string;
  receiveShadow?: boolean;
  castShadow?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  transparent?: boolean;
  opacity?: number;
  [key: string]: any; // Allow any other props for mesh
};

// CustomRoundedBox component wrapping drei's RoundedBox
export const CustomRoundedBox: React.FC<CustomRoundedBoxProps> = ({
  width = 1,
  height = 1,
  depth = 1,
  radius = 0.1,
  segments = 2,
  color = 'white',
  roughness = 0.2,
  metalness = 0.1,
  clearcoat = 0.8,
  clearcoatRoughness = 0.2,
  reflectivity = 0.5,
  emissiveIntensity = 0,
  emissive = '#000000',
  castShadow = true,
  receiveShadow = true,
  position,
  rotation,
  transparent = false,
  opacity = 1.0,
  children,
  ...props
}) => {
  // Create the geometry once
  const geometry = useMemo(() => {
    return new RoundedBoxGeometry(width, height, depth, segments, radius);
  }, [width, height, depth, segments, radius]);

  // Create the material once
  const material = useMemo(() => {
    return new MeshPhysicalMaterial({
      color,
      roughness,
      metalness,
      clearcoat,
      clearcoatRoughness,
      reflectivity,
      transparent,
      opacity,
      emissive: emissive ? new Color(emissive) : undefined,
      emissiveIntensity: emissive ? emissiveIntensity : 0
    });
  }, [color, roughness, metalness, clearcoat, clearcoatRoughness, reflectivity, transparent, opacity, emissive, emissiveIntensity]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position}
      rotation={rotation}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      {children}
    </mesh>
  );
};

// An instanced version for better performance when using many cubes
export interface CustomRoundedBoxInstancesProps {
  count?: number;
  color?: string;
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  segments?: number;
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  reflectivity?: number;
  children?: React.ReactNode;
}

export const CustomRoundedBoxInstances: React.FC<CustomRoundedBoxInstancesProps> = ({
  count = 100,
  color = 'white',
  width = 1,
  height = 1,
  depth = 1,
  radius = 0.1,
  segments = 2,
  roughness = 0.2,
  metalness = 0.1,
  clearcoat = 0.8,
  clearcoatRoughness = 0.2,
  reflectivity = 0.5,
  children
}) => {
  return (
    <instancedMesh
      args={[
        new RoundedBoxGeometry(width, height, depth, segments, radius),
        new MeshPhysicalMaterial({
          color,
          roughness,
          metalness,
          clearcoat,
          clearcoatRoughness,
          reflectivity
        }),
        count
      ]}
    >
      {children}
    </instancedMesh>
  );
};

// For use with CustomRoundedBoxInstances
export interface CustomRoundedBoxInstanceProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  color?: string;
  height?: number;
}

export const CustomRoundedBoxInstance: React.FC<CustomRoundedBoxInstanceProps> = ({
  position,
  rotation,
  scale = 1,
  color,
  height
}) => {
  // Calculate actual scale considering height
  const actualScale = useMemo(() => {
    if (height !== undefined) {
      // If height is specified, create a scale that adjusts only the Y dimension
      if (typeof scale === 'number') {
        return [scale, height, scale] as [number, number, number];
      } else {
        // Preserve x and z scale, adjust y scale based on height
        return [scale[0], height, scale[2]] as [number, number, number];
      }
    }
    // Otherwise use the provided scale as is
    return scale;
  }, [scale, height]);

  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={actualScale}
    >
      <meshPhysicalMaterial color={color} />
    </mesh>
  );
};

interface InstancedRoundedBoxProps {
  count: number;
  positions: Float32Array;
  scales?: Float32Array;
  colors?: Float32Array;
  color?: string;
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  segments?: number;
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  reflectivity?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  updateMatrices?: (mesh: InstancedMesh) => void;
  emissive?: Color,
}

export const InstancedRoundedBox: React.FC<InstancedRoundedBoxProps> = ({
  count,
  positions,
  scales,
  colors,
  emissive,
  color = 'white',
  width = 1,
  height = 1,
  depth = 1,
  radius = 0.05,
  segments = 2,
  roughness = 0.2,
  metalness = 0.1,
  clearcoat = 0.8,
  clearcoatRoughness = 0.2,
  reflectivity = 0.5,
  castShadow = true,
  receiveShadow = true,
  updateMatrices
}) => {
  const meshRef = useRef<InstancedMesh>(null);
  const dummyObj = useMemo(() => new Object3D(), []);
  const colorsRef = useRef<Float32Array | null>(null);

  // Create the geometry once
  const geometry = useMemo(() => {
    return new RoundedBoxGeometry(width, height, depth, segments, radius);
  }, [width, height, depth, segments, radius]);

  // Create the material once
  const material = useMemo(() => {
    // If colors array is provided, use vertexColors, otherwise use a single color
    if (colors) {
      return new MeshPhysicalMaterial({
        roughness,
        metalness,
        clearcoat,
        clearcoatRoughness,
        reflectivity,
        emissive,
      });
    } else {
      return new MeshPhysicalMaterial({
        color,
        roughness,
        metalness,
        clearcoat,
        clearcoatRoughness,
        reflectivity,
        emissive,
      });
    }
  }, [roughness, metalness, clearcoat, clearcoatRoughness, reflectivity, colors, color]);

  useEffect(() => {
    // Store colors reference and set up instanceColor if colors are provided
    if (meshRef.current && colors) {
      colorsRef.current = colors;
      meshRef.current.instanceColor = new BufferAttribute(colors, 3) as any;
    }
  }, [colors]);

  // Set up matrices and colors
  useFrame(() => {
    if (!meshRef.current) return;

    if (updateMatrices) {
      // Use custom matrix update function if provided
      updateMatrices(meshRef.current);
    } else {
      // Default matrix update based on positions and scales
      for (let i = 0; i < count; i++) {
        const idx = i * 3;

        // Position
        dummyObj.position.set(
          positions[idx],
          positions[idx + 1],
          positions[idx + 2]
        );

        // Scale (if provided)
        if (scales) {
          dummyObj.scale.set(
            scales[idx],
            scales[idx + 1],
            scales[idx + 2]
          );
        }

        dummyObj.updateMatrix();
        meshRef.current.setMatrixAt(i, dummyObj.matrix);
      }

      meshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, count]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
};

export default CustomRoundedBox;
