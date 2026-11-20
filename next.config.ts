import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {'/api/archive/video-research': ['./public/research/video-records/**'], '/mcp': ['./public/research/video-records/**']},
};

export default nextConfig;
