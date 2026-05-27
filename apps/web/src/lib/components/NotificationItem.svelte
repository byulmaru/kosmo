<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  import Avatar from './Avatar.svelte';

  type NotificationType =
    | 'like'
    | 'reply'
    | 'repost'
    | 'follow'
    | 'mention'
    | 'quote'
    | 'followRequest';

  type NotificationItemProps = HTMLAttributes<HTMLElement> & {
    type?: NotificationType;
    action?: string;
    snippet?: string;
    time?: string;
  };

  let {
    type = 'like',
    action = '사용자 이름님이 회원님의 포스트에 반응했습니다.',
    snippet = '본문 한 줄 텍스트가 들어가요. 길어지면 줄여서…',
    time = 'n시간 전',
    class: className = '',
    ...rest
  }: NotificationItemProps = $props();

  const typeMeta: Record<NotificationType, { icon: string; tone: string }> = {
    like: { icon: '♥', tone: 'bg-like' },
    reply: { icon: '↩', tone: 'bg-secondary' },
    repost: { icon: '↻', tone: 'bg-secondary' },
    follow: { icon: '+', tone: 'bg-primary' },
    mention: { icon: '@', tone: 'bg-more text-background' },
    quote: { icon: '“', tone: 'bg-secondary' },
    followRequest: { icon: '✓', tone: 'bg-primary' },
  };
</script>

<article
  {...rest}
  data-type={type}
  class={`border-border bg-card flex min-h-[101px] w-[358px] gap-3 border-b px-4 py-3 ${className}`}
>
  <div
    class={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold ${typeMeta[type].tone}`}
    aria-hidden="true"
  >
    {typeMeta[type].icon}
  </div>
  <div class="min-w-0 flex-1">
    <div class="mb-2 flex items-center gap-1">
      <Avatar size="xs" initials="K" />
      <Avatar size="xs" initials="S" />
      <Avatar size="xs" initials="M" />
      <span class="text-muted-foreground ml-auto text-[11px]">{time}</span>
    </div>
    <p class="text-foreground m-0 truncate text-sm">{action}</p>
    <p class="text-muted-foreground m-0 mt-1 truncate text-[13px]">{snippet}</p>
  </div>
</article>
