import { View } from 'react-native';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import {
  BYULMARU_ID_ACCOUNT_SETTINGS_URL,
  ByulmaruIdAccountSettingsEntry,
} from '@/components/settings/ByulmaruIdAccountSettingsEntry';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'KOSMO/Components/Byulmaru ID Account Settings Entry',
  component: ByulmaruIdAccountSettingsEntry,
  decorators: [
    (Story) => (
      <View style={{ maxWidth: 600, width: '100%' }}>
        <Story />
      </View>
    ),
  ],
  excludeStories: ['LinkContract'],
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ByulmaruIdAccountSettingsEntry>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const LinkContract: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const entry = canvas.getByRole('link', {
      name: 'Byulmaru ID Account Settings 외부 서비스로 이동',
    });

    await expect(canvas.getByText('계정 설정')).toBeVisible();
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAttribute('href', BYULMARU_ID_ACCOUNT_SETTINGS_URL);
    const domEntry = entry as HTMLElement;
    expect(getComputedStyle(domEntry).minHeight).toBe('64px');
    expect(getComputedStyle(domEntry).width).toBe('600px');

    await userEvent.tab();
    await expect(entry).toHaveFocus();
    await waitFor(() => {
      const computedStyle = getComputedStyle(domEntry);
      expect(computedStyle.outlineStyle).toBe('solid');
      expect(computedStyle.outlineWidth).toBe('2px');
    });

    await userEvent.click(entry);
    expect(getComputedStyle(domEntry).outlineWidth).not.toBe('2px');
  },
};
