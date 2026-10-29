import '@kosmo/core/polyfill';

import { randomUUID } from 'node:crypto';
import { Note, Object as ActivityObject } from '@fedify/vocab';
import { db, first, Instances, Posts, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import {
  federation,
  materializeHydratedRemoteNote,
  prepareHydratedRemoteNote,
} from '@kosmo/fedify';
import { ApplicationFailure } from '@temporalio/activity';
import { eq } from 'drizzle-orm';
import { createBoundedDocumentLoader, RemoteDocumentBudgetExceededError } from './remote-document';
import type { ActivityPubPostCreateInput } from '@kosmo/core/temporal/post-create';
import type { RemotePostLookupInput, RemotePostLookupResult } from '@kosmo/core/temporal/workflows';

const REQUEST_TIMEOUT_MS = 30_000;

type RemotePostLookupActivityInput = RemotePostLookupInput & {
  readonly maxDocumentBytes: number;
};

type RejectedRemotePostLookup = Extract<RemotePostLookupResult, { status: 'rejected' }>;

type FetchedRemotePostNote =
  | { status: 'rejected'; result: RejectedRemotePostLookup }
  | {
      context: Awaited<ReturnType<typeof resolveContext>>['context'];
      documentBytes: number;
      note: Note;
      objectUri: URL;
      signingProfileId?: string;
      status: 'fetched';
    };

const rejectedLookup = (
  documentBytes: number,
  reason: RejectedRemotePostLookup['reason'],
): Extract<FetchedRemotePostNote, { status: 'rejected' }> => ({
  result: { documentBytes, reason, status: 'rejected' },
  status: 'rejected',
});

const resolveContext = async (signingProfileId?: string) => {
  const localInstance = await resolveConfiguredLocalInstance({
    publicOrigin: process.env.PUBLIC_ORIGIN,
  });

  if (!signingProfileId) {
    return {
      context: federation.createContext(new URL(localInstance.canonicalOrigin), undefined),
    };
  }

  const signer = await db
    .select({
      profileState: Profiles.state,
      instanceId: Instances.id,
      instanceKind: Instances.kind,
      instanceState: Instances.state,
      canonicalOrigin: Instances.canonicalOrigin,
    })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(eq(Profiles.id, signingProfileId))
    .limit(1)
    .then(first);

  if (
    !signer ||
    signer.profileState !== ProfileState.ACTIVE ||
    signer.instanceKind !== InstanceKind.LOCAL ||
    signer.instanceState !== InstanceState.ACTIVE ||
    signer.instanceId !== localInstance.id ||
    signer.canonicalOrigin !== localInstance.canonicalOrigin
  ) {
    throw ApplicationFailure.nonRetryable(
      'Signing Profile must be active on the configured local instance',
      'RemotePostSigningProfileInvalid',
    );
  }

  return {
    context: federation.createContext(new URL(localInstance.canonicalOrigin), undefined),
    signingProfileId,
  };
};

const fetchRemotePostNote = async (
  input: RemotePostLookupActivityInput,
): Promise<FetchedRemotePostNote> => {
  if (input.maxDocumentBytes === 0) {
    return rejectedLookup(0, 'document_budget_exceeded');
  }

  const objectUri = new URL(input.objectUri);
  const { context, signingProfileId } = await resolveContext(input.signingProfileId);
  const sourceLoader = signingProfileId
    ? await context.getDocumentLoader({ identifier: signingProfileId })
    : context.documentLoader;
  const bounded = createBoundedDocumentLoader(sourceLoader, input.maxDocumentBytes);
  const requestSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const documentLoader = (url: string, options?: Parameters<typeof bounded.documentLoader>[1]) =>
    bounded.documentLoader(url, {
      ...options,
      signal: options?.signal ? AbortSignal.any([requestSignal, options.signal]) : requestSignal,
    });

  let note: Note;
  try {
    const loaded = await documentLoader(objectUri.href);
    let documentUri: URL;
    try {
      documentUri = new URL(loaded.documentUrl);
    } catch {
      return rejectedLookup(bounded.documentBytes, 'invalid_note');
    }
    if (
      (documentUri.protocol !== 'http:' && documentUri.protocol !== 'https:') ||
      documentUri.hostname === '' ||
      documentUri.origin !== objectUri.origin
    ) {
      return rejectedLookup(bounded.documentBytes, 'invalid_note');
    }

    let object;
    try {
      object = await ActivityObject.fromJsonLd(loaded.document, {
        baseUrl: documentUri,
        contextLoader: documentLoader,
        documentLoader,
        verifyPortableObject: context.verifyPortableObject,
      });
    } catch (error) {
      if (bounded.documentBytes > input.maxDocumentBytes) {
        throw error;
      }
      if (error instanceof TypeError) {
        return rejectedLookup(bounded.documentBytes, 'invalid_note');
      }
      throw error;
    }

    if (!(object instanceof Note) || object.id?.href !== objectUri.href) {
      return rejectedLookup(bounded.documentBytes, 'invalid_note');
    }
    note = object;
  } catch (error) {
    if (error instanceof RemoteDocumentBudgetExceededError) {
      return rejectedLookup(error.documentBytes, 'document_budget_exceeded');
    }
    // Fedify may wrap a remote context-loader failure while parsing JSON-LD.
    // The live count remains authoritative if the parser obscures our sentinel.
    if (bounded.documentBytes > input.maxDocumentBytes) {
      return rejectedLookup(bounded.documentBytes, 'document_budget_exceeded');
    }
    throw error;
  }

  return {
    context,
    documentBytes: bounded.documentBytes,
    note,
    objectUri,
    ...(signingProfileId === undefined ? {} : { signingProfileId }),
    status: 'fetched',
  };
};

export const prepareRemotePostActivity = async (
  input: RemotePostLookupActivityInput,
): Promise<
  | {
      documentBytes: number;
      input: ActivityPubPostCreateInput;
      requestId: string;
      status: 'prepared';
    }
  | { result: RejectedRemotePostLookup; status: 'rejected' }
> => {
  const fetched = await fetchRemotePostNote(input);
  if (fetched.status === 'rejected') {
    return fetched;
  }

  const prepared = await prepareHydratedRemoteNote({
    ...(input.advertisingActorUri === undefined
      ? {}
      : { advertisingActorUri: new URL(input.advertisingActorUri) }),
    context: fetched.context,
    note: fetched.note,
    objectUri: fetched.objectUri,
    observation: { activityType: 'Unknown', handler: 'create' },
    receivedAt: Temporal.Now.instant(),
    ...(fetched.signingProfileId === undefined
      ? {}
      : { signingProfileId: fetched.signingProfileId }),
  });

  if (prepared.status === 'rejected') {
    return {
      result: {
        documentBytes: fetched.documentBytes,
        reason: prepared.reason,
        status: 'rejected',
      },
      status: 'rejected',
    };
  }

  return {
    documentBytes: fetched.documentBytes,
    input: prepared.input,
    requestId: randomUUID(),
    status: 'prepared',
  };
};

export const lookupRemotePostActivity = async (
  input: RemotePostLookupActivityInput,
): Promise<RemotePostLookupResult> => {
  const fetched = await fetchRemotePostNote(input);
  if (fetched.status === 'rejected') {
    return fetched.result;
  }

  const materialized = await materializeHydratedRemoteNote({
    ...(input.advertisingActorUri === undefined
      ? {}
      : { advertisingActorUri: new URL(input.advertisingActorUri) }),
    context: fetched.context,
    note: fetched.note,
    objectUri: fetched.objectUri,
    observation: { activityType: 'Unknown', handler: 'create' },
    receivedAt: Temporal.Now.instant(),
    ...(fetched.signingProfileId === undefined
      ? {}
      : { signingProfileId: fetched.signingProfileId }),
  });

  if (materialized.status === 'rejected') {
    return {
      documentBytes: fetched.documentBytes,
      reason: materialized.reason,
      status: 'rejected',
    };
  }

  const post = await db
    .select({ authorProfileId: Posts.profileId })
    .from(Posts)
    .where(eq(Posts.id, materialized.postId))
    .limit(1)
    .then(first);
  if (!post) {
    throw new Error('Remote Note Post not found after materialization');
  }

  return {
    authorProfileId: post.authorProfileId,
    documentBytes: fetched.documentBytes,
    postId: materialized.postId,
    status: materialized.status,
  };
};
