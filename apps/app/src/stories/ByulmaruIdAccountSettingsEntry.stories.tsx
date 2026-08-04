import { Linking, View } from 'react-native';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
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
    const originalCanOpenURL = Linking.canOpenURL;
    const originalOpenURL = Linking.openURL;
    const canOpenURL = fn(async () => true);
    const openURL = fn(async () => undefined);
    Linking.canOpenURL = canOpenURL;
    Linking.openURL = openURL;

    try {
      const canvas = within(canvasElement);
      const entry = canvas.getByRole('link', {
        name: 'Byulmaru ID 계정 설정, 외부 서비스로 이동',
      });
      await expect(entry).toBeVisible();
      await expect(entry).toHaveAttribute('href', BYULMARU_ID_ACCOUNT_SETTINGS_URL);
      entry.focus();
      await userEvent.keyboard('{Enter}');
      await expect(openURL).toHaveBeenCalledWith(BYULMARU_ID_ACCOUNT_SETTINGS_URL);
      await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      Linking.canOpenURL = originalCanOpenURL;
      Linking.openURL = originalOpenURL;
    }
  },
};

export const UnsupportedEnvironment: Story = {
  play: async ({ canvasElement }) => {
    const originalCanOpenURL = Linking.canOpenURL;
    const originalOpenURL = Linking.openURL;
    const canOpenURL = fn(async () => false);
    const openURL = fn(async () => undefined);
    Linking.canOpenURL = canOpenURL;
    Linking.openURL = openURL;

    try {
      const canvas = within(canvasElement);
      await userEvent.click(
        canvas.getByRole('link', { name: 'Byulmaru ID 계정 설정, 외부 서비스로 이동' }),
      );
      await expect(canvas.getByRole('alert')).toHaveTextContent(
        'Byulmaru ID 계정 설정을 열지 못했어요.',
      );
      await expect(
        canvas.getByRole('button', { name: 'Byulmaru ID 계정 설정 다시 시도' }),
      ).toBeVisible();
      await expect(openURL).not.toHaveBeenCalled();
    } finally {
      Linking.canOpenURL = originalCanOpenURL;
      Linking.openURL = originalOpenURL;
    }
  },
};

export const NavigationFailureRetry: Story = {
  play: async ({ canvasElement }) => {
    const originalCanOpenURL = Linking.canOpenURL;
    const originalOpenURL = Linking.openURL;
    let attempts = 0;
    let resolveRetry: (() => void) | undefined;
    const canOpenURL = fn(async () => true);
    const openURL = fn(() => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.reject(new Error('story navigation failure'));
      }
      return new Promise<void>((resolve) => {
        resolveRetry = resolve;
      });
    });
    Linking.canOpenURL = canOpenURL;
    Linking.openURL = openURL;

    try {
      const canvas = within(canvasElement);
      await userEvent.click(
        canvas.getByRole('link', { name: 'Byulmaru ID 계정 설정, 외부 서비스로 이동' }),
      );
      await expect(canvas.getByRole('alert')).toBeVisible();
      const retry = canvas.getByRole('button', {
        name: 'Byulmaru ID 계정 설정 다시 시도',
      });
      retry.focus();
      const retryInteraction = userEvent.keyboard('{Enter}');
      await waitFor(() => expect(resolveRetry).toBeDefined());
      await expect(canvas.getByRole('alert')).toBeVisible();
      await expect(retry).toHaveAttribute('aria-busy', 'true');
      await expect(retry).toHaveFocus();
      await expect(openURL).toHaveBeenCalledTimes(2);
      resolveRetry?.();
      await retryInteraction;
      await waitFor(() => expect(canvas.queryByRole('alert')).not.toBeInTheDocument());
    } finally {
      Linking.canOpenURL = originalCanOpenURL;
      Linking.openURL = originalOpenURL;
    }
  },
};
