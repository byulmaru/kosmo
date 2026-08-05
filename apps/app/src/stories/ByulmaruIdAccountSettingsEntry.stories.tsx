import { View } from 'react-native';
import { expect, waitFor, within } from 'storybook/test';
import {
  BYULMARU_ID_ACCOUNT_SETTINGS_URL,
  ByulmaruIdAccountSettingsEntry,
} from '@/components/settings/ByulmaruIdAccountSettingsEntry';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Settings/ByulmaruIdAccountSettingsEntry',
  component: ByulmaruIdAccountSettingsEntry,
  decorators: [
    (Story) => (
      <View style={{ maxWidth: 600, width: '100%' }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof ByulmaruIdAccountSettingsEntry>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const entry = canvas.getByRole('link', {
      name: 'Byulmaru ID Account Settings 외부 서비스로 이동',
    });

    await expect(canvas.getByText('계정 설정')).toBeVisible();
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAttribute('href', BYULMARU_ID_ACCOUNT_SETTINGS_URL);
    const domEntry = entry as HTMLElement;
    expect(domEntry.style.minHeight).toBe('64px');
    expect(domEntry.style.width).toBe('100%');

    entry.focus();
    await expect(entry).toHaveFocus();
    await waitFor(() => {
      const computedStyle = getComputedStyle(domEntry);
      expect(computedStyle.outlineStyle).toBe('solid');
      expect(computedStyle.outlineWidth).toBe('2px');
    });
  },
};
