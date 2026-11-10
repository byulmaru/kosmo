import { Component, Fragment, useCallback, useEffect, useRef } from 'react';
import { FlatList, Platform, View } from 'react-native';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import {
  usePaginationScrollContext,
  usePaginationScrollRegistration,
} from './PaginationScrollView';
import { useAutomaticPagination } from './useAutomaticPagination';
import type { ReactElement, ReactNode } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';
import type { TabReselectionDestination } from '@/components/shell/ShellChromeContext';
import type { LoadNext } from './useAutomaticPagination';

export type InfiniteListProps<Item> = Readonly<{
  active?: boolean;
  data: ReadonlyArray<Item>;
  hasNext: boolean;
  isLoadingNext: boolean;
  keyExtractor: (item: Item, index: number) => string;
  loadNext: LoadNext;
  maintainVisibleContentPosition?: boolean;
  onAtTopChange?: (atTop: boolean) => void;
  onLoadErrorChange?: (loadError: boolean, onRetry: () => void) => void;
  onRefresh?: () => void;
  pageSize: number;
  renderItem: (params: { index: number; item: Item }) => ReactElement | null;
  refreshing?: boolean;
  reselectDestination?: TabReselectionDestination;
  style?: StyleProp<ViewStyle>;
  footer?: ReactElement | null;
  empty?: ReactElement | null;
  header?: ReactElement | null;
}>;

type WebPrependAnchorProps = Readonly<{
  active: boolean;
  children: ReactNode;
  itemKeys: ReadonlyArray<string>;
}>;

type WebPrependAnchorSnapshot = Readonly<{
  scrollHeight: number;
  scrollX: number;
  scrollY: number;
}> | null;

// eslint-disable-next-line @eslint-react/no-class-component -- React's pre-commit snapshot is needed to preserve the Web prepend position.
class WebPrependAnchor extends Component<WebPrependAnchorProps, object, WebPrependAnchorSnapshot> {
  getSnapshotBeforeUpdate(previousProps: Readonly<WebPrependAnchorProps>) {
    const { itemKeys } = this.props;
    const insertedItemCount = itemKeys.length - previousProps.itemKeys.length;
    if (
      !previousProps.active ||
      !this.props.active ||
      previousProps.itemKeys.length === 0 ||
      insertedItemCount <= 0 ||
      !previousProps.itemKeys.every((key, index) => itemKeys[insertedItemCount + index] === key) ||
      typeof window === 'undefined' ||
      typeof document === 'undefined'
    ) {
      return null;
    }

    const scrollY = window.scrollY;
    if (scrollY <= 0) {
      return null;
    }

    return {
      scrollHeight: document.documentElement.scrollHeight,
      scrollX: window.scrollX,
      scrollY,
    };
  }

  componentDidUpdate(
    _previousProps: Readonly<WebPrependAnchorProps>,
    _previousState: Readonly<object>,
    snapshot: WebPrependAnchorSnapshot,
  ) {
    if (!snapshot || !this.props.active) {
      return;
    }

    const scrollHeight = document.documentElement.scrollHeight;
    const heightDelta = scrollHeight - snapshot.scrollHeight;
    if (heightDelta <= 0) {
      return;
    }

    const maxScrollY = Math.max(0, scrollHeight - window.innerHeight);
    const desiredScrollY = Math.min(snapshot.scrollY + heightDelta, maxScrollY);
    if (Math.abs(window.scrollY - desiredScrollY) <= 1) {
      return;
    }

    window.scrollTo({ behavior: 'auto', left: snapshot.scrollX, top: desiredScrollY });
  }

  render() {
    return this.props.children;
  }
}

export function InfiniteList<Item>({
  active = true,
  data,
  empty,
  hasNext,
  isLoadingNext,
  keyExtractor,
  loadNext,
  maintainVisibleContentPosition = false,
  onAtTopChange,
  onLoadErrorChange,
  onRefresh,
  pageSize,
  footer,
  header,
  renderItem,
  refreshing,
  reselectDestination,
  style,
}: InfiniteListProps<Item>) {
  const scrollRef = useRef<FlatList<Item>>(null);
  const shellChrome = useShellChrome();
  const hasPaginationScrollContext = usePaginationScrollContext();
  const hasNativeScrollParent = Platform.OS !== 'web' && hasPaginationScrollContext;
  const { loadError, loadNextPage, nativeScrollProps, onEndReached } = useAutomaticPagination({
    hasNext,
    isLoadingNext,
    itemCount: data.length,
    loadNext,
    nativePagination: hasNativeScrollParent ? 'metrics' : 'endReached',
    pageSize,
    webDocumentActive: active,
  });
  usePaginationScrollRegistration(hasNativeScrollParent ? nativeScrollProps : null);
  const scrollToTop = useCallback(() => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.scrollTo({ behavior: 'auto', left: 0, top: 0 });
      }
      return;
    }
    scrollRef.current?.scrollToOffset({ animated: true, offset: 0 });
  }, []);
  const reportAtTop = useCallback((atTop: boolean) => onAtTopChange?.(atTop), [onAtTopChange]);
  const handleNativeScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      reportAtTop(event.nativeEvent.contentOffset.y <= 0);
    },
    [reportAtTop],
  );

  useEffect(() => {
    if (!onAtTopChange) {
      return;
    }

    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') {
        return;
      }
      const handleScroll = () => reportAtTop(window.scrollY <= 0);
      window.addEventListener('scroll', handleScroll, { passive: true });
      handleScroll();
      return () => window.removeEventListener('scroll', handleScroll);
    }

    reportAtTop(true);
  }, [onAtTopChange, reportAtTop]);

  useEffect(() => {
    if (
      Platform.OS === 'web' ||
      hasNativeScrollParent ||
      !reselectDestination ||
      !shellChrome?.registerTabReselection
    ) {
      return;
    }

    return shellChrome.registerTabReselection(reselectDestination, scrollToTop);
  }, [hasNativeScrollParent, reselectDestination, scrollToTop, shellChrome]);

  useEffect(() => {
    onLoadErrorChange?.(loadError, loadNextPage);
  }, [loadError, loadNextPage, onLoadErrorChange]);

  if (Platform.OS === 'web' || hasNativeScrollParent) {
    const itemKeys =
      Platform.OS === 'web' && maintainVisibleContentPosition ? data.map(keyExtractor) : undefined;
    const list = (
      <View style={style}>
        {header}
        {data.length === 0
          ? empty
          : data.map((item, index) => (
              <Fragment key={itemKeys?.[index] ?? keyExtractor(item, index)}>
                {renderItem({ index, item })}
              </Fragment>
            ))}
        {footer}
      </View>
    );

    return itemKeys ? (
      <WebPrependAnchor active={active} itemKeys={itemKeys}>
        {list}
      </WebPrependAnchor>
    ) : (
      list
    );
  }

  return (
    <FlatList
      data={data}
      ref={scrollRef}
      ListEmptyComponent={empty}
      ListHeaderComponent={header}
      keyExtractor={keyExtractor}
      keyboardShouldPersistTaps="handled"
      ListFooterComponent={footer}
      maintainVisibleContentPosition={
        maintainVisibleContentPosition
          ? { minIndexForVisible: 0, autoscrollToTopThreshold: 0 }
          : undefined
      }
      onScroll={onAtTopChange ? handleNativeScroll : undefined}
      scrollEventThrottle={onAtTopChange ? 16 : undefined}
      onEndReached={onEndReached}
      onEndReachedThreshold={1}
      onRefresh={onRefresh}
      renderItem={({ index, item }) => renderItem({ index, item })}
      refreshing={refreshing}
      style={[style, styles.nativeList]}
    />
  );
}

const styles = {
  nativeList: { flex: 1 },
} as const;
