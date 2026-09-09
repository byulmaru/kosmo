import { ChevronDown } from 'lucide-react-native';
import { View } from 'react-native';
import { postVisibilityPresentation } from '@/components/post/postVisibilityPresentation';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import type { ProfilePostingSettingsValue } from './ProfilePostingSettings';

const options = ['PUBLIC', 'UNLISTED', 'FOLLOWERS'] as const;

export function ProfileVisibilitySelect({
  value,
  onChange,
}: {
  value: ProfilePostingSettingsValue['defaultPostVisibility'];
  onChange: (value: ProfilePostingSettingsValue['defaultPostVisibility']) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ width: 160 }}>
      <select
        aria-label="게시물 기본 공개 범위"
        value={value}
        onChange={(event) => {
          const selected = options.find((option) => option === event.currentTarget.value);
          if (selected) {
            onChange(selected);
          }
        }}
        style={{
          appearance: 'none',
          background: theme.backgroundSurface,
          border: `${borderWidths[1]}px solid ${theme.borderDefault}`,
          borderRadius: radius[12],
          color: theme.foregroundPrimary,
          cursor: 'pointer',
          fontFamily: textStyles.uiCopyL.fontFamily,
          fontSize: textStyles.uiCopyL.fontSize,
          minHeight: 48,
          outlineColor: theme.stateFocusRing,
          outlineOffset: 2,
          padding: `${space[12]}px ${space[24] + space[16]}px ${space[12]}px ${space[12]}px`,
          width: '100%',
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option === 'PUBLIC' ? '전체 공개' : postVisibilityPresentation[option].label}
          </option>
        ))}
      </select>
      <View pointerEvents="none" style={{ position: 'absolute', right: 12, top: 12 }}>
        <ChevronDown aria-hidden color={theme.foregroundPrimary} size={iconSizes[24]} />
      </View>
    </View>
  );
}
