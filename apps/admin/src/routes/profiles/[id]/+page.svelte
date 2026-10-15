<script lang="ts">
  import { resolve } from '$app/paths';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { safeHttpUrl } from '$lib/profile-url';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{data.profile.displayName} · Profile · Kosmo Admin Console</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="flex min-w-0 items-start gap-4">
      {#if safeHttpUrl(data.profile.avatarUrl)}
        <img
          src={safeHttpUrl(data.profile.avatarUrl) ?? undefined}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          class="size-16 shrink-0 rounded-full border object-cover"
        />
      {:else}
        <span
          aria-hidden="true"
          class="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted text-xl font-semibold"
        >
          {data.profile.displayName.trim().slice(0, 1) || '?'}
        </span>
      {/if}
      <div class="min-w-0">
        <p class="text-sm font-medium text-muted-foreground">Profile detail</p>
        <h1 class="break-all text-2xl font-semibold tracking-tight">{data.profile.displayName}</h1>
        <p class="break-all text-sm text-muted-foreground">{data.profile.relativeHandle}</p>
      </div>
    </div>
    <Button href={resolve('/profiles')} variant="outline">Profiles</Button>
  </header>

  <section aria-label="Profile counts" class="grid gap-4 sm:grid-cols-3">
    <Card.Root>
      <Card.Header class="pb-2">
        <Card.Title class="text-sm font-medium text-muted-foreground">Followers</Card.Title>
      </Card.Header>
      <Card.Content class="text-2xl font-semibold tabular-nums">
        {data.profile.followersCount}
      </Card.Content>
    </Card.Root>
    <Card.Root>
      <Card.Header class="pb-2">
        <Card.Title class="text-sm font-medium text-muted-foreground">Following</Card.Title>
      </Card.Header>
      <Card.Content class="text-2xl font-semibold tabular-nums">
        {data.profile.followingCount}
      </Card.Content>
    </Card.Root>
    <Card.Root>
      <Card.Header class="pb-2">
        <Card.Title class="text-sm font-medium text-muted-foreground">
          Posts (PUBLIC + UNLISTED)
        </Card.Title>
      </Card.Header>
      <Card.Content class="text-2xl font-semibold tabular-nums">
        <a
          href={resolve(`/profiles/${data.profile.id}/posts`)}
          aria-label={`${data.profile.postCount} PUBLIC and UNLISTED posts for ${data.profile.relativeHandle}`}
          class="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {data.profile.postCount}
        </a>
      </Card.Content>
    </Card.Root>
  </section>

  <Card.Root>
    <Card.Content class="grid gap-0 px-0">
      <dl class="divide-y">
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">ID</dt>
          <dd class="break-all font-mono text-sm">{data.profile.id}</dd>
        </div>
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">Handle</dt>
          <dd class="break-all">{data.profile.handle}</dd>
        </div>
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">Relative handle</dt>
          <dd class="break-all">{data.profile.relativeHandle}</dd>
        </div>
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">Qualified handle</dt>
          <dd class="break-all">{data.profile.qualifiedHandle || '—'}</dd>
        </div>
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">Origin</dt>
          <dd><Badge variant="outline">{data.profile.origin}</Badge></dd>
        </div>
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">State</dt>
          <dd>
            <Badge variant={data.profile.state === 'ACTIVE' ? 'default' : 'outline'}>
              {data.profile.state}
            </Badge>
          </dd>
        </div>
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">Instance domain</dt>
          <dd class="break-all">{data.profile.instanceDomain || '—'}</dd>
        </div>
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">Created at</dt>
          <dd><time datetime={data.profile.createdAt}>{data.profile.createdAt}</time></dd>
        </div>
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">Last post</dt>
          <dd>
            {#if data.profile.lastPostedAt}
              <time datetime={data.profile.lastPostedAt}>{data.profile.lastPostedAt}</time>
            {:else}
              —
            {/if}
          </dd>
        </div>
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">Bio</dt>
          <dd class="whitespace-pre-wrap break-all">{data.profile.bio || '—'}</dd>
        </div>
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">Header URL</dt>
          <dd class="min-w-0 space-y-2 break-all">
            {#if data.profile.headerUrl}
              {#if safeHttpUrl(data.profile.headerUrl)}
                <img
                  src={safeHttpUrl(data.profile.headerUrl) ?? undefined}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  referrerpolicy="no-referrer"
                  class="aspect-[3/1] max-h-60 w-full rounded-md border object-cover"
                />
                <a
                  href={safeHttpUrl(data.profile.headerUrl) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="rounded-sm text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {data.profile.headerUrl}
                </a>
              {:else}
                {data.profile.headerUrl}
              {/if}
            {:else}
              —
            {/if}
          </dd>
        </div>
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">Remote URL</dt>
          <dd class="break-all">
            {#if data.profile.remoteUrl}
              {#if safeHttpUrl(data.profile.remoteUrl)}
                <a
                  href={safeHttpUrl(data.profile.remoteUrl) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {data.profile.remoteUrl}
                </a>
              {:else}
                {data.profile.remoteUrl}
              {/if}
            {:else}
              —
            {/if}
          </dd>
        </div>
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">Tags</dt>
          <dd>
            {#if data.profile.tags.length > 0}
              <ul class="flex flex-wrap gap-2">
                {#each data.profile.tags as tag (tag)}
                  <li>
                    <Badge variant="outline" class="h-auto max-w-full whitespace-normal break-all">
                      #{tag}
                    </Badge>
                  </li>
                {/each}
              </ul>
            {:else}
              —
            {/if}
          </dd>
        </div>
      </dl>
    </Card.Content>
  </Card.Root>
</div>
