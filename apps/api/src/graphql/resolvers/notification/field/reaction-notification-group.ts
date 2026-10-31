import { encodeGlobalId } from '@kosmo/core/global-id';
import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { ReactionCount } from '@/graphql/resolvers/post/field/post';
import { Profile } from '@/graphql/resolvers/profile';
import { Reaction } from '@/graphql/resolvers/reaction/ref';
import { ReactionNotificationGroup } from '../group-ref';

builder.objectFields(ReactionNotificationGroup, (t) => ({
  id: t.exposeID('id'),
  latestAt: t.field({
    type: 'DateTime',
    resolve: (group) => group.latestAt,
  }),
  unread: t.boolean({
    resolve: (group) => group.unread,
  }),
  notificationIds: t.field({
    type: ['ID'],
    resolve: (group) =>
      group.members.map(({ notificationId }) =>
        encodeGlobalId('ReactionNotification', notificationId),
      ),
  }),
  participantCount: t.int({
    nullable: true,
    resolve: async (group, _, ctx) => {
      const source = group.members[0]
        ? await Reaction.getDataloader(ctx).load(group.members[0].reactionId)
        : null;
      return source ? new Set(group.members.map(({ profileId }) => profileId)).size : null;
    },
  }),
  reactionCounts: t.field({
    type: [ReactionCount],
    nullable: true,
    resolve: async (group, _, ctx) => {
      const source = group.members[0]
        ? await Reaction.getDataloader(ctx).load(group.members[0].reactionId)
        : null;
      if (!source) {
        return null;
      }

      const counts = new Map<string, number>();
      for (const member of group.members) {
        counts.set(member.reactionType, (counts.get(member.reactionType) ?? 0) + 1);
      }

      return [...counts]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([type, count]) => ({ type, count }));
    },
  }),
  recentProfiles: t.field({
    type: [Profile],
    resolve: async (group, _, ctx) => {
      const source = group.members[0]
        ? await Reaction.getDataloader(ctx).load(group.members[0].reactionId)
        : null;
      if (!source) {
        return [];
      }

      const profileIds: string[] = [];
      const seen = new Set<string>();
      for (const member of group.members) {
        if (!seen.has(member.profileId)) {
          seen.add(member.profileId);
          profileIds.push(member.profileId);
        }
        if (profileIds.length === 3) {
          break;
        }
      }

      const profiles = await Promise.all(
        profileIds.map((profileId) => Profile.getDataloader(ctx).load(profileId)),
      );
      return profiles.filter((profile): profile is NonNullable<typeof profile> => profile !== null);
    },
  }),
  post: t.field({
    type: Post,
    nullable: true,
    resolve: (group) => group.postId,
  }),
}));
