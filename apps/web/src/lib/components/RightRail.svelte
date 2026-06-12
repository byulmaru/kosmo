<script lang="ts">
  import { PostVisibility } from '@kosmo/core/enums';
  import { ChevronDownIcon, ImageIcon, TriangleAlertIcon } from '@lucide/svelte';
  import Avatar from './Avatar.svelte';
  import PostVisibilityIcon from './PostVisibilityIcon.svelte';

  // TODO: 글 작성 위젯은 디자인(05 Screens - Web / RightRail) 모양만 잡아둔 정적 placeholder다.
  // PROD-131에서 PostComposer 연결로 교체한다.
</script>

<div class="flex w-full flex-col gap-4">
  <div class="border-border bg-card flex flex-col gap-3 rounded-lg border p-4" aria-hidden="true">
    <div class="flex items-center justify-between">
      <Avatar size="sm" />
      <div
        class="border-text-primary text-text-primary flex items-center gap-1.5 rounded-full border px-3 py-2 text-xsm font-bold"
      >
        <PostVisibilityIcon visibility={PostVisibility.PUBLIC} size={12} />
        공개
        <ChevronDownIcon size={12} />
      </div>
    </div>

    <p class="text-text-secondary pt-1 pb-3 text-sm">지금 그리고 있는 작업을 공유해 보세요…</p>

    <div class="text-text-primary flex items-center gap-2">
      <ImageIcon size={20} />
      <TriangleAlertIcon size={20} />
      <span
        class="bg-primary text-text-primary ml-auto flex h-8 w-30 items-center justify-center rounded-sm text-sm font-bold"
      >
        게시
      </span>
    </div>
  </div>
</div>
