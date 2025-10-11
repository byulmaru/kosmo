<script lang="ts" module>
  import { tv } from 'tailwind-variants';
  import type { VariantProps } from 'tailwind-variants';
  import type { ProfileInfo_Profile_Fragment$key } from './__generated__/ProfileInfo_Profile_Fragment.graphql';

  export const profileInfoVariants = tv({
    slots: {
      root: 'group flex items-center shrink min-w-30',
      avatar: '',
      displayName: 'group-hover:underline truncate',
      handle: 'text-muted-foreground truncate',
    },
    variants: {
      size: {
        default: {
          root: 'gap-2',
          avatar: 'size-10',
          displayName: 'text-sm font-semibold',
          handle: 'text-xs',
        },
        lg: {
          root: 'gap-3',
          avatar: 'size-12',
          displayName: 'text-lg font-bold',
          handle: 'text-sm',
        },
      },
    },
    defaultVariants: {
      size: 'default',
    },
  });

  export type ProfileInfoSize = VariantProps<typeof profileInfoVariants>['size'];

  export type ProfileInfoProps = {
    $profile: ProfileInfo_Profile_Fragment$key;
    class?: string;
    size?: ProfileInfoSize;
  };
</script>

<script lang="ts">
  import { useFragment } from '@kosmo/svelte-relay';
  import { resolve } from '$app/paths';
  import ProfileAvatar from '$lib/components/avatar/Avatar.svelte';
  import { cn } from '../utils';
  import { fragment } from './ProfileInfo.graphql';

  const { $profile: profileRef, class: className, size = 'default' }: ProfileInfoProps = $props();

  const profile = useFragment(fragment, profileRef);

  const styles = $derived(profileInfoVariants({ size }));
</script>

<a
  class={cn(styles.root(), className)}
  href={resolve(`/(main)/@[handle]`, { handle: $profile.relativeHandle })}
>
  <ProfileAvatar class={styles.avatar()} {$profile} />
  <div class="min-w-0 shrink">
    <div class={styles.displayName()}>{$profile.displayName}</div>
    <div class={styles.handle()}>
      @{$profile.fullHandle}
    </div>
  </div>
</a>
