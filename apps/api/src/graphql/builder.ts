import SchemaBuilder from '@pothos/core';
import DataLoaderPlugin from '@pothos/plugin-dataloader';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import SimpleObjectsPlugin from '@pothos/plugin-simple-objects';
import WithInputPlugin from '@pothos/plugin-with-input';
import ZodPlugin from '@pothos/plugin-zod';
import dayjs from 'dayjs';
import { GraphQLJSON } from 'graphql-scalars';
import * as R from 'remeda';
import { base64 } from 'rfc4648';
import { UnauthorizedError, ValidationError } from '@/errors';
import { hasScope } from '@/utils/scope';
import type { Scope } from '@kosmo/shared/types/scope';
import type { SessionContext, SessionWithProfileContext, UserContext } from '@/context';

export const builder = new SchemaBuilder<{
  AuthContexts: {
    session: UserContext & SessionContext;
    profile: UserContext & SessionWithProfileContext;
    scope: UserContext & SessionContext;
  };
  AuthScopes: {
    session: boolean;
    profile: boolean;
    scope: Scope;
  };
  Context: UserContext;
  DefaultInputFieldRequiredness: true;
  DefaultFieldNullability: false;
  Scalars: {
    Binary: { Input: Uint8Array; Output: Uint8Array };
    DateTime: { Input: dayjs.Dayjs; Output: dayjs.Dayjs };
    ID: { Input: string; Output: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    JSON: { Input: any; Output: unknown };
  };
}>({
  defaultInputFieldRequiredness: true,
  defaultFieldNullability: false,

  plugins: [ScopeAuthPlugin, DataLoaderPlugin, SimpleObjectsPlugin, WithInputPlugin, ZodPlugin],

  scopeAuth: {
    authScopes: (context) => ({
      session: !!context.session,
      profile: !!context.session?.profileId,
      scope: (scope) => hasScope({ scope, sessionScopes: context.session?.scopes }),
    }),
    treatErrorsAsUnauthorized: true,
    authorizeOnSubscribe: true,
    unauthorizedError: () => new UnauthorizedError(),
  },

  withInput: {
    typeOptions: {
      name: ({ fieldName }) => `${R.capitalize(fieldName)}Input`,
    },
  },

  zod: {
    validationError: (error) => new ValidationError({ message: error.issues[0].message }),
  },
});

builder.queryType();
builder.mutationType();
// builder.subscriptionType();

builder.addScalarType('JSON', GraphQLJSON);

builder.scalarType('Binary', {
  serialize: (value) => base64.stringify(value),
  parseValue: (value) => {
    if (typeof value === 'string') {
      return base64.parse(value);
    }

    throw new Error('Invalid binary value');
  },
});

builder.scalarType('DateTime', {
  serialize: (value) => value.valueOf(),
  parseValue: (value) => {
    if (typeof value === 'number') {
      const d = dayjs(value);
      if (d.isValid()) {
        return d;
      }
    }

    throw new Error('Invalid datetime value');
  },
  description: 'Unix timestamp in milliseconds',
});

export type Builder = typeof builder;
