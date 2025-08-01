<script lang="ts">
  import type { Component } from 'svelte';

  type Props = {
    href: string;
    icon: Component;
    label: string;
  };

  const props: Props = $props();
</script>

<a href={props.href} class="group flex flex-col items-center p-1 font-medium lg:items-start">
  <div class="group-hover:bg-muted inline-flex items-center justify-center gap-4 rounded-full p-3">
    <props.icon class="size-6" />
    <span class="hidden text-lg lg:inline">{props.label}</span>
  </div>
</a>
