import { ReactNode, Suspense, useEffect, useMemo } from 'react';
import { I18nextProvider } from 'react-i18next';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { getClientCookie, setClientCookie } from '@/lib/cookie';
import i18n from '@/lib/i18n';
import { i18n_Query } from '$relay/i18n_Query.graphql';

function LanguageSyncer({ pull }: { pull?: boolean }) {
  const data = useLazyLoadQuery<i18n_Query>(
    graphql`
      query i18n_Query {
        languages
      }
    `,
    {},
    { fetchPolicy: pull ? 'store-or-network' : 'store-only' },
  );

  useEffect(() => {
    if (data.languages) {
      i18n.changeLanguage(data.languages[0]);
      setClientCookie('lang', data.languages[0]);
    }
  }, [data.languages]);

  return null;
}

export default function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useMemo(() => getClientCookie('lang'), []);
  if (lang) {
    i18n.changeLanguage(lang);
  }

  return (
    <I18nextProvider i18n={i18n}>
      <Suspense fallback={null}>
        <LanguageSyncer pull={!lang} />
      </Suspense>
      {children}
    </I18nextProvider>
  );
}
