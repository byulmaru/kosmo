import { useState } from 'react';
import { View } from 'react-native';
import { ReactionProfilesModal } from './ReactionProfilesModal';
import { ReactionSummary } from './ReactionSummary';
import type { StyleProp, ViewStyle } from 'react-native';
import type { PostReactionController } from '@/components/post/PostReactionController';

type PostReactionSummaryProps = {
  controller: PostReactionController;
  style?: StyleProp<ViewStyle>;
};

export function PostReactionSummary({ controller, style }: PostReactionSummaryProps) {
  const [profilesOpen, setProfilesOpen] = useState(false);

  if (controller.reactionCounts.length === 0) {
    return null;
  }

  return (
    <View style={style}>
      <ReactionSummary
        disabled={controller.disabled}
        entries={controller.reactionCounts}
        errorTypeIds={controller.errorTypeIds}
        onMore={() => setProfilesOpen(true)}
        onToggle={controller.toggleReaction}
        pendingTypeIds={controller.pendingTypeIds}
        selectedTypeIds={controller.selectedTypeIds}
      />
      {profilesOpen ? (
        <ReactionProfilesModal
          key={controller.postId}
          onClose={() => setProfilesOpen(false)}
          postId={controller.postId}
          reactionCounts={controller.reactionCounts}
        />
      ) : null}
    </View>
  );
}
