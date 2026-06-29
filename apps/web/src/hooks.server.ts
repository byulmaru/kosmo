import { fedifyHook } from '@fedify/sveltekit';
import { federation } from '@kosmo/fedify';

export const handle = fedifyHook(federation);
