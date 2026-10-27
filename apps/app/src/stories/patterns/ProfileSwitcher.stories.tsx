import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useArgs } from 'storybook/preview-api';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ProfileSwitcherTarget } from '@/components/shell/ProfileSwitcherTarget';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  ProfilePickerProfile,
  ProfilePickerSurface,
} from '@/components/profile/ProfilePicker';

const profiles: readonly ProfilePickerProfile[] = [
  {
    avatar: null,
    displayName: '코스모 작가',
    id: 'profile-kosmo',
    relativeHandle: '@kosmo',
    unreadNotificationCount: 0,
  },
  {
    avatar: null,
    displayName: '먼 우주의 사용자',
    id: 'profile-remote',
    relativeHandle: '@remote',
    unreadNotificationCount: 10,
  },
  {
    avatar: null,
    displayName: '아주 긴 이름을 가진 세 번째 프로필',
    id: 'profile-long',
    relativeHandle: '@a-very-long-profile-handle',
    unreadNotificationCount: 10,
  },
  ...Array.from({ length: 5 }, (_, index) => ({
    avatar: null,
    displayName: `추가 프로필 ${index + 4}`,
    id: `profile-${index + 4}`,
    relativeHandle: `@profile-${index + 4}`,
    unreadNotificationCount: 10,
  })),
];

type ProfileSwitcherFixtureProps = Readonly<{
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectProfile: (id: string) => void;
  profiles: readonly ProfilePickerProfile[];
  selectionOutcome: 'failure' | 'success';
  selectedProfileId: string;
  surface: ProfilePickerSurface;
}>;

export function ProfileSwitcherFixture({
  disabled,
  open: initialOpen,
  onOpenChange,
  onSelectProfile,
  profiles,
  selectionOutcome,
  selectedProfileId: initialSelectedProfileId,
  surface,
}: ProfileSwitcherFixtureProps) {
  const [open, setOpen] = useState(initialOpen);
  const [selectedProfileId, setSelectedProfileId] = useState(initialSelectedProfileId);

  useEffect(() => setOpen(initialOpen), [initialOpen]);
  useEffect(() => setSelectedProfileId(initialSelectedProfileId), [initialSelectedProfileId]);

  return (
    <View
      style={{
        minHeight: open ? 340 : 96,
        padding: 24,
        width: surface === 'compact' ? 360 : 320,
      }}
    >
      <ProfileSwitcherTarget
        disabled={disabled}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          onOpenChange(nextOpen);
        }}
        onSelectProfile={(id) => {
          onSelectProfile(id);
          if (selectionOutcome === 'success') {
            setSelectedProfileId(id);
            setOpen(false);
            onOpenChange(false);
          }
        }}
        open={open}
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        surface={surface}
      />
    </View>
  );
}

const meta = {
  args: {
    disabled: false,
    open: false,
    onOpenChange: fn(),
    onSelectProfile: fn(),
    profiles: profiles.slice(0, 3),
    selectionOutcome: 'success',
    selectedProfileId: 'profile-kosmo',
    surface: 'full',
  },
  argTypes: {
    disabled: { control: 'boolean' },
    open: { control: 'boolean' },
    onOpenChange: { action: 'open', control: false, table: { disable: true } },
    onSelectProfile: { action: 'selectProfile', control: false, table: { disable: true } },
    profiles: { control: 'object' },
    selectionOutcome: { control: false, table: { disable: true } },
    selectedProfileId: { control: 'text' },
    surface: { control: 'inline-radio', options: ['full', 'compact', 'drawer'] },
  },
  component: ProfileSwitcherFixture,
  excludeStories: [
    'CompactClosedUnreadContract',
    'DrawerClosedUnreadContract',
    'InteractionContract',
    'OpenUnreadContract',
    'OutsideDismissContract',
    'ProfileSwitcherFixture',
    'SelectionFailureContract',
    'WideClosedUnreadContract',
    'EscapeDismissContract',
    'LongListContract',
  ],
  parameters: { layout: 'centered' },
  render: () => {
    const [args, updateArgs] = useArgs<ProfileSwitcherFixtureProps>();
    return (
      <ProfileSwitcherFixture
        {...args}
        onOpenChange={(nextOpen) => {
          updateArgs({ open: nextOpen });
          args.onOpenChange(nextOpen);
        }}
        onSelectProfile={(id) => {
          args.onSelectProfile(id);
          if (args.selectionOutcome === 'success') {
            updateArgs({ selectedProfileId: id });
          }
        }}
      />
    );
  },
  title: 'KOSMO/Patterns/Profile Switcher',
} satisfies Meta<typeof ProfileSwitcherFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: [
        'surface',
        'profiles',
        'selectedProfileId',
        'open',
        'disabled',
      ],
    },
  },
};

export const Compact: Story = { args: { surface: 'compact' } };
export const Drawer: Story = { args: { surface: 'drawer' } };
export const OpenUnreadCounts: Story = { args: { open: true } };
export const Empty: Story = {
  args: { open: true, profiles: [], selectedProfileId: '' },
};
export const LongContent: Story = {
  args: {
    open: true,
    profiles: profiles.slice(0, 3).map((profile) => ({
      ...profile,
      unreadNotificationCount: profile.id === 'profile-long' ? 0 : 10,
    })),
    selectedProfileId: 'profile-long',
  },
};
export const LongList: Story = { args: { open: true, profiles } };
export const Disabled: Story = { args: { disabled: true } };

export const InteractionContract: Story = {
  args: {
    open: false,
    profiles: profiles.slice(0, 2).map((profile) => ({
      ...profile,
      unreadNotificationCount: profile.id === 'profile-kosmo' ? 0 : 9,
    })),
  },
  play: async ({ args, canvasElement }) => {
    args.onOpenChange.mockClear();
    args.onSelectProfile.mockClear();
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', {
      name: '프로필 목록, 읽지 않은 알림 있음',
    });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    expect(args.onOpenChange).toHaveBeenLastCalledWith(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const group = canvas.getByRole('group', { name: '프로필 전환' });
    const selected = within(group).getByRole('button', {
      name: '코스모 작가, @kosmo',
    });
    const remote = within(group).getByRole('button', {
      name: '먼 우주의 사용자, @remote, 읽지 않은 알림 있음',
    });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(within(remote).getByTestId('profile-switcher-unread-count')).toHaveTextContent('9');

    await userEvent.tab();
    expect(selected).toHaveFocus();
    await userEvent.tab();
    expect(remote).toHaveFocus();
    expect(args.onSelectProfile).not.toHaveBeenCalled();

    await userEvent.keyboard('{Enter}');
    expect(args.onSelectProfile).toHaveBeenLastCalledWith('profile-remote');
    expect(args.onOpenChange).toHaveBeenLastCalledWith(false);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  },
};

export const SelectionFailureContract: Story = {
  args: { open: true, profiles: profiles.slice(0, 2), selectionOutcome: 'failure' },
  play: async ({ args, canvasElement }) => {
    args.onOpenChange.mockClear();
    args.onSelectProfile.mockClear();
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '프로필 목록' });
    const group = canvas.getByRole('group', { name: '프로필 전환' });
    const remote = within(group).getByRole('button', {
      name: '먼 우주의 사용자, @remote, 읽지 않은 알림 있음',
    });

    await userEvent.click(remote);

    expect(args.onSelectProfile).toHaveBeenCalledWith('profile-remote');
    expect(args.onOpenChange).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(group).toBeInTheDocument();
  },
};

export const EscapeDismissContract: Story = {
  args: { open: true },
  play: async ({ args, canvasElement }) => {
    args.onOpenChange.mockClear();
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '프로필 목록' });

    await userEvent.keyboard('{Escape}');

    expect(args.onOpenChange).toHaveBeenCalledWith(false);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  },
};

export const OutsideDismissContract: Story = {
  args: { open: true },
  play: async ({ args, canvasElement }) => {
    args.onOpenChange.mockClear();
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '프로필 목록' });

    await userEvent.click(canvasElement);

    expect(args.onOpenChange).toHaveBeenCalledWith(false);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  },
};

export const LongListContract: Story = {
  args: { open: true, profiles },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('group', { name: '프로필 전환' });
    const lastProfile = within(group).getByRole('button', {
      name: '추가 프로필 8, @profile-8, 읽지 않은 알림 있음',
    });

    expect(group.scrollHeight).toBeGreaterThan(group.clientHeight);
    expect(group.clientHeight).toBeLessThanOrEqual(430);

    lastProfile.focus();

    const groupBounds = group.getBoundingClientRect();
    const lastProfileBounds = lastProfile.getBoundingClientRect();
    expect(lastProfile).toHaveFocus();
    expect(lastProfileBounds.bottom).toBeLessThanOrEqual(groupBounds.bottom);
  },
};

export const WideClosedUnreadContract: Story = {
  args: { open: false, surface: 'full' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', {
      name: '프로필 목록, 읽지 않은 알림 있음',
    });
    const indicator = canvas.getByTestId('profile-switcher-closed-unread');
    const chevron = trigger.querySelector('svg');
    expect(chevron).not.toBeNull();
    const triggerBounds = trigger.getBoundingClientRect();
    const chevronBounds = chevron!.getBoundingClientRect();
    const bounds = indicator.getBoundingClientRect();

    expect(bounds.width).toBe(8);
    expect(bounds.height).toBe(8);
    expect(chevronBounds.width).toBe(20);
    expect(chevronBounds.height).toBe(20);
    expect(bounds.left).toBe(chevronBounds.right + 1);
    expect(bounds.top).toBe(chevronBounds.top - 4);
    expect(bounds.left).toBeGreaterThan(triggerBounds.right);
    expect(indicator).toHaveAttribute('aria-hidden', 'true');
  },
};

export const DrawerClosedUnreadContract: Story = {
  args: { open: false, surface: 'drawer' },
  play: WideClosedUnreadContract.play,
};

export const CompactClosedUnreadContract: Story = {
  args: { open: false, surface: 'compact' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const avatar = canvas.getByLabelText('코스모 작가 프로필 이미지');
    const indicator = canvas.getByTestId('profile-switcher-closed-unread');
    const avatarBounds = avatar.getBoundingClientRect();
    const bounds = indicator.getBoundingClientRect();

    expect(bounds.width).toBe(12);
    expect(bounds.height).toBe(12);
    expect(bounds.left).toBe(avatarBounds.left + 28);
    expect(bounds.top).toBe(avatarBounds.top);
    expect(getComputedStyle(indicator).borderTopWidth).toBe('1px');
    expect(getComputedStyle(indicator).borderTopColor).toBe('rgb(255, 255, 255)');
  },
};

export const OpenUnreadContract: Story = {
  args: { open: true, profiles: profiles.slice(0, 2) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('group', { name: '프로필 전환' });
    const selected = within(group).getByRole('button', {
      name: '코스모 작가, @kosmo',
    });
    const remote = within(group).getByRole('button', {
      name: '먼 우주의 사용자, @remote, 읽지 않은 알림 있음',
    });
    const badge = within(remote).getByTestId('profile-switcher-unread-count');
    const bounds = badge.getBoundingClientRect();

    expect(within(selected).queryByTestId('profile-switcher-unread-count')).not.toBeInTheDocument();
    expect(badge).toHaveTextContent('9+');
    expect(bounds.width).toBe(24);
    expect(bounds.height).toBe(24);
    expect(canvas.queryByTestId('profile-switcher-closed-unread')).not.toBeInTheDocument();
  },
};
