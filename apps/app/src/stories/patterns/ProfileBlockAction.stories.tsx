import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useArgs } from 'storybook/preview-api';
import { fn } from 'storybook/test';
import { ProfileBlockAction } from '@/components/profile/ProfileBlockAction';
import type { Meta, StoryObj } from '@storybook/react-vite';

export type Props = {
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
