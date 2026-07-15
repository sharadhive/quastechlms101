/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'pdfkit', 'nodemailer'] },
};
export default nextConfig;
