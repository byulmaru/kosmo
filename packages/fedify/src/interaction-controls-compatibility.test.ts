import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFederation, MemoryKvStore } from '@fedify/fedify';
import { quoteInteraction } from '@fedify/interaction-controls';
import { Note, QuoteAuthorization, QuoteRequest } from '@fedify/vocab';

const targetUri = new URL('https://remote.example/posts/target');
const targetAuthorUri = new URL('https://remote.example/users/alice');
const quoteUri = new URL('https://kosmo.example/posts/quote');
const quoteAuthorUri = new URL('https://kosmo.example/users/bob');

const createInteractionContext = () => {
  const federation = createFederation<void>({
    kv: new MemoryKvStore(),
    documentLoaderFactory: () => async () => {
      throw new Error('unexpected document lookup');
    },
  });
  return federation.createContext(new URL('https://kosmo.example'), undefined);
};

test('Fedify 2.4 interaction-controls preserves the FEP-044f quote boundary', async () => {
  const target = new Note({
    attribution: targetAuthorUri,
    content: 'Remote target',
    id: targetUri,
  });
  const quote = new Note({
    attribution: quoteAuthorUri,
    content: 'Kosmo quote',
    id: quoteUri,
    quote: target,
  });

  const request = quoteInteraction.createRequest({
    actor: quoteAuthorUri,
    id: new URL('https://kosmo.example/quote-requests/1'),
    instrument: quote,
    object: target,
  });
  const requestVerification = await quoteInteraction.verifyRequest(createInteractionContext(), {
    request,
  });

  assert.ok(request instanceof QuoteRequest);
  assert.equal(quoteInteraction.requestTypeId.href, QuoteRequest.typeId.href);
  assert.equal(requestVerification.verified, true);
  if (requestVerification.verified) {
    assert.equal(requestVerification.requester.href, quoteAuthorUri.href);
    assert.equal(requestVerification.interactionTargetId.href, targetUri.href);
    assert.equal(requestVerification.interactingObjectId.href, quoteUri.href);
  }

  const authorization = quoteInteraction.createAuthorization({
    attributedTo: targetAuthorUri,
    id: new URL('https://remote.example/quote-authorizations/1'),
    interactingObject: quote,
    interactionTarget: target,
  });
  const authorizationVerification = await quoteInteraction.verifyAuthorization(
    createInteractionContext(),
    {
      authorization,
      interactingObject: quote,
      interactionTarget: target,
      verifyAuthenticity: () => true,
    },
  );

  assert.ok(authorization instanceof QuoteAuthorization);
  assert.equal(quoteInteraction.authorizationTypeId.href, QuoteAuthorization.typeId.href);
  assert.equal(authorizationVerification.verified, true);

  const expandedAuthorization = await authorization.toJsonLd({ format: 'expand' });
  const hydratedAuthorization = await QuoteAuthorization.fromJsonLd(expandedAuthorization);
  assert.equal(hydratedAuthorization.id?.href, authorization.id?.href);
  assert.equal(hydratedAuthorization.attributionId?.href, targetAuthorUri.href);
  assert.equal(hydratedAuthorization.interactingObjectId?.href, quoteUri.href);
  assert.equal(hydratedAuthorization.interactionTargetId?.href, targetUri.href);

  const revocation = quoteInteraction.createRevocation({
    actor: targetAuthorUri,
    authorization,
    id: new URL('https://remote.example/quote-revocations/1'),
    to: quoteAuthorUri,
  });
  assert.equal(revocation.objectId?.href, authorization.id?.href);
});
