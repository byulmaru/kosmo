<script lang="ts">
  import { usePaginationFragment, usePreloadedQuery } from '@kosmo/svelte-relay';
  import ProfileList from '$lib/components/profile-list/ProfileList.svelte';
  import { TabsHeader, TabsItem } from '$lib/components/ui/tabs';
  import type { Page_MainHandleFollowing_Fragment$key } from './__generated__/Page_MainHandleFollowing_Fragment.graphql.js';

  const { data } = $props();

  const query = usePreloadedQuery(data.query);

  const profileConnection = usePaginationFragment<Page_MainHandleFollowing_Fragment$key>(
    data.fragment,
    $query.profile,
  );
</script>

<div>
  <TabsHeader>
    <TabsItem active href={`/@${$query.profile.handle}/following`}>팔로잉</TabsItem>
    <TabsItem href={`/@${$query.profile.handle}/followers`}>팔로워</TabsItem>
  </TabsHeader>
  <ProfileList connectionFieldName="following" store={profileConnection} />
</div>
