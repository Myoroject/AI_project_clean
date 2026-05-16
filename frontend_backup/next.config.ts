import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["http://172.24.16.1:3000", "http://172.24.16.1:3001", "http://localhost:3000", "http://localhost:3001"],
};

export default nextConfig;
