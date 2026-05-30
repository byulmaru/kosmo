<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import NotificationItem from './NotificationItem.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/NotificationItem',
    component: NotificationItem,
    tags: ['autodocs'],
    argTypes: {
      type: {
        control: 'select',
        options: ['like', 'reply', 'repost', 'follow', 'mention', 'quote', 'followRequest'],
      },
    },
  });
</script>

<script lang="ts">
  const types = ['like', 'reply', 'repost', 'follow', 'mention', 'quote', 'followRequest'] as const;
</script>

<Story
  name="Playground"
  args={{
    type: 'like',
    action: '사용자 이름님이 회원님의 포스트에 반응했습니다.',
    snippet: '본문 한 줄 텍스트가 들어가요. 길어지면 줄여서…',
    time: 'n시간 전',
  }}
/>

<Story name="Types" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-3">
    {#each types as type}
      <NotificationItem {type} />
    {/each}
  </div>
</Story>
