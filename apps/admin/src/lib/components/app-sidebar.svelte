<script lang="ts">
  import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
  import UsersIcon from '@lucide/svelte/icons/users';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import * as Sidebar from '$lib/components/ui/sidebar';

  let {
    viewer,
  }: {
    viewer: { label: string; login?: string };
  } = $props();
</script>

<Sidebar.Root collapsible="icon">
  <Sidebar.Header>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton size="lg" tooltipContent="Kosmo Admin Console">
          {#snippet child({ props })}
            <a {...props} href={resolve('/')}>
              <span
                aria-hidden="true"
                class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground"
                >K</span
              >
              <span class="grid text-left text-sm leading-tight">
                <span class="truncate font-semibold">Kosmo</span>
                <span class="truncate text-xs">Admin Console</span>
              </span>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Header>

  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupLabel>Workspace</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton isActive={page.url.pathname === '/'} tooltipContent="Overview">
              {#snippet child({ props })}
                <a
                  {...props}
                  aria-current={page.url.pathname === '/' ? 'page' : undefined}
                  href={resolve('/')}
                >
                  <LayoutDashboardIcon />
                  <span>Overview</span>
                </a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={page.url.pathname.startsWith('/accounts')}
              tooltipContent="Accounts"
            >
              {#snippet child({ props })}
                <a
                  {...props}
                  aria-current={page.url.pathname.startsWith('/accounts') ? 'page' : undefined}
                  href={resolve('/accounts')}
                >
                  <UsersIcon />
                  <span>Accounts</span>
                </a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>

  <Sidebar.Footer>
    <div class="flex min-w-0 items-center gap-2 rounded-md p-2 group-data-[collapsible=icon]:p-1">
      <span
        aria-hidden="true"
        class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold"
        >{viewer.label.slice(0, 1).toUpperCase()}</span
      >
      <div class="grid min-w-0 text-sm leading-tight group-data-[collapsible=icon]:hidden">
        <span class="truncate font-medium">{viewer.label}</span>
        {#if viewer.login && viewer.login !== viewer.label}
          <span class="truncate text-xs text-muted-foreground">{viewer.login}</span>
        {/if}
      </div>
    </div>
  </Sidebar.Footer>
  <Sidebar.Rail />
</Sidebar.Root>
