import os from 'node:os';
import { dev, stack } from '@kosmo/runtime';

export const lane = dev ? os.hostname() : stack;
