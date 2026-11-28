import { parseSearchTab, SearchTab } from '@kosmo/core/search';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CircleQuestionMark, History, X } from 'lucide-react-native';
import {
  cloneElement,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, useFragment, useLazyLoadQuery, usePaginationFragment } from 'react-relay';
import { trackAnalytics } from '@/analytics/client';
import { useCoachmarkController } from '@/components/coachmark/CoachmarkController';
import { CoachmarkGuide } from '@/components/coachmark/CoachmarkGuide';
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
import { fontFamilies, spacing, typography } from '@/theme/tokens';
import type { Href, LinkProps } from 'expo-router';
import type { ReactElement, Ref } from 'react';
import type { TextInput, View as NativeView } from 'react-native';
import type { CoachmarkRequestHandle } from '@/components/coachmark/CoachmarkProvider';
import type { SearchToolbarRenderLeadingControlProps } from '@/components/ui/SearchToolbar';
import type { SearchCoachmarkQuery } from './__generated__/SearchCoachmarkQuery.graphql';
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

const SearchCoachmarkQuery = graphql`
  query SearchCoachmarkQuery {
    me {
      ...CoachmarkController_account
    }
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

function PeopleResults({ anchorRef, handle }: { anchorRef: Ref<NativeView>; handle: string }) {
  return (
    <RouteBoundary
      key={handle}
      loading={<StateView loading title="검색 결과를 불러오는 중입니다." />}
      title="검색 결과를 불러오지 못했어요"
    >
      <PeopleResultsContent anchorRef={anchorRef} handle={handle} />
    </RouteBoundary>
  );
}

function PeopleResultsContent({
  anchorRef,
  handle,
}: {
  anchorRef: Ref<NativeView>;
  handle: string;
}) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<SearchPeopleByHandlePageQuery>(
    SearchPeopleQuery,
    { query: handle },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );

  return (
    <SearchPeopleResults
      anchorRef={anchorRef}
      fetchKey={fetchKey}
      handle={handle}
      key={`${handle}:${fetchKey}`}
      query={data}
    />
  );
}

function SearchPeopleResults({
  anchorRef,
  fetchKey,
  handle,
  query,
}: {
  anchorRef: Ref<NativeView>;
  fetchKey: string;
  handle: string;
  query: SearchPeopleResults_query$key;
}) {
  const pagination = usePaginationFragment<
    SearchPeopleResultsNextPageQuery,
    SearchPeopleResults_query$key
  >(SearchPeopleResultsFragment, query);
  const trackedFetchKeyRef = useRef<string | null>(null);
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

  return (
    <View ref={anchorRef}>
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
      onNavigate={() => trackAnalytics('search_result_selected', { tab: 'people' })}
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
  const coachmarkData = useLazyLoadQuery<SearchCoachmarkQuery>(
    SearchCoachmarkQuery,
    {},
    { fetchPolicy: 'store-and-network' },
  );
  const { width } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const mobileWeb = web && getShellLayout(web, width) === 'mobile';
  const params = useLocalSearchParams<{ q?: string; tab?: string }>();
  const query = typeof params.q === 'string' ? params.q.trim() : '';
  const activeTab = parseSearchTab(params.tab ?? null);
  const inputRef = useRef<TextInput>(null);
  const inputAnchorRef = useRef<NativeView>(null);
  const resultsAnchorRef = useRef<NativeView>(null);
  const coachmarkTriggerRef = useRef<NativeView>(null);
  const coachmarkHandleRef = useRef<CoachmarkRequestHandle | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const [toolbarKey, setToolbarKey] = useState(0);
  const [inputAnchorReady, setInputAnchorReady] = useState(false);
  const [resultsReady, setResultsReady] = useState(false);
  const [routeFocused, setRouteFocused] = useState(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { clearQueryNavigation, getQueryNavigation, recordQueryNavigation } =
    usePrimaryNavigationScroll();

  useFocusEffect(
    useCallback(() => {
      setRouteFocused(true);
      return () => {
        setRouteFocused(false);
        coachmarkHandleRef.current?.cancel();
        coachmarkHandleRef.current = null;
      };
    }, []),
  );

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
  const remember = (term: string) => {
    setRecent((current) => {
      const next = addRecentSearch(current, term);
      void writeRecentSearches(next);
      return next;
    });
  };
  const keepSearchFocused = useCallback(() => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setFocused(true);
  }, []);
  const leaveSearchFocus = useCallback(() => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
    }
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null;
      setFocused(false);
    }, 0);
  }, []);

  const markInputAnchorReady = useCallback(() => {
    setInputAnchorReady(true);
  }, []);

  const handleResultsAnchor = useCallback((anchor: NativeView | null) => {
    resultsAnchorRef.current = anchor;
    setResultsReady(anchor !== null);
    if (anchor === null) {
      coachmarkHandleRef.current?.cancel();
      coachmarkHandleRef.current = null;
    }
  }, []);
  const coachmarkSteps = useMemo(
    () => [
      {
        anchorRef: inputAnchorRef,
        description: '찾고 싶은 사람의 핸들을 입력하고 검색하세요.',
        title: '핸들로 사람 찾기',
      },
      {
        anchorRef: inputAnchorRef,
        description: '@사용자명@서버주소를 입력하고 검색하세요. 예: @alice@mastodon.social',
        title: '다른 서버의 사람 찾기',
      },
      {
        anchorRef: resultsReady ? resultsAnchorRef : undefined,
        description: '프로필을 열고 프로필의 태그를 선택해 탐색하세요.',
        title: '검색 결과로 탐색하기',
      },
    ],
    [resultsReady],
  );
  const { open: openCoachmark, requestAutoStart } = useCoachmarkController({
    account: coachmarkData.me,
    guide: CoachmarkGuide.SEARCH,
    preferredFocusRef: coachmarkTriggerRef,
    ready: inputAnchorReady,
    steps: coachmarkSteps,
  });
  const requestAutoStartEvent = useEffectEvent(requestAutoStart);
  const automaticCoachmarkReady = routeFocused && inputAnchorReady && !focused;

  useEffect(() => {
    if (!automaticCoachmarkReady) {
      return;
    }

    const handle = requestAutoStartEvent();
    if (!handle) {
      return;
    }
    coachmarkHandleRef.current = handle;
    return () => {
      if (coachmarkHandleRef.current === handle) {
        handle?.cancel();
        coachmarkHandleRef.current = null;
      }
    };
  }, [automaticCoachmarkReady]);

  const openHelp = useCallback(() => {
    if (focused) {
      keepSearchFocused();
    }
    const handle = openCoachmark();
    if (handle) {
      coachmarkHandleRef.current = handle;
    }
  }, [focused, keepSearchFocused, openCoachmark]);

  const searchHelpButton = (
    <IconButton
      accessibilityLabel="검색 도움말"
      controlRef={coachmarkTriggerRef}
      onFocus={(event) => {
        event.stopPropagation();
        if (focused) {
          keepSearchFocused();
        }
      }}
      onPress={openHelp}
      style={styles.iconButton}
      targetSize={44}
      visualSize={44}
    >
      <CircleQuestionMark color={theme.textSecondary} size={20} strokeWidth={2} />
    </IconButton>
  );

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
      trackAnalytics('search_submitted', { source: 'keyboard', tab: activeTab });
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

  const leadingAction = phase === 'before' ? (web && !mobileWeb ? 'none' : 'menu') : 'back';
  const searchToolbar = (
    <SearchToolbar
      key={toolbarKey}
      focused={focused}
      inputAnchorRef={inputAnchorRef}
      inputRef={inputRef}
      leadingAction={leadingAction}
      leadingControlAriaControls={shellChrome?.navigationDrawerOpen ? 'mobile-sidebar' : undefined}
      leadingControlExpanded={shellChrome?.navigationDrawerOpen ?? false}
      leadingControlRef={shellChrome?.navigationDrawerTriggerRef}
      onBackPress={() => {
        preserveQueryNavigationPosition(false);
        setFocused(false);
      }}
      onBlur={leaveSearchFocus}
      onClear={clearSearch}
      onFocus={keepSearchFocused}
      onInputAnchorLayout={markInputAnchorReady}
      onMenuPress={shellChrome?.openNavigationDrawer}
      onSubmit={navigate}
      query={query}
      renderLeadingControl={renderLeadingControl}
    >
      {searchHelpButton}
    </SearchToolbar>
  );
  const nativeSearchHeader = !web ? <PageHeader>{searchToolbar}</PageHeader> : null;

  return (
    <PaginationScrollView
      nativeScrollProps={{
        contentContainerStyle: [styles.root, web ? styles.webRoot : styles.nativeRoot],
        keyboardShouldPersistTaps: 'handled',
      }}
      reselectDestination="search"
      webScrollable
    >
      {nativeSearchHeader}
      <View onBlur={leaveSearchFocus} onFocus={keepSearchFocused}>
        {web ? searchToolbar : null}

        {phase === 'input' ? (
          <View style={styles.recent}>
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
                          setToolbarKey((key) => key + 1);
                        } else if (primaryActivation) {
                          preserveQueryNavigationPosition();
                        }
                        setFocused(false);
                        remember(term);
                        trackAnalytics('search_submitted', { source: 'recent', tab: activeTab });
                      }}
                      onPressIn={keepSearchFocused}
                      style={(state) => {
                        const hovered = (state as { hovered?: boolean }).hovered;
                        return [
                          styles.recentTerm,
                          state.pressed || (Platform.OS === 'web' && hovered)
                            ? {
                                backgroundColor:
                                  state.pressed || Platform.OS !== 'web'
                                    ? theme.statePressed
                                    : theme.stateHover,
                              }
                            : null,
                        ];
                      }}
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
        <View>
          <RouteTabList
            accessibilityLabel="검색 결과 유형"
            href={(tab) => searchHref(query, tab)}
            param="tab"
            onValueChange={(tab) => {
              if (query) {
                remember(query);
                trackAnalytics('search_submitted', { source: 'tab', tab });
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
            <PeopleResults anchorRef={handleResultsAnchor} handle={query} />
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
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
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
