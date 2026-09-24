import { Platform } from 'react-native';
import type { ImperativeRouter } from 'expo-router';

export type SettingsNavigationState = {
  index?: number;
  routes: readonly { name: string; state?: SettingsNavigationState }[];
};

type SettingsNavigationRouter = Pick<ImperativeRouter, 'back' | 'dismiss' | 'push' | 'replace'>;

const settingsRouteNames = new Set([
  'index',
  'default-post-visibility',
  'mute-and-block',
  'muted-profiles',
  'blocked-profiles',
  'info',
  'developer',
]);

function findSettingsNavigationState(
  state: SettingsNavigationState,
): SettingsNavigationState | null {
  if (state.routes.every((route) => settingsRouteNames.has(route.name))) {
    return state;
  }

  const focusedRoute = state.routes[state.index ?? 0];
  const childState = focusedRoute?.state;
  if (focusedRoute?.name === 'settings' && childState) {
    return findSettingsNavigationState(childState);
  }

  return childState ? findSettingsNavigationState(childState) : null;
}

function getSettingsParentPath(pathname: string) {
  return pathname === '/settings/muted-profiles' || pathname === '/settings/blocked-profiles'
    ? '/settings/mute-and-block'
    : pathname === '/settings/developer'
      ? '/settings/info'
      : '/settings';
}

function getRoutePath(name: string) {
  return name === 'index' ? '/settings' : `/settings/${name}`;
}

export function returnToSettingsParent(
  pathname: string,
  router: SettingsNavigationRouter,
  rootState?: SettingsNavigationState | null,
) {
  const parentPath = getSettingsParentPath(pathname);

  if (Platform.OS === 'web') {
    const settingsState = rootState ? findSettingsNavigationState(rootState) : null;
    const candidateIndex = settingsState?.index ?? -1;
    const currentIndex =
      settingsState &&
      Number.isInteger(candidateIndex) &&
      candidateIndex >= 0 &&
      candidateIndex < settingsState.routes.length
        ? candidateIndex
        : -1;
    const parentIndex =
      settingsState?.routes
        .slice(0, currentIndex)
        .findLastIndex((route) => getRoutePath(route.name) === parentPath) ?? -1;

    if (parentIndex >= 0) {
      const distance = currentIndex - parentIndex;
      if (distance === 1) {
        router.back();
      } else {
        router.dismiss(distance);
      }
    } else {
      router.push(parentPath);
    }
  } else {
    router.replace(parentPath);
  }
}
