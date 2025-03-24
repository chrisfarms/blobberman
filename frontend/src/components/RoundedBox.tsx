import { Instance, Instances, RoundedBox as DreiRoundedBox } from '@react-three/drei';
import { useMemo } from 'react';

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
  return (
    <DreiRoundedBox
      args={[width, height, depth]}
      radius={radius}
      smoothness={segments}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      position={position}
      rotation={rotation}
      {...props}
    >
      <meshPhysicalMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        clearcoat={clearcoat}
        clearcoatRoughness={clearcoatRoughness}
        reflectivity={reflectivity}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        transparent={transparent}
        opacity={opacity}
      />
      {children}
    </DreiRoundedBox>
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
    <Instances
      limit={count}
    >
      <DreiRoundedBox args={[width, height, depth]} radius={radius} smoothness={segments}>
        <meshPhysicalMaterial
          color={color}
          roughness={roughness}
          metalness={metalness}
          clearcoat={clearcoat}
          clearcoatRoughness={clearcoatRoughness}
          reflectivity={reflectivity}
        />
      </DreiRoundedBox>
      {children}
    </Instances>
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
    <Instance
      position={position}
      rotation={rotation}
      scale={actualScale}
      color={color}
    />
  );
};

export default CustomRoundedBox;
