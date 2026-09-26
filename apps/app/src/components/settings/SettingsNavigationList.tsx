import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useToast } from '@/components/ui/ToastProvider';
import { layoutRecipes } from '@/theme/tokens';
import { ByulmaruIdAccountSettingsEntry } from './ByulmaruIdAccountSettingsEntry';
import { SettingsItem } from './SettingsItem';
import { SettingsLinkRow } from './SettingsLinkRow';

type SettingsDestination = 'default-post-visibility' | 'mute-and-block' | 'info';

export function SettingsNavigationList({ selected }: { selected?: SettingsDestination }) {
  const { showToast } = useToast();
  const current = selected === 'default-post-visibility';

  return (
    <View
      accessibilityLabel="설정 목록"
      role="navigation"
      style={[layoutRecipes.listStack, styles.root]}
    >
      <ByulmaruIdAccountSettingsEntry />
      <SettingsLinkRow
        accessibilityLabel="게시물 기본 공개 범위 설정 열기"
        href="/settings/default-post-visibility"
        label="게시물 기본 공개 범위"
        primary
        selected={current}
      />
      <SettingsLinkRow
        accessibilityLabel="뮤트 및 차단 설정 열기"
        href="/settings/mute-and-block"
        label="뮤트 및 차단"
        primary
        selected={selected === 'mute-and-block'}
      />
      {Platform.OS !== 'web' ? (
        <Pressable
          accessibilityLabel="OS 알림 설정 열기"
          accessibilityRole="button"
          onPress={() => {
            void Linking.openSettings().catch(() => {
              showToast('기기의 알림 설정을 열지 못했어요. 잠시 후 다시 시도해 주세요.', {
                tone: 'danger',
              });
            });
          }}
          testID="native-notification-settings"
        >
          <SettingsItem
            description="기기의 알림 설정에서 Push 알림을 관리할 수 있어요."
            label="알림 설정"
          />
        </Pressable>
      ) : null}
      <SettingsLinkRow
        accessibilityLabel="정보 설정 열기"
        href="/settings/info"
        label="정보"
        primary
        selected={selected === 'info'}
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { width: '100%' } });
