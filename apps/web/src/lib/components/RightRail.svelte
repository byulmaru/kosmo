<script lang="ts">
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import PostComposer from './PostComposer.svelte';
  import type { RightRail_profile$key } from '$mearie';

  type Props = {
    profile: RightRail_profile$key;
  };

  let { profile }: Props = $props();

  const profileFragment = createFragment(
    graphql(`
      fragment RightRail_profile on Profile {
        ...PostComposer_profile
      }
    `),
    () => profile,
  );
</script>

<div class="flex w-full flex-col gap-4">
  <PostComposer profile={profileFragment.data} />
</div>
