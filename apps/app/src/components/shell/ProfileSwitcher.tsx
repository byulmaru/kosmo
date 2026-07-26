import { profileHandleSchema } from '@kosmo/core/validation/profile';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, PlusIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
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

export type ProfileSwitcherSurface = 'compact' | 'drawer' | 'full';

const webCompactPickerBounds = {
  maxHeight: 'min(560px, calc(100vh - 32px))',
} as unknown as ViewStyle;
const webFullPickerBounds = {
  maxHeight: 'min(560px, calc(100vh - 276px))',
} as unknown as ViewStyle;

type CommonProps = {
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  query: ProfileSwitcher_query$key;
  showAvatar?: boolean;
};

type Props =
  | (CommonProps & { renderSummary: (trigger: ReactNode) => ReactNode; surface: 'full' })
  | (CommonProps & { renderSummary?: never; surface: 'compact' | 'drawer' });

export function ProfileSwitcher({
  onOpenChange,
  open: controlledOpen,
  query,
  renderSummary,
  showAvatar = true,
  surface,
}: Props) {
  const theme = useTheme();
  const data = useFragment(ProfileSwitcherFragment, query);
  const { resetActor } = useRelayActor();
  const [internalOpen, setInternalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const controlRef = useRef<View>(null);
  const menuRef = useRef<View>(null);
  const triggerRef = useRef<View>(null);
  const [commitSelect, selecting] =
    useMutation<ProfileSwitcherSelectProfileMutation>(SelectProfileMutation);
  const [commitCreate, creatingProfile] =
    useMutation<ProfileSwitcherCreateProfileMutation>(CreateProfileMutation);
  const active = data.currentSession?.selectedProfile ?? null;
  const profiles = data.me?.profiles ?? [];
  const busy = selecting || creatingProfile;
  const compact = surface === 'compact';
  const fullWeb = Platform.OS === 'web' && surface === 'full';
  const redesignedWeb = Platform.OS === 'web' && surface !== 'drawer';
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
      if (redesignedWeb) {
        setHandle('');
      }
    }
  }, [open, redesignedWeb]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !open || surface === 'drawer') {
      return;
    }

    const control = controlRef.current as unknown as HTMLElement | null;
    const menu = menuRef.current as unknown as HTMLElement | null;
    const trigger = triggerRef.current as unknown as HTMLElement | null;
    const items = Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    const initialItem =
      items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0];
    initialItem?.focus();
    initialItem?.scrollIntoView({ block: 'nearest' });
    const onPointerDown = (event: PointerEvent) => {
      if (surface === 'compact' && !control?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger?.focus();
        return;
      }

      const current = document.activeElement as HTMLElement | null;
      const index = current ? items.indexOf(current) : -1;
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || index < 0) {
        return;
      }

      event.preventDefault();
      const nextIndex =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : event.key === 'ArrowDown'
              ? (index + 1) % items.length
              : (index - 1 + items.length) % items.length;
      items[nextIndex]?.focus();
      items[nextIndex]?.scrollIntoView({ block: 'nearest' });
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, surface]);

  const selectProfile = (id: string) => {
    setError(null);
    commitSelect({
      variables: { id },
      onCompleted: (response, errors) => {
        if (errors?.length) {
          setError('프로필을 전환하지 못했습니다.');
          return;
        }

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
      onCompleted: (response, errors) => {
        if (errors?.length) {
          setError('프로필을 생성하지 못했습니다.');
          return;
        }

        setHandle('');
        setCreating(false);
        selectProfile(response.createProfile.profile.id);
      },
      onError: (cause) => setError(cause.message || '프로필을 생성하지 못했습니다.'),
    });
  };

  const surfaceBounds = !redesignedWeb
    ? undefined
    : surface === 'compact'
      ? webCompactPickerBounds
      : webFullPickerBounds;
  const profileOptions = profiles.map((profile, index) => {
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
        tabIndex={redesignedWeb ? (selected || (!active && index === 0) ? 0 : -1) : undefined}
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
  });
  const menu = (
    <View
      style={[
        styles.menu,
        redesignedWeb ? styles.redesignedMenu : undefined,
        surfaceBounds,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <View
        accessibilityLabel="프로필 전환"
        accessibilityRole={Platform.OS === 'web' ? undefined : 'menu'}
        ref={menuRef}
        role={Platform.OS === 'web' ? 'menu' : undefined}
        style={redesignedWeb ? styles.redesignedMenuRegion : styles.menuItems}
      >
        {redesignedWeb ? (
          <ScrollView
            accessibilityLabel="전환할 프로필 목록"
            contentContainerStyle={styles.profileListContent}
            role="group"
            style={styles.profileList}
          >
            {profileOptions}
          </ScrollView>
        ) : (
          profileOptions
        )}

        <View
          accessibilityRole={Platform.OS === 'web' ? undefined : 'none'}
          role={Platform.OS === 'web' ? 'separator' : undefined}
          style={[styles.divider, { backgroundColor: theme.border }]}
        />

        {!creating ? (
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
              {
                backgroundColor: pressed ? theme.surface : 'transparent',
                opacity: busy ? 0.5 : 1,
              },
            ]}
          >
            <View style={styles.addIcon}>
              <PlusIcon color={theme.text} size={18} strokeWidth={2.25} />
            </View>
            <Text style={[styles.addLabel, { color: theme.text }]}>새 프로필 추가</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.pickerFooter}>
        {creating ? (
          <View
            accessibilityLabel="새 프로필 만들기"
            role={Platform.OS === 'web' ? 'form' : undefined}
            style={styles.createForm}
          >
            <View style={styles.createRow}>
              <TextInput
                aria-invalid={Boolean(error)}
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
            {error ? (
              <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
                {error}
              </Text>
            ) : null}
          </View>
        ) : null}
        {!creating && error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );

  const trigger = (
    <Pressable
      ref={triggerRef}
      aria-expanded={open}
      accessibilityLabel="프로필 목록"
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
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
      {!compact ? (
        fullWeb && open ? (
          <ChevronUpIcon color={theme.textSecondary} size={16} />
        ) : (
          <ChevronDownIcon color={theme.textSecondary} size={16} />
        )
      ) : null}
    </Pressable>
  );
  const triggerSurface = surface === 'full' ? renderSummary(trigger) : trigger;

  return (
    <View
      ref={controlRef}
      style={[
        styles.root,
        compact ? styles.compactRoot : styles.fullRoot,
        { zIndex: open ? 30 : 0 },
      ]}
    >
      {triggerSurface}

      {Platform.OS === 'web' ? (
        open ? (
          fullWeb ? (
            <View style={styles.fullInlineMenu}>{menu}</View>
          ) : (
            <View
              style={[
                styles.webMenu,
                surface === 'compact' ? styles.compactMenuPosition : styles.fullMenuPosition,
              ]}
            >
              {menu}
            </View>
          )
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
  compactMenuPosition: { left: 62, top: 0 },
  fullMenuPosition: { left: 0, top: 50 },
  fullInlineMenu: { width: 280 },
  menu: {
    borderRadius: 14,
    borderWidth: 1,
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.16)',
    padding: 6,
    width: 280,
  },
  redesignedMenu: { overflow: 'hidden' },
  menuItems: { gap: 2 },
  redesignedMenuRegion: { flexShrink: 1, minHeight: 0 },
  profileList: { flexShrink: 1, minHeight: 0 },
  profileListContent: { gap: 2 },
  pickerFooter: { flexShrink: 0 },
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
