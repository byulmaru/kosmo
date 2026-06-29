<script lang="ts">
  import { page } from '$app/state';
  import { createQuery } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import FollowButton from '$lib/components/FollowButton.svelte';
  import ProfileHero from '$lib/components/ProfileHero.svelte';
  import { getTabsLayoutSessionContext } from '$lib/tabsLayoutSessionContext';

  let { children } = $props();

  const query = createQuery(
    graphql(`
      query ProfileLayoutQuery($handle: String!) {
        currentSession {
          id
        }
        profileByHandle(handle: $handle) {
          id
          ...ProfileHero_profile
          ...FollowButton_profile
        }
      }
    `),
    () => ({ handle: page.params.handle! }),
  );

  const tabsLayoutSession = getTabsLayoutSessionContext();
  const profile = $derived(query.data?.profileByHandle ?? null);
  // currentSession이 null이면 비로그인. viewer profile id는 layout의 active profile bridge를 따른다.
  const authenticated = $derived(Boolean(query.data?.currentSession));
  const viewerProfileId = $derived(tabsLayoutSession?.selectedProfile()?.id ?? null);
</script>

<!--
  공유 (tabs) 셸의 main은 `flex items-center px-6 py-8`로 콘텐츠를 세로 중앙 정렬 + 패딩한다.
  프로필은 피드처럼 보여야 하므로 이 라우트에서만:
  - self-start 로 탑정렬(공유 main의 items-center 무시)
  - 음수 마진으로 main 좌우/상단 패딩(px-6 py-8)을 상쇄해 커버가 플러시되게 한다.
    폭은 항상 중앙 컬럼 트랙을 가득 채운다(최대 폭 600px은 공유 셸 그리드가 결정).
  공유 셸/다른 탭 페이지는 건드리지 않는다.
-->
<section class="-mx-6 -mt-8 w-[calc(100%+3rem)] self-start">
  {#if query.loading && !profile}
    <ProfileHero loading />
  {:else if query.error && !profile}
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
    <ProfileHero {profile}>
      {#snippet action()}
        <FollowButton {profile} {viewerProfileId} {authenticated} />
      {/snippet}
    </ProfileHero>
    {@render children()}
  {/if}
</section>
