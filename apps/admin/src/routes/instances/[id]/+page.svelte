<script lang="ts">
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import ModerationAction from '#lib/components/moderation-action.svelte';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import * as Card from '#lib/components/ui/card/index.js';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData | null } = $props();

  function listSearchParams() {
    const params = new SvelteURLSearchParams(page.url.search);
    for (const key of [...params.keys()]) {
      if (key.startsWith('/')) {
        params.delete(key);
      }
    }

    return params;
  }

  function instancesHref() {
    const query = listSearchParams().toString();
    return `${resolve('/instances')}${query ? `?${query}` : ''}`;
  }

  function actionHref(action: 'suspend' | 'restore') {
    const params = listSearchParams();
    params.set(`/${action}`, '');
    return `${resolve('/instances/[id]', { id: data.instance.id })}?${params.toString()}`;
  }

  const profilesHref = $derived(
    resolve(`/profiles?instanceDomain=${encodeURIComponent(data.instance.domain)}`),
  );
</script>

<svelte:head>
  <title>{data.instance.domain} · Instance · Kosmo Admin Console</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
      <p class="text-sm font-medium text-muted-foreground">Instance detail</p>
      <h1 class="break-all text-2xl font-semibold tracking-tight">{data.instance.domain}</h1>
    </div>
    <Button href={instancesHref()} variant="outline">Instances</Button>
  </header>

  <Card.Root>
    <Card.Content class="grid gap-0 px-0">
      <dl class="divide-y">
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">State</dt>
          <dd class="grid justify-items-start gap-2">
            <Badge variant={data.instance.state === 'ACTIVE' ? 'default' : 'outline'}>
              {data.instance.state}
            </Badge>
            {#if data.instance.moderationAction === 'SUSPEND'}
              <ModerationAction
                action="suspend"
                actionHref={actionHref('suspend')}
                targetKind="instance"
                targetName={data.instance.domain}
              />
            {:else if data.instance.moderationAction === 'RESTORE'}
              <ModerationAction
                action="restore"
                actionHref={actionHref('restore')}
                targetKind="instance"
                targetName={data.instance.domain}
              />
            {/if}
            {#if form && 'moderationSuccess' in form}
              <p role="status" class="text-sm text-muted-foreground">
                {form.moderationSuccess === 'suspended'
                  ? 'Instance suspended.'
                  : 'Instance restored.'}
              </p>
            {:else if form && 'moderationError' in form}
              <p role="alert" class="text-sm text-destructive">{form.moderationError}</p>
            {/if}
          </dd>
        </div>
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">Stored profiles</dt>
          <dd class="tabular-nums">
            <a
              href={profilesHref}
              aria-label={`${data.instance.profileCount} profiles on ${data.instance.domain}`}
              class="rounded-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {data.instance.profileCount}
            </a>
          </dd>
        </div>
        {#if data.instance.state === 'SUSPENDED' && data.instance.suspensionReason}
          <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
            <dt class="text-sm font-medium text-muted-foreground">Suspension reason</dt>
            <dd class="whitespace-pre-wrap break-all">{data.instance.suspensionReason}</dd>
          </div>
        {/if}
      </dl>
    </Card.Content>
  </Card.Root>
</div>
