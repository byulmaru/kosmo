import { useLayoutEffect, useRef } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import { Tab, TabList } from '@/components/ui/Tabs';
import baseMeta, {
  PillInteractionContract as pillInteractionContract,
  UnderlineInteractionContract as underlineInteractionContract,
} from './Tabs.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { TabOption } from '@/components/ui/Tabs';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Tabs/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

type InitialTab = 'first' | 'second';

const initialOptions = [
  { label: '첫째', value: 'first' },
  { label: '둘째', value: 'second' },
] satisfies readonly TabOption<InitialTab>[];

function InitialIndicatorPosition() {
  const probeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const probe = probeRef.current;
    if (!probe) {
      return;
    }

    const observer = new MutationObserver(() => {
      const group = probe.querySelector<HTMLElement>('[role="tablist"]');
      const indicator = group?.lastElementChild as HTMLElement | null;
      const selected = group?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (
        !group ||
        !indicator ||
        !selected ||
        getComputedStyle(indicator).position !== 'absolute'
      ) {
        return;
      }

      const groupRect = group.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();
      probe.dataset.initialIndicatorLeft = getComputedStyle(indicator).left;
      probe.dataset.expectedIndicatorLeft = String(
        selectedRect.left - groupRect.left + selectedRect.width / 2 - 32,
      );
      observer.disconnect();
    });
    observer.observe(probe, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div data-testid="initial-indicator-position" ref={probeRef}>
      <TabList
        accessibilityLabel="초기 선택"
        onValueChange={() => undefined}
        value="second"
        variant="underline"
      >
        {initialOptions.map((option) => (
          <Tab key={option.value} option={option} />
        ))}
      </TabList>
    </div>
  );
}

export const UnderlineInteractionContract: Story = underlineInteractionContract;
export const PillInteractionContract: Story = pillInteractionContract;
export const InitialUnderlineIndicatorPosition: Story = {
  render: () => <InitialIndicatorPosition />,
  play: async ({ canvasElement }) => {
    const probe = within(canvasElement).getByTestId('initial-indicator-position');
    await waitFor(() => expect(probe.dataset.initialIndicatorLeft).toBeDefined());
    const initialLeft = Number.parseFloat(probe.dataset.initialIndicatorLeft ?? 'NaN');
    const expectedLeft = Number.parseFloat(probe.dataset.expectedIndicatorLeft ?? 'NaN');
    expect(Number.isFinite(initialLeft)).toBe(true);
    expect(Math.abs(initialLeft - expectedLeft)).toBeLessThan(1);
  },
};
