import baseMeta, {
  ActionBarCatalogInteraction as actionBarCatalogInteraction,
  ActionSemanticColorsDarkInteraction as actionSemanticColorsDarkInteraction,
  AuthorPostDeletion as authorPostDeletion,
  AuthorPostDeletionFailureRetry as authorPostDeletionFailureRetry,
  AuthorPostDeletionGraphQLErrorRetry as authorPostDeletionGraphQLErrorRetry,
  AuthorPostDeletionPending as authorPostDeletionPending,
  ControlledReply as controlledReply,
  InteractionContract as interactionContract,
  NoSelectedProfileDisablesReaction as noSelectedProfileDisablesReaction,
  PlaygroundInteraction as playgroundInteraction,
  ProcessingAccessibility as processingAccessibility,
  ReactionConcurrentMutationContract as reactionConcurrentMutationContract,
  ReactionFailureRetryActorSwitchAndUnmount as reactionFailureRetryActorSwitchAndUnmount,
  ReactionPopoverDismissFocusAndPlacement as reactionPopoverDismissFocusAndPlacement,
  ReactionSummaryToggleContract as reactionSummaryToggleContract,
} from './PostActionBar.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Patterns/Post/Action Bar/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const PlaygroundInteraction: Story = playgroundInteraction;
export const ActionBarCatalogInteraction: Story = actionBarCatalogInteraction;
export const ActionSemanticColorsDarkInteraction: Story = actionSemanticColorsDarkInteraction;
export const AuthorPostDeletion: Story = authorPostDeletion;
export const AuthorPostDeletionPending: Story = authorPostDeletionPending;
export const AuthorPostDeletionFailureRetry: Story = authorPostDeletionFailureRetry;
export const AuthorPostDeletionGraphQLErrorRetry: Story = authorPostDeletionGraphQLErrorRetry;
export const ControlledReply: Story = controlledReply;
export const ReactionPopoverDismissFocusAndPlacement: Story =
  reactionPopoverDismissFocusAndPlacement;
export const NoSelectedProfileDisablesReaction: Story = noSelectedProfileDisablesReaction;
export const ReactionSummaryToggleContract: Story = reactionSummaryToggleContract;
export const ReactionConcurrentMutationContract: Story = reactionConcurrentMutationContract;
export const ReactionFailureRetryActorSwitchAndUnmount: Story =
  reactionFailureRetryActorSwitchAndUnmount;
export const InteractionContract: Story = interactionContract;
export const ProcessingAccessibility: Story = processingAccessibility;
