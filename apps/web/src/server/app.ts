import { federation } from '@kosmo/fedify';
import { Hono } from 'hono';
import { OidcAuthError } from './auth';
import graphqlRoutes from './routes/graphql';
import loginRoutes from './routes/login';
import staticRoutes from './routes/static';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

const app = new Hono();

app.use('*', async (c, next) => {
  const fallThrough = async () => {
    await next();
    return new Response(c.res.body, c.res);
  };
  const fallThroughNotAcceptable = async () => {
    const response = await fallThrough();
    if (response.status !== 404) {
      return response;
    }

    return new Response('Not acceptable', {
      headers: { 'Content-Type': 'text/plain', Vary: 'Accept' },
      status: 406,
    });
  };

  const response = await federation.fetch(c.req.raw, {
    contextData: undefined,
    onNotAcceptable: fallThroughNotAcceptable,
    onNotFound: fallThrough,
  });

  c.res = response;
  return response;
});

app.onError((cause, c) => {
  if (cause instanceof OidcAuthError) {
    return c.text(cause.message, cause.status as ContentfulStatusCode);
  }

  console.error(cause);
  return c.text('Internal Server Error', 500);
});

app.get('/health', (c) => c.text('ok'));
app.all('/health', (c) => c.text('Method Not Allowed', 405, { Allow: 'GET' }));

app.route('/', loginRoutes);
app.route('/', graphqlRoutes);
app.route('/', staticRoutes);

export default app;
