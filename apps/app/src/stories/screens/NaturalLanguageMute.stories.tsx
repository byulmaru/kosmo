import { ArrowLeft, Check, VolumeX } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import HomeRoute from '@/app/(tabs)/(protected)/home';
import { PageHeader } from '@/components/PageHeader';
import { UniversalShell } from '@/components/shell/UniversalShell';
import { BottomTabBar } from '@/components/ui/BottomTabBar';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import { SessionProvider } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSizes, radius, space, textStyles } from '@/theme/tokens';
import { post, profile, shellQuery, timeline } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';

const sentence = '아직 보지 않은 작품의 결말이나 반전 이야기는 보고 싶지 않아요.';
const membership = { id: 'showcase-membership', role: 'OWNER' as const };
const viewer = profile({
  displayName: '하루',
  handle: 'haru',
  id: 'showcase-viewer',
  relativeHandle: '@haru',
  viewerState: { follow: null, followRequest: null, isSelf: true, membership },
});
const authors = ['달빛', '여울', '모아'].map((displayName, index) =>
  profile({
    displayName,
    handle: ['moon', 'yeoul', 'moa'][index],
    id: `showcase-author-${index}`,
    relativeHandle: `@${['moon', 'yeoul', 'moa'][index]}`,
    viewerState: { follow: null, followRequest: null, isSelf: false, membership: null },
  }),
);
const posts = [
  '〈별의 정원〉 마지막에 정원사가 미래의 주인공이었다는 반전… 첫 장면부터 힌트가 있었네! 🌙',
  '〈별의 정원〉 배경 작화가 정말 예뻐요. 수채화 같은 색감 때문에 한 번 더 보고 싶어요. 🎨',
  '코미버스 갈 준비 끝! 물이랑 보조 배터리 챙겼어요. 부스 구경할 생각에 두근두근 ✨',
].map((bodyText, index) => ({
  ...post({
    bodyText,
    createdAt: '2026-10-19T04:00:00Z',
    id: `showcase-post-${index}`,
    profile: authors[index],
    reactionCounts: [{ count: [8, 12, 5][index], type: '❤️' }],
    visibility: 'PUBLIC',
  }),
  viewerReactions: [],
}));
const shell = shellQuery({ profiles: [viewer], selectedProfile: viewer });
const beforeData = { ...shell, homeTimeline: timeline(...posts) };
// 행사 모의 결과를 기존 CW 표시로 표현한다. 자연어 판정·제품 뮤트 정책은 연결하지 않는다.
const afterData = {
  ...shell,
  homeTimeline: timeline(
    {
      ...posts[0],
      content: {
        ...posts[0].content!,
        contentWarning: '뮤트한 내용 · 작품 결말·반전',
        document: { ...posts[0].content!.document, summary: '뮤트한 내용 · 작품 결말·반전' },
      },
    },
    ...posts.slice(1),
  ),
};

function SettingExample() {
  const theme = useTheme();
  return (
    <View style={{ height: 844 }}>
      <PageHeader
        title="자연어 뮤트"
        leading={
          <IconButton accessibilityLabel="이전 화면">
            <ArrowLeft color={theme.foregroundPrimary} size={iconSizes[24]} />
          </IconButton>
        }
      />
      <View style={styles.form}>
        <Text style={[textStyles.uiHeadingS, { color: theme.foregroundPrimary }]}>
          보고 싶지 않은 내용을 적어주세요
        </Text>
        <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
          단어를 하나씩 고르는 대신, 문장으로 말해보세요.
        </Text>
        <TextField label="뮤트할 내용" multiline value={sentence} style={styles.input} />
        <Button>이 조건으로 뮤트하기</Button>
        <View
          style={[
            styles.condition,
            { backgroundColor: theme.actionPrimarySubtle, borderColor: theme.borderDefault },
          ]}
        >
          <VolumeX aria-hidden color={theme.foregroundPrimary} size={iconSizes[24]} />
          <Text style={[textStyles.uiLabelL, { color: theme.foregroundPrimary }]}>
            이런 글이 가려져요
          </Text>
          <Text style={[textStyles.uiCopyL, { color: theme.foregroundPrimary }]}>
            작품의 결말이나 반전을 직접 알려주는 글
          </Text>
        </View>
        <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
          작화 감상이나 행사·일상 글은 그대로 볼 수 있어요.
        </Text>
      </View>
      <BottomTabBar onNavigate={() => undefined} profile={{ label: viewer.displayName }} />
    </View>
  );
}

function AppliedExample() {
  const theme = useTheme();
  return (
    <>
      <View style={[styles.applied, { backgroundColor: theme.actionPrimarySubtle }]}>
        <Check aria-hidden color={theme.foregroundPrimary} size={iconSizes[20]} />
        <Text style={[textStyles.uiLabelM, { color: theme.foregroundPrimary }]}>
          결말·반전 이야기를 뮤트하고 있어요
        </Text>
      </View>
      <HomeRoute />
    </>
  );
}

const meta = {
  decorators: [
    (Story, context) =>
      context.parameters.showcaseSetting ? (
        <Story />
      ) : (
        <SessionProvider>
          <UniversalShell>
            <Story />
          </UniversalShell>
        </SessionProvider>
      ),
  ],
  globals: { theme: 'light', viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'fullscreen', relay: { data: beforeData }, router: { pathname: '/home' } },
  title: 'KOSMO/Screens/Natural Language Mute Showcase',
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Setting: Story = {
  parameters: { showcaseSetting: true },
  render: () => <SettingExample />,
};
export const Before: Story = { render: () => <HomeRoute /> };
export const After: Story = {
  parameters: { relay: { data: afterData } },
  render: () => <AppliedExample />,
};

const styles = StyleSheet.create({
  form: { flex: 1, gap: space[16], padding: space[16] },
  input: { minHeight: 144, ...textStyles.contentM },
  condition: { gap: space[12], padding: space[16], borderRadius: radius[12], borderWidth: 1 },
  applied: { flexDirection: 'row', alignItems: 'center', gap: space[8], padding: space[12] },
});
