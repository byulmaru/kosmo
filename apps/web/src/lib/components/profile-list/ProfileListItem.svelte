<script lang="ts">
  import { ProfileRelationshipState } from '@kosmo/enum';
  import { useFragment } from '@kosmo/svelte-relay';
  import { Avatar, AvatarImage } from '$lib/components/ui/avatar';
  import { i18n } from '$lib/i18n.svelte';
  import FollowButton from '../follow-button/FollowButton.svelte';
  import { fragment } from './ProfileListItem.graphql';
  import type { ProfileListItem_Profile_Fragment$key } from './__generated__/ProfileListItem_Profile_Fragment.graphql';

  const { $profile: profileRef }: { $profile: ProfileListItem_Profile_Fragment$key } = $props();

  const profile = useFragment(fragment, profileRef);
</script>

<a
  class="hover:bg-muted/50 border-border/50 flex cursor-pointer items-start gap-3 border-b px-4 py-3 transition-colors"
  href={`/@${$profile.relativeHandle}`}
>
  <Avatar class="size-12 flex-shrink-0">
    <AvatarImage alt={$profile.displayName} src="https://placehold.co/400x400" />
  </Avatar>

  <div class="min-w-0 flex-1 text-sm">
    <div class="flex items-center justify-between">
      <div class="flex flex-col items-start">
        <h3 class="truncate font-bold">{$profile.displayName}</h3>
        <span class="text-muted-foreground">
          @{$profile.fullHandle}
          {#if $profile.relationship.from === ProfileRelationshipState.FOLLOW}
            <span class="text-muted-foreground/60 bg-muted rounded-md px-1 py-0.5 text-xs">
              {$profile.relationship.to === ProfileRelationshipState.FOLLOW
                ? $i18n('profile.status.followEachOther')
                : $i18n('profile.status.followsYou')}
            </span>
          {/if}
        </span>
      </div>
      <FollowButton {$profile} />
    </div>

    {#if $profile.description}
      <p class="text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{$profile.description}</p>
    {/if}
  </div>
</a>
