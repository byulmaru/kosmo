import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { PaginationSurface } from '@/components/pagination/PaginationSurface';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/ToastProvider';
import { space } from '@/theme/tokens';
import type { ReactNode } from 'react';
import type { UseAutomaticPaginationResult } from '@/components/pagination/useAutomaticPagination';

type Pagination =
  | { status: 'end' }
  | { status: 'loading' }
  | { status: 'more' }
  | { status: 'error'; onRetry: () => void };
export type BlockedProfileListState =
  | { status: 'loading' }
  | { status: 'error'; onRetry: () => void }
  | {
      status: 'loaded';
      children: ReactNode;
      pagination: Pagination;
      paginationEndRef?: UseAutomaticPaginationResult['endRef'];
    }
  | { status: 'empty' };
type Props = { state: BlockedProfileListState };

/** The action owner composes rows; this list does not execute relationship mutations. */
export function BlockedProfileList({ state }: Props) {
  const { showToast } = useToast();
  const retry = state.status === 'error' ? state.onRetry : undefined;
  const retryRef = useRef(retry);
  useEffect(() => {
    retryRef.current = retry;
  }, [retry]);
  useEffect(() => {
    if (state.status === 'error') {
      return showToast('차단한 프로필을 불러오지 못했어요', {
        tone: 'danger',
        action: {
          label: '다시 시도',
          onPress: () => retryRef.current?.(),
        },
      });
    }
  }, [showToast, state.status]);
  return (
    <View style={styles.root}>
      {state.status === 'loading' ? (
        <StateView loading title="차단한 프로필을 불러오는 중입니다." />
      ) : state.status === 'error' ? (
        <View style={styles.pagination}>
          <Button onPress={state.onRetry} tone="secondary">
            다시 시도
          </Button>
        </View>
      ) : state.status === 'empty' ? (
        <StateView title="차단한 프로필이 없어요" />
      ) : (
        <>
          {state.children}
          <PaginationSurface
            endRef={state.paginationEndRef}
            error={state.pagination.status === 'error'}
            errorMessage="프로필을 더 불러오지 못했어요"
            hasNext={state.pagination.status !== 'end'}
            isLoading={state.pagination.status === 'loading'}
            loadingLabel="프로필을 더 불러오는 중"
            onRetry={state.pagination.status === 'error' ? state.pagination.onRetry : undefined}
            style={styles.pagination}
          />
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flexGrow: 1, width: '100%' },
  pagination: { alignItems: 'center', padding: space[16] },
});
