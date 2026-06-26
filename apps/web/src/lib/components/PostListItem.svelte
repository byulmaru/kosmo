<script lang="ts">
  import { formatTimelineTimestamp } from '@kosmo/core/datetime';
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { Temporal } from 'temporal-polyfill';

  import type { PostListItem_post$key } from '$mearie';

  import { tv } from '$lib/tv';
  import { getProfileInitial } from '$lib/utils/profile';

  import Avatar from './Avatar.svelte';
  import PostBody from './PostBody.svelte';
  import ProfileNameBlock from './ProfileNameBlock.svelte';

  type Props = Omit<HTMLAttributes<HTMLElement>, 'class'> & {
    post: PostListItem_post$key;
    class?: string | null;
  };

  let { post, class: className, ...attributes }: Props = $props();

  const postFragment = createFragment(
    graphql(`
      fragment PostListItem_post on Post {
        id
        createdAt
        profile {
          id
          handle
          displayName
          ...ProfileNameBlock_profile
        }
        ...PostBody_post
      }
    `),
    () => post,
  );

  const formattedCreatedAt = $derived(
    formatTimelineTimestamp(Temporal.Instant.from(postFragment.data.createdAt as string)),
  );
  const detailHref = $derived(`/@${postFragment.data.profile.handle}/${postFragment.data.id}`);
  const profileHref = $derived(`/@${postFragment.data.profile.handle}`);
  const initials = $derived(
    getProfileInitial(postFragment.data.profile.displayName, postFragment.data.profile.handle),
  );

  const postListItem = tv({
    slots: {
      card: 'border-border border-b px-2 pt-2 pb-4',
      grid: 'grid grid-cols-[auto_1fr] gap-x-3 gap-y-1',
      avatar:
        'focus-visible:outline-more self-start rounded-full focus-visible:outline-2 focus-visible:outline-offset-2',
      header: 'flex min-w-0 items-start justify-between gap-2',
      thread: 'w-12 self-stretch',
      body: 'focus-visible:outline-more text-text-primary min-w-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2',
      time: 'focus-visible:outline-more text-text-secondary shrink-0 rounded-md text-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2',
    },
  });

  const slots = postListItem();
</script>

<article {...attributes} class={slots.card({ class: className })}>
  <div class={slots.grid()}>
    <a class={slots.avatar()} href={profileHref} tabindex="-1" aria-hidden="true">
      <Avatar size="lg" {initials} />
    </a>

    <div class={slots.header()}>
      <ProfileNameBlock href={profileHref} profile={postFragment.data.profile} />
      <a class={slots.time()} href={detailHref}>
        <time datetime={postFragment.data.createdAt as string}>
          {formattedCreatedAt}
        </time>
      </a>
    </div>

    <div class={slots.thread()} aria-hidden="true"></div>

    <a class={slots.body()} href={detailHref}>
      <PostBody post={postFragment.data} size="md" />
    </a>
  </div>
</article>
