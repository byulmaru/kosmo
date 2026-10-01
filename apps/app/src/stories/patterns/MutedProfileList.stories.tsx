import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { fn } from 'storybook/test';
import { MutedProfileList } from '@/components/profile/MutedProfileList';
import { ProfileMuteActionControl } from '@/components/profile/ProfileMuteAction';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, space, textStyles } from '@/theme/tokens';
import appleTouchIconUrl from '../../../public/apple-touch-icon.png?url';
import { profile } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { MutedProfileListStoriesQuery as MutedProfileListStoriesQueryType } from './__generated__/MutedProfileListStoriesQuery.graphql';

const longDisplayName = '아주 긴 표시 이름을 사용하는 코스모의 은하 관측자';
const profiles = [
  profile({
    avatar: { id: 'muted-kosmo-avatar', url: appleTouchIconUrl },
    displayName: '코스모 작가',
    handle: 'kosmo',
    id: 'kosmo',
    relativeHandle: '@kosmo',
  }),
  profile({
    avatar: { id: 'muted-galaxy-avatar', url: appleTouchIconUrl },
    displayName: '은하 관측자',
    handle: 'galaxy',
    id: 'galaxy',
    relativeHandle: '@galaxy',
  }),
  profile({
    avatar: { id: 'muted-long-avatar', url: appleTouchIconUrl },
    displayName: longDisplayName,
    handle: 'long',
    id: 'long',
    relativeHandle: '@long',
  }),
];
const profileIds = profiles.map(({ id }) => id);

const MutedProfileListStoriesQuery = graphql`
  query MutedProfileListStoriesQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Profile {
        id
        ...ProfileListItemRow_profile @alias(as: "row")
      }
    }
  }
`;

function useStoryProfiles() {
  const data = useLazyLoadQuery<MutedProfileListStoriesQueryType>(MutedProfileListStoriesQuery, {
    ids: profileIds,
  });

  return data.nodes.map((node) => {
    if (node?.__typename !== 'Profile' || !node.row) {
      throw new globalThis.Error(
        'MutedProfileListStoriesQuery must return Profile fragments in fixture order.',
      );
    }
    return { id: node.id, row: node.row };
  });
}
type Props = {
  state: 'loaded' | 'loading' | 'error' | 'empty' | 'loadingMore' | 'loadMoreError';
  outcome: 'success' | 'error' | 'pending';
  displayName: string;
  onUnmute: (id: string) => Promise<void>;
  onRetry: () => void;
  onFeedback: (event: { profileId: string; muted: boolean; status: 'success' | 'error' }) => void;
};
function Fixture({ state, outcome, displayName, onUnmute, onRetry, onFeedback }: Props) {
  const storyProfiles = useStoryProfiles();
  const theme = useTheme();
  const headingRef = useRef<View>(null);
  const focusAfterRemoval = useRef(false);
  const [removed, setRemoved] = useState<string[]>([]);
  const [requestState, setRequestState] = useState<Props['state'] | 'end' | null>(null);
  useEffect(() => {
    setRemoved([]);
    setRequestState(null);
  }, [state, outcome, displayName]);
  useEffect(() => {
    if (focusAfterRemoval.current) {
      headingRef.current?.focus();
      focusAfterRemoval.current = false;
    }
  }, [removed]);
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
    headingRef.current?.focus();
    onRetry();
    setRequestState(visibleState === 'error' ? 'loading' : 'loadingMore');
  };
  const selectedProfile = profiles.find((p) => p.displayName === displayName) ?? profiles[0]!;
  const items = [
    selectedProfile,
    ...profiles.filter((p) => p.id !== selectedProfile.id).slice(0, 1),
  ]
    .map((item) => {
      return {
        action: (
          <ProfileMuteActionControl
            displayName={item.displayName}
            muted
            onChangeMuted={async () => {
              await onUnmute(item.id);
              if (outcome === 'pending') {
                await new Promise<void>(() => {});
              }
              if (outcome === 'error') {
                throw new globalThis.Error('요청 실패');
              }
            }}
            onFeedback={(event) => {
              onFeedback({ ...event, profileId: item.id });
              if (event.status === 'success') {
                focusAfterRemoval.current = true;
                setRemoved((current) => [...current, item.id]);
              }
            }}
            profileId={item.id}
            surface="button"
          />
        ),
        id: item.id,
        profile: storyProfiles.find((storyProfile) => storyProfile.id === item.id)!.row,
      };
    })
    .filter((p) => !removed.includes(p.id));
  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.frame}>
      <View accessibilityRole="header" ref={headingRef} tabIndex={-1}>
        <Text
          style={[
            styles.heading,
            { color: theme.foregroundPrimary, borderColor: theme.borderDefault },
          ]}
        >
          뮤트한 프로필
        </Text>
      </View>
      <MutedProfileList
        state={
          visibleState === 'loading'
            ? { status: 'loading' }
            : visibleState === 'error'
              ? { status: 'error', onRetry: retry }
              : {
                  status: 'loaded',
                  profiles: visibleState === 'empty' ? [] : items,
                  pagination:
                    visibleState === 'empty' || visibleState === 'end' || visibleState === 'loaded'
                      ? { status: 'end' }
                      : visibleState === 'loadingMore'
                        ? { status: 'loading' }
                        : visibleState === 'loadMoreError'
                          ? { status: 'error', onRetry: retry }
                          : { status: 'end' },
                }
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, width: '100%' },
  frame: { maxWidth: 640, width: '100%' },
  heading: { ...textStyles.uiHeadingM, borderBottomWidth: borderWidths[1], padding: space[16] },
});
const meta = {
  args: {
    state: 'loaded',
    outcome: 'success',
    displayName: '코스모 작가',
    onUnmute: fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    onRetry: fn(),
    onFeedback: fn(),
  },
  argTypes: {
    state: {
      control: 'select',
      options: ['loaded', 'loading', 'error', 'empty', 'loadingMore', 'loadMoreError'],
    },
    outcome: { control: 'inline-radio', options: ['success', 'error', 'pending'] },
    displayName: { control: 'select', options: profiles.map(({ displayName }) => displayName) },
  },
  component: Fixture,
  excludeStories: [
    'UnmuteContract',
    'FailureContract',
    'PendingContract',
    'RetryContract',
    'PaginationContract',
  ],
  parameters: {
    controls: { include: ['state', 'outcome', 'displayName'] },
    relay: { data: { nodes: profiles } },
  },
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
  args: { displayName: longDisplayName },
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
export const UnmuteContract: Story = {};
export const FailureContract: Story = { args: { outcome: 'error' } };
export const PendingContract: Story = { args: { outcome: 'pending' } };
export const RetryContract: Story = { args: { state: 'error' } };
export const PaginationContract: Story = { args: { state: 'loadingMore' } };
