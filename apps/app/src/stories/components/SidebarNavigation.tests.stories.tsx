import baseMeta, {
  PresentationTransitionContract as presentationTransitionContract,
} from './SidebarNavigation.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Sidebar Navigation/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const PresentationTransitionContract: Story = presentationTransitionContract;
