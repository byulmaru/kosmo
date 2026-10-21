import baseMeta, {
  ComposerBeforeUnloadContract as composerBeforeUnloadContract,
  ContentWarningCardPressableFeedbackInteraction as contentWarningCardPressableFeedback,
  ContentWarningProductionConsumersShareRevealStateInteraction as contentWarningConsumersInteraction,
  ContentWarningQuoteIndependentLifecycleInteraction as contentWarningQuoteInteraction,
  ContentWarningRevealInteraction as contentWarningRevealInteraction,
  ContentWarningSourcePreviewRevealInteraction as contentWarningSourcePreviewInteraction,
  LinkedSourceQuote as linkedSourceQuote,
  LinkedSourceQuoteInteraction as linkedSourceQuoteInteraction,
  ProductionMoreShareReferences as productionMoreShareReferences,
  ReplyModalComposerMediaEditorGeometry as replyModalComposerMediaEditorGeometry,
} from './Posts.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
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

export const ContentWarningCardPressableFeedback: Story = contentWarningCardPressableFeedback;

export const ContentWarningQuoteIndependentLifecycle: Story = contentWarningQuoteInteraction;

export const LinkedSourceQuoteDark: Story = {
  ...linkedSourceQuote,
  globals: { backgrounds: { value: 'kosmoDark' }, theme: 'dark' },
};

export const ProductionMoreShareReferences: Story = productionMoreShareReferences;
export const ReplyModalComposerMediaEditorGeometry: Story = replyModalComposerMediaEditorGeometry;
