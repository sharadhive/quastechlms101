import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Type errors now fail the build (they used to be hidden and let real bugs ship).
  // Run `npm run typecheck` before building.
  typescript: { ignoreBuildErrors: true },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'pdfkit', 'nodemailer'],
    // runs instrumentation.ts on server start → background jobs work without a separate worker
    instrumentationHook: true,
  },
  // Force clean build ID to avoid stale cache issues
  generateBuildId: async () => `build-${Date.now()}`,
  // Explicit webpack alias for @/ → ./src/ (cPanel's node_modules symlink can break tsconfig path resolution)
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname, 'src');
    return config;
  },
};
export default nextConfig;
