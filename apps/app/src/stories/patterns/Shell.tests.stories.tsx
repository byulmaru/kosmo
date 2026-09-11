import baseMeta, {
  UniversalCompactComposerLifecycle as universalCompactComposerLifecycle,
  UniversalFullComposerLifecycle as universalFullComposerLifecycle,
  UniversalMobileComposerLifecycle as universalMobileComposerLifecycle,
} from './Shell.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Patterns/Shell/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const UniversalCompactComposerLifecycle: Story = universalCompactComposerLifecycle;
export const UniversalFullComposerLifecycle: Story = universalFullComposerLifecycle;
export const UniversalMobileComposerLifecycle: Story = universalMobileComposerLifecycle;
