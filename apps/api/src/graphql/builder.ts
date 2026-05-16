import SchemaBuilder from '@pothos/core';
import DataloaderPlugin from '@pothos/plugin-dataloader';
import ErrorsPlugin from '@pothos/plugin-errors';
import RelayPlugin from '@pothos/plugin-relay';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import ValidationPlugin from '@pothos/plugin-validation';
import { globalIdMap } from './utils';
import type { SessionContext, SessionWithProfileContext, UserContext } from '@/context';

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
  Scalars: {
    DateTime: {
      Input: Temporal.Instant;
      Output: Temporal.Instant;
    };
  };
}>({
  plugins: [RelayPlugin, ScopeAuthPlugin, ErrorsPlugin, ValidationPlugin, DataloaderPlugin],
  errors: {
    defaultTypes: [],
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
  },
  scopeAuth: {
    authScopes: async (ctx) => ({
      login: !!ctx.session,
      usingProfile: !!ctx.session?.profileId,
    }),
    defaultStrategy: 'all',
    runScopesOnType: true,
  },
});

builder.queryType({});

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
