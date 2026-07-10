import { createContext, Fragment, useContext, useMemo, useState } from 'react';
import { Text } from 'react-native';
import type { PropsWithChildren, ReactNode } from 'react';

export type Href = string | { params?: Record<string, string | undefined>; pathname: string };

type RouterContextValue = {
  params: Record<string, string | undefined>;
  pathname: string;
  setPathname: (href: Href) => void;
  slotLabel: string;
};

const RouterContext = createContext<RouterContextValue>({
  params: {},
  pathname: '/home',
  setPathname: () => undefined,
  slotLabel: '현재 라우트 콘텐츠',
});

export function RouterMockProvider({
  children,
  params = {},
  pathname: initialPathname = '/home',
  slotLabel = '현재 라우트 콘텐츠',
}: PropsWithChildren<{
  params?: Record<string, string | undefined>;
  pathname?: string;
  slotLabel?: string;
}>) {
  const [pathname, setCurrentPathname] = useState(initialPathname);
  const setPathname = (href: Href) =>
    setCurrentPathname(typeof href === 'string' ? href : href.pathname);
  const value = useMemo(
    () => ({ params, pathname, setPathname, slotLabel }),
    [params, pathname, slotLabel],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function usePathname() {
  return useContext(RouterContext).pathname;
}

export function useLocalSearchParams<T extends Record<string, string | undefined>>() {
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

export function Link({ children }: PropsWithChildren<{ asChild?: boolean; href: Href }>) {
  return <Fragment>{children}</Fragment>;
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
