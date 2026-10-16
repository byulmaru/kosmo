import { and, asc, eq, inArray, lte, ne } from 'drizzle-orm';
import { AccountProfiles, NotificationRecipientSnapshots } from '../db';
import type { DatabaseHandle } from '../db';
import type { NotificationKind } from '../enums';

type CaptureNotificationRecipientsInput = {
  readonly actorAccountId?: string | null;
  readonly kind: NotificationKind;
  readonly legacyMembershipCutoff?: Temporal.Instant;
  readonly recipientProfileIds: readonly string[];
  readonly sourceId: string;
};

export type NotificationRecipientSnapshot = typeof NotificationRecipientSnapshots.$inferSelect;

export const getNotificationRecipientSnapshot = async (
  database: DatabaseHandle,
  kind: NotificationKind,
  sourceId: string,
): Promise<NotificationRecipientSnapshot | null> =>
  database
    .select()
    .from(NotificationRecipientSnapshots)
    .where(
      and(
        eq(NotificationRecipientSnapshots.kind, kind),
        eq(NotificationRecipientSnapshots.sourceId, sourceId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

/** Saves the first Account audience for a source, including targets with no recipients. */
export const captureNotificationRecipients = async (
  database: DatabaseHandle,
  {
    actorAccountId,
    kind,
    legacyMembershipCutoff,
    recipientProfileIds,
    sourceId,
  }: CaptureNotificationRecipientsInput,
): Promise<NotificationRecipientSnapshot> => {
  const existing = await getNotificationRecipientSnapshot(database, kind, sourceId);
  if (existing) {
    return existing;
  }

  const profileIds = [...new Set(recipientProfileIds)].sort();
  const recipients: Record<string, string[]> = Object.fromEntries(
    profileIds.map((profileId) => [profileId, []]),
  );

  if (profileIds.length > 0) {
    const memberships = await database
      .select({ accountId: AccountProfiles.accountId, profileId: AccountProfiles.profileId })
      .from(AccountProfiles)
      .where(
        and(
          inArray(AccountProfiles.profileId, profileIds),
          actorAccountId ? ne(AccountProfiles.accountId, actorAccountId) : undefined,
          legacyMembershipCutoff
            ? lte(AccountProfiles.createdAt, legacyMembershipCutoff)
            : undefined,
        ),
      )
      .orderBy(asc(AccountProfiles.profileId), asc(AccountProfiles.accountId));

    for (const { accountId, profileId } of memberships) {
      recipients[profileId]?.push(accountId);
    }
  }

  const [inserted] = await database
    .insert(NotificationRecipientSnapshots)
    .values({
      actorAccountId: actorAccountId ?? null,
      kind,
      recipients,
      sourceId,
    })
    .onConflictDoNothing({
      target: [NotificationRecipientSnapshots.kind, NotificationRecipientSnapshots.sourceId],
    })
    .returning();

  if (inserted) {
    return inserted;
  }

  const saved = await getNotificationRecipientSnapshot(database, kind, sourceId);
  if (!saved) {
    throw new Error('Notification recipient snapshot insert conflict was not visible');
  }

  return saved;
};
