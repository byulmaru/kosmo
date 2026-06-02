<script lang="ts">
  import { page } from '$app/state';
  import { createQuery } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import ProfileHero from '$lib/components/ProfileHero.svelte';

  let { children } = $props();

  const query = createQuery(
    graphql(`
      query ProfileLayoutQuery($handle: String!) {
        profileByHandle(handle: $handle) {
          id
          handle
          displayName
          bio
          followersCount
          followingCount
        }
      }
    `),
    () => ({ handle: page.params.handle }),
  );

  const profile = $derived(query.data?.profileByHandle ?? null);
</script>

<!--
  공유 (tabs) 셸의 main은 `flex items-center px-6 py-8`로 콘텐츠를 세로 중앙 정렬 + 패딩한다.
  프로필은 피드처럼 보여야 하므로 이 라우트에서만:
  - self-start 로 탑정렬(공유 main의 items-center 무시)
  - 음수 마진으로 main 좌우/상단 패딩(px-6 py-8)을 상쇄해 커버가 플러시되게 한다.
    모바일: 화면 끝까지 풀블리드. 데스크톱: 600px 컬럼을 가운데 정렬(mx-auto) + 양옆 라이트 구분선(border-x).
  공유 셸/다른 탭 페이지는 건드리지 않는다.
-->
<section
  class="border-border -mx-6 -mt-8 w-[calc(100%+3rem)] self-start lg:mx-auto lg:w-[600px] lg:border-x"
>
  {#if query.loading}
    <ProfileHero loading />
  {:else if query.error}
    <div class="px-4 py-12 text-center" role="alert">
      <p class="text-text-primary text-base font-semibold">프로필을 불러오지 못했어요</p>
      <p class="text-text-secondary mt-1 text-sm">잠시 후 다시 시도해주세요.</p>
      <button
        class="border-border text-text-primary mt-4 rounded-lg border px-4 py-2 text-sm font-bold"
        type="button"
        onclick={() => query.refetch()}
      >
        다시 시도
      </button>
    </div>
  {:else if !profile}
    <div class="px-4 py-12 text-center">
      <p class="text-text-primary text-base font-semibold">프로필을 찾을 수 없어요</p>
      <p class="text-text-secondary mt-1 text-sm">
        @{page.params.handle} 프로필이 존재하지 않아요.
      </p>
    </div>
  {:else}
    <ProfileHero {profile} />
    {@render children()}
  {/if}
</section>
