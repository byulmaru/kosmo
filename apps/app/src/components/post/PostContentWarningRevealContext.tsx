import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { useSession } from '@/session/SessionProvider';
import type { PropsWithChildren } from 'react';

type Listener = () => void;

export type PostContentWarningRevealStore = {
  get: (postId: string) => boolean;
  set: (postId: string, revealed: boolean) => void;
  subscribe: (postId: string, listener: Listener) => () => void;
};

export function createPostContentWarningRevealStore(): PostContentWarningRevealStore {
  const revealedPostIds = new Set<string>();
  const listenersByPostId = new Map<string, Set<Listener>>();

  return {
    get(postId) {
      return revealedPostIds.has(postId);
    },
    set(postId, revealed) {
      const current = revealedPostIds.has(postId);
      if (current === revealed) {
        return;
      }

      if (revealed) {
        revealedPostIds.add(postId);
      } else {
        revealedPostIds.delete(postId);
      }
      listenersByPostId.get(postId)?.forEach((listener) => listener());
    },
    subscribe(postId, listener) {
      const listeners = listenersByPostId.get(postId) ?? new Set<Listener>();
      listeners.add(listener);
      listenersByPostId.set(postId, listeners);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          listenersByPostId.delete(postId);
        }
      };
    },
  };
}

const PostContentWarningRevealContext = createContext<PostContentWarningRevealStore | null>(null);

export function PostContentWarningRevealProvider({ children }: PropsWithChildren) {
  const { selectedProfileId, sessionId } = useSession();
  const store = useMemo(
    () => createPostContentWarningRevealStore(),
    [selectedProfileId, sessionId],
  );

  return (
    <PostContentWarningRevealContext.Provider value={store}>
      {children}
    </PostContentWarningRevealContext.Provider>
  );
}

export function usePostContentWarningReveal(postId: string, enabled = true) {
  const store = useContext(PostContentWarningRevealContext);
  if (!store) {
    throw new Error(
      'usePostContentWarningReveal must be used within PostContentWarningRevealProvider.',
    );
  }
  const subscribe = useCallback(
    (listener: Listener) => (enabled ? store.subscribe(postId, listener) : () => undefined),
    [enabled, postId, store],
  );
  const getSnapshot = useCallback(() => store.get(postId), [postId, store]);
  const revealed = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const toggle = useCallback(() => store.set(postId, !store.get(postId)), [postId, store]);

  return { revealed, toggle };
}
