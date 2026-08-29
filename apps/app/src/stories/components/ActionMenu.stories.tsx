import { Link2, MoreHorizontal, Trash2 } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { expect, fireEvent, fn, mocked, screen, userEvent, waitFor, within } from 'storybook/test';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { semanticColors, spacing } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

const defaultItemLabels = ['항목 1', '항목 2'];
const repostFixtureProps = {
  itemLabels: ['재게시', '인용 재게시'],
  triggerLabel: '재게시',
};

function ActionMenuFixture({
  compactTrigger = false,
  disabled = false,
  itemCount = 2,
  itemLabels = defaultItemLabels,
  onOpenChange,
  onSelect,
  triggerLabel = '더 보기',
  webHorizontalPlacement,
  webVerticalPlacement,
}: {
  compactTrigger?: boolean;
  disabled?: boolean;
  itemCount?: number;
  itemLabels?: string[];
  onOpenChange?: (open: boolean) => void;
  onSelect?: (key: string) => void;
  triggerLabel?: string;
  webHorizontalPlacement?: 'after' | 'end';
  webVerticalPlacement?: 'end';
}) {
  const items = Array.from({ length: Math.max(1, Math.min(8, itemCount)) }, (_, index) => {
    const key = `item-${index + 1}`;
    return {
      key,
      label: itemLabels[index]?.trim() || `항목 ${index + 1}`,
      onSelect: () => onSelect?.(key),
    };
  });

  return (
    <View style={styles.fixture}>
      <ActionMenu
        accessibilityLabel={`${triggerLabel} 메뉴`}
        disabled={disabled}
        items={items}
        onOpenChange={onOpenChange}
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
        webVerticalPlacement={webVerticalPlacement}
      />
    </View>
  );
}

function ActionMenuCollisionFixtures({ onSelect }: { onSelect?: (key: string) => void }) {
  return (
    <View style={styles.fixture}>
      <View accessibilityLabel="viewport collision fixture">
        <ActionMenuFixture
          {...repostFixtureProps}
          compactTrigger
          itemCount={1}
          onSelect={onSelect}
        />
      </View>
      <View accessibilityLabel="end-aligned menu fixture">
        <ActionMenuFixture
          {...repostFixtureProps}
          compactTrigger
          itemCount={1}
          webHorizontalPlacement="end"
        />
      </View>
      <View accessibilityLabel="after-end menu fixture">
        <ActionMenuFixture
          {...repostFixtureProps}
          compactTrigger
          itemCount={1}
          webHorizontalPlacement="after"
          webVerticalPlacement="end"
        />
      </View>
    </View>
  );
}

function ActionMenuBehaviorFixtures() {
  return (
    <View style={styles.fixture}>
      <View accessibilityLabel="외부 상호작용 fixture">
        <ActionMenuFixture {...repostFixtureProps} />
        <Pressable accessibilityLabel="바깥 버튼" accessibilityRole="button" style={styles.trigger}>
          <Text>바깥 버튼</Text>
        </Pressable>
      </View>
      <View accessibilityLabel="비활성 메뉴 fixture">
        <ActionMenuFixture {...repostFixtureProps} disabled />
      </View>
      <ActionMenuStyleFixture mode="light" />
      <ActionMenuStyleFixture mode="dark" />
    </View>
  );
}

function ActionMenuStyleFixture({ mode }: { mode: 'dark' | 'light' }) {
  const label = mode === 'dark' ? '다크' : '라이트';

  return (
    <ThemeProvider mode={mode}>
      <View accessibilityLabel={`${label} 공용 메뉴 스타일 fixture`}>
        <ActionMenu
          accessibilityLabel={`${label} 더 보기 메뉴`}
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
              accessibilityLabel={`${label} 더 보기`}
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
    </ThemeProvider>
  );
}

const meta = {
  args: {
    compactTrigger: false,
    disabled: false,
    itemCount: 2,
    itemLabels: defaultItemLabels,
    onOpenChange: fn(),
    onSelect: fn(),
    triggerLabel: '더 보기',
  },
  argTypes: {
    itemCount: { control: { max: 8, min: 1, step: 1, type: 'range' } },
    itemLabels: { control: 'object' },
  },
  component: ActionMenuFixture,
  excludeStories: ['InteractionContract', 'SurfaceAndDismissContract', 'ViewportCollision'],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Action Menu',
} satisfies Meta<typeof ActionMenuFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: ['compactTrigger', 'disabled', 'itemCount', 'itemLabels', 'triggerLabel'],
    },
  },
};

export const InteractionContract: Story = {
  args: {
    compactTrigger: false,
    disabled: false,
    itemCount: 2,
    itemLabels: defaultItemLabels,
    triggerLabel: '더 보기',
  },
  play: async ({ args, canvasElement, step }) => {
    args.onSelect?.mockClear();
    const canvas = within(canvasElement);
    const itemCount = Math.max(1, Math.min(8, args.itemCount ?? 2));
    const itemLabels = Array.from(
      { length: itemCount },
      (_, index) => args.itemLabels?.[index]?.trim() || `항목 ${index + 1}`,
    );
    const triggerLabel = args.triggerLabel ?? '더 보기';
    const trigger = canvas.getByRole('button', { name: triggerLabel });
    const onOpenChange = mocked(args.onOpenChange!);

    if (args.disabled) {
      await step('비활성 trigger 계약 확인', async () => {
        expect(trigger).toHaveAttribute('aria-disabled', 'true');
        expect(trigger).toHaveAttribute('tabindex', '-1');
        expect(getComputedStyle(trigger).cursor).not.toBe('pointer');
        trigger.click();
        expect(
          screen.queryByRole('menu', { name: `${triggerLabel} 메뉴` }),
        ).not.toBeInTheDocument();
      });
      return;
    }

    await step('메뉴 열기·키보드 탐색·dismiss', async () => {
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
      onOpenChange.mockClear();
      await userEvent.click(trigger);
      expect(onOpenChange).toHaveBeenLastCalledWith(true);
      const menu = await screen.findByRole('menu', { name: `${triggerLabel} 메뉴` });
      const items = within(menu).getAllByRole('menuitem');
      expect(items.map((item) => item.textContent)).toEqual(itemLabels);
      expect(items[0]).toHaveFocus();
      if (items.length > 1) {
        await userEvent.keyboard('{ArrowDown}');
        expect(items[1]).toHaveFocus();
        await userEvent.keyboard('{ArrowUp}');
        expect(items[0]).toHaveFocus();
      }
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('menu', { name: `${triggerLabel} 메뉴` })).not.toBeInTheDocument();
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
      expect(trigger).toHaveFocus();
    });

    await step('항목 선택과 callback 확인', async () => {
      await userEvent.click(trigger);
      const menu = await screen.findByRole('menu', { name: `${triggerLabel} 메뉴` });
      await userEvent.click(within(menu).getByRole('menuitem', { name: itemLabels[0] }));
      expect(args.onSelect).toHaveBeenCalledOnce();
      expect(args.onSelect).toHaveBeenLastCalledWith('item-1');
      expect(trigger).toHaveFocus();
    });
  },
};

export const SurfaceAndDismissContract: Story = {
  render: () => <ActionMenuBehaviorFixtures />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const ownerDocument = canvasElement.ownerDocument;
    const serializeColor = (color: string) => {
      const probe = ownerDocument.createElement('div');
      probe.style.color = color;
      return probe.style.color;
    };

    await step('기본 배치와 외부 상호작용 dismiss', async () => {
      const fixture = within(canvas.getByLabelText('외부 상호작용 fixture'));
      const trigger = fixture.getByRole('button', { name: '재게시' });
      Object.assign(trigger.style, { left: '160px', position: 'fixed', top: '80px' });
      await userEvent.click(trigger);
      const menu = await screen.findByRole('menu', { name: '재게시 메뉴' });
      const menuItem = within(menu).getByRole('menuitem', { name: '재게시' });
      expect(menu.getBoundingClientRect().left).toBeCloseTo(
        trigger.getBoundingClientRect().left - 5,
        0,
      );
      expect(menuItem.getBoundingClientRect().left).toBeCloseTo(
        trigger.getBoundingClientRect().left,
        0,
      );
      await userEvent.click(fixture.getByRole('button', { name: '바깥 버튼' }));
      expect(screen.queryByRole('menu', { name: '재게시 메뉴' })).not.toBeInTheDocument();

      await userEvent.click(trigger);
      await screen.findByRole('menu', { name: '재게시 메뉴' });
      await userEvent.tab();
      await userEvent.tab();
      expect(fixture.getByRole('button', { name: '바깥 버튼' })).toHaveFocus();
      expect(screen.queryByRole('menu', { name: '재게시 메뉴' })).not.toBeInTheDocument();
    });

    await step('메뉴 스타일과 비활성 상태 확인', async () => {
      for (const [label, mode] of [
        ['라이트', 'light'],
        ['다크', 'dark'],
      ] as const) {
        const styleFixture = within(canvas.getByLabelText(`${label} 공용 메뉴 스타일 fixture`));
        const styleTrigger = styleFixture.getByRole('button', { name: `${label} 더 보기` });
        await userEvent.click(styleTrigger);
        const styleMenu = await screen.findByRole('menu', { name: `${label} 더 보기 메뉴` });
        expect(getComputedStyle(styleMenu).backgroundColor).toBe(
          serializeColor(semanticColors[mode].backgroundElevated),
        );
        expect(getComputedStyle(styleMenu).borderTopColor).toBe(
          serializeColor(semanticColors[mode].borderDefault),
        );
        await userEvent.keyboard('{ArrowDown}');
        await userEvent.keyboard('{Escape}');
        expect(styleTrigger).toHaveFocus();
      }

      const styleFixture = within(canvas.getByLabelText('라이트 공용 메뉴 스타일 fixture'));
      await userEvent.click(styleFixture.getByRole('button', { name: '라이트 더 보기' }));
      const styleMenu = await screen.findByRole('menu', { name: '라이트 더 보기 메뉴' });
      const copyItem = within(styleMenu).getByRole('menuitem', { name: '링크 복사' });
      const deleteItem = within(styleMenu).getByRole('menuitem', { name: '게시글 삭제' });
      const copyIcon = copyItem.querySelector('svg')!;
      const deleteIcon = deleteItem.querySelector('svg')!;
      const copyLabel = within(copyItem).getByText('링크 복사');
      const deleteLabel = within(deleteItem).getByText('삭제');

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
        serializeColor(semanticColors.light.borderSubtle),
      );
      fireEvent.keyDown(copyItem, { key: 'Enter' });
      await waitFor(() =>
        expect(getComputedStyle(copyItem).backgroundColor).toBe(
          serializeColor(semanticColors.light.statePressed),
        ),
      );
      fireEvent.keyUp(copyItem, { key: 'Enter' });
      await userEvent.keyboard('{Enter}');
      const hoveredMenu = await screen.findByRole('menu', { name: '라이트 더 보기 메뉴' });
      const hoveredCopyItem = within(hoveredMenu).getByRole('menuitem', { name: '링크 복사' });
      await userEvent.hover(hoveredCopyItem);
      expect(getComputedStyle(hoveredCopyItem).backgroundColor).toBe(
        serializeColor(semanticColors.light.stateHover),
      );
      await userEvent.keyboard('{Escape}');

      const disabledFixture = within(canvas.getByLabelText('비활성 메뉴 fixture'));
      const disabledTrigger = disabledFixture.getByRole('button', { name: '재게시' });
      expect(disabledTrigger).toHaveAttribute('aria-disabled', 'true');
      expect(disabledTrigger).toHaveAttribute('tabindex', '-1');
      expect(getComputedStyle(disabledTrigger).cursor).not.toBe('pointer');
      disabledTrigger.click();
      expect(screen.queryByRole('menu', { name: '재게시 메뉴' })).not.toBeInTheDocument();
    });
  },
};

export const ViewportCollision: Story = {
  render: (args) => <ActionMenuCollisionFixtures onSelect={args.onSelect} />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const ownerDocument = canvasElement.ownerDocument;
    const ownerWindow = ownerDocument.defaultView!;

    await step('화면 가장자리에서 메뉴 위치 확인', async () => {
      const collisionFixture = within(canvas.getByLabelText('viewport collision fixture'));
      const collisionTrigger = collisionFixture.getByRole('button', { name: '재게시' });
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
          expect(collisionItem.contains(ownerDocument.elementFromPoint(point.x, point.y))).toBe(
            true,
          );
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
    });

    await step('끝 정렬 메뉴의 화면 경계 보정 확인', async () => {
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
    });

    await step('오른쪽 바깥·아래끝 anchor 확인', async () => {
      const afterEndFixture = within(canvas.getByLabelText('after-end menu fixture'));
      const afterEndTrigger = afterEndFixture.getByRole('button', { name: '재게시' });
      Object.assign(afterEndTrigger.style, {
        left: '160px',
        position: 'fixed',
        top: '160px',
      });
      await userEvent.click(afterEndTrigger);
      const afterEndMenu = await screen.findByRole('menu', { name: '재게시 메뉴' });

      await waitFor(() => {
        const menuRect = afterEndMenu.getBoundingClientRect();
        const triggerRect = afterEndTrigger.getBoundingClientRect();
        expect(menuRect.left).toBeCloseTo(triggerRect.right + spacing.sm, 0);
        expect(menuRect.bottom).toBeCloseTo(triggerRect.bottom, 0);
      });
      await userEvent.keyboard('{Escape}');
    });
  },
};

const styles = StyleSheet.create({
  compactTrigger: { height: 28, minHeight: 28, padding: 0, width: 50 },
  fixture: { gap: spacing.md },
  trigger: { alignSelf: 'flex-start', minHeight: 44, padding: spacing.md },
});
