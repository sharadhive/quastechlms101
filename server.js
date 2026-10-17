/**
 * Startup file for cPanel "Setup Node.js App" (Phusion Passenger) and any host that runs
 * `node server.js` instead of `npm start`. Not needed on Render, Railway, Vercel or a VPS.
 *
 * Before starting: `npm run build` must have created the .next folder (see DEPLOYMENT.md).
 *
 * FIX (redirect-to-localhost bug): Do NOT pass hostname/port to next() — on cPanel/Passenger
 * those values leak into req.nextUrl.origin and cause the middleware to redirect browsers to
 * http://localhost:3000 instead of the real domain. Instead we inject X-Forwarded-* headers
 * from APP_URL so Next.js always resolves the correct public origin.
 */
process.env.NODE_ENV = 'production';
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const port = Number(process.env.PORT) || 3000;

// Do NOT pass hostname / port — let Next.js derive them from the request headers instead.
// Passing them hard-codes req.nextUrl.origin to http://127.0.0.1:3000 which breaks redirects.
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

// Pre-parse APP_URL once so we can inject correct forwarded headers on every request.
let fwdHost = '';
let fwdProto = 'https';
try {
  if (process.env.APP_URL) {
    const u = new URL(process.env.APP_URL);
    fwdHost = u.host;           // e.g. "test.quastech.in"
    fwdProto = u.protocol.replace(':', ''); // "https"
  }
} catch { /* APP_URL not set or invalid — headers from the reverse proxy will be used as-is */ }

app
  .prepare()
  .then(() => {
    createServer((req, res) => {
      // Ensure Next.js sees the real public host, not the internal 127.0.0.1 proxy address.
      // Passenger/Apache may or may not forward these; setting them here guarantees correctness.
      if (fwdHost) {
        req.headers['x-forwarded-host']  = req.headers['x-forwarded-host']  || fwdHost;
        req.headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || fwdProto;
        // Some Next.js versions also check the 'host' header
        req.headers['host'] = req.headers['host'] || fwdHost;
      }
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    }).listen(port, '0.0.0.0', () => {
      console.log(`QUASTECH OS ready on port ${port} — public URL: ${process.env.APP_URL || '(APP_URL not set)'}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start QUASTECH OS:', err);
    process.exit(1);
  });
