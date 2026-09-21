import baseMeta, {
  ComposerBeforeUnloadContract as composerBeforeUnloadContract,
  ContentWarningProductionConsumersShareRevealStateInteraction as contentWarningConsumersInteraction,
  ContentWarningQuoteIndependentLifecycleInteraction as contentWarningQuoteInteraction,
  ContentWarningRevealInteraction as contentWarningRevealInteraction,
  ContentWarningSourcePreviewRevealInteraction as contentWarningSourcePreviewInteraction,
  LinkedSourceQuote as linkedSourceQuote,
  LinkedSourceQuoteInteraction as linkedSourceQuoteInteraction,
} from './Posts.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Patterns/Post/Catalog/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const LinkedSourceQuoteInteraction: Story = linkedSourceQuoteInteraction;
export const ComposerBeforeUnloadContract: Story = composerBeforeUnloadContract;

export const ContentWarningReveal: Story = contentWarningRevealInteraction;

export const ContentWarningSourcePreviewReveal: Story = contentWarningSourcePreviewInteraction;

export const ContentWarningProductionConsumersShareRevealState: Story =
  contentWarningConsumersInteraction;

export const ContentWarningQuoteIndependentLifecycle: Story = contentWarningQuoteInteraction;

export const LinkedSourceQuoteDark: Story = {
  ...linkedSourceQuote,
  globals: { backgrounds: { value: 'kosmoDark' }, theme: 'dark' },
};
