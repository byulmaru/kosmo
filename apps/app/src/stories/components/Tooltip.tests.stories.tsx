import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import { space } from '@/theme/tokens';
import baseMeta, { TooltipStoryFrame } from './Tooltip.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Tooltip } from '@/components/ui/Tooltip';

const meta = {
  ...baseMeta,
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Tooltip/Tests',
} satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const HoverDescriptionAndDismiss: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '미디어 미리보기 열기' });
    const user = userEvent.setup();

    expect(page.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(trigger.getAttribute('aria-describedby')).toBe('tooltip-story-description');
    await user.hover(trigger);

    const tooltip = await page.findByRole('tooltip');
    expect(
      within(tooltip).getByText('이 게시글에는 민감한 콘텐츠가 포함되어 있습니다.'),
    ).toBeVisible();
    expect(trigger.getAttribute('aria-describedby')).toContain(tooltip.id);
    expect(trigger.getAttribute('aria-describedby')).toContain('tooltip-story-description');

    // user-event omits relatedTarget; provide the destination across the portal.
    await fireEvent.pointerOut(trigger, { relatedTarget: tooltip });
    await fireEvent.pointerOver(tooltip, { relatedTarget: trigger });
    expect(page.getByRole('tooltip')).toBeVisible();
    await fireEvent.click(
      within(tooltip).getByText('이 게시글에는 민감한 콘텐츠가 포함되어 있습니다.'),
    );
    expect(page.getByRole('tooltip')).toBeVisible();
    expect(canvas.queryByText('미디어 미리보기가 열렸습니다.')).not.toBeInTheDocument();
    await fireEvent.pointerOut(tooltip, { relatedTarget: canvasElement.ownerDocument.body });
    await waitFor(() => expect(page.queryByRole('tooltip')).not.toBeInTheDocument());
    expect(trigger.getAttribute('aria-describedby')).toBe('tooltip-story-description');
  },
};

export const FocusAndEscape: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '미디어 미리보기 열기' });
    const user = userEvent.setup();

    expect(page.queryByRole('tooltip')).not.toBeInTheDocument();
    await user.tab();
    expect(trigger).toHaveFocus();
    const tooltip = await page.findByRole('tooltip');
    expect(trigger.getAttribute('aria-describedby')).toContain(tooltip.id);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('tooltip')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(trigger.getAttribute('aria-describedby')).toBe('tooltip-story-description');
  },
};

export const TriggerActivationDismisses: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '미디어 미리보기 열기' });
    const user = userEvent.setup();

    await user.hover(trigger);
    await page.findByRole('tooltip');
    await user.click(trigger);
    await waitFor(() => expect(page.queryByRole('tooltip')).not.toBeInTheDocument());
    expect(canvas.getByText('미디어 미리보기가 열렸습니다.')).toBeVisible();
  },
};

export const NearBottomPlacement: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '미디어 미리보기 열기' });
    const window = canvasElement.ownerDocument.defaultView!;
    const user = userEvent.setup();

    await user.hover(trigger);
    const tooltip = await page.findByRole('tooltip');
    await waitFor(() => {
      const triggerRect = trigger.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      expect(tooltipRect.bottom).toBeLessThan(triggerRect.top);
      expect(tooltipRect.top).toBeGreaterThanOrEqual(viewportTop + space[8] - 1);
      expect(tooltipRect.bottom).toBeLessThanOrEqual(viewportBottom - space[8] + 1);
    });
  },
  render: ({ children, label }) => (
    <TooltipStoryFrame atBottom label={label}>
      {children}
    </TooltipStoryFrame>
  ),
};
