import { useState } from 'react';
import { View } from 'react-native';
import { fn } from 'storybook/test';
import {
  ProfileLifecycleDeactivateContent,
  ProfileLifecycleDeleteConfirmContent,
  ProfileLifecycleReactivateContent,
} from '@/components/profile/ProfileLifecycleContent';
import type { Meta, StoryObj } from '@storybook/react-vite';

type Args = {
  action: 'deactivate' | 'reactivate' | 'delete';
  pending: boolean;
  displayName: string;
  relativeHandle: string;
  onConfirm: () => void;
  onCancel: () => void;
};

function ConfirmationExample(args: Args) {
  const [acknowledged, setAcknowledged] = useState(false);
  const props = {
    profile: {
      id: 'lifecycle-profile',
      displayName: args.displayName,
      relativeHandle: args.relativeHandle,
    },
    pending: args.pending,
    onConfirm: args.onConfirm,
    onCancel: args.onCancel,
    acknowledged: args.pending || acknowledged,
    onAcknowledgementChange: setAcknowledged,
  };
  return (
    <View
      style={{ maxWidth: args.action === 'deactivate' ? 600 : 420, width: '100%', padding: 16 }}
    >
      {args.action === 'deactivate' ? (
        <ProfileLifecycleDeactivateContent {...props} />
      ) : args.action === 'reactivate' ? (
        <ProfileLifecycleReactivateContent {...props} />
      ) : (
        <ProfileLifecycleDeleteConfirmContent {...props} />
      )}
    </View>
  );
}

const meta = {
  args: {
    action: 'deactivate',
    pending: false,
    displayName: '코스모 작가',
    relativeHandle: '@selected',
    onConfirm: fn(),
    onCancel: fn(),
  },
  argTypes: {
    action: { control: 'inline-radio', options: ['deactivate', 'reactivate', 'delete'] },
  },
  component: ConfirmationExample,
  parameters: {
    controls: { include: ['action', 'pending', 'displayName', 'relativeHandle'] },
    layout: 'centered',
    docs: {
      description: {
        component:
          '확인 콘텐츠를 단독 검토합니다. 설정 목록과 전체 화면·팝업 전환은 Screens/Profile Settings에서 검토합니다.',
      },
    },
  },
  render: (args) => <ConfirmationExample key={args.action} {...args} />,
  title: 'KOSMO/Patterns/Profile/Lifecycle',
} satisfies Meta<typeof ConfirmationExample>;

export default meta;
export const Playground: StoryObj<typeof meta> = {};
