import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren, RefObject } from 'react';
import type { ReplyComposerSurface_profile$key } from './__generated__/ReplyComposerSurface_profile.graphql';
import type { PostComposerCreatedPost } from './PostComposer';
import type { ReplyComposerSurfaceHandle } from './ReplyComposerSurface';

export type PostComposerOwner = 'detail' | 'list';
export type PostComposerMode = 'quote' | 'reply';

type ActivePostComposer = {
  mode: PostComposerMode;
  postId: string;
};

export type PostComposerBinding = {
  expanded: boolean;
  onPostCreated: ((post: PostComposerCreatedPost) => void) | undefined;
  onPress: () => void;
  onRequestClose: () => void;
  owner: PostComposerOwner;
  profile: ReplyComposerSurface_profile$key | null;
  surfaceRef?: RefObject<ReplyComposerSurfaceHandle | null>;
};

type PostComposerCoordinatorValue = {
  activeComposer: ActivePostComposer | null;
  activeSurfaceRef: RefObject<ReplyComposerSurfaceHandle | null>;
  close: () => void;
  onPostCreated: ((post: PostComposerCreatedPost) => void) | undefined;
  owner: PostComposerOwner;
  press: (postId: string, mode: PostComposerMode) => void;
  profile: ReplyComposerSurface_profile$key | null;
};

type PostComposerCoordinatorProviderProps = PropsWithChildren<{
  onPostCreated?: (post: PostComposerCreatedPost) => void;
  owner: PostComposerOwner;
  profile: ReplyComposerSurface_profile$key | null;
}>;

const PostComposerCoordinatorContext = createContext<PostComposerCoordinatorValue | undefined>(
  undefined,
);

export function PostComposerCoordinatorProvider({
  children,
  onPostCreated,
  owner,
  profile,
}: PostComposerCoordinatorProviderProps) {
  const [activeComposer, setActiveComposer] = useState<ActivePostComposer | null>(null);
  const activeComposerRef = useRef(activeComposer);
  const activeSurfaceRef = useRef<ReplyComposerSurfaceHandle>(null);
  activeComposerRef.current = activeComposer;

  useEffect(() => {
    if (profile === null) {
      setActiveComposer(null);
    }
  }, [profile]);

  const close = useCallback(() => setActiveComposer(null), []);
  const press = useCallback(
    (postId: string, mode: PostComposerMode) => {
      const nextComposer = { mode, postId };
      const currentComposer = activeComposerRef.current;
      if (currentComposer === null) {
        setActiveComposer(nextComposer);
        return;
      }

      const sameComposer =
        currentComposer.postId === nextComposer.postId &&
        currentComposer.mode === nextComposer.mode;
      const activeSurface = activeSurfaceRef.current;
      if (!activeSurface) {
        if (owner === 'list') {
          setActiveComposer(sameComposer ? null : nextComposer);
        }
        return;
      }

      activeSurface.requestClose(sameComposer ? undefined : () => setActiveComposer(nextComposer));
    },
    [owner],
  );
  const value = useMemo<PostComposerCoordinatorValue>(
    () => ({ activeComposer, activeSurfaceRef, close, onPostCreated, owner, press, profile }),
    [activeComposer, close, onPostCreated, owner, press, profile],
  );

  return (
    <PostComposerCoordinatorContext.Provider value={value}>
      {children}
    </PostComposerCoordinatorContext.Provider>
  );
}

export function usePostComposerBinding(
  postId: string,
  mode: PostComposerMode = 'reply',
): PostComposerBinding | null {
  const coordinator = useContext(PostComposerCoordinatorContext);
  if (coordinator === undefined) {
    throw new Error('Post Composer 표현부에는 PostComposerCoordinatorProvider가 필요합니다.');
  }
  const expanded =
    coordinator.activeComposer?.postId === postId && coordinator.activeComposer.mode === mode;
  return {
    expanded,
    onPostCreated: coordinator.onPostCreated,
    onPress: () => {
      if (coordinator.profile) {
        coordinator.press(postId, mode);
      }
    },
    onRequestClose: coordinator.close,
    owner: coordinator.owner,
    profile: coordinator.profile,
    ...(expanded ? { surfaceRef: coordinator.activeSurfaceRef } : {}),
  };
}
