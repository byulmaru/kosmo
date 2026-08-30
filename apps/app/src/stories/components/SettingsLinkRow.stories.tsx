import { View } from 'react-native';
import { expect, userEvent, within } from 'storybook/test';
import { SettingsLinkRow } from '@/components/settings/SettingsLinkRow';
import type { Meta, StoryObj } from '@storybook/react-vite';

function SettingsLinkRowComparison() {
  return (
    <View style={{ width: '100%' }}>
      <SettingsLinkRow
        accessibilityLabel="긴 레이블 설정 열기"
        href="/settings/default-post-visibility"
        label="게시물 기본 공개 범위를 아주 긴 설정 레이블로 확인하기"
        primary
        selected
      />
      <SettingsLinkRow
        accessibilityLabel="Byulmaru ID Account Settings 외부 서비스로 이동"
        external
        href="https://id.byulmaru.co"
        label="계정 설정"
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
  title: 'KOSMO/Components/Settings Link Row',
} satisfies Meta<typeof SettingsLinkRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: ['label', 'description', 'accessibilityLabel', 'href', 'external', 'selected'],
    },
  },
  play: async ({ args, canvasElement }) => {
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
  },
};

export const RepresentativeStates: Story = {
  parameters: { controls: { disable: true } },
  render: () => <SettingsLinkRowComparison />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const selected = canvas.getByRole('link', { name: '긴 레이블 설정 열기' });
    const external = canvas.getByRole('link', {
      name: 'Byulmaru ID Account Settings 외부 서비스로 이동',
    });

    await expect(selected).toHaveAttribute('href', '/settings/default-post-visibility');
    await expect(selected).toHaveAttribute('aria-current', 'page');
    await expect(external).toHaveAttribute('href', 'https://id.byulmaru.co');
    await expect(external).not.toHaveAttribute('aria-current');
  },
};
