import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';
import { ProfileVisibilitySelect } from './ProfileVisibilitySelect';
import { SettingsItem } from './SettingsItem';

export type ProfilePostingSettingsValue = {
  defaultPostVisibility: 'PUBLIC' | 'UNLISTED' | 'FOLLOWERS';
  followPolicy: 'OPEN' | 'APPROVAL_REQUIRED';
};

/** Field presentation only; the caller owns the draft and its persistence. */
export function ProfilePostingSettings({
  value,
  onChange,
}: {
  value: ProfilePostingSettingsValue;
  onChange: (value: ProfilePostingSettingsValue) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.root}>
      <Text style={[textStyles.uiLabelM, { color: theme.foregroundSecondary }]}>게시 설정</Text>
      <SettingsItem
        label="게시물 기본 공개 범위"
        description="새 게시물에 기본으로 적용됩니다."
        trailing={
          <ProfileVisibilitySelect
            value={value.defaultPostVisibility}
            onChange={(defaultPostVisibility) => onChange({ ...value, defaultPostVisibility })}
          />
        }
      />
      <SettingsItem
        label="팔로우 요청 자동 승인"
        description="새 팔로우 요청을 자동으로 수락합니다."
        trailing={
          <Switch
            accessibilityLabel="팔로우 요청 자동 승인"
            value={value.followPolicy === 'OPEN'}
            onValueChange={(automaticApproval) =>
              onChange({ ...value, followPolicy: automaticApproval ? 'OPEN' : 'APPROVAL_REQUIRED' })
            }
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { gap: space[8] } });
