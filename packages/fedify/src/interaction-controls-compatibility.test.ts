import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createFederation,
  generateCryptoKeyPair,
  MemoryKvStore,
  signObject,
  verifyObject,
} from '@fedify/fedify';
import { quoteInteraction } from '@fedify/interaction-controls';
import { Multikey, Note, Person, QuoteAuthorization, QuoteRequest } from '@fedify/vocab';
import type { DocumentLoader } from '@fedify/vocab-runtime';

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

test('QuoteAuthorization proof survives standalone and nested serialization without trusting claimed key ownership', async () => {
  const keyPair = await generateCryptoKeyPair('Ed25519');
  const keyId = new URL('#ed25519', targetAuthorUri);
  const key = new Multikey({
    id: keyId,
    controller: targetAuthorUri,
    publicKey: keyPair.publicKey,
  });
  const actor = new Person({ id: targetAuthorUri, assertionMethod: key });
  const documents = new Map<string, unknown>([
    [keyId.href, await key.toJsonLd()],
    [targetAuthorUri.href, await actor.toJsonLd()],
  ]);
  const documentLoader: DocumentLoader = async (url) => {
    const document = documents.get(url);
    assert.ok(document, `Unexpected document lookup: ${url}`);
    return { contextUrl: null, document, documentUrl: url };
  };
  const authorization = quoteInteraction.createAuthorization({
    attributedTo: targetAuthorUri,
    id: new URL('https://remote.example/quote-authorizations/signed'),
    interactingObject: quoteUri,
    interactionTarget: targetUri,
  });
  const signed = await signObject(authorization, keyPair.privateKey, keyId, { documentLoader });
  const serialized = await signed.toJsonLd();
  const verified = await verifyObject(QuoteAuthorization, serialized, { documentLoader });
  assert.ok(verified);
  assert.equal(verified.interactingObjectId?.href, quoteUri.href);
  assert.equal(verified.interactionTargetId?.href, targetUri.href);
  const quote = new Note({
    id: quoteUri,
    attribution: quoteAuthorUri,
    quote: targetUri,
    quoteAuthorization: signed,
  });
  const nested = await quote.toJsonLd();
  assert.ok(nested && typeof nested === 'object' && 'quoteAuthorization' in nested);
  const verifiedNested = await verifyObject(QuoteAuthorization, nested.quoteAuthorization, {
    documentLoader,
  });
  assert.ok(verifiedNested);
  const hydrated = await Note.fromJsonLd(nested, { documentLoader });
  assert.equal(hydrated.quoteAuthorizationId?.href, authorization.id?.href);
  const tampered = structuredClone(serialized) as Record<string, unknown>;
  tampered.interactionTarget = 'https://remote.example/posts/other';
  assert.equal(await verifyObject(QuoteAuthorization, tampered, { documentLoader }), null);
  documents.set(targetAuthorUri.href, await new Person({ id: targetAuthorUri }).toJsonLd());
  assert.equal(await verifyObject(QuoteAuthorization, serialized, { documentLoader }), null);
});
