import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { fn } from 'storybook/test';
import { PostActionAuthenticationProvider } from '@/components/post/PostActionAuthentication';
import { PostLayout } from '@/components/post/PostLayout';
import { PostMediaViewerHostProvider } from '@/components/post/PostMediaViewerHost';
import { PostMediaViewerThread } from '@/components/post/PostMediaViewerThread';
import { PostReplyCoordinatorProvider } from '@/components/post/PostReplyCoordinator';
import { ActionMenuPresentationProvider } from '@/components/ui/ActionMenu';
import { PostMediaViewerSurface } from '@/patterns/post-media-viewer/PostMediaViewerSurface';
import { SessionProvider } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import appleTouchImage from '../../../public/apple-touch-icon.png?url';
import iconImage from '../../../public/icon-512.png?url';
import maskableIconImage from '../../../public/icon-maskable-512.png?url';
import ogImage from '../../../public/og-default.png?url';
import { post, shellQuery } from '../fixtures';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import type { PostMediaItem } from '@/components/post/PostMediaImage';
import type { PostMediaViewerStoryQuery } from './__generated__/PostMediaViewerStoryQuery.graphql';

export type StoryArgs = {
  currentIndex: number;
  mediaCount: number;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onRetry: () => void;
  presentation: 'compact' | 'wide';
  viewState: 'ready' | 'loading' | 'error' | 'unavailable';
};

const mediaUrls = [ogImage, iconImage, maskableIconImage, appleTouchImage] as const;

const wideRailAncestorPost = {
  ...post({ bodyText: '오늘도 별을 보며 나누고 싶은 이야기를 남겨요.', id: 'wide-rail-ancestor' }),
  viewerReactions: [],
};
const wideRailCurrentPost = {
  ...post({
    bodyText: '코스모에서 함께 나누고 싶은 오늘의 이야기입니다.',
    id: 'wide-rail-current',
    media: [
      {
        __typename: 'Media',
        altText: '스토리 첨부 이미지 1',
        id: 'wide-rail-media',
        url: ogImage,
      },
    ],
    replyParent: {
      __typename: 'Post',
      id: wideRailAncestorPost.id,
      profile: wideRailAncestorPost.profile,
    },
    repostCount: 3,
  }),
  viewerReactions: [],
};
const wideRailDescendantPost = {
  ...post({
    bodyText: '같은 하늘을 보고 있던 답글도 이어서 확인할 수 있어요.',
    id: 'wide-rail-descendant',
    replyParent: {
      __typename: 'Post',
      id: wideRailCurrentPost.id,
      profile: wideRailCurrentPost.profile,
    },
  }),
  viewerReactions: [],
};
const wideRailSession = shellQuery();
const wideRailThreadResponseData = {
  currentSession: wideRailSession.currentSession,
  node: {
    ...wideRailCurrentPost,
    replyAncestors: [wideRailAncestorPost],
    replyDescendants: {
      edges: [{ cursor: wideRailDescendantPost.id, node: wideRailDescendantPost }],
      pageInfo: { endCursor: null, hasNextPage: false },
    },
  },
};

const PostMediaViewerStoryOperation = graphql`
  query PostMediaViewerStoryQuery($surfacePostId: ID!, $viewerProfileId: ID!) {
    surface: node(id: $surfacePostId) {
      __typename
      ... on Post {
        ...PostLayout_post @alias(as: "layout")
      }
    }
    viewerProfile: node(id: $viewerProfileId) {
      __typename
      ... on Profile {
        ...ReplyComposerSurface_profile @alias(as: "replySurface")
      }
    }
  }
`;

function mediaForCount(count: number): PostMediaItem[] {
  const normalizedCount = Math.max(1, Math.min(mediaUrls.length, Math.trunc(count)));

  return mediaUrls.slice(0, normalizedCount).map((url, index) => ({
    altText: `스토리 첨부 이미지 ${index + 1}`,
    id: `post-media-viewer-story-${index + 1}`,
    url,
  }));
}

export function PostMediaViewerCatalog({
  compactSurfacePostId = wideRailCurrentPost.id,
  contentRevisionId = wideRailCurrentPost.content?.id ?? null,
  mediaItems,
  currentIndex,
  mediaCount,
  onClose,
  onNext,
  onPrevious,
  onRetry,
  presentation,
  viewState,
}: StoryArgs & {
  compactSurfacePostId?: string;
  contentRevisionId?: string | null;
  mediaItems?: PostMediaItem[];
}) {
  const { height } = useWindowDimensions();
  const media = mediaItems ?? mediaForCount(mediaCount);
  const clampedIndex = Math.max(0, Math.min(media.length - 1, Math.trunc(currentIndex)));
  const surfaceProps = {
    contentRevisionId,
    currentIndex: clampedIndex,
    media,
    onClose,
    onNext,
    onPrevious,
    onRetry,
    viewState,
  } as const;

  return (
    <View style={{ height, width: '100%' }}>
      {presentation === 'compact' ? (
        <PostMediaViewerSurface
          {...surfaceProps}
          compactDetail={<ViewerCompactDetailFixture surfacePostId={compactSurfacePostId} />}
          presentation="compact"
        />
      ) : (
        <PostMediaViewerSurface
          {...surfaceProps}
          contextRail={<ContextRailFixture />}
          presentation="wide"
        />
      )}
    </View>
  );
}

function ViewerCompactDetailFixture({ surfacePostId }: { surfacePostId: string }) {
  const viewerProfileId = wideRailSession.currentSession.selectedProfile?.id;
  if (!viewerProfileId) {
    throw new globalThis.Error('Post Media Viewer detail fixture에는 선택 Profile이 필요합니다.');
  }
  const data = useLazyLoadQuery<PostMediaViewerStoryQuery>(
    PostMediaViewerStoryOperation,
    { surfacePostId, viewerProfileId },
    { fetchPolicy: 'store-or-network' },
  );

  if (
    data.surface?.__typename !== 'Post' ||
    !data.surface.layout ||
    data.viewerProfile?.__typename !== 'Profile' ||
    !data.viewerProfile.replySurface
  ) {
    throw new globalThis.Error('Post Media Viewer detail fixture에는 Post detail이 필요합니다.');
  }

  return (
    <PostMediaViewerHostProvider>
      <PostReplyCoordinatorProvider owner="detail" profile={data.viewerProfile.replySurface}>
        <PostLayout
          contentWarningPresentation="revealed"
          mediaPresentation="hidden"
          post={data.surface.layout}
          presentation="compact"
          replyAvailable
        />
      </PostReplyCoordinatorProvider>
    </PostMediaViewerHostProvider>
  );
}

function ContextRailFixture() {
  const theme = useTheme();

  return (
    <View style={[styles.contextRail, { backgroundColor: theme.backgroundCanvas }]}>
      <PostMediaViewerThread
        contentId={wideRailCurrentPost.content!.id}
        mediaOwnerPostId={wideRailCurrentPost.id}
        replyAvailable
        replySurfacePostId={wideRailCurrentPost.id}
      />
    </View>
  );
}

const withViewerProviders: Decorator = (Story, context) => (
  <ActionMenuPresentationProvider
    presentation={context.globals.viewport?.value === 'kosmoMobile' ? 'sheet' : 'platform'}
  >
    <SessionProvider>
      <PostActionAuthenticationProvider>
        <Story />
      </PostActionAuthenticationProvider>
    </SessionProvider>
  </ActionMenuPresentationProvider>
);

const meta = {
  args: {
    currentIndex: 0,
    mediaCount: 4,
    onClose: fn(),
    onNext: fn(),
    onPrevious: fn(),
    onRetry: fn(),
    presentation: 'compact',
    viewState: 'ready',
  },
  argTypes: {
    currentIndex: { control: { max: 3, min: 0, step: 1, type: 'number' } },
    mediaCount: { control: { max: 4, min: 1, step: 1, type: 'range' } },
    onClose: { action: 'close', control: false },
    onNext: { action: 'next', control: false },
    onPrevious: { action: 'previous', control: false },
    onRetry: { action: 'retry', control: false },
    presentation: { control: 'inline-radio', options: ['compact', 'wide'] },
    viewState: {
      control: 'select',
      options: ['ready', 'loading', 'error', 'unavailable'],
    },
  },
  component: PostMediaViewerCatalog,
  decorators: [withViewerProviders],
  excludeStories: ['PostMediaViewerCatalog'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    relay: {
      data: {
        currentSession: wideRailSession.currentSession,
        me: wideRailSession.me,
        surface: wideRailCurrentPost,
        viewerProfile: wideRailSession.currentSession.selectedProfile,
      },
      operationResponses: {
        PostMediaViewerThreadQuery: { data: wideRailThreadResponseData },
      },
    },
  },
  title: 'KOSMO/Patterns/Post Media Viewer',
} satisfies Meta<typeof PostMediaViewerCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: ['presentation', 'mediaCount', 'currentIndex', 'viewState'],
    },
  },
};

export const Default: Story = {
  args: { currentIndex: 0, mediaCount: 1, presentation: 'compact', viewState: 'ready' },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
};

export const FirstOfFour: Story = {
  args: { currentIndex: 0, mediaCount: 4, presentation: 'compact', viewState: 'ready' },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
};

export const MiddleOfFour: Story = {
  args: { currentIndex: 1, mediaCount: 4, presentation: 'wide', viewState: 'ready' },
  globals: { viewport: { isRotated: false, value: 'kosmoMediaViewerWide' } },
};

export const LastOfFour: Story = {
  args: { currentIndex: 3, mediaCount: 4, presentation: 'wide', viewState: 'ready' },
  globals: { viewport: { isRotated: false, value: 'kosmoProfileFull' } },
};

export const Loading: Story = {
  args: { currentIndex: 0, mediaCount: 4, presentation: 'compact', viewState: 'loading' },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
};

export const Error: Story = {
  args: { currentIndex: 0, mediaCount: 4, presentation: 'wide', viewState: 'error' },
  globals: { viewport: { isRotated: false, value: 'kosmoMediaViewerWide' } },
};

export const Unavailable: Story = {
  args: { currentIndex: 0, mediaCount: 4, presentation: 'wide', viewState: 'unavailable' },
  globals: { viewport: { isRotated: false, value: 'kosmoMediaViewerWide' } },
};

export const Dark: Story = {
  args: { currentIndex: 1, mediaCount: 4, presentation: 'wide', viewState: 'ready' },
  globals: {
    backgrounds: { value: 'kosmoDark' },
    theme: 'dark',
    viewport: { isRotated: false, value: 'kosmoProfileFull' },
  },
};

const styles = StyleSheet.create({
  contextRail: { flex: 1, minHeight: 0, overflow: 'hidden', width: '100%' },
});
