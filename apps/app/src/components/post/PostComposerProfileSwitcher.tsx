import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ProfilePicker } from '@/components/profile/ProfilePicker';
import { Avatar } from '@/components/ui/Avatar';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { ProfilePickerProfile } from '@/components/profile/ProfilePicker';

export type PostComposerProfileSwitcherSurface = 'overlay' | 'rail';

type Props = Readonly<{
  onSelectProfile: (id: string) => void | Promise<void>;
  profiles: readonly ProfilePickerProfile[];
  selectedProfileId: string;
  surface: PostComposerProfileSwitcherSurface;
}>;

export function PostComposerProfileSwitcher({
  onSelectProfile,
  profiles,
  selectedProfileId: initialSelectedProfileId,
  surface,
}: Props) {
  const theme = useTheme();
  const rootRef = useRef<View>(null);
  const pickerRef = useRef<View>(null);
  const triggerRef = useRef<View>(null);
  const pendingRef = useRef(false);
  const operationVersionRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState(initialSelectedProfileId);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);

  useEffect(() => {
    setSelectedProfileId(initialSelectedProfileId);
  }, [initialSelectedProfileId]);

  const focusTrigger = useCallback(() => {
    if (Platform.OS === 'web') {
      setTimeout(() => triggerRef.current?.focus(), 0);
      return;
    }
    triggerRef.current?.focus();
  }, []);

  const dismiss = useCallback(() => {
    operationVersionRef.current += 1;
    pendingRef.current = false;
    setPending(false);
    setError(null);
    setOpen(false);
    focusTrigger();
  }, [focusTrigger]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !open) {
      return;
    }

    const root = rootRef.current as unknown as HTMLElement | null;
    const ownerDocument = root?.ownerDocument;
    if (!root || !ownerDocument) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!root.contains(event.target as Node)) {
        dismiss();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      dismiss();
    };

    ownerDocument.addEventListener('pointerdown', onPointerDown);
    ownerDocument.addEventListener('keydown', onKeyDown);
    return () => {
      ownerDocument.removeEventListener('pointerdown', onPointerDown);
      ownerDocument.removeEventListener('keydown', onKeyDown);
    };
  }, [dismiss, open]);

  const selectProfile = (id: string) => {
    if (pendingRef.current) {
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setError(null);
    const operationVersion = operationVersionRef.current;

    void Promise.resolve()
      .then(() => onSelectProfile(id))
      .then(
        () => {
          if (operationVersion !== operationVersionRef.current) {
            return;
          }
          setSelectedProfileId(id);
          setOpen(false);
          setPending(false);
          pendingRef.current = false;
          operationVersionRef.current += 1;
          focusTrigger();
        },
        () => {
          if (operationVersion !== operationVersionRef.current) {
            return;
          }
          setError('프로필을 전환하지 못했습니다.');
          setPending(false);
          pendingRef.current = false;
        },
      );
  };

  return (
    <View ref={rootRef} style={styles.root}>
      <Pressable
        accessibilityLabel="작성 프로필"
        accessibilityRole="button"
        accessibilityState={{ busy: pending, disabled: pending, expanded: open }}
        aria-busy={pending}
        aria-expanded={open}
        disabled={pending}
        onPress={() => {
          setError(null);
          setOpen((value) => !value);
        }}
        ref={triggerRef}
        style={({ pressed }) => [
          styles.trigger,
          { backgroundColor: pressed ? theme.surface : 'transparent', opacity: pending ? 0.5 : 1 },
        ]}
      >
        <Avatar
          imageUri={selectedProfile?.avatar?.url}
          label={selectedProfile?.displayName ?? '프로필'}
          size={40}
        />
        <View style={styles.triggerCopy}>
          <Text numberOfLines={1} style={[styles.triggerName, { color: theme.text }]}>
            {selectedProfile?.displayName ?? '프로필 선택'}
          </Text>
          {selectedProfile ? (
            <Text numberOfLines={1} style={[styles.triggerHandle, { color: theme.textSecondary }]}>
              {selectedProfile.relativeHandle}
            </Text>
          ) : null}
        </View>
        {open ? (
          <ChevronUpIcon color={theme.textSecondary} size={16} />
        ) : (
          <ChevronDownIcon color={theme.textSecondary} size={16} />
        )}
      </Pressable>
      {open ? (
        <View style={styles.pickerLayer}>
          <ProfilePicker
            busy={pending}
            footer={
              error ? (
                <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
                  {error}
                </Text>
              ) : null
            }
            onSelect={selectProfile}
            pickerRef={pickerRef}
            profiles={profiles}
            selectedProfileId={selectedProfileId}
            showDivider={false}
            surface={surface === 'rail' ? 'compact' : 'full'}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative', zIndex: 20 },
  trigger: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: spacing.sm,
    maxWidth: '100%',
    padding: spacing.xs,
  },
  triggerCopy: { flex: 1, minWidth: 0 },
  triggerName: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
  triggerHandle: { fontFamily: 'SUIT', ...typography.sm },
  pickerLayer: { left: 0, position: 'absolute', top: 48, zIndex: 30 },
  error: { fontFamily: 'SUIT', padding: spacing.sm, ...typography.xsm },
});
