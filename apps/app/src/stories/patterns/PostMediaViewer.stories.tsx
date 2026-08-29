import { Bookmark, Heart, MessageCircle, MoreHorizontal, Repeat2 } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PostActionControl } from '@/components/post/PostActionControl';
import { PostMediaViewerSurface } from '@/components/post/PostMediaViewerSurface';
import { Avatar } from '@/components/ui/Avatar';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, space, textStyles } from '@/theme/tokens';
import appleTouchImage from '../../../public/apple-touch-icon.png?url';
import iconImage from '../../../public/icon-512.png?url';
import maskableIconImage from '../../../public/icon-maskable-512.png?url';
import ogImage from '../../../public/og-default.png?url';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PostMediaItem } from '@/components/post/PostMediaImage';

type StoryArgs = {
  currentIndex: number;
  mediaCount: number;
  onBookmark: () => void;
  onClose: () => void;
  onMore: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onReact: () => void;
  onReply: () => void;
  onRepost: () => void;
  onRetry: () => void;
  onRevealSensitive: () => void;
  presentation: 'compact' | 'wide';
  viewState: 'ready' | 'sensitive' | 'loading' | 'error' | 'unavailable';
};

type PostActionArgs = Pick<StoryArgs, 'onBookmark' | 'onMore' | 'onReact' | 'onReply' | 'onRepost'>;

const mediaUrls = [ogImage, iconImage, maskableIconImage, appleTouchImage] as const;

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
  onBookmark,
  onClose,
  onMore,
  onNext,
  onPrevious,
  onReact,
  onReply,
  onRepost,
  onRetry,
  onRevealSensitive,
  presentation,
  viewState,
}: StoryArgs) {
  const { height } = useWindowDimensions();
  const media = mediaForCount(mediaCount);
  const clampedIndex = Math.max(0, Math.min(media.length - 1, Math.trunc(currentIndex)));
  const postActions = { onBookmark, onMore, onReact, onReply, onRepost };

  return (
    <View style={{ height, width: '100%' }}>
      <PostMediaViewerSurface
        actionTray={
          <ThemeProvider mode="dark" reduceMotion>
            <ViewerActionBarFixture {...postActions} />
          </ThemeProvider>
        }
        contextRail={<ContextRailFixture {...postActions} />}
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

function ViewerActionBarFixture({
  onBookmark,
  onMore,
  onReact,
  onReply,
  onRepost,
}: PostActionArgs) {
  const theme = useTheme();

  return (
    <View accessibilityLabel="액션 바" accessibilityRole="toolbar" style={styles.actionBar}>
      <PostActionControl
        accessibilityLabel="답글 달기"
        count={12}
        icon={MessageCircle}
        onPress={() => onReply()}
        testID="viewer-reply"
      />
      <PostActionControl
        accessibilityLabel="재게시하기"
        active
        activeColor={theme.primary}
        count={3}
        icon={Repeat2}
        onPress={() => onRepost()}
        testID="viewer-repost"
      />
      <PostActionControl
        accessibilityLabel="반응"
        icon={Heart}
        onPress={() => onReact()}
        testID="viewer-reaction"
      />
      <PostActionControl
        accessibilityLabel="북마크"
        icon={Bookmark}
        onPress={() => onBookmark()}
        testID="viewer-bookmark"
      />
      <PostActionControl
        accessibilityLabel="더보기"
        alignToEnd
        icon={MoreHorizontal}
        onPress={() => onMore()}
        stateful={false}
        testID="viewer-more"
      />
    </View>
  );
}

function ContextRailFixture(props: PostActionArgs) {
  const theme = useTheme();

  return (
    <View style={[styles.contextRail, { backgroundColor: theme.backgroundCanvas }]}>
      <ThreadPostFixture
        {...props}
        body="오늘도 별을 보며 나누고 싶은 이야기를 남겨요."
        connected
        timestamp="5분 전"
      />
      <ThreadPostFixture
        {...props}
        body="코스모에서 함께 나누고 싶은 오늘의 이야기입니다."
        connected
        timestamp="2026년 8월 25일 · 공개"
      />
      <ThreadPostFixture
        {...props}
        body="같은 하늘을 보고 있던 답글도 이어서 확인할 수 있어요."
        timestamp="5분 전"
      />
    </View>
  );
}

function ThreadPostFixture({
  body,
  connected = false,
  timestamp,
  ...postActions
}: PostActionArgs & { body: string; connected?: boolean; timestamp: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.threadPost, { borderBottomColor: theme.border }]}>
      {connected ? (
        <View style={[styles.threadConnector, { backgroundColor: theme.border }]} />
      ) : null}
      <View style={styles.threadHeader}>
        <Avatar imageUri={null} label="코스모 사용자" size={48} />
        <View style={styles.author}>
          <Text numberOfLines={1} style={[styles.displayName, { color: theme.text }]}>
            코스모 사용자
          </Text>
          <Text numberOfLines={1} style={[styles.handle, { color: theme.textSecondary }]}>
            @kosmo
          </Text>
        </View>
        <Text numberOfLines={1} style={[styles.timestamp, { color: theme.textSecondary }]}>
          {timestamp}
        </Text>
      </View>
      <Text style={[styles.postBody, { color: theme.text }]}>{body}</Text>
      <View style={styles.threadActions}>
        <ViewerActionBarFixture {...postActions} />
      </View>
    </View>
  );
}

const meta = {
  args: {
    currentIndex: 0,
    mediaCount: 4,
    onBookmark: fn(),
    onClose: fn(),
    onMore: fn(),
    onNext: fn(),
    onPrevious: fn(),
    onReact: fn(),
    onReply: fn(),
    onRepost: fn(),
    onRetry: fn(),
    onRevealSensitive: fn(),
    presentation: 'compact',
    viewState: 'ready',
  },
  argTypes: {
    currentIndex: { control: { max: 3, min: 0, step: 1, type: 'number' } },
    mediaCount: { control: { max: 4, min: 1, step: 1, type: 'range' } },
    onBookmark: { action: 'bookmark', control: false },
    onClose: { action: 'close', control: false },
    onMore: { action: 'more', control: false },
    onNext: { action: 'next', control: false },
    onPrevious: { action: 'previous', control: false },
    onReact: { action: 'react', control: false },
    onReply: { action: 'reply', control: false },
    onRepost: { action: 'repost', control: false },
    onRetry: { action: 'retry', control: false },
    onRevealSensitive: { action: 'revealSensitive', control: false },
    presentation: { control: 'inline-radio', options: ['compact', 'wide'] },
    viewState: {
      control: 'select',
      options: ['ready', 'sensitive', 'loading', 'error', 'unavailable'],
    },
  },
  component: PostMediaViewerCatalog,
  excludeStories: ['BoundaryMovementContract', 'SensitiveRevealContract', 'ErrorRetryContract'],
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
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
      args.onBookmark,
      args.onClose,
      args.onMore,
      args.onNext,
      args.onPrevious,
      args.onReact,
      args.onReply,
      args.onRepost,
      args.onRetry,
      args.onRevealSensitive,
    ];
    callbacks.forEach((callback) => callback.mockClear());

    const canvas = within(canvasElement);

    await step('close control과 no-args callback', async () => {
      await userEvent.click(canvas.getByRole('button', { name: '이미지 뷰어 닫기' }));
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

    if (navigable || args.presentation === 'wide') {
      await step('실제 Post action control callback', async () => {
        const actions = [
          ['답글 달기', args.onReply],
          ['재게시하기', args.onRepost],
          ['반응', args.onReact],
          ['북마크', args.onBookmark],
          ['더보기', args.onMore],
        ] as const;

        for (const [name, callback] of actions) {
          await userEvent.click(canvas.getAllByRole('button', { name })[0]!);
          expect(callback).toHaveBeenCalledWith();
          expect(callback).toHaveBeenCalledTimes(1);
        }
      });
    }
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
    const position = canvas.getByRole('status');
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
      expect(canvas.getByText('민감한 미디어')).toBeInTheDocument();
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
      expect(canvas.getByText('미디어를 불러오지 못했어요')).toBeInTheDocument();
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
  actionBar: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    height: 28,
    justifyContent: 'space-between',
    width: '100%',
  },
  contextRail: { flex: 1, minHeight: 0, overflow: 'hidden', width: '100%' },
  threadPost: {
    borderBottomWidth: borderWidths[1],
    minHeight: 0,
    padding: space[8],
    position: 'relative',
  },
  threadConnector: {
    bottom: -8,
    left: 31,
    position: 'absolute',
    top: 56,
    width: borderWidths[1],
  },
  threadHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: space[8] },
  author: { flex: 1, minWidth: 0 },
  displayName: textStyles.uiLabelM,
  handle: textStyles.uiCopyS,
  timestamp: { ...textStyles.uiCopyS, flexShrink: 0 },
  postBody: { marginLeft: 56, marginTop: space[4], ...textStyles.contentM },
  threadActions: { marginLeft: 56, marginTop: space[8] },
});
