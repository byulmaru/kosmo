import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { BlockedProfileList } from '@/components/profile/BlockedProfileList';
import { ProfileListItemContent } from '@/components/profile/ProfileListItemContent';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyles } from '@/theme/tokens';
import appleTouchIconUrl from '../../../public/apple-touch-icon.png?url';
import type { Meta, StoryObj } from '@storybook/react-vite';

const profiles = [
  { id: 'kosmo', displayName: '코스모 작가', avatarUri: appleTouchIconUrl },
  { id: 'galaxy', displayName: '은하 관측자', avatarUri: appleTouchIconUrl },
];
type Props = {
  state: 'loaded' | 'loading' | 'error' | 'empty' | 'loadingMore' | 'loadMoreError';
  displayName: string;
  onSelectAction: (profileId: string) => void;
  onRetry: () => void;
  onLoadMore: () => void;
};

function Fixture({ state, displayName, onSelectAction, onRetry, onLoadMore }: Props) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [state]);
  const theme = useTheme();
  const visibleState = loaded ? 'loaded' : state;
  const retry = () => {
    onRetry();
    setLoaded(true);
  };
  return (
    <View style={{ width: '100%', maxWidth: 640 }}>
      <BlockedProfileList
        state={
          visibleState === 'loading' || visibleState === 'empty'
            ? { status: visibleState }
            : visibleState === 'error'
              ? { status: 'error', onRetry: retry }
              : {
                  status: 'loaded',
                  children: profiles.map((profile, index) => {
                    const name = index === 0 ? displayName : profile.displayName;
                    return (
                      <ProfileListItemContent
                        key={profile.id}
                        avatarLabel={name}
                        avatarUri={profile.avatarUri}
                        displayName={name}
                        identity={
                          <Text
                            numberOfLines={1}
                            style={[textStyles.uiLabelL, { color: theme.foregroundPrimary }]}
                          >
                            {name}
                          </Text>
                        }
                        style={{ height: 64, paddingVertical: 0 }}
                      >
                        {/* Presentation event only; no fake mutation or relationship update. */}
                        <Button
                          accessibilityLabel={`${name} 차단 해제`}
                          onPress={() => onSelectAction(profile.id)}
                          style={{
                            width: 96,
                            minWidth: 96,
                            paddingHorizontal: 0,
                          }}
                          tone="secondary"
                        >
                          차단 해제
                        </Button>
                      </ProfileListItemContent>
                    );
                  }),
                  pagination: loaded
                    ? { status: 'end' }
                    : visibleState === 'loadingMore'
                      ? { status: 'loading' }
                      : visibleState === 'loadMoreError'
                        ? { status: 'error', onRetry: retry }
                        : {
                            status: 'more',
                            onLoadMore: () => {
                              onLoadMore();
                              setLoaded(true);
                            },
                          },
                }
        }
      />
    </View>
  );
}

const meta = {
  args: {
    state: 'loaded',
    displayName: '코스모 작가',
    onSelectAction: fn<(profileId: string) => void>(),
    onRetry: fn(),
    onLoadMore: fn(),
  },
  argTypes: {
    state: {
      control: 'select',
      options: ['loaded', 'loading', 'error', 'empty', 'loadingMore', 'loadMoreError'],
    },
    displayName: { control: 'text' },
  },
  component: Fixture,
  parameters: {
    controls: { include: ['state', 'displayName'] },
    docs: {
      description: {
        component:
          '목록·행·버튼 presentation입니다. 버튼 선택은 Actions에 기록하며 차단 해제 요청이나 성공 상태 전환을 구현하지 않습니다.',
      },
    },
  },
  title: 'KOSMO/Patterns/Profile/Blocked Profiles',
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
export const Loading: Story = { args: { state: 'loading' } };
export const Empty: Story = { args: { state: 'empty' } };
export const Error: Story = { args: { state: 'error' } };
export const LoadingMore: Story = { args: { state: 'loadingMore' } };
export const LoadMoreError: Story = { args: { state: 'loadMoreError' } };
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
