import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 네이티브 모듈은 번들 제외
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
