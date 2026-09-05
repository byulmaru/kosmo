import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useArgs } from 'storybook/preview-api';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ProfileBlockAction } from '@/components/profile/ProfileBlockAction';
import { Button } from '@/components/ui/Button';
import type { Meta, StoryObj } from '@storybook/react-vite';

type Props = {
  blocked: boolean;
  displayName: string;
  onBlock: () => Promise<void>;
  onDismiss: () => void;
  onFeedback: (feedback: { blocked: boolean; status: 'success' | 'error' }) => void;
  onUnblock: () => Promise<void>;
  outcome: 'success' | 'error' | 'pending';
};

function Fixture({
  blocked: initialBlocked,
  displayName,
  onBlock,
  onDismiss,
  onFeedback,
  onUnblock,
  outcome,
}: Props) {
  const [blocked, setBlocked] = useState(initialBlocked);
  useEffect(() => setBlocked(initialBlocked), [initialBlocked]);

  return (
    <View style={{ padding: 24 }}>
      <ProfileBlockAction
        blocked={blocked}
        displayName={displayName}
        onChangeBlocked={async (nextBlocked) => {
          await (nextBlocked ? onBlock() : onUnblock());
          if (outcome === 'pending') {
            await new Promise<void>(() => {});
          }
          if (outcome === 'error') {
            throw new globalThis.Error('요청 실패');
          }
        }}
        onDismiss={onDismiss}
        onFeedback={(feedback) => {
          onFeedback(feedback);
          if (feedback.status === 'success') {
            setBlocked(feedback.blocked);
          }
        }}
        profileId="profile-kosmo"
      />
    </View>
  );
}

function StoryRender(args: Props) {
  const [, updateArgs] = useArgs();

  return (
    <Fixture
      {...args}
      onFeedback={(feedback) => {
        args.onFeedback(feedback);
        if (feedback.status === 'success') {
          updateArgs({ blocked: feedback.blocked });
        }
      }}
    />
  );
}

function LateCompletionFixture({ onBlock, onFeedback }: Pick<Props, 'onBlock' | 'onFeedback'>) {
  const [profileId, setProfileId] = useState('profile-a');
  const staleCompletion = useRef<(() => void) | null>(null);

  return (
    <View style={{ gap: 12, padding: 24 }}>
      <Text>{profileId === 'profile-a' ? '첫 번째 프로필' : '두 번째 프로필'}</Text>
      <ProfileBlockAction
        blocked={false}
        displayName={profileId === 'profile-a' ? '첫 번째 프로필' : '두 번째 프로필'}
        onChangeBlocked={async () => {
          await onBlock();
          if (profileId === 'profile-a') {
            const completion = new Promise<void>((resolve) => {
              staleCompletion.current = resolve;
            });
            setProfileId('profile-b');
            await completion;
          }
        }}
        onFeedback={onFeedback}
        profileId={profileId}
      />
      <Button onPress={() => staleCompletion.current?.()} tone="secondary">
        이전 요청 완료
      </Button>
    </View>
  );
}

const meta = {
  args: {
    blocked: false,
    displayName: '코스모 작가',
    onBlock: fn<() => Promise<void>>().mockResolvedValue(undefined),
    onDismiss: fn(),
    onFeedback: fn(),
    onUnblock: fn<() => Promise<void>>().mockResolvedValue(undefined),
    outcome: 'success',
  },
  argTypes: {
    blocked: { control: 'boolean' },
    displayName: { control: 'text' },
    outcome: {
      control: 'inline-radio',
      description: '확인 후 요청 callback의 결과 시나리오를 보여줍니다.',
      options: ['success', 'error', 'pending'],
    },
  },
  component: Fixture,
  excludeStories: [
    'BlockContract',
    'FailureContract',
    'LateCompletionIgnoredAfterProfileChange',
    'PendingContract',
    'UnblockContract',
  ],
  parameters: { controls: { include: ['displayName', 'blocked', 'outcome'] } },
  title: 'KOSMO/Patterns/Profile/Block Action',
} satisfies Meta<typeof Fixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = { render: StoryRender };
export const Blocked: Story = { args: { blocked: true } };
export const LongIdentity: Story = {
  args: { displayName: '아주 긴 표시 이름을 사용하는 코스모의 은하 관측자' },
};
export const Mobile: Story = {
  globals: { viewport: { value: 'kosmoMobile', isRotated: false } },
  parameters: { layout: 'fullscreen' },
};
export const Compact: Story = {
  globals: { viewport: { value: 'kosmoProfileCompact', isRotated: false } },
  parameters: { layout: 'fullscreen' },
};
export const Full: Story = {
  globals: { viewport: { value: 'kosmoProfileFull', isRotated: false } },
  parameters: { layout: 'fullscreen' },
};

export const BlockContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onBlock.mockClear();
    args.onDismiss.mockClear();
    args.onFeedback.mockClear();
    args.onUnblock.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '프로필 차단 메뉴' });
    const title = '이 프로필을 차단할까요?';

    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '차단' }));
    const cancel = await body.findByRole('button', { name: '취소' });
    await waitFor(() => expect(cancel).toHaveFocus());
    expect(args.onBlock).not.toHaveBeenCalled();
    await userEvent.click(cancel);
    expect(args.onBlock).not.toHaveBeenCalled();
    await waitFor(() => expect(args.onDismiss).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(trigger).toHaveFocus());

    args.onDismiss.mockClear();
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '차단' }));
    await waitFor(() => expect(body.getByRole('button', { name: '취소' })).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByText(title)).not.toBeInTheDocument());
    expect(args.onBlock).not.toHaveBeenCalled();
    await waitFor(() => expect(args.onDismiss).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(trigger).toHaveFocus());

    args.onDismiss.mockClear();
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '차단' }));
    await userEvent.click(await body.findByRole('button', { name: '차단' }));
    await waitFor(() => expect(args.onBlock).toHaveBeenCalledWith());
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({ blocked: true, status: 'success' }),
    );
    expect(args.onDismiss).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    expect(await body.findByRole('menuitem', { name: '차단 해제' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
  },
};

export const LateCompletionIgnoredAfterProfileChange: Story = {
  play: async ({ args, canvasElement }) => {
    args.onBlock.mockClear();
    args.onDismiss.mockClear();
    args.onFeedback.mockClear();
    args.onUnblock.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole('button', { name: '프로필 차단 메뉴' }));
    await userEvent.click(await body.findByRole('menuitem', { name: '차단' }));
    await userEvent.click(await body.findByRole('button', { name: '차단' }));
    await waitFor(() => expect(args.onBlock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(canvas.getByText('두 번째 프로필')).toBeVisible());
    await userEvent.click(canvas.getByRole('button', { name: '이전 요청 완료' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(args.onFeedback).not.toHaveBeenCalled();
    expect(body.queryByText('첫 번째 프로필 님이 차단되었어요')).not.toBeInTheDocument();
    expect(body.queryByText('두 번째 프로필 님이 차단되었어요')).not.toBeInTheDocument();
  },
  render: (args) => <LateCompletionFixture onBlock={args.onBlock} onFeedback={args.onFeedback} />,
};

export const UnblockContract: Story = {
  args: { blocked: true },
  play: async ({ args, canvasElement }) => {
    args.onBlock.mockClear();
    args.onDismiss.mockClear();
    args.onFeedback.mockClear();
    args.onUnblock.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '프로필 차단 메뉴' });
    const title = '이 프로필의 차단을 해제할까요?';

    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '차단 해제' }));
    expect(await body.findByText(title)).toBeVisible();
    expect(args.onUnblock).not.toHaveBeenCalled();
    await userEvent.click(await body.findByRole('button', { name: '취소' }));
    await waitFor(() => expect(args.onDismiss).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(args.onUnblock).not.toHaveBeenCalled();

    args.onDismiss.mockClear();
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '차단 해제' }));
    await waitFor(() => expect(body.getByRole('button', { name: '취소' })).toHaveFocus());
    await userEvent.click(await body.findByRole('button', { name: '차단 해제' }));
    await waitFor(() => expect(args.onUnblock).toHaveBeenCalledWith());
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({ blocked: false, status: 'success' }),
    );
    expect(args.onDismiss).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    expect(await body.findByRole('menuitem', { name: '차단' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
  },
};

export const FailureContract: Story = {
  args: { outcome: 'error' },
  play: async ({ args, canvasElement }) => {
    args.onBlock.mockClear();
    args.onDismiss.mockClear();
    args.onFeedback.mockClear();
    args.onUnblock.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '프로필 차단 메뉴' });

    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '차단' }));
    await userEvent.click(await body.findByRole('button', { name: '차단' }));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({ blocked: true, status: 'error' }),
    );
    expect(await body.findByText('차단하지 못했어요. 다시 시도해 주세요.')).toBeVisible();
    expect(body.getByText('이 프로필을 차단할까요?')).toBeVisible();
    await waitFor(() => expect(body.getByRole('button', { name: '취소' })).toHaveFocus());

    await userEvent.click(body.getByRole('button', { name: '차단' }));
    await waitFor(() => expect(args.onBlock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(args.onFeedback).toHaveBeenCalledTimes(2));
    await userEvent.click(body.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(args.onDismiss).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const PendingContract: Story = {
  args: { outcome: 'pending' },
  play: async ({ args, canvasElement }) => {
    args.onBlock.mockClear();
    args.onDismiss.mockClear();
    args.onFeedback.mockClear();
    args.onUnblock.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '프로필 차단 메뉴' });

    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '차단' }));
    const confirm = await body.findByRole('button', { name: '차단' });
    await userEvent.click(confirm);
    await waitFor(() => expect(confirm).toHaveAttribute('aria-busy', 'true'));
    expect(body.getByRole('button', { name: '취소' })).toHaveAttribute('aria-disabled', 'true');
    expect(body.getByRole('button', { name: '닫기' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    expect(confirm).toBeVisible();
    expect(args.onBlock).toHaveBeenCalledTimes(1);
    expect(args.onUnblock).not.toHaveBeenCalled();
    expect(args.onFeedback).not.toHaveBeenCalled();
    expect(args.onDismiss).not.toHaveBeenCalled();
  },
};
