<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import PostList from './PostList.svelte';

  import type { PostList_profile$key } from '$mearie';

  // Storybook은 .storybook/mocks/mearie-svelte.ts에서 createFragment를 패스스루로 모킹하므로
  // 여기서는 평범한 데이터 객체를 fragment ref 자리에 그대로 넘긴다.
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

  const post = (id: string, bodyText: string | null, createdAt: string = minutesAgo(5)) => ({
    __typename: 'Post',
    id: `story-post-${id}`,
    content:
      bodyText === null
        ? null
        : { __typename: 'PostContent', id: `story-post-content-${id}`, bodyText },
    createdAt,
    profile: {
      __typename: 'Profile',
      id: 'story-author-profile',
      displayName: '코스모 작가',
      handle: 'kosmo',
    },
  });

  const profile = (...posts: ReturnType<typeof post>[]): PostList_profile$key =>
    ({
      __typename: 'Profile',
      id: 'story-profile',
      posts: {
        __typename: 'PostsConnection',
        edges: posts.map((node, index) => ({
          __typename: 'PostsConnectionEdge',
          cursor: `story-cursor-${index}`,
          node,
        })),
      },
    }) as unknown as PostList_profile$key;

  const longBody =
    '프로필 게시글 목록은 이제 실제 query 결과를 받아 항목을 렌더합니다. ' +
    '긴 본문은 PostListItem의 더보기 동작으로 접혀야 하므로, 목록 컨테이너에서는 데이터를 그대로 전달합니다. '.repeat(
      4,
    );

  const multiplePostsProfile = profile(
    post('short', '짧은 게시글 본문입니다.'),
    post('long', longBody, minutesAgo(90)),
    post('empty', null, minutesAgo(180)),
  );

  const { Story } = defineMeta({
    title: 'KOSMO/PostList',
    component: PostList,
    tags: ['autodocs'],
  });
</script>

<Story
  name="Playground"
  args={{
    profile: profile(post('playground', '프로필에 올라온 게시글 본문입니다.')),
    loading: false,
  }}
/>

<Story name="Multiple posts" args={{ profile: multiplePostsProfile, loading: false }} />

<!-- 프로필 페이지 목록 영역의 상태 전체: 로딩 스켈레톤, 오류, 게시글 없음, 게시글 있음. -->
<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[600px] gap-8">
    <PostList loading />
    <PostList error onRetry={() => {}} />
    <PostList profile={profile()} />
    <PostList profile={multiplePostsProfile} />
  </div>
</Story>
