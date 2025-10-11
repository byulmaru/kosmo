<script lang="ts">
  import { dayjs } from '@kosmo/dayjs';
  import { useFragment } from '@kosmo/svelte-relay';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { i18n } from '$lib/i18n.svelte';
  import PostVisibilityIcon from '../PostVisibilityIcon.svelte';
  import ProfileInfo from '../profile-info/ProfileInfo.svelte';
  import { fragment } from './PostListItem.graphql';
  import type { PostListItem_Post_Fragment$key } from './__generated__/PostListItem_Post_Fragment.graphql';

  const { $post: postRef }: { $post: PostListItem_Post_Fragment$key } = $props();

  const post = useFragment(fragment, postRef);

  const postLink = $derived.by(() =>
    resolve(`/(main)/@[handle]/post/[postId]`, {
      handle: $post.author.relativeHandle,
      postId: $post.id,
    }),
  );
</script>

<div
  class="hover:bg-accent/50 border-border/50 flex cursor-pointer flex-col items-stretch gap-3 border-b px-4 py-3 transition-colors"
  onclick={() => goto(postLink)}
  onkeydown={(e) => {
    if (e.key === 'Enter') {
      goto(postLink);
    }
  }}
  role="link"
  tabindex="0"
>
  <div class="flex items-start justify-between gap-2">
    <ProfileInfo $profile={$post.author} />
    <a
      class="text-muted-foreground flex shrink-0 items-center gap-1 text-sm hover:underline"
      href={postLink}
    >
      <PostVisibilityIcon size={12} visibility={$post.visibility} />
      <time>{dayjs($post.createdAt).fromNow()}</time>
    </a>
  </div>
  <div class="min-w-0 flex-1 text-sm">
    {#if $post.replyToPost}
      <div class="text-muted-foreground mb-2 text-xs">
        {$i18n('post.replyTo')} @{$post.replyToPost.author.relativeHandle}
      </div>
    {/if}

    {#if $post.repostOfPost}
      <div class="text-muted-foreground mb-2 flex items-center gap-1 text-xs">
        <span>🔄</span>
        {$i18n('post.repost')} @{$post.repostOfPost.author.relativeHandle}
      </div>
    {/if}

    <div class="whitespace-pre-wrap leading-relaxed">
      {$post.content}
    </div>
  </div>
</div>
