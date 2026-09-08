import { useState } from 'react';
import { View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import itemMeta, { NotificationExample } from '../patterns/NotificationListItem.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

function NotificationsPresentation({ onNavigate }: { onNavigate: ReturnType<typeof fn> }) {
  const theme = useTheme();
  const [allRead, setAllRead] = useState(false);

  return (
    <View
      style={{
        alignSelf: 'center',
        width: '100%',
        maxWidth: 600,
        minHeight: '100%',
        borderColor: theme.borderSubtle,
        borderLeftWidth: 1,
        borderRightWidth: 1,
      }}
    >
      <PageHeader
        title="알림"
        trailing={
          <Button disabled={allRead} onPress={() => setAllRead(true)} tone="secondary">
            모두 읽음
          </Button>
        }
      />
      {(['reaction', 'follow', 'reply', 'repost', 'followRequest'] as const).map((kind, index) => (
        <NotificationExample
          key={kind}
          {...itemMeta.args}
          kind={kind}
          grouped={kind === 'reaction' || kind === 'repost'}
          hasMedia={kind === 'repost'}
          name={index % 2 === 0 ? '별빛 여행자' : '은하 관측자'}
          timestamp={index < 2 ? '5분 전' : '1시간 전'}
          unread={!allRead && index < 2}
          onNavigate={onNavigate}
        />
      ))}
    </View>
  );
}

const meta = {
  title: 'KOSMO/Screens/Notifications/Presentation',
  component: NotificationsPresentation,
  args: { onNavigate: fn() },
  parameters: {
    layout: 'fullscreen',
    relay: itemMeta.parameters.relay,
    router: { pathname: '/notifications' },
    docs: {
      description: {
        component:
          'PROD-884 표시 컴포넌트를 실제 앱의 최대 600px 콘텐츠 열에 조립한 수동 검토 화면입니다. 모두 읽음은 로컬 표시 상태만 바꾸며 실제 읽음 mutation은 PROD-811 범위입니다.',
      },
    },
  },
  excludeStories: ['ReadAllContract'],
} satisfies Meta<typeof NotificationsPresentation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
export const Mobile: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
};

export const ReadAllContract: Story = {
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: '알림' })).toBeVisible();
    await expect(canvas.getAllByRole('link', { name: /읽지 않은 알림/ })).toHaveLength(2);
    await userEvent.click(canvas.getByRole('button', { name: '모두 읽음' }));
    await expect(canvas.queryAllByRole('link', { name: /읽지 않은 알림/ })).toHaveLength(0);
    await expect(canvas.getByRole('button', { name: '모두 읽음' })).toBeDisabled();
    await expect(canvas.getByRole('toolbar', { name: '액션 바' })).toBeVisible();
  },
};
