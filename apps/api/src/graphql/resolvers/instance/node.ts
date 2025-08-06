import { InstanceType } from '@kosmo/shared/enums';
import { builder } from '@/graphql/builder';
import { Instance } from '@/graphql/objects';

builder.node(Instance, {
  id: { resolve: (instance) => instance.id },

  loadManyWithoutCache: async (ids, ctx) => {
    return (await Instance.getDataloader(ctx).loadMany(ids)).map((instance) =>
      instance instanceof Error ? null : instance,
    );
  },

  fields: (t) => ({
    domain: t.exposeString('domain'),
    type: t.expose('type', { type: InstanceType }),
  }),
});
