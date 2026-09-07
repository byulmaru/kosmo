/* eslint-disable-next-line simple-import-sort/imports -- capture native locale before Intl polyfill modules */
import { match } from '@formatjs/intl-localematcher';

import { nativeDefaultNumberFormatLocale } from './intl-default-locale';
import '@formatjs/intl-locale/polyfill.js';
import '@formatjs/intl-pluralrules/polyfill.js';
import '@formatjs/intl-numberformat/polyfill.js';
import '@formatjs/intl-relativetimeformat/polyfill.js';

import { shouldPolyfill as shouldPolyfillNumberFormat } from '@formatjs/intl-numberformat/should-polyfill.js';
import { shouldPolyfill as shouldPolyfillPluralRules } from '@formatjs/intl-pluralrules/should-polyfill.js';
import { shouldPolyfill as shouldPolyfillRelativeTimeFormat } from '@formatjs/intl-relativetimeformat/should-polyfill.js';

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

const pluralRulesLocaleDataContext = (require as ContextRequire).context(
  './node_modules/@formatjs/intl-pluralrules/locale-data',
  false,
  /\.js$/,
);

const numberFormatLocaleDataContext = (require as ContextRequire).context(
  './node_modules/@formatjs/intl-numberformat/locale-data',
  false,
  /\.js$/,
);

const localeBasenames = (context: LocaleDataContext) =>
  context.keys().map((key) => key.slice(key.lastIndexOf('/') + 1, -3));

const loadLocaleModule = (context: LocaleDataContext, locale: string) => {
  const moduleName = context.keys().find((key) => key.endsWith(`/${locale}.js`));
  if (moduleName) {
    context(moduleName);
  }
};

const loadMatchedLocaleModule = (
  context: LocaleDataContext,
  locale: string,
  algorithm: 'lookup' | 'best fit' = 'best fit',
) => {
  const matchedLocale = match([locale], localeBasenames(context), 'en', { algorithm });
  loadLocaleModule(context, matchedLocale);
};

const loadLocaleData = (
  shouldPolyfill: (locale?: string) => string | undefined,
  context: LocaleDataContext,
  locale: string,
  algorithm?: 'lookup' | 'best fit',
) => {
  const matchedLocale = shouldPolyfill(locale);
  if (!matchedLocale) {
    return;
  }

  loadMatchedLocaleModule(context, locale, algorithm);
};

// PluralRules data is language-only in several cases (for example, sr-Latn maps to sh), so use lookup to match NumberFormat's requested language fallback.
export const loadIntlLocale = (locale: string) => {
  loadLocaleData(shouldPolyfillPluralRules, pluralRulesLocaleDataContext, locale, 'lookup');
  loadLocaleData(shouldPolyfillNumberFormat, numberFormatLocaleDataContext, locale);
  loadLocaleData(shouldPolyfillRelativeTimeFormat, localeDataContext, locale);
};

// The polyfills probe an English formatter before locale data is selected.
// Seed the native default first so a missing NumberFormat keeps device locale semantics.
const nativeLocale = nativeDefaultNumberFormatLocale ?? 'en';
loadMatchedLocaleModule(pluralRulesLocaleDataContext, nativeLocale, 'lookup');
loadMatchedLocaleModule(numberFormatLocaleDataContext, nativeLocale);
loadMatchedLocaleModule(localeDataContext, nativeLocale);
loadLocaleModule(pluralRulesLocaleDataContext, 'en');
loadLocaleModule(numberFormatLocaleDataContext, 'en');
loadLocaleModule(localeDataContext, 'en');

loadIntlLocale('ko');
