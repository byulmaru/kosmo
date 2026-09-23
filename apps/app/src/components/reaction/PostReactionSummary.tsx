import { View } from 'react-native';
import { getReactionPeopleHref } from './reactionPeopleRoute';
import { ReactionSummary } from './ReactionSummary';
import type { StyleProp, ViewStyle } from 'react-native';
import type { PostReactionController } from '@/components/post/PostReactionController';

type PostReactionSummaryProps = {
  controller: PostReactionController;
  style?: StyleProp<ViewStyle>;
};

export function PostReactionSummary({ controller, style }: PostReactionSummaryProps) {
  if (!controller.reactionCounts.some(({ count }) => count > 0)) {
    return null;
  }

  const peopleHref = getReactionPeopleHref(controller.relativeHandle, controller.postId);
  return (
    <View style={style}>
      <ReactionSummary
        disabled={controller.disabled}
        entries={controller.reactionCounts}
        errorTypeIds={controller.errorTypeIds}
        onToggle={controller.toggleReaction}
        pendingTypeIds={controller.pendingTypeIds}
        peopleHref={peopleHref}
        selectedTypeIds={controller.selectedTypeIds}
      />
    </View>
  );
}
