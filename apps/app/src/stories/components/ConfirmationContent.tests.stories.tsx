import baseMeta, {
  DismissAndFocusContract as dismissAndFocusContract,
  InteractiveSupportingContract as interactiveSupportingContract,
} from './ConfirmationContent.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Confirmation Content/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const DismissAndFocusContract: Story = dismissAndFocusContract;
export const InteractiveSupportingContract: Story = interactiveSupportingContract;
