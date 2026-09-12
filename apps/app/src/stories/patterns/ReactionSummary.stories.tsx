import { useState } from 'react';
import { Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { ReactionSummary } from '@/components/reaction/ReactionSummary';
import { Catalog, Section } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Href } from 'expo-router';

export const canonicalReactionEntries = [
  { count: 24, type: '🥹' },
  { count: 18, type: '❤️' },
  { count: 12, type: '🎉' },
  { count: 9, type: '👀' },
  { count: 7, type: '☘️' },
  { count: 3, type: '🌈' },
] as const;

function ReactionSummaryPlayground({
  disabled = false,
  errorType,
  pendingType,
  selectedType = '❤️',
}: {
  disabled?: boolean;
  errorType?: string;
  pendingType?: string;
  selectedType?: string;
}) {
  return (
    <Catalog width={600}>
      <ReactionSummary
        disabled={disabled}
        entries={canonicalReactionEntries}
        errorTypeIds={errorType ? [errorType] : undefined}
        onMore={fn()}
        onToggle={fn()}
        pendingTypeIds={pendingType ? [pendingType] : undefined}
        selectedTypeIds={selectedType ? [selectedType] : []}
      />
    </Catalog>
  );
}

export function ReactionSummaryStates() {
  return (
    <Catalog width={600}>
      <Section title="Selected and pending">
        <ReactionSummary
          entries={canonicalReactionEntries}
          onMore={fn()}
          onToggle={fn()}
          pendingTypeIds={['🎉']}
          selectedTypeIds={['❤️', '🎉']}
        />
      </Section>
      <Section title="Error and disabled">
        <ReactionSummary
          disabled
          entries={canonicalReactionEntries}
          errorTypeIds={['👀']}
          onMore={fn()}
          onToggle={fn()}
          selectedTypeIds={['👀']}
        />
      </Section>
      <Section title="Loading and empty">
        <ReactionSummary loading />
        <ReactionSummary entries={[]} />
      </Section>
    </Catalog>
  );
}

export function ReactionSummaryInteraction() {
  const [selected, setSelected] = useState<ReadonlyArray<string>>(['❤️']);
  const toggle = ({ nextSelected, optionId }: { nextSelected: boolean; optionId: string }) => {
    setSelected((current) =>
      nextSelected ? [...current, optionId] : current.filter((value) => value !== optionId),
    );
  };

  return (
    <View style={{ width: 240 }}>
      <ReactionSummary
        entries={canonicalReactionEntries}
        onToggle={toggle}
        peopleHref={'/@kosmo/reaction-post/reactions' as Href}
        selectedTypeIds={selected}
      />
      <Text>{`선택: ${selected.join(' ')}`}</Text>
    </View>
  );
}

const meta = {
  component: ReactionSummaryPlayground,
  title: 'KOSMO/Patterns/Reaction/Summary',
} satisfies Meta<typeof ReactionSummaryPlayground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { selectedType: '❤️' },
  argTypes: {
    disabled: { control: 'boolean' },
    errorType: {
      control: 'select',
      options: ['', ...canonicalReactionEntries.map(({ type }) => type)],
    },
    pendingType: {
      control: 'select',
      options: ['', ...canonicalReactionEntries.map(({ type }) => type)],
    },
    selectedType: {
      control: 'select',
      options: ['', ...canonicalReactionEntries.map(({ type }) => type)],
    },
  },
};

export const States: Story = {
  parameters: { controls: { disable: true } },
  render: () => <ReactionSummaryStates />,
};

export const Interaction: Story = {
  parameters: { controls: { disable: true } },
  render: () => <ReactionSummaryInteraction />,
};
