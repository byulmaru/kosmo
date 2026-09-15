import { useId, useRef } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { getReactionPeopleHref, rememberReactionPeopleReturnFocus } from './reactionPeopleRoute';
import { ReactionSummary } from './ReactionSummary';
import type { StyleProp, View as NativeView, ViewStyle } from 'react-native';
import type { PostReactionController } from '@/components/post/PostReactionController';

type PostReactionSummaryProps = {
  controller: PostReactionController;
  onPeopleNavigate?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function PostReactionSummary({
  controller,
  onPeopleNavigate: onNavigate,
  style,
}: PostReactionSummaryProps) {
  const peopleControlId = `reaction-people-${useId().replace(/:/g, '')}`;
  const peopleControlRef = useRef<NativeView>(null);
  const shellChrome = useShellChrome();
  if (!controller.reactionCounts.some(({ count }) => count > 0)) {
    return null;
  }

  const peopleHref = getReactionPeopleHref(controller.relativeHandle, controller.postId);
  const handlePeopleNavigate = () => {
    rememberReactionPeopleReturnFocus(
      peopleHref,
      peopleControlId,
      () => {
        const target = shellChrome?.screenFallbackRef?.current as unknown as {
          focus?: (options?: { preventScroll: boolean }) => void;
        } | null;
        target?.focus?.({ preventScroll: true });
      },
      () => {
        const target = peopleControlRef.current;
        if (!target) {
          return false;
        }
        AccessibilityInfo.sendAccessibilityEvent(target, 'focus');
        return true;
      },
    );
    onNavigate?.();
  };

  return (
    <View style={style}>
      <ReactionSummary
        disabled={controller.disabled}
        entries={controller.reactionCounts}
        errorTypeIds={controller.errorTypeIds}
        onMore={handlePeopleNavigate}
        onToggle={controller.toggleReaction}
        peopleControlId={peopleControlId}
        peopleControlRef={peopleControlRef}
        pendingTypeIds={controller.pendingTypeIds}
        peopleHref={peopleHref}
        selectedTypeIds={controller.selectedTypeIds}
      />
    </View>
  );
}
