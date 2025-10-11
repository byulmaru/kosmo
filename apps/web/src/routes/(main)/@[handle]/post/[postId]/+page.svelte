<script lang="ts">
  import { dayjs } from '@kosmo/dayjs';
  import { usePreloadedQuery } from '@kosmo/svelte-relay';
  import PageHeader from '$lib/components/header/DefaultHeader.svelte';
  import ProfileInfo from '$lib/components/profile-info/ProfileInfo.svelte';
  import { i18n } from '$lib/i18n.svelte';

  const { data } = $props();

  const query = usePreloadedQuery(data.query);
</script>

<PageHeader showBackButton={true} title={$i18n('post.detail')} />

{#if $query.node?.__typename === 'Post'}
  {@const post = $query.node}
  <article class="border-border/50 border-b p-4">
    <ProfileInfo class="mb-2" $profile={post.author} size="lg" />

    <div>
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
  </article>
{:else}
  <div class="text-muted-foreground py-12 text-center">
    <p>{$i18n('post.notFound')}</p>
  </div>
{/if}
