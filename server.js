/**
 * Startup file for cPanel "Setup Node.js App" (Phusion Passenger) and any host that runs
 * `node server.js` instead of `npm start`. Not needed on Render, Railway, Vercel or a VPS.
 *
 * Before starting: `npm run build` must have created the .next folder (see DEPLOYMENT.md).
 */
process.env.NODE_ENV = 'production';
const { createServer } = require('http');
const next = require('next');

const port = Number(process.env.PORT) || 3000;
const app = next({ dev: false, dir: __dirname, hostname: '127.0.0.1', port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => handle(req, res)).listen(port, () => {
      console.log(`QUASTECH OS ready on port ${port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start QUASTECH OS:', err);
    process.exit(1);
  });
