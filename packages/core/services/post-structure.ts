import { ValidationError } from '../error';

type PostStructure = {
  currentContentId: string | null;
  id: string;
  replyParentId: string | null;
  repostSourceId: string | null;
};

export const validatePostStructure = ({
  currentContentId,
  id,
  replyParentId,
  repostSourceId,
}: PostStructure): void => {
  if (replyParentId === id) {
    throw new ValidationError('Post cannot reply to itself', { field: 'replyParentId' });
  }
  if (repostSourceId === id) {
    throw new ValidationError('Post cannot repost itself', { field: 'repostSourceId' });
  }
  if (currentContentId === null && replyParentId !== null) {
    throw new ValidationError('Reply must have content', { field: 'replyParentId' });
  }
  if (currentContentId === null && repostSourceId === null) {
    throw new ValidationError('Post must have content or a repost source', {
      field: 'repostSourceId',
    });
  }
};
