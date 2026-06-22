<script lang="ts">
  import { goto } from '$app/navigation';
  import { graphql } from '$mearie';
  import { createQuery } from '@mearie/svelte';
  import Splash from '$lib/components/Splash.svelte';
  import { getShellChromeContext } from '$lib/shellChromeContext';

  let { children } = $props();

  const shellChrome = getShellChromeContext();

  // 보호 라우트 가드: 유효 세션이 없으면 루트 온보딩(/)으로 보낸다.
  // 세션 판정은 currentSession(API가 토큰을 검증해 무효·만료 시 null)으로 한다 — 쿠키 존재 아님.
  // 공개 프로필 @[handle] 서브트리(게시글 상세 +page@(tabs) 포함)는 (protected) 밖이라 이 가드를 거치지 않는다.
  // 이 가드 쿼리는 부모 (tabs)가 받아둔 currentSession 캐시를 재사용만 하면 되지만, 전역 fetchPolicy가
  // cache-and-network라 매 진입 시 백그라운드 네트워크 재요청이 함께 돈다.
  // TODO: mearie per-query fetchPolicy가 구현되면(0.6.7 미구현) 이 쿼리는 cache-or-network로 바꾼다.
  const query = createQuery(
    graphql(`
      query ProtectedLayoutQuery {
        currentSession {
          id
        }
      }
    `),
  );

  $effect(() => {
    // 로딩·에러 중에는 보류해 유효 세션·일시 오류 사용자를 잘못 튕기지 않는다.
    if (query.loading || query.error) {
      return;
    }

    if (!query.data?.currentSession) {
      void goto('/', { replaceState: true });
    }
  });

  // 캐시된 유효 세션·조회 오류가 아니면 콜드 검증 구간으로 보고 스플래시를 표시한다.
  const showSplash = $derived(!(query.data?.currentSession || query.error));

  // 스플래시는 fixed 오버레이로 시각적으로만 셸을 덮으므로, 부모 (tabs) 셸을 inert 처리해
  // 키보드·스크린리더 포커스가 덮인 셸 메뉴(사이드바·하단탭 등)에 닿지 않게 한다.
  // 보호 서브트리를 벗어나거나 세션이 잡히면 inert를 해제한다.
  $effect(() => {
    shellChrome?.setInert(showSplash);
    return () => shellChrome?.setInert(false);
  });
</script>

<!-- 캐시된 세션이 없는 콜드 검증 구간에는 자식·셸·홈 스켈레톤 대신 풀스크린 스플래시를 표시한다.
     - 유효 세션(캐시 포함)이 잡히면 바로 자식을 렌더한다 — 캐시된 세션 탭 이동에선 스플래시가 뜨지 않는다.
     - 세션이 null로 확정되면 위 $effect가 /로 보내며, 그동안 스플래시가 셸을 덮는다(셸은 inert 처리됨).
     - 조회 오류는 fail-open으로 자식을 렌더해 일시 오류 사용자를 막지 않는다. -->
{#if showSplash}
  <Splash />
{:else}
  {@render children()}
{/if}
