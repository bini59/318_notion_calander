import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 배포용 최소 실행물 (.next/standalone)
  output: "standalone",
  // 네이티브 모듈은 번들 제외
  serverExternalPackages: ["better-sqlite3"],
  // 디자인 시스템은 dist 없이 소스(.tsx)로 배포된다.
  transpilePackages: ["@bini59/design"],
};

export default nextConfig;
