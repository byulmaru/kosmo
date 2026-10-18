import { ArrowLeft } from 'lucide-react-native';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHeader } from '@/components/PageHeader';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSizes, textStyles } from '@/theme/tokens';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import type { RefObject } from 'react';
import type { ViewStyle } from 'react-native';

type ProfileEditHeaderProps = {
  headingRef?: RefObject<Text | null>;
  onBack?: () => void;
  onSubmit?: () => void;
  saveDisabled?: boolean;
  saving?: boolean;
};

export function ProfileEditHeader({
  headingRef,
  onBack,
  onSubmit,
  saveDisabled = true,
  saving = false,
}: ProfileEditHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const webStickyHeader = {
    position: 'sticky',
    top: insets.top,
    zIndex: 10,
  } as unknown as ViewStyle;
  const header = (
    <PageHeader>
      <View testID="profile-edit-screen-header" style={styles.header}>
        <View style={styles.actionSlot}>
          {onBack ? (
            <IconButton
              accessibilityLabel="프로필 편집 닫기"
              disabled={saving}
              onPress={onBack}
              style={styles.backAction}
            >
              <ArrowLeft color={theme.foregroundPrimary} size={iconSizes[24]} strokeWidth={2} />
            </IconButton>
          ) : null}
        </View>

        <Text
          accessibilityRole="header"
          ref={headingRef}
          {...(Platform.OS === 'web' ? { tabIndex: -1 } : {})}
          style={[styles.title, { color: theme.foregroundPrimary }]}
        >
          프로필 수정
        </Text>

        <View style={[styles.actionSlot, styles.trailingActionSlot]}>
          <Button
            accessibilityLabel="저장"
            accessibilityState={{ busy: saving, disabled: saveDisabled }}
            disabled={saveDisabled}
            loading={saving}
            onPress={onSubmit}
            style={styles.saveAction}
          >
            저장
          </Button>
        </View>
      </View>
    </PageHeader>
  );

  return Platform.OS === 'web' ? (
    <View testID="profile-edit-screen-header-sticky" style={webStickyHeader}>
      {header}
    </View>
  ) : (
    header
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flex: 1,
    flexDirection: 'row',
  },
  actionSlot: {
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    justifyContent: 'center',
    width: 64,
  },
  backAction: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  trailingActionSlot: {
    alignItems: 'flex-end',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    ...textStyles.uiHeadingM,
  },
  saveAction: {
    minWidth: 64,
  },
});
