import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {'/api/admin/evidence': ['./public/research/video-records/**','./public/research/article-evidence/**'],'/api/archive/video-research': ['./public/research/video-records/**'], '/mcp': ['./public/research/video-records/**','./public/research/article-evidence/**']},
};

export default nextConfig;
