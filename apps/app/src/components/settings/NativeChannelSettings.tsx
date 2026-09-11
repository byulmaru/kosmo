import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { getNativeDeploymentChannel, switchNativeChannel } from '@/config/nativeChannel';
import { useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';
import { Button } from '../ui/Button';
import { ModalSheet } from '../ui/ModalSheet';
import { RadioGroup, RadioOption } from '../ui/RadioGroup';
import { SettingsItem } from './SettingsItem';
import type { NativeChannel } from '@/config/nativeChannel';

const channelOptions = [
  { description: '개발 서버', label: 'dev', value: 'dev' },
  { description: '운영 서버', label: 'prod', value: 'prod' },
] as const;

const CHANNEL_SWITCH_FAILURE_MESSAGE = '채널을 변경하지 못했어요. 잠시 후 다시 시도해 주세요.';

export function NativeChannelSettings({ clearSession }: { clearSession: () => Promise<void> }) {
  const theme = useTheme();
  const currentChannel = getNativeDeploymentChannel() ?? 'prod';
  const [draftChannel, setDraftChannel] = useState<NativeChannel>(currentChannel);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPicker = useCallback(() => {
    if (pending) {
      return;
    }

    setDraftChannel(currentChannel);
    setError(null);
    setOpen(true);
  }, [currentChannel, pending]);

  const closePicker = useCallback(() => {
    if (pending) {
      return;
    }

    setDraftChannel(currentChannel);
    setError(null);
    setOpen(false);
  }, [currentChannel, pending]);

  const save = useCallback(async () => {
    if (pending) {
      return;
    }

    if (draftChannel === currentChannel) {
      setOpen(false);
      return;
    }

    setPending(true);
    setError(null);
    const result = await switchNativeChannel(draftChannel, clearSession);
    if (result === 'failed') {
      setDraftChannel(currentChannel);
      setError(CHANNEL_SWITCH_FAILURE_MESSAGE);
      setPending(false);
      return;
    }

    setOpen(false);
    setPending(false);
  }, [clearSession, currentChannel, draftChannel, pending]);

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
        style={({ pressed }) => [
          styles.entry,
          { backgroundColor: pressed ? theme.statePressed : 'transparent' },
        ]}
        testID="native-channel-settings"
      >
        <SettingsItem description={currentChannel} label="채널" />
      </Pressable>
      <ModalSheet dismissDisabled={pending} onClose={closePicker} title="채널 선택" visible={open}>
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          채널을 바꾸면 현재 로그인 정보가 삭제되고 앱이 다시 로드됩니다.
        </Text>
        <RadioGroup
          accessibilityLabel="채널 선택"
          disabled={pending}
          onChange={setDraftChannel}
          value={draftChannel}
        >
          {channelOptions.map((option) => (
            <RadioOption key={option.value} option={option} />
          ))}
        </RadioGroup>
        <View style={styles.actions}>
          <Button disabled={pending} onPress={closePicker} size="compact" tone="secondary">
            취소
          </Button>
          <Button
            disabled={draftChannel === currentChannel}
            loading={pending}
            loadingText="변경 중"
            onPress={() => void save()}
            size="compact"
          >
            저장
          </Button>
        </View>
        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
            {error}
          </Text>
        ) : null}
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  entry: {
    minHeight: 64,
    width: '100%',
  },
  note: textStyles.uiCopyS,
  actions: { flexDirection: 'row', gap: space[8], justifyContent: 'flex-end' },
  error: textStyles.uiCopyS,
});
