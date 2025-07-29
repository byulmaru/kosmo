import './conflict';
import './forbidden';
import './limit-exceeded';
import './not-found';
import './validation';

import { getString } from '@kosmo/shared/i18n';
import { FieldError, TypedError } from '@/errors';
import { builder } from '@/graphql/builder';

builder.interfaceType(TypedError, {
  name: 'Error',
  fields: (t) => ({
    code: t.exposeString('code'),
    message: t.string({
      resolve: (error, _, ctx) =>
        getString({
          locales: ctx.languages,
          key: error.code,
          args: error.args,
        }),
    }),
  }),
});

builder.interfaceType(FieldError, {
  name: 'FieldError',
  interfaces: [TypedError],
  fields: (t) => ({
    path: t.exposeString('path', { nullable: true }),
  }),
});
