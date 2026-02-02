import { resources } from '@kosmo/i18n/resources';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n.use(initReactI18next).init({
  fallbackLng: 'en',
  resources,
  interpolation: {
    escapeValue: false,
  },
});

// eslint-disable-next-line import/no-default-export
export default i18n;
