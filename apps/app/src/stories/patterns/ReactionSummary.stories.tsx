import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useArgs } from 'storybook/preview-api';
import { fn } from 'storybook/test';
import { ReactionSummary } from '@/components/reaction/ReactionSummary';
import { Catalog, Section } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Href } from 'expo-router';
import type {
  ReactionSummaryEntry,
  ReactionSummaryProps,
} from '@/components/reaction/ReactionSummary';

export const canonicalReactionEntries = [
  { count: 24, type: '🥹' },
  { count: 18, type: '❤️' },
  { count: 12, type: '🎉' },
  { count: 9, type: '👀' },
  { count: 7, type: '☘️' },
  { count: 3, type: '🌈' },
] as const;

export type ReactionSummaryPlaygroundArgs = {
  disabled?: boolean;
  entries: ReadonlyArray<ReactionSummaryEntry>;
  errorTypeIds: ReadonlyArray<string>;
  onMore: NonNullable<ReactionSummaryProps['onMore']>;
  onToggle: NonNullable<ReactionSummaryProps['onToggle']>;
  onSelectedTypeIdsChange?: (selectedTypeIds: ReadonlyArray<string>) => void;
  pendingTypeIds: ReadonlyArray<string>;
  selectedTypeIds: ReadonlyArray<string>;
};

function ReactionSummaryPlayground({
  disabled = false,
  entries,
  errorTypeIds,
  onMore,
  onToggle,
  onSelectedTypeIdsChange,
  pendingTypeIds,
  selectedTypeIds: selectedTypeIdsArg,
}: ReactionSummaryPlaygroundArgs) {
  const [selectedTypeIds, setSelectedTypeIds] = useState(selectedTypeIdsArg);
  useEffect(() => setSelectedTypeIds(selectedTypeIdsArg), [selectedTypeIdsArg]);

  return (
    <Catalog width={600}>
      <ReactionSummary
        disabled={disabled}
        entries={entries}
        errorTypeIds={errorTypeIds}
        onMore={onMore}
        onToggle={(intent) => {
          const nextSelectedTypeIds = intent.nextSelected
            ? [...selectedTypeIds, intent.optionId]
            : selectedTypeIds.filter((type) => type !== intent.optionId);
          setSelectedTypeIds(nextSelectedTypeIds);
          onToggle(intent);
          onSelectedTypeIdsChange?.(nextSelectedTypeIds);
        }}
        pendingTypeIds={pendingTypeIds}
        selectedTypeIds={selectedTypeIds}
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
  args: {
    entries: canonicalReactionEntries,
    errorTypeIds: [],
    onMore: fn(),
    onToggle: fn(),
    pendingTypeIds: [],
    selectedTypeIds: ['❤️'],
  },
  argTypes: {
    disabled: { control: 'boolean' },
    entries: { control: 'object' },
    errorTypeIds: { control: 'object' },
    onMore: { action: 'more', control: false },
    onSelectedTypeIdsChange: { control: false },
    onToggle: { action: 'toggle', control: false },
    pendingTypeIds: { control: 'object' },
    selectedTypeIds: { control: 'object' },
  },
  component: ReactionSummaryPlayground,
  excludeStories: [
    'canonicalReactionEntries',
    'ReactionSummaryInteraction',
    'ReactionSummaryStates',
  ],
  render: (args) => {
    const [, updateArgs] = useArgs<ReactionSummaryPlaygroundArgs>();
    return (
      <ReactionSummaryPlayground
        {...args}
        onSelectedTypeIdsChange={(selectedTypeIds) => updateArgs({ selectedTypeIds })}
      />
    );
  },
  title: 'KOSMO/Patterns/Reaction/Summary',
} satisfies Meta<typeof ReactionSummaryPlayground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const States: Story = {
  parameters: { controls: { disable: true } },
  render: () => <ReactionSummaryStates />,
};

export const Interaction: Story = {
  parameters: { controls: { disable: true } },
  render: () => <ReactionSummaryInteraction />,
};
