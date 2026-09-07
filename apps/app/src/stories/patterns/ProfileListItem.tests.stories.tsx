import { expect, userEvent, within } from 'storybook/test';
import baseMeta, {
  LayoutContract as layoutContract,
  ListMobileGeometryContract as listMobileGeometryContract,
} from './ProfileListItem.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/ProfileListItem/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const LayoutContract: Story = layoutContract;
export const ListMobileGeometryContract: Story = listMobileGeometryContract;

export const HitAreaContract: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: { relay: { mutationError: 'Follow action contract check' } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const user = userEvent.setup();
    const link = canvas.getByRole('link');
    const followButton = canvas.getByRole('button', { name: '팔로우' });
    const onPress = args.onPress;

    expect(link).toHaveAttribute('href', '/@with-bio');
    if (!onPress) {
      throw new Error('ProfileListItem HitAreaContract requires onPress.');
    }
    const row = link.parentElement;
    if (!row) {
      throw new Error('ProfileListItem HitAreaContract requires a row parent.');
    }
    const preventNavigation = (event: MouseEvent) => event.preventDefault();
    link.addEventListener('click', preventNavigation);

    try {
      const rowBounds = row.getBoundingClientRect();
      const linkBounds = link.getBoundingClientRect();
      const rowBorderBottom = Number.parseFloat(getComputedStyle(row).borderBottomWidth);
      expect(linkBounds.left).toBeCloseTo(rowBounds.left);
      expect(linkBounds.top).toBeCloseTo(rowBounds.top);
      expect(linkBounds.bottom).toBeCloseTo(rowBounds.bottom - rowBorderBottom);

      const elementAt = (x: number, y: number) => {
        const target = canvasElement.ownerDocument.elementFromPoint(x, y);
        expect(target).not.toBeNull();
        return target as HTMLElement;
      };

      for (const targetKind of ['left', 'top', 'bottom'] as const) {
        const currentRowBounds = row.getBoundingClientRect();
        const currentLinkBounds = link.getBoundingClientRect();
        const currentBorderBottom = Number.parseFloat(getComputedStyle(row).borderBottomWidth);
        const [x, y] =
          targetKind === 'left'
            ? [currentRowBounds.left + 2, currentLinkBounds.top + currentLinkBounds.height / 2]
            : targetKind === 'top'
              ? [currentLinkBounds.left + currentLinkBounds.width / 2, currentLinkBounds.top + 2]
              : [
                  currentLinkBounds.left + currentLinkBounds.width / 2,
                  currentRowBounds.bottom - currentBorderBottom - 2,
                ];
        onPress.mockClear();
        const paddingTarget = elementAt(x, y);
        expect(link.contains(paddingTarget)).toBe(true);
        await user.click(paddingTarget);
        expect(onPress).toHaveBeenCalledOnce();
      }

      for (const targetKind of ['gap', 'right', 'below'] as const) {
        const currentLinkBounds = link.getBoundingClientRect();
        const currentFollowBounds = followButton.getBoundingClientRect();
        const [x, y] =
          targetKind === 'gap'
            ? [
                currentLinkBounds.right + (currentFollowBounds.left - currentLinkBounds.right) / 2,
                currentFollowBounds.top + currentFollowBounds.height / 2,
              ]
            : targetKind === 'right'
              ? [
                  currentFollowBounds.right + 2,
                  currentFollowBounds.top + currentFollowBounds.height / 2,
                ]
              : [
                  currentFollowBounds.left + currentFollowBounds.width / 2,
                  currentFollowBounds.bottom + 2,
                ];
        onPress.mockClear();
        const outsideTarget = elementAt(x, y);
        expect(link.contains(outsideTarget)).toBe(false);
        expect(followButton.contains(outsideTarget)).toBe(false);
        await user.click(outsideTarget);
        expect(onPress).not.toHaveBeenCalled();
      }

      link.focus();
      expect(link).toHaveFocus();
      onPress.mockClear();
      await user.keyboard('{Enter}');
      expect(onPress).toHaveBeenCalledOnce();
      await user.tab();
      expect(followButton).toHaveFocus();

      onPress.mockClear();
      await user.click(followButton);
      expect(onPress).not.toHaveBeenCalled();
      const alert = await canvas.findByRole('alert');
      const updatedRowBounds = row.getBoundingClientRect();
      const updatedLinkBounds = link.getBoundingClientRect();
      const alertBounds = alert.getBoundingClientRect();
      expect(updatedLinkBounds.left).toBeGreaterThanOrEqual(updatedRowBounds.left);
      expect(updatedLinkBounds.bottom).toBeCloseTo(updatedRowBounds.bottom - rowBorderBottom);
      expect(updatedLinkBounds.right).toBeLessThanOrEqual(alertBounds.left);
      expect(alertBounds.right).toBeLessThanOrEqual(updatedRowBounds.right);
    } finally {
      link.removeEventListener('click', preventNavigation);
    }
  },
};

export const MobileHitAreaContract: Story = {
  ...HitAreaContract,
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
};
