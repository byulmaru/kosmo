import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import baseMeta, {
  ActionBarPendingNavigation as actionBarPendingNavigation,
  ActionBarPostNavigation as actionBarPostNavigation,
  ActionBarQuoteNavigation as actionBarQuoteNavigation,
  ActionBarRepostNavigation as actionBarRepostNavigation,
  ActionBarRepostOfQuoteNavigation as actionBarRepostOfQuoteNavigation,
  ActionBarThreadNavigation as actionBarThreadNavigation,
  AuthorNavigationLongHandle as authorNavigationLongHandle,
  AuthorNavigationLongName as authorNavigationLongName,
  AuthorNavigationQuote as authorNavigationQuote,
  AuthorNavigationRepost as authorNavigationRepost,
  AuthorNavigationRepostOfQuote as authorNavigationRepostOfQuote,
  AuthorNavigationShort as authorNavigationShort,
  AuthorNavigationTruncated as authorNavigationTruncated,
  ComposerBeforeUnloadContract as composerBeforeUnloadContract,
  ContentWarningCardPressableFeedbackInteraction as contentWarningCardPressableFeedback,
  ContentWarningProductionConsumersShareRevealStateInteraction as contentWarningConsumersInteraction,
  ContentWarningQuoteIndependentLifecycleInteraction as contentWarningQuoteInteraction,
  ContentWarningRevealInteraction as contentWarningRevealInteraction,
  ContentWarningSourcePreviewRevealInteraction as contentWarningSourcePreviewInteraction,
  LinkedSourceQuote as linkedSourceQuote,
  LinkedSourceQuoteInteraction as linkedSourceQuoteInteraction,
  PostDetailConversationRetryPreservesState as postDetailConversationRetryPreservesState,
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
export const PostDetailConversationRetryPreservesState: Story =
  postDetailConversationRetryPreservesState;

export const ReactionSummaryPostNavigation: Story = reactionSummaryPostNavigation;
export const ReactionSummaryQuoteNavigation: Story = reactionSummaryQuoteNavigation;
export const ReactionSummaryRepostNavigation: Story = reactionSummaryRepostNavigation;

export const PostDetailConversationRetryPreservesScroll: Story = {
  ...postDetailConversationRetryPreservesState,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const storyWindow = canvasElement.ownerDocument.defaultView!;
    const currentRow = await canvas.findByTestId('post-thread-current-route-current');
    const replyRow = await canvas.findByTestId('post-thread-item-route-child');
    await userEvent.click(within(currentRow).getByRole('button', { name: '답글' }));
    const dialog = await screen.findByRole('dialog', { name: '답글 쓰기' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: '답글 본문' }), '스크롤 보존');
    await userEvent.click(within(dialog).getByRole('button', { name: '답글 게시' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '답글 쓰기' })).toBeNull());
    await waitFor(() => expect(canvasElement).toHaveTextContent('답글을 불러오는 중입니다.'));
    storyWindow.scrollTo(0, 200);
    storyWindow.dispatchEvent(new Event('scroll'));
    expect(storyWindow.scrollY).toBe(200);
    await waitFor(() => expect(canvasElement).toHaveTextContent('답글을 불러오지 못했어요'));
    expect(storyWindow.scrollY).toBe(200);
    expect(canvas.getByTestId('post-thread-item-route-child')).toBe(replyRow);

    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(canvasElement).toHaveTextContent('답글을 불러오는 중입니다.'));
    storyWindow.scrollTo(0, 300);
    storyWindow.dispatchEvent(new Event('scroll'));
    expect(storyWindow.scrollY).toBe(300);
    await waitFor(() =>
      expect(canvasElement).toHaveTextContent('targeted refetch로 반영된 새 Reply'),
    );
    expect(storyWindow.scrollY).toBe(300);
    expect(canvas.getByTestId('post-thread-current-route-current')).toBe(currentRow);
    expect(canvas.getByTestId('post-thread-item-route-child')).toBe(replyRow);
  },
};
export const ActionBarPostNavigation: Story = actionBarPostNavigation;
export const ActionBarQuoteNavigation: Story = actionBarQuoteNavigation;
export const ActionBarRepostNavigation: Story = actionBarRepostNavigation;
export const ActionBarRepostOfQuoteNavigation: Story = actionBarRepostOfQuoteNavigation;
export const ActionBarThreadNavigation: Story = actionBarThreadNavigation;
export const ActionBarPendingNavigation: Story = actionBarPendingNavigation;
export const AuthorNavigationLongName: Story = authorNavigationLongName;
export const AuthorNavigationLongHandle: Story = authorNavigationLongHandle;
export const AuthorNavigationShort: Story = authorNavigationShort;
export const AuthorNavigationTruncated: Story = authorNavigationTruncated;
export const AuthorNavigationQuote: Story = authorNavigationQuote;
export const AuthorNavigationRepost: Story = authorNavigationRepost;
export const AuthorNavigationRepostOfQuote: Story = authorNavigationRepostOfQuote;
