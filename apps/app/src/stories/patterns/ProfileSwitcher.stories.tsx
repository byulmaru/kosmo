import { useEffect, useState } from 'react';
import { View } from 'react-native';
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
  },
  {
    avatar: null,
    displayName: '먼 우주의 사용자',
    id: 'profile-remote',
    relativeHandle: '@remote',
  },
  {
    avatar: null,
    displayName: '아주 긴 이름을 가진 세 번째 프로필',
    id: 'profile-long',
    relativeHandle: '@a-very-long-profile-handle',
  },
];

type ProfileSwitcherFixtureProps = Readonly<{
  disabled: boolean;
  initialOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectProfile: (id: string) => void;
  otherUnreadCount: number;
  profileCount: number;
  selectedProfileId: string;
  selectedUnreadCount: number;
  surface: ProfilePickerSurface;
}>;

export function ProfileSwitcherFixture({
  disabled,
  initialOpen,
  onOpenChange,
  onSelectProfile,
  otherUnreadCount,
  profileCount,
  selectedProfileId: initialSelectedProfileId,
  selectedUnreadCount,
  surface,
}: ProfileSwitcherFixtureProps) {
  const availableProfiles = profiles.slice(0, profileCount);
  const fallbackProfileId = availableProfiles[0]?.id ?? null;
  const [open, setOpen] = useState(initialOpen);
  const [selectedProfileId, setSelectedProfileId] = useState(
    availableProfiles.some((profile) => profile.id === initialSelectedProfileId)
      ? initialSelectedProfileId
      : fallbackProfileId,
  );
  const visibleProfiles = availableProfiles.map((profile) => ({
    ...profile,
    unreadNotificationCount:
      profile.id === selectedProfileId ? selectedUnreadCount : otherUnreadCount,
  }));

  useEffect(() => {
    setSelectedProfileId(
      availableProfiles.some((profile) => profile.id === initialSelectedProfileId)
        ? initialSelectedProfileId
        : fallbackProfileId,
    );
  }, [fallbackProfileId, initialSelectedProfileId, profileCount]);

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
          setSelectedProfileId(id);
          onSelectProfile(id);
        }}
        open={open}
        profiles={visibleProfiles}
        selectedProfileId={selectedProfileId}
        surface={surface}
      />
    </View>
  );
}

const meta = {
  args: {
    disabled: false,
    initialOpen: false,
    onOpenChange: fn(),
    onSelectProfile: fn(),
    otherUnreadCount: 10,
    profileCount: 3,
    selectedProfileId: 'profile-kosmo',
    selectedUnreadCount: 1,
    surface: 'full',
  },
  argTypes: {
    disabled: { control: 'boolean' },
    initialOpen: { control: false },
    onOpenChange: { action: 'open', control: false },
    onSelectProfile: { action: 'selectProfile', control: false },
    otherUnreadCount: { control: 'select', options: [0, 1, 9, 10] },
    profileCount: { control: { max: 3, min: 0, step: 1, type: 'range' } },
    selectedProfileId: {
      control: 'select',
      options: profiles.map((profile) => profile.id),
    },
    selectedUnreadCount: { control: 'select', options: [0, 1, 9, 10] },
    surface: { control: 'inline-radio', options: ['full', 'compact', 'drawer'] },
  },
  component: ProfileSwitcherFixture,
  excludeStories: [
    'CompactClosedUnreadContract',
    'InteractionContract',
    'OpenUnreadContract',
    'ProfileSwitcherFixture',
    'WideClosedUnreadContract',
  ],
  parameters: { layout: 'centered' },
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
        'selectedProfileId',
        'profileCount',
        'selectedUnreadCount',
        'otherUnreadCount',
        'disabled',
      ],
    },
  },
};

export const Compact: Story = { args: { surface: 'compact' } };
export const Drawer: Story = { args: { surface: 'drawer' } };
export const OpenUnreadCounts: Story = { args: { initialOpen: true } };
export const Empty: Story = {
  args: { initialOpen: true, profileCount: 0, selectedProfileId: '' },
};
export const LongContent: Story = {
  args: { initialOpen: true, selectedProfileId: 'profile-long' },
};
export const Disabled: Story = { args: { disabled: true } };

export const InteractionContract: Story = {
  args: { initialOpen: false, otherUnreadCount: 9, profileCount: 2 },
  play: async ({ args, canvasElement }) => {
    args.onOpenChange.mockClear();
    args.onSelectProfile.mockClear();
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '프로필 목록' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    expect(args.onOpenChange).toHaveBeenLastCalledWith(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const group = canvas.getByRole('group', { name: '프로필 전환' });
    const selected = within(group).getByRole('button', {
      name: '코스모 작가, @kosmo, 읽지 않은 알림 있음',
    });
    const remote = within(group).getByRole('button', {
      name: '먼 우주의 사용자, @remote, 읽지 않은 알림 있음',
    });
    expect(selected).toHaveAttribute('aria-pressed', 'true');

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

export const WideClosedUnreadContract: Story = {
  args: { initialOpen: false, surface: 'full' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const indicator = canvas.getByTestId('profile-switcher-closed-unread');
    const bounds = indicator.getBoundingClientRect();

    expect(bounds.width).toBe(8);
    expect(bounds.height).toBe(8);
    expect(indicator).toHaveAttribute('aria-hidden', 'true');
  },
};

export const CompactClosedUnreadContract: Story = {
  args: { initialOpen: false, surface: 'compact' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const indicator = canvas.getByTestId('profile-switcher-closed-unread');
    const bounds = indicator.getBoundingClientRect();

    expect(bounds.width).toBe(12);
    expect(bounds.height).toBe(12);
    expect(getComputedStyle(indicator).borderTopWidth).toBe('1px');
  },
};

export const OpenUnreadContract: Story = {
  args: { initialOpen: true, otherUnreadCount: 10, profileCount: 2 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('group', { name: '프로필 전환' });
    const selected = within(group).getByRole('button', {
      name: '코스모 작가, @kosmo, 읽지 않은 알림 있음',
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
