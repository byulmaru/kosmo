import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  HashtagRelatedProfileList,
  HashtagRelatedProfileListState,
} from '@/components/profile/HashtagRelatedProfileList';
import { profile } from '../fixtures';
import { Catalog, Section } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { HashtagRelatedProfilesStoriesQuery as HashtagRelatedProfilesStoriesQueryType } from '../__generated__/HashtagRelatedProfilesStoriesQuery.graphql';

const relatedA = profile({
  displayName: '별빛 여행자',
  handle: 'starlight',
  id: 'hashtag-related-profile-a',
  relativeHandle: '@starlight',
});
const relatedB = profile({
  displayName: '은하 기록자',
  handle: 'galaxy',
  id: 'hashtag-related-profile-b',
  relativeHandle: '@galaxy',
});
const relatedC = profile({
  displayName: '우주 관찰자',
  handle: 'observer',
  id: 'hashtag-related-profile-c',
  relativeHandle: '@observer',
});

function relatedProfilesConnection(
  profiles: ReadonlyArray<ReturnType<typeof profile>>,
  hasNextPage = false,
) {
  return {
    __typename: 'ProfileConnection' as const,
    edges: profiles.map((node, index) => ({
      cursor: `hashtag-related-cursor-${index}`,
      node,
    })),
    pageInfo: {
      endCursor: profiles.length ? `hashtag-related-cursor-${profiles.length - 1}` : null,
      hasNextPage,
      hasPreviousPage: false,
      startCursor: profiles.length ? 'hashtag-related-cursor-0' : null,
    },
  };
}

function hashtag({
  hasNextPage = false,
  id,
  name,
  profiles,
}: {
  hasNextPage?: boolean;
  id: string;
  name: string;
  profiles: ReadonlyArray<ReturnType<typeof profile>>;
}) {
  return {
    __typename: 'Hashtag' as const,
    id,
    name,
    relatedProfiles: relatedProfilesConnection(profiles, hasNextPage),
  };
}

const emptyHashtag = hashtag({
  id: 'hashtag-related-empty',
  name: '빈태그',
  profiles: [],
});
const contentHashtag = hashtag({
  id: 'hashtag-related-content',
  name: 'Fediverse',
  profiles: [relatedA, relatedB],
});
const paginationHashtag = hashtag({
  hasNextPage: true,
  id: 'hashtag-related-pagination',
  name: 'Fediverse',
  profiles: [relatedA],
});
const storyHashtags = [emptyHashtag, contentHashtag, paginationHashtag];
const paginationNextPage = {
  node: {
    __typename: 'Hashtag' as const,
    id: paginationHashtag.id,
    name: paginationHashtag.name,
    relatedProfiles: {
      ...relatedProfilesConnection([relatedC]),
      edges: [{ cursor: 'hashtag-related-cursor-next', node: relatedC }],
      pageInfo: {
        endCursor: 'hashtag-related-cursor-next',
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: 'hashtag-related-cursor-next',
      },
    },
  },
};
const initialRetry = fn();
const paginationRequestObserver = fn();

const HashtagRelatedProfilesStoriesQuery = graphql`
  query HashtagRelatedProfilesStoriesQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Hashtag {
        id
        ...HashtagRelatedProfileList_hashtag @alias(as: "relatedProfileList")
      }
    }
  }
`;

type HashtagNode = Extract<
  NonNullable<HashtagRelatedProfilesStoriesQueryType['response']['nodes'][number]>,
  { readonly __typename: 'Hashtag' }
>;

function useStoryHashtags(): ReadonlyArray<HashtagNode> {
  const data = useLazyLoadQuery<HashtagRelatedProfilesStoriesQueryType>(
    HashtagRelatedProfilesStoriesQuery,
    { ids: storyHashtags.map(({ id }) => id) },
  );

  return data.nodes.map((node) => {
    if (node?.__typename !== 'Hashtag' || !node.relatedProfileList) {
      throw new Error(
        'HashtagRelatedProfilesStoriesQuery must return Hashtag fragments in fixture order.',
      );
    }
    return node;
  });
}

function requireHashtag(hashtagNodes: ReadonlyArray<HashtagNode>, index: number) {
  const node = hashtagNodes[index];
  if (!node?.relatedProfileList) {
    throw new Error(`Missing related Profile Hashtag fixture at index ${index}.`);
  }
  return node.relatedProfileList;
}

function HashtagRelatedProfilesCatalog() {
  const hashtags = useStoryHashtags();

  return (
    <Catalog>
      <Section title="Loading">
        <HashtagRelatedProfileListState state="loading" />
      </Section>
      <Section title="Initial error and retry">
        <HashtagRelatedProfileListState onRetry={initialRetry} state="error" />
      </Section>
      <Section title="Not found">
        <HashtagRelatedProfileListState state="notFound" />
      </Section>
      <Section title="Empty">
        <HashtagRelatedProfileList hashtag={requireHashtag(hashtags, 0)} />
      </Section>
      <Section title="Content and terminal page">
        <HashtagRelatedProfileList hashtag={requireHashtag(hashtags, 1)} />
      </Section>
    </Catalog>
  );
}

function PaginationList() {
  return <HashtagRelatedProfileList hashtag={requireHashtag(useStoryHashtags(), 2)} />;
}

const meta = {
  beforeEach: () => {
    initialRetry.mockClear();
    paginationRequestObserver.mockClear();
  },
  component: HashtagRelatedProfilesCatalog,
  parameters: {
    relay: { data: { nodes: storyHashtags } },
    router: { pathname: '/hashtags/hashtag-related-content/profiles' },
  },
  title: 'KOSMO/Screens/Hashtag Related Profiles',
} satisfies Meta<typeof HashtagRelatedProfilesCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StatesAndContent: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getAllByRole('heading', { name: '관련 프로필' })).toHaveLength(3);
    expect(canvas.getByRole('heading', { name: '#빈태그 관련 프로필' })).toBeVisible();
    expect(canvas.getByRole('heading', { name: '#Fediverse 관련 프로필' })).toBeVisible();
    expect(canvas.getByText('관련 프로필이 없어요')).toBeVisible();
    expect(canvas.getByText('별빛 여행자')).toBeVisible();
    expect(canvas.getByText('은하 기록자')).toBeVisible();
    expect(canvasElement.querySelector('a[href="/@starlight"]')).toBeInTheDocument();
    expect(canvasElement.querySelector('a[href="/@galaxy"]')).toBeInTheDocument();
    expect(canvas.getAllByRole('button', { name: '팔로우' })).toHaveLength(2);
    expect(canvas.queryByRole('button', { name: '더 불러오기' })).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    expect(initialRetry).toHaveBeenCalledOnce();
  },
};

export const NextPageFailurePreservesRowsAndRetrySucceeds: Story = {
  parameters: {
    relay: {
      paginationResponses: [{ error: '관련 Profile 다음 page 실패' }, { data: paginationNextPage }],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '더 불러오기' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '관련 프로필을 더 불러오지 못했어요',
    );
    expect(canvas.getByText('별빛 여행자')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    await expect(canvas.findByText('우주 관찰자')).resolves.toBeVisible();
    expect(canvas.getAllByText('우주 관찰자')).toHaveLength(1);
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    expect(canvas.queryByRole('button', { name: '더 불러오기' })).not.toBeInTheDocument();
  },
  render: () => <PaginationList />,
};

export const NextPageLoadingDisablesDuplicateActivation: Story = {
  parameters: { relay: { paginationLoading: true, paginationRequestObserver } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: '더 불러오기' });
    await userEvent.click(button);
    expect(paginationRequestObserver).toHaveBeenCalledOnce();
    expect(paginationRequestObserver).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'HashtagRelatedProfilesNextPageQuery' }),
      expect.objectContaining({ count: 20 }),
    );
    await expect(button).toBeDisabled();
    await expect(canvas.findByText('관련 프로필을 더 불러오는 중입니다.')).resolves.toBeVisible();
    expect(canvas.getByText('별빛 여행자')).toBeVisible();

    button.click();
    expect(paginationRequestObserver).toHaveBeenCalledOnce();
  },
  render: () => <PaginationList />,
};
