import { encodeGlobalId } from '@kosmo/core/global-id';
import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { ReactionCount } from '@/graphql/resolvers/post/field/post';
import { Profile } from '@/graphql/resolvers/profile';
import { Reaction } from '@/graphql/resolvers/reaction/ref';
import { ReactionNotificationGroup } from '../group-ref';
import { reactionNotificationGroupMembersLoader } from '../loader/group';
import type { UserContext } from '@/context';
import type {
  ReactionNotificationGroupFeedRow,
  ReactionNotificationGroupMemberRow,
  ReactionNotificationGroupRow,
} from '../group-ref';

const groupMembers = async (
  group: ReactionNotificationGroupRow | ReactionNotificationGroupFeedRow,
  ctx: UserContext,
): Promise<readonly ReactionNotificationGroupMemberRow[]> =>
  'members' in group ? group.members : reactionNotificationGroupMembersLoader(ctx).load(group.id);

const groupProjection = async (
  group: ReactionNotificationGroupRow | ReactionNotificationGroupFeedRow,
  ctx: UserContext,
) => {
  const members = await groupMembers(group, ctx);
  const source = members[0] ? await Reaction.getDataloader(ctx).load(members[0].reactionId) : null;

  return { members, source };
};

builder.objectFields(ReactionNotificationGroup, (t) => ({
  latestAt: t.field({
    type: 'DateTime',
    resolve: async (group, _, ctx) => {
      if ('latestAt' in group) {
        return (group as ReactionNotificationGroupFeedRow).latestAt;
      }

      const members = await groupMembers(group, ctx);
      return members.reduce(
        (latest, member) =>
          Temporal.Instant.compare(member.createdAt, latest) > 0 ? member.createdAt : latest,
        group.startedAt,
      );
    },
  }),
  unread: t.boolean({
    resolve: async (group, _, ctx) =>
      (await groupMembers(group, ctx)).some((member) => member.readAt === null),
  }),
  notificationIds: t.field({
    type: ['ID'],
    resolve: async (group, _, ctx) =>
      (await groupMembers(group, ctx)).map(({ notificationId }) =>
        encodeGlobalId('ReactionNotification', notificationId),
      ),
  }),
  participantCount: t.int({
    nullable: true,
    resolve: async (group, _, ctx) => {
      const { members, source } = await groupProjection(group, ctx);
      return source ? new Set(members.map(({ profileId }) => profileId)).size : null;
    },
  }),
  reactionCounts: t.field({
    type: [ReactionCount],
    nullable: true,
    resolve: async (group, _, ctx) => {
      const { members, source } = await groupProjection(group, ctx);
      if (!source) {
        return null;
      }

      const counts = new Map<string, number>();
      for (const member of members) {
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
      const { members, source } = await groupProjection(group, ctx);
      if (!source) {
        return [];
      }

      const profileIds: string[] = [];
      const seen = new Set<string>();
      for (const member of members) {
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
