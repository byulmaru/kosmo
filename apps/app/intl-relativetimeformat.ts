import '@formatjs/intl-relativetimeformat/polyfill.js';

import { shouldPolyfill } from '@formatjs/intl-relativetimeformat/should-polyfill.js';

type LocaleDataContext = {
  (moduleName: string): unknown;
  keys: () => string[];
};

type ContextRequire = typeof require & {
  context: (directory: string, recursive: boolean, filter: RegExp) => LocaleDataContext;
};

const localeDataContext = (require as ContextRequire).context(
  './node_modules/@formatjs/intl-relativetimeformat/locale-data',
  false,
  /\.js$/,
);

export const loadRelativeTimeFormatLocale = (locale: string) => {
  const matchedLocale = shouldPolyfill(locale);
  if (!matchedLocale) {
    return;
  }

  const moduleName = localeDataContext.keys().find((key) => key.endsWith(`/${matchedLocale}.js`));
  if (moduleName) {
    localeDataContext(moduleName);
  }
};

loadRelativeTimeFormatLocale('ko');
