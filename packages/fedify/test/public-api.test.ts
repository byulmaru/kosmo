import { createKosmoFederation } from '../index';
import type { Federation, KvStore } from '@fedify/fedify';
import type { KosmoFederationContextData } from '../index';

declare const kv: KvStore;

const federation: Federation<KosmoFederationContextData> = createKosmoFederation({ kv });

void federation;
