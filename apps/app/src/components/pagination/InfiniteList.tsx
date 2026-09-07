import { Fragment, useEffect } from 'react';
import { FlatList, Platform, View } from 'react-native';
import { useAutomaticPagination } from './useAutomaticPagination';
import type { ReactElement } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { LoadNext } from './useAutomaticPagination';

export type InfiniteListFooterState = Readonly<{
  hasNext: boolean;
  isLoadingNext: boolean;
  loadError: boolean;
  onRetry: () => void;
}>;

export type InfiniteListProps<Item> = Readonly<{
  data: ReadonlyArray<Item>;
  hasNext: boolean;
  isLoadingNext: boolean;
  keyExtractor: (item: Item, index: number) => string;
  loadNext: LoadNext;
  paginationMode?: 'automatic' | 'manual';
  onLoadErrorChange?: (loadError: boolean, onRetry: () => void) => void;
  pageSize: number;
  renderFooter?: (state: InfiniteListFooterState) => ReactElement | null;
  renderItem: (params: { index: number; item: Item }) => ReactElement | null;
  style?: StyleProp<ViewStyle>;
  header?: ReactElement | null;
  empty?: ReactElement | null;
  testID?: string;
}>;

export type InfiniteListRenderProps<Item> = Omit<InfiniteListProps<Item>, 'header'> & {
  listHeader?: ReactElement | null;
  listIdentityKey?: string;
};

export type InfiniteListRenderer = <Item>(
  props: InfiniteListRenderProps<Item>,
) => ReactElement | null;

export function InfiniteList<Item>({
  data,
  empty,
  hasNext,
  isLoadingNext,
  keyExtractor,
  loadNext,
  onLoadErrorChange,
  pageSize,
  paginationMode = 'automatic',
  renderFooter,
  renderItem,
  style,
  header,
  testID,
}: InfiniteListProps<Item>) {
  const { loadError, loadNextPage, onEndReached } = useAutomaticPagination({
    hasNext,
    isLoadingNext,
    itemCount: data.length,
    loadNext,
    nativePagination: 'endReached',
    pageSize,
    webScrollTarget: paginationMode === 'automatic' ? 'document' : 'container',
  });

  useEffect(() => {
    onLoadErrorChange?.(loadError, loadNextPage);
  }, [loadError, loadNextPage, onLoadErrorChange]);

  const footer = renderFooter?.({
    hasNext,
    isLoadingNext,
    loadError,
    onRetry: loadNextPage,
  });

  if (Platform.OS === 'web') {
    return (
      <View style={style} testID={testID}>
        {header}
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
      ListHeaderComponent={header}
      onEndReached={paginationMode === 'automatic' ? onEndReached : undefined}
      onEndReachedThreshold={1}
      renderItem={({ index, item }) => renderItem({ index, item })}
      style={[style, styles.nativeList]}
      testID={testID}
    />
  );
}

const styles = {
  nativeList: { flex: 1 },
} as const;
