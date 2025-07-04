<script lang="ts">
  import { Input, type InputProps } from '../ui/input';
  import { Label } from '../ui/label';
  import { getFormContext } from './context'

  type Props = {
    name: string;
    label?: string;
    description?: string;
  } & InputProps;

  let { name, label, description, ...restProps }: Props = $props();
</script>

<div class="py-4">
  <Label class="py-2" for={name}>{label}</Label>
  <Input id={name} {name} {...restProps} />
  {#if description}
    <p class="text-muted-foreground text-sm">{description}</p>
  {/if}
</div>
