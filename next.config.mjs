/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  experimental: { serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'pdfkit', 'nodemailer'] },
};
export default nextConfig;
