import { StyleSheet, Text, View } from 'react-native';
import { homepageCopy } from '@/homepage';
import { useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';

export function PublicHomeIntroduction() {
  const theme = useTheme();

  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={[textStyles.uiHeadingM, { color: theme.text }]}>
        {homepageCopy.brand}
      </Text>
      <Text style={[textStyles.uiCopyL, { color: theme.textSecondary }]}>{homepageCopy.intro}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[8], paddingHorizontal: space[16], paddingVertical: space[16] },
});
