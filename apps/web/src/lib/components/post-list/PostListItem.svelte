<script lang="ts">
  import { dayjs } from '@kosmo/dayjs';
  import { useFragment } from '@kosmo/svelte-relay';
  import { resolve } from '$app/paths';
  import Avatar from '$lib/components/avatar/Avatar.svelte';
  import { i18n } from '$lib/i18n.svelte';
  import { fragment } from './PostListItem.graphql';
  import type { PostListItem_Post_Fragment$key } from './__generated__/PostListItem_Post_Fragment.graphql';

  const { $post: postRef }: { $post: PostListItem_Post_Fragment$key } = $props();

  const post = useFragment(fragment, postRef);
</script>

<a
  class="hover:bg-muted/50 border-border/50 flex cursor-pointer items-start gap-3 border-b px-4 py-3 transition-colors"
  href={resolve(`/(main)/@[handle]/post/[postId]`, {
    handle: $post.author.relativeHandle,
    postId: $post.id,
  })}
>
  <Avatar class="size-12 flex-shrink-0" $profile={$post.author} />

  <div class="min-w-0 flex-1 text-sm">
    <div class="mb-1 flex items-center gap-2">
      <h3 class="font-bold">{$post.author.displayName}</h3>
      <span class="text-muted-foreground">@{$post.author.fullHandle}</span>
      <span class="flex-1"></span>
      <time class="text-muted-foreground">
        {dayjs($post.createdAt).fromNow()}
      </time>
    </div>

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
</a>
