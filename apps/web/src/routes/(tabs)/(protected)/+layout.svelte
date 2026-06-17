<script lang="ts">
  import { goto } from '$app/navigation';
  import { graphql } from '$mearie';
  import { createQuery } from '@mearie/svelte';

  let { children } = $props();

  // 보호 라우트 가드: 유효 세션이 없으면 루트 온보딩(/)으로 보낸다.
  // 세션 판정은 currentSession(API가 토큰을 검증해 무효·만료 시 null)으로 한다 — 쿠키 존재 아님.
  // 공개 프로필 @[handle] 서브트리(게시글 상세 +page@(tabs) 포함)는 (protected) 밖이라 이 가드를 거치지 않는다.
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
</script>

{@render children()}
