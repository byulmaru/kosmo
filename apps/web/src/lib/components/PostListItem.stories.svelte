<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import PostListItem from './PostListItem.svelte';

  import type { PostListItem_post$key } from '$mearie';

  // Storybook은 .storybook/mocks/mearie-svelte.ts에서 createFragment를 패스스루로 모킹하므로
  // 여기서는 평범한 데이터 객체를 fragment ref 자리에 그대로 넘긴다.
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

  const post = (
    bodyText: string | null,
    createdAt: string = minutesAgo(5),
    displayName = '코스모 작가',
    handle = 'kosmo',
  ): PostListItem_post$key =>
    ({
      __typename: 'Post',
      id: 'story-post',
      content:
        bodyText === null
          ? null
          : { __typename: 'PostContent', id: 'story-post-content', bodyText },
      createdAt,
      profile: {
        __typename: 'Profile',
        id: 'story-profile',
        displayName,
        handle,
      },
    }) as unknown as PostListItem_post$key;

  const longBody =
    '긴 본문은 목록에서 200자까지만 보이고 더보기 버튼이 나타납니다. ' +
    '이 문장은 잘림 동작을 확인하기 위해 일부러 길게 이어 붙였습니다. '.repeat(6) +
    '\n잘린 이후의 내용은 펼치기 전에는 보이지 않아야 합니다.\n마지막 줄입니다.';

  // 글자 수는 200자 이하지만 줄바꿈이 10줄을 넘는 본문 — 줄 상한으로 잘려야 한다.
  const manyLinesBody = Array.from({ length: 14 }, (_, index) => `${index + 1}번째 줄`).join('\n');

  const { Story } = defineMeta({
    title: 'KOSMO/PostListItem',
    component: PostListItem,
    tags: ['autodocs'],
  });
</script>

<Story name="Playground" args={{ post: post('목록 항목 본문이 들어가는 자리예요.') }} />

<!-- 본문 길이별 잘림 상태. 200자 초과(또는 10줄 초과) 본문은 잘리고 "더보기..." 버튼이 보여야 한다. -->
<Story name="Body states" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[390px]">
    <PostListItem post={post('짧은 본문 한 줄.')} />
    <PostListItem post={post(longBody)} />
    <PostListItem post={post(manyLinesBody)} />
    <PostListItem post={post(null)} />
  </div>
</Story>

<!-- 시간 표시: 24시간 미만 상대시간, 이상 날짜(2026. 04. 27 형식). -->
<Story name="Time states" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[390px]">
    <PostListItem post={post('방금 작성된 게시글.', minutesAgo(0.5))} />
    <PostListItem post={post('5분 전에 작성된 게시글.', minutesAgo(5))} />
    <PostListItem post={post('3시간 전에 작성된 게시글.', minutesAgo(3 * 60))} />
    <PostListItem post={post('하루 이상 지난 게시글.', '2026-04-27T21:14:00.000Z')} />
  </div>
</Story>

<!-- 긴 표시 이름·핸들이 시간 표시를 밀어내지 않아야 한다. -->
<Story name="Layout edge cases" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[390px]">
    <PostListItem
      post={post(
        '긴 이름과 긴 핸들 케이스.',
        minutesAgo(60),
        '정말 아주 긴 표시 이름을 가진 게시글 작성자 프로필',
        'very-long-author-handle-that-should-not-break-layout',
      )}
    />
    <PostListItem post={post('넓은 컨테이너에서도 레이아웃이 유지됩니다.')} class="w-[600px]" />
  </div>
</Story>
