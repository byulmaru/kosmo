import { expect, userEvent, within } from 'storybook/test';
import baseMeta from './ProfileNameBlock.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Components/ProfileNameBlock/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const LongTextLayout: Story = {
  args: {
    containerWidth: 120,
    linked: false,
    profileId: 'profile-name-block-long',
    variant: 'compact',
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const displayName = canvas.getByText(/아주 긴 표시 이름/);
    const handle = canvas.getByText(/very-long-instance/);

    expect(canvas.queryByRole('link')).not.toBeInTheDocument();
    for (const text of [displayName, handle]) {
      expect(getComputedStyle(text).whiteSpace).toBe('nowrap');
      expect(getComputedStyle(text).textOverflow).toBe('ellipsis');
      expect(getComputedStyle(text).overflow).toBe('hidden');
    }
    expect(displayName.getBoundingClientRect().width).toBeLessThanOrEqual(120);
    expect(handle.getBoundingClientRect().width).toBeLessThanOrEqual(120);
  },
};

export const LinkedHrefKeyboardNavigation: Story = {
  args: {
    containerWidth: 240,
    linked: true,
    profileId: 'profile-name-block-local',
    variant: 'default',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link');

    await expect(link).toHaveAttribute('href', '/@kosmo');
    await userEvent.tab();
    await expect(link).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(link).toHaveFocus();
  },
};

export const HeroWrapsWithoutLink: Story = {
  args: {
    containerWidth: 120,
    linked: false,
    profileId: 'profile-name-block-long',
    variant: 'hero',
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = canvas.getByRole('heading', { name: /아주 긴 표시 이름/ });
    const handle = canvas.getByText(/very-long-instance/);

    expect(heading).toBeVisible();
    expect(canvas.queryByRole('link')).not.toBeInTheDocument();
    for (const text of [heading, handle]) {
      expect(text.getBoundingClientRect().height).toBeGreaterThan(
        Number.parseFloat(getComputedStyle(text).lineHeight),
      );
      expect(text.getBoundingClientRect().width).toBeLessThanOrEqual(120);
    }
  },
};
