<script lang="ts">
  const colorTokens = [
    { name: 'bg', light: '#ffffff', dark: '#111111', usage: 'screen background' },
    { name: 'surface', light: '#f6f6f6', dark: '#222222', usage: 'subtle panels' },
    { name: 'card', light: '#ffffff', dark: '#1c1c1e', usage: 'cards and overlays' },
    { name: 'text-primary', light: '#111111', dark: '#ffffff', usage: 'primary text' },
    { name: 'text-secondary', light: '#777777', dark: '#777777', usage: 'secondary text' },
    { name: 'border', light: '#eaeaea', dark: '#333333', usage: 'dividers and strokes' },
    { name: 'primary', light: '#fce79a', dark: '#fce79a', usage: 'primary action' },
    { name: 'danger', light: '#aa1010', dark: '#aa1010', usage: 'destructive action' },
    { name: 'like', light: '#fcd5cf', dark: '#fcd5cf', usage: 'reaction accent' },
    { name: 'more', light: '#61a3f9', dark: '#61a3f9', usage: 'more action accent' },
  ] as const;

  const spacingTokens = [
    ['space/0', 0],
    ['space/4', 4],
    ['space/8', 8],
    ['space/12', 12],
    ['space/16', 16],
    ['space/20', 20],
    ['space/24', 24],
    ['space/32', 32],
  ] as const;

  const radiusTokens = [
    ['radius/sm', 8],
    ['radius/md', 12],
    ['radius/lg', 16],
    ['radius/xl', 24],
    ['radius/full', 999],
  ] as const;

  const typeTokens = [
    ['font/size/xsm', '12px'],
    ['font/size/sm', '14px'],
    ['font/size/md', '16px'],
    ['font/size/lg', '20px'],
    ['font/size/xl', '24px'],
    ['font/weight/regular', '400'],
    ['font/weight/bold', '700'],
  ] as const;

  const figmaComponentGroups = [
    {
      name: 'Core inputs',
      components: ['Button', 'TextField', 'TextArea', 'Avatar (sizes)'],
    },
    {
      name: 'Navigation',
      components: ['Header', 'BottomTab', 'SearchTabs', 'SegmentTabs'],
    },
    {
      name: 'Search and people',
      components: ['SearchBar', 'ProfileListItem'],
    },
    {
      name: 'Feedback and states',
      components: ['NotificationItem', 'ImagePlaceholder', 'TextSkeleton', 'BlockPlaceholder'],
    },
  ] as const;
</script>

<div class="bg-bg text-text-primary min-h-screen px-6 py-8">
  <div class="mx-auto grid max-w-5xl gap-10">
    <header class="grid gap-3">
      <p class="text-text-primary w-fit rounded-[8px] bg-primary px-3 py-1 text-sm font-bold">
        KOSMO
      </p>
      <h1 class="m-0 text-3xl leading-tight font-bold">Design foundations</h1>
      <p class="text-text-secondary m-0 max-w-2xl text-base leading-7">
        Figma KOSMO 파일의 Foundation, Color 변수와 Components 페이지를 Storybook에서 추적하기 위한
        기준입니다.
      </p>
    </header>

    <section class="grid gap-4">
      <h2 class="m-0 text-xl font-bold">Color</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        {#each colorTokens as token}
          <article class="border-border bg-card grid gap-3 rounded-[8px] border p-4">
            <div class="grid overflow-hidden rounded-[8px] border border-border sm:grid-cols-2">
              <div class="grid h-16 place-items-center" style:background-color={token.light}>
                <span class="rounded bg-white/70 px-2 py-1 text-xs font-bold text-black">
                  {token.light}
                </span>
              </div>
              <div class="grid h-16 place-items-center" style:background-color={token.dark}>
                <span class="rounded bg-black/50 px-2 py-1 text-xs font-bold text-white">
                  {token.dark}
                </span>
              </div>
            </div>
            <div>
              <h3 class="m-0 text-base font-bold">{token.name}</h3>
              <p class="text-text-secondary m-0 text-sm">{token.usage}</p>
            </div>
          </article>
        {/each}
      </div>
    </section>

    <section class="grid gap-4 lg:grid-cols-3">
      <div class="border-border bg-card rounded-[8px] border p-4">
        <h2 class="m-0 text-xl font-bold">Spacing</h2>
        <div class="mt-4 grid gap-3">
          {#each spacingTokens as [name, value]}
            <div class="grid grid-cols-[5rem_1fr_3rem] items-center gap-3 text-sm">
              <span class="font-semibold">{name}</span>
              <span
                class="bg-primary block h-3 rounded-full"
                style:width={`${Math.max(value, 1)}px`}
              ></span>
              <span class="text-text-secondary text-right">{value}px</span>
            </div>
          {/each}
        </div>
      </div>

      <div class="border-border bg-card rounded-[8px] border p-4">
        <h2 class="m-0 text-xl font-bold">Radius</h2>
        <div class="mt-4 grid grid-cols-2 gap-3">
          {#each radiusTokens as [name, value]}
            <div class="grid gap-2">
              <div
                class="border-border bg-surface size-14 border"
                style:border-radius={value === 999 ? '999px' : `${value}px`}
              ></div>
              <div class="text-sm">
                <p class="m-0 font-semibold">{name}</p>
                <p class="text-text-secondary m-0">{value}px</p>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <div class="border-border bg-card rounded-[8px] border p-4">
        <h2 class="m-0 text-xl font-bold">Type</h2>
        <div class="mt-4 grid gap-2">
          {#each typeTokens as [name, value]}
            <div class="border-border flex items-center justify-between border-b py-2 text-sm">
              <span class="font-semibold">{name}</span>
              <span class="text-text-secondary">{value}</span>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <section class="grid gap-4">
      <h2 class="m-0 text-xl font-bold">Figma component map</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        {#each figmaComponentGroups as group}
          <article class="border-border bg-card rounded-[8px] border p-4">
            <h3 class="m-0 text-base font-bold">{group.name}</h3>
            <div class="mt-3 flex flex-wrap gap-2">
              {#each group.components as component}
                <span
                  class="bg-surface text-text-primary rounded-full px-3 py-1 text-sm font-semibold"
                >
                  {component}
                </span>
              {/each}
            </div>
          </article>
        {/each}
      </div>
    </section>
  </div>
</div>
