import { fn } from 'storybook/test';
import { ReactionPeopleScreen } from '@/components/reaction/ReactionPeopleScreen';
import {
  peopleCounts,
  peoplePostId,
  peopleQueryData,
  ReactionPeopleExample,
} from './ReactionPeople.fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  args: {
    onBack: fn(),
    onTypeChange: fn(),
    postId: peoplePostId,
    reactionCounts: peopleCounts,
    reactionType: peopleCounts[0]!.type,
  },
  argTypes: {
    onBack: { control: false },
    onTypeChange: { control: false },
    postId: { control: false },
    reactionCounts: { control: false },
    reactionType: { control: 'select', options: peopleCounts.map(({ type }) => type) },
  },
  component: ReactionPeopleScreen,
  parameters: {
    layout: 'fullscreen',
    relay: { operationResponses: { ReactionPeopleScreenQuery: { data: peopleQueryData() } } },
    router: { pathname: `/@author/${peoplePostId}/reactions` },
  },
  render: (args) => <ReactionPeopleExample key={args.reactionType} {...args} />,
  title: 'KOSMO/Screens/Reaction People',
} satisfies Meta<typeof ReactionPeopleScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
};

export const Compact: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoProfileCompact' } },
};

export const Full: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoProfileFull' } },
};
