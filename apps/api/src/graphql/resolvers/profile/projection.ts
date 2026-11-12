import { ProfileState } from '@kosmo/core/enums';
import SchemaBuilder, { BasePlugin } from '@pothos/core';
import type { PothosOutputFieldConfig, SchemaTypes } from '@pothos/core';
import type { GraphQLFieldResolver } from 'graphql';

const pluginName = 'profileProjection';
const identityFields = new Set(['id', 'handle', 'relativeHandle']);

declare global {
  // Pothos plugins extend the global plugin registry through namespace merging.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace PothosSchemaTypes {
    interface Plugins<Types extends SchemaTypes> {
      profileProjection: ProfileProjectionPlugin<Types>;
    }
  }
}

export class ProfileProjectionPlugin<Types extends SchemaTypes> extends BasePlugin<Types> {
  override onOutputFieldConfig(fieldConfig: PothosOutputFieldConfig<Types>) {
    if (fieldConfig.parentType !== 'Profile' || identityFields.has(fieldConfig.name)) {
      return fieldConfig;
    }

    return {
      ...fieldConfig,
      type: { ...fieldConfig.type, nullable: true },
    };
  }

  override wrapResolve(
    resolve: GraphQLFieldResolver<unknown, Types['Context'], object>,
    fieldConfig: PothosOutputFieldConfig<Types>,
  ): GraphQLFieldResolver<unknown, Types['Context'], object> {
    if (fieldConfig.parentType !== 'Profile' || identityFields.has(fieldConfig.name)) {
      return resolve;
    }

    return (parent, args, context, info) => {
      if (
        parent === null ||
        typeof parent !== 'object' ||
        (parent as { readonly state?: unknown }).state !== ProfileState.ACTIVE
      ) {
        return null;
      }

      return resolve(parent, args, context, info);
    };
  }
}

SchemaBuilder.registerPlugin(pluginName, ProfileProjectionPlugin);
