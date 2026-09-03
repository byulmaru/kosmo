<script lang="ts">
  import { resolve } from '$app/paths';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Table from '$lib/components/ui/table';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Accounts · Kosmo Admin Console</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
  <header>
    <p class="text-sm font-medium text-muted-foreground">Admin Console</p>
    <h1 class="text-2xl font-semibold tracking-tight">Accounts</h1>
    <p class="mt-1 text-sm text-muted-foreground">Account 목록 · 읽기 전용</p>
  </header>

  {#if data.accounts.length === 0}
    <div class="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
      Account가 없습니다.
    </div>
  {:else}
    <div class="overflow-hidden rounded-lg border">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>ID</Table.Head>
            <Table.Head>Display name</Table.Head>
            <Table.Head>State</Table.Head>
            <Table.Head>Created at</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.accounts as account (account.id)}
            <Table.Row>
              <Table.Cell class="font-medium">
                <a class="hover:underline" href={resolve(`/accounts/${account.id}`)}>{account.id}</a
                >
              </Table.Cell>
              <Table.Cell>{account.displayName}</Table.Cell>
              <Table.Cell>
                <Badge variant={account.state === 'ACTIVE' ? 'default' : 'outline'}>
                  {account.state}
                </Badge>
              </Table.Cell>
              <Table.Cell><time datetime={account.createdAt}>{account.createdAt}</time></Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>

    {#if data.previousCursor || data.nextCursor}
      <nav aria-label="Account pagination" class="flex justify-end gap-2">
        {#if data.previousCursor}
          <Button
            href={resolve(`/accounts?cursor=${data.previousCursor}&direction=previous`)}
            size="sm"
            variant="outline">이전 50개</Button
          >
        {/if}
        {#if data.nextCursor}
          <Button href={resolve(`/accounts?cursor=${data.nextCursor}`)} size="sm" variant="outline">
            다음 50개
          </Button>
        {/if}
      </nav>
    {/if}
  {/if}
</div>
