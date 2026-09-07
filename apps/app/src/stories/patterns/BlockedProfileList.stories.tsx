import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { fn } from 'storybook/test';
import { BlockedProfileList } from '@/components/profile/BlockedProfileList';
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
  onUnblock: (id: string) => Promise<void>;
  onDismiss: (profileId: string) => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onFeedback: (event: { profileId: string; blocked: boolean; status: 'success' | 'error' }) => void;
};

function Fixture({
  state,
  outcome,
  displayName,
  onUnblock,
  onDismiss,
  onRetry,
  onLoadMore,
  onFeedback,
}: Props) {
  const [removed, setRemoved] = useState<string[]>([]);
  const [requestState, setRequestState] = useState<Props['state'] | 'end' | null>(null);
  useEffect(() => {
    setRemoved([]);
    setRequestState(null);
  }, [state, outcome, displayName]);
  useEffect(() => {
    if (outcome === 'pending' || (requestState !== 'loading' && requestState !== 'loadingMore')) {
      return;
    }
    const timer = setTimeout(() => {
      setRequestState(
        outcome === 'error'
          ? requestState === 'loading'
            ? 'error'
            : 'loadMoreError'
          : requestState === 'loading'
            ? 'loaded'
            : 'end',
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [requestState, outcome]);
  const visibleState = requestState ?? state;
  const retry = () => {
    onRetry();
    setRequestState(visibleState === 'error' ? 'loading' : 'loadingMore');
  };
  const items = profiles
    .map((profile, index) => ({
      ...profile,
      displayName: index === 0 ? displayName : profile.displayName,
    }))
    .filter((profile) => !removed.includes(profile.id));
  return (
    <View style={{ width: '100%', maxWidth: 640 }}>
      <BlockedProfileList
        onDismiss={onDismiss}
        onFeedback={(event) => {
          onFeedback(event);
          if (event.status === 'success') {
            setRemoved((current) => [...current, event.profileId]);
          }
        }}
        onUnblock={async (id) => {
          await onUnblock(id);
          if (outcome === 'pending') {
            await new Promise<void>(() => {});
          }
          if (outcome === 'error') {
            throw new globalThis.Error('요청 실패');
          }
        }}
        state={
          visibleState === 'loading'
            ? { status: 'loading' }
            : visibleState === 'error'
              ? { status: 'error', onRetry: retry }
              : {
                  status: 'loaded',
                  profiles: visibleState === 'empty' ? [] : items,
                  pagination:
                    visibleState === 'empty' || visibleState === 'end'
                      ? { status: 'end' }
                      : visibleState === 'loadingMore'
                        ? { status: 'loading' }
                        : visibleState === 'loadMoreError'
                          ? { status: 'error', onRetry: retry }
                          : {
                              status: 'more',
                              onLoadMore: () => {
                                onLoadMore();
                                setRequestState('loadingMore');
                              },
                            },
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
    onUnblock: fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    onDismiss: fn<(profileId: string) => void>(),
    onRetry: fn(),
    onLoadMore: fn(),
    onFeedback: fn(),
  },
  argTypes: {
    state: {
      control: 'select',
      options: ['loaded', 'loading', 'error', 'empty', 'loadingMore', 'loadMoreError'],
    },
    outcome: {
      control: 'inline-radio',
      description: '확인 후 해제 callback의 결과 시나리오를 보여줍니다.',
      options: ['success', 'error', 'pending'],
    },
    displayName: { control: 'text' },
  },
  component: Fixture,
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
