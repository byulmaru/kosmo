import { View } from 'react-native';
import { getReactionPeopleHref } from './reactionPeopleRoute';
import { ReactionSummary } from './ReactionSummary';
import type { StyleProp, ViewStyle } from 'react-native';
import type { PostReactionController } from '@/components/post/PostReactionController';

type PostReactionSummaryProps = {
  controller: PostReactionController;
  onBackgroundPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function PostReactionSummary({
  controller,
  onBackgroundPress,
  style,
}: PostReactionSummaryProps) {
  if (!controller.reactionCounts.some(({ count }) => count > 0)) {
    return null;
  }

  const peopleHref = getReactionPeopleHref(controller.relativeHandle, controller.postSlug);
  return (
    <View style={style}>
      <ReactionSummary
        disabled={controller.disabled}
        entries={controller.reactionCounts}
        errorTypeIds={controller.errorTypeIds}
        onBackgroundPress={onBackgroundPress}
        onToggle={controller.toggleReaction}
        pendingTypeIds={controller.pendingTypeIds}
        peopleHref={peopleHref}
        selectedTypeIds={controller.selectedTypeIds}
      />
    </View>
  );
}
