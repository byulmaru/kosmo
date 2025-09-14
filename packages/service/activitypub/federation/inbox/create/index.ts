import { Note } from '@fedify/fedify';
import { createNoteListener } from './note';
import type { Create, InboxListener } from '@fedify/fedify';
import type { FederationContextData } from '../../type';

export const createListener: InboxListener<FederationContextData, Create> = async (ctx, create) => {
  const object = await create.getObject();

  if (object instanceof Note) {
    await createNoteListener(ctx, create, object);
  }
};
