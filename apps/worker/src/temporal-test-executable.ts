import { execFileSync } from 'node:child_process';

export const temporalTestExecutable = {
  type: 'existing-path',
  path: execFileSync('mise', ['which', 'temporal'], { encoding: 'utf8' }).trim(),
} as const;
