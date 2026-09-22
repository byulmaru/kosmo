import { Link, usePathname, useRouter } from 'expo-router';
import { cloneElement } from 'react';
import { Platform } from 'react-native';
import { useNavigationGuard } from './NavigationGuardContext';
import { usePrimaryNavigationScroll } from './PrimaryNavigationScrollContext';
import type { Href, LinkProps } from 'expo-router';
import type { ReactElement } from 'react';

type ChildProps = {
  onPress?: NonNullable<LinkProps['onPress']>;
};

type Props = Omit<LinkProps, 'asChild' | 'children' | 'href' | 'onPress'> & {
  children: ReactElement<ChildProps>;
  href: Href;
  current?: boolean;
  navigationMode?: 'push' | 'switch';
  onCurrentNavigate?: () => void;
  onExternalNavigate?: () => void;
  onNavigate?: () => void;
  primary?: boolean;
};

type NavigationMode = 'navigate' | 'push' | 'replace';

export function NavigationLink({
  children,
  current = false,
  href,
  navigationMode: requestedNavigationMode = 'push',
  onCurrentNavigate,
  onExternalNavigate,
  onNavigate,
  primary = false,
  ...props
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const navigationMode = getNavigationMode(requestedNavigationMode, props);
  const { request } = useNavigationGuard();
  const { record } = usePrimaryNavigationScroll();
  const recordPrimaryNavigation = () => {
    if (!primary) {
      return;
    }

    const targetPathname = getHrefPathname(href);
    if (targetPathname && targetPathname !== pathname) {
      record(targetPathname);
    }
  };
  const handlePress: NonNullable<LinkProps['onPress']> = (event) => {
    children.props.onPress?.(event);
    if (!shouldHandleNavigation(event)) {
      if (!event.defaultPrevented) {
        onExternalNavigate?.();
      }
      return;
    }
    const targetPathname = getHrefPathname(href);
    if (onCurrentNavigate && (current || targetPathname === pathname)) {
      event.preventDefault();
      onNavigate?.();
      onCurrentNavigate();
      return;
    }
    const navigate = () => {
      recordPrimaryNavigation();
      onNavigate?.();
      if (navigationMode === 'push') {
        router.push(href);
      } else if (navigationMode === 'replace') {
        router.replace(href);
      } else {
        router.navigate(href);
      }
    };
    if (request(navigate)) {
      event.preventDefault();
      return;
    }
    onNavigate?.();
    recordPrimaryNavigation();
  };

  return (
    <Link
      {...props}
      {...(navigationMode === 'push'
        ? { push: true }
        : navigationMode === 'replace'
          ? { replace: true }
          : {})}
      asChild
      href={href}
    >
      {cloneElement(children, { onPress: handlePress })}
    </Link>
  );
}

function getNavigationMode(
  requestedNavigationMode: NonNullable<Props['navigationMode']>,
  props: Pick<Props, 'push' | 'replace'>,
): NavigationMode {
  if (Platform.OS === 'web') {
    if (props.replace) {
      return 'replace';
    }
    return props.push ? 'push' : 'navigate';
  }

  if (props.replace) {
    return 'replace';
  }
  if (props.push) {
    return 'push';
  }

  return requestedNavigationMode === 'switch' ? 'replace' : 'push';
}

function getHrefPathname(href: Href): string | null {
  if (typeof href === 'string') {
    return normalizePathname(href.split(/[?#]/, 1)[0] || '/');
  }

  return typeof href.pathname === 'string' ? normalizePathname(href.pathname) : null;
}

function normalizePathname(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/';
}

function shouldHandleNavigation(event: Parameters<NonNullable<LinkProps['onPress']>>[0]) {
  if (Platform.OS !== 'web') {
    return !event.defaultPrevented;
  }

  const webEvent = event as typeof event & {
    altKey?: boolean;
    button?: number;
    ctrlKey?: boolean;
    currentTarget?: { target?: string | null };
    metaKey?: boolean;
    shiftKey?: boolean;
  };
  return (
    !webEvent.defaultPrevented &&
    !webEvent.metaKey &&
    !webEvent.altKey &&
    !webEvent.ctrlKey &&
    !webEvent.shiftKey &&
    (webEvent.button == null || webEvent.button === 0) &&
    [undefined, null, '', 'self'].includes(webEvent.currentTarget?.target)
  );
}
