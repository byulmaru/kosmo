<script lang="ts">
  import { useFragment } from '@kosmo/svelte-relay';
  import { base64 } from 'rfc4648';
  import { thumbHashToDataURL } from 'thumbhash';
  import { resolve } from '$app/paths';
  import * as AvatarUi from '$lib/components/ui/avatar';
  import { fragment } from './Avatar.graphql';
  import type { Avatar_Profile_Fragment$key } from './__generated__/Avatar_Profile_Fragment.graphql';

  const {
    $profile: profileRef,
    class: className,
    link = true,
  }: { $profile: Avatar_Profile_Fragment$key; class: string; link?: boolean } = $props();

  const profile = useFragment(fragment, profileRef);
</script>

{#snippet avatarImage()}
  <AvatarUi.Image alt={$profile.avatar.url} src={$profile.avatar.url} />
  {#if $profile.avatar.placeholder}
    <AvatarUi.Fallback>
      <img
        class="size-full"
        alt={$profile.avatar.url}
        src={thumbHashToDataURL(base64.parse($profile.avatar.placeholder))}
      />
    </AvatarUi.Fallback>
  {/if}
{/snippet}

<AvatarUi.Root class={className}>
  {#if link}
    <a
      class="hover:brightness-80 cursor-pointer rounded-full"
      href={resolve('/(main)/@[handle]', { handle: $profile.relativeHandle })}
    >
      {@render avatarImage()}
    </a>
  {:else}
    {@render avatarImage()}
  {/if}
</AvatarUi.Root>
