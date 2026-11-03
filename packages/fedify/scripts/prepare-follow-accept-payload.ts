import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Follow, Person } from '@fedify/vocab';
import { z } from 'zod';
import { sendAcceptFollowActivity } from '../src/follow-delivery';
import type { Context } from '@fedify/fedify';
import type { Activity, Recipient } from '@fedify/vocab';

const httpUrlSchema = z.url().refine((value) => {
  const uri = new URL(value);
  return (
    (uri.protocol === 'http:' || uri.protocol === 'https:') &&
    uri.username === '' &&
    uri.password === ''
  );
});

const originSchema = httpUrlSchema.refine((value) => {
  const uri = new URL(value);
  return uri.pathname === '/' && uri.search === '' && uri.hash === '';
});

const candidateSchema = z.strictObject({
  reviewRequired: z.literal(true),
  profileFollowId: z.uuid(),
  followerProfileId: z.uuid(),
  followeeProfileId: z.uuid(),
  sourceFollowId: httpUrlSchema.optional(),
  sourceFollowActorUri: httpUrlSchema,
  sourceFollowObjectUri: httpUrlSchema,
  remoteActorUri: httpUrlSchema,
  remoteInboxUri: httpUrlSchema,
  remoteSharedInboxUri: httpUrlSchema.nullable(),
  localCanonicalOrigin: originSchema,
});

export const prepareFollowAcceptPayload = async (value: unknown) => {
  const parsed = candidateSchema.safeParse(value);
  if (!parsed.success) {
    throw new TypeError('Candidate input does not match the review-required Follow schema.');
  }

  const candidate = parsed.data;
  const localActorUri = new URL(
    `/ap/actor/${encodeURIComponent(candidate.followeeProfileId)}`,
    candidate.localCanonicalOrigin,
  );

  const receivedFollow = new Follow({
    ...(candidate.sourceFollowId ? { id: new URL(candidate.sourceFollowId) } : {}),
    actor: new URL(candidate.sourceFollowActorUri),
    object: new URL(candidate.sourceFollowObjectUri),
  });
  const recipientActor = new Person({
    id: new URL(candidate.remoteActorUri),
    inbox: new URL(candidate.remoteInboxUri),
  });

  const capturedActivities: Activity[] = [];
  const context = {
    canonicalOrigin: candidate.localCanonicalOrigin,
    getActorUri: (identifier: string) =>
      new URL(`/ap/actor/${encodeURIComponent(identifier)}`, candidate.localCanonicalOrigin),
    sendActivity: async (
      _sender: { readonly identifier: string },
      _recipient: Recipient,
      activity: Activity,
    ) => {
      capturedActivities.push(activity);
    },
  } as Pick<Context<void>, 'canonicalOrigin' | 'getActorUri' | 'sendActivity'>;

  const accept = await sendAcceptFollowActivity({
    context,
    recipientActor,
    receivedFollow,
    senderProfileId: candidate.followeeProfileId,
  });
  if (capturedActivities.length !== 1 || capturedActivities[0] !== accept) {
    throw new Error('Accept payload preparation did not capture exactly one activity.');
  }

  const acceptJsonLd = (await accept.toJsonLd()) as Record<string, unknown>;
  const followJsonLd = acceptJsonLd.object as Record<string, unknown> | undefined;
  const followIdMatches = candidate.sourceFollowId === followJsonLd?.id;
  if (
    !followJsonLd ||
    acceptJsonLd.type !== 'Accept' ||
    acceptJsonLd.actor !== localActorUri.href ||
    acceptJsonLd.to !== candidate.remoteActorUri ||
    !followIdMatches ||
    followJsonLd.actor !== candidate.remoteActorUri ||
    followJsonLd.object !== localActorUri.href
  ) {
    throw new Error('Captured Accept payload does not match the candidate Follow endpoints.');
  }

  return {
    reviewRequired: true as const,
    currentRelationship: {
      profileFollowId: candidate.profileFollowId,
      followerProfileId: candidate.followerProfileId,
      followeeProfileId: candidate.followeeProfileId,
    },
    sourceFollow: {
      ...(candidate.sourceFollowId ? { id: candidate.sourceFollowId } : {}),
      actor: candidate.sourceFollowActorUri,
      object: candidate.sourceFollowObjectUri,
    },
    deliveryTarget: {
      actor: candidate.remoteActorUri,
      inbox: candidate.remoteInboxUri,
      sharedInbox: candidate.remoteSharedInboxUri,
    },
    accept: acceptJsonLd,
  };
};

const main = async () => {
  let inputText = '';
  for await (const chunk of process.stdin) {
    inputText += chunk.toString();
  }
  const input = JSON.parse(inputText) as unknown;
  const result = await prepareFollowAcceptPayload(input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

const invokedPath = process.argv[1];
if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Payload preparation failed.'}\n`,
    );
    process.exitCode = 1;
  });
}
