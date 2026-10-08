import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery, useMutation } from 'react-relay';
import { useFeatureFlag } from '@/components/FeatureFlagsContext';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, textStyles } from '@/theme/tokens';
import type { PayloadError } from 'relay-runtime';
import type { SettingsFollowingImportDetailMutation } from './__generated__/SettingsFollowingImportDetailMutation.graphql';
import type { SettingsFollowingImportDetailQuery } from './__generated__/SettingsFollowingImportDetailQuery.graphql';

const MAX_CSV_SIZE_BYTES = 512 * 1024;

const SettingsFollowingImportQuery = graphql`
  query SettingsFollowingImportDetailQuery {
    currentSession {
      selectedProfile {
        displayName
        relativeHandle
        instance {
          kind
        }
        viewerState {
          membership {
            role
          }
        }
        ...ProfileNameBlock_profile
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
  const migrationEnabled = useFeatureFlag('profile-migration');
  if (!migrationEnabled) {
    return <StateView title="현재 이용할 수 없는 설정이에요" />;
  }

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

  if (!profile || profile.instance.kind !== 'LOCAL') {
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
      <View
        accessibilityLabel="Mastodon 팔로잉 CSV 가져오기"
        style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        testID="following-import-control"
      >
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          Mastodon에서 내보낸 팔로잉 CSV의 Account address만 가져와요. 현재 팔로잉은 유지되고, CSV의
          게시물 표시와 새 글 알림 설정은 적용되지 않아요. 시작 후에는 앱을 닫아도 가져오기가
          백그라운드에서 계속돼요.
        </Text>
        <View
          accessibilityLabel={`팔로잉을 가져올 Profile ${profile.displayName} ${profile.relativeHandle}`}
          role="group"
          style={styles.destination}
        >
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>가져올 Profile</Text>
          <ProfileNameBlock profile={profile} />
        </View>
        {fileName ? (
          <Text
            accessibilityLabel={`선택한 CSV 파일 ${fileName}`}
            style={[styles.fileName, { color: theme.text }]}
          >
            {fileName}
          </Text>
        ) : null}
        <Button
          accessibilityLabel="CSV 파일 선택"
          accessibilityState={{ disabled: submitting }}
          disabled={submitting}
          onPress={chooseCsv}
          tone="secondary"
        >
          CSV 파일 선택
        </Button>
        <Button
          accessibilityLabel="이 Profile로 팔로잉 가져오기"
          accessibilityState={{
            busy: submitting,
            disabled: !csv || submitting || feedback === 'accepted',
          }}
          disabled={!csv || submitting || feedback === 'accepted'}
          loading={submitting}
          loadingText="시작하는 중"
          onPress={startImport}
        >
          이 Profile로 팔로잉 가져오기
        </Button>
        {feedback === 'accepted' ? (
          <View accessibilityLiveRegion="polite">
            <Text style={[styles.success, { color: theme.textSecondary }]}>
              팔로잉 가져오기를 시작했어요. 앱을 닫아도 백그라운드에서 계속 진행돼요.
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
  root: { padding: spacing.lg },
  card: { borderRadius: radii.md, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  description: textStyles.uiCopyM,
  destination: { gap: spacing.xs },
  fieldLabel: textStyles.uiCopyS,
  fileName: textStyles.uiCopyM,
  error: textStyles.uiCopyM,
  success: textStyles.uiCopyM,
});
