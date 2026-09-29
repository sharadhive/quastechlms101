/** @type {import('next').NextConfig} */
const nextConfig = {
  // Type errors now fail the build (they used to be hidden and let real bugs ship).
  // Run `npm run typecheck` before building.
  typescript: { ignoreBuildErrors: false },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'pdfkit', 'nodemailer'],
    // runs instrumentation.ts on server start → background jobs work without a separate worker
    instrumentationHook: true,
  },
};
export default nextConfig;
