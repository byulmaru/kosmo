import { Hono } from 'hono';
import { yoga } from './graphql';

const app = new Hono();

app.route('/graphql', yoga);

export default app;
