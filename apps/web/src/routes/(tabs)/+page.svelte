<script lang="ts">
  import PageIntro from '$lib/components/PageIntro.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<PageIntro
  title="홈"
  description="피드를 확인하고 새로운 소식을 탐색합니다.????????"
  tone="primary"
>
  <p class="text-foreground mt-3 text-base">{data.accountName ?? ''}</p>
</PageIntro>
