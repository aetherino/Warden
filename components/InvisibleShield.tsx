"use client";

import { useRef } from "react";
import { Canvas, useFrame, extend } from "@react-three/fiber";
import { Sphere, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { shaderMaterial } from "@react-three/drei";

// Custom fresnel / iridescent shader material
const ShieldMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor1: new THREE.Color(0x4fc3f7), // ice blue
    uColor2: new THREE.Color(0x9c27b0), // violet
    uColor3: new THREE.Color(0x00e5ff), // cyan
    uFresnelPower: 3.5,
    uOpacity: 0.18,
  },
  // Vertex shader
  /*glsl*/ `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPosition = modelViewMatrix * vec4(position, 1.0);
      vViewDir = normalize(-worldPosition.xyz);
      gl_Position = projectionMatrix * worldPosition;
    }
  `,
  // Fragment shader
  /*glsl*/ `
    uniform float uTime;
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform vec3 uColor3;
    uniform float uFresnelPower;
    uniform float uOpacity;

    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec2 vUv;

    void main() {
      // Fresnel — brightest at glancing angles
      float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), uFresnelPower);

      // Animate iridescent color bands over time
      float t = uTime * 0.4;
      float band = sin(vUv.y * 8.0 + t) * 0.5 + 0.5;
      float band2 = sin(vUv.x * 5.0 - t * 0.7 + vUv.y * 3.0) * 0.5 + 0.5;

      vec3 iridescentColor = mix(uColor1, uColor2, band);
      iridescentColor = mix(iridescentColor, uColor3, band2 * 0.4);

      // Combine fresnel rim with subtle body fill
      float alpha = fresnel * 0.85 + 0.05;
      alpha = clamp(alpha * uOpacity * 5.5, 0.0, 0.92);

      // Shimmer pulse
      float shimmer = sin(uTime * 1.8 + vUv.y * 12.0) * 0.04 + 0.96;
      alpha *= shimmer;

      gl_FragColor = vec4(iridescentColor, alpha);
    }
  `
);

extend({ ShieldMaterial });

// Teach TypeScript about the custom element
declare module "@react-three/fiber" {
  interface ThreeElements {
    shieldMaterial: React.PropsWithChildren<{
      ref?: React.Ref<typeof ShieldMaterial>;
      uTime?: number;
      uColor1?: THREE.Color;
      uColor2?: THREE.Color;
      uColor3?: THREE.Color;
      uFresnelPower?: number;
      uOpacity?: number;
      transparent?: boolean;
      side?: THREE.Side;
      depthWrite?: boolean;
    }>;
  }
}

function ShieldSphere() {
  const matRef = useRef<InstanceType<typeof ShieldMaterial>>(null);

  useFrame(({ clock }) => {
    if (matRef.current) {
      (matRef.current as { uTime: number }).uTime = clock.getElapsedTime();
    }
  });

  return (
    <Sphere args={[1.6, 64, 64]}>
      {/* @ts-expect-error — custom drei shaderMaterial JSX element */}
      <shieldMaterial
        ref={matRef}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        uOpacity={0.18}
      />
    </Sphere>
  );
}

// Faint inner glow sphere (slightly smaller, additive blend)
function InnerGlow() {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.opacity =
        0.04 + Math.sin(clock.getElapsedTime() * 1.2) * 0.015;
    }
  });

  return (
    <Sphere args={[1.52, 32, 32]}>
      <meshBasicMaterial
        ref={matRef}
        color={0x4fc3f7}
        transparent
        opacity={0.04}
        depthWrite={false}
        side={THREE.BackSide}
      />
    </Sphere>
  );
}

export default function InvisibleShield() {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 4], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.1} />
        <pointLight position={[5, 5, 5]} intensity={0.6} color={0x4fc3f7} />
        <pointLight position={[-4, -3, -2]} intensity={0.3} color={0x9c27b0} />

        <ShieldSphere />
        <InnerGlow />

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.4}
          minPolarAngle={Math.PI * 0.3}
          maxPolarAngle={Math.PI * 0.7}
        />
      </Canvas>
    </div>
  );
}
