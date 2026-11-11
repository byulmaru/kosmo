import { db, first, Instances, Posts, Profiles } from '@kosmo/core/db';
import { parsePostReference } from '@kosmo/core/post-reference';
import { and, eq, getColumns } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { directPostAccessWhere } from '../access';
import { Post } from '../ref';

builder.queryField('postByReference', (t) =>
  t.field({
    type: Post,
    nullable: true,
    args: {
      reference: t.arg.string({ required: true }),
    },
    resolve: async (_, { reference }, ctx) => {
      const parsedReference = parsePostReference(reference);
      if (!parsedReference) {
        return null;
      }

      return db
        .select(getColumns(Posts))
        .from(Posts)
        .innerJoin(Profiles, eq(Posts.profileId, Profiles.id))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            'slug' in parsedReference
              ? eq(Posts.slug, parsedReference.slug)
              : eq(Posts.id, parsedReference.id),
            directPostAccessWhere({ ctx, profileMute: 'ignore' }),
          ),
        )
        .limit(1)
        .then(first);
    },
  }),
);
