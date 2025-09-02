import { getString } from '@kosmo/i18n';
import { writable } from 'svelte/store';

const makeI18n = (locales: readonly string[]) => {
  return (key: string, args: Record<string, string> = {}) =>
    getString({
      locales,
      key,
      args,
    });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const i18n = writable((key: string, args: Record<string, string> = {}) => key);

export function setLanguages(langs: readonly string[]) {
  i18n.set(makeI18n(langs));
}
