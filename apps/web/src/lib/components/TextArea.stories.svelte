<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import TextArea from './TextArea.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/TextArea',
    component: TextArea,
    tags: ['autodocs'],
    argTypes: {
      state: {
        control: 'radio',
        options: ['default', 'focused', 'error'],
      },
    },
  });
</script>

<script lang="ts">
  const states = ['default', 'focused', 'error'] as const;
</script>

<Story name="Playground" args={{ state: 'default', placeholder: 'Placeholder...' }} />

<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-3">
    {#each states as state}
      <TextArea {state} placeholder="Placeholder..." />
    {/each}
  </div>
</Story>
