"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// PARTICLE FIELD centerpiece. The field reacts to TRIAGE TIER ONLY (origin-blind,
// rubric §10). It visualizes the STATE OF THE PUBLIC RECORD — never a "safe/unsafe"
// verdict. The difference between calm and alarm is agitation / density / color —
// NEVER niceness-vs-absence. Calm is a quiet, fully-present field (coverage happened,
// the record is simply quiet). There is NO green anywhere; absence is neutral slate.
export type ShieldTier = "IDLE" | "NONE" | "CONTEXT" | "AWARE" | "ADDRESS" | "ACT";

// Tier uniform targets, tuned for a LITERAL WHITE (#ffffff) background.
// color = particle ink. agitation = turbulent jitter amplitude. drift = base flow speed.
// cluster = inward radial pull (density toward center). breach = periodic radial
// wavefront strength (the ACT "money shot"). pointScale = relative point size.
type TierCfg = {
  color: number;     // primary point color
  hot: number;       // hotter accent mixed in under turbulence
  agitation: number; // 0..1 turbulence amplitude
  drift: number;     // base flow speed
  cluster: number;   // 0..1 pull toward center (density)
  breach: number;    // 0..1 radial pulse strength
  pointScale: number;
  alpha: number;     // base opacity of points
};

const TIER_CONFIG: Record<ShieldTier, TierCfg> = {
  // calm family — neutral SLATE/INK. fully present, just quiet. Reads as a granular
  // stipple of discrete specks on white, never a solid mass — so alpha is kept low.
  IDLE:    { color: 0x6a7382, hot: 0x848d9a, agitation: 0.045, drift: 0.10, cluster: 0.0,  breach: 0.0, pointScale: 1.0, alpha: 0.62 },
  NONE:    { color: 0x6a7382, hot: 0x848d9a, agitation: 0.045, drift: 0.10, cluster: 0.0,  breach: 0.0, pointScale: 1.0, alpha: 0.62 },
  CONTEXT: { color: 0x726b5e, hot: 0x8b8474, agitation: 0.055, drift: 0.12, cluster: 0.0,  breach: 0.0, pointScale: 1.0, alpha: 0.62 },
  // muted steel-blue, slightly tighter
  AWARE:   { color: 0x3c6e91, hot: 0x5d8aac, agitation: 0.13, drift: 0.18, cluster: 0.18, breach: 0.0, pointScale: 1.06, alpha: 0.70 },
  // amber, denser/clustering, medium localized turbulence
  ADDRESS: { color: 0xb8791a, hot: 0xd99e35, agitation: 0.32, drift: 0.30, cluster: 0.42, breach: 0.0, pointScale: 1.14, alpha: 0.80 },
  // RED, dense + sharp, high turbulence + radial breach pulse
  ACT:     { color: 0xc8362b, hot: 0xe85a47, agitation: 0.52, drift: 0.52, cluster: 0.42, breach: 1.0, pointScale: 1.18, alpha: 0.88 },
};

const VERTEX = /* glsl */ `
  precision mediump float;
  uniform float uTime;
  uniform float uAgitation;
  uniform float uDrift;
  uniform float uCluster;
  uniform float uBreach;
  uniform float uPointScale;
  uniform float uPixelRatio;
  uniform float uStatic; // 1.0 = static fallback (freeze motion)

  attribute float aSeed;
  attribute float aRadius;

  varying float vSeed;
  varying float vBreach;   // brightness boost from a passing wavefront
  varying float vRadial;   // normalized radius for shading

  // cheap hash-based 3d noise-ish displacement (no textures)
  vec3 hash3(float n) {
    return fract(sin(vec3(n, n + 1.7, n + 3.3)) * vec3(43758.5453, 22578.145, 19642.337)) * 2.0 - 1.0;
  }

  void main() {
    vSeed = aSeed;
    vec3 pos = position;

    float t = uTime * (1.0 - uStatic);

    // base slow drift around the shell — all motion lives here, in the shader.
    vec3 dir = normalize(pos + 0.0001);
    float ph = aSeed * 6.2831;
    vec3 wobble = vec3(
      sin(t * uDrift + ph),
      sin(t * uDrift * 1.27 + ph * 1.7),
      cos(t * uDrift * 0.93 + ph * 0.6)
    );

    // turbulence: agitation pushes points off the shell, scaled by per-point seed.
    vec3 turb = hash3(aSeed * 91.7) * sin(t * (0.7 + aSeed) + ph) ;
    pos += turb * uAgitation * 0.55;
    pos += wobble * (0.04 + uDrift * 0.06);

    // clustering: pull a fraction inward to densify toward center at higher tiers.
    pos = mix(pos, pos * 0.74, uCluster * (0.4 + 0.6 * aSeed));

    // radial breach wavefront — a shell of brightness that sweeps outward and loops.
    float radius = length(pos);
    vRadial = clamp(aRadius / 1.9, 0.0, 1.0);
    float wave = fract(t * 0.28);                 // 0..1 sweep
    float front = wave * 2.0;                       // expands to ~2.0 (past outer shell)
    float d = abs(radius - front);
    float pulse = smoothstep(0.16, 0.0, d) * uBreach;
    vBreach = pulse;
    // the wavefront also nudges points outward as it passes (displacement)
    pos += dir * pulse * 0.10;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // perspective-correct point size — small + crisp so points stay DISCRETE
    // (a fine constellation with real gaps, not merged sprites). bigger when
    // agitated / breached. The attenuation constant is tuned so points land at
    // ~1.5-4px on screen, not giant sprites.
    float size = (1.9 + aSeed * 1.5) * uPointScale;
    size *= (1.0 + pulse * 1.3);
    gl_PointSize = size * uPixelRatio * (4.6 / -mv.z);
  }
`;

const FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform vec3 uHot;
  uniform float uAlpha;
  uniform float uAgitation;

  varying float vSeed;
  varying float vBreach;
  varying float vRadial;

  void main() {
    // round, crisp-edged points (no texture) so the field reads as a granular
    // constellation of distinct specks rather than an overlapping blur. Hard disc
    // (these points are tiny; a soft halo would just smear them into fog).
    vec2 c = gl_PointCoord - 0.5;
    float dist = length(c);
    if (dist > 0.5) discard;
    float soft = 1.0;

    // hotter ink shows up where the field is agitated / on the breach front.
    float heat = clamp(uAgitation * (0.4 + 0.6 * vSeed) + vBreach, 0.0, 1.0);
    vec3 col = mix(uColor, uHot, heat);
    // breach front flares bright.
    col += vBreach * 0.6;

    // outer-shell points read a touch fainter -> sense of volume/depth.
    float depthFade = mix(0.72, 1.0, 1.0 - vRadial);
    float a = soft * uAlpha * depthFade + vBreach * 0.5;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k;
}

function ParticleField({ cfg, isStatic }: { cfg: TierCfg; isStatic: boolean }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const groupRef = useRef<THREE.Points>(null);

  // device-aware count: ~7000 desktop, ~3000 mid, few hundred for static fallback.
  const count = useMemo(() => {
    if (isStatic) return 600;
    if (typeof window === "undefined") return 3000;
    const w = window.innerWidth;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    if (w < 820 || mem <= 4) return 3000;
    return 7000;
  }, [isStatic]);

  // SPHERICAL SHELL distribution with radial jitter — a dome/volume of "coverage",
  // NOT a solid surface. Per-point attributes aSeed + aRadius.
  const { positions, seeds, radii } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const radii = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // even sphere sampling (golden-spiral-ish via acos for uniformity)
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      // radial jitter -> a shell with thickness (volume), centered ~1.5
      const r = 1.5 + (Math.random() - 0.5) * 0.55;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      seeds[i] = Math.random();
      radii[i] = r;
    }
    return { positions, seeds, radii };
  }, [count]);

  const pixelRatio = useMemo(() => {
    if (typeof window === "undefined") return 1;
    return Math.min(window.devicePixelRatio, 2);
  }, []);

  // current (lerped) values for smooth tier transitions (ported pattern).
  const cur = useRef({
    color: new THREE.Color(cfg.color),
    hot: new THREE.Color(cfg.hot),
    agitation: cfg.agitation,
    drift: cfg.drift,
    cluster: cfg.cluster,
    breach: cfg.breach,
    pointScale: cfg.pointScale,
    alpha: cfg.alpha,
  });

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(cfg.color) },
      uHot: { value: new THREE.Color(cfg.hot) },
      uAgitation: { value: cfg.agitation },
      uDrift: { value: cfg.drift },
      uCluster: { value: cfg.cluster },
      uBreach: { value: cfg.breach },
      uPointScale: { value: cfg.pointScale },
      uAlpha: { value: cfg.alpha },
      uPixelRatio: { value: pixelRatio },
      uStatic: { value: isStatic ? 1.0 : 0.0 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useFrame(({ clock }, delta) => {
    const m = matRef.current;
    if (!m) return;
    const u = m.uniforms;

    if (isStatic) {
      // render once / no animation; just hold the (calm) target.
      u.uTime.value = 0;
      cur.current.color.set(cfg.color);
      cur.current.hot.set(cfg.hot);
      (u.uColor.value as THREE.Color).copy(cur.current.color);
      (u.uHot.value as THREE.Color).copy(cur.current.hot);
      u.uAgitation.value = cfg.agitation;
      u.uDrift.value = cfg.drift;
      u.uCluster.value = cfg.cluster;
      u.uBreach.value = cfg.breach;
      u.uPointScale.value = cfg.pointScale;
      u.uAlpha.value = cfg.alpha;
      return;
    }

    const k = Math.min(1, delta * 2.2); // ease toward target (lerp pattern)
    cur.current.color.lerp(new THREE.Color(cfg.color), k);
    cur.current.hot.lerp(new THREE.Color(cfg.hot), k);
    cur.current.agitation = lerp(cur.current.agitation, cfg.agitation, k);
    cur.current.drift = lerp(cur.current.drift, cfg.drift, k);
    cur.current.cluster = lerp(cur.current.cluster, cfg.cluster, k);
    cur.current.breach = lerp(cur.current.breach, cfg.breach, k);
    cur.current.pointScale = lerp(cur.current.pointScale, cfg.pointScale, k);
    cur.current.alpha = lerp(cur.current.alpha, cfg.alpha, k);

    u.uTime.value = clock.getElapsedTime();
    (u.uColor.value as THREE.Color).copy(cur.current.color);
    (u.uHot.value as THREE.Color).copy(cur.current.hot);
    u.uAgitation.value = cur.current.agitation;
    u.uDrift.value = cur.current.drift;
    u.uCluster.value = cur.current.cluster;
    u.uBreach.value = cur.current.breach;
    u.uPointScale.value = cur.current.pointScale;
    u.uAlpha.value = cur.current.alpha;

    // a barely-there whole-field rotation gives parallax without per-frame JS attr writes.
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.getElapsedTime() * (0.02 + cfg.drift * 0.03);
      groupRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.05) * 0.06;
    }
  });

  return (
    <points ref={groupRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[seeds, 1]} />
        <bufferAttribute attach="attributes-aRadius" args={[radii, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
}

export default function InvisibleShield({ tier = "IDLE" }: { tier?: ShieldTier }) {
  const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG.IDLE;

  // STATIC fallback on prefers-reduced-motion OR WebGL failure so the center is never blank.
  const [isStatic, setIsStatic] = useState(false);
  const [webglOk, setWebglOk] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setIsStatic(mq.matches);
    const onChange = () => setIsStatic(mq.matches);
    mq.addEventListener?.("change", onChange);
    // probe WebGL
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      if (!gl) setWebglOk(false);
    } catch {
      setWebglOk(false);
    }
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  if (!webglOk) {
    // No WebGL: a quiet CSS stipple so the center is never empty (no animation).
    return (
      <div
        className="w-full h-full"
        aria-hidden
        style={{
          background:
            "radial-gradient(circle at 50% 48%, rgba(110,118,128,0.10) 0%, transparent 62%)",
          maskImage:
            "radial-gradient(circle at 50% 48%, #000 0%, transparent 70%)",
        }}
      />
    );
  }

  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 4.6], fov: 45 }}
        gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
        dpr={[1, 2]}
        frameloop={isStatic ? "demand" : "always"}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
        style={{ background: "transparent" }}
      >
        <ParticleField cfg={cfg} isStatic={isStatic} />
      </Canvas>
    </div>
  );
}
