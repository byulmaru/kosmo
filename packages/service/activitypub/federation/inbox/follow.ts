import { Follow } from '@fedify/fedify';
import { ProfileFollowAcceptMode } from '@kosmo/enum';
import { ActivityPubService, ProfileService } from '@kosmo/service';
import { getOrCreateProfileId } from '../profile';
import type { InboxListener } from '@fedify/fedify';
import type { FederationContextData } from '../type';

export const followListener: InboxListener<FederationContextData, Follow> = async (ctx, follow) => {
  const object = ctx.parseUri(follow.objectId);
  if (object === null || object.type !== 'actor') {
    return;
  }

  const follower = await follow.getActor();
  if (follower === null || follower.id === null || follower.inboxId === null) {
    return;
  }

  const actorProfileId = await getOrCreateProfileId({ actor: follower });

  const { followAcceptMode } = await ProfileService.follow.call({
    actorProfileId,
    targetProfileId: object.identifier,
  });

  if (followAcceptMode === ProfileFollowAcceptMode.AUTO) {
    await ActivityPubService.sendAcceptFollow.queue({
      sender: { profileId: actorProfileId },
      recipient: {
        profileId: object.identifier,
      },
    });
  }
};
