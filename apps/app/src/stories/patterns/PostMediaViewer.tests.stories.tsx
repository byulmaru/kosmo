import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import { useToast } from '@/components/ui/ToastProvider';
import ogImage from '../../../public/og-default.png?url';
import { post } from '../fixtures';
import baseMeta, { PostMediaViewerCatalog } from './PostMediaViewer.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { StoryArgs } from './PostMediaViewer.stories';

const compactLongBodyPost = {
  ...post({
    bodyText: Array.from(
      { length: 12 },
      (_, index) => `${index + 1}번째 줄까지 이어지는 Compact Viewer 원문입니다.`,
    ).join('\n'),
    id: 'compact-detail-long',
    repostCount: 3,
  }),
  viewerReactions: [],
};

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Patterns/Post Media Viewer/Tests',
} satisfies Meta<typeof PostMediaViewerCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

function ResourceFailureSurface(args: StoryArgs) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { showToast } = useToast();
  return (
    <>
      <PostMediaViewerCatalog
        {...args}
        currentIndex={currentIndex}
        mediaItems={[
          { id: 'failed', url: '/__viewer_missing_image__.png', altText: '실패 이미지' },
          { id: 'ready', url: ogImage, altText: '정상 이미지' },
        ]}
        onNext={() => setCurrentIndex(1)}
        onPrevious={() => setCurrentIndex(0)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="다른 알림 표시"
        onPress={() => showToast('별도 작업 알림', { tone: 'info' })}
        style={{ position: 'absolute', top: 80, left: 16 }}
      >
        <Text>다른 알림 표시</Text>
      </Pressable>
    </>
  );
}

export const ResourceFailureContract: Story = {
  args: { presentation: 'compact', viewState: 'ready' },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  render: (args) => <ResourceFailureSurface {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toast = await canvas.findByTestId('post-media-viewer-error-toast');
    const pane = canvas.getByTestId('post-media-viewer-media-pane');
    const detail = canvas.getByTestId('post-media-viewer-compact-detail');
    await waitFor(() => expect(toast).toBeVisible());
    expect(pane.contains(toast)).toBe(true);
    const toastRect = toast.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    expect(toastRect.top).toBeGreaterThanOrEqual(paneRect.top);
    expect(toastRect.bottom).toBeLessThanOrEqual(paneRect.bottom);
    expect(toastRect.bottom).toBeLessThanOrEqual(detail.getBoundingClientRect().top);
    await userEvent.click(canvas.getByRole('button', { name: '다른 알림 표시' }));
    expect(await screen.findByText('별도 작업 알림')).toBeVisible();
    expect(within(toast).getByRole('button', { name: '다시 시도' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '다음 이미지' }));
    expect(canvas.queryByTestId('post-media-viewer-error-toast')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: '이전 이미지' }));
    expect(await canvas.findByTestId('post-media-viewer-error-toast')).toBeVisible();
  },
};

export const PlaygroundInteractionContract: Story = {
  play: async ({ args, canvasElement, step }) => {
    const callbacks = [args.onClose, args.onNext, args.onPrevious, args.onRetry];
    callbacks.forEach((callback) => callback.mockClear());

    const canvas = within(canvasElement);

    await step('close control과 no-args callback', async () => {
      await userEvent.click(await canvas.findByRole('button', { name: '이미지 뷰어 닫기' }));
      expect(args.onClose).toHaveBeenCalledWith();
      expect(args.onClose).toHaveBeenCalledTimes(1);
    });

    const navigable = args.viewState === 'ready';
    const mediaCount = Math.max(1, Math.min(4, Math.trunc(args.mediaCount)));
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
    } else {
      await step('non-ready 상태의 navigation·counter·secondary surface visibility', async () => {
        expect(canvas.queryByRole('button', { name: '이전 이미지' })).not.toBeInTheDocument();
        expect(canvas.queryByRole('button', { name: '다음 이미지' })).not.toBeInTheDocument();
        expect(canvas.queryByTestId('post-media-viewer-counter')).not.toBeInTheDocument();
        if (args.presentation === 'compact') {
          expect(canvas.getByTestId('post-media-viewer-compact-detail')).toBeInTheDocument();
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

    if (args.presentation === 'compact') {
      await step('실제 Post detail과 action surface', async () => {
        const detail = canvas.getByTestId('post-media-viewer-compact-detail');
        expect(within(detail).getByText('코스모 작가')).toBeVisible();
        expect(
          within(detail)
            .getAllByText('코스모에서 함께 나누고 싶은 오늘의 이야기입니다.')
            .find((element) => element.dataset.testid !== 'post-layout-body-measure'),
        ).toBeVisible();
        const actionBar = within(detail).getByRole('toolbar', { name: '액션 바' });

        for (const name of ['답글', '재게시', '반응', '북마크', '더 보기']) {
          expect(within(actionBar).getByRole('button', { name })).toBeVisible();
        }
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
  globals: { theme: 'light', viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const detail = await canvas.findByTestId('post-media-viewer-compact-detail');
    const actionBar = within(detail).getByRole('toolbar', { name: '액션 바' });
    const image = canvas.getByTestId('post-media-viewer-image');

    await step('production detail과 action 순서', async () => {
      expect(within(detail).getByText('코스모 작가')).toBeVisible();
      expect(
        within(detail)
          .getAllByText('코스모에서 함께 나누고 싶은 오늘의 이야기입니다.')
          .find((element) => element.dataset.testid !== 'post-layout-body-measure'),
      ).toBeVisible();
      expect(within(detail).queryByText(/조용히 공개/)).toBeNull();
      expect(within(detail).queryByRole('button', { name: /원문 (더 보기|접기)/ })).toBeNull();
      expect(within(detail).queryByRole('img', { name: '스토리 첨부 이미지 1' })).toBeNull();
      expect(
        within(actionBar)
          .getAllByRole('button')
          .map((button) => button.getAttribute('aria-label')),
      ).toEqual(['답글', '재게시', '반응', '북마크', '더 보기']);
    });

    await step('viewer Media privacy boundary', async () => {
      const privacyBoundary = image.closest(
        '[data-testid="post-media-viewer-image-privacy-boundary"]',
      );
      expect(privacyBoundary).not.toBeNull();
      expect(privacyBoundary).toHaveClass('ph-mask', 'ph-no-capture');
      expect(
        canvas
          .getByRole('button', { name: '다음 이미지' })
          .closest('[data-testid="post-media-viewer-image-privacy-boundary"]'),
      ).toBeNull();
    });

    await step('production More bottom sheet open과 backdrop dismiss', async () => {
      await userEvent.click(within(actionBar).getByRole('button', { name: '더 보기' }));
      const menu = await screen.findByRole('menu', { name: '더 보기 메뉴' });
      expect(menu).toBeVisible();
      expect(window.getComputedStyle(menu).backgroundColor).toBe('rgb(255, 255, 255)');
      const backdrop = await screen.findByTestId('action-menu-backdrop');
      expect(backdrop).toBeVisible();
      expect(image).toBeVisible();
      await userEvent.click(backdrop);
      await waitFor(() => expect(screen.queryByRole('menu', { name: '더 보기 메뉴' })).toBeNull());
    });

    await step('production Repost bottom sheet open과 backdrop dismiss', async () => {
      await userEvent.click(within(actionBar).getByRole('button', { name: '재게시' }));
      expect(await screen.findByRole('menu', { name: '재게시 메뉴' })).toBeVisible();
      const backdrop = await screen.findByTestId('action-menu-backdrop');
      expect(backdrop).toBeVisible();
      expect(image).toBeVisible();
      await userEvent.click(backdrop);
      await waitFor(() => expect(screen.queryByRole('menu', { name: '재게시 메뉴' })).toBeNull());
    });
  },
};

export const CompactLongBodyContract: Story = {
  args: { currentIndex: 0, mediaCount: 4, presentation: 'compact', viewState: 'ready' },
  globals: { theme: 'light', viewport: { isRotated: false, value: 'compactViewerShort' } },
  parameters: {
    relay: {
      data: {
        ...baseMeta.parameters.relay.data,
        surface: compactLongBodyPost,
      },
    },
    viewport: {
      options: {
        compactViewerShort: {
          name: 'Compact Viewer short',
          styles: { height: '390px', width: '390px' },
          type: 'mobile',
        },
      },
    },
  },
  render: (args) => (
    <PostMediaViewerCatalog {...args} compactSurfacePostId={compactLongBodyPost.id} />
  ),
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const detail = await canvas.findByTestId('post-media-viewer-compact-detail');
    const mediaPane = canvas.getByTestId('post-media-viewer-media-pane');
    const actionBar = within(detail).getByRole('toolbar', { name: '액션 바' });

    await step('낮은 viewport에서도 Compact detail 상한과 고정 영역을 보존한다', async () => {
      await waitFor(() => expect(window.getComputedStyle(detail).maxHeight).toBe('192px'));
      expect(detail.getBoundingClientRect().height).toBeLessThanOrEqual(192);
      expect(mediaPane.getBoundingClientRect().height).toBeGreaterThan(0);
      expect(actionBar).toBeVisible();
      expect(await within(detail).findByRole('button', { name: '원문 더 보기' })).toBeVisible();
      const measureBoundary = canvas.getByTestId('post-layout-body-measure-container');
      expect(measureBoundary).toHaveAttribute('aria-hidden', 'true');
    });

    await step('펼친 원문만 scroll하고 Action Bar는 밖에 고정한다', async () => {
      await userEvent.click(within(detail).getByRole('button', { name: '원문 더 보기' }));
      const bodyScroll = await within(detail).findByTestId('post-layout-body-scroll');
      expect(bodyScroll.contains(actionBar)).toBe(false);
      expect(actionBar).toBeVisible();
      expect(within(detail).getByRole('button', { name: '원문 접기' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await waitFor(() => expect(bodyScroll.clientHeight).toBeGreaterThanOrEqual(24));
      expect(bodyScroll.scrollHeight).toBeGreaterThan(bodyScroll.clientHeight);
      const surface = canvas.getByTestId('post-media-viewer-surface');
      expect(surface.scrollHeight).toBe(surface.clientHeight);
      expect(detail.scrollHeight).toBe(detail.clientHeight);
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
