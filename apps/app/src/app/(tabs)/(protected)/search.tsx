import { parseSearchTab, SearchTab } from '@kosmo/core/search';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, History, Menu, Search as SearchIcon, X } from 'lucide-react-native';
import { cloneElement, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { graphql, useFragment, useLazyLoadQuery, usePaginationFragment } from 'react-relay';
import { useTrackMultiProfileAnalytics } from '@/analytics/MultiProfileAnalyticsProvider';
import { PageHeader } from '@/components/PageHeader';
import {
  PaginationScrollView,
  usePaginationScrollRegistration,
} from '@/components/pagination/PaginationScrollView';
import { PaginationSurface } from '@/components/pagination/PaginationSurface';
import { useAutomaticPagination } from '@/components/pagination/useAutomaticPagination';
import { ProfileListItem } from '@/components/profile/ProfileListItem';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { usePrimaryNavigationScroll } from '@/components/shell/PrimaryNavigationScrollContext';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { getShellLayout } from '@/components/shell/shellLayout';
import { IconButton } from '@/components/ui/IconButton';
import { RouteTabList } from '@/components/ui/RouteTabList';
import { SearchToolbar } from '@/components/ui/SearchToolbar';
import { StateView } from '@/components/ui/StateView';
import { Tab } from '@/components/ui/Tabs';
import { addRecentSearch, readRecentSearches, writeRecentSearches } from '@/lib/recentSearches';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, radii, spacing, typography } from '@/theme/tokens';
import type { Href, LinkProps } from 'expo-router';
import type { ReactElement } from 'react';
import type { SearchToolbarRenderLeadingControlProps } from '@/components/ui/SearchToolbar';
import type { SearchPeopleByHandlePageQuery } from './__generated__/SearchPeopleByHandlePageQuery.graphql';
import type { SearchPeopleResults_query$key } from './__generated__/SearchPeopleResults_query.graphql';
import type { SearchPeopleResultsNextPageQuery } from './__generated__/SearchPeopleResultsNextPageQuery.graphql';
import type { SearchResultProfile_profile$key } from './__generated__/SearchResultProfile_profile.graphql';

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
          ...SearchResultProfile_profile
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

  return (
    <SearchPeopleResults
      fetchKey={fetchKey}
      handle={handle}
      key={`${handle}:${fetchKey}`}
      query={data}
    />
  );
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
  const pagination = usePaginationFragment<
    SearchPeopleResultsNextPageQuery,
    SearchPeopleResults_query$key
  >(SearchPeopleResultsFragment, query);
  const trackSearchAnalytics = useTrackMultiProfileAnalytics();
  const trackedFetchKeyRef = useRef<number | null>(null);
  const edges = pagination.data.searchProfiles.edges;
  const hasResults = edges.length > 0;
  const { endRef, loadError, loadNextPage, nativeScrollProps } = useAutomaticPagination({
    hasNext: pagination.hasNext,
    isLoadingNext: pagination.isLoadingNext,
    itemCount: edges.length,
    loadNext: pagination.loadNext,
    pageSize: 20,
    webScrollTarget: 'container',
  });
  usePaginationScrollRegistration(nativeScrollProps);

  useEffect(() => {
    if (trackedFetchKeyRef.current === fetchKey) {
      return;
    }

    trackedFetchKeyRef.current = fetchKey;
    trackSearchAnalytics('search_results_loaded', { has_results: hasResults, tab: 'people' });
  }, [fetchKey, hasResults, trackSearchAnalytics]);

  if (!edges.length) {
    return (
      <StateView
        description={`'${handle}'에 해당하는 프로필을 찾지 못했어요.`}
        title="검색 결과가 없어요"
      />
    );
  }

  return (
    <View>
      {edges.map(({ cursor, node }) => (
        <SearchResultProfile key={cursor} profile={node} />
      ))}
      <PaginationSurface
        endRef={endRef}
        error={loadError}
        errorMessage="다음 검색 결과를 불러오지 못했어요."
        hasNext={pagination.hasNext}
        isLoading={pagination.isLoadingNext}
        loadingLabel="검색 결과를 더 불러오는 중"
        onRetry={loadNextPage}
        style={styles.pagination}
      />
    </View>
  );
}

function SearchResultProfile({ profile }: { profile: SearchResultProfile_profile$key }) {
  const trackSearchAnalytics = useTrackMultiProfileAnalytics();
  const data = useFragment(
    graphql`
      fragment SearchResultProfile_profile on Profile {
        ...ProfileListItem_profile
      }
    `,
    profile,
  );
  return (
    <ProfileListItem
      linked
      onNavigate={() => trackSearchAnalytics('search_result_selected', { tab: 'people' })}
      profile={data}
      showBio
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
  const trackSearchAnalytics = useTrackMultiProfileAnalytics();

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

  const navigate = (nextQuery: string) => {
    const normalized = nextQuery.trim();
    if (normalized) {
      remember(normalized);
      trackSearchAnalytics('search_submitted', { source: 'keyboard', tab: activeTab });
    }
    if (isCurrentSearchTarget(normalized, activeTab)) {
      setFocused(false);
      return;
    }
    preserveQueryNavigationPosition();
    setFocused(false);
    router.push(searchHref(normalized, activeTab));
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
  const renderLeadingControl = ({ children }: SearchToolbarRenderLeadingControlProps) => {
    const linkControl = cloneElement(
      children as ReactElement<{
        accessibilityRole?: 'button' | 'link';
        onPress?: NonNullable<LinkProps['onPress']>;
      }>,
      { accessibilityRole: 'link' },
    );
    return <NavigationLink href={searchHref('', activeTab)}>{linkControl}</NavigationLink>;
  };

  const nativeSearchHeader = !web ? (
    <PageHeader>
      <View
        accessibilityLabel="검색"
        onBlur={leaveSearchFocus}
        onFocus={keepSearchFocused}
        style={styles.nativeSearchHeader}
      >
        {phase === 'before' ? (
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
        ) : (
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
        )}
        <View
          style={[styles.inputShell, { backgroundColor: theme.surface }]}
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
    </PageHeader>
  ) : null;

  return (
    <PaginationScrollView
      nativeScrollProps={{
        contentContainerStyle: [styles.root, web ? styles.webRoot : styles.nativeRoot],
        keyboardShouldPersistTaps: 'handled',
      }}
      webScrollable
    >
      {nativeSearchHeader}
      <View onBlur={leaveSearchFocus} onFocus={keepSearchFocused}>
        {web ? (
          <SearchToolbar
            inputRef={inputRef}
            leadingAction={phase === 'before' ? (mobileWeb ? 'menu' : 'none') : 'back'}
            leadingControlAriaControls={
              mobileWeb && shellChrome?.navigationDrawerOpen ? 'mobile-sidebar' : undefined
            }
            leadingControlExpanded={shellChrome?.navigationDrawerOpen ?? false}
            leadingControlRef={shellChrome?.navigationDrawerTriggerRef}
            onBackPress={() => {
              preserveQueryNavigationPosition(false);
              setInput('');
              setFocused(false);
            }}
            onChangeText={setInput}
            onClear={clearSearch}
            onMenuPress={shellChrome?.openNavigationDrawer}
            onSubmit={navigate}
            platform="web"
            renderLeadingControl={renderLeadingControl}
            value={input}
          />
        ) : null}

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
                        trackSearchAnalytics('search_submitted', {
                          source: 'recent',
                          tab: activeTab,
                        });
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
          <RouteTabList
            accessibilityLabel="검색 결과 유형"
            href={(tab) => searchHref(query, tab)}
            param="tab"
            onValueChange={(tab) => {
              if (query) {
                remember(query);
                trackSearchAnalytics('search_submitted', { source: 'tab', tab });
              }
              preserveQueryNavigationPosition();
              setFocused(false);
            }}
            value={activeTab}
            variant="underline"
            webAction="push"
          >
            {tabs.map((tab) => (
              <Tab key={tab.value} option={tab} />
            ))}
          </RouteTabList>
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
    </PaginationScrollView>
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
  nativeRoot: { paddingTop: 0 },
  webContent: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  nativeSearchHeader: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
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
    fontFamily: fontFamilies.ui,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 0,
    ...typography.sm,
    fontSize: typography.md.fontSize,
  },
  clearButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  recent: { width: '100%' },
  sectionTitle: {
    fontFamily: fontFamilies.ui,
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
  recentText: { fontFamily: fontFamilies.ui, ...typography.sm },
  deleteButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  help: {
    fontFamily: fontFamilies.ui,
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
});
