<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Button from './Button.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/Button',
    component: Button,
    tags: ['autodocs'],
    argTypes: {
      variant: {
        control: 'radio',
        options: ['primary', 'secondary', 'text'],
      },
      size: {
        control: 'radio',
        options: ['sm', 'md', 'lg'],
      },
      disabled: {
        control: 'boolean',
      },
    },
  });
</script>

<script lang="ts">
  const variants = ['primary', 'secondary', 'text'] as const;
  const sizes = ['sm', 'md', 'lg'] as const;
</script>

<Story
  name="Playground"
  args={{
    variant: 'primary',
    size: 'md',
    disabled: false,
  }}
>
  {#snippet template(args)}
    <Button variant={args.variant} size={args.size} disabled={args.disabled}>Button</Button>
  {/snippet}
</Story>

<Story name="Variants" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-4">
    {#each variants as variant}
      <div class="flex flex-wrap items-center gap-3">
        {#each sizes as size}
          <Button {variant} {size}>{variant} {size}</Button>
        {/each}
      </div>
    {/each}
  </div>
</Story>

<Story name="Disabled" asChild parameters={{ controls: { disable: true } }}>
  <div class="flex flex-wrap items-center gap-3">
    {#each variants as variant}
      <Button {variant} disabled>{variant}</Button>
    {/each}
  </div>
</Story>
