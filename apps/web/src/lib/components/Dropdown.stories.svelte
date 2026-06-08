<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import * as Dropdown from './Dropdown';

  const { Story } = defineMeta({
    title: 'KOSMO/Dropdown',
    tags: ['autodocs'],
    parameters: {
      layout: 'centered',
    },
  });
</script>

<script lang="ts">
  import Button from './Button.svelte';

  const menuItems = [
    {
      label: '프로필 열기',
      description: '선택한 프로필 페이지로 이동합니다.',
    },
    {
      label: '알림 설정',
      description: '이 항목의 알림 방식을 조정합니다.',
    },
    {
      label: '목록에서 숨기기',
      description: '현재 목록에서만 항목을 숨깁니다.',
    },
  ];

  const sortItems = [
    {
      value: 'recent',
      label: '최신순',
      description: '가장 최근 항목부터 표시합니다.',
    },
    {
      value: 'popular',
      label: '인기순',
      description: '반응이 많은 항목부터 표시합니다.',
    },
    {
      value: 'oldest',
      label: '오래된순',
      description: '오래된 항목부터 표시합니다.',
    },
  ];

  let selectedSort = $state('recent');
</script>

<Story name="Default" asChild parameters={{ controls: { disable: true } }}>
  <div class="flex min-h-52 items-start justify-center p-8">
    <Dropdown.Root>
      <Dropdown.Trigger>
        <Button variant="secondary">메뉴</Button>
      </Dropdown.Trigger>

      <Dropdown.Content aria-label="작업 메뉴">
        {#each menuItems as item}
          <Dropdown.Item>
            <span class="grid min-w-0 gap-0.5">
              <span class="text-text-primary text-sm font-bold">{item.label}</span>
              <span class="text-text-secondary text-xs leading-4">{item.description}</span>
            </span>
          </Dropdown.Item>
        {/each}
      </Dropdown.Content>
    </Dropdown.Root>
  </div>
</Story>

<Story name="Selected Item" asChild parameters={{ controls: { disable: true } }}>
  <div class="flex min-h-52 items-start justify-center p-8">
    <Dropdown.Root>
      <Dropdown.Trigger>
        <Button variant="secondary">정렬</Button>
      </Dropdown.Trigger>

      <Dropdown.Content aria-label="정렬 메뉴">
        {#each sortItems as item}
          <Dropdown.Item
            selected={item.value === selectedSort}
            onclick={() => {
              selectedSort = item.value;
            }}
          >
            <span class="grid min-w-0 gap-0.5">
              <span class="text-text-primary text-sm font-bold">{item.label}</span>
              <span class="text-text-secondary text-xs leading-4">{item.description}</span>
            </span>
          </Dropdown.Item>
        {/each}
      </Dropdown.Content>
    </Dropdown.Root>
  </div>
</Story>
