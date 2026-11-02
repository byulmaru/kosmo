import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { Platform } from 'react-native';
import { releaseImagePreview } from '@/components/media/imageUpload';
import { useRelayAuthLifecycleKey } from '@/relay/RelayActorProvider';
import { useSession } from '@/session/SessionProvider';
import type { PropsWithChildren } from 'react';

export type PostRequestPreview = Readonly<{
  mediaId: string;
  uri: string;
}>;

type Listener = () => void;

export type PostRequestPreviewStore = {
  clear: () => void;
  delete: (requestId: string) => void;
  get: (requestId: string) => PostRequestPreview | undefined;
  set: (requestId: string, preview: PostRequestPreview) => void;
  subscribe: (requestId: string, listener: Listener) => () => void;
};

export function createPostRequestPreviewStore(): PostRequestPreviewStore {
  const previewsByRequestId = new Map<string, PostRequestPreview>();
  const listenersByRequestId = new Map<string, Set<Listener>>();

  const notify = (requestId: string) => {
    listenersByRequestId.get(requestId)?.forEach((listener) => listener());
  };
  const release = (preview: PostRequestPreview) => {
    if (Platform.OS === 'web') {
      releaseImagePreview(preview.uri);
    }
  };

  return {
    clear() {
      const previews = [...previewsByRequestId.entries()];
      previewsByRequestId.clear();
      for (const [requestId, preview] of previews) {
        release(preview);
        notify(requestId);
      }
    },
    delete(requestId) {
      const preview = previewsByRequestId.get(requestId);
      if (!preview) {
        return;
      }

      previewsByRequestId.delete(requestId);
      release(preview);
      notify(requestId);
    },
    get(requestId) {
      return previewsByRequestId.get(requestId);
    },
    set(requestId, preview) {
      const current = previewsByRequestId.get(requestId);
      if (current?.mediaId === preview.mediaId && current.uri === preview.uri) {
        return;
      }

      if (current && current.uri !== preview.uri) {
        release(current);
      }
      previewsByRequestId.set(requestId, preview);
      notify(requestId);
    },
    subscribe(requestId, listener) {
      const listeners = listenersByRequestId.get(requestId) ?? new Set<Listener>();
      listeners.add(listener);
      listenersByRequestId.set(requestId, listeners);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          listenersByRequestId.delete(requestId);
        }
      };
    },
  };
}

const PostRequestPreviewContext = createContext<PostRequestPreviewStore | null>(null);

export function PostRequestPreviewProvider({ children }: PropsWithChildren) {
  const { accountId, sessionId } = useSession();
  const authLifecycleKey = useRelayAuthLifecycleKey();
  const store = useMemo(
    () => createPostRequestPreviewStore(),
    [accountId, authLifecycleKey, sessionId],
  );

  // This store owns transferred browser object URLs until its session scope ends.
  useEffect(() => () => store.clear(), [store]);

  return (
    <PostRequestPreviewContext.Provider value={store}>
      {children}
    </PostRequestPreviewContext.Provider>
  );
}

export function usePostRequestPreviewStore(): PostRequestPreviewStore {
  const store = useContext(PostRequestPreviewContext);
  if (!store) {
    throw new Error('usePostRequestPreviewStore must be used within PostRequestPreviewProvider.');
  }
  return store;
}

export function usePostRequestPreview(requestId: string): PostRequestPreview | undefined {
  const store = usePostRequestPreviewStore();
  const subscribe = useCallback(
    (listener: Listener) => store.subscribe(requestId, listener),
    [requestId, store],
  );
  const getSnapshot = useCallback(() => store.get(requestId), [requestId, store]);
  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}
