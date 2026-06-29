<script lang="ts">
  import { page } from '$app/state';
  import { createQuery } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import ProfileConnectionList from '$lib/components/ProfileConnectionList.svelte';

  const query = createQuery(
    graphql(`
      query ProfileFollowersPageQuery($handle: String!) {
        currentSession {
          id
          selectedProfile {
            id
          }
        }
        profileByHandle(handle: $handle) {
          id
          ...ProfileConnectionList_followersProfile
        }
      }
    `),
    () => ({ handle: page.params.handle! }),
  );

  const profile = $derived(query.data?.profileByHandle ?? null);
  const viewerProfileId = $derived(query.data?.currentSession?.selectedProfile?.id ?? null);
</script>

<ProfileConnectionList
  kind="followers"
  followersProfile={profile}
  {viewerProfileId}
  loading={query.loading}
  error={Boolean(query.error)}
  onRetry={query.refetch}
/>
