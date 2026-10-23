import { ArrowLeft, VolumeX } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import HomeRoute from '@/app/(tabs)/(protected)/home';
import { PageHeader } from '@/components/PageHeader';
import { PostActionAuthenticationProvider } from '@/components/post/PostActionAuthentication';
import { PostComposerCoordinatorProvider } from '@/components/post/PostComposerCoordinator';
import { PostListItem } from '@/components/post/PostListItem';
import { PostMediaViewerHostProvider } from '@/components/post/PostMediaViewerHost';
import { UniversalShell } from '@/components/shell/UniversalShell';
import { BottomTabBar } from '@/components/ui/BottomTabBar';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { SearchToolbar } from '@/components/ui/SearchToolbar';
import { Tab, TabList } from '@/components/ui/Tabs';
import { TextField } from '@/components/ui/TextField';
import { SessionProvider } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSizes, radius, space, textStyles } from '@/theme/tokens';
import { post, profile, shellQuery, timeline } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { NaturalLanguageMuteSearchQuery } from './__generated__/NaturalLanguageMuteSearchQuery.graphql';

const sentence = '〈별의 정원〉 결말이나 반전은 보고 싶지 않아요.';
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
  '〈별의 정원〉 드디어 다 봤다!\n마지막에 정원사가 미래의 주인공으로 밝혀진다.\n배경 작화가 정말 예뻤어요. 🌙',
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
const hiddenData = { ...shell, homeTimeline: timeline(...posts.slice(1)) };

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
        <Button>이 조건으로 글 숨기기</Button>
        <View
          style={[
            styles.condition,
            { backgroundColor: theme.actionPrimarySubtle, borderColor: theme.borderDefault },
          ]}
        >
          <VolumeX aria-hidden color={theme.foregroundPrimary} size={iconSizes[24]} />
          <Text style={[textStyles.uiLabelL, { color: theme.foregroundPrimary }]}>
            조건에 맞는 글을 숨겨요
          </Text>
          <Text style={[textStyles.uiCopyL, { color: theme.foregroundPrimary }]}>
            타임라인과 검색 결과 등에서 글 전체가 보이지 않아요.
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

const SearchPostsQuery = graphql`
  query NaturalLanguageMuteSearchQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Post {
        id
        ...PostListItem_post @alias(as: "listItem")
      }
    }
  }
`;

function SearchExample({ postIds }: { postIds: string[] }) {
  const data = useLazyLoadQuery<NaturalLanguageMuteSearchQuery>(SearchPostsQuery, { ids: postIds });
  return (
    <View>
      <SearchToolbar
        leadingAction="back"
        onBackPress={() => undefined}
        onChangeText={() => undefined}
        onClear={() => undefined}
        onSubmit={() => undefined}
        value="별의 정원"
      />
      <TabList
        accessibilityLabel="검색 결과 유형"
        onValueChange={() => undefined}
        value="latest"
        variant="underline"
      >
        <Tab option={{ label: '인기', value: 'popular' }} />
        <Tab option={{ label: '최신', value: 'latest' }} />
        <Tab option={{ label: '미디어', value: 'media' }} />
        <Tab option={{ label: '사람', value: 'people' }} />
      </TabList>
      <PostActionAuthenticationProvider>
        <PostComposerCoordinatorProvider owner="list" profile={null}>
          <PostMediaViewerHostProvider>
            {data.nodes?.map((node) =>
              node?.__typename === 'Post' && node.listItem ? (
                <PostListItem key={node.id} post={node.listItem} presentation="mobile" />
              ) : null,
            )}
          </PostMediaViewerHostProvider>
        </PostComposerCoordinatorProvider>
      </PostActionAuthenticationProvider>
    </View>
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
export const HiddenPosts: Story = {
  parameters: { relay: { data: hiddenData } },
  render: () => <HomeRoute />,
};
export const SearchBefore: Story = {
  parameters: {
    relay: { data: { ...shell, nodes: posts.slice(0, 2) } },
    router: { pathname: '/search' },
  },
  render: () => <SearchExample postIds={posts.slice(0, 2).map((item) => item.id)} />,
};
export const SearchHidden: Story = {
  parameters: {
    relay: { data: { ...shell, nodes: posts.slice(1, 2) } },
    router: { pathname: '/search' },
  },
  render: () => <SearchExample postIds={[posts[1].id]} />,
};
const styles = StyleSheet.create({
  form: { flex: 1, gap: space[16], padding: space[16] },
  input: { minHeight: 144, ...textStyles.contentM },
  condition: { gap: space[12], padding: space[16], borderRadius: radius[12], borderWidth: 1 },
});
