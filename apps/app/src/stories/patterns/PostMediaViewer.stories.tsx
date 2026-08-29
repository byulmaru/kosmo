import { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PostMediaViewerSurface } from '@/components/post/PostMediaViewerSurface';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PostMediaItem } from '@/components/post/PostMediaImage';

type StoryArgs = {
  currentIndex: number;
  mediaCount: number;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onRevealSensitive: () => void;
  presentation: 'compact' | 'wide';
  viewState: 'ready' | 'sensitive' | 'loading' | 'error' | 'unavailable';
};

const mediaUrls = [
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20640%20480%22%3E%3Crect%20width%3D%22640%22%20height%3D%22480%22%20fill%3D%22%23e11d48%22%2F%3E%3C%2Fsvg%3E',
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20640%20480%22%3E%3Crect%20width%3D%22640%22%20height%3D%22480%22%20fill%3D%22%237c3aed%22%2F%3E%3C%2Fsvg%3E',
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20640%20480%22%3E%3Crect%20width%3D%22640%22%20height%3D%22480%22%20fill%3D%22%230ea5e9%22%2F%3E%3C%2Fsvg%3E',
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20640%20480%22%3E%3Crect%20width%3D%22640%22%20height%3D%22480%22%20fill%3D%22%2316a34a%22%2F%3E%3C%2Fsvg%3E',
] as const;

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
          <View style={styles.actionTrayFixture}>
            <Text style={styles.actionTrayText}>게시글 작업</Text>
          </View>
        }
        contextRail={
          <View style={styles.contextRailFixture}>
            <Text style={styles.contextRailText}>게시글 문맥</Text>
          </View>
        }
        currentIndex={clampedIndex}
        media={media}
        onClose={onClose}
        onNext={onNext}
        onPrevious={onPrevious}
        onRevealSensitive={onRevealSensitive}
        presentation={presentation}
        viewState={viewState}
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
    onRevealSensitive: { action: 'revealSensitive', control: false },
    presentation: { control: 'inline-radio', options: ['compact', 'wide'] },
    viewState: {
      control: 'select',
      options: ['ready', 'sensitive', 'loading', 'error', 'unavailable'],
    },
  },
  component: PostMediaViewerCatalog,
  excludeStories: ['BoundaryMovementContract', 'SensitiveRevealContract'],
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
    args.onClose.mockClear();
    args.onNext.mockClear();
    args.onPrevious.mockClear();
    args.onRevealSensitive.mockClear();

    const canvas = within(canvasElement);
    const close = canvas.getByRole('button', { name: '이미지 뷰어 닫기' });

    await step('닫기 control과 no-args callback 확인', async () => {
      await userEvent.click(close);
      expect(args.onClose).toHaveBeenCalledWith();
      expect(args.onClose).toHaveBeenCalledTimes(1);
    });

    if (args.viewState !== 'ready' && args.viewState !== 'sensitive') {
      await step('비대화형 상태는 닫기 외 control을 숨김', async () => {
        expect(canvas.queryByRole('button', { name: '이전 이미지' })).not.toBeInTheDocument();
        expect(canvas.queryByRole('button', { name: '다음 이미지' })).not.toBeInTheDocument();
        expect(
          canvas.queryByRole('button', { name: '민감한 이미지 표시' }),
        ).not.toBeInTheDocument();
        expect(canvas.queryByText('게시글 작업')).not.toBeInTheDocument();
        expect(canvas.queryByText('게시글 문맥')).not.toBeInTheDocument();
      });
      return;
    }

    const mediaCount = Math.max(1, Math.min(mediaUrls.length, Math.trunc(args.mediaCount)));
    const currentIndex = Math.max(0, Math.min(mediaCount - 1, Math.trunc(args.currentIndex)));

    await step('현재 경계에 맞는 navigation state와 callback 확인', async () => {
      const previous = canvas.queryByRole('button', { name: '이전 이미지' });
      const next = canvas.queryByRole('button', { name: '다음 이미지' });

      if (mediaCount === 1) {
        expect(previous).not.toBeInTheDocument();
        expect(next).not.toBeInTheDocument();
        expect(args.onNext).toHaveBeenCalledTimes(0);
        expect(args.onPrevious).toHaveBeenCalledTimes(0);
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
        expect(args.onPrevious).toHaveBeenCalledTimes(0);
      } else {
        await userEvent.click(previous!);
        expect(args.onPrevious).toHaveBeenCalledWith();
        expect(args.onPrevious).toHaveBeenCalledTimes(1);
        expect(args.onNext).toHaveBeenCalledTimes(0);
      }
    });

    if (args.viewState === 'sensitive') {
      await step('민감한 이미지 reveal callback 확인', async () => {
        const reveal = canvas.getByRole('button', { name: '민감한 이미지 표시' });
        await userEvent.click(reveal);
        expect(args.onRevealSensitive).toHaveBeenCalledWith();
        expect(args.onRevealSensitive).toHaveBeenCalledTimes(1);
      });
    }
  },
};

function BoundaryMovementContractSurface({
  onClose,
  onNext,
  onPrevious,
  onRevealSensitive,
}: Pick<StoryArgs, 'onClose' | 'onNext' | 'onPrevious' | 'onRevealSensitive'>) {
  const mediaCount = 4;
  const [currentIndex, setCurrentIndex] = useState(0);

  return (
    <PostMediaViewerCatalog
      currentIndex={currentIndex}
      mediaCount={mediaCount}
      onClose={onClose}
      onNext={() => {
        onNext();
        setCurrentIndex((index) => Math.min(mediaCount - 1, index + 1));
      }}
      onPrevious={() => {
        onPrevious();
        setCurrentIndex((index) => Math.max(0, index - 1));
      }}
      onRevealSensitive={onRevealSensitive}
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

function SensitiveRevealContractSurface({
  onClose,
  onNext,
  onPrevious,
  onRevealSensitive,
}: Pick<StoryArgs, 'onClose' | 'onNext' | 'onPrevious' | 'onRevealSensitive'>) {
  const [viewState, setViewState] = useState<'ready' | 'sensitive'>('sensitive');

  return (
    <PostMediaViewerCatalog
      currentIndex={0}
      mediaCount={1}
      onClose={onClose}
      onNext={onNext}
      onPrevious={onPrevious}
      onRevealSensitive={() => {
        onRevealSensitive();
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

    await step('Sensitive 상태의 hidden image와 reveal 확인', async () => {
      expect(canvas.queryByRole('img')).not.toBeInTheDocument();
      expect(canvas.getByRole('button', { name: '민감한 이미지 표시' })).toBeInTheDocument();
    });

    await step('reveal 후 Ready image와 close 유지', async () => {
      await userEvent.click(canvas.getByRole('button', { name: '민감한 이미지 표시' }));
      expect(args.onRevealSensitive).toHaveBeenCalledWith();
      expect(args.onRevealSensitive).toHaveBeenCalledTimes(1);
      expect(canvas.getByRole('img', { name: '스토리 첨부 이미지 1' })).toBeInTheDocument();
      expect(canvas.getByRole('button', { name: '이미지 뷰어 닫기' })).toBeInTheDocument();
    });
  },
};

export const Default: Story = {
  args: { currentIndex: 0, mediaCount: 1, presentation: 'compact', viewState: 'ready' },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
};

export const FirstOfFour: Story = {
  args: { currentIndex: 0, mediaCount: 4, presentation: 'compact', viewState: 'ready' },
  globals: { viewport: { isRotated: false, value: 'kosmoProfileCompact' } },
};

export const MiddleOfFour: Story = {
  args: { currentIndex: 1, mediaCount: 4, presentation: 'wide', viewState: 'ready' },
  globals: { viewport: { isRotated: false, value: 'kosmoProfileFull' } },
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
  globals: { viewport: { isRotated: false, value: 'kosmoProfileCompact' } },
};

export const Error: Story = {
  args: { currentIndex: 0, mediaCount: 4, presentation: 'compact', viewState: 'error' },
  globals: { viewport: { isRotated: false, value: 'kosmoProfileCompact' } },
};

export const Unavailable: Story = {
  args: { currentIndex: 0, mediaCount: 4, presentation: 'wide', viewState: 'unavailable' },
  globals: { viewport: { isRotated: false, value: 'kosmoProfileFull' } },
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
  actionTrayFixture: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  actionTrayText: { color: '#ffffff' },
  contextRailFixture: {
    backgroundColor: '#18181b',
    height: '100%',
    justifyContent: 'center',
    padding: 16,
    width: 280,
  },
  contextRailText: { color: '#ffffff' },
});
