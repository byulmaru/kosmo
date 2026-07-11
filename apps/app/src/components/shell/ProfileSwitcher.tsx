import { profileHandleSchema } from '@kosmo/core/validation';
import { CheckIcon, ChevronDownIcon, PlusIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
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
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  query: ProfileSwitcher_query$key;
  showAvatar?: boolean;
};

export function ProfileSwitcher({
  compact = false,
  onOpenChange,
  open: controlledOpen,
  query,
  showAvatar = true,
}: Props) {
  const theme = useTheme();
  const data = useFragment(ProfileSwitcherFragment, query);
  const { resetActor } = useRelayActor();
  const [internalOpen, setInternalOpen] = useState(false);
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
  const open = controlledOpen ?? internalOpen;
  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  useEffect(() => {
    if (!open) {
      setCreating(false);
      setError(null);
    }
  }, [open]);

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
    const normalized = handle.trim();
    if (!normalized) {
      setError('프로필 핸들을 입력해주세요.');
      return;
    }

    const result = profileHandleSchema.safeParse(normalized);

    if (!result.success) {
      setError(result.error.issues[0]?.message ?? '프로필 핸들 형식을 확인해주세요.');
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

  const menu = (
    <View
      accessibilityLabel="프로필 전환"
      accessibilityRole="menu"
      style={[styles.menu, { backgroundColor: theme.card, borderColor: theme.border }]}
    >
      {profiles.map((profile) => {
        const selected = active?.id === profile.id;
        return (
          <Pressable
            aria-checked={selected}
            accessibilityRole={Platform.OS === 'web' ? undefined : 'radio'}
            accessibilityState={{ checked: selected, disabled: busy }}
            disabled={busy}
            key={profile.id}
            onPress={() => selectProfile(profile.id)}
            role={Platform.OS === 'web' ? ('menuitemradio' as 'radio') : undefined}
            style={({ pressed }) => [
              styles.profile,
              {
                backgroundColor: selected || pressed ? theme.surface : 'transparent',
                opacity: busy ? 0.5 : 1,
              },
            ]}
          >
            <Avatar label={profile.displayName} size={selected ? 48 : 32} />
            <View style={styles.profileLabel}>
              <Text numberOfLines={1} style={[styles.profileName, { color: theme.text }]}>
                {profile.displayName}
              </Text>
              <Text numberOfLines={1} style={[styles.handle, { color: theme.textSecondary }]}>
                {profile.relativeHandle}
              </Text>
            </View>
            {selected ? <CheckIcon color={theme.text} size={16} /> : null}
          </Pressable>
        );
      })}

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      {creating ? (
        <View
          accessibilityLabel="새 프로필 만들기"
          role={Platform.OS === 'web' ? 'form' : undefined}
          style={styles.createForm}
        >
          <View style={styles.createRow}>
            <TextInput
              accessibilityLabel="프로필 핸들"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              onChangeText={setHandle}
              onSubmitEditing={createProfile}
              placeholder="새 프로필 핸들"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  backgroundColor: theme.card,
                  borderColor: error ? theme.danger : theme.border,
                  color: theme.text,
                },
              ]}
              value={handle}
            />
            <Button
              disabled={busy}
              loading={busy}
              onPress={createProfile}
              style={styles.createButton}
            >
              만들기
            </Button>
          </View>
          <Text style={[styles.help, { color: theme.textSecondary }]}>
            영문, 숫자, 밑줄(_)만 사용할 수 있어요.
          </Text>
          {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
        </View>
      ) : (
        <Pressable
          accessibilityLabel="새 프로필 추가"
          disabled={busy}
          onPress={() => {
            setCreating(true);
            setError(null);
          }}
          role={Platform.OS === 'web' ? 'menuitem' : 'button'}
          style={({ pressed }) => [
            styles.addProfile,
            { backgroundColor: pressed ? theme.surface : 'transparent', opacity: busy ? 0.5 : 1 },
          ]}
        >
          <View style={styles.addIcon}>
            <PlusIcon color={theme.text} size={18} strokeWidth={2.25} />
          </View>
          <Text style={[styles.addLabel, { color: theme.text }]}>새 프로필 추가</Text>
        </Pressable>
      )}
      {!creating && error ? (
        <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>
      ) : null}
    </View>
  );

  return (
    <View
      style={[
        styles.root,
        compact ? styles.compactRoot : styles.fullRoot,
        { zIndex: open ? 30 : 0 },
      ]}
    >
      <Pressable
        aria-expanded={open}
        accessibilityLabel="프로필 목록"
        accessibilityRole="button"
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [
          styles.trigger,
          compact ? styles.compactTrigger : styles.fullTrigger,
          { opacity: pressed ? 0.65 : 1 },
        ]}
      >
        {showAvatar ? <Avatar label={active?.displayName ?? '?'} size={compact ? 40 : 48} /> : null}
        {!compact ? (
          <Text numberOfLines={1} style={[styles.triggerName, { color: theme.text }]}>
            {active?.displayName ?? (profiles.length ? '프로필 선택' : '프로필')}
          </Text>
        ) : null}
        {!compact ? <ChevronDownIcon color={theme.textSecondary} size={16} /> : null}
      </Pressable>

      {Platform.OS === 'web' ? (
        open ? (
          <View
            style={[styles.webMenu, compact ? styles.compactMenuPosition : styles.fullMenuPosition]}
          >
            {menu}
          </View>
        ) : null
      ) : (
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
              style={styles.nativeMenu}
            >
              {menu}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative' },
  compactRoot: { height: 44, width: 44 },
  fullRoot: { alignSelf: 'stretch' },
  trigger: { alignItems: 'center', flexDirection: 'row' },
  compactTrigger: { height: 44, justifyContent: 'center', width: 44 },
  fullTrigger: { alignSelf: 'flex-start', gap: spacing.sm, height: 42, maxWidth: '100%' },
  triggerName: {
    flexShrink: 1,
    fontFamily: 'SUIT',
    fontWeight: '700',
    ...typography.xl,
  },
  webMenu: { position: 'absolute', width: 280, zIndex: 30 },
  compactMenuPosition: { left: 52, top: 0 },
  fullMenuPosition: { left: 0, top: 50 },
  menu: {
    borderRadius: 14,
    borderWidth: 1,
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.16)',
    gap: 2,
    padding: 6,
    width: 280,
  },
  profileName: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  handle: { fontFamily: 'SUIT', ...typography.xsm },
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  nativeMenu: { width: 280 },
  profile: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 10,
    padding: spacing.sm,
  },
  profileLabel: { flex: 1, minWidth: 0 },
  divider: { height: 1, marginVertical: 2, width: '100%' },
  createForm: { gap: spacing.xs, padding: spacing.xs },
  createRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    borderRadius: radii.sm,
    borderWidth: 1,
    flex: 1,
    fontFamily: 'SUIT',
    minHeight: 40,
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.sm,
  },
  createButton: { minHeight: 40, minWidth: 72, paddingHorizontal: spacing.md },
  help: { fontFamily: 'SUIT', paddingHorizontal: spacing.xs, ...typography.xsm },
  error: { fontFamily: 'SUIT', paddingHorizontal: spacing.xs, ...typography.xsm },
  addProfile: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 10,
    padding: spacing.sm,
  },
  addIcon: { alignItems: 'center', justifyContent: 'center', width: 32 },
  addLabel: { fontFamily: 'SUIT', fontWeight: '500', ...typography.sm },
});
