<script lang="ts">
  import { usePaginationFragment, usePreloadedQuery } from '@kosmo/svelte-relay';
  import PageHeader from '$lib/components/header/DefaultHeader.svelte';
  import PostList from '$lib/components/post-list/PostList.svelte';
  import type { Page_MainTimeline_Fragment$key } from './__generated__/Page_MainTimeline_Fragment.graphql';

  const { data } = $props();

  const query = usePreloadedQuery(data.query);

  const timelineConnection = usePaginationFragment<Page_MainTimeline_Fragment$key>(
    data.fragment,
    $query,
  );
</script>

<PageHeader showBackButton={false} title="홈" />

<PostList connectionFieldName="timeline" store={timelineConnection} />
