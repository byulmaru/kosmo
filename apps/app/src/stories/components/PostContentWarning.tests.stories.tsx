import { expect, userEvent, within } from 'storybook/test';
import baseMeta, { InteractionContract as interactionContract } from './PostContentWarning.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PostContentWarningStoryArgs } from './PostContentWarning.stories';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Post Content Warning/Tests',
} satisfies Meta<PostContentWarningStoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;

export const InteractionContractDark: Story = {
  ...interactionContract,
  globals: { theme: 'dark' },
};

export const Motion: Story = {
  ...interactionContract,
  tags: ['motion'],
  globals: { reduceMotion: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const warning = canvas.getByRole('button');
    const surface = warning.firstElementChild!;
    const readColor = () => getComputedStyle(surface).backgroundColor;
    const idle = readColor();
    await userEvent.hover(warning);
    const entering: string[] = [];
    const enterStart = performance.now();
    do {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      entering.push(readColor());
    } while (performance.now() - enterStart < 200);
    const hovered = readColor();
    expect(hovered).not.toBe(idle);
    expect(entering.some((color) => color !== idle && color !== hovered)).toBe(true);

    await userEvent.unhover(warning);
    const leaving: string[] = [];
    const leaveStart = performance.now();
    do {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      leaving.push(readColor());
    } while (performance.now() - leaveStart < 200);
    expect(readColor()).toBe(idle);
    expect(leaving.some((color) => color !== idle && color !== hovered)).toBe(true);

    // A cancelled press must not reveal content; a completed action updates semantics immediately.
    await userEvent.pointer({ keys: '[MouseLeft>]', target: warning });
    await userEvent.pointer({ target: canvasElement });
    await userEvent.pointer({ keys: '[/MouseLeft]', target: canvasElement });
    expect(warning).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(warning);
    expect(warning).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(warning);
    expect(warning).toHaveAttribute('aria-expanded', 'false');
  },
};

export const ReducedMotion: Story = {
  ...interactionContract,
  tags: ['motion'],
  globals: { reduceMotion: true },
  play: async ({ canvasElement }) => {
    const warning = within(canvasElement).getByRole('button');
    const surface = warning.firstElementChild!;
    const readColor = () => getComputedStyle(surface).backgroundColor;
    const idle = readColor();
    await userEvent.hover(warning);
    const hovered = readColor();
    expect(hovered).not.toBe(idle);
    for (let frame = 0; frame < 10; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      expect(readColor()).toBe(hovered);
    }
    await userEvent.unhover(warning);
    expect(readColor()).toBe(idle);
    await userEvent.click(warning);
    expect(warning).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(warning);
    expect(warning).toHaveAttribute('aria-expanded', 'false');
  },
};
