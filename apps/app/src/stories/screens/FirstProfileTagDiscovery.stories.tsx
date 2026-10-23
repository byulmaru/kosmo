import { useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { FirstProfileTagDiscoveryRoute } from '@/components/onboarding/FirstProfileTagDiscoveryRoute';
import { StateView } from '@/components/ui/StateView';
import { SessionProvider } from '@/session/SessionProvider';
import { RelayStoryProvider } from '../../../.storybook/mocks/react-relay';
import { profile } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';

const account = {
  currentSession: { id: 'discovery-session', selectedProfile: { id: 'discovery-owner' } },
  me: { id: 'discovery-account', name: '새로운 사용자' },
};
const tags = [
  { id: 'discovery-tag-books', name: '책' },
  { id: 'discovery-tag-music', name: '음악' },
];
const candidates = [
  profile({
    id: 'discovery-reader',
    displayName: '책 읽는 봄',
    relativeHandle: '@spring',
    bio: '읽고 있는 책과 좋아하는 문장을 나눠요.',
    followPolicy: 'OPEN',
    viewerState: { follow: null, followRequest: null, profileBlock: null, isSelf: false },
  }),
  profile({
    id: 'discovery-music',
    displayName: '긴 표시 이름과 관심사를 가진 사람',
    relativeHandle: '@music@fediverse.example',
    bio: '책과 음악 이야기를 좋아해요. 새로 알게 된 사람들과 천천히 인사하고 싶어요.',
    followPolicy: 'APPROVAL_REQUIRED',
    viewerState: {
      follow: null,
      followRequest: { id: 'discovery-request' },
      profileBlock: null,
      isSelf: false,
    },
  }),
  profile({
    id: 'discovery-following',
    displayName: '함께 읽어요',
    relativeHandle: '@readtogether',
    bio: '주말에는 함께 책을 읽어요.',
    viewerState: {
      follow: { id: 'discovery-follow', follower: { id: 'discovery-owner', followingCount: 1 } },
      followRequest: null,
      profileBlock: null,
      isSelf: false,
    },
  }),
];

type State = 'ready' | 'empty' | 'tags-error' | 'list-error' | 'loading' | 'long';
function DiscoveryStory({ state = 'ready' }: { state?: State }) {
  const [continued, setContinued] = useState(false);
  const { height } = useWindowDimensions();
  const operationResponses = useMemo(() => {
    const savedTags =
      state === 'long'
        ? Array.from({ length: 2 }, (_, index) => ({
            id: `discovery-long-tag-${index}`,
            name: `${'긴태그'.repeat(5)}${index}`,
          }))
        : tags;
    const list = (id: string) => ({
      data: {
        node: {
          __typename: 'Hashtag',
          id,
          relatedProfiles: {
            edges: (state === 'empty' ? [] : candidates).map((node) => ({ cursor: node.id, node })),
            pageInfo: {
              endCursor: 'discovery-end',
              startCursor: 'discovery-start',
              hasNextPage: false,
              hasPreviousPage: false,
            },
          },
        },
      },
    });
    return {
      FirstProfileTagDiscoveryQuery:
        state === 'tags-error'
          ? { error: '저장 태그 조회 실패' }
          : {
              data: { node: { __typename: 'Profile', id: 'discovery-owner', tags: savedTags } },
              delayMs: state === 'loading' ? 60_000 : undefined,
            },
      FirstProfileTagDiscoveryTagQuery:
        state === 'list-error'
          ? { error: '관련 프로필 조회 실패' }
          : {
              sequence: [
                list(savedTags[0]!.id),
                ...savedTags.slice(1).map((tag) => list(tag.id)),
              ] as [ReturnType<typeof list>, ...ReturnType<typeof list>[]],
            },
    };
  }, [state]);
  return (
    <RelayStoryProvider
      operationResponses={operationResponses}
      queryData={account}
      mutationError="팔로우 상태를 변경하지 못했어요"
    >
      <SessionProvider>
        <View style={{ height }}>
          {continued ? (
            <StateView title="홈으로 이동했어요" />
          ) : (
            <FirstProfileTagDiscoveryRoute
              empty={<StateView title="저장한 태그가 없어 홈으로 이동해요" />}
              onContinue={() => setContinued(true)}
              profileId="discovery-owner"
            />
          )}
        </View>
      </SessionProvider>
    </RelayStoryProvider>
  );
}

const meta = {
  component: DiscoveryStory,
  globals: { theme: 'light', viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'fullscreen' },
  title: 'KOSMO/Screens/First Profile Tag Discovery',
} satisfies Meta<typeof DiscoveryStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const EmptyResults: Story = { args: { state: 'empty' } };
export const TagsError: Story = { args: { state: 'tags-error' } };
export const ListError: Story = { args: { state: 'list-error' } };
export const Loading: Story = { args: { state: 'loading' } };
export const LongTagsDark: Story = { args: { state: 'long' }, globals: { theme: 'dark' } };
