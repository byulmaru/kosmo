export type NativeTabPressResult = 'deferred' | 'prevented' | 'popped' | 'reselected' | 'switched';
export type NativeTabReselectionDestination = 'home' | 'notifications' | 'profile' | 'search';
export type NativeTabReselectionHandler = () => void;

export type NativeTabPressOptions = Readonly<{
  focused: boolean;
  stackIndex: number;
  emitTabPress: () => boolean;
  navigateToTab: () => void;
  onReselect: () => void;
  popToTop: () => void;
  requestNavigation: (action: () => void) => boolean | 'deferred';
}>;

export type NavigationStateLike = Readonly<{
  index?: number;
  key?: string;
  routes?: ReadonlyArray<
    Readonly<{
      name?: string;
      params?: object;
      state?: NavigationStateLike;
    }>
  >;
  type?: string;
}>;

export function createNativeTabReselectionRegistry() {
  const handlers = new Map<
    NativeTabReselectionDestination,
    Map<symbol, NativeTabReselectionHandler>
  >();

  return {
    register(destination: NativeTabReselectionDestination, handler: NativeTabReselectionHandler) {
      let registeredHandlers = handlers.get(destination);
      if (!registeredHandlers) {
        registeredHandlers = new Map();
        handlers.set(destination, registeredHandlers);
      }

      const registration = Symbol(destination);
      registeredHandlers.set(registration, handler);

      return () => {
        registeredHandlers.delete(registration);
        if (registeredHandlers.size === 0) {
          handlers.delete(destination);
        }
      };
    },
    reselect(destination: NativeTabReselectionDestination) {
      const registeredHandlers = handlers.get(destination);
      const latestHandler = registeredHandlers
        ? Array.from(registeredHandlers.values()).pop()
        : undefined;
      latestHandler?.();
    },
  };
}

export function findTabStackToPopTarget(state: NavigationStateLike | undefined): string | null {
  if (!state) {
    return null;
  }

  const index = state.index ?? -1;

  if (state.type === 'stack' && index > 0 && state.key) {
    return state.key;
  }

  return findTabStackToPopTarget(state.routes?.[index]?.state);
}

export function hasSelectedProfileRoute(
  state: NavigationStateLike | undefined,
  profileHandle: string,
): boolean {
  return Boolean(
    state?.routes?.some(
      (route) =>
        (route.name === '[profileHandle]' || route.name === '[profileHandle]/index') &&
        route.params &&
        'profileHandle' in route.params &&
        route.params.profileHandle === profileHandle,
    ) || state?.routes?.some((route) => hasSelectedProfileRoute(route.state, profileHandle)),
  );
}

export function handleNativeTabPress({
  focused,
  stackIndex,
  emitTabPress,
  navigateToTab,
  onReselect,
  popToTop,
  requestNavigation,
}: NativeTabPressOptions): NativeTabPressResult {
  if (focused && stackIndex === 0) {
    if (emitTabPress()) {
      return 'prevented';
    }
    onReselect();
    return 'reselected';
  }

  let result: NativeTabPressResult = focused ? 'popped' : 'switched';
  const navigate = () => {
    if (focused) {
      popToTop();
      return;
    }

    if (emitTabPress()) {
      result = 'prevented';
      return;
    }

    navigateToTab();
  };

  if (requestNavigation(navigate)) {
    return 'deferred';
  }

  navigate();
  return result;
}
