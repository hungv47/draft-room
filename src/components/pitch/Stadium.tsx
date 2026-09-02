"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, BufferGeometry, type CanvasTexture, DoubleSide, Float32BufferAttribute, PointsMaterial, SpotLight } from "three";
import { PITCH } from "@/lib/pitch-layout";
import { createBeamTexture, createGrassTexture, createLinesTexture } from "./textures";

const HALF_W = PITCH.width / 2;
const HALF_D = PITCH.depth / 2;

export function Grass() {
  const [map, lines] = useMemo(() => [createGrassTexture(), createLinesTexture()], []);
  return (
    <group>
      {/* Unlit so the field stays green if lights or shadow maps never bind. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PITCH.width, PITCH.depth]} />
        <meshBasicMaterial map={map} color="#ffffff" toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <planeGeometry args={[PITCH.width, PITCH.depth]} />
        <meshBasicMaterial
          map={lines}
          color="#d2ffe0"
          transparent
          opacity={0.7}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* Apron: the dark running track band around the grass. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]}>
        <planeGeometry args={[PITCH.width + 2.4, PITCH.depth + 2.4]} />
        <meshBasicMaterial color="#0e1a15" />
      </mesh>
      {/* Ground, out to the fog. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[140, 140]} />
        <meshBasicMaterial color="#070a12" />
      </mesh>
    </group>
  );
}

/** Four tiers of seating around the pitch and a scatter of phone lights that breathe. */
export function Stands() {
  const points = useRef<PointsMaterial>(null);
  const geometry = useMemo(() => {
    const geo = new BufferGeometry();
    const positions: number[] = [];
    let seed = 11;
    const rand = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    const side = (count: number, place: (u: number, v: number) => [number, number, number]) => {
      for (let i = 0; i < count; i++) positions.push(...place(rand(), rand()));
    };
    // Long sides.
    side(900, (u, v) => [-(HALF_W + 1.9 + v * 5.2), 0.9 + v * 3.4, (u - 0.5) * (PITCH.depth + 6)]);
    side(900, (u, v) => [HALF_W + 1.9 + v * 5.2, 0.9 + v * 3.4, (u - 0.5) * (PITCH.depth + 6)]);
    // Ends.
    side(600, (u, v) => [(u - 0.5) * (PITCH.width + 6), 0.9 + v * 3.4, -(HALF_D + 1.9 + v * 5.2)]);
    side(600, (u, v) => [(u - 0.5) * (PITCH.width + 6), 0.9 + v * 3.4, HALF_D + 1.9 + v * 5.2]);
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return geo;
  }, []);

  useFrame(({ clock }) => {
    if (points.current) points.current.opacity = 0.42 + Math.sin(clock.elapsedTime * 0.9) * 0.12;
  });

  // Each tier: a raked slab of seats, a wall at the front, and a roof edge lit from behind.
  const tier = (position: [number, number, number], rotationY: number, length: number) => (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 1.6, 0]} rotation={[0.58, 0, 0]}>
        <boxGeometry args={[length, 0.5, 6]} />
        <meshStandardMaterial color="#1a2136" roughness={1} />
      </mesh>
      <mesh position={[0, 0.45, 2.6]}>
        <boxGeometry args={[length, 0.9, 0.3]} />
        <meshStandardMaterial color="#121828" roughness={0.9} />
      </mesh>
      <mesh position={[0, 4.4, -2.4]}>
        <boxGeometry args={[length, 0.3, 1.4]} />
        <meshStandardMaterial color="#1c2440" roughness={0.8} />
      </mesh>
      <mesh position={[0, 4.28, -1.72]}>
        <boxGeometry args={[length * 0.98, 0.05, 0.05]} />
        <meshStandardMaterial color="#9fb4ff" emissive="#7f9bff" emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
    </group>
  );

  return (
    <group>
      {tier([-(HALF_W + 4.2), 0, 0], Math.PI / 2, PITCH.depth + 7)}
      {tier([HALF_W + 4.2, 0, 0], -Math.PI / 2, PITCH.depth + 7)}
      {tier([0, 0, -(HALF_D + 4.2)], 0, PITCH.width + 7)}
      {tier([0, 0, HALF_D + 4.2], Math.PI, PITCH.width + 7)}
      <points geometry={geometry}>
        <pointsMaterial ref={points} color="#d7e4ff" size={0.09} sizeAttenuation transparent opacity={0.6} depthWrite={false} />
      </points>
    </group>
  );
}

/** Four floodlight masts with a warm spot each and a faint volumetric cone. */
export function Floodlights() {
  const corners: Array<[number, number]> = [
    [-(HALF_W + 3.4), -(HALF_D + 3.2)],
    [HALF_W + 3.4, -(HALF_D + 3.2)],
    [-(HALF_W + 3.4), HALF_D + 3.2],
    [HALF_W + 3.4, HALF_D + 3.2],
  ];
  const height = 11.5;
  const beam = useMemo(() => createBeamTexture(), []);
  return (
    <group>
      {corners.map(([x, z], i) => (
        <Mast key={i} x={x} z={z} height={height} beam={beam} />
      ))}
    </group>
  );
}

function Mast({ x, z, height, beam }: { x: number; z: number; height: number; beam: CanvasTexture }) {
  const target = useMemo((): [number, number, number] => [x * 0.18, 0, z * 0.18], [x, z]);
  const coneLength = Math.hypot(x - target[0], height, z - target[2]);
  const light = useMemo(() => {
    const spot = new SpotLight("#eaf1ff", 250, 40, 0.62, 0.65, 1.55);
    return spot;
  }, []);

  return (
    <group>
      <mesh position={[x, height / 2, z]}>
        <cylinderGeometry args={[0.07, 0.11, height, 10]} />
        <meshStandardMaterial color="#1a2032" roughness={0.7} metalness={0.4} />
      </mesh>
      <group
        ref={(g) => {
          g?.lookAt(target[0], target[1], target[2]);
        }}
        position={[x, height, z]}
      >
        <mesh position={[0, 0, 0.1]}>
          <boxGeometry args={[1.5, 0.75, 0.22]} />
          <meshStandardMaterial color="#fff6e2" emissive="#fff3d6" emissiveIntensity={4} roughness={0.3} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, coneLength / 2]}>
          <coneGeometry args={[4.6, coneLength, 48, 1, true]} />
          <meshBasicMaterial color="#e6eeff" alphaMap={beam} transparent opacity={0.025} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} />
        </mesh>
      </group>
      <primitive object={light} position={[x, height, z]} />
      <primitive object={light.target} position={target} />
    </group>
  );
}
