<script lang="ts">
  import '../app.css';

  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

{@render children()}

<style>
  :global(:root) {
    color-scheme: light;
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    --color-accent: #4f46e5;
    --color-accent-strong: #3730a3;
    --color-border: #dbe1ea;
    --color-border-muted: #edf0f5;
    --color-foreground: #172033;
    --color-foreground-muted: #647087;
    --color-surface: #ffffff;
    --color-surface-muted: #f7f8fb;
    --shadow-card: 0 0.5rem 1.5rem rgb(23 32 51 / 6%);
  }

  :global(html) {
    background: var(--color-surface-muted);
  }

  :global(body) {
    margin: 0;
    min-width: 20rem;
    background: var(--color-surface-muted);
    color: var(--color-foreground);
  }

  :global(a) {
    color: inherit;
  }

  :global(main.admin-page) {
    box-sizing: border-box;
    margin: 0 auto;
    max-width: 76rem;
    padding: 3rem 1.5rem 5rem;
  }

  :global(.admin-header) {
    align-items: flex-start;
    display: flex;
    gap: 1.5rem;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  :global(.admin-header h1) {
    font-size: clamp(1.75rem, 4vw, 2.25rem);
    letter-spacing: -0.03em;
    line-height: 1.1;
    margin: 0.25rem 0 0;
  }

  :global(.admin-header p) {
    color: var(--color-foreground-muted);
    margin: 0.5rem 0 0;
  }

  :global(.admin-eyebrow) {
    color: var(--color-accent-strong) !important;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    margin: 0 !important;
    text-transform: uppercase;
  }

  :global(.admin-actions) {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  :global(.admin-description) {
    color: var(--color-foreground-muted);
    line-height: 1.5;
    margin: 0;
  }

  :global(.admin-empty) {
    border: 1px dashed var(--color-border);
    border-radius: 0.75rem;
    color: var(--color-foreground-muted);
    padding: 3rem 1.5rem;
    text-align: center;
  }

  :global(.admin-pagination) {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
  }

  :global(.account-link) {
    color: var(--color-accent-strong);
    font-weight: 600;
    text-decoration: none;
  }

  :global(.account-link:hover) {
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  @media (max-width: 36rem) {
    :global(main.admin-page) {
      padding: 2rem 1rem 4rem;
    }

    :global(.admin-header) {
      flex-direction: column;
    }
  }
</style>
