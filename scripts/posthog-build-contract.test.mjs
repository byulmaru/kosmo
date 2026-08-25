import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const readRepositoryFile = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('PostHog build and deployment contract', () => {
  it('passes public PostHog settings through BuildKit secret env mounts only', async () => {
    const dockerfile = await readRepositoryFile('Dockerfile');

    assert.ok(
      dockerfile.includes(
        'RUN --mount=type=secret,id=posthog_key,env=EXPO_PUBLIC_POSTHOG_KEY,required=false \\\n  --mount=type=secret,id=posthog_host,env=EXPO_PUBLIC_POSTHOG_HOST,required=false',
      ),
    );
    assert.doesNotMatch(dockerfile, /^ARG EXPO_PUBLIC_POSTHOG_(?:KEY|HOST)$/m);
    assert.doesNotMatch(dockerfile, /^ENV EXPO_PUBLIC_POSTHOG_(?:KEY|HOST)=/m);
    assert.doesNotMatch(dockerfile, /^ARG EXPO_PUBLIC_OPENPANEL_CLIENT_ID$/m);
    assert.doesNotMatch(dockerfile, /^ENV EXPO_PUBLIC_OPENPANEL_CLIENT_ID=/m);
  });

  it('keeps the development Docker build analytics-disabled', async () => {
    const workflow = await readRepositoryFile('.github/workflows/docker-build.yml');

    assert.match(workflow, /POSTHOG_KEY: ''/);
    assert.match(workflow, /POSTHOG_HOST: ''/);
    assert.match(workflow, /posthog_key=POSTHOG_KEY/);
    assert.match(workflow, /posthog_host=POSTHOG_HOST/);
    assert.doesNotMatch(workflow, /EXPO_PUBLIC_POSTHOG_(?:KEY|HOST)=/);
    assert.doesNotMatch(workflow, /EXPO_PUBLIC_OPENPANEL_CLIENT_ID/);
  });

  it('passes production repository variables as build-only public settings', async () => {
    const workflow = await readRepositoryFile('.github/workflows/production-release.yml');

    assert.match(workflow, /POSTHOG_KEY: \$\{\{ vars\.EXPO_PUBLIC_POSTHOG_KEY \}\}/);
    assert.match(workflow, /POSTHOG_HOST: \$\{\{ vars\.EXPO_PUBLIC_POSTHOG_HOST \}\}/);
    assert.match(workflow, /posthog_key=POSTHOG_KEY/);
    assert.match(workflow, /posthog_host=POSTHOG_HOST/);
    assert.doesNotMatch(workflow, /EXPO_PUBLIC_POSTHOG_(?:KEY|HOST)=\$\{\{/);
    assert.doesNotMatch(workflow, /EXPO_PUBLIC_OPENPANEL_CLIENT_ID/);
  });
});
