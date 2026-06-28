<script lang="ts">
  import { page } from '$app/state';
  import { createQuery, getClient } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import type { DataOf } from '@mearie/svelte';
  import ProfileConnectionList from '$lib/components/ProfileConnectionList.svelte';
  import { loadNextConnectionPage } from '$lib/profileConnectionPagination';

  const client = getClient();
  const queryDocument = graphql(`
    query ProfileFollowingPageQuery($handle: String!) {
      currentSession {
        id
        selectedProfile {
          id
        }
      }
      profileByHandle(handle: $handle) {
        id
        ...ProfileConnectionList_followingProfile
      }
    }
  `);
  const nextPageQueryDocument = graphql(`
    query ProfileFollowingNextPageQuery($handle: String!, $after: String!) {
      profileByHandle(handle: $handle) {
        id
        following(first: 20, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              id
              followee {
                id
                ...ProfileListItem_profile
              }
            }
          }
        }
      }
    }
  `);

  type NextPageConnection = NonNullable<
    NonNullable<DataOf<typeof nextPageQueryDocument>['profileByHandle']>['following']
  >;

  const query = createQuery(queryDocument, () => ({ handle: page.params.handle! }));

  const profile = $derived(query.data?.profileByHandle ?? null);
  const viewerProfileId = $derived(query.data?.currentSession?.selectedProfile?.id ?? null);

  let pageKey = $state<string | null>(null);
  let paginatedConnection = $state<NextPageConnection | null>(null);
  let loadingNextPage = $state(false);
  let nextPageError = $state(false);

  $effect(() => {
    const nextPageKey = profile ? `${page.params.handle}:${profile.id}` : null;

    if (pageKey !== nextPageKey) {
      pageKey = nextPageKey;
      paginatedConnection = null;
      loadingNextPage = false;
      nextPageError = false;
    }
  });

  const additionalProfiles = $derived(
    paginatedConnection?.edges.flatMap((edge) =>
      edge.node.followee ? [{ cursor: edge.cursor, profile: edge.node.followee }] : [],
    ) ?? [],
  );
  const paginatedPageInfo = $derived(paginatedConnection?.pageInfo ?? null);

  const loadMore = async (after: string) => {
    if (loadingNextPage) {
      return;
    }

    loadingNextPage = true;
    nextPageError = false;

    const result = await loadNextConnectionPage(paginatedConnection, after, async (cursor) => {
      const result = await client.query(nextPageQueryDocument, {
        handle: page.params.handle!,
        after: cursor,
      });

      return result.profileByHandle?.following;
    });

    paginatedConnection = result.connection;
    nextPageError = result.error;
    loadingNextPage = false;
  };
</script>

<ProfileConnectionList
  kind="following"
  followingProfile={profile}
  {additionalProfiles}
  hasNextPage={paginatedPageInfo?.hasNextPage}
  endCursor={paginatedPageInfo?.endCursor}
  {loadingNextPage}
  {nextPageError}
  {viewerProfileId}
  loading={query.loading}
  error={Boolean(query.error)}
  onRetry={query.refetch}
  onLoadMore={loadMore}
/>
