import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {'/api/admin/evidence': ['./public/research/video-records/**','./public/research/article-evidence/**','./public/research/seoul-district-collection/shards/**'],'/api/archive/video-research': ['./public/research/video-records/**'], '/mcp': ['./public/research/video-records/**','./public/research/article-evidence/**','./public/research/seoul-district-collection/shards/**']},
};

export default nextConfig;
