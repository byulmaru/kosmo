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
  push: (href: Href) => void;
  replace: (href: Href) => void;
  setPathname: (href: Href) => void;
  slotLabel: string;
};

const RouterContext = createContext<RouterContextValue>({
  params: {},
  pathname: '/home',
  push: () => undefined,
  replace: () => undefined,
  setPathname: () => undefined,
  slotLabel: '현재 라우트 콘텐츠',
});

export function RouterMockProvider({
  children,
  params = {},
  pathname: initialPathname = '/home',
  onNavigate,
  slotLabel = '현재 라우트 콘텐츠',
}: PropsWithChildren<{
  params?: Record<string, string | undefined>;
  pathname?: string;
  onNavigate?: (action: 'push' | 'replace', href: Href) => void;
  slotLabel?: string;
}>) {
  const [pathname, setCurrentPathname] = useState(initialPathname);
  const setPathname = (href: Href) =>
    setCurrentPathname(typeof href === 'string' ? href : href.pathname);
  const push = (href: Href) => {
    onNavigate?.('push', href);
    setPathname(href);
  };
  const replace = (href: Href) => {
    onNavigate?.('replace', href);
    setPathname(href);
  };
  const value = useMemo(
    () => ({ params, pathname, push, replace, setPathname, slotLabel }),
    [params, pathname, push, replace, setPathname, slotLabel],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function usePathname() {
  return useContext(RouterContext).pathname;
}

export function useLocalSearchParams<T extends Record<string, string | undefined>>() {
  return useContext(RouterContext).params as T;
}

export function useGlobalSearchParams<T extends Record<string, string | undefined>>() {
  return useContext(RouterContext).params as T;
}

export function useRouter() {
  const { push, replace } = useContext(RouterContext);
  return useMemo(
    () => ({
      back: () => undefined,
      push,
      replace,
    }),
    [push, replace],
  );
}

export function Link({
  asChild,
  children,
  href,
}: PropsWithChildren<{ asChild?: boolean; href: Href }>) {
  const { push } = useContext(RouterContext);
  if (
    !asChild ||
    !isValidElement<{
      href?: string;
      onPress?: (event: { preventDefault?: () => void }) => void;
    }>(children)
  ) {
    return <Fragment>{children}</Fragment>;
  }

  return cloneElement(children, {
    href: typeof href === 'string' ? href : href.pathname,
    onPress: (event: { preventDefault?: () => void }) => {
      event.preventDefault?.();
      children.props.onPress?.(event);
      push(href);
    },
  });
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
