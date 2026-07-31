import { Link, useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { useNavigationGuard } from './NavigationGuardContext';
import type { Href, LinkProps } from 'expo-router';

type Props = Omit<LinkProps, 'asChild' | 'href' | 'onPress'> & {
  href: Href;
  onNavigate?: () => void;
};

export function GuardedLink({ children, href, onNavigate, ...props }: Props) {
  const router = useRouter();
  const { request } = useNavigationGuard();
  const handlePress: NonNullable<LinkProps['onPress']> = (event) => {
    if (!shouldHandleNavigation(event)) {
      return;
    }
    onNavigate?.();
    if (request(() => router.navigate(href))) {
      event.preventDefault();
    }
  };

  return (
    <Link {...props} asChild href={href} onPress={handlePress}>
      {children}
    </Link>
  );
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
