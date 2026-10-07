import { builder } from '@/graphql/builder';
import { OperationalNotification } from '../ref';

builder.objectFields(OperationalNotification, (t) => ({
  body: t.string({
    nullable: true,
    resolve: (notification) => notification.data.body ?? null,
  }),
  href: t.string({ resolve: (notification) => notification.data.href }),
  title: t.string({ resolve: (notification) => notification.data.title }),
}));
