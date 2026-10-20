import { useCallback, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ProfileBlockAction } from '@/components/profile/ProfileBlockAction';
import { Button } from '@/components/ui/Button';
import { FormOverlay } from '@/components/ui/FormOverlay';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, spacing, textStyles } from '@/theme/tokens';
import { ContentReportForm } from './ContentReportForm';
import type { ContentReportTarget } from './ContentReportContext';

const blockProfileFragment = graphql`
  fragment ContentReportOverlay_blockProfile on Profile {
    relativeHandle
    ...ProfileBlockAction_profile
  }
`;

type Props = {
  onRequestClose: () => void;
  target: ContentReportTarget | null;
  visible: boolean;
};

type ContentProps = Omit<Props, 'target'> & { target: ContentReportTarget };

export function ContentReportOverlay({ onRequestClose, target, visible }: Props) {
  if (!target) {
    return null;
  }

  return (
    <ContentReportOverlayContent
      key={`${target.kind}:${target.id}`}
      onRequestClose={onRequestClose}
      target={target}
      visible={visible}
    />
  );
}

function ContentReportOverlayContent({ onRequestClose, target, visible }: ContentProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < breakpoints.compact;
  const { selectedProfileId } = useSession();
  const blockProfile = useFragment(blockProfileFragment, target.blockProfile ?? null);
  const [delivered, setDelivered] = useState(false);
  const focusCompletionClose = useCallback((control: View | null) => {
    if (Platform.OS === 'web') {
      control?.focus();
    }
  }, []);
  const title = target.kind === 'PROFILE' ? '프로필 신고' : '게시물 신고';

  return (
    <FormOverlay
      bodyPadding={spacing.lg}
      bodyContentContainerStyle={delivered && compact ? styles.completionBody : undefined}
      continueEditingFocusSelector='textarea, [role="radio"]'
      discardConfirmLabel="신고 버리기"
      discardTitle="작성 중인 신고를 버릴까요?"
      fallbackFocusSelector='[data-content-report-focus-fallback], [data-testid="universal-shell-root"]'
      limitNativeHeight
      onRequestClose={onRequestClose}
      renderForm={({ close, onStateChange }) =>
        delivered ? (
          <View style={[styles.completion, delivered && compact ? styles.compactCompletion : null]}>
            <View style={styles.completionTop}>
              <Text
                accessibilityLiveRegion="polite"
                accessibilityRole="header"
                style={[styles.completionTitle, { color: theme.foregroundPrimary }]}
              >
                신고를 전달했어요
              </Text>
              {selectedProfileId && blockProfile ? (
                <View style={styles.blockSection}>
                  <Text
                    accessibilityRole="header"
                    style={[styles.blockTitle, { color: theme.foregroundPrimary }]}
                  >
                    {blockProfile.relativeHandle} 차단
                  </Text>
                  <Text style={[styles.blockResult, { color: theme.foregroundSecondary }]}>
                    서로의 게시물이 숨겨지고 팔로우가 해제돼요.
                  </Text>
                  <ProfileBlockAction
                    buttonLabel="차단하기"
                    nextBlocked
                    onBlocked={close}
                    presentation="reportCompletion"
                    profile={blockProfile}
                    surface="button"
                  />
                </View>
              ) : null}
            </View>
            <Button
              controlRef={focusCompletionClose}
              onPress={close}
              style={styles.fullWidthButton}
              tone="primary"
            >
              완료
            </Button>
          </View>
        ) : (
          <ContentReportForm
            onDelivered={() => setDelivered(true)}
            onStateChange={onStateChange}
            target={target}
          />
        )
      }
      testIDPrefix="content-report"
      title={title}
      visible={visible}
    />
  );
}

const styles = StyleSheet.create({
  completion: { gap: spacing.xl, width: '100%' },
  completionBody: { flexGrow: 1 },
  compactCompletion: { flexGrow: 1, justifyContent: 'space-between' },
  completionTop: { gap: spacing.xl, width: '100%' },
  completionTitle: textStyles.uiHeadingM,
  blockSection: { gap: spacing.sm, width: '100%' },
  blockTitle: textStyles.uiLabelL,
  blockResult: textStyles.uiCopyM,
  fullWidthButton: { minWidth: 0, width: '100%' },
});
