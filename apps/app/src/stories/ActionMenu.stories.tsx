import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { expect, userEvent, within } from 'storybook/test';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { spacing } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

function ActionMenuFixture({ disabled = false }: { disabled?: boolean }) {
  const [selectionCount, setSelectionCount] = useState(0);

  return (
    <View style={styles.fixture}>
      <ActionMenu
        accessibilityLabel="재게시 메뉴"
        disabled={disabled}
        items={[
          {
            key: 'repost',
            label: '재게시',
            onSelect: () => setSelectionCount((count) => count + 1),
          },
        ]}
        renderTrigger={({ expanded, onPress, ref }) => (
          <Pressable
            accessibilityLabel="재게시"
            accessibilityRole="button"
            aria-expanded={expanded}
            aria-haspopup="menu"
            onPress={onPress}
            ref={ref}
            style={styles.trigger}
          >
            <Text>재게시</Text>
          </Pressable>
        )}
      />
      <Text testID="selection-count">{selectionCount}</Text>
    </View>
  );
}

function ActionMenuInteractionFixtures() {
  return (
    <View style={styles.fixture}>
      <View accessibilityLabel="기본 메뉴 fixture">
        <ActionMenuFixture />
      </View>
      <View accessibilityLabel="외부 상호작용 fixture">
        <ActionMenuFixture />
        <Pressable accessibilityLabel="바깥 버튼" accessibilityRole="button" style={styles.trigger}>
          <Text>바깥 버튼</Text>
        </Pressable>
      </View>
      <View accessibilityLabel="비활성 메뉴 fixture">
        <ActionMenuFixture disabled />
      </View>
    </View>
  );
}

const meta = {
  component: ActionMenuInteractionFixtures,
  title: 'KOSMO/UI/Action Menu',
} satisfies Meta<typeof ActionMenuInteractionFixtures>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const defaultFixture = within(canvas.getByLabelText('기본 메뉴 fixture'));
    const trigger = defaultFixture.getByRole('button', { name: '재게시' });

    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await userEvent.click(trigger);
    const menu = await defaultFixture.findByRole('menu', { name: '재게시 메뉴' });
    expect(menu).toBeVisible();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(defaultFixture.queryByRole('menu', { name: '재게시 메뉴' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(within(await defaultFixture.findByRole('menu')).getByRole('menuitem'));
    expect(defaultFixture.getByTestId('selection-count')).toHaveTextContent('1');
    expect(trigger).toHaveFocus();

    const outsideFixture = within(canvas.getByLabelText('외부 상호작용 fixture'));
    const outsideTrigger = outsideFixture.getByRole('button', { name: '재게시' });
    await userEvent.click(outsideTrigger);
    await outsideFixture.findByRole('menu', { name: '재게시 메뉴' });
    await userEvent.click(outsideFixture.getByRole('button', { name: '바깥 버튼' }));
    expect(outsideFixture.queryByRole('menu', { name: '재게시 메뉴' })).not.toBeInTheDocument();

    await userEvent.click(outsideTrigger);
    await outsideFixture.findByRole('menu', { name: '재게시 메뉴' });
    await userEvent.tab();
    expect(outsideFixture.getByRole('button', { name: '바깥 버튼' })).toHaveFocus();
    expect(outsideFixture.queryByRole('menu', { name: '재게시 메뉴' })).not.toBeInTheDocument();

    await userEvent.click(outsideTrigger);
    const keyboardMenu = await outsideFixture.findByRole('menu', { name: '재게시 메뉴' });
    const item = within(keyboardMenu).getByRole('menuitem');
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{Home}{End}');
    expect(item).toHaveFocus();
    await userEvent.keyboard('{Escape}');

    const disabledFixture = within(canvas.getByLabelText('비활성 메뉴 fixture'));
    const disabledTrigger = disabledFixture.getByRole('button', { name: '재게시' });
    disabledTrigger.click();
    expect(disabledFixture.queryByRole('menu', { name: '재게시 메뉴' })).not.toBeInTheDocument();
  },
};

const styles = StyleSheet.create({
  fixture: { gap: spacing.md },
  trigger: { alignSelf: 'flex-start', minHeight: 44, padding: spacing.md },
});
