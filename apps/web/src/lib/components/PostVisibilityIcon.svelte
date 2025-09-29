<script lang="ts">
  import { PostVisibility } from '@kosmo/enum';
  import { AtSignIcon, EarthIcon, LockIcon, MoonIcon } from '@lucide/svelte';
  import type { IconProps } from '@lucide/svelte';
  import type { Component } from 'svelte';

  const POST_VISIBILITY_ICON = {
    [PostVisibility.PUBLIC]: EarthIcon,
    [PostVisibility.UNLISTED]: MoonIcon,
    [PostVisibility.FOLLOWER]: LockIcon,
    [PostVisibility.DIRECT]: AtSignIcon,
  } satisfies Record<PostVisibility, Component>;

  const { visibility, ...restProps }: { visibility: PostVisibility } & IconProps = $props();
  const PostVisibilityIcon = $derived(POST_VISIBILITY_ICON[visibility]);
</script>

<PostVisibilityIcon {...restProps} />
