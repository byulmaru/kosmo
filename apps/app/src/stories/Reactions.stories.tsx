import { useState } from 'react';
import { Button, Text } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, screen, spyOn, userEvent, within } from 'storybook/test';
import { usePostReactionController } from '@/components/post/PostReactionController';
import { PostReactionSummary } from '@/components/reaction/PostReactionSummary';
import { ReactionProfileConnection } from '@/components/reaction/ReactionProfileConnection';
import { ReactionProfileList } from '@/components/reaction/ReactionProfileList';
import { ReactionSelector } from '@/components/reaction/ReactionSelector';
import { ReactionSummary } from '@/components/reaction/ReactionSummary';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { colors } from '@/theme/tokens';
import { profile } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactionOption, ReactionToggleIntent } from '@/components/reaction/ReactionSelector';
import type { ReactionProfileConnectionStoriesQuery } from './__generated__/ReactionProfileConnectionStoriesQuery.graphql';
import type { ReactionsIntegrationStoriesQuery } from './__generated__/ReactionsIntegrationStoriesQuery.graphql';
import type { ReactionsStoriesQuery as ReactionsStoriesQueryType } from './__generated__/ReactionsStoriesQuery.graphql';

const tiedEntries = [
  { count: 3, type: '🎉' },
  { count: 3, type: '❤️' },
  { count: 1, type: '👀' },
] as const;

const viewportEntries = [
  { count: 12, type: '🥹' },
  { count: 11, type: '❤️' },
  { count: 10, type: '🎉' },
  { count: 9, type: '👀' },
  { count: 8, type: '☘️' },
  { count: 7, type: '🌈' },
  { count: 6, type: '😆' },
  { count: 5, type: '🚀' },
] as const;

const profileCopy = {
  emptyDescription: '이 반응을 남긴 프로필이 생기면 여기에 표시돼요.',
  emptyTitle: '아직 이 반응을 남긴 프로필이 없어요',
  errorDescription: '잠시 후 다시 시도해주세요.',
  errorTitle: '반응한 프로필을 불러오지 못했어요',
  loadErrorTitle: '반응한 프로필을 더 불러오지 못했어요',
  loadingTitle: '반응한 프로필을 불러오는 중입니다.',
} as const;

const quickReactionOptions = [
  { emoji: '🥹', id: '🥹', label: '🥹' },
  { emoji: '❤️', id: '❤️', label: '❤️' },
  { emoji: '🎉', id: '🎉', label: '🎉' },
  { emoji: '👀', id: '👀', label: '👀' },
  { emoji: '☘️', id: '☘️', label: '☘️' },
  { emoji: '🌈', id: '🌈', label: '🌈' },
] satisfies ReadonlyArray<ReactionOption>;

const storyProfiles = [
  profile({
    avatar: {
      id: 'reaction-profile-starlight-avatar',
      url: '/reaction-profile-starlight-avatar.png',
    },
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

const reactionPostWithProfiles = {
  __typename: 'Post' as const,
  id: 'reaction-post',
  reactionProfiles: {
    edges: storyProfiles.map((node, index) => ({
      cursor: `reaction-profile-cursor-${index + 1}`,
      node,
    })),
    pageInfo: { endCursor: 'reaction-profile-cursor-2', hasNextPage: true },
  },
};

const reactionPostSummary = {
  __typename: 'Post' as const,
  id: 'reaction-post',
  reactionCounts: [
    { count: 12, type: '❤️' },
    { count: 7, type: '🎉' },
  ],
  viewerReactions: [],
};

const reactionPostSummaryAllTypes = {
  ...reactionPostSummary,
  reactionCounts: [
    { count: 12, type: '🥹' },
    { count: 11, type: '❤️' },
    { count: 10, type: '🎉' },
    { count: 9, type: '👀' },
    { count: 8, type: '☘️' },
    { count: 7, type: '🌈' },
  ],
};

function reactionPostWithProfile(displayName: string, id: string) {
  return {
    __typename: 'Post' as const,
    id: 'reaction-post',
    reactionProfiles: {
      edges: [
        {
          cursor: `${id}-cursor`,
          node: profile({ displayName, id, relativeHandle: `@${id}` }),
        },
      ],
      pageInfo: { endCursor: `${id}-cursor`, hasNextPage: false },
    },
  };
}

const reactionPostWithActorAProfiles = reactionPostWithProfile(
  'Actor A Profile',
  'reaction-profile-actor-a',
);
const reactionPostWithActorBProfiles = reactionPostWithProfile(
  'Actor B Profile',
  'reaction-profile-actor-b',
);
const reactionPostWithRefreshedProfiles = reactionPostWithProfile(
  'Refreshed Profile',
  'reaction-profile-refreshed',
);
const reactionPostWithHeartTypeProfiles = reactionPostWithProfile(
  'Heart Type Profile',
  'reaction-profile-heart-type',
);
const reactionPostWithPartyTypeProfiles = reactionPostWithProfile(
  'Party Type Profile',
  'reaction-profile-party-type',
);

const reactionProfilesNextPage = {
  node: {
    ...reactionPostWithProfiles,
    reactionProfiles: {
      edges: [
        {
          cursor: 'reaction-profile-cursor-3',
          node: profile({
            displayName: '혜성 반응 프로필',
            id: 'reaction-profile-comet',
            relativeHandle: '@comet',
          }),
        },
      ],
      pageInfo: { endCursor: 'reaction-profile-cursor-3', hasNextPage: false },
    },
  },
};

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

const ReactionProfileConnectionStoriesQueryNode = graphql`
  query ReactionProfileConnectionStoriesQuery($reactionType: String!) {
    node(id: "reaction-post") {
      __typename
      ... on Post {
        ...ReactionProfileConnection_post
          @arguments(reactionType: $reactionType)
          @alias(as: "reactionProfileConnection")
      }
    }
  }
`;

const ReactionsIntegrationStoriesQueryNode = graphql`
  query ReactionsIntegrationStoriesQuery($postId: ID!) {
    node(id: $postId) {
      __typename
      ... on Post {
        ...PostReactionController_post @alias(as: "reactionController")
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

function ReactionProfileConnectionStory() {
  const data = useLazyLoadQuery<ReactionProfileConnectionStoriesQuery>(
    ReactionProfileConnectionStoriesQueryNode,
    { reactionType: '❤️' },
  );
  if (data.node?.__typename !== 'Post' || !data.node.reactionProfileConnection) {
    throw new Error('Missing Reaction Profile connection Post fixture.');
  }
  return <ReactionProfileConnection post={data.node.reactionProfileConnection} reactionType="❤️" />;
}

function PostReactionSummaryStory({ postId = 'reaction-post' }: { postId?: string }) {
  const data = useLazyLoadQuery<ReactionsIntegrationStoriesQuery>(
    ReactionsIntegrationStoriesQueryNode,
    { postId },
  );
  if (data.node?.__typename !== 'Post' || !data.node.reactionController) {
    throw new Error('Missing Reaction controller Post fixture.');
  }
  const controller = usePostReactionController(data.node.reactionController);

  return <PostReactionSummary controller={controller} />;
}

function ActorSwitchPostReactionSummaryStory() {
  const { resetActor } = useRelayActor();

  return (
    <>
      <Button onPress={() => resetActor('reaction-actor-b')} title="프로필 전환" />
      <PostReactionSummaryStory />
    </>
  );
}

function ReactionSummaryCatalog() {
  const [lastIntent, setLastIntent] = useState('없음');
  const [moreCount, setMoreCount] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  return (
    <Catalog>
      <Section title="Loading">
        <ReactionSummary loading />
      </Section>
      <Section title="Error">
        <ReactionSummary error loading onRetry={() => setRetryCount((count) => count + 1)} />
        <Text>{`재시도: ${retryCount}`}</Text>
      </Section>
      <Section title="Idle without data">
        <ReactionSummary loading={false} />
      </Section>
      <Section title="Empty">
        <ReactionSummary entries={[]} loading />
      </Section>
      <Section title="Populated">
        <ReactionSummary
          entries={tiedEntries}
          errorTypeIds={['👀']}
          loading
          onMore={() => setMoreCount((count) => count + 1)}
          onToggle={({ nextSelected, optionId }) =>
            setLastIntent(`${optionId}:${nextSelected ? '선택' : '해제'}`)
          }
          pendingTypeIds={['🎉']}
          selectedTypeIds={['❤️', '🎉']}
        />
        <Text>{`마지막 동작: ${lastIntent}`}</Text>
        <Text>{`More 열기: ${moreCount}`}</Text>
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
        <ReactionProfileList loading reactionType="❤️" />
      </Section>
      <Section title="Initial error and retry">
        <ReactionProfileList
          error
          loading
          onRetry={() => setInitialRetryCount((count) => count + 1)}
          reactionType="❤️"
        />
        <Text>{`초기 재시도: ${initialRetryCount}`}</Text>
      </Section>
      <Section title="Idle without data">
        <ReactionProfileList loading={false} reactionType="❤️" />
      </Section>
      <Section title="Empty">
        <ReactionProfileList items={[]} loading reactionType="❤️" />
      </Section>
      <Section title="Populated">
        <ReactionProfileList items={items} loading reactionType="❤️" />
      </Section>
      <Section title="Single profile">
        <ReactionProfileList items={items.slice(0, 1)} reactionType="❤️" />
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

function QuickPickerInteractionCatalog() {
  const [selectedOptionIds, setSelectedOptionIds] = useState<ReadonlyArray<string>>(['❤️', '👀']);
  const [lastIntent, setLastIntent] = useState('없음');

  function handleToggle({ nextSelected, optionId }: ReactionToggleIntent) {
    setSelectedOptionIds((current) =>
      nextSelected ? [...current, optionId] : current.filter((id) => id !== optionId),
    );
    setLastIntent(`${optionId}:${nextSelected ? '선택' : '해제'}`);
  }

  const selectedInOptionOrder = quickReactionOptions
    .filter((option) => selectedOptionIds.includes(option.id))
    .map((option) => option.emoji)
    .join(' ');

  return (
    <Catalog width={360}>
      <Section title="Interactive Quick Picker">
        <ReactionSelector
          onToggle={handleToggle}
          options={quickReactionOptions}
          selectedOptionIds={selectedOptionIds}
        />
        <Text>{`선택: ${selectedInOptionOrder || '없음'}`}</Text>
        <Text>{`마지막 동작: ${lastIntent}`}</Text>
      </Section>
    </Catalog>
  );
}

function QuickPickerStateCatalog() {
  const [blockedToggleCount, setBlockedToggleCount] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  return (
    <Catalog width={360}>
      <Section title="Pending">
        <ReactionSelector
          onToggle={() => setBlockedToggleCount((count) => count + 1)}
          options={quickReactionOptions}
          pendingOptionIds={['❤️']}
          selectedOptionIds={['❤️', '👀']}
        />
      </Section>
      <Section title="Error Retry">
        <ReactionSelector
          errorOptionIds={['🎉']}
          onToggle={({ optionId }) => {
            if (optionId === '🎉') {
              setRetryCount((count) => count + 1);
            }
          }}
          options={quickReactionOptions}
          selectedOptionIds={['🎉']}
        />
        <Text>{`재시도: ${retryCount}`}</Text>
      </Section>
      <Section title="Disabled">
        <ReactionSelector
          disabled
          onToggle={() => setBlockedToggleCount((count) => count + 1)}
          options={quickReactionOptions}
        />
      </Section>
      <Text>{`차단된 동작: ${blockedToggleCount}`}</Text>
    </Catalog>
  );
}

function QuickPickerViewportCatalog({ title }: { title: string }) {
  return (
    <Catalog>
      <Section title={title}>
        <ReactionSelector
          onToggle={() => {}}
          options={quickReactionOptions}
          selectedOptionIds={['❤️', '👀']}
        />
        <ReactionSummary entries={viewportEntries} onMore={() => {}} onToggle={() => {}} />
      </Section>
    </Catalog>
  );
}

async function assertReactionViewport(
  canvasElement: HTMLElement,
  expectedWidth: number,
  expectedOverflow: boolean,
) {
  const canvas = within(canvasElement);
  const pickerButtons = quickReactionOptions.map((option) =>
    canvas.getByRole('button', { name: `${option.label} 반응` }),
  );
  const summaryButtons = viewportEntries.map((entry) =>
    canvas.getByRole('button', { name: `${entry.type} 반응 ${entry.count}개` }),
  );
  const more = canvas.getByRole('button', { name: '반응한 프로필 보기' });
  const summaryScroll = canvas.getByTestId('reaction-summary-scroll');
  const buttons = [...pickerButtons, ...summaryButtons, more];
  const picker = buttons[0]!.parentElement!;
  const canvasRect = canvasElement.getBoundingClientRect();
  const pickerRect = picker.getBoundingClientRect();

  expect(canvasElement.ownerDocument.documentElement.clientWidth).toBe(expectedWidth);
  for (const button of buttons) {
    expect(button.getBoundingClientRect().height).toBe(32);
  }
  expect(pickerButtons.every((button) => button.getBoundingClientRect().width === 32)).toBe(true);
  expect(more.getBoundingClientRect().width).toBe(32);
  expect(
    summaryButtons.every(
      (button) =>
        button.getBoundingClientRect().top === summaryButtons[0]!.getBoundingClientRect().top,
    ),
  ).toBe(true);
  expect(more.getBoundingClientRect().top).toBe(summaryButtons[0]!.getBoundingClientRect().top);
  expect(picker.scrollWidth).toBeLessThanOrEqual(picker.clientWidth);
  expect(pickerRect.left).toBeGreaterThanOrEqual(canvasRect.left);
  expect(pickerRect.right).toBeLessThanOrEqual(canvasRect.right);
  expect(summaryScroll.scrollWidth > summaryScroll.clientWidth).toBe(expectedOverflow);
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

    expect(canvas.queryByRole('heading', { name: '반응' })).not.toBeInTheDocument();
    expect(canvas.getByText('반응 요약을 불러오는 중입니다.')).toBeVisible();
    expect(
      canvas.getByRole('progressbar', { name: '반응 요약을 불러오는 중입니다.' }),
    ).toBeVisible();
    expect(canvas.getByRole('alert')).toHaveTextContent('반응을 불러오지 못했어요');
    expect(canvas.getAllByText('아직 반응이 없어요')).toHaveLength(2);
    const party = canvas.getByRole('button', { name: '🎉 반응 3개, 처리 중' });
    const heart = canvas.getByRole('button', { name: '❤️ 반응 3개' });
    const eyes = canvas.getByRole('button', { name: '👀 반응 1개, 오류, 다시 시도' });
    const more = canvas.getByRole('button', { name: '반응한 프로필 보기' });

    expect([party.textContent, heart.textContent, eyes.textContent]).toEqual(['🎉3', '❤️3', '👀1']);
    expect(heart.getBoundingClientRect().height).toBe(32);
    expect(getComputedStyle(heart).gap).toBe('4px');
    expect(getComputedStyle(heart).paddingInline).toBe('8px');
    expect(getComputedStyle(heart).borderRadius).toBe('12px');
    expect(getComputedStyle(within(heart).getByText('❤️')).fontSize).toBe('20px');
    expect(getComputedStyle(within(heart).getByText('3')).fontSize).toBe('14px');
    const selectedBackground = heart.querySelector(
      '[data-testid="reaction-summary-selected-background"]',
    );
    expect(selectedBackground).not.toBeNull();
    expect(selectedBackground).toHaveStyle({ backgroundColor: colors.light.primary, opacity: 0.7 });
    expect(getComputedStyle(selectedBackground!).borderRadius).toBe('12px');
    expect(heart).toHaveAttribute('aria-pressed', 'true');
    expect(party).toHaveAttribute('aria-pressed', 'true');
    expect(
      party.querySelector('[data-testid="reaction-summary-selected-background"]'),
    ).not.toBeNull();
    expect(getComputedStyle(party).opacity).toBe('1');
    expect(party).toHaveAttribute('aria-busy', 'true');
    expect(party).toBeDisabled();
    expect(eyes).toBeEnabled();
    expect(more.getBoundingClientRect().width).toBe(32);
    expect(getComputedStyle(more).borderRadius).toBe('12px');

    await userEvent.click(heart);
    expect(canvas.getByText('마지막 동작: ❤️:해제')).toBeVisible();
    await userEvent.click(more);
    expect(canvas.getByText('More 열기: 1')).toBeVisible();

    await userEvent.click(canvas.getAllByRole('button', { name: '다시 시도' })[0]!);
    expect(canvas.getByText('재시도: 1')).toBeVisible();
  },
};

export const ProfileListStates: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const populatedSection = within(canvas.getByText('Populated').parentElement!);
    const singleProfileSection = within(canvas.getByText('Single profile').parentElement!);

    expect(canvas.getByText(profileCopy.loadingTitle)).toBeVisible();
    expect(canvas.getByRole('progressbar', { name: profileCopy.loadingTitle })).toBeVisible();
    expect(canvas.getAllByText(profileCopy.errorTitle)).toHaveLength(1);
    expect(canvas.getAllByText(profileCopy.emptyTitle)).toHaveLength(2);
    expect(canvasElement.querySelector('a[href="/@starlight"]')).toBeInTheDocument();
    expect(canvasElement.querySelector('a[href="/@milky-way"]')).toBeInTheDocument();
    const imageAvatar = populatedSection.getByLabelText('별빛 반응 프로필 프로필 이미지');
    const fallbackAvatar = populatedSection.getByLabelText('은하수 반응 프로필 프로필 이미지');
    expect(imageAvatar.querySelector('img')).toHaveAttribute(
      'src',
      '/reaction-profile-starlight-avatar.png',
    );
    expect(fallbackAvatar.querySelector('img')?.getAttribute('src')).toMatch(
      /\/assets\/avatar\/default-avatar\.png$/,
    );
    expect(canvas.getAllByText('❤️')).toHaveLength(9);
    const populatedRows = populatedSection
      .getAllByLabelText('❤️ 반응')
      .map((reaction) => reaction.parentElement!);
    const singleProfileRow = singleProfileSection.getByLabelText('❤️ 반응').parentElement!;
    expect(getComputedStyle(populatedRows[0]!).borderBottomWidth).toBe('1px');
    expect(getComputedStyle(populatedRows[1]!).borderBottomWidth).toBe('0px');
    expect(getComputedStyle(singleProfileRow).borderBottomWidth).toBe('0px');

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

export const ProfilePaginationFailurePreservesRows: Story = {
  parameters: {
    relay: {
      data: { node: reactionPostWithProfiles },
      paginationResponses: [
        { error: '다음 Reaction Profile page 조회 실패' },
        { data: reactionProfilesNextPage },
      ],
    },
  },
  render: () => <ReactionProfileConnectionStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getAllByRole('link')).toHaveLength(2);
    await userEvent.click(canvas.getByRole('button', { name: '더 불러오기' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '반응한 프로필을 더 불러오지 못했어요',
    );
    expect(canvas.getAllByRole('link')).toHaveLength(2);
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    await expect(canvas.findAllByRole('link')).resolves.toHaveLength(3);
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

export const ZeroCountSummaryIsNotRendered: Story = {
  parameters: {
    relay: {
      operationResponses: {
        ReactionsIntegrationStoriesQuery: {
          data: {
            node: {
              __typename: 'Post',
              id: 'post-empty',
              reactionCounts: [],
              viewerReactions: [],
            },
          },
        },
      },
    },
  },
  render: () => <PostReactionSummaryStory postId="post-empty" />,
  play: ({ canvasElement }) => {
    expect(within(canvasElement).queryByRole('heading', { name: '반응' })).not.toBeInTheDocument();
  },
};

export const SummaryOrderAndModalDismiss: Story = {
  parameters: {
    relay: {
      operationResponses: {
        ReactionsIntegrationStoriesQuery: { data: { node: reactionPostSummary } },
        ReactionProfilesModalQuery: { data: { node: reactionPostWithProfiles } },
      },
    },
  },
  render: () => <PostReactionSummaryStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getAllByRole('button').map((button) => button.textContent)).toEqual([
      '❤️12',
      '🎉7',
      '…',
    ]);

    expect(canvas.getByRole('button', { name: '❤️ 반응 12개' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: '반응한 프로필 보기' }));
    const dialog = await screen.findByRole('dialog', { name: '반응한 프로필' });
    expect(dialog).toBeInTheDocument();
    await expect(within(dialog).findByText('별빛 반응 프로필')).resolves.toBeVisible();
    expect(within(dialog).getByRole('heading', { name: '반응한 사람' })).toBeVisible();
    const selectedTab = screen.getByRole('tab', { name: '❤️ 반응 12개' });
    expect(selectedTab).toHaveAttribute('aria-selected', 'true');
    expect(getComputedStyle(selectedTab).justifyContent).toBe('center');
    expect(screen.getByRole('tab', { name: '🎉 반응 7개' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    await userEvent.click(screen.getByLabelText('반응한 프로필 닫기'));
    expect(screen.queryByRole('dialog', { name: '반응한 프로필' })).not.toBeInTheDocument();
  },
};

export const ProfileTabsViewport320: Story = {
  globals: { viewport: { isRotated: false, value: 'reactionProfilesNarrow' } },
  parameters: {
    layout: 'fullscreen',
    relay: {
      operationResponses: {
        ReactionsIntegrationStoriesQuery: { data: { node: reactionPostSummaryAllTypes } },
        ReactionProfilesModalQuery: { data: { node: reactionPostWithProfiles } },
      },
    },
    viewport: {
      options: {
        reactionProfilesNarrow: {
          name: 'Reaction profiles narrow',
          styles: { height: '640px', width: '320px' },
          type: 'mobile',
        },
      },
    },
  },
  render: () => <PostReactionSummaryStory />,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: '반응한 프로필 보기' }),
    );
    const tabList = await screen.findByRole('tablist');
    const tabs = within(tabList).getAllByRole('tab');

    expect(tabs).toHaveLength(6);
    expect(tabList.scrollWidth).toBeGreaterThan(tabList.clientWidth);
    expect(getComputedStyle(tabList).overflowX).toBe('auto');
    await userEvent.click(tabs[5]!);
    expect(tabs[5]).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByLabelText('반응한 프로필 닫기'));
  },
};

export const InitialProfileQueryFailureIsInline: Story = {
  beforeEach: () => {
    const originalError = console.error;
    const errorSpy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      const isExpectedRouteError = args.some((argument) =>
        argument instanceof Error
          ? argument.message === 'Reaction Profile 최초 조회 실패'
          : typeof argument === 'string' && argument.includes('Reaction Profile 최초 조회 실패'),
      );

      if (!isExpectedRouteError) {
        originalError(...args);
      }
    });

    return () => errorSpy.mockRestore();
  },
  parameters: {
    relay: {
      operationResponses: {
        ReactionsIntegrationStoriesQuery: { data: { node: reactionPostSummary } },
        ReactionProfilesModalQuery: {
          sequence: [
            { error: 'Reaction Profile 최초 조회 실패' },
            { data: { node: reactionPostWithProfiles } },
          ],
        },
      },
    },
  },
  render: () => <PostReactionSummaryStory />,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: '반응한 프로필 보기' }),
    );
    await expect(screen.findByRole('alert')).resolves.toHaveTextContent(
      '반응한 프로필을 불러오지 못했어요',
    );
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await expect(screen.findByText('별빛 반응 프로필')).resolves.toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('반응한 프로필 닫기'));
  },
};

export const ReopenShowsCacheBeforeBackgroundRefresh: Story = {
  parameters: {
    relay: {
      operationResponses: {
        ReactionsIntegrationStoriesQuery: { data: { node: reactionPostSummary } },
        ReactionProfilesModalQuery: {
          sequence: [
            { data: { node: reactionPostWithActorAProfiles } },
            { data: { node: reactionPostWithRefreshedProfiles }, delayMs: 150 },
          ],
        },
      },
    },
  },
  render: () => <PostReactionSummaryStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const summaryButton = canvas.getByRole('button', { name: '반응한 프로필 보기' });

    await userEvent.click(summaryButton);
    await expect(screen.findByText('Actor A Profile')).resolves.toBeVisible();
    await userEvent.click(screen.getByLabelText('반응한 프로필 닫기'));
    await userEvent.click(summaryButton);
    expect(screen.getByText('Actor A Profile')).toBeInTheDocument();
    await expect(screen.findByText('Refreshed Profile')).resolves.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('반응한 프로필 닫기'));
  },
};

export const SwitchingReactionTypeDoesNotReuseProfileRows: Story = {
  parameters: {
    relay: {
      operationResponses: {
        ReactionsIntegrationStoriesQuery: { data: { node: reactionPostSummary } },
        ReactionProfilesModalQuery: {
          sequence: [
            { data: { node: reactionPostWithHeartTypeProfiles } },
            { data: { node: reactionPostWithPartyTypeProfiles }, delayMs: 150 },
          ],
        },
      },
    },
  },
  render: () => <PostReactionSummaryStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: '반응한 프로필 보기' }));
    await expect(screen.findByText('Heart Type Profile')).resolves.toBeVisible();
    await userEvent.click(screen.getByRole('tab', { name: '🎉 반응 7개' }));
    expect(screen.queryByText('Heart Type Profile')).not.toBeInTheDocument();
    await expect(screen.findByText('Party Type Profile')).resolves.toBeVisible();
    expect(screen.queryByText('Heart Type Profile')).not.toBeInTheDocument();
    expect(screen.getByLabelText('🎉 반응')).toBeVisible();
    await userEvent.click(screen.getByLabelText('반응한 프로필 닫기'));
  },
};

export const ActorSwitchDoesNotReuseProfileRows: Story = {
  parameters: {
    relay: {
      operationResponses: {
        ReactionsIntegrationStoriesQuery: [
          { data: { node: reactionPostSummary } },
          { data: { node: reactionPostSummary } },
        ],
        ReactionProfilesModalQuery: [
          { data: { node: reactionPostWithActorAProfiles } },
          { data: { node: reactionPostWithActorBProfiles } },
        ],
      },
    },
  },
  render: () => <ActorSwitchPostReactionSummaryStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: '반응한 프로필 보기' }));
    await expect(screen.findByText('Actor A Profile')).resolves.toBeVisible();
    await userEvent.click(screen.getByLabelText('반응한 프로필 닫기'));
    await userEvent.click(canvas.getByRole('button', { name: '프로필 전환' }));
    await userEvent.click(await canvas.findByRole('button', { name: '반응한 프로필 보기' }));
    await expect(screen.findByText('Actor B Profile')).resolves.toBeVisible();
    expect(screen.queryByText('Actor A Profile')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('반응한 프로필 닫기'));
  },
};

export const QuickPickerInteraction: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const buttons = canvas.getAllByRole('button');

    expect(buttons.map((button) => button.textContent)).toEqual([
      '🥹',
      '❤️',
      '🎉',
      '👀',
      '☘️',
      '🌈',
    ]);

    const firstOptionStyle = getComputedStyle(buttons[0]!);
    const pickerStyle = getComputedStyle(buttons[0]!.parentElement!);

    expect(buttons.every((button) => button.getBoundingClientRect().width === 32)).toBe(true);
    expect(buttons.every((button) => button.getBoundingClientRect().height === 32)).toBe(true);
    expect(firstOptionStyle.borderTopWidth).toBe('0px');
    expect(firstOptionStyle.borderRadius).toBe('12px');
    expect(pickerStyle.borderTopWidth).toBe('1px');
    expect(pickerStyle.borderRadius).toBe('16px');

    const heart = canvas.getByRole('button', { name: '❤️ 반응' });
    const party = canvas.getByRole('button', { name: '🎉 반응' });
    const eyes = canvas.getByRole('button', { name: '👀 반응' });
    const heartBackground = heart.querySelector('[data-testid="reaction-selected-background"]');
    const heartEmoji = heart.querySelector('[data-testid="reaction-emoji"]');

    expect(heartBackground).not.toBeNull();
    expect(getComputedStyle(heartBackground!).opacity).toBe('0.7');
    expect(heartEmoji).not.toBeNull();
    expect(getComputedStyle(heartEmoji!).opacity).toBe('1');
    expect(getComputedStyle(heartEmoji!).fontSize).toBe('20px');
    expect(party.querySelector('[data-testid="reaction-selected-background"]')).toBeNull();

    expect(heart).toHaveAttribute('aria-pressed', 'true');
    expect(eyes).toHaveAttribute('aria-pressed', 'true');
    expect(party).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(heart);
    expect(heart).toHaveAttribute('aria-pressed', 'false');
    expect(eyes).toHaveAttribute('aria-pressed', 'true');
    expect(canvas.getByText('마지막 동작: ❤️:해제')).toBeVisible();

    await userEvent.click(party);
    expect(party).toHaveAttribute('aria-pressed', 'true');
    expect(eyes).toHaveAttribute('aria-pressed', 'true');
    expect(canvas.getByText('선택: 🎉 👀')).toBeVisible();
    expect(canvas.getByText('마지막 동작: 🎉:선택')).toBeVisible();
  },
  render: () => <QuickPickerInteractionCatalog />,
};

export const QuickPickerStates: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pendingSection = within(canvas.getByText('Pending').parentElement!);
    const errorSection = within(canvas.getByText('Error Retry').parentElement!);
    const disabledSection = within(canvas.getByText('Disabled').parentElement!);

    const pendingHeart = pendingSection.getByRole('button', {
      name: '❤️ 반응, 처리 중',
    });
    expect(pendingHeart).toBeDisabled();
    expect(pendingHeart).toHaveAttribute('aria-busy', 'true');
    expect(pendingHeart).toHaveAttribute('aria-pressed', 'true');
    expect(pendingHeart).toHaveTextContent('❤️');
    const pendingOverlay = pendingHeart.querySelector('[aria-hidden="true"]');
    expect(pendingOverlay).not.toBeNull();
    expect(pendingOverlay!.getBoundingClientRect().width).toBe(32);
    expect(pendingOverlay!.getBoundingClientRect().height).toBe(32);
    const spinner = pendingOverlay!.querySelector('[data-testid="reaction-pending-spinner"]');
    expect(spinner).not.toBeNull();
    expect(getComputedStyle(spinner!).width).toBe('16px');
    expect(getComputedStyle(spinner!).height).toBe('16px');

    const arcSegments = spinner!.querySelectorAll('path');
    expect(arcSegments).toHaveLength(18);
    expect(arcSegments[0]).toHaveAttribute('stroke-opacity', '0');
    expect(arcSegments[0]).toHaveAttribute('stroke-width', '2');
    expect(arcSegments[17]).toHaveAttribute('stroke-opacity', '1');
    expect(spinner!.querySelector('circle')).toBeNull();
    expect(pendingSection.getByRole('button', { name: '👀 반응' })).toBeEnabled();
    await userEvent.click(pendingHeart, { pointerEventsCheck: 0 });
    expect(canvas.getByText('차단된 동작: 0')).toBeVisible();

    const errorParty = errorSection.getByRole('button', {
      name: '🎉 반응, 오류, 다시 시도',
    });
    expect(errorParty).toBeEnabled();
    expect(errorParty).toHaveAttribute('aria-pressed', 'true');
    expect(getComputedStyle(errorParty).borderTopWidth).toBe('0px');
    await userEvent.click(errorParty);
    expect(canvas.getByText('재시도: 1')).toBeVisible();

    expect(disabledSection.queryAllByRole('button')).toHaveLength(0);
    expect(canvas.getByText('차단된 동작: 0')).toBeVisible();
  },
  render: () => <QuickPickerStateCatalog />,
};

export const ReactionViewport320: Story = {
  globals: { viewport: { isRotated: false, value: 'reactionSummaryNarrow' } },
  parameters: {
    layout: 'fullscreen',
    viewport: {
      options: {
        reactionSummaryNarrow: {
          name: 'Reaction summary narrow',
          styles: { height: '640px', width: '320px' },
          type: 'mobile',
        },
      },
    },
  },
  play: ({ canvasElement }) => assertReactionViewport(canvasElement, 320, true),
  render: () => <QuickPickerViewportCatalog title="Reactions at 320px" />,
};

export const ReactionViewport390: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: ({ canvasElement }) => assertReactionViewport(canvasElement, 390, true),
  render: () => <QuickPickerViewportCatalog title="Reactions at 390px" />,
};

export const ReactionViewport600: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoPickerWide' } },
  play: ({ canvasElement }) => assertReactionViewport(canvasElement, 600, false),
  render: () => <QuickPickerViewportCatalog title="Reactions at 600px" />,
};
