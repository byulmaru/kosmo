import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { before, describe, it, mock } from 'node:test';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

type ProfileRoute = {
  key: string;
  name: string;
  params?: { profileHandle?: string };
  state?: NavigationState;
};

type NavigationState = {
  index: number;
  key: string;
  preloadedRoutes: ProfileRoute[];
  routeNames: string[];
  routes: ProfileRoute[];
  stale: false;
  type: 'stack';
};

type StackRouterOptions = {
  routeGetIdList: Record<string, (options: { params?: { profileHandle?: string } }) => string>;
  routeParamList: Record<string, { profileHandle?: string }>;
};

type StackClientExports = {
  StackRouter: (options: { initialRouteName?: string }) => {
    getStateForAction: (
      state: NavigationState,
      action: {
        payload: { name: string; params?: { profileHandle?: string }; path?: string };
        type: 'NAVIGATE' | 'PUSH';
      },
      options: StackRouterOptions,
    ) => NavigationState | null;
  };
};

const profileRouteName = '[profileHandle]';
const routeOptions: StackRouterOptions = { routeGetIdList: {}, routeParamList: {} };
let dynamicRouteOptions = routeOptions;

function createFollowingState(key: string): NavigationState {
  return {
    index: 1,
    key,
    preloadedRoutes: [],
    routeNames: ['index', 'following'],
    routes: [
      { key: `${key}-index`, name: 'index' },
      { key: `${key}-following`, name: 'following' },
    ],
    stale: false,
    type: 'stack',
  };
}

function createProfileStackState({
  followingState = createFollowingState('alpha-profile-stack'),
  preloadedRoutes = [],
}: {
  followingState?: NavigationState;
  preloadedRoutes?: ProfileRoute[];
} = {}): NavigationState {
  return {
    index: 0,
    key: 'profile-stack',
    preloadedRoutes,
    routeNames: [profileRouteName],
    routes: [
      {
        key: 'profile-alpha',
        name: profileRouteName,
        params: { profileHandle: '@alpha' },
        state: followingState,
      },
    ],
    stale: false,
    type: 'stack',
  };
}

function navigate(profileHandle: string, type: 'NAVIGATE' | 'PUSH' = 'NAVIGATE') {
  return {
    payload: { name: profileRouteName, params: { profileHandle }, path: `/${profileHandle}` },
    type,
  } as const;
}

let createStackRouter: StackClientExports['StackRouter'];

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

before(() => {
  const expoRouterEntry = require.resolve('expo-router');
  const buildDirectory = dirname(expoRouterEntry);
  const buildModule = (path: string) => pathToFileURL(join(buildDirectory, path));
  const { StackRouter: baseStackRouter } = require(
    join(buildDirectory, 'react-navigation/routers/StackRouter.js'),
  ) as { StackRouter: unknown };

  mockModule(buildModule('layouts/withLayoutContext.js'), {
    withLayoutContext: () => () => null,
  });
  mockModule(buildModule('fork/native-stack/createNativeStackNavigator.js'), {
    createNativeStackNavigator: () => ({ Navigator: () => null }),
  });
  mockModule(buildModule('link/preview/LinkPreviewContext.js'), {});
  mockModule(buildModule('navigationParams.js'), {
    getInternalExpoRouterParams: () => ({}),
    INTERNAL_EXPO_ROUTER_IS_PREVIEW_NAVIGATION_PARAM_NAME: 'preview',
    INTERNAL_EXPO_ROUTER_NO_ANIMATION_PARAM_NAME: 'noAnimation',
    INTERNAL_EXPO_ROUTER_ZOOM_TRANSITION_SOURCE_ID_PARAM_NAME: 'zoomSourceId',
    INTERNAL_EXPO_ROUTER_ZOOM_TRANSITION_SCREEN_ID_PARAM_NAME: 'zoomScreenId',
  });
  for (const path of [
    'Route.js',
    'global-state/storeContext.js',
    'global-state/utils.js',
    'hooks/useCurrentRouteInfo.js',
    'link/zoom/ZoomTransitionEnabler.js',
    'link/zoom/zoom-transition-context-providers.js',
    'navigationEvents/index.js',
    'primitives/index.js',
    'views/EmptyRoute.js',
    'views/SuspenseFallback.js',
    'views/Try.js',
  ]) {
    mockModule(buildModule(path), {});
  }
  mockModule(buildModule('import-mode/index.js'), { default: () => undefined });
  mockModule(buildModule('layouts/stack-utils/index.js'), {});
  mockModule(buildModule('react-navigation/native/index.js'), {
    StackRouter: baseStackRouter,
  });
  mockModule(buildModule('utils/children.js'), {});
  mockModule(buildModule('views/Protected.js'), {});

  const { getSingularId } = require(join(buildDirectory, 'useScreens.js')) as {
    getSingularId: (name: string, options?: { params?: { profileHandle?: string } }) => string;
  };
  dynamicRouteOptions = {
    routeGetIdList: {
      [profileRouteName]: (options) => getSingularId(profileRouteName, options),
    },
    routeParamList: {},
  };
  mockModule(buildModule('useScreens.js'), { getSingularId });

  const stackClient = require(join(buildDirectory, 'layouts/StackClient.js')) as StackClientExports;
  createStackRouter = stackClient.StackRouter;
});

describe('Expo Router StackClient dynamic profile navigation', () => {
  it('starts a new profile route without carrying the old nested connection route', () => {
    const router = createStackRouter({});
    const state = createProfileStackState();
    const originalProfile = state.routes[0]!;
    const originalFollowingState = structuredClone(originalProfile.state);

    const result = router.getStateForAction(state, navigate('@beta'), routeOptions);

    assert.ok(result);
    assert.equal(result.routes.length, 2);
    assert.equal(result.routes[0]?.key, originalProfile.key);
    assert.deepEqual(result.routes[0]?.state, originalFollowingState);
    assert.deepEqual(state.routes[0]?.state, originalFollowingState);
    assert.equal(result.routes[1]?.params?.profileHandle, '@beta');
    assert.notEqual(result.routes[1]?.key, originalProfile.key);
    assert.equal(result.routes[1]?.state, undefined);
  });

  it('keeps nested state when navigating to the same dynamic profile identity', () => {
    const router = createStackRouter({});
    const state = createProfileStackState();
    const originalProfile = state.routes[0]!;
    const originalFollowingState = structuredClone(originalProfile.state);

    const result = router.getStateForAction(state, navigate('@alpha'), routeOptions);

    assert.ok(result);
    assert.equal(result.routes.length, 1);
    assert.equal(result.routes[0]?.key, originalProfile.key);
    assert.deepEqual(result.routes[0]?.state, originalFollowingState);
    assert.deepEqual(state.routes[0]?.state, originalFollowingState);
  });

  it('retains a preloaded profile route with its existing nested state', () => {
    const router = createStackRouter({});
    const preloadedState = createFollowingState('beta-preloaded-stack');
    const preloadedRoute: ProfileRoute = {
      key: 'profile-beta-preloaded',
      name: profileRouteName,
      params: { profileHandle: '@beta' },
      state: preloadedState,
    };
    const state = createProfileStackState({ preloadedRoutes: [preloadedRoute] });

    const result = router.getStateForAction(state, navigate('@beta'), dynamicRouteOptions);

    assert.ok(result);
    assert.equal(result.routes[1]?.key, preloadedRoute.key);
    assert.deepEqual(result.routes[1]?.state, preloadedState);
    assert.deepEqual(result.preloadedRoutes, []);
  });

  it('starts a fresh route for PUSH without reusing the current profile state', () => {
    const router = createStackRouter({});
    const state = createProfileStackState();
    const originalProfile = state.routes[0]!;

    const result = router.getStateForAction(state, navigate('@beta', 'PUSH'), routeOptions);

    assert.ok(result);
    assert.equal(result.routes.length, 2);
    assert.deepEqual(result.routes[0]?.state, originalProfile.state);
    assert.equal(result.routes[1]?.params?.profileHandle, '@beta');
    assert.equal(result.routes[1]?.state, undefined);
  });
});
