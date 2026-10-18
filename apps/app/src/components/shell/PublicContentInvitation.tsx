import { Link } from 'expo-router';
import { X } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isPrimaryWebActivation, saveHomeReturnTarget } from '@/auth/publicContentReturn';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, space, spacing, textStyles } from '@/theme/tokens';
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
        <View style={styles.actions}>
          <NavigationLink href="/" primary>
            <Button
              onPress={(event) => {
                if (isPrimaryWebActivation(event)) {
                  saveHomeReturnTarget(pathname);
                }
              }}
              style={styles.ctaButton}
              tone="inverse"
            >
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
        <IconButton
          accessibilityLabel="가입 안내 닫기"
          onPress={onDismiss}
          targetSize={44}
          visualSize={44}
        >
          <X color={theme.foregroundPrimary} size={18} strokeWidth={2} />
        </IconButton>
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
  content: { alignItems: 'flex-start', flexDirection: 'row', gap: space[8], minWidth: 0 },
  actions: { alignItems: 'stretch', flex: 1, gap: space[8], minWidth: 0 },
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
