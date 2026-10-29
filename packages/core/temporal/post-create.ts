import type { ErrorCode } from '../error';
import type { ActivityPubPostInput, LocalPostInput } from '../services/post';

export type ActivityPubPostCreateInput = Omit<
  ActivityPubPostInput,
  'publishedAt' | 'receivedAt'
> & {
  publishedAt: string | null;
  receivedAt: string;
};

export type PostCreateActivityInput = {
  input: LocalPostInput | ActivityPubPostCreateInput;
  postId: string;
};

export type PostCreateActivityErrorKind =
  | 'note_media_validation_rejected'
  | 'reply_profile_blocked';

export type PostCreateActivityResult =
  | {
      ok: true;
      result: {
        authorProfileId: string;
        postId: string;
        replyParentFallback?: boolean;
        status: 'created' | 'duplicate';
      };
    }
  | {
      ok: false;
      error: {
        code: ErrorCode;
        field?: string;
        kind?: PostCreateActivityErrorKind;
        message: string;
      };
    };
