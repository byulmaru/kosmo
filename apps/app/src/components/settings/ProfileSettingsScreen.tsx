import { ArrowLeft, Check, ChevronRight } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import { ProfileListItemContent } from '../profile/ProfileListItemContent';
import type { ReactNode, Ref } from 'react';

type ProfileSettingsProfile = {
  id: string;
  displayName: string;
  relativeHandle: string;
  avatarUri?: string | null;
};

type ProfileSettingsDeletion = {
  phase: 'entry' | 'idle' | 'pending' | 'error';
  onStart: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

type Props = {
  embedded?: boolean;
  profile: ProfileSettingsProfile;
  children: ReactNode;
  identityAction?: ReactNode;
  deletion?: ProfileSettingsDeletion;
};

/** Controlled presentation only: the caller owns request results, authentication and navigation. */
export function ProfileSettingsScreen(props: Props) {
  return <ProfileSettingsSurface key={props.profile.id} {...props} />;
}

function ProfileSettingsSurface({
  embedded = false,
  identityAction,
  profile,
  children,
  deletion,
}: Props) {
  const theme = useTheme();
  const phase = deletion?.phase ?? 'entry';
  const confirming = deletion !== undefined && phase !== 'entry';
  const pending = phase === 'pending';
  const headingRef = useRef<View>(null);
  const deleteRef = useRef<View>(null);
  const previouslyConfirming = useRef(false);
  useEffect(() => {
    if (confirming && !previouslyConfirming.current) {
      headingRef.current?.focus();
    }
    if (!confirming && previouslyConfirming.current) {
      deleteRef.current?.focus();
    }
    previouslyConfirming.current = confirming;
  }, [confirming]);
  const cancel = () => {
    if (confirming && !pending) {
      deletion?.onCancel();
    }
  };
  const confirm = () => {
    if (confirming && !pending) {
      deletion?.onConfirm();
    }
  };
  const start = () => {
    if (deletion && !confirming) {
      deletion.onStart();
    }
  };

  const content = confirming ? (
    <ProfileDeleteConfirmation
      embedded={embedded}
      onCancel={cancel}
      onConfirm={confirm}
      phase={phase}
      profile={profile}
      headingRef={embedded ? headingRef : undefined}
    />
  ) : (
    <>
      <ProfileListItemContent
        avatarLabel={profile.displayName}
        avatarUri={profile.avatarUri}
        displayName={profile.displayName}
        relativeHandle={profile.relativeHandle}
        style={{ borderColor: theme.borderSubtle, minHeight: 72 }}
      >
        {identityAction}
      </ProfileListItemContent>
      {children}
      {deletion ? (
        <>
          <Text style={[textStyles.uiLabelM, { color: theme.foregroundSecondary }]}>
            프로필 관리
          </Text>
          <Pressable
            accessibilityRole="button"
            ref={deleteRef}
            onPress={start}
            style={({ pressed }) => [
              styles.actionRow,
              {
                backgroundColor: pressed ? theme.statePressed : undefined,
                borderColor: theme.borderSubtle,
              },
              Platform.OS === 'web'
                ? { outlineColor: theme.stateFocusRing, outlineOffset: 2 }
                : undefined,
            ]}
          >
            <Text style={[textStyles.uiLabelL, { color: theme.feedbackDangerBase, flex: 1 }]}>
              프로필 삭제
            </Text>
            <ChevronRight aria-hidden color={theme.foregroundSecondary} size={iconSizes[24]} />
          </Pressable>
        </>
      ) : null}
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundCanvas }]}>
      {embedded ? null : (
        <View ref={headingRef} tabIndex={-1}>
          <PageHeader
            leading={
              confirming ? (
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
            title={confirming ? '프로필 삭제' : '프로필 설정'}
          />
        </View>
      )}
      {embedded ? (
        <View style={styles.body}>{content}</View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>{content}</ScrollView>
      )}
    </View>
  );
}

function ProfileDeleteConfirmation({
  embedded,
  headingRef,
  profile,
  phase,
  onConfirm,
  onCancel,
}: Pick<Props, 'profile'> & {
  embedded: boolean;
  headingRef?: Ref<View>;
  phase: ProfileSettingsDeletion['phase'];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(phase === 'pending' || phase === 'error');
  const pending = phase === 'pending';
  const theme = useTheme();
  const heading = (
    <Text accessibilityRole="header" style={[styles.heading, { color: theme.foregroundPrimary }]}>
      프로필을 삭제할까요?
    </Text>
  );
  return (
    <View style={styles.confirmation}>
      {embedded ? (
        <View ref={headingRef} tabIndex={-1}>
          {heading}
        </View>
      ) : (
        heading
      )}
      <ProfileListItemContent
        avatarLabel={profile.displayName}
        avatarUri={profile.avatarUri}
        displayName={profile.displayName}
        relativeHandle={profile.relativeHandle}
        style={{ borderColor: theme.borderSubtle, minHeight: 72 }}
      />
      <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
        삭제한 프로필은 복구할 수 없습니다.
      </Text>
      {phase === 'error' ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.feedbackDangerBase }]}>
          프로필을 삭제하지 못했어요. 다시 시도해주세요.
        </Text>
      ) : null}
      <ProfileDeleteAcknowledgement
        acknowledged={pending || acknowledged}
        disabled={pending}
        onAcknowledgementChange={setAcknowledged}
      />
      <View style={styles.actionButtons}>
        <Button disabled={pending} onPress={onCancel} style={styles.deleteAction} tone="secondary">
          취소
        </Button>
        <Button
          aria-busy={pending || undefined}
          disabled={pending ? undefined : !acknowledged}
          loading={pending}
          onPress={() => {
            if (acknowledged && !pending) {
              onConfirm();
            }
          }}
          style={styles.deleteAction}
          tone="danger"
        >
          {phase === 'error' ? '다시 시도' : '프로필 삭제'}
        </Button>
      </View>
    </View>
  );
}

function ProfileDeleteAcknowledgement({
  acknowledged,
  disabled,
  onAcknowledgementChange,
}: {
  acknowledged: boolean;
  disabled: boolean;
  onAcknowledgementChange: (checked: boolean) => void;
}) {
  const theme = useTheme();
  const label = '프로필을 복구할 수 없음을 확인했습니다.';
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: acknowledged, disabled }}
      aria-checked={acknowledged}
      aria-disabled={disabled}
      disabled={disabled}
      {...(Platform.OS === 'web'
        ? {
            onKeyDown: (event: { key: string; repeat: boolean; preventDefault: () => void }) => {
              if (event.key === ' ') {
                event.preventDefault();
                if (!disabled && !event.repeat) {
                  onAcknowledgementChange(!acknowledged);
                }
              }
            },
          }
        : undefined)}
      onPress={() => {
        if (!disabled) {
          onAcknowledgementChange(!acknowledged);
        }
      }}
      style={({ pressed }) => [
        styles.acknowledgement,
        { backgroundColor: pressed ? theme.statePressed : undefined },
        Platform.OS === 'web'
          ? { outlineColor: theme.stateFocusRing, outlineOffset: 2 }
          : undefined,
      ]}
    >
      <View aria-hidden importantForAccessibility="no-hide-descendants" style={styles.checkbox}>
        <View
          style={[
            styles.indicator,
            {
              backgroundColor: disabled
                ? theme.stateDisabledSurface
                : acknowledged
                  ? theme.actionPrimaryBase
                  : theme.backgroundSurface,
              borderColor: acknowledged ? 'transparent' : theme.borderStrong,
            },
          ]}
        >
          {acknowledged ? (
            <Check
              color={disabled ? theme.stateDisabledForeground : theme.actionPrimaryOnBase}
              size={iconSizes[20]}
            />
          ) : null}
        </View>
      </View>
      <Text style={[styles.acknowledgementLabel, { color: theme.foregroundSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    alignItems: 'center',
    borderBottomWidth: borderWidths[1],
    flexDirection: 'row',
    gap: space[12],
    minHeight: 64,
    padding: space[16],
  },
  acknowledgement: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[8],
    minHeight: 48,
  },
  acknowledgementLabel: { ...textStyles.uiCopyM, flex: 1 },
  actionButtons: { flexDirection: 'row', gap: space[8] },
  body: { flexGrow: 1, gap: space[8], padding: space[16] },
  checkbox: { alignItems: 'center', height: 32, justifyContent: 'center', width: 32 },
  confirmation: { gap: space[12] },
  deleteAction: { flex: 1, height: 48, minWidth: 0 },
  error: textStyles.uiCopyM,
  heading: textStyles.uiHeadingS,
  indicator: {
    alignItems: 'center',
    borderRadius: radius[4],
    borderWidth: borderWidths[1],
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  root: { flex: 1, minHeight: 580, width: '100%' },
});
