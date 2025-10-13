<script lang="ts">
  import { useFragment } from '@kosmo/svelte-relay';
  import { base64 } from 'rfc4648';
  import { thumbHashToDataURL } from 'thumbhash';
  import * as AvatarUi from '$lib/components/ui/avatar';
  import { fragment } from './Avatar.graphql';
  import type { Avatar_Profile_Fragment$key } from './__generated__/Avatar_Profile_Fragment.graphql';

  const {
    $profile: profileRef,
    class: className,
  }: { $profile: Avatar_Profile_Fragment$key; class: string } = $props();

  const profile = useFragment(fragment, profileRef);
</script>

<AvatarUi.Root class={className}>
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
</AvatarUi.Root>
