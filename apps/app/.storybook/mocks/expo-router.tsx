import {
  cloneElement,
  createContext,
  Fragment,
  isValidElement,
  useContext,
  useMemo,
  useState,
} from 'react';
import { Text } from 'react-native';
import type { PropsWithChildren, ReactNode } from 'react';

export type Href = string | { params?: Record<string, string | undefined>; pathname: string };

type RouterContextValue = {
  params: Record<string, string | undefined>;
  pathname: string;
  segments: readonly string[];
  setPathname: (href: Href) => void;
  slotLabel: string;
};

type LinkPressEvent = {
  altKey?: boolean;
  button?: number;
  ctrlKey?: boolean;
  currentTarget?: { target?: string | null };
  defaultPrevented?: boolean;
  metaKey?: boolean;
  preventDefault?: () => void;
  shiftKey?: boolean;
};

const RouterContext = createContext<RouterContextValue>({
  params: {},
  pathname: '/home',
  segments: [],
  setPathname: () => undefined,
  slotLabel: '현재 라우트 콘텐츠',
});

export function RouterMockProvider({
  children,
  params = {},
  pathname: initialPathname = '/home',
  segments = [],
  slotLabel = '현재 라우트 콘텐츠',
}: PropsWithChildren<{
  params?: Record<string, string | undefined>;
  pathname?: string;
  segments?: readonly string[];
  slotLabel?: string;
}>) {
  const [pathname, setCurrentPathname] = useState(initialPathname);
  const setPathname = (href: Href) =>
    setCurrentPathname(typeof href === 'string' ? href : href.pathname);
  const value = useMemo(
    () => ({ params, pathname, segments, setPathname, slotLabel }),
    [params, pathname, segments, slotLabel],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function usePathname() {
  return useContext(RouterContext).pathname;
}

export function useSegments() {
  return useContext(RouterContext).segments;
}

export function useLocalSearchParams<T extends Record<string, string | undefined>>() {
  return useContext(RouterContext).params as T;
}

export function useGlobalSearchParams<T extends Record<string, string | undefined>>() {
  return useContext(RouterContext).params as T;
}

export function useRouter() {
  const { setPathname } = useContext(RouterContext);
  return useMemo(
    () => ({
      back: () => undefined,
      push: setPathname,
      replace: setPathname,
    }),
    [setPathname],
  );
}

export function Link({
  asChild,
  children,
  href,
}: PropsWithChildren<{ asChild?: boolean; href: Href }>) {
  const { setPathname } = useContext(RouterContext);
  if (
    !asChild ||
    !isValidElement<{
      href?: string;
      onPress?: (event: LinkPressEvent) => void;
    }>(children)
  ) {
    return <Fragment>{children}</Fragment>;
  }

  return cloneElement(children, {
    href: typeof href === 'string' ? href : href.pathname,
    onPress: (event: LinkPressEvent) => {
      children.props.onPress?.(event);
      const shouldNavigate = shouldHandleNavigation(event);
      event.preventDefault?.();
      if (shouldNavigate) {
        setPathname(href);
      }
    },
  });
}

function shouldHandleNavigation(event: LinkPressEvent) {
  return (
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    (event.button == null || event.button === 0) &&
    [undefined, null, '', 'self'].includes(event.currentTarget?.target)
  );
}

export function Slot() {
  const { slotLabel } = useContext(RouterContext);
  return <Text>{slotLabel}</Text>;
}

function StackRoot({ children }: PropsWithChildren) {
  return <Fragment>{children}</Fragment>;
}

function StackScreen() {
  return null;
}

export const Stack = Object.assign(StackRoot, { Screen: StackScreen });

export function Redirect(): ReactNode {
  return null;
}
