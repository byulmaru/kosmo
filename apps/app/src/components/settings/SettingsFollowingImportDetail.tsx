import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery, useMutation } from 'react-relay';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, spacing, textStyles } from '@/theme/tokens';
import type { PayloadError } from 'relay-runtime';
import type { SettingsFollowingImportDetailMutation } from './__generated__/SettingsFollowingImportDetailMutation.graphql';
import type { SettingsFollowingImportDetailQuery } from './__generated__/SettingsFollowingImportDetailQuery.graphql';

const MAX_CSV_SIZE_BYTES = 512 * 1024;

const SettingsFollowingImportQuery = graphql`
  query SettingsFollowingImportDetailQuery {
    currentSession {
      selectedProfile {
        instance {
          kind
        }
        viewerState {
          membership {
            role
          }
        }
      }
    }
  }
`;

const SettingsFollowingImportMutation = graphql`
  mutation SettingsFollowingImportDetailMutation($input: ImportFollowingAccountsInput!) {
    importFollowingAccounts(input: $input) {
      accepted
    }
  }
`;

type Feedback =
  | 'accepted'
  | 'file-error'
  | 'file-too-large'
  | 'submit-error'
  | { kind: 'csv-validation-error'; message: string }
  | null;

type CsvValidationError = PayloadError & {
  extensions?: { code?: unknown; field?: unknown };
};

function csvValidationMessage(errors: ReadonlyArray<PayloadError> | null | undefined) {
  const validationError = errors?.find((error) => {
    const { code, field } = (error as CsvValidationError).extensions ?? {};
    return code === 'VALIDATION' && field === 'csv';
  });
  return validationError?.message;
}

export function SettingsFollowingImportDetail() {
  return (
    <RouteBoundary
      loading={<StateView loading title="팔로잉 가져오기 설정을 불러오는 중입니다." />}
      title="팔로잉 가져오기 설정을 불러오지 못했어요"
    >
      <SettingsFollowingImportDetailContents />
    </RouteBoundary>
  );
}

function SettingsFollowingImportDetailContents() {
  const { fetchKey } = useRouteBoundary();
  const shellChrome = useShellChrome();
  const theme = useTheme();
  const data = useLazyLoadQuery<SettingsFollowingImportDetailQuery>(
    SettingsFollowingImportQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const [commit, submitting] = useMutation<SettingsFollowingImportDetailMutation>(
    SettingsFollowingImportMutation,
  );
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const profile = data.currentSession?.selectedProfile ?? null;

  if (!profile || profile.instance?.kind !== 'LOCAL') {
    return (
      <StateView
        actionLabel={shellChrome ? 'Profile 선택하기' : undefined}
        onAction={shellChrome?.openProfileSwitcher}
        title="설정할 Profile이 없어요"
      />
    );
  }

  if (!profile.viewerState?.membership) {
    return <StateView title="이 Profile의 멤버만 팔로잉을 가져올 수 있어요." />;
  }

  const chooseCsv = async () => {
    try {
      const { getDocumentAsync } = await import('expo-document-picker');
      const result = await getDocumentAsync({
        base64: false,
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        return;
      }

      setCsv(null);
      setFileName(null);
      setFeedback(null);
      const asset = result.assets[0];
      if (!asset) {
        setFeedback('file-error');
        return;
      }

      let file: Pick<Blob, 'size' | 'text'> | undefined;
      if (Platform.OS === 'web') {
        file = asset.file;
      } else {
        const { File } = await import('expo-file-system');
        file = new File(asset.uri);
      }

      if (!file || !Number.isFinite(file.size) || file.size < 0) {
        setFeedback('file-error');
        return;
      }

      const size = Math.max(asset.size ?? 0, file.size);
      if (size > MAX_CSV_SIZE_BYTES) {
        setFeedback('file-too-large');
        return;
      }

      setCsv(await file.text());
      setFileName(asset.name);
    } catch {
      setFeedback('file-error');
    }
  };

  const startImport = () => {
    if (csv === null) {
      return;
    }

    setFeedback(null);
    commit({
      variables: { input: { csv } },
      onCompleted: (response, errors) => {
        if (response?.importFollowingAccounts?.accepted) {
          setFeedback('accepted');
          return;
        }

        const validationMessage = csvValidationMessage(errors);
        setFeedback(
          validationMessage
            ? { kind: 'csv-validation-error', message: validationMessage }
            : 'submit-error',
        );
      },
      onError: (error) => {
        const source = (
          error as Error & { source?: { errors?: ReadonlyArray<PayloadError> | null } }
        ).source;
        const validationMessage = csvValidationMessage(source?.errors);
        setFeedback(
          validationMessage
            ? { kind: 'csv-validation-error', message: validationMessage }
            : 'submit-error',
        );
      },
    });
  };

  return (
    <View style={styles.root}>
      {fileName ? (
        <View style={[styles.selectedFile, { borderColor: theme.border }]}>
          <Text style={[styles.fileName, { color: theme.text }]}>{fileName}</Text>
          <Button
            accessibilityLabel="파일 바꾸기"
            accessibilityState={{ disabled: submitting }}
            disabled={submitting}
            onPress={chooseCsv}
            size="compact"
            tone="secondary"
          >
            파일 바꾸기
          </Button>
        </View>
      ) : (
        <Button
          accessibilityLabel="팔로잉 CSV 파일 선택"
          accessibilityState={{ disabled: submitting }}
          disabled={submitting}
          onPress={chooseCsv}
          style={styles.fullWidthButton}
          tone="secondary"
        >
          팔로잉 CSV 파일 선택
        </Button>
      )}
      <View style={styles.notices}>
        <Text style={[styles.notice, { color: theme.textSecondary }]}>
          기존 팔로잉은 삭제되지 않아요.
        </Text>
        <Text style={[styles.notice, { color: theme.textSecondary }]}>
          가져오기를 시작하면 앱을 닫아도 계속 진행돼요.
        </Text>
      </View>
      <View style={styles.mainAction}>
        <Button
          accessibilityLabel="팔로잉 가져오기"
          accessibilityState={{
            busy: submitting,
            disabled: !csv || submitting || feedback === 'accepted',
          }}
          disabled={!csv || submitting || feedback === 'accepted'}
          loading={submitting}
          loadingText="시작하는 중"
          onPress={startImport}
          style={styles.fullWidthButton}
        >
          팔로잉 가져오기
        </Button>
        {feedback === 'accepted' ? (
          <View accessibilityLiveRegion="polite">
            <Text style={[styles.success, { color: theme.textSecondary }]}>
              팔로잉 가져오기를 시작했어요.
            </Text>
          </View>
        ) : feedback ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
            {feedback === 'file-too-large'
              ? 'CSV 파일은 512 KiB 이하여야 해요.'
              : feedback === 'submit-error'
                ? '가져오기를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'
                : typeof feedback === 'object'
                  ? feedback.message
                  : 'CSV 파일을 선택하거나 읽지 못했어요. 다시 시도해 주세요.'}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xl, padding: spacing.lg },
  selectedFile: {
    alignItems: 'center',
    borderRadius: radius[8],
    borderWidth: borderWidths[1],
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
    minHeight: spacing.xxxl,
    padding: spacing.sm,
  },
  fileName: { ...textStyles.uiCopyM, flex: 1, minWidth: 0 },
  notices: { gap: spacing.sm },
  notice: textStyles.uiCopyM,
  mainAction: { gap: spacing.sm },
  fullWidthButton: { minWidth: 0, width: '100%' },
  error: textStyles.uiCopyM,
  success: textStyles.uiCopyM,
});
