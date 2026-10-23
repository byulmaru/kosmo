import baseMeta, {
  ActionBarPendingNavigation as actionBarPendingNavigation,
  ActionBarPostNavigation as actionBarPostNavigation,
  ActionBarQuoteNavigation as actionBarQuoteNavigation,
  ActionBarRepostNavigation as actionBarRepostNavigation,
  ActionBarRepostOfQuoteNavigation as actionBarRepostOfQuoteNavigation,
  ActionBarThreadNavigation as actionBarThreadNavigation,
  ComposerBeforeUnloadContract as composerBeforeUnloadContract,
  ContentWarningCardPressableFeedbackInteraction as contentWarningCardPressableFeedback,
  ContentWarningProductionConsumersShareRevealStateInteraction as contentWarningConsumersInteraction,
  ContentWarningQuoteIndependentLifecycleInteraction as contentWarningQuoteInteraction,
  ContentWarningRevealInteraction as contentWarningRevealInteraction,
  ContentWarningSourcePreviewRevealInteraction as contentWarningSourcePreviewInteraction,
  LinkedSourceQuote as linkedSourceQuote,
  LinkedSourceQuoteInteraction as linkedSourceQuoteInteraction,
  ProductionMoreShareReferences as productionMoreShareReferences,
  ReactionSummaryPostNavigation as reactionSummaryPostNavigation,
  ReactionSummaryQuoteNavigation as reactionSummaryQuoteNavigation,
  ReactionSummaryRepostNavigation as reactionSummaryRepostNavigation,
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

export const ReactionSummaryPostNavigation: Story = reactionSummaryPostNavigation;
export const ReactionSummaryQuoteNavigation: Story = reactionSummaryQuoteNavigation;
export const ReactionSummaryRepostNavigation: Story = reactionSummaryRepostNavigation;

export const ActionBarPostNavigation: Story = actionBarPostNavigation;
export const ActionBarQuoteNavigation: Story = actionBarQuoteNavigation;
export const ActionBarRepostNavigation: Story = actionBarRepostNavigation;
export const ActionBarRepostOfQuoteNavigation: Story = actionBarRepostOfQuoteNavigation;
export const ActionBarThreadNavigation: Story = actionBarThreadNavigation;
export const ActionBarPendingNavigation: Story = actionBarPendingNavigation;
