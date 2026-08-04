import { PostVisibility } from '@kosmo/core/enums';
import { GlobeIcon, LockIcon, MoonIcon } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useMutation, useRelayEnvironment } from 'react-relay';
import { Button } from '@/components/ui/Button';
import { useRelayEnvironmentGeneration } from '@/relay/RelayEnvironmentBoundary';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import {
  isProfileDefaultVisibilityDirty,
  resolveProfileDefaultVisibility,
} from './profileDefaultPostVisibilityState';
import type {
  ProfileDefaultPostVisibilityControl_profile$data,
  ProfileDefaultPostVisibilityControl_profile$key,
} from './__generated__/ProfileDefaultPostVisibilityControl_profile.graphql';
import type { ProfileDefaultPostVisibilityControlMutation } from './__generated__/ProfileDefaultPostVisibilityControlMutation.graphql';

const options = [
  {
    description: '모두가 볼 수 있어요.',
    icon: GlobeIcon,
    label: '공개',
    value: PostVisibility.PUBLIC,
  },
  {
    description: '모두가 볼 수 있지만 검색되지 않아요.',
    icon: MoonIcon,
    label: '조용한 공개',
    value: PostVisibility.UNLISTED,
  },
  {
    description: '팔로워만 볼 수 있어요.',
    icon: LockIcon,
    label: '팔로워만',
    value: PostVisibility.FOLLOWERS,
  },
] as const;

const ProfileFragment = graphql`
  fragment ProfileDefaultPostVisibilityControl_profile on Profile {
    id
    displayName
    relativeHandle
    defaultPostVisibility
  }
`;

const UpdateMutation = graphql`
  mutation ProfileDefaultPostVisibilityControlMutation($input: UpdateProfileInput!) {
    updateProfile(input: $input) {
      profile {
        id
        defaultPostVisibility
      }
    }
  }
`;

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export type ProfileDefaultPostVisibilityControlProps = {
  editable?: boolean;
  profile: ProfileDefaultPostVisibilityControl_profile$key;
};

export function ProfileDefaultPostVisibilityControl({
  editable = true,
  profile: profileKey,
}: ProfileDefaultPostVisibilityControlProps) {
  const profile = useFragment(ProfileFragment, profileKey);
  const environment = useRelayEnvironment();
  const environmentGenerationRef = useRelayEnvironmentGeneration();
  const environmentRef = useRef(environment);
  const contextGenerationRef = useRef(0);
  if (environmentRef.current !== environment) {
    environmentRef.current = environment;
    contextGenerationRef.current += 1;
  }

  return (
    <ProfileDefaultPostVisibilityControlContents
      editable={editable}
      key={`${profile.id}:${contextGenerationRef.current}:${environmentGenerationRef?.current ?? 0}`}
      profile={profile}
    />
  );
}

function ProfileDefaultPostVisibilityControlContents({
  editable,
  profile,
}: {
  editable: boolean;
  profile: ProfileDefaultPostVisibilityControl_profile$data;
}) {
  const theme = useTheme();
  const environmentGenerationRef = useRelayEnvironmentGeneration();

  const savedFromRelay = resolveProfileDefaultVisibility(profile.defaultPostVisibility);
  const [saved, setSaved] = useState(savedFromRelay);
  const [selected, setSelected] = useState(savedFromRelay);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [commit] = useMutation<ProfileDefaultPostVisibilityControlMutation>(UpdateMutation);
  const dirty = isProfileDefaultVisibilityDirty(saved, selected);
  const mountedRef = useRef(true);
  const saveRequestIdRef = useRef(0);
  const saveInFlightRef = useRef<number | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const save = useCallback(() => {
    if (!editable || !dirty || saveInFlightRef.current !== null) {
      return;
    }
    const environmentGeneration = environmentGenerationRef?.current;
    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    saveInFlightRef.current = requestId;
    setSaveState({ kind: 'saving' });
    commit({
      variables: { input: { defaultPostVisibility: selected } },
      onCompleted: (response, errors) => {
        if (
          !mountedRef.current ||
          saveInFlightRef.current !== requestId ||
          environmentGenerationRef?.current !== environmentGeneration
        ) {
          if (saveInFlightRef.current === requestId) {
            saveInFlightRef.current = null;
          }
          return;
        }
        saveInFlightRef.current = null;
        if (errors?.length || !response.updateProfile.profile) {
          setSaveState({ kind: 'error', message: '기본 공개 범위를 저장하지 못했어요.' });
          return;
        }
        const next = resolveProfileDefaultVisibility(
          response.updateProfile.profile.defaultPostVisibility,
        );
        setSaved(next);
        setSelected(next);
        setSaveState({ kind: 'success' });
      },
      onError: () => {
        if (
          !mountedRef.current ||
          saveInFlightRef.current !== requestId ||
          environmentGenerationRef?.current !== environmentGeneration
        ) {
          if (saveInFlightRef.current === requestId) {
            saveInFlightRef.current = null;
          }
          return;
        }
        saveInFlightRef.current = null;
        setSaveState({ kind: 'error', message: '기본 공개 범위를 저장하지 못했어요.' });
      },
    });
  }, [commit, dirty, editable, environmentGenerationRef, selected]);

  const label = `Kosmo 내부 Profile ${profile.displayName} ${profile.relativeHandle} 기본 게시 공개 범위`;
  const saving = saveState.kind === 'saving';

  return (
    <View
      accessibilityLabel={label}
      style={[styles.root, { backgroundColor: theme.card, borderColor: theme.border }]}
      testID="profile-default-post-visibility-control"
    >
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        기본 게시 공개 범위
      </Text>
      <View accessibilityLabel={`현재 Profile ${profile.displayName} ${profile.relativeHandle}`}>
        <Text style={[styles.target, { color: theme.text }]}>{profile.displayName}</Text>
        <Text style={[styles.targetHandle, { color: theme.textSecondary }]}>
          {profile.relativeHandle}
        </Text>
      </View>
      <View accessibilityRole="radiogroup" style={styles.options}>
        {options.map((option) => {
          const selectedOption = option.value === selected;
          const Icon = option.icon;
          return (
            <Pressable
              aria-checked={selectedOption}
              accessibilityLabel={`${option.label}: ${option.description}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedOption, disabled: !editable || saving }}
              disabled={!editable || saving}
              key={option.value}
              onPress={() => {
                setSelected(option.value);
                setSaveState({ kind: 'idle' });
              }}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: selectedOption
                    ? 'rgba(252, 231, 154, 0.45)'
                    : pressed
                      ? theme.surface
                      : 'transparent',
                  borderColor: selectedOption ? theme.focus : theme.border,
                  opacity: editable ? 1 : 0.6,
                },
              ]}
            >
              <Icon color={theme.textSecondary} size={18} strokeWidth={2} />
              <View style={styles.copy}>
                <Text style={[styles.optionLabel, { color: theme.text }]}>{option.label}</Text>
                <Text style={[styles.description, { color: theme.textSecondary }]}>
                  {option.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {saveState.kind === 'error' ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
          {saveState.message}
        </Text>
      ) : null}
      {saveState.kind === 'success' ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.success, { color: theme.textSecondary }]}
        >
          저장했어요.
        </Text>
      ) : null}
      {editable ? (
        <Button
          accessibilityLabel="기본 게시 공개 범위 저장"
          accessibilityState={{ busy: saving, disabled: !dirty }}
          disabled={!dirty}
          loading={saving}
          loadingText="저장 중"
          onPress={save}
          style={styles.save}
        >
          저장
        </Button>
      ) : (
        <Text style={[styles.memberNote, { color: theme.textSecondary }]}>
          Profile Member는 조회만 할 수 있어요.
        </Text>
      )}
      {saveState.kind === 'error' ? (
        <Button onPress={save} tone="secondary" disabled={saving || !dirty}>
          다시 시도
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: radii.md, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  title: { fontFamily: 'SUIT', fontWeight: '700', ...typography.lg },
  target: { ...typography.sm },
  targetHandle: { ...typography.xsm },
  options: { gap: spacing.sm },
  option: {
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  copy: { flex: 1, gap: spacing.xs },
  optionLabel: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
  description: { ...typography.sm },
  error: { ...typography.sm },
  success: { ...typography.sm },
  memberNote: { ...typography.sm },
  save: { alignSelf: 'flex-start' },
});
