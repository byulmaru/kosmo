import { View } from 'react-native';
import { expect, userEvent, within } from 'storybook/test';
import { ReactionSummary } from '@/components/reaction/ReactionSummary';
import baseMeta, {
  canonicalReactionEntries,
  ReactionSummaryInteraction as Interaction,
  ReactionSummaryStates as StateCases,
} from './ReactionSummary.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Patterns/Reaction/Summary/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

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
      const bounds = container.getBoundingClientRect();
      expect(bounds.width).toBe(width);
      for (const token of [...tokens, people]) {
        expect(token.getBoundingClientRect().top).toBe(bounds.top);
        expect(token.getBoundingClientRect().right).toBeLessThanOrEqual(bounds.right);
      }
      expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth);
    }
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
