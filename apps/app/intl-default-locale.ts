export const nativeDefaultNumberFormatLocale = (() => {
  try {
    return new Intl.NumberFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
})();
