import { Link } from 'expo-router';
import { X } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildSignupHomeHref } from '@/auth/publicContentReturn';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import {
  borderWidths,
  breakpoints,
  fontWeights,
  radius,
  space,
  spacing,
  textStyles,
} from '@/theme/tokens';
import { getPublicContentInvitationPlacement } from './publicContentInvitationLayout';
import type { TextStyle, ViewStyle } from 'react-native';

type Props = {
  onDismiss: () => void;
  onLayout: (height: number) => void;
  pathname: string;
  visible: boolean;
};

export function PublicContentInvitation({ onDismiss, onLayout, pathname, visible }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const mobile = width < breakpoints.compact;
  const placement = getPublicContentInvitationPlacement({
    height,
    safeAreaBottom: insets.bottom,
    width,
  });

  if (!visible) {
    return null;
  }

  const positionedStyle =
    placement.mode === 'fixed'
      ? ({
          bottom: placement.bottom,
          left: placement.left,
          position: 'fixed',
          right: placement.right,
          zIndex: 40,
        } as unknown as ViewStyle)
      : styles.flowRoot;

  return (
    <View
      accessibilityLabel="가입 안내"
      onLayout={(event) => onLayout(event.nativeEvent.layout.height)}
      role="region"
      style={[
        styles.root,
        positionedStyle,
        {
          backgroundColor: theme.backgroundCanvas,
          borderColor: theme.borderSubtle,
        },
      ]}
      testID="public-content-invitation"
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text
            style={[
              mobile ? textStyles.uiCopyS : textStyles.uiCopyL,
              styles.invitationText,
              { color: theme.foregroundPrimary },
            ]}
          >
            {mobile ? null : '지금 가입하고 '}
            <Text style={styles.emphasis}>취향이 통하는 사람들</Text>
            {mobile ? '과 함께해요.' : '과 이야기를 나눠보세요.'}
          </Text>
          <IconButton
            accessibilityLabel="가입 안내 닫기"
            onPress={onDismiss}
            style={styles.closeButton}
            targetSize={44}
            visualSize={44}
          >
            <X color={theme.foregroundPrimary} size={18} strokeWidth={2} />
          </IconButton>
        </View>
        <View style={styles.actions}>
          <NavigationLink href={buildSignupHomeHref(pathname)} primary>
            <Button style={styles.ctaButton}>
              <Text style={textStyles.uiLabelL}>KOSMO에서 계속하기</Text>
            </Button>
          </NavigationLink>
          <View style={styles.links}>
            <Link
              asChild
              href="https://byulmaru.co/about-us"
              rel="noopener noreferrer"
              target="_blank"
            >
              <Pressable accessibilityRole="link" style={styles.textLink}>
                <Text style={[textStyles.uiCopyS, { color: theme.textSecondary }]}>
                  팀 별마루 소개
                </Text>
              </Pressable>
            </Link>
            <NavigationLink href="/privacy">
              <Pressable accessibilityRole="link" style={styles.textLink}>
                <Text style={[textStyles.uiCopyS, { color: theme.textSecondary }]}>
                  개인정보처리방침
                </Text>
              </Pressable>
            </NavigationLink>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderTopWidth: borderWidths[1],
    paddingHorizontal: spacing.lg,
    paddingVertical: space[12],
  },
  flowRoot: { position: 'relative', width: '100%' },
  content: { gap: space[8], minWidth: 0 },
  header: { justifyContent: 'center', minHeight: 44, paddingHorizontal: 44 + space[8] },
  // This banner is Web-only: keep Korean words intact and balance wrapped lines.
  invitationText: {
    minWidth: 0,
    textAlign: 'center',
    textWrap: 'balance',
    width: '100%',
    wordBreak: 'keep-all',
  } as TextStyle,
  emphasis: { fontWeight: fontWeights.bold },
  closeButton: { position: 'absolute', right: 0, top: 0 },
  actions: { alignItems: 'stretch', gap: space[8], minWidth: 0 },
  ctaButton: { borderRadius: radius.full, minHeight: space[48], width: '100%' },
  links: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'center',
  },
  textLink: { justifyContent: 'center', minHeight: 36, paddingVertical: space[8] },
});
