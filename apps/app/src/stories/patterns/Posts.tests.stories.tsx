import { expect, screen, waitFor, within } from 'storybook/test';
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
  ComposerKeyboardSubmitInteraction as composerKeyboardSubmitInteraction,
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
  ReplyFullscreenKeyboardFixture as replyFullscreenKeyboardFixture,
  ReplyFullscreenVisibleViewport as replyFullscreenVisibleViewport,
  ReplyModalBackdropDismissInteraction as replyModalBackdropDismissInteraction,
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
export const ComposerKeyboardSubmitInteraction: Story = composerKeyboardSubmitInteraction;

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

export const ReplyFullscreenVisibleViewport: Story = replyFullscreenVisibleViewport;
export const ReplyFullscreenInitialAnchorInteraction: Story = {
  ...replyFullscreenKeyboardFixture,
  play: async ({ canvasElement }) => {
    const dialog = await screen.findByRole('dialog', { name: '답글 쓰기' });
    const composer = within(dialog);
    const parent = composer.getByTestId('reply-parent');
    const body = composer.getByRole('textbox', { name: '답글 본문' }) as HTMLTextAreaElement;
    const scroll = composer.getByTestId('mobile-fullscreen-composer-scroll');
    const backdrop = screen.getByTestId('reply-composer-backdrop');
    const surface = composer.getByTestId('reply-composer-dialog-surface');
    const storyWindow = canvasElement.ownerDocument.defaultView;
    const visualViewport = storyWindow?.visualViewport;
    if (!storyWindow || !visualViewport) {
      throw new Error('Reply anchor story requires a browser visual viewport.');
    }

    await waitFor(() => {
      const parentBounds = parent.getBoundingClientRect();
      const scrollBounds = scroll.getBoundingClientRect();
      expect(scroll.scrollTop).toBeGreaterThan(0);
      expect(parentBounds.bottom).toBeLessThanOrEqual(scrollBounds.top + 1);
    });
    await waitFor(() => expect(body).toHaveFocus());
    await new Promise<void>((resolve) => storyWindow.requestAnimationFrame(() => resolve()));
    expect(scroll.scrollTop).toBeGreaterThan(0);
    expect(parent.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      scroll.getBoundingClientRect().top + 1,
    );
    const expectParentVisible = async () => {
      await waitFor(() => {
        const scrollBounds = scroll.getBoundingClientRect();
        const parentBounds = parent.getBoundingClientRect();
        expect(scroll.scrollTop).toBe(0);
        expect(parentBounds.top).toBeGreaterThanOrEqual(scrollBounds.top - 1);
        expect(parentBounds.bottom).toBeLessThanOrEqual(scrollBounds.bottom + 1);
      });
    };
    const expectViewport = async (height: number, offsetTop: number) => {
      await waitFor(() => {
        const backdropBounds = backdrop.getBoundingClientRect();
        const surfaceBounds = surface.getBoundingClientRect();
        expect(backdropBounds.top).toBeCloseTo(offsetTop, 0);
        expect(backdropBounds.height).toBeCloseTo(height, 0);
        expect(surfaceBounds.top).toBeCloseTo(offsetTop, 0);
        expect(surfaceBounds.height).toBeCloseTo(height, 0);
      });
    };

    const originalHeightDescriptor = Object.getOwnPropertyDescriptor(visualViewport, 'height');
    const originalOffsetTopDescriptor = Object.getOwnPropertyDescriptor(
      visualViewport,
      'offsetTop',
    );
    const originalHeight = visualViewport.height;
    const originalOffsetTop = visualViewport.offsetTop;
    const setVisibleViewport = (height: number, offsetTop: number) => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, value: height });
      Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, value: offsetTop });
      visualViewport.dispatchEvent(new storyWindow.Event('resize'));
      visualViewport.dispatchEvent(new storyWindow.Event('scroll'));
    };
    const restoreVisibleViewport = () => {
      if (originalHeightDescriptor) {
        Object.defineProperty(visualViewport, 'height', originalHeightDescriptor);
      } else {
        Reflect.deleteProperty(visualViewport, 'height');
      }
      if (originalOffsetTopDescriptor) {
        Object.defineProperty(visualViewport, 'offsetTop', originalOffsetTopDescriptor);
      } else {
        Reflect.deleteProperty(visualViewport, 'offsetTop');
      }
      visualViewport.dispatchEvent(new storyWindow.Event('resize'));
      visualViewport.dispatchEvent(new storyWindow.Event('scroll'));
    };

    try {
      scroll.scrollTop = 0;
      scroll.dispatchEvent(new storyWindow.Event('scroll'));
      await expectParentVisible();

      setVisibleViewport(360, 40);
      await expectViewport(360, 40);
      await expectParentVisible();

      setVisibleViewport(originalHeight, originalOffsetTop);
      await expectViewport(originalHeight, originalOffsetTop);
      await expectParentVisible();
    } finally {
      restoreVisibleViewport();
    }
  },
};
export const ReplyModalBackdropDismissInteraction: Story = replyModalBackdropDismissInteraction;
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
