<script lang="ts">
  import { createQuery } from '@mearie/svelte';
  import { graphql } from '$mearie';

  const query = createQuery(
    graphql(`
      query TestQuery {
        me {
          id
          name
        }
      }
    `),
  );
</script>

<section class="w-[min(100%,36rem)]">
  <p class="text-primary mb-3 text-xs font-semibold tracking-[1.6px] uppercase">KOSMO</p>
  <h1 class="text-foreground m-0 text-5xl leading-[44px] font-bold">홈</h1>
  <span class="text-secondary-foreground mt-3 block max-w-90 text-base leading-6">
    피드를 확인하고 새로운 소식을 탐색합니다.
  </span>
  <p class="text-foreground mt-3 text-base">
    {query.loading ? 'Loading...' : query.data?.me?.name}
  </p>
</section>
