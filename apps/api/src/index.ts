import { Hono } from 'hono';
import { yoga } from './graphql';

const app = new Hono();

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

app.route('/graphql', yoga);

export default app;
