import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useRelayEnvironment } from 'react-relay';
import { reactionEmojiCatalog } from '@/components/reaction/reactionEmojiCatalog';
import { ReactionSelector } from '@/components/reaction/ReactionSelector';
import { useTheme } from '@/theme/ThemeProvider';
import { FullReactionOverlay } from './FullReactionOverlay';
import { ReactionPopover } from './ReactionPopover';
import type { ReactNode, Ref } from 'react';
import type { View } from 'react-native';
import type { FullReactionPickerOption } from '@/components/reaction/FullReactionPicker';
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
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<View | null>(null);
  const pickerDisabled = execution.kind !== 'enabled' || controller.disabled;
  const triggerDisabled =
    execution.kind === 'disabled' || (execution.kind === 'enabled' && controller.disabled);

  useEffect(() => {
    setOpen(false);
    setFullOpen(false);
    setQuery('');
  }, [controller.disabled, controller.postId, environment, execution.kind]);

  const openFull = useCallback(() => {
    setOpen(false);
    setFullOpen(true);
  }, []);
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
      <ReactionPopover
        accessibilityLabel="반응 선택"
        disabled={pickerDisabled}
        onOpenChange={setOpen}
        open={open}
        triggerRef={triggerRef}
        renderTrigger={({ expanded, onPress, ref }) => {
          const triggerPress =
            execution.kind === 'resolution-required'
              ? () => onResolutionRequired?.(execution.reason)
              : onPress;
          return renderTrigger({
            disabled: triggerDisabled,
            expanded: execution.kind === 'enabled' ? expanded || fullOpen : false,
            hasReacted: controller.selectedTypeIds.length > 0,
            onPress: triggerPress,
            ref,
          });
        }}
      >
        <>
          <ReactionSelector
            errorOptionIds={controller.errorTypeIds}
            onToggle={controller.toggleReaction}
            options={reactionOptions}
            pendingOptionIds={controller.pendingTypeIds}
            selectedOptionIds={controller.selectedTypeIds}
          />
          <Pressable
            accessibilityLabel="전체 반응"
            accessibilityRole="button"
            onPress={openFull}
            style={{ alignItems: 'center', height: 32, justifyContent: 'center', width: 32 }}
          >
            <Text style={{ color: theme.foregroundPrimary }}>＋</Text>
          </Pressable>
        </>
      </ReactionPopover>
      <FullReactionOverlay
        onClose={closeFull}
        onQueryChange={setQuery}
        onSelect={selectFull}
        open={fullOpen}
        options={reactionEmojiCatalog}
        pendingOptionIds={controller.pendingTypeIds}
        errorOptionIds={controller.errorTypeIds}
        query={query}
        selectedValues={controller.selectedTypeIds}
        triggerRef={triggerRef}
      />
    </>
  );
}
