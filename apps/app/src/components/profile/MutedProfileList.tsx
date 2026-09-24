import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PaginationSurface } from '@/components/pagination/PaginationSurface';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/ToastProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';
import { ProfileListItemContent } from './ProfileListItemContent';
import type { ReactNode } from 'react';
import type { UseAutomaticPaginationResult } from '@/components/pagination/useAutomaticPagination';

export type MutedProfile = {
  action: ReactNode;
  id: string;
  displayName: string;
  avatarUri?: string | null;
};
type Pagination =
  | { status: 'end' }
  | { status: 'loading' }
  | { status: 'more' }
  | { status: 'error'; onRetry: () => void };
export type MutedProfileListState =
  | { status: 'loading' }
  | { status: 'error'; onRetry: () => void }
  | {
      status: 'loaded';
      profiles: readonly MutedProfile[];
      pagination: Pagination;
      paginationEndRef?: UseAutomaticPaginationResult['endRef'];
    };
type Props = {
  state: MutedProfileListState;
};

export function MutedProfileList({ state }: Props) {
  const { showToast } = useToast();
  const theme = useTheme();
  const retry = state.status === 'error' ? state.onRetry : undefined;
  const retryRef = useRef(retry);
  useEffect(() => {
    retryRef.current = retry;
  }, [retry]);
  useEffect(() => {
    if (state.status === 'error') {
      return showToast('뮤트한 프로필을 불러오지 못했어요', {
        tone: 'danger',
        action: {
          label: '다시 시도',
          onPress: () => {
            retryRef.current?.();
          },
        },
      });
    }
  }, [showToast, state.status]);
  return (
    <View accessibilityLabel="뮤트한 프로필" style={styles.root}>
      {state.status === 'loading' ? (
        <StateView loading title="뮤트한 프로필을 불러오는 중입니다." />
      ) : state.status === 'error' ? (
        <View style={styles.pagination}>
          <Button onPress={state.onRetry} tone="secondary">
            다시 시도
          </Button>
        </View>
      ) : state.profiles.length === 0 && state.pagination.status === 'end' ? (
        <StateView title="뮤트한 프로필이 없어요" />
      ) : (
        <>
          {state.profiles.map((profile) => (
            <ProfileListItemContent
              key={profile.id}
              avatarLabel={profile.displayName}
              avatarUri={profile.avatarUri}
              displayName={profile.displayName}
              identity={
                <Text
                  numberOfLines={1}
                  style={[textStyles.uiLabelL, { color: theme.foregroundPrimary }]}
                >
                  {profile.displayName}
                </Text>
              }
              style={styles.row}
            >
              {profile.action}
            </ProfileListItemContent>
          ))}
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
  row: { height: 64, paddingVertical: 0 },
  pagination: { alignItems: 'center', padding: space[16] },
});
