import { Count } from '../objects';

Count.implement({
  fields: (t) => ({
    current: t.field({
      type: 'Int',
      resolve: (count) => count.currentLoader(),
    }),

    max: t.field({
      type: 'Int',
      nullable: true,
      resolve: (count) => count.maxLoader(),
      description: 'null if unlimited',
    }),
  }),
});
