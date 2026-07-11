import { parseSearchTab, SearchTab } from '@kosmo/core/search';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, History, Search as SearchIcon, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { ProfileListItem } from '@/components/profile/ProfileListItem';
import { RouteBoundary } from '@/components/RouteBoundary';
import { StateView } from '@/components/ui/StateView';
import { addRecentSearch, readRecentSearches, writeRecentSearches } from '@/lib/recentSearches';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { Href } from 'expo-router';
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
  const [fetchKey, setFetchKey] = useState(0);

  return (
    <RouteBoundary
      key={handle}
      loading={<StateView loading title="검색 결과를 불러오는 중입니다." />}
      onRetry={() => setFetchKey((key) => key + 1)}
      title="검색 결과를 불러오지 못했어요"
    >
      <PeopleResultsContent fetchKey={`${revision}:${fetchKey}`} handle={handle} />
    </RouteBoundary>
  );
}

function PeopleResultsContent({ fetchKey, handle }: { fetchKey: string; handle: string }) {
  const data = useLazyLoadQuery<SearchPeopleByHandlePageQuery>(
    SearchPeopleQuery,
    { handle: handle.replace(/^@/, '') },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  return data.profileByHandle ? (
    <ProfileListItem linked profile={data.profileByHandle} />
  ) : (
    <StateView
      description={`'${handle}'에 해당하는 프로필을 찾지 못했어요.`}
      title="검색 결과가 없어요"
    />
  );
}

function searchHref(query: string, tab: SearchTab): Href {
  const params = new URLSearchParams();
  const normalized = query.trim();

  if (normalized) {
    params.set('q', normalized);
  }
  params.set('tab', tab);

  return `/search?${params.toString()}` as Href;
}

export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; tab?: string }>();
  const query = typeof params.q === 'string' ? params.q.trim() : '';
  const activeTab = parseSearchTab(params.tab ?? null);
  const inputRef = useRef<TextInput>(null);
  const [input, setInput] = useState(query);
  const [recent, setRecent] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    let current = true;

    void readRecentSearches().then((stored) => {
      if (!current) {
        return;
      }

      const next = query ? addRecentSearch(stored, query) : stored;
      setRecent(next);
      if (query) {
        void writeRecentSearches(next);
      }
    });

    return () => {
      current = false;
    };
  }, [query]);
  useEffect(() => {
    if (!focused) {
      setInput(query);
    }
  }, [focused, query]);
  const remember = (term: string) => {
    setRecent((current) => {
      const next = addRecentSearch(current, term);
      void writeRecentSearches(next);
      return next;
    });
  };

  const navigate = (nextQuery: string, tab: SearchTab = activeTab) => {
    const normalized = nextQuery.trim();
    if (normalized) {
      remember(normalized);
    }
    setFocused(false);
    router.push(searchHref(normalized, tab));
  };

  const clearSearch = () => {
    setInput('');
    setFocused(true);
    if (query) {
      router.setParams({ q: undefined });
    }
    inputRef.current?.focus();
  };

  const phase = focused ? 'input' : query ? 'results' : 'before';

  return (
    <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
      <View
        accessibilityLabel="검색"
        style={[styles.searchBar, { backgroundColor: theme.card, borderColor: theme.border }]}
      >
        {phase !== 'before' ? (
          <Link asChild href={searchHref('', activeTab)}>
            <Pressable
              accessibilityLabel="뒤로"
              accessibilityRole="link"
              onPress={() => {
                setInput('');
                setFocused(false);
              }}
              style={styles.iconButton}
            >
              <ArrowLeft color={theme.textSecondary} size={20} strokeWidth={2} />
            </Pressable>
          </Link>
        ) : null}
        <View style={[styles.inputShell, { backgroundColor: theme.surface }]}>
          <SearchIcon color={theme.textSecondary} size={20} strokeWidth={2} />
          <TextInput
            ref={inputRef}
            accessibilityLabel="검색어"
            autoCapitalize="none"
            autoCorrect={false}
            onBlur={() =>
              setTimeout(() => {
                if (!inputRef.current?.isFocused()) {
                  setFocused(false);
                }
              }, 0)
            }
            onChangeText={setInput}
            onFocus={() => setFocused(true)}
            onSubmitEditing={() => navigate(input)}
            placeholder="검색어를 입력하세요"
            placeholderTextColor={theme.textSecondary}
            returnKeyType="search"
            style={[styles.input, { color: theme.text }]}
            value={input}
          />
          {input ? (
            <Pressable
              accessibilityLabel="검색 지우기"
              accessibilityRole="button"
              onPress={clearSearch}
              style={styles.clearButton}
            >
              <X color={theme.textSecondary} size={18} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {phase === 'input' ? (
        <View style={styles.recent}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>최근 검색</Text>
          {recent.length ? (
            recent.map((term) => (
              <View key={term} style={[styles.recentItem, { borderColor: theme.border }]}>
                <Link asChild href={searchHref(term, activeTab)}>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => {
                      setFocused(false);
                      remember(term);
                    }}
                    style={styles.recentTerm}
                  >
                    <History color={theme.textSecondary} size={16} strokeWidth={2} />
                    <Text numberOfLines={1} style={[styles.recentText, { color: theme.text }]}>
                      {term}
                    </Text>
                  </Pressable>
                </Link>
                <Pressable
                  accessibilityLabel={`최근 검색 '${term}' 삭제`}
                  accessibilityRole="button"
                  onPress={() => {
                    const next = recent.filter((item) => item !== term);
                    setRecent(next);
                    void writeRecentSearches(next);
                  }}
                  style={styles.deleteButton}
                >
                  <X color={theme.textSecondary} size={16} strokeWidth={2} />
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={[styles.help, { color: theme.textSecondary }]}>
              아직 최근 검색이 없어요.
            </Text>
          )}
        </View>
      ) : phase === 'results' ? (
        <>
          <View
            accessibilityLabel="검색 결과 유형"
            accessibilityRole="tablist"
            style={[styles.tabs, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            {tabs.map((tab) => (
              <Pressable
                aria-selected={activeTab === tab.value}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === tab.value }}
                key={tab.value}
                onPress={() => navigate(query, tab.value)}
                style={styles.tab}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    { color: activeTab === tab.value ? theme.text : theme.textSecondary },
                  ]}
                >
                  {tab.label}
                </Text>
                {activeTab === tab.value ? (
                  <View style={[styles.tabIndicator, { backgroundColor: theme.text }]} />
                ) : null}
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
          title="프로필을 검색해보세요"
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  searchBar: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 56,
    paddingHorizontal: spacing.lg,
  },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  inputShell: {
    alignItems: 'center',
    borderRadius: radii.full,
    flex: 1,
    flexDirection: 'row',
    height: 44,
    paddingLeft: spacing.lg,
  },
  input: {
    flex: 1,
    fontFamily: 'SUIT',
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 0,
    ...typography.sm,
  },
  clearButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  recent: { width: '100%' },
  sectionTitle: {
    fontFamily: 'SUIT',
    fontWeight: '600',
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    ...typography.xsm,
  },
  recentItem: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 48,
  },
  recentTerm: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  recentText: { fontFamily: 'SUIT', ...typography.sm },
  deleteButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  help: {
    fontFamily: 'SUIT',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxxl,
    textAlign: 'center',
    ...typography.sm,
  },
  tabs: { borderBottomWidth: 1, flexDirection: 'row', height: 44 },
  tab: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  tabLabel: { fontFamily: 'SUIT', fontWeight: '600', ...typography.xsm },
  tabIndicator: {
    borderRadius: radii.full,
    bottom: 0,
    height: 2,
    left: '30%',
    position: 'absolute',
    right: '30%',
  },
});
