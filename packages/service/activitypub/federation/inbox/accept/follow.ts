import { ProfileService } from '@kosmo/service';
import { getOrCreateProfile } from '../../profile';
import type { Follow } from '@fedify/fedify';
import type { InboxAcceptListener } from '../../type';

export const acceptFollowListener: InboxAcceptListener<Follow> = async (ctx, accept, follow) => {
  if (
    accept.actorId === null ||
    follow.objectId === null ||
    accept.actorId.href !== follow.objectId.href
  ) {
    console.error('Invalid follow request', { follow, accept });
    return;
  }

  const followActor = ctx.parseUri(follow.actorId);
  if (followActor?.type !== 'actor') {
    console.error('Invalid follow actor', { follow, accept });
    return;
  }

  const followTargetActor = await accept.getActor();
  if (
    followTargetActor === null ||
    followTargetActor.id === null ||
    followTargetActor.inboxId === null
  ) {
    console.error('Invalid follow target actor', { follow, accept });
    return;
  }

  const followTargetProfile = await getOrCreateProfile({ actor: followTargetActor });

  await ProfileService.followRequestAccept.call({
    actorProfileId: followActor.identifier,
    targetProfileId: followTargetProfile.id,
  });
};
