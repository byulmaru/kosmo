import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { BlockedProfileList } from '@/components/profile/BlockedProfileList';
import appleTouchIconUrl from '../../../public/apple-touch-icon.png?url';
import type { Meta, StoryObj } from '@storybook/react-vite';

const profiles = [
  { id: 'kosmo', displayName: '코스모 작가', avatarUri: appleTouchIconUrl },
  { id: 'galaxy', displayName: '은하 관측자', avatarUri: appleTouchIconUrl },
];

type Props = {
  displayName: string;
  onDismiss: (profileId: string) => void;
  onFeedback: (feedback: {
    blocked: boolean;
    profileId: string;
    status: 'success' | 'error';
  }) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onUnblock: (profileId: string) => Promise<void>;
  outcome: 'success' | 'error' | 'pending';
  state: 'loaded' | 'loading' | 'error' | 'empty' | 'loadingMore' | 'loadMoreError';
};

function Fixture({
  displayName,
  onDismiss,
  onFeedback,
  onLoadMore,
  onRetry,
  onUnblock,
  outcome,
  state,
}: Props) {
  const [removed, setRemoved] = useState<string[]>([]);
  useEffect(() => setRemoved([]), [displayName, outcome, state]);

  const items = profiles
    .map((profile, index) => ({
      ...profile,
      displayName: index === 0 ? displayName : profile.displayName,
    }))
    .filter((profile) => !removed.includes(profile.id));

  return (
    <View style={{ maxWidth: 640, width: '100%' }}>
      <BlockedProfileList
        onDismiss={onDismiss}
        onFeedback={(feedback) => {
          onFeedback(feedback);
          if (feedback.status === 'success') {
            setRemoved((current) =>
              current.includes(feedback.profileId) ? current : [...current, feedback.profileId],
            );
          }
        }}
        onUnblock={async (profileId) => {
          await onUnblock(profileId);
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
    displayName: '코스모 작가',
    onDismiss: fn<(profileId: string) => void>(),
    onFeedback: fn(),
    onLoadMore: fn(),
    onRetry: fn(),
    onUnblock: fn<(profileId: string) => Promise<void>>().mockResolvedValue(undefined),
    outcome: 'success',
    state: 'loaded',
  },
  argTypes: {
    displayName: { control: 'text' },
    outcome: {
      control: 'inline-radio',
      description: '확인 후 해제 callback의 결과 시나리오를 보여줍니다.',
      options: ['success', 'error', 'pending'],
    },
    state: {
      control: 'select',
      options: ['loaded', 'loading', 'error', 'empty', 'loadingMore', 'loadMoreError'],
    },
  },
  component: Fixture,
  excludeStories: [
    'FailureContract',
    'InitialRetryContract',
    'LastRowRemovalFocusContract',
    'LoadMoreContract',
    'PaginationRetryContract',
    'SuccessContract',
  ],
  parameters: { controls: { include: ['state', 'outcome', 'displayName'] } },
  title: 'KOSMO/Patterns/Profile/Blocked Profiles',
} satisfies Meta<typeof Fixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
export const Loading: Story = { args: { state: 'loading' } };
export const Empty: Story = { args: { state: 'empty' } };
export const Error: Story = { args: { state: 'error' } };
export const LoadingMore: Story = { args: { state: 'loadingMore' } };
export const LoadMoreError: Story = { args: { state: 'loadMoreError' } };
export const LongIdentity: Story = {
  args: { displayName: '아주 긴 표시 이름을 사용하는 코스모의 은하 관측자' },
};
export const Mobile: Story = {
  globals: { viewport: { value: 'kosmoMobile', isRotated: false } },
  parameters: { layout: 'fullscreen' },
};
export const Compact: Story = {
  globals: { viewport: { value: 'kosmoProfileCompact', isRotated: false } },
  parameters: { layout: 'fullscreen' },
};
export const Full: Story = {
  globals: { viewport: { value: 'kosmoProfileFull', isRotated: false } },
  parameters: { layout: 'fullscreen' },
};

export const SuccessContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onDismiss.mockClear();
    args.onFeedback.mockClear();
    args.onLoadMore.mockClear();
    args.onRetry.mockClear();
    args.onUnblock.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const firstAction = canvas.getByRole('button', { name: `${args.displayName} 차단 해제` });

    await userEvent.click(firstAction);
    expect(await body.findByText('이 프로필의 차단을 해제할까요?')).toBeVisible();
    expect(args.onUnblock).not.toHaveBeenCalled();
    await userEvent.click(await body.findByRole('button', { name: '차단 해제' }));
    await waitFor(() => expect(args.onUnblock).toHaveBeenCalledWith('kosmo'));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({
        blocked: false,
        profileId: 'kosmo',
        status: 'success',
      }),
    );
    await waitFor(() => expect(canvas.queryByText(args.displayName)).not.toBeInTheDocument());
    const secondAction = canvas.getByRole('button', { name: '은하 관측자 차단 해제' });
    await waitFor(() => expect(secondAction).toHaveFocus());

    await userEvent.click(secondAction);
    await userEvent.click(await body.findByRole('button', { name: '차단 해제' }));
    await waitFor(() => expect(args.onUnblock).toHaveBeenCalledWith('galaxy'));
    await waitFor(() => expect(canvas.queryByText('은하 관측자')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(canvas.getByRole('heading', { name: '차단한 프로필' })).toHaveFocus(),
    );
  },
};

export const LastRowRemovalFocusContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onDismiss.mockClear();
    args.onFeedback.mockClear();
    args.onLoadMore.mockClear();
    args.onRetry.mockClear();
    args.onUnblock.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole('button', { name: '은하 관측자 차단 해제' }));
    expect(await body.findByText('이 프로필의 차단을 해제할까요?')).toBeVisible();
    expect(args.onUnblock).not.toHaveBeenCalled();
    await userEvent.click(await body.findByRole('button', { name: '차단 해제' }));
    await waitFor(() => expect(args.onUnblock).toHaveBeenCalledWith('galaxy'));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({
        blocked: false,
        profileId: 'galaxy',
        status: 'success',
      }),
    );
    expect(canvas.getByText(args.displayName)).toBeVisible();
    expect(canvas.queryByText('은하 관측자')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: `${args.displayName} 차단 해제` })).toHaveFocus(),
    );
  },
};

export const FailureContract: Story = {
  args: { outcome: 'error' },
  play: async ({ args, canvasElement }) => {
    args.onDismiss.mockClear();
    args.onFeedback.mockClear();
    args.onLoadMore.mockClear();
    args.onRetry.mockClear();
    args.onUnblock.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const action = canvas.getByRole('button', { name: `${args.displayName} 차단 해제` });

    await userEvent.click(action);
    await userEvent.click(await body.findByRole('button', { name: '차단 해제' }));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({
        blocked: false,
        profileId: 'kosmo',
        status: 'error',
      }),
    );
    expect(canvas.getByText(args.displayName)).toBeVisible();
    await waitFor(() => expect(body.getByRole('button', { name: '취소' })).toHaveFocus());
    await userEvent.click(body.getByRole('button', { name: '차단 해제' }));
    await waitFor(() => expect(args.onUnblock).toHaveBeenCalledTimes(2));
    await userEvent.click(body.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(args.onDismiss).toHaveBeenCalledWith('kosmo'));
  },
};

export const InitialRetryContract: Story = {
  args: { state: 'error' },
  play: async ({ args, canvasElement }) => {
    args.onDismiss.mockClear();
    args.onFeedback.mockClear();
    args.onLoadMore.mockClear();
    args.onRetry.mockClear();
    args.onUnblock.mockClear();
    await userEvent.click(within(canvasElement).getByRole('button', { name: '다시 시도' }));
    expect(args.onRetry).toHaveBeenCalledTimes(1);
  },
};

export const PaginationRetryContract: Story = {
  args: { state: 'loadMoreError' },
  play: async ({ args, canvasElement }) => {
    args.onDismiss.mockClear();
    args.onFeedback.mockClear();
    args.onLoadMore.mockClear();
    args.onRetry.mockClear();
    args.onUnblock.mockClear();
    await userEvent.click(within(canvasElement).getByRole('button', { name: '다시 시도' }));
    expect(args.onRetry).toHaveBeenCalledTimes(1);
  },
};

export const LoadMoreContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onDismiss.mockClear();
    args.onFeedback.mockClear();
    args.onLoadMore.mockClear();
    args.onRetry.mockClear();
    args.onUnblock.mockClear();
    await userEvent.click(within(canvasElement).getByRole('button', { name: '더 불러오기' }));
    expect(args.onLoadMore).toHaveBeenCalledTimes(1);
  },
};
