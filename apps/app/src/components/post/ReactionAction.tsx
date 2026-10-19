import { useCallback, useEffect, useRef, useState } from 'react';
import { useRelayEnvironment } from 'react-relay';
import { reactionEmojiPickerOptions } from '@/components/reaction/reactionEmojiCatalog';
import {
  readRecentReactions,
  RECENT_REACTION_LIMIT,
  recordRecentReaction,
} from '@/lib/recentReactions';
import { useSession } from '@/session/SessionProvider';
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
  const { selectedProfileId } = useSession();
  const [fullOpen, setFullOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recentValues, setRecentValues] = useState<string[]>([]);
  const triggerRef = useRef<View | null>(null);
  const triggerDisabled =
    execution.kind === 'disabled' || (execution.kind === 'enabled' && controller.disabled);

  useEffect(() => {
    setFullOpen(false);
    setQuery('');
  }, [controller.disabled, controller.postId, environment, execution.kind]);

  useEffect(() => {
    if (!fullOpen || !selectedProfileId) {
      return;
    }
    let active = true;
    setRecentValues([]);
    void readRecentReactions(selectedProfileId).then((stored) => {
      if (active) {
        setRecentValues((current) =>
          [...current, ...stored.filter((id) => !current.includes(id))].slice(
            0,
            RECENT_REACTION_LIMIT,
          ),
        );
      }
    });
    return () => {
      active = false;
    };
  }, [fullOpen, selectedProfileId]);

  const toggleFull = useCallback(() => {
    if (execution.kind === 'resolution-required') {
      onResolutionRequired?.(execution.reason);
    } else if (execution.kind === 'enabled' && !controller.disabled) {
      setQuery('');
      setFullOpen((current) => !current);
    }
  }, [controller.disabled, execution, onResolutionRequired]);
  const closeFull = useCallback(() => {
    setFullOpen(false);
    setQuery('');
  }, []);
  const selectFull = useCallback(
    (option: FullReactionPickerOption) => {
      if (controller.pendingTypeIds.includes(option.id)) {
        return;
      }
      const nextSelected = !controller.selectedTypeIds.includes(option.id);
      controller.toggleReaction({
        nextSelected,
        optionId: option.id,
      });
      if (nextSelected && selectedProfileId) {
        setRecentValues((current) =>
          [option.id, ...current.filter((id) => id !== option.id)].slice(0, RECENT_REACTION_LIMIT),
        );
        void recordRecentReaction(selectedProfileId, option.id);
      }
    },
    [controller, selectedProfileId],
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
        recentValues={recentValues}
        selectedValues={controller.selectedTypeIds}
        triggerRef={triggerRef}
      />
    </>
  );
}
