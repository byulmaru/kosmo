import { StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyles } from '@/theme/tokens';

export function SupportAcknowledgement({
  breakBeforeInstitute = false,
}: {
  breakBeforeInstitute?: boolean;
}) {
  const theme = useTheme();

  return (
    <Text style={[styles.text, { color: theme.foregroundDisabled }]}>
      이 성과는 2026년도 과학기술정보통신부의 재원으로
      {breakBeforeInstitute ? '\n' : ' '}
      정보통신기획평가원의 지원을 받아 수행된 결과물임{'\n'}
      (IITP-2026-AI·SW마에스트로)
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { ...textStyles.uiCopyS, alignSelf: 'stretch', flexShrink: 1, minWidth: 0 },
});
