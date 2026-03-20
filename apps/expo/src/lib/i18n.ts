import { resources } from '@kosmo/i18n/resources';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resolveLanguage = (languageTag?: string) => {
  if (languageTag?.toLowerCase().startsWith('ko')) {
    return 'ko';
  }

  return 'en';
};

const deviceLanguage = resolveLanguage(getLocales()[0]?.languageTag);

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: deviceLanguage,
    fallbackLng: 'en',
    supportedLngs: ['en', 'ko'],
    resources,
    interpolation: {
      escapeValue: false,
    },
  });
}

export const getDeviceLanguage = () => resolveLanguage(getLocales()[0]?.languageTag);

// eslint-disable-next-line import/no-default-export
export default i18n;
