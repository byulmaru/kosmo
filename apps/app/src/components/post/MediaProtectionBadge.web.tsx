import { ShieldIcon } from 'lucide-react-native';
import { Tooltip } from '@/components/ui/Tooltip';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSizes, radii, spacing } from '@/theme/tokens';

export function MediaProtectionBadge() {
  const theme = useTheme();

  return (
    <Tooltip label="AI 학습방지 필터가 적용되었어요.">
      <span
        aria-hidden
        data-testid="media-protection-badge"
        style={{
          alignItems: 'center',
          backgroundColor: theme.overlayScrim,
          borderRadius: radii.full,
          display: 'inline-flex',
          justifyContent: 'center',
          padding: spacing.xs,
          pointerEvents: 'auto',
        }}
      >
        <ShieldIcon color={theme.fixedWhite} size={iconSizes[16]} strokeWidth={2} />
      </span>
    </Tooltip>
  );
}
