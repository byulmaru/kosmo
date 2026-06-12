<script lang="ts">
  import { page } from '$app/state';
  import { graphql } from '$mearie';
  import { createQuery } from '@mearie/svelte';

  import PostList from '$lib/components/PostList.svelte';

  const query = createQuery(
    graphql(`
      query ProfilePostListPageQuery($handle: String!) {
        profileByHandle(handle: $handle) {
          id
          ...PostList_profile
        }
      }
    `),
    () => ({ handle: page.params.handle! }),
  );

  const profile = $derived(query.data?.profileByHandle ?? null);
</script>

<PostList {profile} loading={query.loading} error={Boolean(query.error)} onRetry={query.refetch} />
