import { Hono } from 'hono';
import { authenticateBearerToken, initializeContext } from './auth';
import { yoga } from './graphql';
import { oauth } from './oauth';
import { oidc } from './oidc';
import type { Env } from './context';

const app = new Hono<Env>();

app.use('*', initializeContext);
app.use('*', authenticateBearerToken);

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

app.route('/graphql', yoga);
app.route('/oauth', oauth);
app.route('/auth', oidc);

export default app;
