import { useState } from 'react';
import { Text } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, userEvent, within } from 'storybook/test';
import { ReactionProfileList } from '@/components/reaction/ReactionProfileList';
import { ReactionSelector } from '@/components/reaction/ReactionSelector';
import { ReactionSummary } from '@/components/reaction/ReactionSummary';
import { profile } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactionOption, ReactionToggleIntent } from '@/components/reaction/ReactionSelector';
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
        <ReactionSummary entries={tiedEntries} loading onSelectType={setSelectedType} />
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
    expect(canvas.getAllByText('아직 반응이 없어요')).toHaveLength(2);
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
    expect(canvas.getAllByText(profileCopy.emptyTitle)).toHaveLength(2);
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
    expect(pendingOverlay!.getBoundingClientRect().width).toBe(44);
    expect(pendingOverlay!.getBoundingClientRect().height).toBe(44);
    const spinner = pendingOverlay!.querySelector('[data-testid="reaction-pending-spinner"]');
    expect(spinner).not.toBeNull();
    expect(getComputedStyle(spinner!).width).toBe('24px');
    expect(getComputedStyle(spinner!).height).toBe('24px');

    const arcSegments = spinner!.querySelectorAll('path');
    expect(arcSegments).toHaveLength(18);
    expect(arcSegments[0]).toHaveAttribute('stroke-opacity', '0');
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
