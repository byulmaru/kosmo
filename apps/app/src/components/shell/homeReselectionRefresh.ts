type RefreshSubscription = { unsubscribe: () => void };
type RefreshRequest = (onSettled: () => void) => RefreshSubscription;

export function createHomeReselectionRefresh({
  request,
  scrollToTop,
}: {
  request: RefreshRequest;
  scrollToTop: () => void;
}) {
  let activeToken: object | null = null;
  let activeSubscription: RefreshSubscription | null = null;

  const activate = () => {
    scrollToTop();
    if (activeToken) {
      return;
    }

    const token = {};
    activeToken = token;
    try {
      const subscription = request(() => {
        if (activeToken === token) {
          activeToken = null;
          activeSubscription = null;
        }
      });
      if (activeToken === token) {
        activeSubscription = subscription;
      }
    } catch (error) {
      if (activeToken === token) {
        activeToken = null;
        activeSubscription = null;
      }
      throw error;
    }
  };

  const dispose = () => {
    const subscription = activeSubscription;
    activeToken = null;
    activeSubscription = null;
    subscription?.unsubscribe();
  };

  return { activate, dispose };
}
