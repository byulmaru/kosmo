import {
  createKosmoFederation,
  createUnimplementedActivityPubDispatcher,
  createUnimplementedActorKeyDispatcher,
  createWebFingerProfilePageLink,
  createWebFingerSelfLink,
  formatAcctResource,
  formatActorPath,
  isFederationRequestPath,
  parseAcctResource,
} from '../index';
import { createKosmoSvelteKitFederation } from '../sveltekit';
import type { Federation, KvStore } from '@fedify/fedify';
import type { KosmoFederationContextData } from '../index';

declare const kv: KvStore;

const federation: Federation<KosmoFederationContextData> = createKosmoFederation({ kv });
const svelteKitFederation: Federation<KosmoFederationContextData> = createKosmoSvelteKitFederation({
  kv,
});

void federation;
void svelteKitFederation;

const acctResource = formatAcctResource({ handle: 'Alice', domain: 'Example.COM' });
const parsedAcctResource = parseAcctResource('acct:Alice@Example.COM');
const actorPath = formatActorPath('5a5364b8-e2d5-8000-8000-000000000000');
const dispatcher = createUnimplementedActivityPubDispatcher('PROD-176');
const keyDispatcher = createUnimplementedActorKeyDispatcher('PROD-176');
const selfLink = createWebFingerSelfLink(new URL('https://example.com/ap/actor/profile-id'));
const profilePageLink = createWebFingerProfilePageLink(new URL('https://example.com/@alice'));
const isFederationRequest = isFederationRequestPath('/.well-known/webfinger');

void acctResource;
void parsedAcctResource;
void actorPath;
void dispatcher;
void keyDispatcher;
void selfLink;
void profilePageLink;
void isFederationRequest;
