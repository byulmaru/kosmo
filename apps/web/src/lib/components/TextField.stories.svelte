<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import TextField from './TextField.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/TextField',
    component: TextField,
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

<Story name="Playground" args={{ state: 'default', placeholder: 'Placeholder' }} />

<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-3">
    {#each states as state}
      <TextField {state} placeholder="Placeholder" />
    {/each}
  </div>
</Story>
