type FeedbackHistoryGuard = (event: PopStateEvent) => void;

const guards = new Set<FeedbackHistoryGuard>();

if (typeof window !== 'undefined') {
  window.addEventListener(
    'popstate',
    (event) => {
      for (const guard of guards) {
        guard(event);
      }
    },
    { capture: true },
  );
}

export function registerFeedbackHistoryGuard(guard: FeedbackHistoryGuard) {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}
