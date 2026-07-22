import { useState } from 'react';
import { Text } from 'react-native';
import { expect, userEvent, within } from 'storybook/test';
import { ReactionSummary } from '@/components/reaction/ReactionSummary';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';

const tiedEntries = [
  { count: 3, type: '🎉' },
  { count: 3, type: '❤️' },
  { count: 1, type: '👀' },
] as const;

function ReactionSummaryCatalog() {
  const [selectedType, setSelectedType] = useState<string>();
  const [retryCount, setRetryCount] = useState(0);

  return (
    <Catalog>
      <Section title="Loading">
        <ReactionSummary loading />
      </Section>
      <Section title="Error">
        <ReactionSummary error onRetry={() => setRetryCount((count) => count + 1)} />
        <Text>{`재시도: ${retryCount}`}</Text>
      </Section>
      <Section title="Empty">
        <ReactionSummary entries={[]} />
      </Section>
      <Section title="Populated">
        <ReactionSummary entries={tiedEntries} onSelectType={setSelectedType} />
        {selectedType ? <Text>{`선택: ${selectedType}`}</Text> : null}
      </Section>
    </Catalog>
  );
}

const meta = {
  component: ReactionSummaryCatalog,
  title: 'KOSMO/Reactions/ReactionSummary',
} satisfies Meta<typeof ReactionSummaryCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByText('반응 요약을 불러오는 중입니다.')).toBeVisible();
    expect(canvas.getByRole('alert')).toHaveTextContent('반응을 불러오지 못했어요');
    expect(canvas.getByText('아직 반응이 없어요')).toBeVisible();
    expect(
      canvas
        .getAllByRole('button', { name: /반응 \d+개 보기/ })
        .map((button) => button.textContent),
    ).toEqual(['🎉 3', '❤️ 3', '👀 1']);
    expect(canvas.getByRole('button', { name: '❤️ 반응 3개 보기' })).toBeEnabled();

    await userEvent.click(canvas.getByRole('button', { name: '❤️ 반응 3개 보기' }));
    expect(canvas.getByText('선택: ❤️')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    expect(canvas.getByText('재시도: 1')).toBeVisible();
  },
};
