import { profileHandleSchema } from '@kosmo/core/validation/profile';
import { Link } from 'expo-router';
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
import { trackAnalytics } from '@/analytics/client';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
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
        followingCount
        followersCount
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
  maxHeight: 'min(430px, calc(100vh - 32px))',
} as unknown as ViewStyle;
const webFullPickerBounds = {
  maxHeight: 'min(430px, calc(100vh - 276px))',
} as unknown as ViewStyle;
const countFormatter = new Intl.NumberFormat('en', {
  maximumFractionDigits: 1,
  notation: 'compact',
});
const webCover = {
  backgroundImage:
    'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.9), transparent 35%), linear-gradient(135deg, rgba(17,17,17,0.14), transparent), linear-gradient(135deg, #e4e4e7, #f4f4f5, #d4d4d8)',
  filter: 'blur(1px)',
} as unknown as ViewStyle;
const avatarShadow = {
  boxShadow: '1px 1px 2px rgba(0, 0, 0, 0.25)',
} as ViewStyle;

type Props = {
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  query: ProfileSwitcher_query$key;
  surface: ProfileSwitcherSurface;
};

export function ProfileSwitcher({ onOpenChange, open: controlledOpen, query, surface }: Props) {
  const theme = useTheme();
  const data = useFragment(ProfileSwitcherFragment, query);
  const { resetActor } = useRelayActor();
  const [internalOpen, setInternalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pickerRef = useRef<View>(null);
  const triggerRef = useRef<View>(null);
  const dismissalVersionRef = useRef(0);
  const [commitSelect, selecting] =
    useMutation<ProfileSwitcherSelectProfileMutation>(SelectProfileMutation);
  const [commitCreate, creatingProfile] =
    useMutation<ProfileSwitcherCreateProfileMutation>(CreateProfileMutation);
  const active = data.currentSession?.selectedProfile ?? null;
  const profiles = data.me?.profiles ?? [];
  const busy = selecting || creatingProfile;
  const compact = surface === 'compact';
  const fullWeb = Platform.OS === 'web' && surface === 'full';
  const mobileWebDrawer = Platform.OS === 'web' && surface === 'drawer';
  const redesignedWeb = Platform.OS === 'web' && surface !== 'drawer';
  const open = controlledOpen ?? internalOpen;
  const webExpandedChevron = Platform.OS === 'web' && open;
  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };
  const dismissPicker = () => {
    if (redesignedWeb) {
      dismissalVersionRef.current += 1;
      setCreating(false);
      setHandle('');
      setError(null);
    }
    setOpen(false);
  };
  const setOperationError = (version: number, message: string) => {
    if (!redesignedWeb || version === dismissalVersionRef.current) {
      setError(message);
    }
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

    const picker = pickerRef.current as unknown as HTMLElement | null;
    const trigger = triggerRef.current as unknown as HTMLElement | null;
    const onPointerDown = (event: PointerEvent) => {
      if (!picker?.contains(event.target as Node) && !trigger?.contains(event.target as Node)) {
        dismissPicker();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissPicker();
        trigger?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, surface]);

  const selectProfile = (id: string, operationVersion = dismissalVersionRef.current) => {
    setError(null);
    commitSelect({
      variables: { id },
      onCompleted: (response, errors) => {
        if (errors?.length) {
          setOperationError(operationVersion, '프로필을 전환하지 못했습니다.');
          return;
        }

        const selectedProfileId = response.selectProfile.session.selectedProfile?.id ?? id;
        trackAnalytics('profile_selected', { selected_profile_id: selectedProfileId });
        setOpen(false);
        resetActor(selectedProfileId);
      },
      onError: (cause) =>
        setOperationError(operationVersion, cause.message || '프로필을 전환하지 못했습니다.'),
    });
  };

  const createProfile = () => {
    const operationVersion = dismissalVersionRef.current;
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
          setOperationError(operationVersion, '프로필을 생성하지 못했습니다.');
          return;
        }

        trackAnalytics('profile_created', {
          selected_profile_id: active?.id ?? null,
        });
        setHandle('');
        setCreating(false);
        selectProfile(response.createProfile.profile.id, operationVersion);
      },
      onError: (cause) =>
        setOperationError(operationVersion, cause.message || '프로필을 생성하지 못했습니다.'),
    });
  };

  const surfaceBounds = !redesignedWeb
    ? undefined
    : surface === 'compact'
      ? webCompactPickerBounds
      : webFullPickerBounds;
  const profileOptions = profiles.map((profile) => {
    const selected = active?.id === profile.id;
    return (
      <Pressable
        aria-checked={Platform.OS === 'web' && !redesignedWeb ? selected : undefined}
        aria-pressed={redesignedWeb ? selected : undefined}
        accessibilityRole={redesignedWeb ? 'button' : Platform.OS === 'web' ? undefined : 'radio'}
        accessibilityState={
          redesignedWeb ? { disabled: busy } : { checked: selected, disabled: busy }
        }
        disabled={busy}
        key={profile.id}
        onPress={() => selectProfile(profile.id)}
        role={Platform.OS === 'web' && !redesignedWeb ? ('menuitemradio' as 'radio') : undefined}
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
  const pickerContent = (
    <View
      ref={pickerRef}
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
        role={Platform.OS === 'web' && !redesignedWeb ? 'menu' : undefined}
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
            accessibilityRole={redesignedWeb || Platform.OS !== 'web' ? 'button' : undefined}
            disabled={busy}
            onPress={() => {
              setCreating(true);
              setError(null);
            }}
            role={Platform.OS === 'web' && !redesignedWeb ? 'menuitem' : undefined}
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

  const triggerCopy = !compact ? (
    <>
      <Text numberOfLines={1} style={[styles.triggerName, { color: theme.text }]}>
        {active?.displayName ?? (profiles.length ? '프로필 선택' : '프로필')}
      </Text>
      {webExpandedChevron ? (
        <ChevronUpIcon color={theme.textSecondary} size={16} />
      ) : (
        <ChevronDownIcon color={theme.textSecondary} size={16} />
      )}
    </>
  ) : null;
  const trigger = (
    <Pressable
      ref={triggerRef}
      aria-expanded={open}
      accessibilityLabel="프로필 목록"
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={() => (open ? dismissPicker() : setOpen(true))}
      style={({ pressed }) => [
        styles.trigger,
        compact ? styles.compactTrigger : styles.fullTrigger,
        { opacity: pressed ? 0.65 : 1 },
      ]}
    >
      {compact ? <Avatar label={active?.displayName ?? '?'} size={40} /> : null}
      {fullWeb || mobileWebDrawer ? (
        <View style={styles.webTriggerContent}>{triggerCopy}</View>
      ) : (
        triggerCopy
      )}
    </Pressable>
  );
  const profileDetails = active ? (
    <>
      <Text
        accessibilityLabel="활성 프로필 핸들"
        numberOfLines={1}
        style={[styles.profileHandle, { color: theme.textSecondary }]}
      >
        {active.relativeHandle}
      </Text>
      <View style={styles.counts}>
        <Link asChild href={`/${active.relativeHandle}/following`}>
          <Pressable
            accessibilityRole="link"
            onFocus={fullWeb && open ? dismissPicker : undefined}
            onPress={fullWeb && open ? dismissPicker : undefined}
            style={styles.countLink}
          >
            <Text style={[styles.count, { color: theme.text }]}>
              {countFormatter.format(active.followingCount).toLowerCase()}
            </Text>
            <Text style={[styles.countLabel, { color: theme.text }]}>팔로잉</Text>
          </Pressable>
        </Link>
        <Link asChild href={`/${active.relativeHandle}/followers`}>
          <Pressable
            accessibilityRole="link"
            onFocus={fullWeb && open ? dismissPicker : undefined}
            onPress={fullWeb && open ? dismissPicker : undefined}
            style={styles.countLink}
          >
            <Text style={[styles.count, { color: theme.text }]}>
              {countFormatter.format(active.followersCount).toLowerCase()}
            </Text>
            <Text style={[styles.countLabel, { color: theme.text }]}>팔로워</Text>
          </Pressable>
        </Link>
      </View>
    </>
  ) : (
    <Text style={[styles.emptyProfile, { color: theme.textSecondary }]}>
      {profiles.length ? '사용할 프로필을 선택해주세요.' : '새 프로필을 만들어 시작하세요.'}
    </Text>
  );
  const fullWebPicker =
    fullWeb && open ? (
      <View style={[styles.webMenu, styles.fullOverlayPosition]}>{pickerContent}</View>
    ) : null;
  const triggerSurface = !compact ? (
    <View accessibilityLabel="활성 프로필" style={styles.profileHeader}>
      <View
        style={[
          styles.cover,
          { backgroundColor: theme.surface },
          Platform.OS === 'web' && webCover,
        ]}
      />
      <View style={styles.largeAvatar}>
        <Avatar
          label={active?.displayName || active?.handle || '?'}
          size={96}
          style={avatarShadow}
        />
      </View>
      {active ? (
        <Pressable
          accessibilityLabel="프로필 편집"
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          disabled
          style={[styles.editButton, { backgroundColor: theme.primary }]}
        >
          <Text style={styles.editLabel}>편집</Text>
        </Pressable>
      ) : null}
      <View style={styles.profileCopy}>
        {trigger}
        {fullWebPicker}
        {profileDetails}
      </View>
    </View>
  ) : (
    trigger
  );

  return (
    <View
      style={[
        styles.root,
        compact ? styles.compactRoot : styles.fullRoot,
        { zIndex: open ? 30 : 0 },
      ]}
    >
      {triggerSurface}

      {Platform.OS === 'web' ? (
        open && !fullWeb ? (
          <View
            style={[
              styles.webMenu,
              surface === 'compact' ? styles.compactMenuPosition : styles.drawerMenuPosition,
            ]}
          >
            {pickerContent}
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
              {pickerContent}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative' },
  compactRoot: { height: 44, width: 64 },
  fullRoot: { alignSelf: 'stretch' },
  trigger: { alignItems: 'center', flexDirection: 'row' },
  compactTrigger: { height: 44, justifyContent: 'center', width: 44 },
  fullTrigger: { alignSelf: 'flex-start', gap: spacing.sm, height: 42, maxWidth: '100%' },
  webTriggerContent: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: spacing.sm,
    maxWidth: '100%',
  },
  triggerName: {
    flexShrink: 1,
    fontFamily: 'SUIT',
    fontWeight: '700',
    ...typography.xl,
  },
  webMenu: { position: 'absolute', width: 280, zIndex: 30 },
  compactMenuPosition: { left: 72, top: 0 },
  drawerMenuPosition: { left: 0, top: 190 },
  fullOverlayPosition: { left: -10, top: 50 },
  profileHeader: { height: 260, position: 'relative', width: 320, zIndex: 20 },
  cover: { height: 104, left: 0, position: 'absolute', right: 0, top: 0 },
  largeAvatar: { left: 20, position: 'absolute', top: 54 },
  editButton: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: 32,
    justifyContent: 'center',
    opacity: 0.6,
    paddingHorizontal: spacing.md,
    position: 'absolute',
    right: 20,
    top: 134,
  },
  editLabel: { color: '#111111', fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  profileCopy: {
    left: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    position: 'absolute',
    top: 140,
    width: 300,
  },
  profileHandle: { fontFamily: 'SUIT', ...typography.sm },
  emptyProfile: { fontFamily: 'SUIT', marginTop: spacing.sm, ...typography.sm },
  counts: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  countLink: { flexDirection: 'row', gap: spacing.sm },
  count: { fontFamily: 'SUIT', ...typography.sm },
  countLabel: { fontFamily: 'SUIT', ...typography.sm },
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
