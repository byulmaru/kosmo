<script lang="ts">
  import { dayjs } from '@kosmo/dayjs';
  import { usePreloadedQuery } from '@kosmo/svelte-relay';
  import Avatar from '$lib/components/avatar/Avatar.svelte';
  import PageHeader from '$lib/components/header/DefaultHeader.svelte';
  import { i18n } from '$lib/i18n.svelte';

  const { data } = $props();

  const query = usePreloadedQuery(data.query);
</script>

<PageHeader showBackButton={true} title={$i18n('post.detail')} />

{#if $query.node?.__typename === 'Post'}
  {@const post = $query.node}
  <article class="border-border/50 border-b px-4 py-6">
    <div class="flex items-start gap-3">
      <Avatar class="size-14 flex-shrink-0" $profile={post.author} />

      <div class="min-w-0 flex-1">
        <div class="mb-2">
          <h1 class="text-lg font-bold">{post.author.displayName}</h1>
          <span class="text-muted-foreground">@{post.author.fullHandle}</span>
        </div>

        {#if post.replyToPost}
          <div class="text-muted-foreground mb-3 rounded-lg border p-3 text-sm">
            <div class="mb-1 font-medium">
              {$i18n('post.replyTo')} @{post.replyToPost.author.relativeHandle}
            </div>
            <p class="line-clamp-3">{post.replyToPost.content}</p>
          </div>
        {/if}

        {#if post.repostOfPost}
          <div class="text-muted-foreground mb-3 rounded-lg border p-3 text-sm">
            <div class="mb-1 flex items-center gap-1 font-medium">
              <span>🔄</span>
              {$i18n('post.repost')} @{post.repostOfPost.author.relativeHandle}
            </div>
            <p class="line-clamp-3">{post.repostOfPost.content}</p>
          </div>
        {/if}

        <div class="mb-4 whitespace-pre-wrap text-lg leading-relaxed">
          {post.content}
        </div>

        <time class="text-muted-foreground text-sm">
          {dayjs(post.createdAt).format('LLL')}
        </time>
      </div>
    </div>
  </article>
{:else}
  <div class="text-muted-foreground py-12 text-center">
    <p>{$i18n('post.notFound')}</p>
  </div>
{/if}
