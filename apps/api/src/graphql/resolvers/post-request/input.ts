import { builder } from '@/graphql/builder';
import { Media } from '../media/ref';
import { localPostRequestInputSchema } from '../post/mutation/prepare-local-input';

export {
  CreatePostMentionInput,
  localPostMediaArraySchema as postRequestMediaArraySchema,
} from '../post/mutation/prepare-local-input';

export const PostRequestMediaInput = builder.inputType('PostRequestMediaInput', {
  fields: (t) => ({
    altText: t.string({ required: false }),
    applyNightshade: t.boolean(),
    mediaId: t.globalID({ for: Media }),
  }),
});

export const postRequestInputSchema = localPostRequestInputSchema;
