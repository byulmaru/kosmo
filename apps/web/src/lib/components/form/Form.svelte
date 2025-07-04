<script
  generics="Input extends Record<string, unknown>, Output extends Record<string, unknown>"
  lang="ts"
>
  import type { Form } from '$lib/form.svelte';
  import { setFormContext } from './context';
  import type { Snippet } from 'svelte';
  import type { HTMLFormAttributes } from 'svelte/elements';

  type Props = {
    form: Form<Input, Output>;
    children: Snippet;
  } & HTMLFormAttributes;

  const { form, children, ...restProps }: Props = $props();
  const { enhance } = form;

  setFormContext(form);
</script>

<form method="post" use:enhance {...restProps}>
  {@render children()}
  <!-- {#each $errors._errors ?? [] as error (error)}
    <p class="text-destructive text-sm">{error}</p>
  {/each} -->
</form>
