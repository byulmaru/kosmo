<script lang="ts">
  import '../app.css';

  import { setRelayEnvironment } from '@kosmo/svelte-relay';

  const { children, data } = $props();

  setRelayEnvironment(data.relayEnvironment);
</script>

{@render children()}
