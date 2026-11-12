import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '@/components/ui/Button';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import { useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

function ModalOverlayFullscreenFixture() {
  const [visible, setVisible] = useState(false);
  const theme = useTheme();

  return (
    <View style={styles.playground}>
      <Button onPress={() => setVisible(true)}>전체 화면 열기</Button>
      <ModalOverlay
        accessibilityLabel="전체 화면"
        onRequestClose={() => setVisible(false)}
        presentation="fullscreen"
        visible={visible}
      >
        <View style={[styles.fullscreenSurface, { backgroundColor: theme.backgroundCanvas }]}>
          <Text
            accessibilityRole="header"
            style={[
              textStyles.uiHeadingM,
              { color: theme.foregroundPrimary, marginBottom: space[16] },
            ]}
          >
            전체 화면
          </Text>
          <Button tone="secondary" onPress={() => setVisible(false)}>
            닫기
          </Button>
        </View>
      </ModalOverlay>
    </View>
  );
}

const meta = {
  component: ModalOverlayFullscreenFixture,
  title: 'KOSMO/Components/Modal Overlay',
} satisfies Meta<typeof ModalOverlayFullscreenFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fullscreen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: '전체 화면 열기' }));

    const dialog = await page.findByRole('dialog', { name: '전체 화면' });
    expect(dialog).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    await waitFor(() =>
      expect(page.queryByRole('dialog', { name: '전체 화면' })).not.toBeInTheDocument(),
    );
  },
};

const styles = StyleSheet.create({
  fullscreenSurface: { flex: 1, padding: space[16] },
  playground: { padding: space[16] },
});
