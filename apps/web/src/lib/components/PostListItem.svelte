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

  // 게시글 목록 항목(feed). 본문 배치는 상세 PostLayout과 같은 2×2 grid 골격을 따른다:
  //
  //   ┌───────────┬──────────────────────────────┐
  //   │  Avatar   │  ProfileNameBlock · 상대시각  │  (header)
  //   ├───────────┼──────────────────────────────┤
  //   │ ThreadLine│  PostBody                     │  (body)
  //   └───────────┴──────────────────────────────┘
  //
  // PostLayout과 골격을 일치시키되 두 컴포넌트는 별도로 유지한다(목록/상세가 이후 갈릴 수 있음).
  // feed 고유: 작성 시각은 헤더 우측 상대시간, 본문은 md(상세는 lg), 카드 전체가 overlay 링크로 상세 이동.
  // TODO(PROD-174): overlay+pointer-events 클릭 모델 재설계, 아바타·이름→프로필 링크 분기,
  //   feed 시각 소유·책임 모델을 PostLayout과 더 일관되게 정리한다.
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

  // Figma TimeInfo(67:245) variant를 따른다: 24시간 미만은 상대시간, 이상은 날짜.
  // 포맷 규칙은 @kosmo/core/datetime에서 정한다.
  const formattedCreatedAt = $derived(
    formatTimelineTimestamp(Temporal.Instant.from(postFragment.data.createdAt as string)),
  );
  const detailHref = $derived(`/@${postFragment.data.profile.handle}/${postFragment.data.id}`);
  const initials = $derived(
    getProfileInitial(postFragment.data.profile.displayName, postFragment.data.profile.handle),
  );

  const postListItem = tv({
    slots: {
      // feed 카드. overlay 링크가 카드 전체를 상세로 연결한다.
      card: 'border-border relative border-b px-2 pt-2 pb-4',
      // 카드 전체를 덮는 overlay 링크. 콘텐츠는 pointer-events-none로 클릭을 여기로 통과시킨다.
      overlay:
        'focus-visible:outline-more absolute inset-0 z-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2',
      // PostLayout과 동일한 2열(거터 auto / 콘텐츠 1fr) × 2행 grid. 자동 배치: 아바타 → 헤더 → 스레드 → 본문.
      // gap-x-3(12px): 거터↔콘텐츠. gap-y-1(4px): 헤더↔본문.
      grid: 'pointer-events-none relative z-10 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1',
      avatar: 'self-start',
      header: 'flex min-w-0 items-start justify-between gap-2',
      // 거터 col(아바타 폭)을 행 전체 높이로 차지해 이후 스레드 라인 자리를 예약한다(PostLayout 패리티).
      // feed 아바타는 lg(48px)이므로 거터 폭도 w-12로 맞춘다.
      thread: 'w-12 self-stretch',
      body: 'min-w-0',
      time: 'text-text-secondary shrink-0 text-sm',
    },
  });

  const slots = postListItem();
</script>

<article {...attributes} class={slots.card({ class: className })}>
  <a class={slots.overlay()} href={detailHref}>
    <span class="sr-only">@{postFragment.data.profile.handle}의 게시글 상세 보기</span>
  </a>

  <!-- 콘텐츠 grid는 overlay 링크 위(z-10)에 있으나 pointer-events-none으로 클릭을 overlay(상세)로
       통과시킨다. 아바타·이름 → 프로필 링크 분기와 클릭 모델 재설계는 PROD-174에서 다룬다. -->
  <div class={slots.grid()}>
    <div class={slots.avatar()}>
      <Avatar size="lg" {initials} />
    </div>

    <div class={slots.header()}>
      <ProfileNameBlock profile={postFragment.data.profile} />
      <time class={slots.time()} datetime={postFragment.data.createdAt as string}>
        {formattedCreatedAt}
      </time>
    </div>

    <!-- 스레드 라인 예약 셀(PostLayout 패리티; 추후 스레드 연결선 자리). -->
    <div class={slots.thread()} aria-hidden="true"></div>

    <div class={slots.body()}>
      <PostBody post={postFragment.data} size="md" />
    </div>
  </div>
</article>
