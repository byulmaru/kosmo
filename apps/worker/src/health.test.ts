import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHealthServer } from './health';

test('liveness와 readiness를 독립적으로 응답한다', async () => {
  const server = await createHealthServer({ host: '127.0.0.1', port: 0 });
  const endpoint = `http://127.0.0.1:${server.port}`;

  try {
    assert.equal((await fetch(`${endpoint}/health`)).status, 200);
    assert.equal((await fetch(`${endpoint}/ready`)).status, 503);
    assert.equal((await fetch(`${endpoint}/unknown`)).status, 404);

    server.setReady(true);
    assert.equal((await fetch(`${endpoint}/ready`)).status, 200);

    server.setReady(false);
    assert.equal((await fetch(`${endpoint}/ready`)).status, 503);
  } finally {
    await server.close();
  }
});
