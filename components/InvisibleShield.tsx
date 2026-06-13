"use client";

import { useRef } from "react";
import { Canvas, useFrame, extend } from "@react-three/fiber";
import { Sphere, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { shaderMaterial } from "@react-three/drei";

// The shield reacts to TRIAGE TIER ONLY (origin-blind, rubric §10). It visualizes the
// state of the public record — never a "safe/unsafe" verdict. Note: a clean/no-finding
// state is CALM BLUE, never green (no all-clear semantics).
export type ShieldTier = "IDLE" | "NONE" | "CONTEXT" | "AWARE" | "ADDRESS" | "ACT";

const TIER_CONFIG: Record<
  ShieldTier,
  { c1: number; c2: number; c3: number; opacity: number; speed: number; rotate: number; alert: number }
> = {
  IDLE: { c1: 0x4fc3f7, c2: 0x9c27b0, c3: 0x00e5ff, opacity: 0.18, speed: 0.4, rotate: 0.4, alert: 0.0 },
  NONE: { c1: 0x4fc3f7, c2: 0x38bdf8, c3: 0x22d3ee, opacity: 0.16, speed: 0.35, rotate: 0.3, alert: 0.0 },
  CONTEXT: { c1: 0x64748b, c2: 0x38bdf8, c3: 0x22d3ee, opacity: 0.15, speed: 0.35, rotate: 0.3, alert: 0.0 },
  AWARE: { c1: 0x38bdf8, c2: 0x818cf8, c3: 0x22d3ee, opacity: 0.2, speed: 0.5, rotate: 0.5, alert: 0.15 },
  ADDRESS: { c1: 0xfbbf24, c2: 0xf59e0b, c3: 0xfcd34d, opacity: 0.26, speed: 0.95, rotate: 0.7, alert: 0.5 },
  ACT: { c1: 0xff5252, c2: 0xff1744, c3: 0xff8a65, opacity: 0.34, speed: 1.6, rotate: 1.0, alert: 1.0 },
};

const ShieldMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor1: new THREE.Color(0x4fc3f7),
    uColor2: new THREE.Color(0x9c27b0),
    uColor3: new THREE.Color(0x00e5ff),
    uFresnelPower: 3.5,
    uOpacity: 0.18,
    uAlert: 0.0,
  },
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
  /*glsl*/ `
    uniform float uTime;
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform vec3 uColor3;
    uniform float uFresnelPower;
    uniform float uOpacity;
    uniform float uAlert;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec2 vUv;
    void main() {
      float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), uFresnelPower);
      float t = uTime * 0.4;
      float band = sin(vUv.y * 8.0 + t) * 0.5 + 0.5;
      float band2 = sin(vUv.x * 5.0 - t * 0.7 + vUv.y * 3.0) * 0.5 + 0.5;
      vec3 iridescentColor = mix(uColor1, uColor2, band);
      iridescentColor = mix(iridescentColor, uColor3, band2 * 0.4);
      float alpha = fresnel * 0.85 + 0.05;
      alpha = clamp(alpha * uOpacity * 5.5, 0.0, 0.92);
      // shimmer intensifies with alert
      float shimmer = sin(uTime * (1.8 + uAlert * 4.0) + vUv.y * 12.0) * (0.04 + uAlert * 0.12) + (0.96 - uAlert * 0.04);
      alpha *= shimmer;
      // breach crackle at high tiers
      alpha += uAlert * pow(fresnel, 1.5) * (sin(uTime * 9.0 + vUv.x * 30.0) * 0.5 + 0.5) * 0.22;
      gl_FragColor = vec4(iridescentColor, clamp(alpha, 0.0, 0.97));
    }
  `
);

extend({ ShieldMaterial });

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
      uAlert?: number;
      transparent?: boolean;
      side?: THREE.Side;
      depthWrite?: boolean;
    }>;
  }
}

function ShieldSphere({ cfg }: { cfg: (typeof TIER_CONFIG)[ShieldTier] }) {
  const matRef = useRef<InstanceType<typeof ShieldMaterial>>(null);
  // current (lerped) values for smooth tier transitions
  const cur = useRef({ c1: new THREE.Color(cfg.c1), c2: new THREE.Color(cfg.c2), c3: new THREE.Color(cfg.c3), opacity: cfg.opacity, alert: cfg.alert });

  useFrame(({ clock }, delta) => {
    const m = matRef.current as unknown as {
      uTime: number; uColor1: THREE.Color; uColor2: THREE.Color; uColor3: THREE.Color; uOpacity: number; uAlert: number;
    } | null;
    if (!m) return;
    const k = Math.min(1, delta * 2.5); // ease toward target
    cur.current.c1.lerp(new THREE.Color(cfg.c1), k);
    cur.current.c2.lerp(new THREE.Color(cfg.c2), k);
    cur.current.c3.lerp(new THREE.Color(cfg.c3), k);
    cur.current.opacity += (cfg.opacity - cur.current.opacity) * k;
    cur.current.alert += (cfg.alert - cur.current.alert) * k;
    m.uTime = clock.getElapsedTime() * cfg.speed;
    m.uColor1.copy(cur.current.c1);
    m.uColor2.copy(cur.current.c2);
    m.uColor3.copy(cur.current.c3);
    m.uOpacity = cur.current.opacity;
    m.uAlert = cur.current.alert;
  });

  return (
    <Sphere args={[1.6, 64, 64]}>
      {/* @ts-expect-error — custom drei shaderMaterial JSX element */}
      <shieldMaterial ref={matRef} transparent side={THREE.DoubleSide} depthWrite={false} uOpacity={cfg.opacity} />
    </Sphere>
  );
}

function InnerGlow({ color }: { color: number }) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.opacity = 0.04 + Math.sin(clock.getElapsedTime() * 1.2) * 0.015;
      matRef.current.color.lerp(new THREE.Color(color), 0.05);
    }
  });
  return (
    <Sphere args={[1.52, 32, 32]}>
      <meshBasicMaterial ref={matRef} color={color} transparent opacity={0.04} depthWrite={false} side={THREE.BackSide} />
    </Sphere>
  );
}

export default function InvisibleShield({ tier = "IDLE" }: { tier?: ShieldTier }) {
  const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG.IDLE;
  return (
    <div className="w-full h-full">
      <Canvas camera={{ position: [0, 0, 4], fov: 45 }} gl={{ alpha: true, antialias: true }} style={{ background: "transparent" }}>
        <ambientLight intensity={0.1} />
        <pointLight position={[5, 5, 5]} intensity={0.6} color={cfg.c1} />
        <pointLight position={[-4, -3, -2]} intensity={0.3} color={cfg.c2} />
        <ShieldSphere cfg={cfg} />
        <InnerGlow color={cfg.c1} />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={cfg.rotate} minPolarAngle={Math.PI * 0.3} maxPolarAngle={Math.PI * 0.7} />
      </Canvas>
    </div>
  );
}
