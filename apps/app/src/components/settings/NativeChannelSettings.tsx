import { useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAnimatedColorTransition } from '@/components/ui/useAnimatedColorTransition';
import { getNativeDeploymentChannel, switchNativeChannel } from '@/config/nativeChannel';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';
import { Button } from '../ui/Button';
import { ModalSheet } from '../ui/ModalSheet';
import { RadioGroup, RadioOption } from '../ui/RadioGroup';
import { SettingsItem } from './SettingsItem';
import type { ViewStyle } from 'react-native';
import type { NativeChannel } from '@/config/nativeChannel';

export function NativeChannelSettings() {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const { clearNativeSession } = useRelayActor();
  const currentChannel = getNativeDeploymentChannel() ?? 'prod';
  const [draftChannel, setDraftChannel] = useState<NativeChannel>(currentChannel);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPicker = () => {
    setDraftChannel(currentChannel);
    setError(null);
    setOpen(true);
  };

  const closePicker = () => {
    setDraftChannel(currentChannel);
    setError(null);
    setOpen(false);
  };

  const save = async () => {
    if (draftChannel === currentChannel) {
      setOpen(false);
      return;
    }

    setPending(true);
    setError(null);
    const result = await switchNativeChannel(draftChannel, clearNativeSession);
    if (result === 'failed') {
      setDraftChannel(currentChannel);
      setError('채널을 변경하지 못했어요. 잠시 후 다시 시도해 주세요.');
      setPending(false);
      return;
    }

    setOpen(false);
    setPending(false);
  };

  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityLabel={`채널: ${currentChannel}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        disabled={pending}
        onPress={openPicker}
        style={styles.entry}
        testID="native-channel-settings"
      >
        {({ pressed }) => (
          <NativeChannelEntryVisual
            currentChannel={currentChannel}
            pressed={pressed}
            reducedMotion={reducedMotion}
            theme={theme}
          />
        )}
      </Pressable>
      <ModalSheet dismissDisabled={pending} onClose={closePicker} title="채널 선택" visible={open}>
        <Text style={[styles.copy, { color: theme.textSecondary }]}>
          채널을 바꾸면 현재 로그인 정보가 삭제되고 앱이 다시 로드됩니다.
        </Text>
        <RadioGroup
          accessibilityLabel="채널 선택"
          disabled={pending}
          onChange={setDraftChannel}
          value={draftChannel}
        >
          <RadioOption option={{ description: '개발 서버', label: 'dev', value: 'dev' }} />
          <RadioOption option={{ description: '운영 서버', label: 'prod', value: 'prod' }} />
        </RadioGroup>
        <View style={styles.actions}>
          <Button disabled={pending} onPress={closePicker} size="compact" tone="secondary">
            취소
          </Button>
          <Button
            disabled={draftChannel === currentChannel}
            loading={pending}
            loadingText="변경 중"
            onPress={save}
            size="compact"
          >
            저장
          </Button>
        </View>
        {error ? (
          <Text accessibilityRole="alert" style={[styles.copy, { color: theme.danger }]}>
            {error}
          </Text>
        ) : null}
      </ModalSheet>
    </View>
  );
}

function NativeChannelEntryVisual({
  currentChannel,
  pressed,
  reducedMotion,
  theme,
}: {
  currentChannel: string;
  pressed: boolean;
  reducedMotion: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  const backgroundColor = useAnimatedColorTransition({
    instantKey: theme,
    color: pressed ? theme.statePressed : 'transparent',
    interactionKey: pressed ? 'pressed' : 'idle',
    reducedMotion,
    role: 'interaction',
  });

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor } as unknown as ViewStyle]}
      />
      <SettingsItem description={currentChannel} label="채널" />
    </>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  entry: {
    minHeight: 64,
    position: 'relative',
    width: '100%',
  },
  copy: textStyles.uiCopyS,
  actions: { flexDirection: 'row', gap: space[8], justifyContent: 'flex-end' },
});
