import { AccountProfileRoleOrder } from '@kosmo/core/enums';
import { postByIdLoader } from './resolvers/post/loader/by-id';
import type { AccountProfileRole } from '@kosmo/core/enums';
import type { UserContext } from '@/context';

export type AuthScopes = {
  login: boolean;
  profileRole: AccountProfileRole;
  canViewPost: string;
};

export const createAuthScopes = (ctx: UserContext) => ({
  login: !!ctx.session,
  profileRole: (minimumRole: AccountProfileRole) => {
    const currentProfile = ctx.session?.profile;
    if (!currentProfile) {
      return false;
    }

    return (
      AccountProfileRoleOrder.indexOf(currentProfile.role) >=
      AccountProfileRoleOrder.indexOf(minimumRole)
    );
  },
  canViewPost: async (postId: string) => (await postByIdLoader(ctx).load(postId)) !== null,
});
