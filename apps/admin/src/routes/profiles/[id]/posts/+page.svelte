<script lang="ts">
  import { resolve } from '$app/paths';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const kindLabels = {
    POST: 'Post',
    REPLY: 'Reply',
    QUOTE: 'Quote',
    REPOST: 'Repost',
    REPLY_QUOTE: '답글·인용',
  } satisfies Record<PageData['posts'][number]['kind'], string>;

  function cursorHref(cursor: string, direction: 'previous' | undefined) {
    const params = new URLSearchParams({ cursor });
    if (direction) params.set('direction', direction);

    return resolve(`/profiles/${data.profile.id}/posts?${params.toString()}`);
  }
</script>

<svelte:head>
  <title>Posts · {data.profile.displayName} · Kosmo Admin Console</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
      <p class="min-w-0 break-all text-sm font-medium text-muted-foreground">
        {data.profile.relativeHandle}
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <h1 id="posts-heading" class="break-all text-2xl font-semibold tracking-tight">Posts</h1>
        <Badge variant="outline">PUBLIC + UNLISTED</Badge>
      </div>
      <p class="break-all text-sm text-muted-foreground">{data.profile.displayName}</p>
    </div>
    <Button href={resolve(`/profiles/${data.profile.id}`)} variant="outline">Profile</Button>
  </header>

  <section aria-labelledby="posts-heading" class="grid gap-4">
    {#each data.posts as post (post.id)}
      <Card.Root>
        <Card.Header class="flex flex-wrap flex-row items-start justify-between gap-3">
          <div class="flex min-w-0 flex-wrap gap-2">
            <Badge variant="outline">{kindLabels[post.kind]}</Badge>
            <Badge variant="outline">{post.visibility}</Badge>
            {#if post.sensitive}
              <Badge variant="outline">Sensitive</Badge>
            {/if}
            {#if post.mediaCount > 0}
              <Badge variant="outline">Media {post.mediaCount}</Badge>
            {/if}
          </div>
          <time datetime={post.createdAt} class="break-all text-sm text-muted-foreground">
            {post.createdAt}
          </time>
        </Card.Header>
        <Card.Content class="grid min-w-0 gap-3">
          <p class="break-all font-mono text-xs text-muted-foreground">ID {post.id}</p>
          {#if post.summary}
            <div class="min-w-0">
              <p class="text-sm font-medium text-muted-foreground">Content warning</p>
              <p class="whitespace-pre-wrap break-all">{post.summary}</p>
            </div>
          {/if}
          {#if post.bodyText}
            <p class="whitespace-pre-wrap break-all">{post.bodyText}</p>
          {/if}
        </Card.Content>
      </Card.Root>
    {/each}
  </section>

  {#if data.previousCursor || data.nextCursor}
    <nav aria-label="Posts pagination" class="flex justify-end gap-2">
      {#if data.previousCursor}
        <Button href={cursorHref(data.previousCursor, 'previous')} size="sm" variant="outline">
          이전 50개
        </Button>
      {/if}
      {#if data.nextCursor}
        <Button href={cursorHref(data.nextCursor, undefined)} size="sm" variant="outline">
          다음 50개
        </Button>
      {/if}
    </nav>
  {/if}
</div>
