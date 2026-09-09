import { Ban, Link } from 'lucide-react-native';
import { View } from 'react-native';
import { fn } from 'storybook/test';
import { ProfileMoreMenu } from '@/components/profile/ProfileMoreMenu';
import type { Meta, StoryObj } from '@storybook/react-vite';

type Props = { blocked: boolean; onSelect: () => void; onCopy: () => void };
function Fixture({ blocked, onSelect, onCopy }: Props) {
  return (
    <View style={{ padding: 32, alignItems: 'flex-start' }}>
      <ProfileMoreMenu
        items={[
          { key: 'copy', label: '프로필 링크 복사', icon: Link, onSelect: onCopy },
          {
            key: 'block',
            label: blocked ? '차단 해제' : '차단',
            icon: Ban,
            tone: blocked ? 'default' : 'danger',
            onSelect,
          },
        ]}
      />
    </View>
  );
}
const meta = {
  component: Fixture,
  title: 'KOSMO/Patterns/Profile/More Menu',
  args: { blocked: false, onSelect: fn(), onCopy: fn() },
  argTypes: { blocked: { control: 'boolean' } },
  parameters: {
    controls: { include: ['blocked'] },
    docs: {
      description: {
        component:
          '메뉴 표시·선택·focus 검증입니다. 선택은 Actions에 기록하며 mutation을 실행하거나 성공을 흉내 내지 않습니다.',
      },
    },
  },
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
