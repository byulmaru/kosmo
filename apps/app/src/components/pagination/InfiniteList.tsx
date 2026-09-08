import { Fragment, useEffect } from 'react';
import { FlatList, Platform, View } from 'react-native';
import {
  usePaginationScrollContext,
  usePaginationScrollRegistration,
} from './PaginationScrollView';
import { useAutomaticPagination } from './useAutomaticPagination';
import type { ReactElement } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { LoadNext } from './useAutomaticPagination';

export type InfiniteListProps<Item> = Readonly<{
  data: ReadonlyArray<Item>;
  hasNext: boolean;
  isLoadingNext: boolean;
  keyExtractor: (item: Item, index: number) => string;
  loadNext: LoadNext;
  onLoadErrorChange?: (loadError: boolean, onRetry: () => void) => void;
  pageSize: number;
  renderItem: (params: { index: number; item: Item }) => ReactElement | null;
  style?: StyleProp<ViewStyle>;
  footer?: ReactElement | null;
  empty?: ReactElement | null;
}>;

export function InfiniteList<Item>({
  data,
  empty,
  hasNext,
  isLoadingNext,
  keyExtractor,
  loadNext,
  onLoadErrorChange,
  pageSize,
  footer,
  renderItem,
  style,
}: InfiniteListProps<Item>) {
  const hasPaginationScrollContext = usePaginationScrollContext();
  const hasNativeScrollParent = Platform.OS !== 'web' && hasPaginationScrollContext;
  const { loadError, loadNextPage, nativeScrollProps, onEndReached } = useAutomaticPagination({
    hasNext,
    isLoadingNext,
    itemCount: data.length,
    loadNext,
    nativePagination: hasNativeScrollParent ? 'metrics' : 'endReached',
    pageSize,
  });
  usePaginationScrollRegistration(hasNativeScrollParent ? nativeScrollProps : null);

  useEffect(() => {
    onLoadErrorChange?.(loadError, loadNextPage);
  }, [loadError, loadNextPage, onLoadErrorChange]);

  if (Platform.OS === 'web' || hasNativeScrollParent) {
    return (
      <View style={style}>
        {data.length === 0
          ? empty
          : data.map((item, index) => (
              <Fragment key={keyExtractor(item, index)}>{renderItem({ index, item })}</Fragment>
            ))}
        {footer}
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      ListEmptyComponent={empty}
      keyExtractor={keyExtractor}
      ListFooterComponent={footer}
      onEndReached={onEndReached}
      onEndReachedThreshold={1}
      renderItem={({ index, item }) => renderItem({ index, item })}
      style={[style, styles.nativeList]}
    />
  );
}

const styles = {
  nativeList: { flex: 1 },
} as const;
