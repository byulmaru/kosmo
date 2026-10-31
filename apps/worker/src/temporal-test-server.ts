import { once } from 'node:events';
import { createServer } from 'node:http';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { temporalTestExecutable } from './temporal-test-executable.js';
import { POST_REQUEST_TEST_SEARCH_ATTRIBUTES } from './temporal-test-search-attributes.js';

const host = process.env.HOST?.trim() || '127.0.0.1';
const healthPort = Number(process.env.PORT);
const temporalPortValue = process.env.TEMPORAL_PORT?.trim();
const temporalPort = temporalPortValue ? Number(temporalPortValue) : undefined;
const namespace = process.env.TEMPORAL_NAMESPACE?.trim();

if (!Number.isInteger(healthPort) || healthPort < 0 || healthPort > 65_535) {
  throw new Error('PORT must be an integer between 0 and 65535');
}
if (
  temporalPort !== undefined &&
  (!Number.isInteger(temporalPort) || temporalPort < 1 || temporalPort > 65_535)
) {
  throw new Error('TEMPORAL_PORT must be an integer between 1 and 65535');
}
if (!namespace) {
  throw new Error('TEMPORAL_NAMESPACE is required');
}

const environment = await TestWorkflowEnvironment.createLocal({
  server: {
    executable: temporalTestExecutable,
    ip: host,
    namespace,
    port: temporalPort,
    searchAttributes: [...POST_REQUEST_TEST_SEARCH_ATTRIBUTES],
    ui: false,
  },
});
const healthServer = createServer((request, response) => {
  const isHealth = request.url === '/health';
  response.writeHead(isHealth ? 200 : 404).end(isHealth ? environment.address : undefined);
});

try {
  healthServer.listen(healthPort, host);
  await once(healthServer, 'listening');
  const address = healthServer.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Unable to determine the Temporal test health port.');
  }
  process.send?.(address.port);
  await Promise.race([once(process, 'SIGINT'), once(process, 'SIGTERM')]);
} finally {
  await healthServer[Symbol.asyncDispose]();
  await environment.teardown();
}
