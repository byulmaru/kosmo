import { useState } from 'react';
import { ReactionPeopleFilter } from '@/components/reaction/ReactionPeopleFilter';
import { Catalog, Section } from '../StoryFrame';
import { canonicalReactionEntries } from './ReactionSummary.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

function ReactionPeopleFilterPlayground() {
  const [value, setValue] = useState<string>(canonicalReactionEntries[0]!.type);

  return (
    <Catalog width={600}>
      <ReactionPeopleFilter
        entries={canonicalReactionEntries}
        onValueChange={setValue}
        value={value}
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
  component: ReactionPeopleFilterPlayground,
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
