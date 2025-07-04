import { getString } from '@kosmo/shared/i18n';

let languages = $state<string[]>([]);

export function setLanguages(langs: string[]) {
  languages = langs;
}

export function i18n(key: string, args: Record<string, string> = {}) {
  return getString({
    locales: languages,
    key,
    args,
  });
}
