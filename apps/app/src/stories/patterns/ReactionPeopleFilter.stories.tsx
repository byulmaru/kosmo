import { useEffect, useState } from 'react';
import { useArgs } from 'storybook/preview-api';
import { fn } from 'storybook/test';
import { ReactionPeopleFilter } from '@/components/reaction/ReactionPeopleFilter';
import { Catalog, Section } from '../StoryFrame';
import { canonicalReactionEntries } from './ReactionSummary.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactionSummaryEntry } from '@/components/reaction/ReactionSummary';

export type ReactionPeopleFilterPlaygroundArgs = {
  entries: ReadonlyArray<ReactionSummaryEntry>;
  onValueChange: (value: string) => void;
  value: string;
};

function ReactionPeopleFilterPlayground({
  entries,
  onValueChange,
  value,
}: ReactionPeopleFilterPlaygroundArgs) {
  const [selectedType, setSelectedType] = useState(value);
  useEffect(() => setSelectedType(value), [value]);

  return (
    <Catalog width={600}>
      <ReactionPeopleFilter
        entries={entries}
        onValueChange={(nextValue) => {
          setSelectedType(nextValue);
          onValueChange(nextValue);
        }}
        value={selectedType}
      />
    </Catalog>
  );
}

function ReactionPeopleFilterStates() {
  const [value, setValue] = useState<string>(canonicalReactionEntries[0]!.type);

  return (
    <Catalog width={600}>
      <Section title="Selected first type">
        <ReactionPeopleFilter
          entries={canonicalReactionEntries}
          onValueChange={setValue}
          value={value}
        />
      </Section>
      <Section title="No positive reaction types">
        <ReactionPeopleFilter entries={[]} onValueChange={setValue} value="" />
      </Section>
    </Catalog>
  );
}

export const filterContractEntries = [
  ...canonicalReactionEntries,
  { count: 2, type: '💡' },
] as const;

export function ReactionPeopleFilterInteraction() {
  const [value, setValue] = useState<string>(filterContractEntries[0]!.type);

  return (
    <Catalog width={360}>
      <ReactionPeopleFilter
        entries={filterContractEntries}
        onValueChange={setValue}
        value={value}
      />
    </Catalog>
  );
}

const meta = {
  args: {
    entries: canonicalReactionEntries,
    onValueChange: fn(),
    value: canonicalReactionEntries[0]!.type,
  },
  argTypes: {
    entries: { control: 'object' },
    onValueChange: { action: 'valueChange', control: false },
    value: { control: 'text' },
  },
  component: ReactionPeopleFilterPlayground,
  excludeStories: ['filterContractEntries', 'ReactionPeopleFilterInteraction'],
  render: (args) => {
    const [, updateArgs] = useArgs<ReactionPeopleFilterPlaygroundArgs>();
    return (
      <ReactionPeopleFilterPlayground
        {...args}
        onValueChange={(value) => {
          args.onValueChange(value);
          updateArgs({ value });
        }}
      />
    );
  },
  title: 'KOSMO/Patterns/Reaction/People Filter',
} satisfies Meta<typeof ReactionPeopleFilterPlayground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const States: Story = {
  parameters: { controls: { disable: true } },
  render: () => <ReactionPeopleFilterStates />,
};

export const Interaction: Story = {
  parameters: { controls: { disable: true } },
  render: () => <ReactionPeopleFilterInteraction />,
};
