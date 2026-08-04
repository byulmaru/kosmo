import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import type { PropsWithChildren } from 'react';

type Listener = () => void;

export type PostContentWarningRevealStore = {
  get: (postId: string) => boolean;
  set: (postId: string, revealed: boolean) => void;
  subscribe: (listener: Listener) => () => void;
};

export function createPostContentWarningRevealStore(): PostContentWarningRevealStore {
  const revealedPostIds = new Set<string>();
  const listeners = new Set<Listener>();

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
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const revealStore = createPostContentWarningRevealStore();

const PostContentWarningRevealContext = createContext(revealStore);

export function PostContentWarningRevealProvider({ children }: PropsWithChildren) {
  return (
    <PostContentWarningRevealContext.Provider value={revealStore}>
      {children}
    </PostContentWarningRevealContext.Provider>
  );
}

export function usePostContentWarningReveal(postId: string) {
  const store = useContext(PostContentWarningRevealContext);
  const subscribe = useCallback((listener: Listener) => store.subscribe(listener), [store]);
  const getSnapshot = useCallback(() => store.get(postId), [postId, store]);
  const revealed = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const toggle = useCallback(() => store.set(postId, !store.get(postId)), [postId, store]);

  return { revealed, toggle };
}
