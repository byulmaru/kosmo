import { Hono } from 'hono';
import { html } from 'hono/html';
import { normalizeIdentityHeader } from './identity';

const ANONYMOUS_VIEWER = '식별 정보 없는 Admin Console Viewer';

const app = new Hono();

app.get('/healthz', (context) => context.text('ok'));
app.all('/healthz', (context) => context.text('Method Not Allowed', 405, { Allow: 'GET' }));

app.get('/', (context) => {
  const login = normalizeIdentityHeader(context.req.header('Tailscale-User-Login'));
  const displayName = normalizeIdentityHeader(context.req.header('Tailscale-User-Name'));
  const viewer = displayName ?? login ?? ANONYMOUS_VIEWER;

  return context.html(
    html`<!doctype html>
      <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Kosmo Admin Console</title>
        </head>
        <body>
          <main>
            <h1>Kosmo Admin Console</h1>
            <p data-viewer>${viewer}</p>
            ${displayName && login && displayName !== login
              ? html`<p data-login>${login}</p>`
              : undefined}
          </main>
        </body>
      </html>`,
    200,
    {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    },
  );
});
app.all('/', (context) => context.text('Method Not Allowed', 405, { Allow: 'GET' }));

app.notFound((context) => context.text('Not Found', 404));

export default app;
