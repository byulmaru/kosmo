import { useState } from 'react';
import { Text } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, userEvent, within } from 'storybook/test';
import { ReactionProfileList } from '@/components/reaction/ReactionProfileList';
import { ReactionSummary } from '@/components/reaction/ReactionSummary';
import { profile } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactionsStoriesQuery as ReactionsStoriesQueryType } from './__generated__/ReactionsStoriesQuery.graphql';

const tiedEntries = [
  { count: 3, type: '🎉' },
  { count: 3, type: '❤️' },
  { count: 1, type: '👀' },
] as const;

const profileCopy = {
  emptyDescription: '이 반응을 남긴 프로필이 생기면 여기에 표시돼요.',
  emptyTitle: '아직 이 반응을 남긴 프로필이 없어요',
  errorDescription: '잠시 후 다시 시도해주세요.',
  errorTitle: '반응한 프로필을 불러오지 못했어요',
  loadErrorTitle: '반응한 프로필을 더 불러오지 못했어요',
  loadingTitle: '반응한 프로필을 불러오는 중입니다.',
} as const;

const storyProfiles = [
  profile({
    displayName: '별빛 반응 프로필',
    id: 'reaction-profile-starlight',
    relativeHandle: '@starlight',
  }),
  profile({
    displayName: '은하수 반응 프로필',
    id: 'reaction-profile-milky-way',
    relativeHandle: '@milky-way',
  }),
];

const ReactionsStoriesQuery = graphql`
  query ReactionsStoriesQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Profile {
        id
        ...ProfileListItem_profile @alias(as: "reactionListItem")
      }
    }
  }
`;

type ProfileNode = Extract<
  NonNullable<ReactionsStoriesQueryType['response']['nodes'][number]>,
  { readonly __typename: 'Profile' }
>;

function useStoryProfiles(): ReadonlyArray<ProfileNode> {
  const data = useLazyLoadQuery<ReactionsStoriesQueryType>(ReactionsStoriesQuery, {
    ids: storyProfiles.map(({ id }) => id),
  });

  return data.nodes.map((node) => {
    if (node?.__typename !== 'Profile') {
      throw new Error('ReactionsStoriesQuery must return Profile nodes in fixture order.');
    }
    return node;
  });
}

function requireFragment<T>(fragment: T | null | undefined, label: string): T {
  if (!fragment) {
    throw new Error(`Missing ${label} fragment reference.`);
  }
  return fragment;
}

function ReactionSummaryCatalog() {
  const [selectedType, setSelectedType] = useState<string>();
  const [retryCount, setRetryCount] = useState(0);

  return (
    <Catalog>
      <Section title="Loading">
        <ReactionSummary loading={false} />
      </Section>
      <Section title="Error">
        <ReactionSummary error onRetry={() => setRetryCount((count) => count + 1)} />
        <Text>{`재시도: ${retryCount}`}</Text>
      </Section>
      <Section title="Empty">
        <ReactionSummary entries={[]} />
      </Section>
      <Section title="Populated">
        <ReactionSummary entries={tiedEntries} onSelectType={setSelectedType} />
        {selectedType ? <Text>{`선택: ${selectedType}`}</Text> : null}
      </Section>
    </Catalog>
  );
}

function ReactionProfileListCatalog() {
  const profiles = useStoryProfiles();
  const [initialRetryCount, setInitialRetryCount] = useState(0);
  const [loadMoreCount, setLoadMoreCount] = useState(0);
  const items = profiles.map((item) => ({
    id: item.id,
    profile: requireFragment(item.reactionListItem, 'reaction list item'),
  }));

  return (
    <Catalog>
      <Section title="Loading">
        <ReactionProfileList loading={false} reactionType="❤️" />
      </Section>
      <Section title="Initial error and retry">
        <ReactionProfileList
          error
          onRetry={() => setInitialRetryCount((count) => count + 1)}
          reactionType="❤️"
        />
        <Text>{`초기 재시도: ${initialRetryCount}`}</Text>
      </Section>
      <Section title="Empty">
        <ReactionProfileList items={[]} reactionType="❤️" />
      </Section>
      <Section title="Populated">
        <ReactionProfileList items={items} reactionType="❤️" />
      </Section>
      <Section title="Pagination">
        <ReactionProfileList
          hasNext
          items={items}
          onLoadMore={() => setLoadMoreCount((count) => count + 1)}
          reactionType="❤️"
        />
        <Text>{`더 불러오기: ${loadMoreCount}`}</Text>
      </Section>
      <Section title="Pagination error retry">
        <ReactionProfileList
          items={items}
          loadMoreError
          onLoadMore={() => setLoadMoreCount((count) => count + 1)}
          reactionType="❤️"
        />
      </Section>
      <Section title="Loading more">
        <ReactionProfileList
          hasNext
          isLoadingMore
          items={items}
          onLoadMore={() => setLoadMoreCount((count) => count + 1)}
          reactionType="❤️"
        />
      </Section>
    </Catalog>
  );
}

const meta = {
  component: ReactionSummaryCatalog,
  parameters: {
    relay: { data: { nodes: storyProfiles } },
    router: { pathname: '/@kosmo' },
  },
  title: 'KOSMO/Reactions/ReactionSummary',
} satisfies Meta<typeof ReactionSummaryCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByText('반응 요약을 불러오는 중입니다.')).toBeVisible();
    expect(
      canvas.getByRole('progressbar', { name: '반응 요약을 불러오는 중입니다.' }),
    ).toBeVisible();
    expect(canvas.getByRole('alert')).toHaveTextContent('반응을 불러오지 못했어요');
    expect(canvas.getByText('아직 반응이 없어요')).toBeVisible();
    expect(
      canvas
        .getAllByRole('button', { name: /반응 \d+개 보기/ })
        .map((button) => button.textContent),
    ).toEqual(['🎉 3', '❤️ 3', '👀 1']);
    expect(canvas.getByRole('button', { name: '❤️ 반응 3개 보기' })).toBeEnabled();

    await userEvent.click(canvas.getByRole('button', { name: '❤️ 반응 3개 보기' }));
    expect(canvas.getByText('선택: ❤️')).toBeVisible();

    await userEvent.click(canvas.getAllByRole('button', { name: '다시 시도' })[0]!);
    expect(canvas.getByText('재시도: 1')).toBeVisible();
  },
};

export const ProfileListStates: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByText(profileCopy.loadingTitle)).toBeVisible();
    expect(canvas.getByRole('progressbar', { name: profileCopy.loadingTitle })).toBeVisible();
    expect(canvas.getAllByText(profileCopy.errorTitle)).toHaveLength(1);
    expect(canvas.getByText(profileCopy.emptyTitle)).toBeVisible();
    expect(canvasElement.querySelector('a[href="/@starlight"]')).toBeInTheDocument();
    expect(canvasElement.querySelector('a[href="/@milky-way"]')).toBeInTheDocument();

    await userEvent.click(canvas.getAllByRole('button', { name: '다시 시도' })[0]!);
    expect(canvas.getByText('초기 재시도: 1')).toBeVisible();

    const loadMoreButtons = canvas.getAllByRole('button', { name: '더 불러오기' });
    await userEvent.click(loadMoreButtons[0]!);
    expect(canvas.getByText('더 불러오기: 1')).toBeVisible();

    await userEvent.click(canvas.getAllByRole('button', { name: '다시 시도' })[1]!);
    expect(canvas.getByText('더 불러오기: 2')).toBeVisible();

    const loadingMoreButton = canvas.getByRole('button', { name: '불러오는 중' });
    expect(loadingMoreButton).toBeDisabled();
    expect(loadingMoreButton).toHaveAttribute('aria-busy', 'true');
  },
  render: () => <ReactionProfileListCatalog />,
};
