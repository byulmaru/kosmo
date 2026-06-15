<script lang="ts">
  import { graphql } from '$mearie';
  import { createQuery } from '@mearie/svelte';
  import { goto } from '$app/navigation';
  import OnboardingHero from '$lib/components/OnboardingHero.svelte';

  // 유효 세션(로그인) 사용자는 홈으로 보낸다. 쿠키 존재가 아니라 currentSession으로 검증한다
  // — 만료·폐기 세션은 API가 null로 반환하므로, 무효 쿠키로 잘못 리다이렉트하거나
  // 서버 사이드 분기가 캐시와 꼬이는 문제를 피한다. 비로그인에게는 Welcome을 그대로 렌더한다.
  const query = createQuery(
    graphql(`
      query RootOnboardingQuery {
        currentSession {
          id
        }
      }
    `),
  );

  $effect(() => {
    if (query.data?.currentSession) {
      void goto('/home', { replaceState: true });
    }
  });
</script>

<div class="flex min-h-screen flex-col">
  <header class="flex h-[84px] shrink-0 items-center px-12">
    <div class="flex items-center gap-2">
      <span
        class="bg-primary text-text-primary flex size-10 items-center justify-center rounded-md text-md font-bold"
      >
        K
      </span>
      <span class="text-text-primary text-md font-bold">KOSMO</span>
    </div>
  </header>
  <main class="flex flex-1 items-center px-12 lg:px-32">
    <OnboardingHero />
  </main>
</div>
