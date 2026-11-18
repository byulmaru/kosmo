import baseMeta, {
  InteractionContract as interactionContract,
} from './OpenSourceLicenseList.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Open Source License List/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
