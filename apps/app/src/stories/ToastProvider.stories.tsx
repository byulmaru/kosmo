import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ToastProvider, useToast } from '@/components/ui/ToastProvider';
import { spacing } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

function ToastFixture() {
  const { showToast } = useToast();

  return (
    <View style={styles.fixture}>
      <Pressable
        accessibilityLabel="생성 실패 표시"
        accessibilityRole="button"
        onPress={() => showToast('재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.')}
        style={styles.button}
      >
        <Text>생성 실패 표시</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="취소 실패 표시"
        accessibilityRole="button"
        onPress={() => showToast('재게시를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.')}
        style={styles.button}
      >
        <Text>취소 실패 표시</Text>
      </Pressable>
    </View>
  );
}

const scopedRetry = fn();

function ScopedToastFixture() {
  const { showToast } = useToast();
  const cleanup = useRef<() => void>(() => undefined);

  return (
    <View style={styles.fixture}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          cleanup.current = showToast('이전 목록 오류', {
            action: { label: '다시 시도', onPress: scopedRetry },
          });
        }}
      >
        <Text>목록 오류 표시</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => showToast('최신 알림')}>
        <Text>최신 알림 표시</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => cleanup.current()}>
        <Text>이전 목록 정리</Text>
      </Pressable>
    </View>
  );
}

const meta = {
  component: ToastFixture,
  title: 'KOSMO/UI/Toast Provider',
} satisfies Meta<typeof ToastFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

const repeatedToastMessage = '재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.';
const toastDurationMs = 3000;

export const ReplacementAndAutoDismiss: Story = {
  render: () => (
    <ToastProvider>
      <ToastFixture />
    </ToastProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: '생성 실패 표시' }));
    const alert = await canvas.findByRole('alert');
    const toastMessage = within(alert).getByText(
      '재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
    const toastSurface = toastMessage.parentElement!;
    expect(alert).toHaveTextContent('재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    expect(getComputedStyle(toastSurface).backgroundColor).toBe('rgb(38, 38, 38)');
    expect(
      toastMessage.getBoundingClientRect().top - toastSurface.getBoundingClientRect().top,
    ).toBeCloseTo(14, 0);
    await userEvent.click(canvas.getByRole('button', { name: '취소 실패 표시' }));
    expect(canvas.getByRole('alert')).toHaveTextContent(
      '재게시를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
    expect(canvas.getAllByRole('alert')).toHaveLength(1);
    await waitFor(() => expect(canvas.queryByRole('alert')).not.toBeInTheDocument(), {
      timeout: 3500,
    });
  },
};

export const RepeatedMessageRestartsAutoDismiss: Story = {
  render: () => (
    <ToastProvider>
      <ToastFixture />
    </ToastProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '생성 실패 표시' });

    await userEvent.click(trigger);
    const firstAlert = await canvas.findByRole('alert');
    const firstShownAt = Date.now();
    expect(firstAlert).toHaveTextContent(repeatedToastMessage);

    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(canvas.getByRole('alert')).toBe(firstAlert);
    await userEvent.click(trigger);
    const secondAlert = await canvas.findByRole('alert');
    const secondShownAt = Date.now();
    expect(secondAlert).toHaveTextContent(repeatedToastMessage);
    expect(secondAlert).not.toBe(firstAlert);
    expect(canvas.getAllByRole('alert')).toHaveLength(1);

    await waitFor(
      () => {
        expect(Date.now()).toBeGreaterThanOrEqual(firstShownAt + toastDurationMs);
        expect(canvas.getByRole('alert')).toBe(secondAlert);
      },
      { interval: 50, timeout: 2500 },
    );
    await waitFor(() => expect(canvas.queryByRole('alert')).not.toBeInTheDocument(), {
      interval: 50,
      timeout: 1500,
    });
    expect(Date.now() - secondShownAt).toBeGreaterThanOrEqual(toastDurationMs - 100);
  },
};

export const ScopedCleanupDoesNotDismissNewerToast: Story = {
  render: () => (
    <ToastProvider>
      <ScopedToastFixture />
    </ToastProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    scopedRetry.mockClear();

    await userEvent.click(canvas.getByRole('button', { name: '목록 오류 표시' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent('이전 목록 오류');
    await userEvent.click(canvas.getByRole('button', { name: '이전 목록 정리' }));
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: '목록 오류 표시' }));
    await userEvent.click(canvas.getByRole('button', { name: '최신 알림 표시' }));
    expect(canvas.getByRole('alert')).toHaveTextContent('최신 알림');
    await userEvent.click(canvas.getByRole('button', { name: '이전 목록 정리' }));
    expect(canvas.getByRole('alert')).toHaveTextContent('최신 알림');
    expect(scopedRetry).not.toHaveBeenCalled();
  },
};

const styles = StyleSheet.create({
  button: { alignSelf: 'flex-start', minHeight: 44, padding: spacing.md },
  fixture: { gap: spacing.md },
});
