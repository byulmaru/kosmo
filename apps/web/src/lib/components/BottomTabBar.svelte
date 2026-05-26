<script lang="ts">
  import { page } from '$app/state';

  const tabs = [
    { href: '/', label: '홈', path: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z' },
    {
      href: '/search',
      label: '검색',
      path: 'm21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z',
    },
    {
      href: '/compose',
      label: '글쓰기',
      path: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
    },
    {
      href: '/notifications',
      label: '알림',
      path: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    },
    { href: '/menu', label: '메뉴', path: 'M4 6h16M4 12h16M4 18h16' },
  ];

  const isActive = (href: string) => page.url.pathname === href;
</script>

<nav
  class="bg-card border-border fixed inset-x-0 bottom-0 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)]"
  aria-label="주요 메뉴"
>
  {#each tabs as tab}
    {@const active = isActive(tab.href)}
    <a
      class={`grid min-h-14 place-items-center gap-0.5 py-2 text-sm font-semibold ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
      href={tab.href}
      aria-current={active ? 'page' : undefined}
    >
      <svg
        class="size-6"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d={tab.path} />
      </svg>
      <span>{tab.label}</span>
    </a>
  {/each}
</nav>
