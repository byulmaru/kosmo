import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { before, mock, test } from 'node:test';
import type { getStateFromPath as GetStateFromPath } from 'expo-router/build/fork/getStateFromPath.js';
import type { getReactNavigationConfig as GetReactNavigationConfig } from 'expo-router/build/getReactNavigationConfig.js';
import type { getRoutes as GetRoutes } from 'expo-router/build/getRoutes.js';
import type { findDivergentState as FindDivergentState } from 'expo-router/build/global-state/stateUtils.js';

const require = createRequire(import.meta.url);

mock.module(require.resolve('expo-router/build/react-navigation/native'), {
  exports: { validatePathConfig: () => undefined },
} as unknown as Parameters<typeof mock.module>[1]);

let getReactNavigationConfig: typeof GetReactNavigationConfig;
let getRoutes: typeof GetRoutes;
let getStateFromPath: typeof GetStateFromPath;
let findDivergentState: typeof FindDivergentState;

before(async () => {
  ({ getReactNavigationConfig } = await import('expo-router/build/getReactNavigationConfig.js'));
  ({ getRoutes } = await import('expo-router/build/getRoutes.js'));
  ({ getStateFromPath } = await import('expo-router/build/fork/getStateFromPath.js'));
  ({ findDivergentState } = await import('expo-router/build/global-state/stateUtils.js'));
});

const appDirectory = new URL('../../app/', import.meta.url);
const profileDirectory = new URL('../../app/(tabs)/(profile)/[profileHandle]/', import.meta.url);

function routeKeys() {
  const ancestors = ['./_layout.tsx', './(tabs)/_layout.tsx', './(tabs)/(profile)/_layout.tsx'];
  const profileFiles = new Set(['_layout.tsx', 'index.tsx', 'followers.tsx', 'following.tsx']);
  const profileRoutes = readdirSync(profileDirectory).flatMap((entry) =>
    profileFiles.has(entry) ? [`./(tabs)/(profile)/[profileHandle]/${entry}`] : [],
  );
  return [...ancestors, ...profileRoutes].filter((key) =>
    existsSync(new URL(key.slice(2), appDirectory)),
  );
}

function routeContext() {
  const keys = routeKeys();
  return Object.assign(() => ({ default: () => null }), {
    keys: () => keys,
    resolve: (key: string) => key,
    id: 'profile-navigation-test',
  });
}

function profileHandle(params: object | undefined) {
  return (params as { profileHandle?: string } | undefined)?.profileHandle;
}

test('follower and following rows keep the clicked profile handle during route divergence', () => {
  const routes = getRoutes(routeContext(), { ignoreEntryPoints: true, skipGenerated: true });
  const config = getReactNavigationConfig(routes, false);
  const destination = getStateFromPath('/@target', config);
  assert.ok(destination);

  for (const kind of ['followers', 'following']) {
    const current = getStateFromPath(`/@owner/${kind}`, config);
    assert.ok(current);

    const divergent = findDivergentState(
      destination,
      current as unknown as Parameters<typeof findDivergentState>[1],
    );
    assert.equal(divergent.navigationState?.routes[0]?.name, '[profileHandle]');
    assert.equal(profileHandle(divergent.navigationState?.routes[0]?.params), '@owner');
    assert.equal(divergent.actionStateRoute?.name, '[profileHandle]');
    assert.equal(profileHandle(divergent.actionStateRoute?.params), '@target');
    const destinationRoute = divergent.actionStateRoute?.state?.routes[0];
    assert.equal(destinationRoute?.name, 'index');
    assert.equal(profileHandle(destinationRoute?.params), '@target');
    assert.equal(destinationRoute?.path, '/@target');
  }
});
