import { parseSearchTab, SearchTab } from '@kosmo/core/search';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, History, Menu, Search as SearchIcon, X } from 'lucide-react-native';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { graphql, useLazyLoadQuery, usePaginationFragment } from 'react-relay';
import { trackAnalytics } from '@/analytics/client';
import { ProfileListItem } from '@/components/profile/ProfileListItem';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { usePrimaryNavigationScroll } from '@/components/shell/PrimaryNavigationScrollContext';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { getShellLayout } from '@/components/shell/shellLayout';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { StateView } from '@/components/ui/StateView';
import { Tab, TabList } from '@/components/ui/Tabs';
import { addRecentSearch, readRecentSearches, writeRecentSearches } from '@/lib/recentSearches';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { SearchPeopleByHandlePageQuery } from './__generated__/SearchPeopleByHandlePageQuery.graphql';
import type { SearchPeopleResults_query$key } from './__generated__/SearchPeopleResults_query.graphql';
import type { SearchPeopleResultsNextPageQuery } from './__generated__/SearchPeopleResultsNextPageQuery.graphql';

const tabs = [
  { label: '인기', value: SearchTab.POPULAR },
  { label: '최신', value: SearchTab.LATEST },
  { label: '미디어', value: SearchTab.MEDIA },
  { label: '사람', value: SearchTab.PEOPLE },
] as const;

const SearchPeopleQuery = graphql`
  query SearchPeopleByHandlePageQuery($query: String!) {
    ...SearchPeopleResults_query @arguments(query: $query)
  }
`;

const SearchPeopleResultsFragment = graphql`
  fragment SearchPeopleResults_query on Query
  @argumentDefinitions(
    count: { type: "Int", defaultValue: 20 }
    cursor: { type: "String" }
    query: { type: "String!" }
  )
  @refetchable(queryName: "SearchPeopleResultsNextPageQuery") {
    searchProfiles(query: $query, first: $count, after: $cursor)
      @connection(key: "SearchPeopleResults_searchProfiles", filters: ["query"]) {
      edges {
        cursor
        node {
          ...ProfileListItem_profile
        }
      }
    }
  }
`;

function PeopleResults({ handle }: { handle: string }) {
  return (
    <RouteBoundary
      key={handle}
      loading={<StateView loading title="검색 결과를 불러오는 중입니다." />}
      title="검색 결과를 불러오지 못했어요"
    >
      <PeopleResultsContent handle={handle} />
    </RouteBoundary>
  );
}

function PeopleResultsContent({ handle }: { handle: string }) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<SearchPeopleByHandlePageQuery>(
    SearchPeopleQuery,
    { query: handle },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );

  return <SearchPeopleResults fetchKey={fetchKey} handle={handle} query={data} />;
}

function SearchPeopleResults({
  fetchKey,
  handle,
  query,
}: {
  fetchKey: number;
  handle: string;
  query: SearchPeopleResults_query$key;
}) {
  const theme = useTheme();
  const pagination = usePaginationFragment<
    SearchPeopleResultsNextPageQuery,
    SearchPeopleResults_query$key
  >(SearchPeopleResultsFragment, query);
  const [loadError, setLoadError] = useState(false);
  const trackedFetchKeyRef = useRef<number | null>(null);
  const edges = pagination.data.searchProfiles.edges;
  const hasResults = edges.length > 0;

  useEffect(() => {
    if (trackedFetchKeyRef.current === fetchKey) {
      return;
    }

    trackedFetchKeyRef.current = fetchKey;
    trackAnalytics('search_results_loaded', { has_results: hasResults, tab: 'people' });
  }, [fetchKey, hasResults]);

  if (!edges.length) {
    return (
      <StateView
        description={`'${handle}'에 해당하는 프로필을 찾지 못했어요.`}
        title="검색 결과가 없어요"
      />
    );
  }

  const loadNext = () => {
    if (pagination.isLoadingNext) {
      return;
    }

    setLoadError(false);
    pagination.loadNext(20, {
      onComplete: (error) => setLoadError(Boolean(error)),
    });
  };

  return (
    <View>
      {edges.map(({ cursor, node }) => (
        <ProfileListItem
          key={cursor}
          linked
          onPress={() => trackAnalytics('search_result_selected', { tab: 'people' })}
          profile={node}
        />
      ))}
      {pagination.hasNext || loadError ? (
        <View style={styles.pagination}>
          {loadError ? (
            <Text accessibilityRole="alert" style={[styles.paginationError, { color: theme.text }]}>
              다음 검색 결과를 불러오지 못했어요. 다시 시도해 주세요.
            </Text>
          ) : null}
          <Button
            accessibilityLabel={loadError ? '다음 검색 결과 다시 불러오기' : '검색 결과 더 보기'}
            loading={pagination.isLoadingNext}
            onPress={loadNext}
            tone="secondary"
          >
            {loadError ? '다시 시도' : '더 보기'}
          </Button>
        </View>
      ) : null}
    </View>
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

function isPrimarySearchLinkActivation(event: unknown) {
  if (Platform.OS !== 'web') {
    return true;
  }

  const webEvent = event as {
    altKey?: boolean;
    button?: number;
    currentTarget?: { target?: string | null };
    ctrlKey?: boolean;
    defaultPrevented?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
  };
  return (
    !webEvent.defaultPrevented &&
    !webEvent.metaKey &&
    !webEvent.altKey &&
    !webEvent.ctrlKey &&
    !webEvent.shiftKey &&
    (webEvent.button == null || webEvent.button === 0) &&
    [undefined, null, '', 'self'].includes(webEvent.currentTarget?.target)
  );
}

export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const shellChrome = useShellChrome();
  const { width } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const mobileWeb = web && getShellLayout(web, width) === 'mobile';
  const params = useLocalSearchParams<{ q?: string; tab?: string }>();
  const query = typeof params.q === 'string' ? params.q.trim() : '';
  const activeTab = parseSearchTab(params.tab ?? null);
  const inputRef = useRef<TextInput>(null);
  const [input, setInput] = useState(query);
  const [recent, setRecent] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { clearQueryNavigation, getQueryNavigation, recordQueryNavigation } =
    usePrimaryNavigationScroll();

  useLayoutEffect(() => {
    const navigation = getQueryNavigation();
    if (Platform.OS !== 'web' || !navigation) {
      return;
    }

    let frame = 0;
    let attempts = 0;
    let settledFrames = 0;
    let lastScrollHeight: number | null = null;
    const maxLayoutAttempts = 60;
    const stableFrameCount = 2;
    const cancelRestore = () => {
      clearQueryNavigation(navigation);
      window.cancelAnimationFrame(frame);
      frame = 0;
    };
    const handleUserInput = () => {
      cancelRestore();
    };
    let restoredFocus = false;
    const restore = () => {
      if (getQueryNavigation() !== navigation) {
        return;
      }

      const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (navigation.scrollY > maxScrollY && attempts < maxLayoutAttempts) {
        attempts += 1;
        frame = window.requestAnimationFrame(restore);
        return;
      }

      const nextScrollY = Math.min(navigation.scrollY, maxScrollY);
      window.scrollTo({ behavior: 'auto', left: 0, top: nextScrollY });
      if (navigation.restoreFocus && !restoredFocus) {
        inputRef.current?.focus();
        restoredFocus = true;
        if (query) {
          setFocused(false);
        }
      }

      const scrollHeight = document.documentElement.scrollHeight;
      if (window.scrollY === nextScrollY && scrollHeight === lastScrollHeight) {
        settledFrames += 1;
      } else {
        settledFrames = 0;
      }
      lastScrollHeight = scrollHeight;
      if (settledFrames < stableFrameCount) {
        frame = window.requestAnimationFrame(restore);
        return;
      }

      clearQueryNavigation(navigation);
    };

    for (const eventName of ['keydown', 'pointerdown', 'touchstart', 'wheel']) {
      window.addEventListener(eventName, handleUserInput, { capture: true, passive: true });
    }
    frame = window.requestAnimationFrame(restore);
    return () => {
      clearQueryNavigation(navigation);
      window.cancelAnimationFrame(frame);
      for (const eventName of ['keydown', 'pointerdown', 'touchstart', 'wheel']) {
        window.removeEventListener(eventName, handleUserInput, true);
      }
    };
  }, [activeTab, clearQueryNavigation, getQueryNavigation, query]);

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
  useEffect(
    () => () => {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
      }
    },
    [],
  );
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
  const keepSearchFocused = () => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setFocused(true);
  };
  const leaveSearchFocus = () => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
    }
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null;
      setFocused(false);
    }, 0);
  };

  const preserveQueryNavigationPosition = (restoreFocus = focused) => {
    if (Platform.OS !== 'web') {
      return;
    }

    recordQueryNavigation({
      restoreFocus,
      scrollY: window.scrollY,
    });
  };
  const isCurrentSearchTarget = (nextQuery: string, nextTab: SearchTab) =>
    nextQuery.trim() === query && nextTab === activeTab;

  const navigate = (
    nextQuery: string,
    tab: SearchTab = activeTab,
    source: 'keyboard' | 'tab' = 'keyboard',
  ) => {
    const normalized = nextQuery.trim();
    if (normalized) {
      remember(normalized);
      trackAnalytics('search_submitted', { source, tab });
    }
    if (isCurrentSearchTarget(normalized, tab)) {
      setFocused(false);
      return;
    }
    preserveQueryNavigationPosition();
    setFocused(false);
    router.push(searchHref(normalized, tab));
  };

  const clearSearch = () => {
    setInput('');
    keepSearchFocused();
    if (query) {
      preserveQueryNavigationPosition();
      router.setParams({ q: undefined });
    }
    inputRef.current?.focus();
  };

  const phase = focused ? 'input' : query ? 'results' : 'before';

  return (
    <ScrollView
      contentContainerStyle={[styles.root, web && styles.webRoot]}
      keyboardShouldPersistTaps="handled"
    >
      <View onBlur={leaveSearchFocus} onFocus={keepSearchFocused}>
        <View
          accessibilityLabel="검색"
          style={[
            styles.searchBar,
            web && styles.webSearchBar,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          {phase === 'before' && mobileWeb ? (
            <IconButton
              aria-controls={shellChrome?.navigationDrawerOpen ? 'mobile-sidebar' : undefined}
              accessibilityLabel="메뉴 열기"
              accessibilityState={{ expanded: shellChrome?.navigationDrawerOpen ?? false }}
              controlRef={shellChrome?.navigationDrawerTriggerRef}
              feedback="opacity"
              onFocus={(event) => event.stopPropagation()}
              onPress={shellChrome?.openNavigationDrawer}
              style={styles.iconButton}
              targetSize={44}
              visualSize={44}
            >
              <Menu color={theme.text} size={24} strokeWidth={2} />
            </IconButton>
          ) : phase !== 'before' ? (
            <NavigationLink href={searchHref('', activeTab)}>
              <Pressable
                accessibilityLabel="뒤로"
                accessibilityRole="link"
                onPress={() => {
                  preserveQueryNavigationPosition(false);
                  setInput('');
                  setFocused(false);
                }}
                onPressIn={keepSearchFocused}
                style={styles.iconButton}
              >
                <ArrowLeft color={theme.textSecondary} size={20} strokeWidth={2} />
              </Pressable>
            </NavigationLink>
          ) : null}
          <View
            style={[
              styles.inputShell,
              web && styles.webInputShell,
              { backgroundColor: theme.surface },
            ]}
            testID="search-input-shell"
          >
            <SearchIcon color={theme.textSecondary} size={20} strokeWidth={2} />
            <TextInput
              ref={inputRef}
              accessibilityLabel="검색어"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setInput}
              onSubmitEditing={() => navigate(input)}
              placeholder="검색어를 입력하세요"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="search"
              style={[styles.input, { color: theme.text }]}
              value={input}
            />
            {input ? (
              <IconButton
                accessibilityLabel="검색 지우기"
                onPress={clearSearch}
                onPressIn={keepSearchFocused}
                style={styles.clearButton}
                targetSize={44}
                visualSize={44}
              >
                <X color={theme.textSecondary} size={18} strokeWidth={2} />
              </IconButton>
            ) : null}
          </View>
        </View>

        {phase === 'input' ? (
          <View style={[styles.recent, web && styles.webContent]}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>최근 검색</Text>
            {recent.length ? (
              recent.map((term) => (
                <View key={term} style={[styles.recentItem, { borderColor: theme.border }]}>
                  <NavigationLink href={searchHref(term, activeTab)}>
                    <Pressable
                      accessibilityRole="link"
                      onPress={(event) => {
                        const currentTarget = isCurrentSearchTarget(term, activeTab);
                        const primaryActivation = isPrimarySearchLinkActivation(event);
                        if (currentTarget && primaryActivation) {
                          event.preventDefault();
                        } else if (primaryActivation) {
                          preserveQueryNavigationPosition();
                        }
                        setFocused(false);
                        remember(term);
                        trackAnalytics('search_submitted', { source: 'recent', tab: activeTab });
                      }}
                      onPressIn={keepSearchFocused}
                      style={styles.recentTerm}
                    >
                      <History color={theme.textSecondary} size={16} strokeWidth={2} />
                      <Text numberOfLines={1} style={[styles.recentText, { color: theme.text }]}>
                        {term}
                      </Text>
                    </Pressable>
                  </NavigationLink>
                  <IconButton
                    accessibilityLabel={`최근 검색 '${term}' 삭제`}
                    onPress={() => {
                      const next = recent.filter((item) => item !== term);
                      setRecent(next);
                      void writeRecentSearches(next);
                      inputRef.current?.focus();
                    }}
                    onPressIn={keepSearchFocused}
                    style={styles.deleteButton}
                    targetSize={44}
                    visualSize={44}
                  >
                    <X color={theme.textSecondary} size={16} strokeWidth={2} />
                  </IconButton>
                </View>
              ))
            ) : (
              <Text style={[styles.help, { color: theme.textSecondary }]}>
                아직 최근 검색이 없어요.
              </Text>
            )}
          </View>
        ) : null}
      </View>

      {phase === 'results' ? (
        <View style={web && styles.webContent}>
          <TabList
            accessibilityLabel="검색 결과 유형"
            onValueChange={(tab) => {
              if (tab !== activeTab) {
                navigate(query, tab, 'tab');
              }
            }}
            value={activeTab}
            variant="underline"
          >
            {tabs.map((tab) => (
              <Tab key={tab.value} option={tab} />
            ))}
          </TabList>
          {activeTab === SearchTab.PEOPLE ? (
            <PeopleResults handle={query} />
          ) : (
            <StateView
              description={`${tabs.find((tab) => tab.value === activeTab)?.label} 검색은 곧 제공될 예정이에요.`}
              title="준비 중인 검색이에요"
            />
          )}
        </View>
      ) : phase === 'before' ? (
        <View style={web && styles.webContent}>
          <StateView
            description="handle을 입력하면 일치하는 프로필을 찾아드려요."
            title="프로필을 검색해보세요"
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  webRoot: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  webContent: {
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
  webSearchBar: { height: 64 },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  inputShell: {
    alignItems: 'center',
    borderRadius: radii.full,
    flex: 1,
    flexDirection: 'row',
    height: 44,
    paddingLeft: spacing.lg,
  },
  webInputShell: { height: 48 },
  input: {
    flex: 1,
    fontFamily: 'SUIT',
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 0,
    ...typography.sm,
    fontSize: typography.md.fontSize,
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
  pagination: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  paginationError: {
    fontFamily: 'SUIT',
    textAlign: 'center',
    ...typography.xsm,
  },
});
