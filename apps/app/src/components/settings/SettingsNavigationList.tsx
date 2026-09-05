import { StyleSheet, View } from 'react-native';
import { ByulmaruIdAccountSettingsEntry } from './ByulmaruIdAccountSettingsEntry';
import { SettingsLinkRow } from './SettingsLinkRow';

type SettingsDestination = 'default-post-visibility';

export function SettingsNavigationList({ selected }: { selected?: SettingsDestination }) {
  const current = selected === 'default-post-visibility';

  return (
    <View accessibilityLabel="설정 목록" role="navigation" style={styles.root}>
      <ByulmaruIdAccountSettingsEntry />
      <SettingsLinkRow
        accessibilityLabel="게시물 기본 공개 범위 설정 열기"
        href="/settings/default-post-visibility"
        label="게시물 기본 공개 범위"
        primary
        selected={current}
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { width: '100%' } });
