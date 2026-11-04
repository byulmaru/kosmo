import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { PostComposerModalHost } from '@/components/post/PostComposerModalHost';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

function PostComposerModalHostFixture() {
  const [visible, setVisible] = useState(false);
  const theme = useTheme();

  return (
    <View style={styles.fixture}>
      <Button onPress={() => setVisible(true)}>글쓰기 열기</Button>
      <PostComposerModalHost
        accessibilityLabel="글쓰기"
        accessibilityViewIsModal
        interactionDisabled={!visible}
        onRequestClose={() => setVisible(false)}
        role="dialog"
        transparent
        visible={visible}
      >
        <View style={[styles.surface, { backgroundColor: theme.backgroundCanvas }]}>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: theme.foregroundPrimary }]}
          >
            글쓰기
          </Text>
          <Button onPress={() => setVisible(false)} tone="secondary">
            닫기
          </Button>
        </View>
      </PostComposerModalHost>
    </View>
  );
}

const meta = {
  component: PostComposerModalHostFixture,
  title: 'KOSMO/Patterns/Post Composer Modal Host',
} satisfies Meta<typeof PostComposerModalHostFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => <PostComposerModalHostFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const dialogOptions = { name: '글쓰기' };

    expect(page.queryByRole('dialog', dialogOptions)).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: '글쓰기 열기' }));

    const dialog = await page.findByRole('dialog', dialogOptions);
    expect(dialog).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(page.queryByRole('dialog', dialogOptions)).not.toBeInTheDocument());
  },
};

const styles = StyleSheet.create({
  fixture: { flex: 1, justifyContent: 'center', padding: space[16] },
  surface: { flex: 1, gap: space[16], padding: space[24] },
  title: textStyles.uiHeadingS,
});
