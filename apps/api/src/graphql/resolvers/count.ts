import { Count } from '../objects';

Count.implement({
  fields: (t) => ({
    current: t.field({
      type: 'Int',
      resolve: (count) => count.currentResolver(),
    }),

    max: t.field({
      type: 'Int',
      nullable: true,
      resolve: (count) => count.maxResolver(),
      description: 'null if unlimited',
    }),
  }),
});
