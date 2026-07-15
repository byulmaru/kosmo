import { PermissionDeniedError, ValidationError } from '@kosmo/core/error';
import SchemaBuilder from '@pothos/core';
import DataloaderPlugin from '@pothos/plugin-dataloader';
import RelayPlugin from '@pothos/plugin-relay';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import SimpleObjectsPlugin from '@pothos/plugin-simple-objects';
import ValidationPlugin from '@pothos/plugin-validation';
import WithInputPlugin from '@pothos/plugin-with-input';
import * as R from 'remeda';
import { globalIdMap, globalNodeRouteMap } from './utils';
import type { PostContentDocumentV1 } from '@kosmo/core/post-content';
import type { SessionContext, SessionWithProfileContext, UserContext } from '@/context';

const resolveGlobalNode = async (id: { id: string; typename: string }, ctx: UserContext) => {
  const load = globalNodeRouteMap.get(id.typename);

  if (!load) {
    throw new Error(`Unknown node route`);
  }

  return (await load([id.id], ctx))[0] ?? null;
};

export const builder = new SchemaBuilder<{
  AuthContexts: {
    login: UserContext & SessionContext;
    usingProfile: UserContext & SessionWithProfileContext;
  };
  AuthScopes: {
    login: boolean;
    usingProfile: boolean;
  };
  Context: UserContext;
  DefaultAuthStrategy: 'all';
  DefaultFieldNullability: false;
  DefaultInputFieldRequiredness: true;
  Scalars: {
    DateTime: {
      Input: Temporal.Instant;
      Output: Temporal.Instant;
    };
    PostContentDocument: {
      Input: never;
      Output: PostContentDocumentV1;
    };
  };
}>({
  plugins: [
    RelayPlugin,
    ScopeAuthPlugin,
    SimpleObjectsPlugin,
    ValidationPlugin,
    WithInputPlugin,
    DataloaderPlugin,
  ],
  defaultFieldNullability: false,
  defaultInputFieldRequiredness: true,
  validation: {
    validationError: (failure) => {
      const issue = failure.issues[0];
      const field = issue?.path
        ?.map((segment) => (typeof segment === 'object' ? segment.key : segment))
        .filter((segment) => segment !== 'input')
        .join('.');

      return new ValidationError(issue?.message, { field: field || undefined });
    },
  },
  relay: {
    encodeGlobalID: (_, id) => String(id),
    decodeGlobalID: (id) => {
      const typename = globalIdMap.get(Number.parseInt(id.replaceAll('-', '').slice(13, 16), 16));

      if (!typename) {
        throw new Error(`Unknown global id type code`);
      }

      return { id, typename };
    },
    nodeQueryOptions: {
      resolve: (_, { id }, ctx) => resolveGlobalNode(id, ctx),
    },
    nodesQueryOptions: {
      resolve: (_, { ids }, ctx) => Promise.all(ids.map((id) => resolveGlobalNode(id, ctx))),
    },
  },
  scopeAuth: {
    authScopes: async (ctx) => ({
      login: !!ctx.session,
      usingProfile: !!ctx.session?.profileId,
    }),
    defaultStrategy: 'all',
    runScopesOnType: true,
    unauthorizedError: (_parent, _context, _info, result) =>
      new PermissionDeniedError(result.message),
  },
  withInput: {
    typeOptions: {
      name: ({ fieldName }) => `${R.capitalize(fieldName)}Input`,
    },
  },
});

builder.queryType({});
builder.mutationType({});

builder.scalarType('DateTime', {
  description: 'RFC9557 formatted string',
  serialize: (value) => value.toString({ smallestUnit: 'millisecond' }),
  parseValue: (value) => {
    if (typeof value === 'string') {
      return Temporal.Instant.from(value);
    }

    throw new Error('Invalid DateTime value');
  },
});

builder.scalarType('PostContentDocument', {
  description: 'Kosmo versioned PostContent document JSON',
  serialize: (value) => value,
  parseValue: () => {
    throw new Error('PostContentDocument is output-only');
  },
});
