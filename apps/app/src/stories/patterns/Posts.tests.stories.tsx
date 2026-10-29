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
  PostDetailThreadRouteCoachmarkAuto as postDetailThreadRouteCoachmarkAuto,
  PostDetailThreadRouteCoachmarkInteraction as postDetailThreadRouteCoachmarkInteraction,
  PostDetailThreadRouteCoachmarkNoReactions as postDetailThreadRouteCoachmarkNoReactions,
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
export const AuthorNavigationLongName: Story = authorNavigationLongName;
export const AuthorNavigationLongHandle: Story = authorNavigationLongHandle;
export const AuthorNavigationShort: Story = authorNavigationShort;
export const AuthorNavigationTruncated: Story = authorNavigationTruncated;
export const AuthorNavigationQuote: Story = authorNavigationQuote;
export const AuthorNavigationRepost: Story = authorNavigationRepost;
export const AuthorNavigationRepostOfQuote: Story = authorNavigationRepostOfQuote;

export const PostDetailThreadRouteCoachmark: Story = postDetailThreadRouteCoachmarkInteraction;

export const PostDetailThreadRouteCoachmarkAuto: Story = {
  ...postDetailThreadRouteCoachmarkAuto,
  play: async () => {
    const findReadySurface = async (actionName: '다음' | '완료') => {
      const surface = await screen.findByTestId('coachmark-surface');
      await waitFor(() => {
        const action = within(surface).getByRole('button', { name: actionName });
        expect(surface).toBeVisible();
        expect(action).toBeVisible();
        expect(action).toBeEnabled();
      });
      return surface;
    };

    let surface = await findReadySurface('다음');
    expect(within(surface).getByText('이모지로 마음을 표현해요')).toBeVisible();
    expect(within(surface).getByRole('progressbar')).toHaveAttribute('aria-valuemax', '5');

    for (const title of [
      '같은 마음이라면 이모지를 눌러요',
      '함께 보고 싶은 글을 공유해요',
      '다시 보고 싶은 글을 저장해요',
      '답글로 대화를 이어가요',
    ]) {
      await userEvent.click(within(surface).getByRole('button', { name: '다음' }));
      surface = await findReadySurface(title === '답글로 대화를 이어가요' ? '완료' : '다음');
      expect(within(surface).getByText(title)).toBeVisible();
    }

    await userEvent.click(within(surface).getByRole('button', { name: '완료' }));
    await waitFor(() => expect(screen.queryByTestId('coachmark-surface')).not.toBeInTheDocument());
  },
};

export const PostDetailThreadRouteCoachmarkNoReactions: Story = {
  ...postDetailThreadRouteCoachmarkNoReactions,
  play: async () => {
    const findReadySurface = async (actionName: '다음' | '완료') => {
      const surface = await screen.findByTestId('coachmark-surface');
      await waitFor(() => {
        const action = within(surface).getByRole('button', { name: actionName });
        expect(surface).toBeVisible();
        expect(action).toBeVisible();
        expect(action).toBeEnabled();
      });
      return surface;
    };

    let surface = await findReadySurface('다음');
    expect(within(surface).getByText('이모지로 마음을 표현해요')).toBeVisible();
    expect(within(surface).getByRole('progressbar')).toHaveAttribute('aria-valuemax', '4');

    for (const title of [
      '함께 보고 싶은 글을 공유해요',
      '다시 보고 싶은 글을 저장해요',
      '답글로 대화를 이어가요',
    ]) {
      await userEvent.click(within(surface).getByRole('button', { name: '다음' }));
      surface = await findReadySurface(title === '답글로 대화를 이어가요' ? '완료' : '다음');
      expect(within(surface).getByText(title)).toBeVisible();
    }

    await userEvent.click(within(surface).getByRole('button', { name: '완료' }));
    await waitFor(() => expect(screen.queryByTestId('coachmark-surface')).not.toBeInTheDocument());
  },
};
