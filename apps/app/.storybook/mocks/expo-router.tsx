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
      setPathname(href);
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
