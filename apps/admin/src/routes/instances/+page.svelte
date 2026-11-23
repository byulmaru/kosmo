<script lang="ts">
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import ModerationAction from '#lib/components/moderation-action.svelte';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import * as Table from '#lib/components/ui/table/index.js';
  import { resolve } from '$app/paths';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData | null } = $props();

  function cursorHref(cursor: string, direction: 'previous' | undefined) {
    const params = new SvelteURLSearchParams();
    if (data.filters.q) {
      params.set('q', data.filters.q);
    }
    if (data.filters.state) {
      params.set('state', data.filters.state);
    }
    params.set('cursor', cursor);
    if (direction) {
      params.set('direction', direction);
    }

    return resolve(`/instances?${params.toString()}`);
  }

  function actionHref(action: 'suspend' | 'restore') {
    const params = new SvelteURLSearchParams();
    if (data.filters.q) {
      params.set('q', data.filters.q);
    }
    if (data.filters.state) {
      params.set('state', data.filters.state);
    }
    if (data.filters.cursor) {
      params.set('cursor', data.filters.cursor);
    }
    if (data.filters.direction) {
      params.set('direction', data.filters.direction);
    }
    params.set(`/${action}`, '');

    return `${resolve('/instances')}?${params.toString()}`;
  }
</script>

<svelte:head>
  <title>Instances · Kosmo Admin Console</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
  <header>
    <p class="text-sm font-medium text-muted-foreground">Admin Console</p>
    <h1 id="instances-heading" class="text-2xl font-semibold tracking-tight">Instances</h1>
  </header>

  <form
    method="GET"
    action={resolve('/instances')}
    class="grid gap-3 rounded-lg border p-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"
  >
    <label for="instance-search" class="grid gap-2 text-sm font-medium">
      Domain
      <Input id="instance-search" type="search" name="q" value={data.filters.q} />
    </label>

    <label for="instance-state" class="grid gap-2 text-sm font-medium">
      State
      <select
        id="instance-state"
        name="state"
        value={data.filters.state}
        class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <option value="">All states</option>
        <option value="ACTIVE">ACTIVE</option>
        <option value="UNRESPONSIVE">UNRESPONSIVE</option>
        <option value="SUSPENDED">SUSPENDED</option>
      </select>
    </label>

    <Button type="submit" class="w-full sm:w-auto">적용</Button>
  </form>

  <div role="region" aria-labelledby="instances-heading" class="overflow-hidden rounded-lg border">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head>Domain</Table.Head>
          <Table.Head class="w-40">Stored state</Table.Head>
          <Table.Head class="w-40 text-right">Stored profiles</Table.Head>
          <Table.Head class="w-36">Actions</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each data.instances as instance (instance.id)}
          <Table.Row>
            <Table.Cell class="break-all font-medium">{instance.domain}</Table.Cell>
            <Table.Cell>
              <div class="grid justify-items-start gap-1">
                <Badge variant={instance.state === 'ACTIVE' ? 'default' : 'outline'}>
                  {instance.state}
                </Badge>
                {#if instance.suspensionReason}
                  <span
                    class="max-w-64 whitespace-pre-wrap break-all text-xs text-muted-foreground"
                  >
                    {instance.suspensionReason}
                  </span>
                {/if}
              </div>
            </Table.Cell>
            <Table.Cell class="text-right tabular-nums">
              <a
                href={resolve(`/profiles?instanceDomain=${encodeURIComponent(instance.domain)}`)}
                aria-label={`${instance.profileCount} profiles on ${instance.domain}`}
                class="rounded-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {instance.profileCount}
              </a>
            </Table.Cell>
            <Table.Cell>
              {#if instance.moderationAction === 'SUSPEND'}
                <ModerationAction
                  action="suspend"
                  actionHref={actionHref('suspend')}
                  targetId={instance.id}
                  targetKind="instance"
                  targetName={instance.domain}
                />
              {:else if instance.moderationAction === 'RESTORE'}
                <ModerationAction
                  action="restore"
                  actionHref={actionHref('restore')}
                  targetId={instance.id}
                  targetKind="instance"
                  targetName={instance.domain}
                />
              {:else}
                —
              {/if}
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>

  {#if form && 'moderationSuccess' in form}
    <p role="status" class="text-sm text-muted-foreground">
      {form.moderationSuccess === 'suspended' ? 'Instance suspended.' : 'Instance restored.'}
    </p>
  {:else if form && 'moderationError' in form}
    <p role="alert" class="text-sm text-destructive">{form.moderationError}</p>
  {/if}

  {#if data.previousCursor || data.nextCursor}
    <nav aria-label="Instance pagination" class="flex justify-end gap-2">
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
