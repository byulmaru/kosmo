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

export type PostReplyOwner = 'detail' | 'list';

export type PostReplyBinding = {
  expanded: boolean;
  onPostCreated: ((post: PostComposerCreatedPost) => void) | undefined;
  onPress: () => void;
  onRequestClose: () => void;
  owner: PostReplyOwner;
  profile: ReplyComposerSurface_profile$key | null;
  surfaceRef?: RefObject<ReplyComposerSurfaceHandle | null>;
};

type PostReplyCoordinatorValue = {
  activePostId: string | null;
  activeSurfaceRef: RefObject<ReplyComposerSurfaceHandle | null>;
  close: () => void;
  onPostCreated: ((post: PostComposerCreatedPost) => void) | undefined;
  owner: PostReplyOwner;
  press: (postId: string) => void;
  profile: ReplyComposerSurface_profile$key | null;
};

type PostReplyCoordinatorProviderProps = PropsWithChildren<{
  onPostCreated?: (post: PostComposerCreatedPost) => void;
  owner: PostReplyOwner;
  profile: ReplyComposerSurface_profile$key | null;
}>;

const PostReplyCoordinatorContext = createContext<PostReplyCoordinatorValue | undefined>(undefined);

export function PostReplyCoordinatorProvider({
  children,
  onPostCreated,
  owner,
  profile,
}: PostReplyCoordinatorProviderProps) {
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const activeSurfaceRef = useRef<ReplyComposerSurfaceHandle>(null);

  useEffect(() => {
    if (profile === null) {
      setActivePostId(null);
    }
  }, [profile]);

  const close = useCallback(() => setActivePostId(null), []);
  const press = useCallback(
    (postId: string) => {
      if (owner === 'list') {
        setActivePostId((current) => (current === postId ? null : postId));
        return;
      }
      if (activePostId === null) {
        setActivePostId(postId);
        return;
      }
      activeSurfaceRef.current?.requestClose(
        activePostId === postId ? undefined : () => setActivePostId(postId),
      );
    },
    [activePostId, owner],
  );
  const value = useMemo<PostReplyCoordinatorValue>(
    () => ({ activePostId, activeSurfaceRef, close, onPostCreated, owner, press, profile }),
    [activePostId, close, onPostCreated, owner, press, profile],
  );

  return (
    <PostReplyCoordinatorContext.Provider value={value}>
      {children}
    </PostReplyCoordinatorContext.Provider>
  );
}

export function usePostReplyBinding(postId: string): PostReplyBinding | null {
  const coordinator = useContext(PostReplyCoordinatorContext);
  if (coordinator === undefined) {
    throw new Error('Post Reply 표현부에는 PostReplyCoordinatorProvider가 필요합니다.');
  }
  const expanded = coordinator.activePostId === postId;
  return {
    expanded,
    onPostCreated: coordinator.onPostCreated,
    onPress: () => {
      if (coordinator.profile) {
        coordinator.press(postId);
      }
    },
    onRequestClose: coordinator.close,
    owner: coordinator.owner,
    profile: coordinator.profile,
    ...(coordinator.owner === 'detail' && expanded
      ? { surfaceRef: coordinator.activeSurfaceRef }
      : {}),
  };
}
