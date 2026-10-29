import {
  cloneElement,
  createContext,
  Fragment,
  isValidElement,
  useContext,
  useMemo,
  useState,
} from 'react';
import { Platform, Text } from 'react-native';
import type { PropsWithChildren, ReactNode } from 'react';

export type Href = string | { params?: Record<string, string | undefined>; pathname: string };

type RouterContextValue = {
  back: () => void;
  canGoBack: () => boolean;
  replacePathname: (href: Href) => void;
  params: Record<string, string | undefined>;
  pathname: string;
  segments: readonly string[];
  setPathname: (href: Href) => void;
  slot?: ReactNode;
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
  canGoBack: () => false,
  replacePathname: () => undefined,
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
  slot,
  slotLabel = '현재 라우트 콘텐츠',
}: PropsWithChildren<{
  params?: Record<string, string | undefined>;
  pathname?: string;
  segments?: readonly string[];
  slot?: ReactNode;
  slotLabel?: string;
}>) {
  const [history, setHistory] = useState([initialPathname]);
  const pathname = history.at(-1)!;
  const value = useMemo(
    () => ({
      back: () => setHistory((paths) => (paths.length > 1 ? paths.slice(0, -1) : paths)),
      canGoBack: () => history.length > 1,
      params,
      pathname,
      replacePathname: (href: Href) =>
        setHistory((paths) => {
          const next = typeof href === 'string' ? href : href.pathname;
          return paths.at(-1) === next ? paths : [...paths.slice(0, -1), next];
        }),
      segments,
      setPathname: (href: Href) =>
        setHistory((paths) => {
          const next = typeof href === 'string' ? href : href.pathname;
          return paths.at(-1) === next ? paths : [...paths, next];
        }),
      slot,
      slotLabel,
    }),
    [history, params, pathname, segments, slot, slotLabel],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function usePathname() {
  return useContext(RouterContext).pathname;
}

export function useCurrentRouteInfo() {
  const { params, pathname } = useContext(RouterContext);
  return { params, pathname };
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
  const { back, canGoBack, replacePathname, setPathname } = useContext(RouterContext);
  return useMemo(
    () => ({
      back,
      canGoBack,
      dismissTo: setPathname,
      push: setPathname,
      replace: replacePathname,
    }),
    [back, canGoBack, replacePathname, setPathname],
  );
}

export const unstable_navigationEvents = { addListener: () => () => undefined };

export function Link({
  asChild,
  children,
  href,
  onPress,
  replace = false,
}: PropsWithChildren<{
  asChild?: boolean;
  href: Href;
  replace?: boolean;
  onPress?: (event: LinkPressEvent) => void;
}>) {
  const { replacePathname, setPathname } = useContext(RouterContext);
  if (
    !asChild ||
    !isValidElement<{
      href?: string;
      onPress?: (event: LinkPressEvent) => void;
    }>(children)
  ) {
    return <Fragment>{children}</Fragment>;
  }

  const navigate = (event: LinkPressEvent) => {
    const shouldNavigate = shouldHandleNavigation(event);
    event.preventDefault?.();
    if (shouldNavigate) {
      (replace ? replacePathname : setPathname)(href);
    }
  };
  const handlePress = (event: LinkPressEvent) => {
    onPress?.(event);
    navigate(event);
  };
  return cloneElement(children, {
    href: typeof href === 'string' ? href : href.pathname,
    ...(Platform.OS === 'web'
      ? {
          onClick: handlePress,
          onPress: (event: LinkPressEvent) => {
            children.props.onPress?.(event);
            (onPress ?? navigate)(event);
          },
        }
      : {
          onPress: (event: LinkPressEvent) => {
            children.props.onPress?.(event);
            handlePress(event);
          },
        }),
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
  const { slot, slotLabel } = useContext(RouterContext);
  return slot ?? <Text>{slotLabel}</Text>;
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
