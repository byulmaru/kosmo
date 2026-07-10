import { parseSearchTab, SearchTab } from '@kosmo/core/search';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { ProfileListItem } from '@/components/profile/ProfileListItem';
import { StateView } from '@/components/ui/StateView';
import { TextField } from '@/components/ui/TextField';
import { addRecentSearch, readRecentSearches, writeRecentSearches } from '@/lib/recentSearches';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { SearchPeopleByHandlePageQuery } from './__generated__/SearchPeopleByHandlePageQuery.graphql';

const tabs = [
  { label: '인기', value: SearchTab.POPULAR },
  { label: '최신', value: SearchTab.LATEST },
  { label: '미디어', value: SearchTab.MEDIA },
  { label: '사람', value: SearchTab.PEOPLE },
] as const;

const SearchPeopleQuery = graphql`
  query SearchPeopleByHandlePageQuery($handle: String!) {
    profileByHandle(handle: $handle) {
      ...ProfileListItem_profile
    }
  }
`;

function PeopleResults({ handle }: { handle: string }) {
  const { revision } = useRelayActor();
  const data = useLazyLoadQuery<SearchPeopleByHandlePageQuery>(
    SearchPeopleQuery,
    { handle: handle.replace(/^@/, '') },
    { fetchKey: revision, fetchPolicy: 'store-and-network' },
  );
  return data.profileByHandle ? (
    <ProfileListItem profile={data.profileByHandle} />
  ) : (
    <StateView
      description={`@${handle.replace(/^@/, '')} 프로필이 존재하지 않아요.`}
      title="검색 결과가 없어요"
    />
  );
}

export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; tab?: string }>();
  const query = typeof params.q === 'string' ? params.q.trim() : '';
  const activeTab = parseSearchTab(params.tab ?? null);
  const [input, setInput] = useState(query);
  const [recent, setRecent] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    void readRecentSearches().then(setRecent);
  }, []);
  useEffect(() => {
    if (!focused) {
      setInput(query);
    }
  }, [focused, query]);

  const navigate = (nextQuery: string, tab: SearchTab = activeTab) => {
    const normalized = nextQuery.trim();
    router.replace({ pathname: '/search', params: { q: normalized || undefined, tab } });
    if (normalized) {
      const next = addRecentSearch(recent, normalized);
      setRecent(next);
      void writeRecentSearches(next);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
      <Text style={[styles.heading, { color: theme.text }]}>검색</Text>
      <TextField
        accessibilityLabel="검색어"
        autoCapitalize="none"
        autoCorrect={false}
        onBlur={() => setTimeout(() => setFocused(false), 0)}
        onChangeText={setInput}
        onFocus={() => setFocused(true)}
        onSubmitEditing={() => navigate(input)}
        placeholder="프로필 handle을 입력하세요"
        returnKeyType="search"
        value={input}
      />

      {focused ? (
        <View style={styles.recent}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>최근 검색</Text>
          {recent.length ? (
            recent.map((term) => (
              <View key={term} style={[styles.recentItem, { borderColor: theme.border }]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setFocused(false);
                    navigate(term);
                  }}
                  style={styles.recentTerm}
                >
                  <Text style={[styles.recentText, { color: theme.text }]}>{term}</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`${term} 최근 검색 삭제`}
                  accessibilityRole="button"
                  onPress={() => {
                    const next = recent.filter((item) => item !== term);
                    setRecent(next);
                    void writeRecentSearches(next);
                  }}
                >
                  <Text style={{ color: theme.textSecondary }}>×</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={[styles.help, { color: theme.textSecondary }]}>최근 검색이 없어요.</Text>
          )}
        </View>
      ) : query ? (
        <>
          <View accessibilityRole="tablist" style={[styles.tabs, { borderColor: theme.border }]}>
            {tabs.map((tab) => (
              <Pressable
                aria-selected={activeTab === tab.value}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === tab.value }}
                key={tab.value}
                onPress={() => navigate(query, tab.value)}
                style={[
                  styles.tab,
                  { backgroundColor: activeTab === tab.value ? theme.primary : 'transparent' },
                ]}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    { color: activeTab === tab.value ? '#111111' : theme.textSecondary },
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {activeTab === SearchTab.PEOPLE ? (
            <PeopleResults handle={query} />
          ) : (
            <StateView
              description={`${tabs.find((tab) => tab.value === activeTab)?.label} 검색은 곧 제공될 예정이에요.`}
              title="준비 중인 검색이에요"
            />
          )}
        </>
      ) : (
        <StateView
          description="handle을 입력하면 일치하는 프로필을 찾아드려요."
          title="프로필을 검색해 보세요"
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, gap: spacing.lg, padding: spacing.lg },
  heading: { fontFamily: 'SUIT', fontWeight: '800', ...typography.xl },
  recent: { gap: spacing.sm },
  sectionTitle: { fontFamily: 'SUIT', fontWeight: '800', ...typography.md },
  recentItem: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  recentTerm: { flex: 1, justifyContent: 'center', minHeight: 44 },
  recentText: { fontFamily: 'SUIT', ...typography.sm },
  help: { fontFamily: 'SUIT', ...typography.sm },
  tabs: { borderBottomWidth: 1, flexDirection: 'row' },
  tab: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  tabLabel: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
});
