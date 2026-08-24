import { once } from 'node:events';
import { createServer } from 'node:http';
import { TestWorkflowEnvironment } from '@temporalio/testing';

const host = process.env.HOST?.trim() || '127.0.0.1';
const healthPort = Number(process.env.PORT);
const temporalPort = Number(process.env.TEMPORAL_PORT);
const namespace = process.env.TEMPORAL_NAMESPACE?.trim();

if (!Number.isInteger(healthPort) || healthPort < 1 || healthPort > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
if (!Number.isInteger(temporalPort) || temporalPort < 1 || temporalPort > 65_535) {
  throw new Error('TEMPORAL_PORT must be an integer between 1 and 65535');
}
if (!namespace) {
  throw new Error('TEMPORAL_NAMESPACE is required');
}

const environment = await TestWorkflowEnvironment.createLocal({
  server: {
    executable: { type: 'cached-download', version: 'v1.8.2' },
    ip: host,
    namespace,
    port: temporalPort,
    ui: false,
  },
});
const healthServer = createServer((request, response) => {
  response.writeHead(request.url === '/health' ? 200 : 404).end();
});

try {
  healthServer.listen(healthPort, host);
  await once(healthServer, 'listening');
  await Promise.race([once(process, 'SIGINT'), once(process, 'SIGTERM')]);
} finally {
  await healthServer[Symbol.asyncDispose]();
  await environment.teardown();
}
