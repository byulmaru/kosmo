<script lang="ts">
  import { createQuery } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import PageIntro from '$lib/components/PageIntro.svelte';

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

<PageIntro
  title="홈"
  description="피드를 확인하고 새로운 소식을 탐색합니다.????????"
  tone="primary"
>
  <p class="text-foreground mt-3 text-base">
    {query.loading ? 'Loading...' : query.data?.me?.name}
  </p>
</PageIntro>
