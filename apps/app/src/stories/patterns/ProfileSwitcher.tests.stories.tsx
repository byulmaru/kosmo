import { useState } from 'react';
import { View } from 'react-native';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ProfileEditDiscardDialog } from '@/components/profile/ProfileEditDiscardDialog';
import { ProfileSwitcherTarget } from '@/components/shell/ProfileSwitcherTarget';
import baseMeta, {
  CompactClosedUnreadContract as compactClosedUnreadContract,
  DrawerClosedUnreadContract as drawerClosedUnreadContract,
  EscapeDismissContract as escapeDismissContract,
  InteractionContract as interactionContract,
  LongListContract as longListContract,
  OpenUnreadContract as openUnreadContract,
  OutsideDismissContract as outsideDismissContract,
  SelectionFailureContract as selectionFailureContract,
  WideClosedUnreadContract as wideClosedUnreadContract,
} from './ProfileSwitcher.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  ProfilePickerProfile,
  ProfilePickerSurface,
} from '@/components/profile/ProfilePicker';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Profile Switcher/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const nestedModalProfiles = [
  {
    avatar: null,
    displayName: '코스모 작가',
    id: 'profile-kosmo',
    relativeHandle: '@kosmo',
  },
  {
    avatar: null,
    displayName: '먼 우주의 사용자',
    id: 'profile-remote',
    relativeHandle: '@remote',
  },
] satisfies readonly ProfilePickerProfile[];

function NestedModalProfileSwitcherStory({ surface }: Readonly<{ surface: ProfilePickerSurface }>) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <View style={{ minHeight: 340, padding: 24, width: surface === 'compact' ? 360 : 320 }}>
      <ProfileSwitcherTarget
        onOpenChange={setPickerOpen}
        onSelectProfile={() => setDialogOpen(true)}
        open={pickerOpen}
        profiles={nestedModalProfiles}
        selectedProfileId="profile-kosmo"
        surface={surface}
      />
      <ProfileEditDiscardDialog
        onContinue={() => setDialogOpen(false)}
        onDiscard={() => setDialogOpen(false)}
        visible={dialogOpen}
      />
    </View>
  );
}

async function assertNestedModalDismissal(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  const trigger = canvas.getByRole('button', { name: '프로필 목록' });

  await userEvent.click(trigger);
  const picker = await canvas.findByRole('group', { name: '프로필 전환' });
  await userEvent.click(within(picker).getByRole('button', { name: '먼 우주의 사용자, @remote' }));

  const dialog = await body.findByRole('dialog', { name: '변경사항을 버릴까요?' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(picker).toBeVisible();

  await userEvent.click(within(dialog).getByText('변경사항을 버릴까요?', { exact: true }));
  expect(picker).toBeVisible();
  await userEvent.click(within(dialog).getByRole('button', { name: '계속 편집' }));
  await waitFor(() =>
    expect(body.queryByRole('dialog', { name: '변경사항을 버릴까요?' })).not.toBeInTheDocument(),
  );
  expect(picker).toBeVisible();

  await userEvent.click(within(picker).getByRole('button', { name: '먼 우주의 사용자, @remote' }));
  const escapeDialog = await body.findByRole('dialog', { name: '변경사항을 버릴까요?' });
  const continueButton = within(escapeDialog).getByRole('button', { name: '계속 편집' });
  continueButton.focus();
  expect(continueButton).toHaveFocus();

  await userEvent.keyboard('{Escape}');
  await waitFor(() =>
    expect(body.queryByRole('dialog', { name: '변경사항을 버릴까요?' })).not.toBeInTheDocument(),
  );
  expect(picker).toBeVisible();
  expect(trigger).not.toHaveFocus();

  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(canvas.queryByRole('group', { name: '프로필 전환' })).toBeNull());
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger).toHaveFocus();
}

export const InteractionContract: Story = interactionContract;
export const SelectionFailureContract: Story = selectionFailureContract;
export const EscapeDismissContract: Story = escapeDismissContract;
export const OutsideDismissContract: Story = outsideDismissContract;
export const LongListContract: Story = longListContract;
export const WideClosedUnreadContract: Story = wideClosedUnreadContract;
export const DrawerClosedUnreadContract: Story = drawerClosedUnreadContract;
export const CompactClosedUnreadContract: Story = compactClosedUnreadContract;
export const OpenUnreadContract: Story = openUnreadContract;

export const NestedModalDismissContract: Story = {
  play: ({ canvasElement }) => assertNestedModalDismissal(canvasElement),
  render: () => <NestedModalProfileSwitcherStory surface="full" />,
};

export const NestedModalDismissCompactContract: Story = {
  play: ({ canvasElement }) => assertNestedModalDismissal(canvasElement),
  render: () => <NestedModalProfileSwitcherStory surface="compact" />,
};
