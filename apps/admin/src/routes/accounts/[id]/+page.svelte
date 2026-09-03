<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{data.account.displayName} · Account · Kosmo Admin Console</title>
</svelte:head>

<main class="admin-page">
  <header class="admin-header">
    <div>
      <p class="admin-eyebrow">Account detail</p>
      <h1>{data.account.displayName}</h1>
      <p class="admin-description">읽기 전용 Account 상세</p>
    </div>
    <nav aria-label="Account actions" class="admin-actions">
      <Button href="/accounts" variant="outline">Accounts</Button>
    </nav>
  </header>

  <dl class="account-detail">
    <div>
      <dt>ID</dt>
      <dd>{data.account.id}</dd>
    </div>
    <div>
      <dt>Display name</dt>
      <dd>{data.account.displayName}</dd>
    </div>
    <div>
      <dt>State</dt>
      <dd>
        <Badge variant={data.account.state === 'ACTIVE' ? 'default' : 'outline'}>
          {data.account.state}
        </Badge>
      </dd>
    </div>
    <div>
      <dt>Created at</dt>
      <dd><time datetime={data.account.createdAt}>{data.account.createdAt}</time></dd>
    </div>
    <div>
      <dt>OIDC subject</dt>
      <dd class="account-detail-value">{data.account.oidcSubject}</dd>
    </div>
  </dl>
</main>

<style>
  .account-detail {
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
    background: var(--color-surface);
    box-shadow: var(--shadow-card);
    margin: 0;
  }

  .account-detail > div {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(8rem, 12rem) 1fr;
    padding: 1rem 1.25rem;
  }

  .account-detail > div + div {
    border-top: 1px solid var(--color-border-muted);
  }

  dt {
    color: var(--color-foreground-muted);
    font-size: 0.8125rem;
    font-weight: 700;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .account-detail-value {
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
    font-size: 0.875rem;
  }

  @media (max-width: 36rem) {
    .account-detail > div {
      gap: 0.375rem;
      grid-template-columns: 1fr;
    }
  }
</style>
