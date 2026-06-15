<script lang="ts">
  // 임시(interim) 온보딩 카드. 프로필 생성/선택 플로우가 정식으로 구현·보강된 뒤
  // 제대로 된 온보딩으로 교체/확장될 필요가 있다. (PROD-149)
  // 생성/선택은 직접 수행하지 않고 onAction으로 기존 사이드바 프로필 스위처를 연다.
  import { UserRoundPlusIcon } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';

  type Props = {
    // 사용자가 이미 프로필을 보유했는지. 없으면 만들기, 있으면 선택을 유도한다.
    hasProfiles?: boolean;
    onAction: () => void;
  };

  let { hasProfiles = false, onAction }: Props = $props();
</script>

<section class="mx-auto flex w-[min(100%,28rem)] flex-col items-center text-center">
  <div class="text-text-secondary mb-4" aria-hidden="true">
    <UserRoundPlusIcon size={48} strokeWidth={1.5} />
  </div>
  <h1 class="text-text-primary m-0 text-base font-semibold">
    {hasProfiles ? '사용할 프로필을 선택해주세요' : '프로필을 만들어 시작하세요'}
  </h1>
  <p class="text-text-secondary mt-2 text-sm">
    {hasProfiles
      ? '홈을 보려면 사용할 프로필을 먼저 선택해야 해요.'
      : '프로필을 만들면 글을 쓰고 피드를 볼 수 있어요.'}
  </p>
  <Button class="mt-6" onclick={onAction}>
    {hasProfiles ? '프로필 선택' : '프로필 만들기'}
  </Button>
</section>
