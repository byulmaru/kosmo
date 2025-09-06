import { getString } from '@kosmo/i18n';
import { writable } from 'svelte/store';

type I18nFunction = (key: string | null | undefined, args?: Record<string, string>) => string;

const makeI18n = (locales: readonly string[]) => {
  return (key: string | null | undefined, args: Record<string, string> = {}) =>
    key
      ? getString({
          locales,
          key,
          args,
        })
      : '';
};

export const i18n = writable<I18nFunction>((key) => key ?? '');

export function setLanguages(langs: readonly string[]) {
  i18n.set(makeI18n(langs));
}
