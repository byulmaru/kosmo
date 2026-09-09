import { ActionMenu } from '@/components/ui/ActionMenu';
import { ProfileMoreButton } from './ProfileMoreButton';
import type { ComponentProps, RefObject } from 'react';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';

type Props = {
  disabled?: boolean;
  items: readonly ActionMenuItem[];
  focusTriggerRef?: RefObject<() => void>;
  renderTrigger?: ComponentProps<typeof ActionMenu>['renderTrigger'];
};

/** Menu presentation only. Supplied actions own requests and completion lifecycles. */
export function ProfileMoreMenu({
  disabled = false,
  items,
  focusTriggerRef,
  renderTrigger,
}: Props) {
  return (
    <ActionMenu
      accessibilityLabel="더보기"
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
