<script lang="ts">
  import { createQuery } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import PostList from '$lib/components/PostList.svelte';

  const query = createQuery(
    graphql(`
      query HomeTimelineQuery {
        homeTimeline(first: 20) {
          ...PostList_homeTimeline
        }
      }
    `),
  );

  const homeTimeline = $derived(query.data?.homeTimeline ?? null);
</script>

<section class="grid w-[min(100%,36rem)] gap-6 self-start">
  <header>
    <p class="text-primary mb-3 text-xs font-semibold tracking-[1.6px] uppercase">KOSMO</p>
    <h1 class="text-text-primary m-0 text-5xl leading-[44px] font-bold">홈</h1>
  </header>

  <PostList
    {homeTimeline}
    loading={query.loading}
    error={Boolean(query.error)}
    onRetry={query.refetch}
  />
</section>
