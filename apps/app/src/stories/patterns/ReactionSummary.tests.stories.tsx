import { useState } from 'react';
import { Text, View } from 'react-native';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { PostDetailBackground } from '@/components/post/PostDetailBackground';
import { ReactionSummary } from '@/components/reaction/ReactionSummary';
import {
  checkReactionSummaryExcludedTouches,
  tapReactionSummaryWhitespace,
} from '../reactionSummaryHitTest';
import baseMeta, {
  canonicalReactionEntries,
  ReactionSummaryInteraction as Interaction,
  ReactionSummaryStates as StateCases,
} from './ReactionSummary.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactionSummaryPlaygroundArgs } from './ReactionSummary.stories';

const meta = {
  ...baseMeta,
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Patterns/Reaction/Summary/Tests',
} satisfies Meta<ReactionSummaryPlaygroundArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EditableEntriesRender: Story = {
  args: {
    entries: [{ count: 42, type: '🧩' }],
    selectedTypeIds: ['🧩'],
  },
  play: async ({ canvasElement }) => {
    const reaction = await within(canvasElement).findByRole('button', { name: '🧩 반응 42개' });
    expect(reaction).toHaveAttribute('aria-pressed', 'true');
  },
};

export const PlaygroundSelectionUpdatesArgs: Story = {
  args: { onToggle: fn(), selectedTypeIds: [] },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const reaction = await canvas.findByRole('button', { name: '❤️ 반응 18개' });
    expect(reaction).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(reaction);
    await expect(args.onToggle).toHaveBeenCalledWith({ nextSelected: true, optionId: '❤️' });
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: '❤️ 반응 18개' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
  },
};

function ReactionSummaryMotion() {
  const [pending, setPending] = useState<ReadonlyArray<string>>([]);
  const [selected, setSelected] = useState<ReadonlyArray<string>>(['❤️']);

  return (
    <View style={{ width: 320 }}>
      <ReactionSummary
        entries={canonicalReactionEntries.slice(1, 2)}
        onToggle={({ nextSelected, optionId }) => {
          setSelected(nextSelected ? [optionId] : []);
          setPending([optionId]);
          setTimeout(() => setPending([]), 800);
        }}
        pendingTypeIds={pending}
        selectedTypeIds={selected}
      />
    </View>
  );
}

async function sampleFrames(read: () => string, duration = 260) {
  const samples: string[] = [];
  const start = performance.now();
  do {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    samples.push(read());
  } while (performance.now() - start < duration);
  return samples;
}

const motionPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const reaction = canvas.getByRole('button', { name: '❤️ 반응 18개' });
  const background = canvas.getByTestId('reaction-summary-selected-background');
  const readColor = () => getComputedStyle(background).backgroundColor;
  const selected = readColor();

  await userEvent.click(reaction);
  expect(reaction).toHaveAttribute('aria-busy', 'true');
  const leaving = await sampleFrames(readColor);
  await waitFor(() => expect(readColor()).not.toBe(selected));
  const idle = readColor();
  expect(leaving.some((color) => color !== selected && color !== idle)).toBe(true);

  // Pending blocks another toggle while the optimistic visual transition remains observable.
  const pendingReaction = canvas.getByRole('button', { name: '❤️ 반응 18개, 처리 중' });
  expect(pendingReaction).toBeDisabled();
  await waitFor(() =>
    expect(canvas.getByRole('button', { name: '❤️ 반응 18개' })).toHaveAttribute(
      'aria-pressed',
      'false',
    ),
  );
};

export const MotionContract: Story = {
  tags: ['motion'],
  render: () => <ReactionSummaryMotion />,
  play: motionPlay,
};

export const ReducedMotionContract: Story = {
  tags: ['motion'],
  globals: { reduceMotion: true },
  render: () => <ReactionSummaryMotion />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const reaction = canvas.getByRole('button', { name: '❤️ 반응 18개' });
    const background = canvas.getByTestId('reaction-summary-selected-background');
    const readColor = () => getComputedStyle(background).backgroundColor;
    const selected = readColor();

    await userEvent.click(reaction);
    const idle = readColor();
    expect(idle).not.toBe(selected);
    const frames = await sampleFrames(readColor);
    expect(frames.every((color) => color === idle)).toBe(true);
  },
};

export const WidthFitAndPeopleLink: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  render: () => <Interaction />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = canvas.getByTestId('reaction-summary-row');
    const peopleLink = await canvas.findByRole('link', { name: /반응한 프로필 보기/ });
    await canvas.findByRole('button', { name: /❤️ 반응 18개/ });
    const reactionButtons = canvas
      .getAllByRole('button')
      .filter((button) => /반응 \d+개/.test(button.getAttribute('aria-label') ?? ''));

    expect(reactionButtons.length).toBeLessThan(6);
    expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(
      row.parentElement!.getBoundingClientRect().right,
    );
    expect(row.parentElement!.scrollWidth).toBeLessThanOrEqual(row.parentElement!.clientWidth);
    const documentElement = canvasElement.ownerDocument.documentElement;
    expect(documentElement.scrollWidth).toBeLessThanOrEqual(documentElement.clientWidth);
    expect(peopleLink).toHaveAttribute('href', '/@kosmo/reaction-post/reactions');
    expect(peopleLink.tagName).toBe('A');

    const firstReaction = reactionButtons[0]!;
    const wasSelected = firstReaction.getAttribute('aria-pressed') === 'true';
    await userEvent.click(firstReaction);
    expect(firstReaction).toHaveAttribute('aria-pressed', wasSelected ? 'false' : 'true');
    expect(canvas.queryByRole('button', { name: '🌈 반응 3개' })).not.toBeInTheDocument();
  },
};

export const ConsumerWidthsKeepOneCompleteRow: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoProfileCompact' } },
  render: () => (
    <View style={{ alignItems: 'flex-start', gap: 16 }}>
      {[298, 524, 390, 600].map((width) => (
        <View key={width} style={{ width }} testID={`summary-width-${width}`}>
          <ReactionSummary
            entries={canonicalReactionEntries}
            peopleHref="/@kosmo/reaction-post/reactions"
          />
        </View>
      ))}
      <View style={{ width: 240 }} testID="summary-width-fit">
        <ReactionSummary
          entries={canonicalReactionEntries.slice(0, 2)}
          peopleHref="/@kosmo/reaction-post/reactions"
        />
      </View>
    </View>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const width of [298, 524, 390, 600]) {
      const container = canvas.getByTestId(`summary-width-${width}`);
      const scope = within(container);
      await scope.findByRole('button', { name: '🥹 반응 24개' });
      const tokens = scope.getAllByRole('button');
      const people = scope.getByRole('link', { name: /반응한 프로필 보기/ });
      const hiddenCount = canonicalReactionEntries.length - tokens.length;
      expect(people).toHaveAccessibleName(
        hiddenCount
          ? `숨겨진 반응 유형 ${hiddenCount}개, 반응한 프로필 보기`
          : '반응한 프로필 보기',
      );
      if (hiddenCount > 0) {
        expect(people).toHaveTextContent(`+${hiddenCount}`);
      }
      const bounds = container.getBoundingClientRect();
      expect(bounds.width).toBe(width);
      for (const token of [...tokens, people]) {
        expect(token.getBoundingClientRect().top).toBe(bounds.top);
        expect(token.getBoundingClientRect().right).toBeLessThanOrEqual(bounds.right);
      }
      expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth);
    }
    const fullWidth = within(canvas.getByTestId('summary-width-fit'));
    const peopleLink = fullWidth.getByRole('link', { name: '반응한 프로필 보기' });
    peopleLink.focus();
    expect(peopleLink).toHaveFocus();
    expect(peopleLink).toHaveAttribute('tabindex', '0');

    const getStyle = canvasElement.ownerDocument.defaultView!.getComputedStyle.bind(
      canvasElement.ownerDocument.defaultView,
    );
    const feedbackSurface = [...peopleLink.querySelectorAll<HTMLElement>('*')].find(
      (element) => getStyle(element).position === 'absolute',
    );
    expect(feedbackSurface).toBeDefined();
    expect(getStyle(feedbackSurface!).borderRadius).toBe('12px');

    const documentElement = canvasElement.ownerDocument.documentElement;
    expect(documentElement.scrollWidth).toBeLessThanOrEqual(documentElement.clientWidth);
  },
};

export const StateAccessibility: Story = {
  render: () => <StateCases />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const selected = (await canvas.findAllByRole('button', { name: '❤️ 반응 18개' })).find(
      (button) => button.getAttribute('aria-pressed') === 'true',
    );
    const pending = await canvas.findByRole('button', { name: '🎉 반응 12개, 처리 중' });
    const error = await canvas.findByRole('button', { name: '👀 반응 9개, 오류, 다시 시도' });

    expect(selected).toBeDefined();
    if (!selected) {
      return;
    }
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(
      selected.querySelector('[data-testid="reaction-summary-selected-background"]'),
    ).not.toBeNull();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(pending).toBeDisabled();
    expect(error).toHaveAttribute('aria-pressed', 'true');
    expect(error).toBeDisabled();
    await expect(
      canvas.findByRole('progressbar', { name: '반응 요약을 불러오는 중입니다.' }),
    ).resolves.toBeVisible();
  },
};

function WhitespaceSummary({ width }: { width: number }) {
  const [opened, setOpened] = useState(0);
  const [selected, setSelected] = useState<ReadonlyArray<string>>([]);
  return (
    <PostDetailBackground
      onBackgroundPress={() => setOpened((count) => count + 1)}
      style={{ width }}
      testID="whitespace-summary"
    >
      <ReactionSummary
        entries={canonicalReactionEntries}
        onBackgroundPress={() => setOpened((count) => count + 1)}
        onToggle={({ optionId, nextSelected }) => setSelected(nextSelected ? [optionId] : [])}
        pendingTypeIds={['❤️']}
        peopleHref="/@kosmo/reaction-post/reactions"
        selectedTypeIds={selected}
      />
      <Text testID="opened-count">{opened}</Text>
    </PostDetailBackground>
  );
}

export const TrailingWhitespaceAndIndependentControls: Story = {
  render: () => <WhitespaceSummary width={600} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const count = canvas.getByTestId('opened-count');
    await checkReactionSummaryExcludedTouches(canvasElement, () =>
      expect(count).toHaveTextContent('0'),
    );
    const reaction = canvas.getByRole('button', { name: '🥹 반응 24개' });
    await userEvent.click(reaction);
    expect(reaction).toHaveAttribute('aria-pressed', 'true');
    const pending = canvas.getByRole('button', { name: '❤️ 반응 18개, 처리 중' });
    await userEvent.click(within(pending).getByText('❤️'));
    expect(count).toHaveTextContent('0');
    for (const [index, fraction] of [0, 0.5, 1].entries()) {
      await tapReactionSummaryWhitespace(canvasElement, fraction);
      expect(count.textContent).toBe(String(index + 1));
    }
    await userEvent.click(canvas.getByRole('link', { name: '반응한 프로필 보기' }));
    expect(count.textContent).toBe('3');
  },
};

export const OverflowWhitespaceAndIndependentControls: Story = {
  ...TrailingWhitespaceAndIndependentControls,
  render: () => <WhitespaceSummary width={180} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const count = canvas.getByTestId('opened-count');
    await checkReactionSummaryExcludedTouches(canvasElement, () =>
      expect(count.textContent).toBe('0'),
    );
    expect(canvas.getByRole('link', { name: /숨겨진 반응 유형/ })).toHaveTextContent(/\+\d+/);
    await tapReactionSummaryWhitespace(canvasElement);
    expect(count.textContent).toBe('1');
    await userEvent.click(canvas.getByRole('link', { name: /반응한 프로필 보기/ }));
    expect(count.textContent).toBe('1');
  },
};

export const TrailingGapDoesNotReserveControlWidth: Story = {
  render: () => <WhitespaceSummary width={600} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const background = await canvas.findByTestId('reaction-summary-detail-background');
    const row = canvas.getByTestId('reaction-summary-row');
    const people = within(row).getByRole('link', { name: '반응한 프로필 보기' });
    const host = canvas.getByTestId('whitespace-summary');
    const width = people.getBoundingClientRect().right - row.getBoundingClientRect().left + 2;
    host.style.width = `${width}px`;
    await waitFor(() => expect(row.getBoundingClientRect().width).toBe(width));
    await waitFor(() => expect(background.getBoundingClientRect().width).toBe(0));
    expect(within(row).getAllByRole('button')).toHaveLength(6);
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
    expect(canvas.getByTestId('opened-count').textContent).toBe('0');
  },
};
