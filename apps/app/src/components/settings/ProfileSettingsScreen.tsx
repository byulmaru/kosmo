import { ArrowLeft, ChevronRight } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { StateView } from '@/components/ui/StateView';
import { ToastProvider, useToast } from '@/components/ui/ToastProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, space, textStyles } from '@/theme/tokens';
import {
  ProfileLifecycleDeactivateContent,
  ProfileLifecycleDeleteConfirmContent,
  ProfileLifecycleIdentity,
  ProfileLifecycleReactivateContent,
} from '../profile/ProfileLifecycleContent';
import type { ReactNode, Ref } from 'react';
import type { ProfileLifecycleProfile } from '../profile/ProfileLifecycleContent';

export type ProfileLifecycleAction = 'deactivate' | 'reactivate' | 'delete';
export type ProfileLifecycleState = {
  action: ProfileLifecycleAction;
  phase: 'entry' | 'idle' | 'pending' | 'error' | 'success';
};
export type ProfileSettingsLifecycle = {
  state: ProfileLifecycleState;
  onAction: (action: ProfileLifecycleAction) => void;
  onCancel: () => void;
  onConfirm: (action: ProfileLifecycleAction) => void;
  onRetry: (action: ProfileLifecycleAction) => void;
};

type Props = {
  profile: ProfileLifecycleProfile;
  children: ReactNode;
  lifecycle?: ProfileSettingsLifecycle;
};

/** Controlled presentation only: the caller owns request results, authentication and navigation. */
export function ProfileSettingsScreen(props: Props) {
  return <ProfileSettingsSurface key={props.profile.id} {...props} />;
}

function ProfileSettingsSurface({ profile, children, lifecycle }: Props) {
  const state = lifecycle?.state ?? { action: 'deactivate', phase: 'entry' };
  const { onAction, onCancel, onConfirm, onRetry } = lifecycle ?? {};
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const { action, phase } = state;
  const confirming = phase === 'idle' || phase === 'pending' || phase === 'error';
  const pending = phase === 'pending';
  const inlineConfirmation = confirming && action === 'deactivate';
  const modalOpen = confirming && action !== 'deactivate';
  const deleted = phase === 'success' && action === 'delete';
  const deactivated = phase === 'success' ? action === 'deactivate' : action !== 'deactivate';
  const headingRef = useRef<View>(null);
  const deactivateRef = useRef<View>(null);
  const reactivateRef = useRef<View>(null);
  const deleteRef = useRef<View>(null);
  const cancelRef = useRef<View>(null);
  const previouslyInline = useRef(false);
  const focusDestination = () => {
    if (phase === 'success') {
      headingRef.current?.focus();
    } else {
      ({ deactivate: deactivateRef, reactivate: reactivateRef, delete: deleteRef })[
        action
      ].current?.focus();
    }
  };
  useEffect(() => {
    if (inlineConfirmation && !previouslyInline.current) {
      headingRef.current?.focus();
    }
    if (!inlineConfirmation && previouslyInline.current) {
      focusDestination();
    }
    previouslyInline.current = inlineConfirmation;
  });
  const cancel = () => {
    if (confirming && !pending) {
      onCancel?.();
    }
  };
  const confirm = () => {
    if (confirming && !pending) {
      (phase === 'error' ? onRetry : onConfirm)?.(action);
    }
  };
  const selectAction = (nextAction: ProfileLifecycleAction) => {
    if (!confirming) {
      onAction?.(nextAction);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundCanvas }]}>
      <View ref={headingRef} tabIndex={-1}>
        <PageHeader
          leading={
            inlineConfirmation ? (
              <IconButton
                accessibilityLabel="취소하고 프로필 설정으로 돌아가기"
                disabled={pending}
                onPress={cancel}
                targetSize={48}
                visualSize={44}
              >
                <ArrowLeft color={theme.foregroundPrimary} size={iconSizes[24]} />
              </IconButton>
            ) : undefined
          }
          title={inlineConfirmation ? '비활성화' : '프로필 설정'}
        />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {inlineConfirmation ? (
          <LifecycleConfirmation
            key={`${profile.id}:${action}`}
            cancelRef={cancelRef}
            onCancel={cancel}
            onConfirm={confirm}
            profile={profile}
            state={state}
          />
        ) : deleted ? (
          <StateView
            title="프로필을 삭제했어요"
            description="삭제한 프로필은 복구할 수 없습니다."
          />
        ) : (
          <>
            <ProfileLifecycleIdentity deactivated={deactivated} profile={profile} />
            {deactivated ? (
              <>
                <Text style={[textStyles.uiLabelM, { color: theme.foregroundSecondary }]}>
                  프로필 상태
                </Text>
                <View style={[styles.status, { borderColor: theme.borderSubtle }]}>
                  <Text style={[textStyles.uiLabelL, { color: theme.foregroundPrimary }]}>
                    이 프로필은 비활성 상태예요
                  </Text>
                  <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
                    게시하거나 다른 사람과 상호작용할 수 없고, 프로필도 공개되지 않습니다.
                  </Text>
                  <View style={styles.buttonTarget}>
                    <Button
                      controlRef={reactivateRef}
                      onPress={() => selectAction('reactivate')}
                      style={styles.fullWidth}
                      tone="primary"
                      hitSlop={Platform.OS === 'web' ? undefined : 4}
                    >
                      다시 활성화
                    </Button>
                  </View>
                </View>
                <Text style={[textStyles.uiLabelM, { color: theme.foregroundSecondary }]}>
                  Danger zone
                </Text>
                <Pressable
                  accessibilityRole="button"
                  ref={deleteRef}
                  onPress={() => selectAction('delete')}
                  style={[styles.actionRow, { borderColor: theme.borderSubtle }]}
                >
                  <View style={styles.rowCopy}>
                    <Text style={[textStyles.uiLabelL, { color: theme.feedbackDangerBase }]}>
                      영구 삭제
                    </Text>
                    <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
                      프로필과 관련된 데이터를 복구할 수 없게 삭제합니다.
                    </Text>
                  </View>
                  <ChevronRight
                    aria-hidden
                    color={theme.foregroundSecondary}
                    size={iconSizes[24]}
                  />
                </Pressable>
              </>
            ) : (
              <>
                {children}
                {lifecycle ? (
                  <>
                    <Text style={[textStyles.uiLabelM, { color: theme.foregroundSecondary }]}>
                      프로필 관리
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      ref={deactivateRef}
                      onPress={() => selectAction('deactivate')}
                      style={[styles.actionRow, { borderColor: theme.borderSubtle }]}
                    >
                      <View style={styles.rowCopy}>
                        <Text style={[textStyles.uiLabelL, { color: theme.feedbackDangerBase }]}>
                          프로필 비활성화
                        </Text>
                        <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
                          프로필 활동과 공개를 일시적으로 중지합니다.
                        </Text>
                      </View>
                      <ChevronRight
                        aria-hidden
                        color={theme.foregroundSecondary}
                        size={iconSizes[24]}
                      />
                    </Pressable>
                  </>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
      <LifecycleFeedback
        action={action}
        phase={action === 'deactivate' || phase === 'success' ? phase : 'entry'}
      />
      <ModalSheet
        dismissDisabled={!confirming || pending}
        onClose={cancel}
        onDismiss={focusDestination}
        onShow={() => cancelRef.current?.focus()}
        role={action === 'delete' ? 'alertdialog' : 'dialog'}
        title={action === 'delete' ? '프로필을 영구 삭제할까요?' : '프로필을 다시 활성화할까요?'}
        visible={modalOpen}
      >
        {/* Native Modal is a separate presentation layer; its error announcement stays inside it. */}
        <ToastProvider>
          <ScrollView
            style={{ maxHeight: Math.max(0, height - 160) }}
            contentContainerStyle={styles.modalBody}
          >
            {modalOpen ? (
              <LifecycleConfirmation
                key={`${profile.id}:${action}`}
                cancelRef={cancelRef}
                onCancel={cancel}
                onConfirm={confirm}
                profile={profile}
                state={state}
              />
            ) : null}
          </ScrollView>
          <LifecycleFeedback action={action} phase={modalOpen ? phase : 'entry'} />
        </ToastProvider>
      </ModalSheet>
    </View>
  );
}

function LifecycleConfirmation({
  profile,
  state,
  onConfirm,
  onCancel,
  cancelRef,
}: Pick<Props, 'profile'> &
  Pick<ProfileSettingsLifecycle, 'state' | 'onCancel'> & {
    onConfirm: () => void;
    cancelRef: Ref<View>;
  }) {
  const [acknowledged, setAcknowledged] = useState(
    state.phase === 'pending' || state.phase === 'error',
  );
  const pending = state.phase === 'pending';
  const props = { profile, pending, onConfirm, onCancel, cancelRef };
  const acknowledgement = {
    acknowledged: pending || acknowledged,
    onAcknowledgementChange: setAcknowledged,
  };
  if (state.action === 'reactivate') {
    return <ProfileLifecycleReactivateContent {...props} />;
  }
  if (state.action === 'delete') {
    return <ProfileLifecycleDeleteConfirmContent {...props} {...acknowledgement} />;
  }
  return <ProfileLifecycleDeactivateContent {...props} {...acknowledgement} />;
}

function LifecycleFeedback({ action, phase }: ProfileLifecycleState) {
  const { showToast } = useToast();
  useEffect(() => {
    if (phase !== 'error' && phase !== 'success') {
      return;
    }
    const message =
      phase === 'error'
        ? {
            deactivate: '프로필을 비활성화하지 못했어요. 다시 시도해주세요.',
            reactivate: '프로필을 다시 활성화하지 못했어요. 다시 시도해주세요.',
            delete: '프로필을 삭제하지 못했어요. 다시 시도해주세요.',
          }[action]
        : {
            deactivate: '프로필을 비활성화했어요.',
            reactivate: '프로필을 다시 활성화했어요.',
            delete: '프로필을 삭제했어요.',
          }[action];
    return showToast(message, { tone: phase === 'error' ? 'danger' : 'success' });
  }, [action, phase, showToast]);
  return null;
}

const styles = StyleSheet.create({
  actionRow: {
    alignItems: 'center',
    borderBottomWidth: borderWidths[1],
    flexDirection: 'row',
    gap: space[12],
    minHeight: 96,
    padding: space[16],
  },
  body: { flexGrow: 1, gap: space[8], padding: space[16] },
  buttonTarget: { justifyContent: 'center', minHeight: 48, width: '100%' },
  fullWidth: { width: '100%' },
  modalBody: { paddingBottom: space[4] },
  root: { flex: 1, minHeight: 580, width: '100%' },
  rowCopy: { flex: 1, gap: space[4] },
  status: { borderBottomWidth: borderWidths[1], gap: space[12], padding: space[16] },
});
