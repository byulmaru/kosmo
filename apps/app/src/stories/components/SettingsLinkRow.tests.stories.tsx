import { expect, userEvent, waitFor, within } from 'storybook/test';
import baseMeta, {
  BoundaryContract as boundaryContract,
  InteractionContract as interactionContract,
  ReducedMotionContract as reducedMotionContract,
} from './SettingsLinkRow.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Settings Link Row/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const ReducedMotionContract: Story = reducedMotionContract;

export const BoundaryContract: Story = {
  ...boundaryContract,
  globals: { reduceMotion: true },
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rows = [
      { link: canvas.getByRole('link', { name: '긴 기본 설정 행 열기' }), minHeight: 64 },
      { link: canvas.getByRole('link', { name: '긴 컴팩트 설정 행 열기, 시스템' }), minHeight: 40 },
    ];

    for (const { link, minHeight } of rows) {
      await userEvent.unhover(link);

      const targetBounds = link.getBoundingClientRect();
      expect(targetBounds.height).toBeGreaterThan(minHeight);
      const selectedFeedback = paintedFeedback(link);
      const selectedColor = getComputedStyle(selectedFeedback).backgroundColor;
      expect(selectedColor).not.toBe('transparent');
      expect(selectedColor).not.toBe('rgba(0, 0, 0, 0)');
      expectPaintBoundsAndHitTarget(link, selectedFeedback);

      await userEvent.hover(link);

      await waitFor(() => {
        const feedback = paintedFeedback(link);
        expect(getComputedStyle(feedback).backgroundColor).not.toBe(selectedColor);
      });

      const hoveredFeedback = paintedFeedback(link);
      expectPaintBoundsAndHitTarget(link, hoveredFeedback);
    }
  },
};

function paintedFeedback(link: HTMLElement): HTMLElement {
  return (
    [link, ...Array.from(link.querySelectorAll<HTMLElement>('*'))]
      .filter((element) => {
        const backgroundColor = getComputedStyle(element).backgroundColor;
        return backgroundColor !== 'transparent' && backgroundColor !== 'rgba(0, 0, 0, 0)';
      })
      .sort((left, right) => {
        const leftBounds = left.getBoundingClientRect();
        const rightBounds = right.getBoundingClientRect();
        return rightBounds.width * rightBounds.height - leftBounds.width * leftBounds.height;
      })[0] ?? link
  );
}

function expectPaintBoundsAndHitTarget(link: HTMLElement, feedback: HTMLElement) {
  const targetBounds = link.getBoundingClientRect();
  const feedbackBounds = feedback.getBoundingClientRect();
  const feedbackStyles = getComputedStyle(feedback);

  expect(feedbackBounds.left).toBeCloseTo(targetBounds.left, 1);
  expect(feedbackBounds.top).toBeCloseTo(targetBounds.top, 1);
  expect(feedbackBounds.right).toBeCloseTo(targetBounds.right, 1);
  expect(feedbackBounds.bottom).toBeCloseTo(targetBounds.bottom, 1);
  expect([
    feedbackStyles.borderTopLeftRadius,
    feedbackStyles.borderTopRightRadius,
    feedbackStyles.borderBottomRightRadius,
    feedbackStyles.borderBottomLeftRadius,
  ]).toEqual(['0px', '0px', '0px', '0px']);

  const centerX = targetBounds.left + targetBounds.width / 2;
  const centerY = targetBounds.top + targetBounds.height / 2;
  for (const [x, y] of [
    [targetBounds.left + 1, centerY],
    [targetBounds.right - 1, centerY],
    [centerX, targetBounds.top + 1],
    [centerX, targetBounds.bottom - 1],
  ]) {
    const hit = link.ownerDocument.elementFromPoint(x!, y!);
    expect(hit).not.toBeNull();
    expect(link.contains(hit)).toBe(true);
  }
}
