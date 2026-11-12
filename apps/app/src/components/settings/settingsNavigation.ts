import { match, P } from 'ts-pattern';
import type { ImperativeRouter } from 'expo-router';

type SettingsNavigationRouter = Pick<ImperativeRouter, 'dismissTo'>;

export function getSettingsMenuSelection(pathname: string) {
  return match(pathname)
    .with(
      P.union('/settings', '/settings/', '/settings/profile', '/settings/default-post-visibility'),
      () => 'profile' as const,
    )
    .with(
      P.union('/settings/profile-migration', '/settings/following-import'),
      () => 'profile-migration' as const,
    )
    .with(P.union('/settings/labs', '/settings/natural-language-mute'), () => 'labs' as const)
    .with(
      P.union('/settings/info', '/settings/developer', '/settings/licenses'),
      () => 'info' as const,
    )
    .with(
      P.union('/settings/mute-and-block', '/settings/muted-profiles', '/settings/blocked-profiles'),
      () => 'mute-and-block' as const,
    )
    .with('/settings/theme', () => 'theme' as const)
    .with('/settings/account-deletion', () => 'account-deletion' as const)
    .otherwise(() => undefined);
}

function getSettingsParentPath(pathname: string) {
  if (pathname === '/settings/natural-language-mute') {
    return '/settings/labs';
  }
  if (pathname === '/settings/muted-profiles' || pathname === '/settings/blocked-profiles') {
    return '/settings/mute-and-block';
  }
  if (pathname === '/settings/developer' || pathname === '/settings/licenses') {
    return '/settings/info';
  }
  return '/settings';
}

export function returnToSettingsParent(pathname: string, router: SettingsNavigationRouter) {
  router.dismissTo(getSettingsParentPath(pathname));
}
