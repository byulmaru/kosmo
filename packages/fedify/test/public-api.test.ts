import { federation } from '../index';
import type { Federation } from '@fedify/fedify';
import type { KosmoFederationContextData } from '../index';

const typedFederation: Federation<KosmoFederationContextData> = federation;

void typedFederation;
