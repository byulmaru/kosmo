import { expect, userEvent, waitFor, within } from 'storybook/test';
import baseMeta, {
  ErrorRecoveryFocus as errorRecoveryFocus,
  ExistingDeletionFlow as existingDeletionFlow,
  OwnerMenuAndConfirmedActions as ownerMenuAndConfirmedActions,
  OwnerReplacement as ownerReplacement,
  PendingContract as pendingContract,
  ProductionWithoutPinFixture as productionWithoutPinFixture,
  SheetIconContract as sheetIconContract,
  VisitorMenuContract as visitorMenuContract,
} from './ProfilePinAction.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Profile/Pin Action/Tests',
} satisfies Meta<typeof baseMeta.component>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OwnerMenuAndConfirmedActions: Story = ownerMenuAndConfirmedActions;
export const OwnerReplacement: Story = {
  ...ownerReplacement,
  play: async ({ args, canvasElement }) => {
    args.onPin.mockClear();
    args.onUnpin.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '더 보기' });

    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '프로필에 고정' }));
    const dialog = await body.findByRole('alertdialog', {
      name: '고정 게시글을 바꿀까요?',
    });
    await userEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(args.onUnpin).not.toHaveBeenCalled();
    expect(args.onPin).not.toHaveBeenCalled();

    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '프로필에 고정' }));
    await userEvent.click(
      within(
        await body.findByRole('alertdialog', {
          name: '고정 게시글을 바꿀까요?',
        }),
      ).getByRole('button', { name: '고정' }),
    );
    await waitFor(() => expect(args.onUnpin).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(args.onPin).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(canvas.getByText('고정됨')).toBeVisible());
  },
};
export const VisitorMenuContract: Story = visitorMenuContract;
export const PendingContract: Story = pendingContract;
export const ErrorRecoveryFocus: Story = errorRecoveryFocus;
export const SheetIconContract: Story = sheetIconContract;

export const ExistingDeletionFlow: Story = existingDeletionFlow;
export const ProductionWithoutPinFixture: Story = productionWithoutPinFixture;
