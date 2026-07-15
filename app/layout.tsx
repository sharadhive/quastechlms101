import './globals.css';

export const metadata = { title: 'QUASTECH OS', description: 'EdTech LMS + ERP + CRM' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
