<script lang="ts">
  import { createQuery } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import ProfileOnboarding from '$lib/components/ProfileOnboarding.svelte';
  import { getProfileSwitcherContext } from '$lib/profileSwitcherContext';

  const query = createQuery(
    graphql(`
      query HomePageQuery {
        currentSession {
          id
          selectedProfile {
            id
          }
        }
        me {
          id
          name
          profiles {
            id
          }
        }
      }
    `),
  );

  const profileSwitcher = getProfileSwitcherContext();

  const session = $derived(query.data?.currentSession ?? null);
  const selectedProfile = $derived(session?.selectedProfile ?? null);
  const hasProfiles = $derived((query.data?.me?.profiles?.length ?? 0) > 0);
  // 로그인 + 선택 프로필 없음일 때만 온보딩을 노출한다. 비로그인은 별도 이슈에서 다룬다.
  const showOnboarding = $derived(Boolean(session) && !selectedProfile);
</script>

{#if query.loading && !query.data}
  <section class="w-[min(100%,36rem)]" aria-hidden="true">
    <div class="bg-surface h-5 w-24 animate-pulse rounded-sm"></div>
    <div class="bg-surface mt-3 h-11 w-32 animate-pulse rounded-md"></div>
    <div class="bg-surface mt-3 h-6 w-72 animate-pulse rounded-sm"></div>
  </section>
  <span class="sr-only" role="status">홈을 불러오는 중입니다.</span>
{:else if showOnboarding}
  <ProfileOnboarding {hasProfiles} onAction={() => profileSwitcher?.openProfileSwitcher()} />
{:else}
  <section class="w-[min(100%,36rem)]">
    <p class="text-primary mb-3 text-xs font-semibold tracking-[1.6px] uppercase">KOSMO</p>
    <h1 class="text-text-primary m-0 text-5xl leading-[44px] font-bold">홈</h1>
    <span class="text-text-secondary mt-3 block max-w-90 text-base leading-6">
      피드를 확인하고 새로운 소식을 탐색합니다.
    </span>
    <p class="text-text-primary mt-3 text-base">{query.data?.me?.name}</p>
  </section>
{/if}
