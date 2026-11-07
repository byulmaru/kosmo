import { PostVisibility } from '@kosmo/core/enums';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { postVisibilityPresentation } from './postVisibilityPresentation';

function getPresentation(visibility: string) {
  switch (visibility) {
    case PostVisibility.PUBLIC:
    case PostVisibility.UNLISTED:
    case PostVisibility.FOLLOWERS:
    case PostVisibility.DIRECT:
      return postVisibilityPresentation[visibility];
    default:
      return null;
  }
}

export function PostVisibilityIcon({ visibility }: { visibility: string }) {
  const theme = useTheme();
  const presentation = getPresentation(visibility);
  if (!presentation) {
    return null;
  }

  const Icon = presentation.icon;
  return (
    <View
      accessible
      accessibilityLabel={presentation.label}
      accessibilityRole="image"
      style={styles.root}
    >
      <Icon color={theme.foregroundSecondary} size={16} />
    </View>
  );
}

const styles = StyleSheet.create({ root: { marginTop: spacing.md } });
