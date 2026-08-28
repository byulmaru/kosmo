import { Link2, MoreHorizontal, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { expect, fireEvent, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { semanticColors, spacing } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

function ActionMenuFixture({
  compactTrigger = false,
  disabled = false,
  onSelect,
  quoteLabel = '인용 재게시',
  repostLabel = '재게시',
  showSelectionCount = false,
  singleItem = false,
  triggerLabel = '재게시',
  webHorizontalPlacement,
}: {
  compactTrigger?: boolean;
  disabled?: boolean;
  onSelect?: (key: 'quote' | 'repost') => void;
  quoteLabel?: string;
  repostLabel?: string;
  showSelectionCount?: boolean;
  singleItem?: boolean;
  triggerLabel?: string;
  webHorizontalPlacement?: 'end';
}) {
  const [selectionCount, setSelectionCount] = useState(0);
  const repostItem = {
    key: 'repost',
    label: repostLabel,
    onSelect: () => {
      setSelectionCount((count) => count + 1);
      onSelect?.('repost');
    },
  };

  return (
    <View style={styles.fixture}>
      <ActionMenu
        accessibilityLabel={`${triggerLabel} 메뉴`}
        disabled={disabled}
        items={
          singleItem
            ? [repostItem]
            : [
                repostItem,
                {
                  key: 'quote',
                  label: quoteLabel,
                  onSelect: () => {
                    setSelectionCount((count) => count + 1);
                    onSelect?.('quote');
                  },
                },
              ]
        }
        renderTrigger={({ disabled: triggerDisabled, expanded, onPress, ref }) => (
          <Pressable
            accessibilityLabel={triggerLabel}
            accessibilityRole="button"
            disabled={triggerDisabled}
            aria-expanded={expanded}
            aria-haspopup="menu"
            onPress={onPress}
            ref={ref}
            style={[styles.trigger, compactTrigger ? styles.compactTrigger : undefined]}
          >
            <Text>{triggerLabel}</Text>
          </Pressable>
        )}
        webHorizontalPlacement={webHorizontalPlacement}
      />
      {showSelectionCount ? <Text testID="selection-count">{selectionCount}</Text> : null}
    </View>
  );
}

function ActionMenuInteractionFixtures() {
  return (
    <View style={styles.fixture}>
      <View accessibilityLabel="기본 메뉴 fixture">
        <ActionMenuFixture showSelectionCount />
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
      <View accessibilityLabel="end-aligned menu fixture">
        <ActionMenuFixture compactTrigger singleItem webHorizontalPlacement="end" />
      </View>
      <View accessibilityLabel="공용 메뉴 스타일 fixture">
        <ActionMenu
          accessibilityLabel="더 보기 메뉴"
          items={[
            {
              icon: Link2,
              key: 'copy-link',
              label: '링크 복사',
              onSelect: () => undefined,
            },
            {
              accessibilityLabel: '게시글 삭제',
              icon: Trash2,
              key: 'delete-post',
              label: '삭제',
              onSelect: () => undefined,
              tone: 'danger',
            },
          ]}
          renderTrigger={({ expanded, onPress, ref }) => (
            <Pressable
              accessibilityLabel="더 보기"
              accessibilityRole="button"
              aria-expanded={expanded}
              aria-haspopup="menu"
              onPress={onPress}
              ref={ref}
              style={styles.compactTrigger}
            >
              <MoreHorizontal size={16} />
            </Pressable>
          )}
          webHorizontalPlacement="end"
        />
      </View>
    </View>
  );
}

const meta = {
  args: {
    compactTrigger: false,
    disabled: false,
    onSelect: fn(),
    quoteLabel: '인용 재게시',
    repostLabel: '재게시',
    singleItem: false,
    triggerLabel: '재게시',
  },
  component: ActionMenuFixture,
  excludeStories: ['InteractionContract', 'DarkInteractionContract'],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Action Menu',
} satisfies Meta<typeof ActionMenuFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: [
        'compactTrigger',
        'disabled',
        'quoteLabel',
        'repostLabel',
        'singleItem',
        'triggerLabel',
      ],
    },
  },
};

export const InteractionContract: Story = {
  render: () => <ActionMenuInteractionFixtures />,
  play: async ({ canvasElement, globals }) => {
    const expectedTheme = semanticColors[globals.theme === 'dark' ? 'dark' : 'light'];
    const canvas = within(canvasElement);
    const defaultFixture = within(canvas.getByLabelText('기본 메뉴 fixture'));
    const trigger = defaultFixture.getByRole('button', { name: '재게시' });

    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    Object.assign(trigger.style, { left: '160px', position: 'fixed', top: '80px' });
    await userEvent.click(trigger);
    const menu = await screen.findByRole('menu', { name: '재게시 메뉴' });
    const defaultMenuItem = within(menu).getByRole('menuitem', { name: '재게시' });
    const defaultMenuRect = menu.getBoundingClientRect();
    const defaultMenuItemRect = defaultMenuItem.getBoundingClientRect();
    const defaultTriggerRect = trigger.getBoundingClientRect();
    expect(menu).toBeVisible();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(defaultMenuRect.left).toBeCloseTo(defaultTriggerRect.left - 5, 0);
    expect(defaultMenuItemRect.left).toBeCloseTo(defaultTriggerRect.left, 0);
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
    const serializeColor = (color: string) => {
      const probe = ownerDocument.createElement('div');
      probe.style.color = color;
      return probe.style.color;
    };
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
    await waitFor(expectCollisionGeometry);

    Object.assign(collisionTrigger.style, { bottom: '40px', right: '40px' });
    ownerDocument.dispatchEvent(new Event('scroll'));
    await waitFor(expectCollisionGeometry);
    Object.assign(collisionTrigger.style, { bottom: '72px', right: '72px' });
    ownerWindow.dispatchEvent(new Event('resize'));
    await waitFor(expectCollisionGeometry);
    await userEvent.keyboard('{Escape}');

    const endAlignedFixture = within(canvas.getByLabelText('end-aligned menu fixture'));
    const endAlignedTrigger = endAlignedFixture.getByRole('button', { name: '재게시' });
    Object.assign(endAlignedTrigger.style, {
      bottom: '160px',
      position: 'fixed',
      right: '160px',
    });
    await userEvent.click(endAlignedTrigger);
    const endAlignedMenu = await screen.findByRole('menu', { name: '재게시 메뉴' });
    const endAlignedItem = within(endAlignedMenu).getByRole('menuitem', { name: '재게시' });
    const expectEndAlignedGeometry = (expectedClampedLeft?: number) => {
      const menuRect = endAlignedMenu.getBoundingClientRect();
      const itemRect = endAlignedItem.getBoundingClientRect();
      const triggerRect = endAlignedTrigger.getBoundingClientRect();

      if (expectedClampedLeft === undefined) {
        expect(menuRect.left).toBeLessThan(triggerRect.left);
        expect(menuRect.right).toBeCloseTo(triggerRect.right + 5, 0);
        expect(itemRect.right).toBeCloseTo(triggerRect.right, 0);
      } else {
        expect(menuRect.left).toBeCloseTo(expectedClampedLeft, 0);
      }
      expect(menuRect.left).toBeGreaterThanOrEqual(0);
      expect(menuRect.right).toBeLessThanOrEqual(ownerDocument.documentElement.clientWidth);
      for (const point of [
        { x: triggerRect.left + 1, y: triggerRect.top + 1 },
        { x: triggerRect.right - 1, y: triggerRect.bottom - 1 },
      ]) {
        expect(endAlignedItem.contains(ownerDocument.elementFromPoint(point.x, point.y))).toBe(
          true,
        );
      }
    };
    await waitFor(expectEndAlignedGeometry);

    Object.assign(endAlignedTrigger.style, { left: '8px', right: 'auto' });
    ownerDocument.dispatchEvent(new Event('scroll'));
    await waitFor(() => expectEndAlignedGeometry(0));
    await userEvent.keyboard('{Escape}');

    const styleFixture = within(canvas.getByLabelText('공용 메뉴 스타일 fixture'));
    await userEvent.click(styleFixture.getByRole('button', { name: '더 보기' }));
    const styleMenu = await screen.findByRole('menu', { name: '더 보기 메뉴' });
    const copyItem = within(styleMenu).getByRole('menuitem', { name: '링크 복사' });
    const deleteItem = within(styleMenu).getByRole('menuitem', { name: '게시글 삭제' });
    const copyIcon = copyItem.querySelector('svg')!;
    const deleteIcon = deleteItem.querySelector('svg')!;
    const copyLabel = within(copyItem).getByText('링크 복사');
    const deleteLabel = within(deleteItem).getByText('삭제');

    expect(getComputedStyle(styleMenu).backgroundColor).toBe(
      serializeColor(expectedTheme.backgroundElevated),
    );
    expect(getComputedStyle(styleMenu).borderTopColor).toBe(
      serializeColor(expectedTheme.borderDefault),
    );
    expect(copyIcon.getBoundingClientRect().left).toBeCloseTo(
      deleteIcon.getBoundingClientRect().left,
      0,
    );
    expect(copyLabel.getBoundingClientRect().left).toBeCloseTo(
      deleteLabel.getBoundingClientRect().left,
      0,
    );
    expect(getComputedStyle(copyLabel).textAlign).toBe('left');
    expect(getComputedStyle(copyItem).borderTopWidth).toBe('0px');
    expect(getComputedStyle(deleteItem).borderTopWidth).toBe('1px');
    expect(getComputedStyle(deleteItem).borderTopColor).toBe(
      serializeColor(expectedTheme.borderSubtle),
    );
    fireEvent.keyDown(copyItem, { key: 'Enter' });
    await waitFor(() =>
      expect(getComputedStyle(copyItem).backgroundColor).toBe(
        serializeColor(expectedTheme.statePressed),
      ),
    );
    fireEvent.keyUp(copyItem, { key: 'Enter' });
    await userEvent.keyboard('{Enter}');
    const hoveredStyleMenu = await screen.findByRole('menu', { name: '더 보기 메뉴' });
    const hoveredCopyItem = within(hoveredStyleMenu).getByRole('menuitem', { name: '링크 복사' });
    await userEvent.hover(hoveredCopyItem);
    expect(getComputedStyle(hoveredCopyItem).backgroundColor).toBe(
      serializeColor(expectedTheme.stateHover),
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Enter}');
    const reopenedStyleMenu = await screen.findByRole('menu', { name: '더 보기 메뉴' });
    const reopenedCopyItem = within(reopenedStyleMenu).getByRole('menuitem', { name: '링크 복사' });
    expect(getComputedStyle(reopenedCopyItem).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    await userEvent.keyboard('{Escape}');

    const disabledFixture = within(canvas.getByLabelText('비활성 메뉴 fixture'));
    const disabledTrigger = disabledFixture.getByRole('button', { name: '재게시' });
    expect(disabledTrigger).toHaveAttribute('aria-disabled', 'true');
    expect(disabledTrigger).toHaveAttribute('tabindex', '-1');
    expect(getComputedStyle(disabledTrigger).cursor).not.toBe('pointer');
    disabledTrigger.click();
    expect(screen.queryByRole('menu', { name: '재게시 메뉴' })).not.toBeInTheDocument();
  },
};

export const DarkInteractionContract: Story = {
  ...InteractionContract,
  globals: { backgrounds: { value: 'kosmoDark' }, theme: 'dark' },
};

const styles = StyleSheet.create({
  compactTrigger: { height: 28, minHeight: 28, padding: 0, width: 50 },
  fixture: { gap: spacing.md },
  trigger: { alignSelf: 'flex-start', minHeight: 44, padding: spacing.md },
});
