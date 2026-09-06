import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ProfileMuteAction } from '@/components/profile/ProfileMuteAction';
import type { Meta, StoryObj } from '@storybook/react-vite';

type Props = {
  displayName: string;
  muted: boolean;
  outcome: 'success' | 'error' | 'pending';
  onMute: () => Promise<void>;
  onUnmute: () => Promise<void>;
  onFeedback: (feedback: { muted: boolean; status: 'success' | 'error' }) => void;
  changeProfileOnRequest?: boolean;
  profileId?: string;
  removeOnSuccess?: boolean;
};

function Fixture({
  muted: initialMuted,
  outcome,
  onMute,
  onUnmute,
  changeProfileOnRequest = false,
  profileId: initialProfileId = 'profile-kosmo',
  removeOnSuccess = false,
  ...props
}: Props) {
  const [muted, setMuted] = useState(initialMuted);
  const [profileId, setProfileId] = useState(initialProfileId);
  const [requestComplete, setRequestComplete] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => setMuted(initialMuted), [initialMuted]);
  useEffect(() => setProfileId(initialProfileId), [initialProfileId]);
  return visible ? (
    <View style={{ padding: 24 }}>
      <ProfileMuteAction
        {...props}
        muted={muted}
        onChangeMuted={async (nextMuted) => {
          await (nextMuted ? onMute() : onUnmute());
          if (outcome === 'pending') {
            await new Promise<void>(() => {});
          }
          if (outcome === 'error') {
            if (changeProfileOnRequest) {
              setProfileId('profile-next');
              await new Promise<void>((resolve) => setTimeout(resolve, 0));
            }
            setRequestComplete(true);
            throw new Error('요청 실패');
          }
          if (changeProfileOnRequest) {
            setProfileId('profile-next');
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
          }
          if (removeOnSuccess) {
            setVisible(false);
          } else {
            setMuted(nextMuted);
          }
          setRequestComplete(true);
        }}
        profileId={profileId}
      />
      {changeProfileOnRequest && requestComplete ? (
        <Text testID="profile-mute-request-complete">요청 완료</Text>
      ) : null}
    </View>
  ) : null;
}

const meta = {
  args: {
    displayName: '코스모 작가',
    muted: false,
    outcome: 'success',
    changeProfileOnRequest: false,
    profileId: 'profile-kosmo',
    removeOnSuccess: false,
    onMute: fn<() => Promise<void>>().mockResolvedValue(undefined),
    onUnmute: fn<() => Promise<void>>().mockResolvedValue(undefined),
    onFeedback: fn(),
  },
  argTypes: {
    displayName: { control: 'text' },
    muted: { control: 'boolean' },
    outcome: {
      control: 'inline-radio',
      options: ['success', 'error', 'pending'],
      description: '완료 callback의 결과 시나리오. 실제 요청은 PROD-814가 연결합니다.',
    },
  },
  component: Fixture,
  excludeStories: [
    'MuteContract',
    'FailureContract',
    'PendingContract',
    'DiscardErrorOnTargetChangeContract',
    'DiscardSuccessOnTargetChangeContract',
    'UnmountOnSuccessContract',
    'UnmuteContract',
  ],
  parameters: { controls: { include: ['displayName', 'muted', 'outcome'] } },
  title: 'KOSMO/Patterns/Profile/Mute Action',
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const Muted: Story = { args: { muted: true } };
export const LongIdentity: Story = {
  args: { displayName: '아주 긴 표시 이름을 사용하는 코스모의 은하 관측자' },
};

export const MuteContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onMute.mockClear();
    args.onUnmute.mockClear();
    args.onFeedback.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '프로필 뮤트 메뉴' });
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '뮤트' }));
    expect(
      await body.findByText(
        '홈과 로컬 타임라인에서 이 프로필의 게시물이 숨겨지고 팔로우 관계는 유지돼요.',
      ),
    ).toBeVisible();
    const cancel = await body.findByRole('button', { name: '취소' });
    await waitFor(() => expect(cancel).toHaveFocus());
    await userEvent.click(cancel);
    expect(args.onMute).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '뮤트' }));
    await userEvent.click(await body.findByRole('button', { name: '뮤트' }));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({ muted: true, status: 'success' }),
    );
    expect(args.onMute).toHaveBeenCalledTimes(1);
    expect(await body.findByText(`${args.displayName} 님이 뮤트되었어요`)).toBeVisible();
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    expect(await body.findByRole('menuitem', { name: '뮤트 해제' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
  },
};
export const FailureContract: Story = {
  args: { outcome: 'error' },
  play: async ({ args, canvasElement }) => {
    args.onMute.mockClear();
    args.onFeedback.mockClear();
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: '프로필 뮤트 메뉴' }));
    await userEvent.click(await body.findByRole('menuitem', { name: '뮤트' }));
    await userEvent.click(await body.findByRole('button', { name: '뮤트' }));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({ muted: true, status: 'error' }),
    );
    expect(await body.findByText('뮤트하지 못했어요. 다시 시도해 주세요.')).toBeVisible();
    await waitFor(() => expect(body.getByRole('button', { name: '취소' })).toHaveFocus());
    const retry = body.getByRole('button', { name: '뮤트' });
    await userEvent.click(retry);
    await waitFor(() => expect(args.onMute).toHaveBeenCalledTimes(2));
    await userEvent.click(body.getByRole('button', { name: '취소' }));
  },
};
export const PendingContract: Story = {
  args: { outcome: 'pending' },
  play: async ({ args, canvasElement }) => {
    args.onMute.mockClear();
    args.onFeedback.mockClear();
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: '프로필 뮤트 메뉴' }));
    await userEvent.click(await body.findByRole('menuitem', { name: '뮤트' }));
    const confirm = await body.findByRole('button', { name: '뮤트' });
    await userEvent.click(confirm);
    await waitFor(() => expect(confirm).toHaveAttribute('aria-busy', 'true'));
    expect(body.getByRole('button', { name: '취소' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    expect(confirm).toBeVisible();
    expect(args.onMute).toHaveBeenCalledTimes(1);
    expect(args.onFeedback).not.toHaveBeenCalled();
  },
};
export const UnmuteContract: Story = {
  args: { muted: true },
  play: async ({ args, canvasElement }) => {
    args.onUnmute.mockClear();
    args.onFeedback.mockClear();
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: '프로필 뮤트 메뉴' }));
    await userEvent.click(await body.findByRole('menuitem', { name: '뮤트 해제' }));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({ muted: false, status: 'success' }),
    );
    expect(args.onUnmute).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(within(canvasElement).getByRole('button', { name: '프로필 뮤트 메뉴' })).toHaveFocus(),
    );
    expect(body.queryByText('이 프로필을 뮤트할까요?')).not.toBeInTheDocument();
  },
};

export const UnmountOnSuccessContract: Story = {
  args: { muted: true, removeOnSuccess: true },
  play: async ({ args, canvasElement }) => {
    args.onUnmute.mockClear();
    args.onFeedback.mockClear();
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: '프로필 뮤트 메뉴' }));
    await userEvent.click(await body.findByRole('menuitem', { name: '뮤트 해제' }));
    await waitFor(() => expect(args.onUnmute).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({ muted: false, status: 'success' }),
    );
    expect(await body.findByText(`${args.displayName} 님이 뮤트 해제되었어요`)).toBeVisible();
  },
};

export const DiscardSuccessOnTargetChangeContract: Story = {
  args: { changeProfileOnRequest: true },
  play: async ({ args, canvasElement }) => {
    args.onMute.mockClear();
    args.onFeedback.mockClear();
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: '프로필 뮤트 메뉴' }));
    await userEvent.click(await body.findByRole('menuitem', { name: '뮤트' }));
    await userEvent.click(await body.findByRole('button', { name: '뮤트' }));
    await waitFor(() => expect(args.onMute).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(within(canvasElement).getByTestId('profile-mute-request-complete')).toBeVisible(),
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await waitFor(() =>
      expect(body.queryByText(`${args.displayName} 님이 뮤트되었어요`)).not.toBeInTheDocument(),
    );
    expect(args.onFeedback).not.toHaveBeenCalled();
  },
};

export const DiscardErrorOnTargetChangeContract: Story = {
  args: { changeProfileOnRequest: true, outcome: 'error' },
  play: async ({ args, canvasElement }) => {
    args.onMute.mockClear();
    args.onFeedback.mockClear();
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: '프로필 뮤트 메뉴' }));
    await userEvent.click(await body.findByRole('menuitem', { name: '뮤트' }));
    await userEvent.click(await body.findByRole('button', { name: '뮤트' }));
    await waitFor(() => expect(args.onMute).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(within(canvasElement).getByTestId('profile-mute-request-complete')).toBeVisible(),
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await waitFor(() =>
      expect(body.queryByText('뮤트하지 못했어요. 다시 시도해 주세요.')).not.toBeInTheDocument(),
    );
    expect(args.onFeedback).not.toHaveBeenCalled();
  },
};
