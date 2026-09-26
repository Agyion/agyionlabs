import { fileURLToPath } from "node:url";
/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL("..", import.meta.url)),
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
