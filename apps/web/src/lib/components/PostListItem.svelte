<script lang="ts">
  import { formatTimelineTimestamp } from '@kosmo/core/datetime';
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { Temporal } from 'temporal-polyfill';

  import type { PostListItem_post$key } from '$mearie';

  import { getProfileInitial } from '$lib/utils/profile';

  import Avatar from './Avatar.svelte';
  import PostBody from './PostBody.svelte';
  import ProfileNameBlock from './ProfileNameBlock.svelte';

  // 게시글 목록 항목(Figma PostCard 67:206). 목록 표현(시간은 헤더 우측 상대시간,
  // 카드 전체가 상세로 이동)은 이 컴포넌트가 자체 소유한다. 본문은 PostBody로 위임한다.
  // 카드 전체는 overlay 링크로 상세로 이동하고, 아바타·이름의 프로필 링크는
  // pointer-events-auto로 overlay보다 우선한다.
  // TODO(PROD-174): feed 작성 시각 소유·레이아웃을 PostLayout처럼 정식화하고
  //   PostLayout과 거터·헤더 grid 중복을 통합한다.
  type Props = HTMLAttributes<HTMLElement> & {
    post: PostListItem_post$key;
  };

  let { post, class: className, ...attributes }: Props = $props();

  const postFragment = createFragment(
    graphql(`
      fragment PostListItem_post on Post {
        id
        createdAt
        profile {
          id
          handle
          displayName
          ...ProfileNameBlock_profile
        }
        ...PostBody_post
      }
    `),
    () => post,
  );

  // Figma TimeInfo(67:245) variant를 따른다: 24시간 미만은 상대시간, 이상은 날짜.
  // 포맷 규칙은 @kosmo/core/datetime에서 정한다.
  const formattedCreatedAt = $derived(
    formatTimelineTimestamp(Temporal.Instant.from(postFragment.data.createdAt as string)),
  );
  const detailHref = $derived(`/@${postFragment.data.profile.handle}/${postFragment.data.id}`);
  const profileHref = $derived(`/@${postFragment.data.profile.handle}`);
  const initials = $derived(
    getProfileInitial(postFragment.data.profile.displayName, postFragment.data.profile.handle),
  );
</script>

<article
  {...attributes}
  class={`border-border relative border-b px-2 pt-2 pb-4 ${className ?? ''}`}
>
  <a
    class="focus-visible:outline-more absolute inset-0 z-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
    href={detailHref}
  >
    <span class="sr-only">@{postFragment.data.profile.handle}의 게시글 상세 보기</span>
  </a>

  <!-- 카드 본문은 overlay 링크 위에 있으나 클릭은 overlay(상세)로 통과시키고,
       아바타·이름 프로필 링크만 pointer-events-auto로 받는다. -->
  <div class="pointer-events-none relative z-10 flex items-start gap-3">
    <a class="pointer-events-auto shrink-0" href={profileHref}>
      <Avatar size="lg" {initials} />
    </a>

    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex items-start justify-between gap-2">
        <ProfileNameBlock
          class="pointer-events-auto"
          href={profileHref}
          profile={postFragment.data.profile}
        />
        <time
          class="text-text-secondary shrink-0 text-sm"
          datetime={postFragment.data.createdAt as string}
        >
          {formattedCreatedAt}
        </time>
      </div>

      <PostBody post={postFragment.data} />
    </div>
  </div>
</article>
