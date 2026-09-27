import { useCallback, useEffect, useRef, useState } from 'react';
import { useRelayEnvironment } from 'react-relay';
import { reactionEmojiPickerOptions } from '@/components/reaction/reactionEmojiCatalog';
import { FullReactionOverlay } from './FullReactionOverlay';
import type { ReactNode, Ref } from 'react';
import type { View } from 'react-native';
import type { FullReactionPickerOption } from '@/components/reaction/FullReactionPicker';
import type { PostActionExecution, PostActionResolutionReason } from './postActionAvailability';
import type { PostReactionController } from './PostReactionController';

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
  const [fullOpen, setFullOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<View | null>(null);
  const triggerDisabled =
    execution.kind === 'disabled' || (execution.kind === 'enabled' && controller.disabled);

  useEffect(() => {
    setFullOpen(false);
    setQuery('');
  }, [controller.disabled, controller.postId, environment, execution.kind]);

  const toggleFull = useCallback(() => {
    if (execution.kind === 'resolution-required') {
      onResolutionRequired?.(execution.reason);
    } else if (execution.kind === 'enabled' && !controller.disabled) {
      setFullOpen((current) => !current);
    }
  }, [controller.disabled, execution, onResolutionRequired]);
  const closeFull = useCallback(() => setFullOpen(false), []);
  const selectFull = useCallback(
    (option: FullReactionPickerOption) => {
      if (controller.pendingTypeIds.includes(option.id)) {
        return;
      }
      controller.toggleReaction({
        nextSelected: !controller.selectedTypeIds.includes(option.id),
        optionId: option.id,
      });
    },
    [controller],
  );

  return (
    <>
      {renderTrigger({
        disabled: triggerDisabled,
        expanded: execution.kind === 'enabled' && fullOpen,
        hasReacted: controller.selectedTypeIds.length > 0,
        onPress: toggleFull,
        ref: triggerRef,
      })}
      <FullReactionOverlay
        onClose={closeFull}
        onQueryChange={setQuery}
        onSelect={selectFull}
        open={fullOpen}
        options={reactionEmojiPickerOptions}
        pendingOptionIds={controller.pendingTypeIds}
        errorOptionIds={controller.errorTypeIds}
        query={query}
        selectedValues={controller.selectedTypeIds}
        triggerRef={triggerRef}
      />
    </>
  );
}
