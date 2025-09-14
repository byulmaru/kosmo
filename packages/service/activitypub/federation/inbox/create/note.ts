import { isActor, PUBLIC_COLLECTION } from '@fedify/fedify';
import { PostVisibility } from '@kosmo/enum';
import { PostService } from '@kosmo/service';
import { getOrCreateProfileId } from '../../profile';
import type { Note } from '@fedify/fedify';
import type { InboxCreateListener } from '../../type';

export const createNoteListener: InboxCreateListener<Note> = async (ctx, create, note) => {
  if (note.attributionId === null) {
    return;
  }

  const author = await note.getAttribution();

  if (!isActor(author) || author.id?.href !== create.actorId?.href) {
    return;
  }

  const profileId = await getOrCreateProfileId({ actor: author });

  let visibility: PostVisibility;

  const to = new Set(note.toIds.map((url) => url.href));
  const cc = new Set(note.ccIds.map((url) => url.href));

  if (to.has(PUBLIC_COLLECTION.href)) {
    visibility = PostVisibility.PUBLIC;
  } else if (cc.has(PUBLIC_COLLECTION.href)) {
    visibility = PostVisibility.UNLISTED;
  } else if (author.followersId && to.has(author.followersId.href)) {
    visibility = PostVisibility.FOLLOWER;
  } else {
    visibility = PostVisibility.DIRECT;
  }

  await PostService.create.call({
    profileId,
    isLocal: false,
    data: {
      content: note.content?.toString() ?? '',
      visibility,
    },
  });
};
