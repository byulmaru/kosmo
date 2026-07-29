import { Pressable, StyleSheet, Text, View } from 'react-native';
import { expect, userEvent, waitFor, within } from 'storybook/test';
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

const meta = {
  component: ToastFixture,
  title: 'KOSMO/UI/Toast Provider',
} satisfies Meta<typeof ToastFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

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

const styles = StyleSheet.create({
  button: { alignSelf: 'flex-start', minHeight: 44, padding: spacing.md },
  fixture: { gap: spacing.md },
});
