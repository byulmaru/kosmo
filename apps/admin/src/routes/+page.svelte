<script lang="ts">
  import UsersIcon from '@lucide/svelte/icons/users';
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
</script>

<svelte:head>
  <title>Kosmo Admin Console</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
  <header>
    <p class="text-sm font-medium text-muted-foreground">Admin Console</p>
    <h1 class="text-2xl font-semibold tracking-tight">Overview</h1>
    <p class="mt-1 text-sm text-muted-foreground">Kosmo 운영 데이터를 조회합니다.</p>
  </header>

  <Card.Root class="max-w-xl">
    <Card.Header>
      <Card.Title class="flex items-center gap-2"><UsersIcon class="size-5" /> Accounts</Card.Title>
      <Card.Description>Account 목록과 상세 정보를 확인합니다.</Card.Description>
    </Card.Header>
    <Card.Footer>
      <Button href={resolve('/accounts')}>Accounts 열기</Button>
    </Card.Footer>
  </Card.Root>
</div>
