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
  onNavigate?: () => void;
  primary?: boolean;
};

export function GuardedLink({ children, href, onNavigate, primary = false, ...props }: Props) {
  const router = useRouter();
  const pathname = usePathname();
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
      return;
    }
    const navigate = () => {
      recordPrimaryNavigation();
      onNavigate?.();
      if (props.push) {
        router.push(href);
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
    <Link {...props} asChild href={href}>
      {cloneElement(children, { onPress: handlePress })}
    </Link>
  );
}

function getHrefPathname(href: Href): string | null {
  if (typeof href === 'string') {
    return href.split(/[?#]/, 1)[0] || '/';
  }

  return typeof href.pathname === 'string' ? href.pathname : null;
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
