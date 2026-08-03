import {
  cloneElement,
  createContext,
  Fragment,
  isValidElement,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { Text } from 'react-native';
import type { PropsWithChildren, ReactNode } from 'react';

export type Href = string | { params?: Record<string, string | undefined>; pathname: string };

type RouterContextValue = {
  back: () => void;
  forward: () => void;
  params: Record<string, string | undefined>;
  pathname: string;
  replaceLocation: (href: Href) => void;
  segments: readonly string[];
  setLocation: (href: Href) => void;
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
  back: () => undefined,
  forward: () => undefined,
  params: {},
  pathname: '/home',
  replaceLocation: () => undefined,
  segments: [],
  setLocation: () => undefined,
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
  const [history, setHistory] = useState(() => ({
    entries: [
      {
        params,
        pathname: initialPathname,
      },
    ],
    index: 0,
  }));
  const location = history.entries[history.index]!;
  const setLocation = useCallback((href: Href) => {
    setHistory((current) => {
      const currentLocation = current.entries[current.index]!;
      const entries = [
        ...current.entries.slice(0, current.index + 1),
        resolveHref(href, currentLocation.params),
      ];
      return { entries, index: entries.length - 1 };
    });
  }, []);
  const replaceLocation = useCallback((href: Href) => {
    setHistory((current) => ({
      ...current,
      entries: current.entries.map((entry, index) =>
        index === current.index ? resolveHref(href, entry.params) : entry,
      ),
    }));
  }, []);
  const back = useCallback(
    () => setHistory((current) => ({ ...current, index: Math.max(0, current.index - 1) })),
    [],
  );
  const forward = useCallback(
    () =>
      setHistory((current) => ({
        ...current,
        index: Math.min(current.entries.length - 1, current.index + 1),
      })),
    [],
  );
  const value = useMemo(
    () => ({
      back,
      forward,
      params: location.params,
      pathname: location.pathname,
      replaceLocation,
      segments,
      setLocation,
      slotLabel,
    }),
    [back, forward, location, replaceLocation, segments, setLocation, slotLabel],
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
  const { back, forward, replaceLocation, setLocation } = useContext(RouterContext);
  return useMemo(
    () => ({
      back,
      forward,
      navigate: setLocation,
      push: setLocation,
      replace: replaceLocation,
    }),
    [back, forward, replaceLocation, setLocation],
  );
}

export function useNavigation() {
  return useMemo(() => ({ dispatch: () => undefined }), []);
}

export function Link({
  asChild,
  children,
  href,
}: PropsWithChildren<{ asChild?: boolean; href: Href }>) {
  const { setLocation } = useContext(RouterContext);
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
    href: serializeHref(href),
    onPress: (event: LinkPressEvent) => {
      children.props.onPress?.(event);
      const shouldNavigate = shouldHandleNavigation(event);
      event.preventDefault?.();
      if (shouldNavigate) {
        setLocation(href);
      }
    },
  });
}

function resolveHref(href: Href, currentParams: Record<string, string | undefined>) {
  if (typeof href !== 'string') {
    return { params: href.params ?? currentParams, pathname: href.pathname };
  }

  const [pathname, query = ''] = href.split('?', 2);
  return {
    params: { ...currentParams, ...Object.fromEntries(new URLSearchParams(query)) },
    pathname: pathname || '/',
  };
}

function serializeHref(href: Href) {
  if (typeof href === 'string') {
    return href;
  }

  const query = new URLSearchParams(
    Object.entries(href.params ?? {}).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  ).toString();
  return query ? `${href.pathname}?${query}` : href.pathname;
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
