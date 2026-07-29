import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { spacing } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

function ActionMenuFixture({
  compactTrigger = false,
  disabled = false,
  singleItem = false,
}: {
  compactTrigger?: boolean;
  disabled?: boolean;
  singleItem?: boolean;
}) {
  const [selectionCount, setSelectionCount] = useState(0);
  const repostItem = {
    key: 'repost',
    label: '재게시',
    onSelect: () => setSelectionCount((count) => count + 1),
  };

  return (
    <View style={styles.fixture}>
      <ActionMenu
        accessibilityLabel="재게시 메뉴"
        disabled={disabled}
        items={
          singleItem
            ? [repostItem]
            : [
                repostItem,
                {
                  key: 'quote',
                  label: '인용 재게시',
                  onSelect: () => setSelectionCount((count) => count + 1),
                },
              ]
        }
        renderTrigger={({ expanded, onPress, ref }) => (
          <Pressable
            accessibilityLabel="재게시"
            accessibilityRole="button"
            aria-expanded={expanded}
            aria-haspopup="menu"
            onPress={onPress}
            ref={ref}
            style={[styles.trigger, compactTrigger ? styles.compactTrigger : undefined]}
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
      <View accessibilityLabel="viewport collision fixture">
        <ActionMenuFixture compactTrigger singleItem />
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
    const menu = await screen.findByRole('menu', { name: '재게시 메뉴' });
    expect(menu).toBeVisible();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: '재게시 메뉴' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: '재게시' }),
    );
    expect(defaultFixture.getByTestId('selection-count')).toHaveTextContent('1');
    expect(trigger).toHaveFocus();

    const outsideFixture = within(canvas.getByLabelText('외부 상호작용 fixture'));
    const outsideTrigger = outsideFixture.getByRole('button', { name: '재게시' });
    await userEvent.click(outsideTrigger);
    await screen.findByRole('menu', { name: '재게시 메뉴' });
    await userEvent.click(outsideFixture.getByRole('button', { name: '바깥 버튼' }));
    expect(screen.queryByRole('menu', { name: '재게시 메뉴' })).not.toBeInTheDocument();

    await userEvent.click(outsideTrigger);
    await screen.findByRole('menu', { name: '재게시 메뉴' });
    await userEvent.tab();
    await userEvent.tab();
    expect(outsideFixture.getByRole('button', { name: '바깥 버튼' })).toHaveFocus();
    expect(screen.queryByRole('menu', { name: '재게시 메뉴' })).not.toBeInTheDocument();

    await userEvent.click(outsideTrigger);
    const keyboardMenu = await screen.findByRole('menu', { name: '재게시 메뉴' });
    const [repostItem, quoteItem] = within(keyboardMenu).getAllByRole('menuitem');
    expect(repostItem).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(quoteItem).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(repostItem).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(quoteItem).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(repostItem).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(quoteItem).toHaveFocus();
    await userEvent.keyboard('{Escape}');

    const collisionFixture = within(canvas.getByLabelText('viewport collision fixture'));
    const collisionTrigger = collisionFixture.getByRole('button', { name: '재게시' });
    const ownerDocument = canvasElement.ownerDocument;
    const ownerWindow = ownerDocument.defaultView!;
    Object.assign(collisionTrigger.style, {
      bottom: '8px',
      position: 'fixed',
      right: '8px',
    });
    await userEvent.click(collisionTrigger);
    const collisionMenu = await screen.findByRole('menu', { name: '재게시 메뉴' });
    const collisionItem = within(collisionMenu).getByRole('menuitem', { name: '재게시' });
    const expectCollisionGeometry = () => {
      const menuRect = collisionMenu.getBoundingClientRect();
      const triggerRect = collisionTrigger.getBoundingClientRect();
      const triggerCorners = [
        { x: triggerRect.left + 1, y: triggerRect.top + 1 },
        { x: triggerRect.right - 1, y: triggerRect.bottom - 1 },
      ];

      expect(menuRect.left).toBeGreaterThanOrEqual(0);
      expect(menuRect.top).toBeGreaterThanOrEqual(0);
      expect(menuRect.right).toBeLessThanOrEqual(ownerDocument.documentElement.clientWidth);
      expect(menuRect.bottom).toBeLessThanOrEqual(ownerDocument.documentElement.clientHeight);
      for (const point of triggerCorners) {
        expect(collisionItem.contains(ownerDocument.elementFromPoint(point.x, point.y))).toBe(true);
      }
    };
    expectCollisionGeometry();

    Object.assign(collisionTrigger.style, { bottom: '40px', right: '40px' });
    ownerDocument.dispatchEvent(new Event('scroll'));
    await waitFor(expectCollisionGeometry);
    Object.assign(collisionTrigger.style, { bottom: '72px', right: '72px' });
    ownerWindow.dispatchEvent(new Event('resize'));
    await waitFor(expectCollisionGeometry);
    await userEvent.keyboard('{Escape}');

    const disabledFixture = within(canvas.getByLabelText('비활성 메뉴 fixture'));
    const disabledTrigger = disabledFixture.getByRole('button', { name: '재게시' });
    disabledTrigger.click();
    expect(screen.queryByRole('menu', { name: '재게시 메뉴' })).not.toBeInTheDocument();
  },
};

const styles = StyleSheet.create({
  compactTrigger: { height: 28, minHeight: 28, padding: 0, width: 50 },
  fixture: { gap: spacing.md },
  trigger: { alignSelf: 'flex-start', minHeight: 44, padding: spacing.md },
});
