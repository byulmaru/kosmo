<script lang="ts">
  import { useFragment } from '@kosmo/svelte-relay';
  import FollowButton from '../follow-button/FollowButton.svelte';
  import ProfileInfo from '../profile-info/ProfileInfo.svelte';
  import { fragment } from './ProfileListItem.graphql';
  import type { ProfileListItem_Profile_Fragment$key } from './__generated__/ProfileListItem_Profile_Fragment.graphql';

  const { $profile: profileRef }: { $profile: ProfileListItem_Profile_Fragment$key } = $props();

  const profile = useFragment(fragment, profileRef);
</script>

<div
  class="hover:bg-muted/50 border-border/50 flex items-start gap-3 border-b p-3 transition-colors"
>
  <div class="min-w-0 flex-1">
    <div class="flex justify-between gap-2">
      <div class="min-w-0 flex-1">
        <ProfileInfo {$profile} />
      </div>
      <FollowButton {$profile} />
    </div>

    {#if $profile.description}
      <p class="text-muted-foreground mt-2 line-clamp-2 text-sm leading-relaxed">
        {$profile.description}
      </p>
    {/if}
  </div>
</div>
