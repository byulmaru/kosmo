import { and } from 'drizzle-orm';
import { postRepostSourceAccessWhere } from './repost-source';
import { postVisibilityAccessWhere } from './visibility';
import type { UserContext } from '@/context';

export const postAccessWhere = ({ ctx }: { ctx: UserContext }) =>
  and(postVisibilityAccessWhere({ ctx }), postRepostSourceAccessWhere({ ctx }));
