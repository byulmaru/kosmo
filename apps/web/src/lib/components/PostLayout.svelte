<script lang="ts">
  import { formatDate } from '@kosmo/core/datetime';
  import { graphql } from '$mearie';
  import type { PostLayout_post$key } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import { Temporal } from 'temporal-polyfill';

  import { tv } from '$lib/tv';
  import { getProfileInitial } from '$lib/utils/profile';

  import Avatar from './Avatar.svelte';
  import PostBody from './PostBody.svelte';
  import ProfileNameBlock from './ProfileNameBlock.svelte';

  // 게시글 상세 레이아웃 컨테이너. 게시글을 이루는 모든 요소(작성자·본문·정보, 추후
  // 스레드 라인·미디어·액션바)를 직접 배치하며, Post fragment 하나로 전부 렌더한다.
  // 본문은 children으로 주입받지 않고 PostBody를 내부에서 직접 감싸 선언한다.
  //
  //   ┌───────────┬──────────────────────────────┐
  //   │  Avatar   │  ProfileNameBlock            │  (header)
  //   ├───────────┼──────────────────────────────┤
  //   │ ThreadLine│  PostBody + 정보(시각·공개범위)│  (body)
  //   └───────────┴──────────────────────────────┘
  //
  // 좌측 거터의 ThreadLine 셀은 이후 스레드 연결선이 들어갈 자리를 예약한다(행 전체 높이).
  // 목록(feed) 표현은 PostListItem이 자체 소유한다.
  type Props = {
    post: PostLayout_post$key;
    // Svelte의 ClassValue(숫자·딕셔너리 포함)는 tailwind-merge가 받지 못하므로
    // 문자열로 좁힌다.
    class?: string | null;
  };

  let { post, class: className }: Props = $props();

  const postFragment = createFragment(
    graphql(`
      fragment PostLayout_post on Post {
        id
        createdAt
        visibility
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

  const profileHref = $derived(`/@${postFragment.data.profile.handle}`);
  const initials = $derived(
    getProfileInitial(postFragment.data.profile.displayName, postFragment.data.profile.handle),
  );

  // PostVisibility는 PUBLIC/UNLISTED/FOLLOWERS/DIRECT 4종이다.
  const visibilityLabel: Record<string, string> = {
    PUBLIC: '전체 공개',
    UNLISTED: '조용히 공개',
    FOLLOWERS: '팔로워 공개',
    DIRECT: '다이렉트',
  };

  // Figma 메타라인 형식(오후 9:14 · 2026. 04. 27)을 따른다. 날짜 포맷은
  // @kosmo/core/datetime의 formatDate(끝 마침표 제거 포함)를 공유한다.
  const formattedCreatedAt = $derived.by(() => {
    const createdAt = Temporal.Instant.from(postFragment.data.createdAt as string);
    const time = createdAt.toLocaleString('ko-KR', { timeStyle: 'short' });
    return `${time} · ${formatDate(createdAt)}`;
  });

  const postLayout = tv({
    slots: {
      // 2열(거터 auto / 콘텐츠 1fr) × 2행 grid. 자동 배치 순서: 아바타 → 헤더 → 스레드 → 본문.
      // gap-x-3(12px): 거터↔콘텐츠. gap-y-1(4px): 헤더↔본문.
      root: 'grid grid-cols-[auto_1fr] gap-x-3 gap-y-1',
      avatar: 'self-start',
      header: 'flex min-w-0 items-start',
      // 거터 col(아바타 폭)을 행 전체 높이로 차지해 이후 스레드 라인 자리를 예약한다.
      thread: 'w-10 self-stretch',
      body: 'min-w-0',
      meta: 'text-text-secondary text-xsm mt-1.5 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 lg:text-sm',
    },
  });

  const slots = postLayout();
</script>

<div class={slots.root({ class: className })}>
  <!-- 거터: 아바타. 이름 블록과 목적지가 같으므로 탭 순서·스크린리더에서는 숨긴다. -->
  <a class={slots.avatar()} href={profileHref} tabindex="-1" aria-hidden="true">
    <Avatar size="md" {initials} />
  </a>

  <!-- 헤더: 작성자 이름 블록. -->
  <div class={slots.header()}>
    <ProfileNameBlock href={profileHref} profile={postFragment.data.profile} />
  </div>

  <!-- 스레드 라인 예약 셀(추후 스레드 연결선 자리). -->
  <div class={slots.thread()} aria-hidden="true"></div>

  <!-- 본문 + 정보(작성 시각 · 공개 범위). 이후 미디어·투표·액션바가 형제로 쌓인다. -->
  <div class={slots.body()}>
    <PostBody post={postFragment.data} />
    <div class={slots.meta()}>
      <time datetime={postFragment.data.createdAt as string}>{formattedCreatedAt}</time>
      <span aria-hidden="true">·</span>
      <span>{visibilityLabel[postFragment.data.visibility]}</span>
    </div>
  </div>
</div>
