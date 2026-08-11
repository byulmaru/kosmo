import { createDatabaseOwner } from '@kosmo/core/db';
import { setNotificationEffectErrorReporter } from '@kosmo/core/services';
import { federation, setInboundObservabilityReporter } from '@kosmo/fedify';
import { Hono } from 'hono';
import { routePath } from 'hono/route';
import { OidcAuthError } from './auth';
import graphqlRoutes from './routes/graphql';
import loginRoutes from './routes/login';
import logoutRoutes from './routes/logout';
import staticRoutes from './routes/static';
import { captureNotificationEffectError, captureUnexpectedError } from './sentry';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

setInboundObservabilityReporter({ captureException: captureUnexpectedError });

const app = new Hono();

setNotificationEffectErrorReporter(captureNotificationEffectError);

app.use('*', async (c, next) => {
  const database = createDatabaseOwner(process.env.DATABASE_URL!);
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

  let response: Response;
  try {
    response = await federation.fetch(c.req.raw, {
      contextData: { db: database.db },
      onNotAcceptable: fallThroughNotAcceptable,
      onNotFound: fallThrough,
      onUnauthorized: fallThrough,
    });
  } catch (error) {
    try {
      await database.close({ force: true });
    } catch {
      // Preserve the federation or downstream route error as the response cause.
    }
    throw error;
  }

  await database.close();

  c.res = response;
  return c.res;
});

app.onError((cause, c) => {
  if (cause instanceof OidcAuthError) {
    if (cause.status >= 500) {
      captureUnexpectedError(cause);
    }
    return c.text(cause.message, cause.status as ContentfulStatusCode);
  }

  captureUnexpectedError(cause);
  console.error('Unhandled BFF error', {
    method: c.req.method,
    route: routePath(c),
  });
  return c.text('Internal Server Error', 500);
});

app.get('/health', (c) => c.text('ok'));
app.all('/health', (c) => c.text('Method Not Allowed', 405, { Allow: 'GET' }));

app.route('/', loginRoutes);
app.route('/', logoutRoutes);
app.route('/', graphqlRoutes);
app.route('/', staticRoutes);

export default app;
