export type TabReselectionDestination = 'home' | 'notifications' | 'profile' | 'search';
export type TabReselectionHandler = () => void;

export function createTabReselectionRegistry() {
  const handlers = new Map<TabReselectionDestination, Map<symbol, TabReselectionHandler>>();

  return {
    register(destination: TabReselectionDestination, handler: TabReselectionHandler) {
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
    reselect(destination: TabReselectionDestination) {
      const registeredHandlers = handlers.get(destination);
      const latestHandler = registeredHandlers
        ? Array.from(registeredHandlers.values()).pop()
        : undefined;
      latestHandler?.();
    },
  };
}
