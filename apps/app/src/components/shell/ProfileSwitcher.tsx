import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { ProfileSwitcher_query$key } from './__generated__/ProfileSwitcher_query.graphql';
import type { ProfileSwitcherCreateProfileMutation } from './__generated__/ProfileSwitcherCreateProfileMutation.graphql';
import type { ProfileSwitcherSelectProfileMutation } from './__generated__/ProfileSwitcherSelectProfileMutation.graphql';

const ProfileSwitcherFragment = graphql`
  fragment ProfileSwitcher_query on Query {
    currentSession {
      selectedProfile {
        id
        handle
        relativeHandle
        displayName
      }
    }
    me {
      id
      profiles {
        id
        handle
        relativeHandle
        displayName
      }
    }
  }
`;

const SelectProfileMutation = graphql`
  mutation ProfileSwitcherSelectProfileMutation($id: ID!) {
    selectProfile(input: { id: $id }) {
      profile {
        id
        handle
        relativeHandle
        displayName
      }
      session {
        id
        selectedProfile {
          id
        }
      }
    }
  }
`;

const CreateProfileMutation = graphql`
  mutation ProfileSwitcherCreateProfileMutation($handle: String!) {
    createProfile(input: { handle: $handle }) {
      account {
        id
        profiles {
          id
          handle
          relativeHandle
          displayName
        }
      }
      profile {
        id
        handle
        relativeHandle
        displayName
      }
    }
  }
`;

type Props = {
  compact?: boolean;
  query: ProfileSwitcher_query$key;
};

export function ProfileSwitcher({ compact = false, query }: Props) {
  const theme = useTheme();
  const data = useFragment(ProfileSwitcherFragment, query);
  const { resetActor } = useRelayActor();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [commitSelect, selecting] =
    useMutation<ProfileSwitcherSelectProfileMutation>(SelectProfileMutation);
  const [commitCreate, creatingProfile] =
    useMutation<ProfileSwitcherCreateProfileMutation>(CreateProfileMutation);
  const active = data.currentSession?.selectedProfile ?? null;
  const profiles = data.me?.profiles ?? [];
  const busy = selecting || creatingProfile;

  const selectProfile = (id: string) => {
    setError(null);
    commitSelect({
      variables: { id },
      onCompleted: (response) => {
        setOpen(false);
        resetActor(response.selectProfile.session.selectedProfile?.id ?? id);
      },
      onError: (cause) => setError(cause.message || '프로필을 전환하지 못했습니다.'),
    });
  };

  const createProfile = () => {
    const normalized = handle.trim().replace(/^@/, '');

    if (!/^[A-Za-z0-9_]+$/.test(normalized)) {
      setError('영문, 숫자, 밑줄(_)만 사용할 수 있어요.');
      return;
    }

    setError(null);
    commitCreate({
      variables: { handle: normalized },
      onCompleted: (response) => {
        setHandle('');
        setCreating(false);
        selectProfile(response.createProfile.profile.id);
      },
      onError: (cause) => setError(cause.message || '프로필을 생성하지 못했습니다.'),
    });
  };

  return (
    <>
      <Pressable
        accessibilityLabel="프로필 목록"
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, { opacity: pressed ? 0.65 : 1 }]}
      >
        <Avatar label={active?.displayName ?? '프로필'} size={compact ? 40 : 48} />
        {!compact ? (
          <View style={styles.triggerLabel}>
            <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>
              {active?.displayName ?? (profiles.length ? '프로필 선택' : '프로필 만들기')}
            </Text>
            <Text numberOfLines={1} style={[styles.handle, { color: theme.textSecondary }]}>
              {active?.relativeHandle ?? '프로필을 선택해 주세요'}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <Modal
        accessibilityLabel="프로필 전환"
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        role="dialog"
        transparent
        visible={open}
      >
        <Pressable onPress={() => setOpen(false)} style={styles.backdrop}>
          <Pressable
            accessibilityLabel="프로필 전환"
            accessibilityViewIsModal
            onPress={(event) => event.stopPropagation()}
            role="dialog"
            style={[styles.modal, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Text style={[styles.heading, { color: theme.text }]}>프로필 전환</Text>
            {profiles.map((profile) => {
              const selected = active?.id === profile.id;
              return (
                <Pressable
                  aria-checked={selected}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: busy }}
                  disabled={busy}
                  key={profile.id}
                  onPress={() => selectProfile(profile.id)}
                  style={[
                    styles.profile,
                    { backgroundColor: selected ? theme.surface : 'transparent' },
                  ]}
                >
                  <Avatar label={profile.displayName} size={40} />
                  <View style={styles.profileLabel}>
                    <Text style={[styles.name, { color: theme.text }]}>{profile.displayName}</Text>
                    <Text style={[styles.handle, { color: theme.textSecondary }]}>
                      {profile.relativeHandle}
                    </Text>
                  </View>
                  {selected ? <Text style={{ color: theme.text }}>✓</Text> : null}
                </Pressable>
              );
            })}

            {creating ? (
              <View style={styles.createForm}>
                <TextField
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={error ?? undefined}
                  label="새 프로필 핸들"
                  onChangeText={setHandle}
                  onSubmitEditing={createProfile}
                  placeholder="kosmo_user"
                  value={handle}
                />
                <Button disabled={busy} loading={busy} onPress={createProfile}>
                  만들고 선택
                </Button>
              </View>
            ) : (
              <Button
                onPress={() => {
                  setCreating(true);
                  setError(null);
                }}
                tone="secondary"
              >
                새 프로필 추가
              </Button>
            )}
            {!creating && error ? (
              <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  triggerLabel: { flex: 1, minWidth: 0 },
  name: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  handle: { fontFamily: 'SUIT', ...typography.xsm },
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modal: {
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    maxWidth: 400,
    padding: spacing.lg,
    width: '100%',
  },
  heading: { fontFamily: 'SUIT', fontWeight: '800', marginBottom: spacing.sm, ...typography.lg },
  profile: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.sm,
  },
  profileLabel: { flex: 1 },
  createForm: { gap: spacing.md, marginTop: spacing.sm },
  error: { fontFamily: 'SUIT', textAlign: 'center', ...typography.xsm },
});
