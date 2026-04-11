import app from './app';

const port = Number(process.env.PORT || 8080);
const hostname = process.env.HOST || '0.0.0.0';

Bun.serve({
  hostname,
  port,
  fetch: app.fetch,
});

console.log(`Expo web server listening on http://${hostname}:${port}`);
