import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useLazyLoadQuery } from 'react-relay';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import PostMediaViewerHostQueryNode from '@/components/post/__generated__/PostMediaViewerHostQuery.graphql';
import { PostActionAuthenticationProvider } from '@/components/post/PostActionAuthentication';
import { PostActionSurface } from '@/components/post/PostActionSurface';
import { PostMediaViewerSurface } from '@/components/post/PostMediaViewerSurface';
import { PostMediaViewerThread } from '@/components/post/PostMediaViewerThread';
import { SessionProvider } from '@/session/SessionProvider';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import appleTouchImage from '../../../public/apple-touch-icon.png?url';
import iconImage from '../../../public/icon-512.png?url';
import maskableIconImage from '../../../public/icon-maskable-512.png?url';
import ogImage from '../../../public/og-default.png?url';
import { post, shellQuery } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PostMediaViewerHostQuery } from '@/components/post/__generated__/PostMediaViewerHostQuery.graphql';
import type { PostMediaItem } from '@/components/post/PostMediaImage';

type StoryArgs = {
  currentIndex: number;
  mediaCount: number;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onReply: () => void;
  onRetry: () => void;
  onRevealSensitive: () => void;
  presentation: 'compact' | 'wide';
  viewState: 'ready' | 'sensitive' | 'loading' | 'error' | 'unavailable';
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

function mediaForCount(count: number): PostMediaItem[] {
  const normalizedCount = Math.max(1, Math.min(mediaUrls.length, Math.trunc(count)));

  return mediaUrls.slice(0, normalizedCount).map((url, index) => ({
    altText: `스토리 첨부 이미지 ${index + 1}`,
    id: `post-media-viewer-story-${index + 1}`,
    url,
  }));
}

function PostMediaViewerCatalog({
  currentIndex,
  mediaCount,
  onClose,
  onNext,
  onPrevious,
  onReply,
  onRetry,
  onRevealSensitive,
  presentation,
  viewState,
}: StoryArgs) {
  const { height } = useWindowDimensions();
  const media = mediaForCount(mediaCount);
  const clampedIndex = Math.max(0, Math.min(media.length - 1, Math.trunc(currentIndex)));

  return (
    <View style={{ height, width: '100%' }}>
      <PostMediaViewerSurface
        actionTray={
          <ThemeProvider mode="dark" reduceMotion>
            <ViewerActionBarFixture onReply={onReply} />
          </ThemeProvider>
        }
        contextRail={<ContextRailFixture />}
        currentIndex={clampedIndex}
        media={media}
        onClose={onClose}
        onNext={onNext}
        onPrevious={onPrevious}
        onRetry={onRetry}
        onRevealSensitive={onRevealSensitive}
        presentation={presentation}
        viewState={viewState}
      />
    </View>
  );
}

function ViewerActionBarFixture({ onReply }: Pick<StoryArgs, 'onReply'>) {
  const data = useLazyLoadQuery<PostMediaViewerHostQuery>(
    PostMediaViewerHostQueryNode,
    { surfacePostId: wideRailCurrentPost.id },
    { fetchPolicy: 'store-or-network' },
  );

  if (data.surface?.__typename !== 'Post' || !data.surface.actionSurface) {
    throw new globalThis.Error(
      'Post Media Viewer action fixture에는 Post action surface가 필요합니다.',
    );
  }

  return (
    <PostActionSurface
      reactionSummaryStyle={styles.hiddenReactionSummary}
      reply={{
        accessibilityLabel: '답글',
        count: 12,
        expanded: false,
        onPress: () => onReply(),
        processing: 'default',
      }}
      socialActionTarget={data.surface.actionSurface}
    />
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

const meta = {
  args: {
    currentIndex: 0,
    mediaCount: 4,
    onClose: fn(),
    onNext: fn(),
    onPrevious: fn(),
    onReply: fn(),
    onRetry: fn(),
    onRevealSensitive: fn(),
    presentation: 'compact',
    viewState: 'ready',
  },
  argTypes: {
    currentIndex: { control: { max: 3, min: 0, step: 1, type: 'number' } },
    mediaCount: { control: { max: 4, min: 1, step: 1, type: 'range' } },
    onClose: { action: 'close', control: false },
    onNext: { action: 'next', control: false },
    onPrevious: { action: 'previous', control: false },
    onReply: { action: 'reply', control: false },
    onRetry: { action: 'retry', control: false },
    onRevealSensitive: { action: 'revealSensitive', control: false },
    presentation: { control: 'inline-radio', options: ['compact', 'wide'] },
    viewState: {
      control: 'select',
      options: ['ready', 'sensitive', 'loading', 'error', 'unavailable'],
    },
  },
  component: PostMediaViewerCatalog,
  decorators: [
    (Story) => (
      <SessionProvider>
        <PostActionAuthenticationProvider>
          <Story />
        </PostActionAuthenticationProvider>
      </SessionProvider>
    ),
  ],
  excludeStories: [
    'BoundaryMovementContract',
    'CompactProductionActionSurfaceContract',
    'ErrorRetryContract',
    'SensitiveRevealContract',
    'WideRailCompositionContract',
  ],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    relay: {
      data: {
        currentSession: wideRailSession.currentSession,
        me: wideRailSession.me,
        surface: wideRailCurrentPost,
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
  play: async ({ args, canvasElement, step }) => {
    const callbacks = [
      args.onClose,
      args.onNext,
      args.onPrevious,
      args.onReply,
      args.onRetry,
      args.onRevealSensitive,
    ];
    callbacks.forEach((callback) => callback.mockClear());

    const canvas = within(canvasElement);

    await step('close control과 no-args callback', async () => {
      await userEvent.click(await canvas.findByRole('button', { name: '이미지 뷰어 닫기' }));
      expect(args.onClose).toHaveBeenCalledWith();
      expect(args.onClose).toHaveBeenCalledTimes(1);
    });

    const navigable = args.viewState === 'ready' || args.viewState === 'sensitive';
    const mediaCount = Math.max(1, Math.min(mediaUrls.length, Math.trunc(args.mediaCount)));
    const currentIndex = Math.max(0, Math.min(mediaCount - 1, Math.trunc(args.currentIndex)));

    if (navigable) {
      await step('현재 경계에 맞는 navigation state와 callback', async () => {
        const previous = canvas.queryByRole('button', { name: '이전 이미지' });
        const next = canvas.queryByRole('button', { name: '다음 이미지' });

        if (mediaCount === 1) {
          expect(previous).not.toBeInTheDocument();
          expect(next).not.toBeInTheDocument();
          return;
        }

        if (currentIndex === 0) {
          expect(previous).toHaveAttribute('aria-disabled', 'true');
        } else {
          expect(previous).not.toHaveAttribute('aria-disabled');
        }

        if (currentIndex === mediaCount - 1) {
          expect(next).toHaveAttribute('aria-disabled', 'true');
        } else {
          expect(next).not.toHaveAttribute('aria-disabled');
        }

        if (currentIndex < mediaCount - 1) {
          await userEvent.click(next!);
          expect(args.onNext).toHaveBeenCalledWith();
          expect(args.onNext).toHaveBeenCalledTimes(1);
        } else {
          await userEvent.click(previous!);
          expect(args.onPrevious).toHaveBeenCalledWith();
          expect(args.onPrevious).toHaveBeenCalledTimes(1);
        }
      });

      if (args.viewState === 'sensitive') {
        await step('Sensitive 보기 callback', async () => {
          await userEvent.click(canvas.getByRole('button', { name: '민감한 이미지 표시' }));
          expect(args.onRevealSensitive).toHaveBeenCalledWith();
          expect(args.onRevealSensitive).toHaveBeenCalledTimes(1);
        });
      }
    } else {
      await step('non-ready 상태의 navigation·counter·Compact tray visibility', async () => {
        expect(canvas.queryByRole('button', { name: '이전 이미지' })).not.toBeInTheDocument();
        expect(canvas.queryByRole('button', { name: '다음 이미지' })).not.toBeInTheDocument();
        expect(canvas.queryByTestId('post-media-viewer-counter')).not.toBeInTheDocument();
        if (args.presentation === 'compact') {
          expect(canvas.queryByTestId('post-media-viewer-action-tray')).not.toBeInTheDocument();
        } else {
          expect(canvas.getByTestId('post-media-viewer-context-rail')).toBeInTheDocument();
        }
      });

      if (args.viewState === 'error') {
        await step('Error 다시 시도 callback', async () => {
          await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
          expect(args.onRetry).toHaveBeenCalledWith();
          expect(args.onRetry).toHaveBeenCalledTimes(1);
        });
      }
    }

    if (navigable && args.presentation === 'compact') {
      await step('실제 Post action surface와 Reply callback', async () => {
        const actionBar = within(canvas.getByTestId('post-media-viewer-action-tray')).getByRole(
          'toolbar',
          { name: '액션 바' },
        );

        for (const name of ['답글', '재게시', '반응', '북마크', '더 보기']) {
          expect(within(actionBar).getByRole('button', { name })).toBeVisible();
        }

        await userEvent.click(within(actionBar).getByRole('button', { name: '답글' }));
        expect(args.onReply).toHaveBeenCalledWith();
        expect(args.onReply).toHaveBeenCalledTimes(1);
      });
    } else if (args.presentation === 'wide') {
      await step('실제 Post 상세 action bar', async () => {
        const currentPost = await canvas.findByTestId('post-thread-current-wide-rail-current');
        const actionBar = within(currentPost).getByRole('toolbar', { name: '액션 바' });

        for (const name of ['답글', '재게시', '반응', '북마크', '더 보기']) {
          expect(within(actionBar).getByRole('button', { name })).toBeVisible();
        }
      });
    }
  },
};

export const CompactProductionActionSurfaceContract: Story = {
  args: { currentIndex: 0, mediaCount: 4, presentation: 'compact', viewState: 'ready' },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: async ({ args, canvasElement, step }) => {
    args.onReply.mockClear();
    const canvas = within(canvasElement);
    const actionBar = within(await canvas.findByTestId('post-media-viewer-action-tray')).getByRole(
      'toolbar',
      { name: '액션 바' },
    );

    await step('production action 순서와 Reply binding', async () => {
      expect(
        within(actionBar)
          .getAllByRole('button')
          .map((button) => button.getAttribute('aria-label')),
      ).toEqual(['답글', '재게시', '반응', '북마크', '더 보기']);
      await userEvent.click(within(actionBar).getByRole('button', { name: '답글' }));
      expect(args.onReply).toHaveBeenCalledWith();
      expect(args.onReply).toHaveBeenCalledTimes(1);
    });

    await step('production More menu open과 dismiss', async () => {
      await userEvent.click(within(actionBar).getByRole('button', { name: '더 보기' }));
      expect(await screen.findByRole('menu', { name: '더 보기 메뉴' })).toBeVisible();
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu', { name: '더 보기 메뉴' })).toBeNull());
    });
  },
};

function BoundaryMovementContractSurface(args: StoryArgs) {
  const mediaCount = 4;
  const [currentIndex, setCurrentIndex] = useState(0);

  return (
    <PostMediaViewerCatalog
      {...args}
      currentIndex={currentIndex}
      mediaCount={mediaCount}
      onNext={() => {
        args.onNext();
        setCurrentIndex((index) => Math.min(mediaCount - 1, index + 1));
      }}
      onPrevious={() => {
        args.onPrevious();
        setCurrentIndex((index) => Math.max(0, index - 1));
      }}
      presentation="compact"
      viewState="ready"
    />
  );
}

export const BoundaryMovementContract: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  render: (args) => <BoundaryMovementContractSurface {...args} />,
  play: async ({ args, canvasElement, step }) => {
    args.onNext.mockClear();
    args.onPrevious.mockClear();

    const canvas = within(canvasElement);
    const position = await canvas.findByRole('status');
    const previous = canvas.getByRole('button', { name: '이전 이미지' });
    const next = canvas.getByRole('button', { name: '다음 이미지' });

    await step('1/4 previous 경계', async () => {
      expect(position).toHaveTextContent('1 / 4');
      expect(previous).toHaveAttribute('aria-disabled', 'true');
      previous.click();
      expect(args.onPrevious).not.toHaveBeenCalled();
    });

    await step('next로 4/4까지 이동', async () => {
      await userEvent.click(next);
      expect(args.onNext).toHaveBeenCalledWith();
      expect(args.onNext).toHaveBeenCalledTimes(1);
      expect(position).toHaveTextContent('2 / 4');

      await userEvent.click(next);
      await userEvent.click(next);
      expect(args.onNext).toHaveBeenCalledTimes(3);
      expect(position).toHaveTextContent('4 / 4');
      expect(next).toHaveAttribute('aria-disabled', 'true');
    });

    await step('4/4 next는 순환하지 않음', async () => {
      next.click();
      expect(args.onNext).toHaveBeenCalledTimes(3);
      expect(position).toHaveTextContent('4 / 4');
    });

    await step('previous로 1/4까지 되돌림', async () => {
      await userEvent.click(previous);
      await userEvent.click(previous);
      await userEvent.click(previous);
      expect(args.onPrevious).toHaveBeenCalledWith();
      expect(args.onPrevious).toHaveBeenCalledTimes(3);
      expect(position).toHaveTextContent('1 / 4');
      expect(previous).toHaveAttribute('aria-disabled', 'true');
    });
  },
};

function SensitiveRevealContractSurface(args: StoryArgs) {
  const [viewState, setViewState] = useState<'ready' | 'sensitive'>('sensitive');

  return (
    <PostMediaViewerCatalog
      {...args}
      currentIndex={0}
      mediaCount={1}
      onRevealSensitive={() => {
        args.onRevealSensitive();
        setViewState('ready');
      }}
      presentation="compact"
      viewState={viewState}
    />
  );
}

export const SensitiveRevealContract: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  render: (args) => <SensitiveRevealContractSurface {...args} />,
  play: async ({ args, canvasElement, step }) => {
    args.onRevealSensitive.mockClear();

    const canvas = within(canvasElement);

    await step('Sensitive 상태의 hidden image와 보기 action', async () => {
      expect(canvas.queryByRole('img')).not.toBeInTheDocument();
      expect(await canvas.findByText('민감한 미디어')).toBeInTheDocument();
      expect(canvas.getByRole('button', { name: '민감한 이미지 표시' })).toBeInTheDocument();
    });

    await step('보기 후 Ready image와 close 유지', async () => {
      await userEvent.click(canvas.getByRole('button', { name: '민감한 이미지 표시' }));
      expect(args.onRevealSensitive).toHaveBeenCalledWith();
      expect(args.onRevealSensitive).toHaveBeenCalledTimes(1);
      expect(canvas.getByTestId('post-media-viewer-image')).toHaveAccessibleName(
        '스토리 첨부 이미지 1',
      );
      expect(canvas.getByRole('button', { name: '이미지 뷰어 닫기' })).toBeInTheDocument();
    });
  },
};

function ErrorRetryContractSurface(args: StoryArgs) {
  const [viewState, setViewState] = useState<'error' | 'ready'>('error');

  return (
    <PostMediaViewerCatalog
      {...args}
      currentIndex={1}
      mediaCount={4}
      onRetry={() => {
        args.onRetry();
        setViewState('ready');
      }}
      presentation="wide"
      viewState={viewState}
    />
  );
}

export const ErrorRetryContract: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMediaViewerWide' } },
  render: (args) => <ErrorRetryContractSurface {...args} />,
  play: async ({ args, canvasElement, step }) => {
    args.onRetry.mockClear();
    const canvas = within(canvasElement);

    await step('Error 설명·retry와 Wide rail', async () => {
      expect(await canvas.findByText('미디어를 불러오지 못했어요')).toBeInTheDocument();
      expect(canvas.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
      expect(canvas.getByTestId('post-media-viewer-context-rail')).toBeInTheDocument();
      expect(canvas.queryByRole('button', { name: '이전 이미지' })).not.toBeInTheDocument();
    });

    await step('retry 후 같은 2/4 Ready 위치', async () => {
      await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
      expect(args.onRetry).toHaveBeenCalledWith();
      expect(args.onRetry).toHaveBeenCalledTimes(1);
      expect(canvas.getByRole('status')).toHaveTextContent('2 / 4');
      expect(canvas.getByTestId('post-media-viewer-image')).toHaveAccessibleName(
        '스토리 첨부 이미지 2',
      );
    });
  },
};

export const WideRailCompositionContract: Story = {
  args: { currentIndex: 0, mediaCount: 4, presentation: 'wide', viewState: 'ready' },
  globals: { viewport: { isRotated: false, value: 'kosmoMediaViewerWide' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rail = await canvas.findByTestId('post-media-viewer-context-rail');
    const thread = await within(rail).findByTestId('post-thread');
    const rows = Array.from(thread.children) as HTMLElement[];
    const currentRow = within(thread).getByTestId('post-thread-current-wide-rail-current');

    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'post-thread-item-wide-rail-ancestor',
      'post-thread-current-wide-rail-current',
      'post-thread-item-wide-rail-descendant',
    ]);
    expect(within(thread).getAllByRole('article', { current: true })).toEqual([currentRow]);
    expect(currentRow).toHaveAttribute('aria-current', 'true');
    expect(within(currentRow).queryByRole('button', { name: /첨부 이미지 크게 보기/ })).toBeNull();
    expect(within(rail).queryByRole('img', { name: '스토리 첨부 이미지 1' })).toBeNull();

    expect(window.getComputedStyle(currentRow).borderTopWidth).toBe('0px');
    expect(window.getComputedStyle(currentRow).borderBottomWidth).toBe('0px');
    for (const rowId of [
      'post-thread-item-wide-rail-ancestor',
      'post-thread-item-wide-rail-descendant',
    ]) {
      expect(
        window.getComputedStyle(
          within(thread).getByTestId(rowId).querySelector('[role="article"]')!,
        ).borderBottomWidth,
      ).toBe('0px');
    }
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

export const Sensitive: Story = {
  args: { currentIndex: 1, mediaCount: 4, presentation: 'compact', viewState: 'sensitive' },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
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
  hiddenReactionSummary: { display: 'none' },
});
