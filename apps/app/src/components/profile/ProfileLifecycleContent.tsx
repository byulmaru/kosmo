import { Check } from 'lucide-react-native';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import { ProfileListItemContent } from './ProfileListItemContent';
import type { Ref } from 'react';

export type ProfileLifecycleProfile = {
  id: string;
  displayName: string;
  relativeHandle: string;
  avatarUri?: string | null;
};

type ConfirmationProps = {
  profile: ProfileLifecycleProfile;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  cancelRef?: Ref<View>;
};

type AcknowledgementProps = {
  acknowledged: boolean;
  onAcknowledgementChange: (checked: boolean) => void;
};

export function ProfileLifecycleIdentity({
  profile,
  deactivated,
}: {
  profile: ProfileLifecycleProfile;
  deactivated: boolean;
}) {
  const theme = useTheme();
  return (
    <ProfileListItemContent
      avatarLabel={profile.displayName}
      avatarUri={profile.avatarUri}
      displayName={profile.displayName}
      identity={
        <View style={styles.identityCopy}>
          <Text style={[textStyles.uiLabelL, { color: theme.foregroundPrimary }]}>
            {profile.displayName}
          </Text>
          <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
            {profile.relativeHandle} · {deactivated ? '비활성' : '활성 프로필'}
          </Text>
        </View>
      }
      style={{ borderColor: theme.borderSubtle, minHeight: 72 }}
    />
  );
}

function LifecycleAcknowledgement({
  acknowledged,
  disabled,
  label,
  onAcknowledgementChange,
}: AcknowledgementProps & { disabled: boolean; label: string }) {
  const theme = useTheme();
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

export function ProfileLifecycleDeleteConfirmContent({
  acknowledged,
  cancelRef,
  onAcknowledgementChange,
  onCancel,
  onConfirm,
  pending,
  profile,
}: ConfirmationProps & AcknowledgementProps) {
  const theme = useTheme();
  return (
    <View style={styles.confirmation}>
      <ProfileLifecycleIdentity deactivated profile={profile} />
      <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
        삭제하면 프로필과 관련 데이터는 복구할 수 없습니다. 이 작업은 되돌릴 수 없습니다.
      </Text>
      <LifecycleAcknowledgement
        acknowledged={acknowledged}
        disabled={pending}
        label="복구할 수 없음을 이해했으며 이 프로필을 영구 삭제합니다."
        onAcknowledgementChange={onAcknowledgementChange}
      />
      <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
        본인 확인은 id.byulmaru.co로 이동해 진행합니다.
      </Text>
      <View style={styles.deleteActions}>
        <Button
          controlRef={cancelRef}
          disabled={pending}
          onPress={onCancel}
          style={styles.deleteAction}
          tone="secondary"
        >
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
          영구 삭제
        </Button>
      </View>
    </View>
  );
}

export function ProfileLifecycleReactivateContent({
  cancelRef,
  onCancel,
  onConfirm,
  pending,
  profile,
}: ConfirmationProps) {
  const theme = useTheme();
  return (
    <View style={styles.confirmation}>
      <ProfileLifecycleIdentity deactivated profile={profile} />
      <ConfirmationContent
        cancelLabel="취소"
        cancelRef={cancelRef}
        confirmLabel="다시 활성화"
        message="다시 활성화하면 이 프로필을 이전처럼 사용할 수 있어요."
        onCancel={onCancel}
        onConfirm={onConfirm}
        pending={pending}
      >
        <View style={styles.identityCopy}>
          <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
            • 프로필과 게시물이 다시 공개됩니다.
          </Text>
          <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
            • 게시·팔로우 등 모든 활동을 다시 할 수 있습니다.
          </Text>
        </View>
        <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
          계속하면 본인 확인 화면으로 이동합니다.
        </Text>
      </ConfirmationContent>
    </View>
  );
}

export function ProfileLifecycleDeactivateContent({
  acknowledged,
  onAcknowledgementChange,
  onConfirm,
  pending,
  profile,
}: Omit<ConfirmationProps, 'cancelRef' | 'onCancel'> & AcknowledgementProps) {
  const theme = useTheme();
  return (
    <View style={styles.deactivation}>
      <View style={styles.impacts}>
        <ProfileLifecycleIdentity deactivated={false} profile={profile} />
        <Text
          accessibilityRole="header"
          style={[textStyles.uiHeadingS, { color: theme.foregroundPrimary }]}
        >
          프로필을 비활성화할까요?
        </Text>
        {[
          ['프로필이 공개되지 않아요', '프로필과 게시물이 다른 사람에게 표시되지 않습니다.'],
          ['활동할 수 없어요', '게시, 팔로우 및 다른 상호작용을 할 수 없습니다.'],
          ['다시 활성화할 수 있어요', '일정 기간 안에 이 프로필을 다시 활성화할 수 있습니다.'],
        ].map(([title, description]) => (
          <View key={title} style={styles.identityCopy}>
            <Text style={[textStyles.uiLabelL, { color: theme.foregroundPrimary }]}>{title}</Text>
            <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
              {description}
            </Text>
          </View>
        ))}
        <Text style={[textStyles.uiLabelL, { color: theme.feedbackDangerBase }]}>
          기간이 지나면 프로필이 영구 삭제될 수 있습니다.
        </Text>
      </View>
      <View style={styles.confirmation}>
        <LifecycleAcknowledgement
          acknowledged={acknowledged}
          disabled={pending}
          label="위 영향을 모두 확인했습니다."
          onAcknowledgementChange={onAcknowledgementChange}
        />
        <View style={styles.deactivateTarget}>
          <Button
            aria-busy={pending || undefined}
            disabled={pending ? undefined : !acknowledged}
            loading={pending}
            onPress={() => {
              if (acknowledged && !pending) {
                onConfirm();
              }
            }}
            hitSlop={Platform.OS === 'web' ? undefined : { top: 4, bottom: 4 }}
            style={styles.deactivateAction}
            tone="danger"
          >
            비활성화
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  acknowledgement: { alignItems: 'center', flexDirection: 'row', gap: space[8], minHeight: 48 },
  acknowledgementLabel: { ...textStyles.uiCopyM, flex: 1 },
  checkbox: { alignItems: 'center', height: 32, justifyContent: 'center', width: 32 },
  confirmation: { gap: space[12] },
  deactivateAction: { width: '100%' },
  deactivateTarget: { justifyContent: 'center', minHeight: 48 },
  deactivation: { flex: 1, gap: space[32], justifyContent: 'space-between' },
  deleteAction: { flex: 1, height: 48, minWidth: 0 },
  deleteActions: { flexDirection: 'row', gap: space[8] },
  identityCopy: { gap: space[4] },
  impacts: { gap: space[16] },
  indicator: {
    alignItems: 'center',
    borderRadius: radius[4],
    borderWidth: borderWidths[1],
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
});
