<script lang="ts">
  import { usePaginationFragment, usePreloadedQuery } from '@kosmo/svelte-relay';
  import ProfileList from '$lib/components/profile-list/ProfileList.svelte';
  import { TabsHeader, TabsItem } from '$lib/components/ui/tabs';
  import type { Page_MainHandleFollowers_Fragment$key } from './__generated__/Page_MainHandleFollowers_Fragment.graphql.js';

  const { data } = $props();

  const query = usePreloadedQuery(data.query);

  const profileConnection = usePaginationFragment<Page_MainHandleFollowers_Fragment$key>(
    data.fragment,
    $query.profile,
  );
</script>

<div>
  <TabsHeader>
    <TabsItem href={`/@${$query.profile.handle}/following`}>팔로잉</TabsItem>
    <TabsItem active href={`/@${$query.profile.handle}/followers`}>팔로워</TabsItem>
  </TabsHeader>
  <ProfileList connectionFieldName="followers" store={profileConnection} />
</div>
