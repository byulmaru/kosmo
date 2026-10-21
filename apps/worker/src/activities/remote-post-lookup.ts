import '@kosmo/core/polyfill';

import { Note, Object as ActivityObject } from '@fedify/vocab';
import { db, first, Instances, Posts, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { federation, materializeHydratedRemoteNote } from '@kosmo/fedify';
import { ApplicationFailure } from '@temporalio/activity';
import { eq } from 'drizzle-orm';
import { createBoundedDocumentLoader, RemoteDocumentBudgetExceededError } from './remote-document';
import type { RemotePostLookupInput, RemotePostLookupResult } from '@kosmo/core/temporal/workflows';

const REQUEST_TIMEOUT_MS = 30_000;

type RemotePostLookupActivityInput = RemotePostLookupInput & {
  readonly maxDocumentBytes: number;
};

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

export const lookupRemotePostActivity = async (
  input: RemotePostLookupActivityInput,
): Promise<RemotePostLookupResult> => {
  if (input.maxDocumentBytes === 0) {
    return { documentBytes: 0, reason: 'document_budget_exceeded', status: 'rejected' };
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
      return {
        documentBytes: bounded.documentBytes,
        reason: 'invalid_note',
        status: 'rejected',
      };
    }
    if (
      (documentUri.protocol !== 'http:' && documentUri.protocol !== 'https:') ||
      documentUri.hostname === '' ||
      documentUri.origin !== objectUri.origin
    ) {
      return {
        documentBytes: bounded.documentBytes,
        reason: 'invalid_note',
        status: 'rejected',
      };
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
        return {
          documentBytes: bounded.documentBytes,
          reason: 'invalid_note',
          status: 'rejected',
        };
      }
      throw error;
    }

    if (!(object instanceof Note) || object.id?.href !== objectUri.href) {
      return {
        documentBytes: bounded.documentBytes,
        reason: 'invalid_note',
        status: 'rejected',
      };
    }
    note = object;
  } catch (error) {
    if (error instanceof RemoteDocumentBudgetExceededError) {
      return {
        documentBytes: error.documentBytes,
        reason: 'document_budget_exceeded',
        status: 'rejected',
      };
    }
    // Fedify may wrap a remote context-loader failure while parsing JSON-LD.
    // The live count remains authoritative if the parser obscures our sentinel.
    if (bounded.documentBytes > input.maxDocumentBytes) {
      return {
        documentBytes: bounded.documentBytes,
        reason: 'document_budget_exceeded',
        status: 'rejected',
      };
    }
    throw error;
  }

  const materialized = await materializeHydratedRemoteNote({
    ...(input.advertisingActorUri === undefined
      ? {}
      : { advertisingActorUri: new URL(input.advertisingActorUri) }),
    context,
    note,
    objectUri,
    observation: { activityType: 'Unknown', handler: 'create' },
    receivedAt: Temporal.Now.instant(),
    ...(signingProfileId === undefined ? {} : { signingProfileId }),
  });

  if (materialized.status === 'rejected') {
    return {
      documentBytes: bounded.documentBytes,
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
    documentBytes: bounded.documentBytes,
    postId: materialized.postId,
    status: materialized.status,
  };
};
