<script lang="ts">
  import { resolve } from '$app/paths';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Accounts · Kosmo Admin Console</title>
</svelte:head>

<main class="admin-page">
  <header class="admin-header">
    <div>
      <p class="admin-eyebrow">Admin Console</p>
      <h1>Accounts</h1>
      <p class="admin-description">Account 목록 · 읽기 전용</p>
    </div>
    <nav aria-label="Account actions" class="admin-actions">
      <Button href="/" variant="outline">Console</Button>
    </nav>
  </header>

  {#if data.accounts.length === 0}
    <p class="admin-empty">Account가 없습니다.</p>
  {:else}
    <div class="account-table-wrapper">
      <table>
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Display name</th>
            <th scope="col">State</th>
            <th scope="col">Created at</th>
          </tr>
        </thead>
        <tbody>
          {#each data.accounts as account (account.id)}
            <tr>
              <td>
                <a class="account-link" href={resolve(`/accounts/${account.id}`)}>{account.id}</a>
              </td>
              <td>{account.displayName}</td>
              <td>
                <Badge variant={account.state === 'ACTIVE' ? 'default' : 'outline'}>
                  {account.state}
                </Badge>
              </td>
              <td><time datetime={account.createdAt}>{account.createdAt}</time></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if data.previousCursor || data.nextCursor}
      <nav aria-label="Account pagination" class="admin-pagination">
        {#if data.previousCursor}
          <Button
            href={`/accounts?cursor=${data.previousCursor}&direction=previous`}
            size="sm"
            variant="outline">이전 50개</Button
          >
        {/if}
        {#if data.nextCursor}
          <Button href={`/accounts?cursor=${data.nextCursor}`} size="sm" variant="outline">
            다음 50개
          </Button>
        {/if}
      </nav>
    {/if}
  {/if}
</main>

<style>
  .account-table-wrapper {
    overflow-x: auto;
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
    background: var(--color-surface);
    box-shadow: var(--shadow-card);
  }

  table {
    border-collapse: collapse;
    min-width: 42rem;
    width: 100%;
  }

  th,
  td {
    border-bottom: 1px solid var(--color-border-muted);
    padding: 0.875rem 1rem;
    text-align: left;
    vertical-align: middle;
  }

  th {
    color: var(--color-foreground-muted);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  td {
    color: var(--color-foreground);
    font-size: 0.875rem;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  tbody tr:hover {
    background: var(--color-surface-muted);
  }
</style>
