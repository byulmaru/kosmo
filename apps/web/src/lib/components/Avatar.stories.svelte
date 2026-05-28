<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Avatar from './Avatar.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/Avatar',
    component: Avatar,
    tags: ['autodocs'],
    argTypes: {
      size: {
        control: 'radio',
        options: ['xs', 'sm', 'md', 'lg', 'xl'],
      },
    },
  });
</script>

<script lang="ts">
  const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
</script>

<Story name="Playground" args={{ size: 'md', initials: 'K', alt: '사용자 프로필' }} />

<Story name="Sizes" asChild parameters={{ controls: { disable: true } }}>
  <div class="flex items-center gap-4">
    {#each sizes as size}
      <div class="grid justify-items-center gap-2">
        <Avatar {size} initials="K" />
        <span class="text-text-secondary text-xs">{size}</span>
      </div>
    {/each}
  </div>
</Story>
