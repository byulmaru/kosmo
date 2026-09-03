<script lang="ts">
  import { resolve } from '$app/paths';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{data.account.displayName} · Account · Kosmo Admin Console</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <p class="text-sm font-medium text-muted-foreground">Account detail</p>
      <h1 class="text-2xl font-semibold tracking-tight">{data.account.displayName}</h1>
      <p class="mt-1 text-sm text-muted-foreground">읽기 전용 Account 상세</p>
    </div>
    <Button href={resolve('/accounts')} variant="outline">Accounts</Button>
  </header>

  <Card.Root>
    <Card.Content class="grid gap-0 px-0">
      <dl class="divide-y">
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_1fr] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">ID</dt>
          <dd class="break-all">{data.account.id}</dd>
        </div>
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_1fr] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">Display name</dt>
          <dd>{data.account.displayName}</dd>
        </div>
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_1fr] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">State</dt>
          <dd>
            <Badge variant={data.account.state === 'ACTIVE' ? 'default' : 'outline'}>
              {data.account.state}
            </Badge>
          </dd>
        </div>
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_1fr] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">Created at</dt>
          <dd><time datetime={data.account.createdAt}>{data.account.createdAt}</time></dd>
        </div>
        <div class="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_1fr] sm:gap-4">
          <dt class="text-sm font-medium text-muted-foreground">OIDC subject</dt>
          <dd class="break-all font-mono text-sm">{data.account.oidcSubject}</dd>
        </div>
      </dl>
    </Card.Content>
  </Card.Root>
</div>
