import { useEffect, useState } from 'react';
import { useRelayEnvironment } from 'react-relay';
import { ReactionSelector } from '@/components/reaction/ReactionSelector';
import { ReactionPopover } from './ReactionPopover';
import type { ReactNode, Ref } from 'react';
import type { View } from 'react-native';
import type { ReactionOption } from '@/components/reaction/ReactionSelector';
import type { PostReactionController } from './PostReactionController';

const reactionOptions = ['🥹', '❤️', '🎉', '👀', '☘️', '🌈'].map((type) => ({
  emoji: type,
  id: type,
  label: type,
})) satisfies ReadonlyArray<ReactionOption>;

export type ReactionActionTriggerRenderProps = Readonly<{
  disabled: boolean;
  expanded: boolean;
  hasReacted: boolean;
  onPress: () => void;
  ref: Ref<View>;
}>;

export type ReactionActionProps = Readonly<{
  controller: PostReactionController;
  renderTrigger: (props: ReactionActionTriggerRenderProps) => ReactNode;
}>;

export function ReactionAction({ controller, renderTrigger }: ReactionActionProps): ReactNode {
  const environment = useRelayEnvironment();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [controller.disabled, controller.postId, environment]);

  return (
    <ReactionPopover
      accessibilityLabel="반응 선택"
      disabled={controller.disabled}
      onOpenChange={setOpen}
      open={open}
      renderTrigger={({ expanded, onPress, ref }) =>
        renderTrigger({
          disabled: controller.disabled,
          expanded,
          hasReacted: controller.selectedTypeIds.length > 0,
          onPress,
          ref,
        })
      }
    >
      <ReactionSelector
        errorOptionIds={controller.errorTypeIds}
        onToggle={controller.toggleReaction}
        options={reactionOptions}
        pendingOptionIds={controller.pendingTypeIds}
        selectedOptionIds={controller.selectedTypeIds}
      />
    </ReactionPopover>
  );
}
