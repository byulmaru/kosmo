import { useEffect, useState } from 'react';
import { useRelayEnvironment } from 'react-relay';
import { ReactionSelector } from '@/components/reaction/ReactionSelector';
import { ReactionPopover } from './ReactionPopover';
import type { ReactNode, Ref } from 'react';
import type { View } from 'react-native';
import type { ReactionOption } from '@/components/reaction/ReactionSelector';
import type { PostActionExecution, PostActionResolutionReason } from './postActionAvailability';
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
  execution?: PostActionExecution;
  onResolutionRequired?: (reason: PostActionResolutionReason) => void;
  renderTrigger: (props: ReactionActionTriggerRenderProps) => ReactNode;
}>;

export function ReactionAction({
  controller,
  execution = { kind: 'enabled' },
  onResolutionRequired,
  renderTrigger,
}: ReactionActionProps): ReactNode {
  const environment = useRelayEnvironment();
  const [open, setOpen] = useState(false);
  const pickerDisabled = execution.kind !== 'enabled' || controller.disabled;
  const triggerDisabled =
    execution.kind === 'disabled' || (execution.kind === 'enabled' && controller.disabled);

  useEffect(() => {
    setOpen(false);
  }, [controller.disabled, controller.postId, environment, execution.kind]);

  return (
    <ReactionPopover
      accessibilityLabel="반응 선택"
      disabled={pickerDisabled}
      onOpenChange={setOpen}
      open={open}
      renderTrigger={({ expanded, onPress, ref }) => {
        const triggerPress =
          execution.kind === 'resolution-required'
            ? () => onResolutionRequired?.(execution.reason)
            : onPress;
        return renderTrigger({
          disabled: triggerDisabled,
          expanded: execution.kind === 'enabled' ? expanded : false,
          hasReacted: controller.selectedTypeIds.length > 0,
          onPress: triggerPress,
          ref,
        });
      }}
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
