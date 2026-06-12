<script lang="ts">
  import { PostVisibility } from '@kosmo/core/enums';
  import { ChevronDownIcon, ImageIcon, PlusIcon, TriangleAlertIcon, XIcon } from '@lucide/svelte';
  import Avatar from './Avatar.svelte';
  import PostVisibilityIcon from './PostVisibilityIcon.svelte';

  // TODO: 아래 위젯들은 디자인(05 Screens - Web / RightRail) 모양만 잡아둔 정적 placeholder다.
  // 글 작성 위젯은 PostComposer 연결로, 태그 타임라인 위젯은 실데이터 연결로 후속 이슈에서 교체한다.
  const placeholderTags = ['일러스트', '팬아트', '웹소설', '커미션'];
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
      <span class="flex-1"></span>
      <span
        class="bg-primary text-text-primary flex h-8 w-30 items-center justify-center rounded-sm text-sm font-bold"
      >
        게시
      </span>
    </div>
  </div>

  <div class="border-border bg-card flex flex-col gap-2 rounded-lg border p-4">
    <p class="text-text-primary text-md font-semibold">태그 타임라인</p>
    <p class="text-text-secondary text-xsm">선택한 태그만 해시태그 타임라인에 보여요</p>

    <ul class="flex flex-wrap gap-2 pt-1" aria-hidden="true">
      {#each placeholderTags as tag (tag)}
        <li
          class="bg-surface text-text-secondary flex items-center gap-1.5 rounded-full py-1 pr-1.5 pl-2.5 text-xsm font-medium"
        >
          {tag}
          <XIcon size={12} />
        </li>
      {/each}
    </ul>

    <div class="text-more flex items-center gap-1 pt-1 text-xsm" aria-hidden="true">
      <PlusIcon size={16} />
      태그 추가
    </div>
  </div>
</div>
