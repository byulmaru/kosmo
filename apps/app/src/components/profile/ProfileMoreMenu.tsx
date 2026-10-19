import { ActionMenu } from '@/components/ui/ActionMenu';
import { ProfileMoreButton } from './ProfileMoreButton';
import type { ComponentProps, RefObject } from 'react';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';

type Props = {
  accessibilityLabel?: string;
  disabled?: boolean;
  items: readonly ActionMenuItem[];
  focusTriggerRef?: RefObject<() => void>;
  onTriggerReady?: (focusTrigger: () => void) => void;
  renderTrigger?: ComponentProps<typeof ActionMenu>['renderTrigger'];
};

/** Menu presentation only. Supplied actions own requests and completion lifecycles. */
export function ProfileMoreMenu({
  accessibilityLabel = '더보기',
  disabled = false,
  items,
  focusTriggerRef,
  onTriggerReady,
  renderTrigger,
}: Props) {
  return (
    <ActionMenu
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      items={items}
      webMinWidth={160}
      {...(renderTrigger
        ? { webHorizontalPlacement: 'end' as const }
        : { webPlacement: 'overlap-end' as const })}
      renderTrigger={(trigger) => {
        if (focusTriggerRef) {
          focusTriggerRef.current = trigger.focusTrigger;
        }
        onTriggerReady?.(trigger.focusTrigger);
        return renderTrigger ? (
          renderTrigger(trigger)
        ) : (
          <ProfileMoreButton
            controlRef={trigger.ref}
            disabled={disabled}
            expanded={trigger.expanded}
            onPress={trigger.onPress}
          />
        );
      }}
    />
  );
}
