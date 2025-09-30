<script lang="ts">
  import { useFragment } from '@kosmo/svelte-relay';
  import { resolve } from '$app/paths';
  import ProfileAvatar from '$lib/components/avatar/Avatar.svelte';
  import { cn } from '../utils';
  import { fragment } from './ProfileInfo.graphql';
  import type { ProfileInfo_Profile_Fragment$key } from './__generated__/ProfileInfo_Profile_Fragment.graphql';

  const {
    $profile: profileRef,
    class: className,
  }: { $profile: ProfileInfo_Profile_Fragment$key; class?: string } = $props();

  const profile = useFragment(fragment, profileRef);
</script>

{#snippet profileInfo()}
  <div class={cn('group flex items-center gap-3', className)}>
    <ProfileAvatar class="size-10" {$profile} />
    <div class="min-w-0 flex-1">
      <div class="text-sm font-semibold group-hover:underline">{$profile.displayName}</div>
      <div class="text-muted-foreground text-xs">
        @{$profile.fullHandle}
      </div>
    </div>
  </div>
{/snippet}

<a href={resolve(`/(main)/@[handle]`, { handle: $profile.relativeHandle })}>
  {@render profileInfo()}
</a>
