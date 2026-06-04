<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import FollowButtonView from './FollowButtonView.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/FollowButton',
    component: FollowButtonView,
    tags: ['autodocs'],
    argTypes: {
      variant: {
        control: 'radio',
        options: ['primary', 'secondary'],
      },
      disabled: {
        control: 'boolean',
      },
      loading: {
        control: 'boolean',
      },
      pressed: {
        control: 'boolean',
      },
      size: {
        control: 'radio',
        options: ['sm', 'md', 'lg'],
      },
    },
  });
</script>

<script lang="ts">
  const noop = () => {};
</script>

<Story
  name="Playground"
  args={{
    hidden: false,
    label: '팔로우',
    variant: 'primary',
    disabled: false,
    loading: false,
    pressed: false,
    message: null,
    size: 'sm',
    onclick: noop,
  }}
/>

<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-4">
    <FollowButtonView label="팔로우" variant="primary" onclick={noop} />
    <FollowButtonView label="팔로잉" variant="secondary" pressed onclick={noop} />
    <FollowButtonView label="요청 중" variant="secondary" onclick={noop} />
    <FollowButtonView label="처리 중" variant="primary" loading disabled onclick={noop} />
    <FollowButtonView
      label="팔로우"
      variant="primary"
      disabled
      message="프로필을 선택한 뒤 팔로우할 수 있습니다."
      onclick={noop}
    />
    <FollowButtonView
      label="팔로우"
      variant="primary"
      disabled
      message="로그인 후 팔로우할 수 있습니다."
      onclick={noop}
    />
    <FollowButtonView
      label="팔로우"
      variant="primary"
      disabled
      message="이 프로필을 팔로우할 권한이 없습니다."
      onclick={noop}
    />
    <FollowButtonView
      label="팔로우"
      variant="primary"
      message="팔로우 요청에 실패했습니다. 잠시 후 다시 시도해주세요."
      messageRole="alert"
      onclick={noop}
    />
  </div>
</Story>
