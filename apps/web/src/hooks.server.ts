import { fedifyHook } from '@fedify/fedify/x/sveltekit';
import { federation } from '@kosmo/shared/federation';

export const handle = fedifyHook(federation, () => null);
