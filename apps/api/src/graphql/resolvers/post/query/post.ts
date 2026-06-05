import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { Post } from '../ref';

builder.queryField('post', (t) =>
  t.field({
    type: Post,
    nullable: true,
    args: {
      id: t.arg.id({ validate: z.uuid() }),
    },
    // Post Node 로더가 state=ACTIVE + 작성자 profile.state=ACTIVE를 적용한다.
    // 없는/비활성 게시글은 로더에서 걸러져 null이 된다.
    // TODO(PROD-102): viewer 기준 공개 범위(FOLLOWERS/DIRECT) 제한은 로더에서 강화한다.
    resolve: (_, args) => args.id,
  }),
);
