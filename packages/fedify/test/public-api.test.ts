import { actorPathTemplate, createKosmoFederation } from '../index';
import { fedifyHook } from '../sveltekit';
import type { Federation, KvStore } from '@fedify/fedify';
import type { KosmoFederationContextData } from '../index';

declare const kv: KvStore;

const federation: Federation<KosmoFederationContextData> = createKosmoFederation({ kv });
const handle = fedifyHook(federation);

void federation;
void handle;

const actorSetters = federation.setActorDispatcher(actorPathTemplate, async () => null);
actorSetters.setKeyPairsDispatcher(async () => []);
federation.setWebFingerLinksDispatcher(async () => []);
