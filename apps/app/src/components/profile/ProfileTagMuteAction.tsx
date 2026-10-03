import { Bell, BellOff, RefreshCw } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { graphql, useMutation, useRefetchableFragment } from 'react-relay';
import { ProfileMoreMenu } from '@/components/profile/ProfileMoreMenu';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { IconButton } from '@/components/ui/IconButton';
import { getInteractionTargetSize } from '@/components/ui/interactionTarget';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { useToast } from '@/components/ui/ToastProvider';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSizes, radius } from '@/theme/tokens';
import type { View as NativeView } from 'react-native';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';
import type { ProfileTagMuteAction_tag$key } from './__generated__/ProfileTagMuteAction_tag.graphql';
import type { ProfileTagMuteActionCreateMutation } from './__generated__/ProfileTagMuteActionCreateMutation.graphql';
import type { ProfileTagMuteActionDeleteMutation } from './__generated__/ProfileTagMuteActionDeleteMutation.graphql';
import type { ProfileTagMuteActionDeleteUpdaterQuery } from './__generated__/ProfileTagMuteActionDeleteUpdaterQuery.graphql';
import type { ProfileTagMuteActionRefetchQuery } from './__generated__/ProfileTagMuteActionRefetchQuery.graphql';
import type { ProfileTagMuteActionUpdateMutation } from './__generated__/ProfileTagMuteActionUpdateMutation.graphql';

const hashtagFragment = graphql`
  fragment ProfileTagMuteAction_tag on Hashtag
  @refetchable(queryName: "ProfileTagMuteActionRefetchQuery") {
    id
    name
    viewerMuteRule @catch(to: RESULT) {
      id
      scopes
      decision
      expiresAt
      isActive
      appliesTo(scope: NOTIFICATION)
    }
  }
`;

const createHashtagMuteRuleMutation = graphql`
  mutation ProfileTagMuteActionCreateMutation($input: CreateHashtagMuteRuleInput!) {
    createHashtagMuteRule(input: $input) {
      hashtagMuteRule {
        id
        targetHashtag {
          id
          ...ProfileTagMuteAction_tag
        }
      }
    }
  }
`;

const updateHashtagMuteRuleMutation = graphql`
  mutation ProfileTagMuteActionUpdateMutation($input: UpdateHashtagMuteRuleInput!) {
    updateHashtagMuteRule(input: $input) {
      hashtagMuteRule {
        id
        targetHashtag {
          id
          ...ProfileTagMuteAction_tag
        }
      }
    }
  }
`;

const deleteHashtagMuteRuleMutation = graphql`
  mutation ProfileTagMuteActionDeleteMutation($input: DeleteHashtagMuteRuleInput!) {
    deleteHashtagMuteRule(input: $input) {
      hashtagMuteRuleId @deleteRecord
    }
  }
`;

const deleteHashtagMuteRuleUpdaterQuery = graphql`
  query ProfileTagMuteActionDeleteUpdaterQuery($hashtagId: ID!) @updatable {
    node(id: $hashtagId) {
      ... on Hashtag {
        __typename
        viewerMuteRule {
          id
        }
      }
    }
  }
`;

type Props = Readonly<{ hashtag: ProfileTagMuteAction_tag$key }>;

type PendingIntent = Readonly<{
  muted: boolean;
  title: string;
  message: string;
  confirmLabel: string;
}>;

type CompletionToast = Readonly<{ message: string; tone: 'danger' | 'success' }>;

export function ProfileTagMuteAction({ hashtag }: Props) {
  const [data, refetch] = useRefetchableFragment<
    ProfileTagMuteActionRefetchQuery,
    ProfileTagMuteAction_tag$key
  >(hashtagFragment, hashtag);
  const { selectedProfileId } = useSession();
  const { showToast } = useToast();
  const theme = useTheme();
  const [commitCreate, creating] = useMutation<ProfileTagMuteActionCreateMutation>(
    createHashtagMuteRuleMutation,
  );
  const [commitUpdate, updating] = useMutation<ProfileTagMuteActionUpdateMutation>(
    updateHashtagMuteRuleMutation,
  );
  const [commitDelete, deleting] = useMutation<ProfileTagMuteActionDeleteMutation>(
    deleteHashtagMuteRuleMutation,
  );
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [intent, setIntent] = useState<PendingIntent | null>(null);
  const [completionToast, setCompletionToast] = useState<CompletionToast | null>(null);
  const pending = creating || updating || deleting;
  const cancelRef = useRef<NativeView>(null);
  const focusTriggerRef = useRef<() => void>(() => {});
  const refreshRule = () => {
    if (!selectedProfileId || refreshing) {
      return;
    }

    setRefreshing(true);
    setRefreshFailed(false);
    try {
      refetch(
        {},
        {
          fetchPolicy: 'store-and-network',
          onComplete: (error) => {
            setRefreshing(false);
            setRefreshFailed(Boolean(error));
          },
        },
      );
    } catch {
      setRefreshing(false);
      setRefreshFailed(true);
    }
  };

  if (!selectedProfileId) {
    return null;
  }

  const muteRuleResult = data.viewerMuteRule;
  if (!muteRuleResult.ok || refreshFailed) {
    const targetSize = Math.max(32, getInteractionTargetSize(Platform.OS));
    return (
      <IconButton
        accessibilityLabel={`#${data.name} 알림 상태를 불러오지 못했어요. 다시 시도`}
        accessibilityState={{ busy: refreshing }}
        disabled={refreshing}
        onPress={() => refreshRule()}
        style={styles.trigger}
        targetSize={targetSize}
        testID="profile-tag-mute-retry"
        visualSize={32}
      >
        {refreshing ? (
          <ActivityIndicator color={theme.foregroundSecondary} size="small" />
        ) : (
          <RefreshCw color={theme.foregroundSecondary} size={iconSizes[16]} />
        )}
      </IconButton>
    );
  }

  const rule = muteRuleResult.value;
  const muted = Boolean(rule?.appliesTo);
  const hasNotificationScope = Boolean(rule?.scopes.includes('NOTIFICATION'));
  const hasActiveTemporaryRuleForOtherScopes = Boolean(
    rule?.isActive &&
    rule.expiresAt !== null &&
    rule.expiresAt !== undefined &&
    !hasNotificationScope,
  );
  const tagDisplayName = `#${data.name}`;
  const targetSize = Math.max(32, getInteractionTargetSize(Platform.OS));
  const createIntent: PendingIntent = {
    muted: true,
    title: `${tagDisplayName} 새 알림을 뮤트할까요?`,
    message: `${tagDisplayName} 태그를 프로필에 단 사람에게서 새로 오는 알림을 받지 않아요. 이미 받은 알림은 유지돼요.`,
    confirmLabel: '알림 뮤트',
  };
  const unmuteIntent: PendingIntent = {
    muted: false,
    title: `${tagDisplayName} 새 알림 뮤트를 해제할까요?`,
    message: `${tagDisplayName} 태그를 프로필에 단 사람의 새 알림을 다시 받아요. 이전에 억제된 알림은 복구되지 않아요.`,
    confirmLabel: '뮤트 해제',
  };
  const conflictLabel = '다른 임시 뮤트 규칙이 적용 중';
  const conflictMessage = `${tagDisplayName}에 다른 범위의 임시 뮤트 규칙이 적용 중이에요. 현재 규칙을 보존하며, 만료 후 상태를 새로고침하면 영구 알림 뮤트를 설정할 수 있어요.`;
  const startRequest = (nextMuted: boolean) => {
    if (pending || !selectedProfileId || !intent) {
      return;
    }
    const finish = (status: 'success' | 'error') => {
      setCompletionToast({
        message:
          status === 'success'
            ? `${tagDisplayName} 새 알림 뮤트를 ${nextMuted ? '설정' : '해제'}했어요.`
            : `${tagDisplayName} 새 알림 뮤트 상태를 변경하지 못했어요. 다시 확인해 주세요.`,
        tone: status === 'success' ? 'success' : 'danger',
      });
      if (status === 'error') {
        refreshRule();
      }
      setOpen(false);
    };
    const handleMutationError = () => finish('error');
    const validateMutationResult = (
      targetHashtagId: string | null | undefined,
      errors: ReadonlyArray<{ message: string }> | null | undefined,
    ) => {
      if (errors?.length || targetHashtagId !== data.id) {
        handleMutationError();
        return;
      }
      finish('success');
    };

    if (nextMuted) {
      if (hasActiveTemporaryRuleForOtherScopes) {
        showToast(conflictMessage, { tone: 'danger' });
        setOpen(false);
        return;
      }

      if (rule && rule.isActive) {
        commitUpdate({
          onCompleted: (response, errors) =>
            validateMutationResult(
              response.updateHashtagMuteRule?.hashtagMuteRule?.targetHashtag?.id,
              errors,
            ),
          onError: handleMutationError,
          variables: {
            input: {
              id: rule.id,
              scopes: [...new Set([...rule.scopes, 'NOTIFICATION' as const])],
            },
          },
        });
        return;
      }

      commitCreate({
        onCompleted: (response, errors) =>
          validateMutationResult(
            response.createHashtagMuteRule?.hashtagMuteRule?.targetHashtag?.id,
            errors,
          ),
        onError: handleMutationError,
        variables: {
          input: {
            hashtagId: data.id,
            scopes: ['NOTIFICATION'],
            decision: 'EXCLUDE',
            expiresAt: null,
          },
        },
      });
      return;
    }

    if (!rule || !hasNotificationScope) {
      handleMutationError();
      return;
    }

    const remainingScopes = rule.scopes.filter((scope) => scope !== 'NOTIFICATION');
    if (remainingScopes.length > 0) {
      commitUpdate({
        onCompleted: (response, errors) =>
          validateMutationResult(
            response.updateHashtagMuteRule?.hashtagMuteRule?.targetHashtag?.id,
            errors,
          ),
        onError: handleMutationError,
        variables: { input: { id: rule.id, scopes: remainingScopes } },
      });
      return;
    }

    commitDelete({
      onCompleted: (response, errors) => {
        const deletedId = response.deleteHashtagMuteRule?.hashtagMuteRuleId;
        if (errors?.length || deletedId !== rule.id) {
          handleMutationError();
          return;
        }
        finish('success');
      },
      onError: handleMutationError,
      updater: (store) => {
        // The delete payload only returns the rule ID, so clear the nullable viewer link on the
        // canonical Hashtag with Relay's type-safe updatable query.
        const { updatableData } = store.readUpdatableQuery<ProfileTagMuteActionDeleteUpdaterQuery>(
          deleteHashtagMuteRuleUpdaterQuery,
          { hashtagId: data.id },
        );
        const hashtagRecord = updatableData.node;
        if (hashtagRecord?.__typename === 'Hashtag') {
          hashtagRecord.viewerMuteRule = null;
        }
      },
      variables: { input: { id: rule.id } },
    });
  };

  const activeIntent = muted ? unmuteIntent : createIntent;
  const item: ActionMenuItem = hasActiveTemporaryRuleForOtherScopes
    ? {
        accessibilityLabel: `${tagDisplayName} 알림 뮤트 불가. 다른 범위의 임시 뮤트 규칙이 적용 중이며 기존 규칙은 변경하지 않아요.`,
        icon: BellOff,
        key: 'mute-notification-unavailable',
        label: conflictLabel,
        onSelect: () => {
          showToast(conflictMessage, { tone: 'danger' });
        },
      }
    : {
        icon: muted ? Bell : BellOff,
        key: muted ? 'unmute-notification' : 'mute-notification',
        label: muted ? '새 알림 뮤트 해제' : '새 알림 뮤트',
        onSelect: () => {
          setIntent(activeIntent);
          setOpen(true);
        },
      };

  return (
    <View style={styles.root}>
      <ProfileMoreMenu
        accessibilityLabel={`${tagDisplayName} 알림 뮤트 설정`}
        disabled={pending || refreshing}
        focusTriggerRef={focusTriggerRef}
        items={[item]}
        renderTrigger={({ disabled, expanded, onPress, ref }) => (
          <IconButton
            accessibilityLabel={
              hasActiveTemporaryRuleForOtherScopes
                ? `${tagDisplayName} 새 알림 뮤트 불가. ${conflictLabel}`
                : muted
                  ? `${tagDisplayName} 새 알림 뮤트됨. 설정 변경`
                  : `${tagDisplayName} 새 알림 뮤트 설정`
            }
            accessibilityState={{ busy: pending || refreshing, expanded }}
            aria-expanded={expanded}
            aria-haspopup="menu"
            controlRef={ref}
            disabled={disabled}
            onPress={onPress}
            style={styles.trigger}
            targetSize={targetSize}
            testID="profile-tag-mute-trigger"
            visualSize={32}
          >
            {pending || refreshing ? (
              <ActivityIndicator color={theme.foregroundSecondary} size="small" />
            ) : muted ? (
              <BellOff color={theme.foregroundPrimary} size={iconSizes[16]} />
            ) : (
              <Bell color={theme.foregroundSecondary} size={iconSizes[16]} />
            )}
          </IconButton>
        )}
      />
      <ModalSheet
        dismissDisabled={pending}
        onClose={() => {
          if (!pending) {
            setOpen(false);
          }
        }}
        onDismiss={() => {
          focusTriggerRef.current();
          if (completionToast) {
            showToast(completionToast.message, { tone: completionToast.tone });
            setCompletionToast(null);
          }
        }}
        onShow={() => cancelRef.current?.focus()}
        title={intent?.title ?? activeIntent.title}
        visible={open}
      >
        <ConfirmationContent
          cancelLabel="취소"
          cancelRef={cancelRef}
          confirmLabel={intent?.confirmLabel ?? activeIntent.confirmLabel}
          message={intent?.message ?? activeIntent.message}
          onCancel={() => setOpen(false)}
          onConfirm={() => startRequest(!muted)}
          pending={pending}
        />
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  trigger: { borderRadius: radius.full },
});
