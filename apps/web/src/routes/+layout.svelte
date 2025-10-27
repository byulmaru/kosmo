<script lang="ts">
  import '../app.css';

  import { setRelayEnvironment } from '@kosmo/svelte-relay';
  import { Toaster } from '$lib/components/ui/sonner';

  const { children, data } = $props();

  setRelayEnvironment(data.relayEnvironment);
</script>

<Toaster />

{@render children()}
