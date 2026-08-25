import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadRuntimeConfig, parseBrowserRuntimeConfig } from './runtimeConfig';

const validConfig = {
  environment: 'production',
  openPanelClientId: 'openpanel-client',
  sentryDsn: 'https://public@example.invalid/1',
};

describe('browser runtime config', () => {
  it('accepts only the three public fields with nullable telemetry', () => {
    assert.deepEqual(parseBrowserRuntimeConfig(validConfig), validConfig);
    assert.deepEqual(
      parseBrowserRuntimeConfig({
        environment: 'development',
        openPanelClientId: null,
        sentryDsn: null,
      }),
      { environment: 'development', openPanelClientId: null, sentryDsn: null },
    );
    assert.throws(() => parseBrowserRuntimeConfig({ ...validConfig, serverSecret: 'nope' }));
    assert.throws(() => parseBrowserRuntimeConfig({ ...validConfig, openPanelClientId: 42 }));
  });

  it('loads same-origin config without caching and fails closed', async () => {
    let attempts = 0;
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(input, '/runtime-config.json');
      assert.equal(init?.cache, 'no-store');
      attempts += 1;
      if (attempts === 1) {
        return new Response('', { status: 503 });
      }
      return new Response(JSON.stringify(validConfig));
    };

    await assert.rejects(loadRuntimeConfig(fetcher));
    assert.deepEqual(await loadRuntimeConfig(fetcher), validConfig);
    assert.equal(attempts, 2);
    await assert.rejects(loadRuntimeConfig(async () => new Response('{', { status: 200 })));
  });
});
