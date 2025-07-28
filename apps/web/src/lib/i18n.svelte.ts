import { getString } from '@kosmo/shared/i18n';
import { writable } from 'svelte/store';

const makeI18n = (locales: string[]) => {
  return (key: string, args: Record<string, string> = {}) =>
    getString({
      locales,
      key,
      args,
    });
};

export const i18n = writable((key: string, args: Record<string, string> = {}) => key);

export function setLanguages(langs: string[]) {
  i18n.set(makeI18n(langs));
}
