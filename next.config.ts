import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile three.js and react-three packages for Next.js
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
};

export default nextConfig;
