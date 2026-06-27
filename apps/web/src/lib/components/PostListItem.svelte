<script lang="ts">
  import { formatTimelineTimestamp } from '@kosmo/core/datetime';
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { Temporal } from 'temporal-polyfill';

  import type { PostListItem_post$key } from '$mearie';

  import { tv } from '$lib/tv';
  import { getProfileInitial } from '$lib/utils/profile';

  import Avatar from './Avatar.svelte';
  import PostBody from './PostBody.svelte';
  import ProfileNameBlock from './ProfileNameBlock.svelte';

  // 게시글 목록 항목(feed). 본문 배치는 상세 PostLayout과 같은 2x2 grid 골격을 따른다:
  //
  //   Avatar    | ProfileNameBlock . relative time  (header)
  //   ThreadLine| PostBody                          (body)
  //
  // PostLayout과 골격을 일치시키되 두 컴포넌트는 별도로 유지한다(목록/상세가 이후 갈릴 수 있음).
  // feed 고유: 작성 시각은 헤더 우측 상대시간, 본문은 md(상세는 lg), 가시 콘텐츠별 링크 목적지를 나눈다.
  type Props = Omit<HTMLAttributes<HTMLElement>, 'class'> & {
    post: PostListItem_post$key;
    // tailwind-merge가 ClassValue를 받지 못하므로 문자열로 좁힌다.
    class?: string | null;
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

  const formattedCreatedAt = $derived(
    formatTimelineTimestamp(Temporal.Instant.from(postFragment.data.createdAt as string)),
  );
  const detailHref = $derived(`/@${postFragment.data.profile.handle}/${postFragment.data.id}`);
  const profileHref = $derived(`/@${postFragment.data.profile.handle}`);
  const initials = $derived(
    getProfileInitial(postFragment.data.profile.displayName, postFragment.data.profile.handle),
  );

  const postListItem = tv({
    slots: {
      card: 'border-border border-b px-2 pt-2 pb-4',
      // PostLayout과 동일한 2열(거터 auto / 콘텐츠 1fr) x 2행 grid. 자동 배치: 아바타 -> 헤더 -> 스레드 -> 본문.
      // gap-x-3(12px): 거터와 콘텐츠 사이. gap-y-1(4px): 헤더와 본문 사이.
      grid: 'grid grid-cols-[auto_1fr] gap-x-3 gap-y-1',
      avatar:
        'focus-visible:outline-more self-start rounded-full focus-visible:outline-2 focus-visible:outline-offset-2',
      header: 'flex min-w-0 items-start justify-between gap-2',
      // 거터 col(아바타 폭)을 행 전체 높이로 차지해 이후 스레드 라인 자리를 예약한다(PostLayout 패리티).
      // feed 아바타는 lg(48px)이므로 거터 폭도 w-12로 맞춘다.
      thread: 'w-12 self-stretch',
      body: 'focus-visible:outline-more text-text-primary block min-w-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2',
      time: 'focus-visible:outline-more text-text-secondary shrink-0 rounded-md text-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2',
    },
  });

  const slots = postListItem();
</script>

<article {...attributes} class={slots.card({ class: className })}>
  <div class={slots.grid()}>
    <a class={slots.avatar()} href={profileHref} tabindex="-1" aria-hidden="true">
      <Avatar size="lg" {initials} />
    </a>

    <div class={slots.header()}>
      <ProfileNameBlock href={profileHref} profile={postFragment.data.profile} />
      <a class={slots.time()} href={detailHref}>
        <time datetime={postFragment.data.createdAt as string}>
          {formattedCreatedAt}
        </time>
      </a>
    </div>

    <div class={slots.thread()} aria-hidden="true"></div>

    <a class={slots.body()} href={detailHref}>
      <PostBody post={postFragment.data} size="md" />
    </a>
  </div>
</article>
