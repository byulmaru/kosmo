import { Follow } from '@fedify/fedify';
import { acceptFollowListener } from './follow';
import type { Accept, InboxListener } from '@fedify/fedify';
import type { FederationContextData } from '../../type';

export const acceptListener: InboxListener<FederationContextData, Accept> = async (ctx, accept) => {
  const object = await accept.getObject();

  if (object instanceof Follow) {
    await acceptFollowListener(ctx, accept, object);
  }
};
