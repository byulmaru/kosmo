import { View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SettingsLinkRow } from '@/components/settings/SettingsLinkRow';
import type { Meta, StoryObj } from '@storybook/react-vite';

function SettingsLinkRowComparison() {
  return (
    <View style={{ width: '100%' }}>
      <SettingsLinkRow
        accessibilityLabel="긴 레이블 설정 열기"
        currentPage={false}
        href="/settings/default-post-visibility"
        label="게시물 기본 공개 범위를 아주 긴 설정 레이블로 확인하기"
        primary
        selected
      />
      <SettingsLinkRow
        accessibilityLabel="별마루 ID 계정 설정 외부 서비스로 이동"
        external
        href="https://id.byulmaru.co"
        label="별마루 ID"
      />
      <SettingsLinkRow
        accessibilityLabel="화면 설정 열기, 시스템"
        density="compact"
        description="시스템"
        href="/settings/theme"
        label="화면"
      />
    </View>
  );
}

function SettingsLinkRowBoundaryComparison() {
  return (
    <View style={{ width: 320 }}>
      <SettingsLinkRow
        accessibilityLabel="긴 기본 설정 행 열기"
        description="전체 공개와 조용한 공개, 팔로워 공개 상태를 프로필마다 선택"
        href="/settings/profile"
        label="게시물 기본 공개 범위와 프로필 공개 기준을 조정하는 설정"
        selected
      />
      <SettingsLinkRow
        accessibilityLabel="긴 컴팩트 설정 행 열기, 시스템"
        density="compact"
        description="시스템"
        href="/settings/theme"
        label="화면과 알림에 적용할 프로필 기본 설정"
        selected
      />
    </View>
  );
}

const meta = {
  args: {
    accessibilityLabel: '게시물 기본 공개 범위 설정 열기',
    description: '현재 공개 범위와 다음 설정 화면을 확인합니다.',
    external: false,
    href: '/settings/default-post-visibility',
    label: '게시물 기본 공개 범위',
    onNavigate: fn(),
    primary: true,
    selected: false,
  },
  argTypes: {
    accessibilityLabel: { control: 'text' },
    description: { control: 'text' },
    external: { control: 'boolean' },
    href: { control: 'text' },
    label: { control: 'text' },
    selected: { control: 'boolean' },
  },
  component: SettingsLinkRow,
  decorators: [
    (Story) => (
      <View style={{ maxWidth: 600, width: '100%' }}>
        <Story />
      </View>
    ),
  ],
  excludeStories: ['BoundaryContract', 'InteractionContract', 'ReducedMotionContract'],
  title: 'KOSMO/Components/Settings Link Row',
} satisfies Meta<typeof SettingsLinkRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: ['label', 'description', 'accessibilityLabel', 'href', 'external', 'selected'],
    },
  },
};

export const InteractionContract: Story = {
  ...Playground,
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement }) => {
    args.onNavigate?.mockClear();
    const canvas = within(canvasElement);
    const row = canvas.getByRole('link', { name: args.accessibilityLabel });

    await expect(row).toHaveAttribute('href', args.href);
    if (args.selected) {
      await expect(row).toHaveAttribute('aria-current', 'page');
    } else {
      await expect(row).not.toHaveAttribute('aria-current');
    }

    await userEvent.tab();
    await expect(row).toHaveFocus();
    await expect(row).toHaveStyle({ outlineWidth: '2px' });
    await userEvent.click(row);
    await expect(args.onNavigate).toHaveBeenCalledOnce();
  },
};

export const ReducedMotionContract: Story = {
  ...Playground,
  globals: { reduceMotion: true },
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement }) => {
    const row = within(canvasElement).getByRole('link', { name: args.accessibilityLabel });
    expect(getComputedStyle(row).transitionDuration).toBe('0s');
  },
};

export const RepresentativeStates: Story = {
  parameters: { controls: { disable: true } },
  render: () => <SettingsLinkRowComparison />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const selected = canvas.getByRole('link', { name: '긴 레이블 설정 열기' });
    const external = canvas.getByRole('link', {
      name: '별마루 ID 계정 설정 외부 서비스로 이동',
    });
    const compact = canvas.getByRole('link', { name: '화면 설정 열기, 시스템' });

    await expect(selected).toHaveAttribute('href', '/settings/default-post-visibility');
    await expect(selected).not.toHaveAttribute('aria-current');
    await expect(external).toHaveAttribute('href', 'https://id.byulmaru.co');
    await expect(external).not.toHaveAttribute('aria-current');
    await expect(compact).toHaveAttribute('href', '/settings/theme');
  },
};

export const BoundaryContract: Story = {
  parameters: { controls: { disable: true } },
  render: () => <SettingsLinkRowBoundaryComparison />,
};
