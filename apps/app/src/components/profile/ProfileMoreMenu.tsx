import { Ban, ShieldOff, Volume2, VolumeOff } from 'lucide-react-native';
import { useRef } from 'react';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { useProfileBlockConfirmation } from './ProfileBlockAction';
import { ProfileMoreButton } from './ProfileMoreButton';
import { useProfileMuteConfirmation } from './ProfileMuteAction';
import type { ComponentProps } from 'react';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';
import type { ProfileBlockMenuControl } from './ProfileBlockAction';
import type { ProfileMuteControl } from './ProfileMuteAction';

type Props = {
  block?: ProfileBlockMenuControl;
  displayName: string;
  items: readonly ActionMenuItem[];
  mute?: ProfileMuteControl;
  profileId: string;
  renderTrigger?: ComponentProps<typeof ActionMenu>['renderTrigger'];
};

export function ProfileMoreMenu(props: Props) {
  return <ProfileMoreMenuContent key={props.profileId} {...props} />;
}

function ProfileMoreMenuContent({ block, displayName, items, mute, renderTrigger }: Props) {
  const focusTrigger = useRef<() => void>(() => {});
  const restoreTriggerFocus = () => focusTrigger.current();
  const muteAction = useProfileMuteConfirmation({
    displayName,
    muted: mute?.muted ?? false,
    onChangeMuted: mute?.onChangeMuted,
    onFeedback: mute?.onFeedback,
    restoreTriggerFocus,
  });
  const blockAction = useProfileBlockConfirmation({
    blocked: block?.blocked ?? false,
    displayName,
    onChangeBlocked: block?.blocked ? block.onUnblock : block?.onBlock,
    onFeedback: block?.onFeedback,
    onDismiss: block?.onDismiss,
    restoreTriggerFocus,
  });
  const pending = muteAction.pending || blockAction.pending;
  return (
    <>
      <ActionMenu
        webMinWidth={160}
        accessibilityLabel="더보기"
        disabled={pending}
        items={[
          ...items,
          ...(mute
            ? [
                {
                  icon: mute.muted ? Volume2 : VolumeOff,
                  key: 'mute',
                  label: mute.muted ? '뮤트 해제' : '뮤트',
                  onSelect: muteAction.activate,
                },
              ]
            : []),
          ...(block
            ? [
                {
                  icon: block.blocked ? ShieldOff : Ban,
                  key: 'block',
                  label: block.blocked ? '차단 해제' : '차단',
                  onSelect: blockAction.activate,
                  tone: block.blocked ? ('default' as const) : ('danger' as const),
                },
              ]
            : []),
        ]}
        {...(renderTrigger
          ? { webHorizontalPlacement: 'end' as const }
          : { webPlacement: 'overlap-end' as const })}
        renderTrigger={(trigger) => {
          focusTrigger.current = trigger.focusTrigger;
          return renderTrigger ? (
            renderTrigger(trigger)
          ) : (
            <ProfileMoreButton
              controlRef={trigger.ref}
              disabled={pending}
              expanded={trigger.expanded}
              onPress={trigger.onPress}
            />
          );
        }}
      />
      {muteAction.confirmation}
      {blockAction.confirmation}
    </>
  );
}
