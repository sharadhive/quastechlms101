import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep current setting for this troubleshooting attempt.
  typescript: { ignoreBuildErrors: true },

  eslint: { ignoreDuringBuilds: true },

  experimental: {
    // Limit build worker count for shared hosting.
    cpus: 1,

    // Prefer worker threads to reduce child-process spawning.
    workerThreads: true,

    serverComponentsExternalPackages: [
      '@prisma/client',
      'bcryptjs',
      'pdfkit',
      'nodemailer',
    ],

    // Runs instrumentation.ts on server start.
    instrumentationHook: true,
  },

  // Preserve your existing build ID configuration.
  generateBuildId: async () => `build-${Date.now()}`,

  // Preserve your existing webpack alias.
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname, 'src');
    return config;
  },
};

export default nextConfig;
