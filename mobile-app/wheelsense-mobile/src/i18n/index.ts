import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from './locales/en';
import th from './locales/th';

// Map resources and languages
const resources = {
  en: { translation: en },
  th: { translation: th },
};

// Initialize i18n
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // react already escapes values
    },
    compatibilityJSON: 'v4',
  });

export default i18n;
