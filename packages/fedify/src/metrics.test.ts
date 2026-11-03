import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

const runChild = (script: string, environment: NodeJS.ProcessEnv) =>
  spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    cwd: packageRoot,
    encoding: 'utf8',
    env: environment,
    timeout: 20_000,
  });

const reservePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Unable to reserve a metrics test port.');
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
};

test('Fedify metrics are disabled without METRICS_PORT and invalid or occupied ports fail startup', async () => {
  const environment = { ...process.env };
  delete environment.METRICS_PORT;
  const disabled = runChild(
    'import assert from "node:assert/strict"; const before = process.env.METRICS_PORT; const metrics = await import("./src/metrics.ts"); assert.equal(metrics.fedifyMeterProvider, undefined); await metrics.startFedifyMetrics(); assert.equal(process.env.METRICS_PORT, before);',
    environment,
  );
  assert.equal(disabled.status, 0, disabled.stderr);

  const invalid = runChild('await import("./src/metrics.ts");', {
    ...environment,
    METRICS_PORT: '65536',
  });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /METRICS_PORT must be an integer between 1 and 65535/);

  const busyServer = createServer();
  await new Promise<void>((resolve, reject) => {
    busyServer.once('error', reject);
    busyServer.listen(0, '0.0.0.0', resolve);
  });
  const address = busyServer.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Unable to bind the metrics failure test port.');
  }
  try {
    const busy = runChild(
      'import assert from "node:assert/strict"; const metrics = await import("./src/metrics.ts"); await assert.rejects(metrics.startFedifyMetrics(), (error) => error.code === "EADDRINUSE"); await metrics.closeFedifyMetrics();',
      { ...environment, METRICS_PORT: String(address.port) },
    );
    assert.equal(busy.status, 0, busy.stderr);
  } finally {
    await new Promise<void>((resolve, reject) => {
      busyServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('Fedify runtime metrics scrape through Prometheus and stop on shutdown', async () => {
  const port = await reservePort();
  const environment = {
    ...process.env,
    FEDIFY_QUEUE_DATABASE_URL: 'postgres://metrics:metrics@127.0.0.1:5432/metrics',
    METRICS_PORT: String(port),
    TEMPORAL_ADDRESS: '127.0.0.1:7233',
    TEMPORAL_NAMESPACE: 'default',
  };
  const script = `
    import assert from "node:assert/strict";
    const [{ federation }, , { fedifyQueue }, { fedifyMeterProvider, startFedifyMetrics, closeFedifyMetrics }] = await Promise.all([
      import("./src/federation.ts"),
      import("./src/local-outbound-federation.ts"),
      import("./src/queue.ts"),
      import("./src/metrics.ts"),
    ]);
    await startFedifyMetrics();
    try {
      assert.ok(fedifyQueue);
      fedifyQueue.getDepth = async () => ({ queued: 7, ready: 5, delayed: 2 });
      const response = await federation.fetch(new Request("https://metrics.example/unmatched"));
      assert.equal(response.status, 404);
      const url = "http://127.0.0.1:${port}/metrics";
      const scrape = await fetch(url).then((result) => result.text());
      assert.match(scrape, /fedify_http_server_request_count_total\\{[^}]*http_request_method="GET"[^}]*http_response_status_code="404"[^}]*\\} 1/);
      const queueDepth = scrape.split("\\n").filter((line) => line.startsWith("fedify_queue_depth{"));
      assert.equal(queueDepth.length, 6);
      assert.ok(queueDepth.some((line) => line.includes('fedify_federation_instance_id="fedify-1"') && line.includes('fedify_queue_depth_state="queued"') && line.endsWith(" 7")));
      assert.ok(queueDepth.some((line) => line.includes('fedify_federation_instance_id="fedify-2"') && line.includes('fedify_queue_depth_state="delayed"') && line.endsWith(" 2")));
      assert.ok(fedifyMeterProvider);
      fedifyMeterProvider.getMeter("@fedify/fedify", "2.4.0")
        .createCounter("activitypub.delivery.sent", { description: "ActivityPub delivery attempts.", unit: "{attempt}" })
        .add(1, {
          "activitypub.activity.type": "https://sensitive.example/types/Note",
          "activitypub.delivery.success": true,
          "activitypub.remote.host": "sensitive.example",
        });
      const protectedScrape = await fetch(url).then((result) => result.text());
      assert.match(protectedScrape, /activitypub_delivery_sent_total\\{activitypub_delivery_success="true"\\} 1/);
      assert.doesNotMatch(protectedScrape, /sensitive\\.example|https:\\/\\/sensitive/);
    } finally {
      await closeFedifyMetrics();
    }
    await assert.rejects(fetch("http://127.0.0.1:${port}/metrics"));
  `;
  const result = runChild(script, environment);
  assert.equal(result.status, 0, result.stderr);
});
