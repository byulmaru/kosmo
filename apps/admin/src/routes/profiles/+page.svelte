<script lang="ts">
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import * as Table from '#lib/components/ui/table/index.js';
  import { safeHttpUrl } from '#lib/profile-url.js';
  import { resolve } from '$app/paths';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  function cursorHref(cursor: string, direction: 'previous' | undefined) {
    const params = new SvelteURLSearchParams();
    if (data.filters.q) {
      params.set('q', data.filters.q);
    }
    if (data.filters.origin) {
      params.set('origin', data.filters.origin);
    }
    if (data.filters.state) {
      params.set('state', data.filters.state);
    }
    params.set('cursor', cursor);
    if (direction) {
      params.set('direction', direction);
    }

    return resolve(`/profiles?${params.toString()}`);
  }
</script>

<svelte:head>
  <title>Profiles · Kosmo Admin Console</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
  <header>
    <p class="text-sm font-medium text-muted-foreground">Admin Console</p>
    <h1 id="profiles-heading" class="text-2xl font-semibold tracking-tight">Profiles</h1>
  </header>

  <form
    method="GET"
    action={resolve('/profiles')}
    class="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_auto] lg:items-end"
  >
    <label for="profile-search" class="grid gap-2 text-sm font-medium">
      검색
      <Input id="profile-search" type="search" name="q" value={data.filters.q ?? ''} />
    </label>

    <label for="profile-origin" class="grid gap-2 text-sm font-medium">
      Origin
      <select
        id="profile-origin"
        name="origin"
        value={data.filters.origin ?? ''}
        class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <option value="">All origins</option>
        <option value="LOCAL">LOCAL</option>
        <option value="REMOTE">REMOTE</option>
      </select>
    </label>

    <label for="profile-state" class="grid gap-2 text-sm font-medium">
      State
      <select
        id="profile-state"
        name="state"
        value={data.filters.state ?? ''}
        class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <option value="">All states</option>
        <option value="ACTIVE">ACTIVE</option>
        <option value="DISABLED">DISABLED</option>
        <option value="SUSPENDED">SUSPENDED</option>
      </select>
    </label>

    <Button type="submit" class="w-full sm:w-auto">적용</Button>
  </form>

  <div role="region" aria-labelledby="profiles-heading" class="overflow-hidden rounded-lg border">
    <Table.Root class="min-w-[68rem]">
      <Table.Header>
        <Table.Row>
          <Table.Head class="min-w-72">Profile</Table.Head>
          <Table.Head class="w-28">Origin</Table.Head>
          <Table.Head class="w-32">State</Table.Head>
          <Table.Head class="w-28 text-right">Followers</Table.Head>
          <Table.Head class="w-28 text-right">Following</Table.Head>
          <Table.Head class="w-44 text-right">Posts (PUBLIC + UNLISTED)</Table.Head>
          <Table.Head class="w-56">Last post</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each data.profiles as profile (profile.id)}
          <Table.Row>
            <Table.Cell>
              <a
                href={resolve('/profiles/[id]', { id: profile.id })}
                class="flex min-w-0 items-center gap-3 rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {#if safeHttpUrl(profile.avatarUrl)}
                  <img
                    src={safeHttpUrl(profile.avatarUrl) ?? undefined}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    referrerpolicy="no-referrer"
                    class="size-9 shrink-0 rounded-full border object-cover"
                  />
                {:else}
                  <span
                    aria-hidden="true"
                    class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold"
                  >
                    {profile.displayName.trim().slice(0, 1) || '?'}
                  </span>
                {/if}
                <span class="grid min-w-0 gap-0.5">
                  <span class="break-all font-medium">{profile.displayName}</span>
                  <span class="break-all text-sm text-muted-foreground"
                    >{profile.relativeHandle}</span
                  >
                </span>
              </a>
            </Table.Cell>
            <Table.Cell><Badge variant="outline">{profile.origin}</Badge></Table.Cell>
            <Table.Cell>
              <Badge variant={profile.state === 'ACTIVE' ? 'default' : 'outline'}>
                {profile.state}
              </Badge>
            </Table.Cell>
            <Table.Cell class="text-right tabular-nums">{profile.followersCount}</Table.Cell>
            <Table.Cell class="text-right tabular-nums">{profile.followingCount}</Table.Cell>
            <Table.Cell class="text-right tabular-nums">
              <a
                href={resolve('/profiles/[id]/posts', { id: profile.id })}
                aria-label={`${profile.postCount} PUBLIC and UNLISTED posts for ${profile.relativeHandle}`}
                class="rounded-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {profile.postCount}
              </a>
            </Table.Cell>
            <Table.Cell>
              {#if profile.lastPostedAt}
                <time datetime={profile.lastPostedAt}>{profile.lastPostedAt}</time>
              {:else}
                —
              {/if}
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>

  {#if data.previousCursor || data.nextCursor}
    <nav aria-label="Profiles pagination" class="flex justify-end gap-2">
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
