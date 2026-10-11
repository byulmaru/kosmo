export type NativeTabReselectionDestination = 'home' | 'notifications' | 'profile' | 'search';
export type NativeTabReselectionHandler = () => void;

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
