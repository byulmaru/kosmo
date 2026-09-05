import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { MutedProfileList } from '@/components/profile/MutedProfileList';
import appleTouchIconUrl from '../../../public/apple-touch-icon.png?url';
import type { Meta, StoryObj } from '@storybook/react-vite';

const profiles = [
  { id: 'kosmo', displayName: '코스모 작가', avatarUri: appleTouchIconUrl },
  { id: 'galaxy', displayName: '은하 관측자', avatarUri: appleTouchIconUrl },
];
type Props = {
  state: 'loaded' | 'loading' | 'error' | 'empty' | 'loadingMore' | 'loadMoreError';
  outcome: 'success' | 'error' | 'pending';
  displayName: string;
  onUnmute: (id: string) => Promise<void>;
  onRetry: () => void;
  onLoadMore: () => void;
  onFeedback: (event: { profileId: string; muted: boolean; status: 'success' | 'error' }) => void;
};
function Fixture({
  state,
  outcome,
  displayName,
  onUnmute,
  onRetry,
  onLoadMore,
  onFeedback,
}: Props) {
  const [removed, setRemoved] = useState<string[]>([]);
  useEffect(() => setRemoved([]), [state, outcome, displayName]);
  const items = profiles
    .map((p, index) => ({ ...p, displayName: index ? p.displayName : displayName }))
    .filter((p) => !removed.includes(p.id));
  return (
    <View style={{ width: '100%', maxWidth: 640 }}>
      <MutedProfileList
        onFeedback={(event) => {
          onFeedback(event);
          if (event.status === 'success') {
            setRemoved((current) => [...current, event.profileId]);
          }
        }}
        onUnmute={async (id) => {
          await onUnmute(id);
          if (outcome === 'pending') {
            await new Promise<void>(() => {});
          }
          if (outcome === 'error') {
            throw new globalThis.Error('요청 실패');
          }
        }}
        state={
          state === 'loading'
            ? { status: 'loading' }
            : state === 'error'
              ? { status: 'error', onRetry }
              : {
                  status: 'loaded',
                  profiles: state === 'empty' ? [] : items,
                  pagination:
                    state === 'empty'
                      ? { status: 'end' }
                      : state === 'loadingMore'
                        ? { status: 'loading' }
                        : state === 'loadMoreError'
                          ? { status: 'error', onRetry }
                          : { status: 'more', onLoadMore },
                }
        }
      />
    </View>
  );
}
const meta = {
  args: {
    state: 'loaded',
    outcome: 'success',
    displayName: '코스모 작가',
    onUnmute: fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    onRetry: fn(),
    onLoadMore: fn(),
    onFeedback: fn(),
  },
  argTypes: {
    state: {
      control: 'select',
      options: ['loaded', 'loading', 'error', 'empty', 'loadingMore', 'loadMoreError'],
    },
    outcome: { control: 'inline-radio', options: ['success', 'error', 'pending'] },
    displayName: { control: 'text' },
  },
  component: Fixture,
  excludeStories: ['UnmuteContract', 'FailureContract', 'RetryContract', 'PaginationContract'],
  parameters: { controls: { include: ['state', 'outcome', 'displayName'] } },
  title: 'KOSMO/Patterns/Profile/Muted Profiles',
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const Loading: Story = { args: { state: 'loading' } };
export const Empty: Story = { args: { state: 'empty' } };
export const Error: Story = { args: { state: 'error' } };
export const LoadingMore: Story = { args: { state: 'loadingMore' } };
export const LoadMoreError: Story = { args: { state: 'loadMoreError' } };
export const Mobile: Story = {
  play: async ({ args, canvasElement }) => {
    await waitFor(() => {
      const rect = within(canvasElement)
        .getByRole('button', { name: `${args.displayName} 뮤트 해제` })
        .getBoundingClientRect();
      expect(rect.width).toBe(88);
      expect(rect.height).toBe(40);
    });
  },
  args: { displayName: '아주 긴 표시 이름을 사용하는 코스모의 은하 관측자' },
  globals: { viewport: { value: 'kosmoMobile', isRotated: false } },
  parameters: { layout: 'fullscreen' },
};
export const Compact: Story = {
  play: async ({ args, canvasElement }) => {
    await waitFor(() => {
      const rect = within(canvasElement)
        .getByRole('button', { name: `${args.displayName} 뮤트 해제` })
        .getBoundingClientRect();
      expect(rect.width).toBe(72);
      expect(rect.height).toBe(32);
    });
  },
  globals: { viewport: { value: 'kosmoProfileCompact', isRotated: false } },
  parameters: { layout: 'fullscreen' },
};
export const Full: Story = {
  globals: { viewport: { value: 'kosmoProfileFull', isRotated: false } },
  parameters: { layout: 'fullscreen' },
};
export const UnmuteContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onUnmute.mockClear();
    args.onFeedback.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: `${args.displayName} 뮤트 해제` }));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({
        profileId: 'kosmo',
        muted: false,
        status: 'success',
      }),
    );
    expect(args.onUnmute).toHaveBeenCalledWith('kosmo');
    await waitFor(() => expect(canvas.queryByText(args.displayName)).not.toBeInTheDocument());
    expect(canvas.getByText('은하 관측자')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '은하 관측자 뮤트 해제' }));
    await waitFor(() => expect(canvas.queryByText('은하 관측자')).not.toBeInTheDocument());
    expect(canvas.getByRole('button', { name: '더 불러오기' })).toBeVisible();
  },
};
export const FailureContract: Story = {
  args: { outcome: 'error' },
  play: async ({ args, canvasElement }) => {
    args.onUnmute.mockClear();
    args.onFeedback.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: `${args.displayName} 뮤트 해제` }));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({
        profileId: 'kosmo',
        muted: false,
        status: 'error',
      }),
    );
    expect(canvas.getByText(args.displayName)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: `${args.displayName} 뮤트 해제` }));
    await waitFor(() => expect(args.onUnmute).toHaveBeenCalledTimes(2));
  },
};
export const RetryContract: Story = {
  args: { state: 'error' },
  play: async ({ args, canvasElement }) => {
    args.onRetry.mockClear();
    await userEvent.click(within(canvasElement).getByRole('button', { name: '다시 시도' }));
    expect(args.onRetry).toHaveBeenCalledTimes(1);
  },
};
export const PaginationContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onLoadMore.mockClear();
    await userEvent.click(within(canvasElement).getByRole('button', { name: '더 불러오기' }));
    expect(args.onLoadMore).toHaveBeenCalledTimes(1);
  },
};
