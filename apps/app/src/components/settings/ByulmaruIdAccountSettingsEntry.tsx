import { StyleSheet, View } from 'react-native';
import { SettingsLinkRow } from './SettingsLinkRow';

export const BYULMARU_ID_ACCOUNT_SETTINGS_URL = 'https://id.byulmaru.co';

const ENTRY_LABEL = '계정 설정';
const ENTRY_ACCESSIBILITY_LABEL = 'Byulmaru ID Account Settings 외부 서비스로 이동';

export function ByulmaruIdAccountSettingsEntry() {
  return (
    <View style={styles.root} testID="byulmaru-id-account-settings-entry-container">
      <SettingsLinkRow
        accessibilityLabel={ENTRY_ACCESSIBILITY_LABEL}
        external
        href={BYULMARU_ID_ACCOUNT_SETTINGS_URL}
        label={ENTRY_LABEL}
        testID="byulmaru-id-account-settings-entry"
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { width: '100%' } });
