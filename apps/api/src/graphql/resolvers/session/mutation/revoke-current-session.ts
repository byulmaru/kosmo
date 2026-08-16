import { db } from '@kosmo/core/db';
import { PermissionDeniedError } from '@kosmo/core/error';
import { revokeCurrentSession } from '@kosmo/core/services';
import { builder } from '@/graphql/builder';

const getBearerToken = (authorization: string | undefined) => {
  if (authorization === undefined) {
    return undefined;
  }

  const token = authorization.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) {
    throw new PermissionDeniedError('Authorization header must use Bearer');
  }

  return token;
};

builder.mutationField('revokeCurrentSession', (t) =>
  t.field({
    type: builder.simpleObject('RevokeCurrentSessionPayload', {
      fields: (field) => ({
        completed: field.boolean(),
      }),
    }),
    resolve: async (_, __, ctx) => {
      ctx.c.header('Cache-Control', 'no-store');
      ctx.c.header('Pragma', 'no-cache');

      const result = await revokeCurrentSession(
        {
          token: getBearerToken(ctx.c.req.header('Authorization')),
        },
        db,
      );

      return {
        completed: result.status === 'REVOKED' || result.status === 'ALREADY_UNAUTHENTICATED',
      };
    },
  }),
);
