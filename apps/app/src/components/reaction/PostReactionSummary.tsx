import { View } from 'react-native';
import { getReactionPeopleHref } from './reactionPeopleRoute';
import { ReactionSummary } from './ReactionSummary';
import type { RefObject } from 'react';
import type { StyleProp, View as NativeView, ViewStyle } from 'react-native';
import type { PostReactionController } from '@/components/post/PostReactionController';

type PostReactionSummaryProps = {
  anchorRef?: RefObject<NativeView | null>;
  controller: PostReactionController;
  onReady?: () => void;
  onBackgroundPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function PostReactionSummary({
  anchorRef,
  controller,
  onReady,
  onBackgroundPress,
  style,
}: PostReactionSummaryProps) {
  if (!controller.reactionCounts.some(({ count }) => count > 0)) {
    return onReady ? <View onLayout={onReady} style={style} /> : null;
  }

  const peopleHref = getReactionPeopleHref(controller.relativeHandle, controller.postId);
  return (
    <View style={style}>
      <ReactionSummary
        disabled={controller.disabled}
        entries={controller.reactionCounts}
        errorTypeIds={controller.errorTypeIds}
        firstEntryRef={controller.disabled ? undefined : anchorRef}
        onFirstEntryLayout={onReady}
        onBackgroundPress={onBackgroundPress}
        onToggle={controller.toggleReaction}
        pendingTypeIds={controller.pendingTypeIds}
        peopleHref={peopleHref}
        selectedTypeIds={controller.selectedTypeIds}
      />
    </View>
  );
}
