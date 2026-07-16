import { createProfileFollowService } from '@kosmo/core/services';
import { profileFollowDelivery } from '@kosmo/fedify';

export const { followProfile, unfollowProfile } = createProfileFollowService({
  delivery: profileFollowDelivery,
});
