import { Link } from 'expo-router';
import { X } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isPrimaryWebActivation, saveHomeReturnTarget } from '@/auth/publicContentReturn';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, breakpoints, space, spacing, textStyles } from '@/theme/tokens';
import { getPublicContentInvitationPlacement } from './publicContentInvitationLayout';
import type { ViewStyle } from 'react-native';

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
  const placement = getPublicContentInvitationPlacement({
    height,
    safeAreaBottom: insets.bottom,
    width,
  });

  if (!visible) {
    return null;
  }

  const compact = width < breakpoints.compact;
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
      <View style={[styles.content, compact ? styles.mobileContent : styles.wideContent]}>
        <View style={[styles.copy, compact ? styles.mobileCopy : undefined]}>
          <Text
            accessibilityRole="header"
            style={[textStyles.uiLabelL, { color: theme.foregroundPrimary }]}
          >
            공개 콘텐츠를 보고 있어요
          </Text>
          <Text style={[textStyles.uiCopyS, { color: theme.textSecondary }]}>
            로그인하면 프로필을 선택하거나 만들고 대화에 참여할 수 있어요.
          </Text>
        </View>
        <View style={[styles.actions, compact ? styles.mobileActions : undefined]}>
          <NavigationLink href="/" primary>
            <Button
              onPress={(event) => {
                if (isPrimaryWebActivation(event)) {
                  saveHomeReturnTarget(pathname);
                }
              }}
              style={compact ? styles.mobileCtaButton : undefined}
            >
              KOSMO에서 계속하기
            </Button>
          </NavigationLink>
          <View style={[styles.links, compact ? styles.mobileLinks : undefined]}>
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
  );
}

const styles = StyleSheet.create({
  root: {
    borderTopWidth: borderWidths[1],
    paddingHorizontal: spacing.lg,
    paddingVertical: space[12],
  },
  flowRoot: { position: 'relative', width: '100%' },
  content: { gap: space[16], minWidth: 0 },
  wideContent: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  mobileContent: { flexDirection: 'column' },
  copy: { flex: 1, gap: space[8], minWidth: 0, paddingRight: 44 },
  mobileCopy: { paddingRight: 44 },
  actions: { alignItems: 'flex-start', gap: space[8] },
  mobileActions: { alignItems: 'stretch' },
  mobileCtaButton: { width: '100%' },
  links: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  mobileLinks: { justifyContent: 'center' },
  textLink: { justifyContent: 'center', minHeight: 36, paddingVertical: space[8] },
  closeButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: space[8],
    top: space[8],
    width: 44,
  },
});
