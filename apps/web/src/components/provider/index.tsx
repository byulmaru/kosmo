import { StrictMode } from 'react';
import I18nProvider from './i18n';
import RelayProvider from './relay';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StrictMode>
      <RelayProvider>
        <I18nProvider>{children}</I18nProvider>
      </RelayProvider>
    </StrictMode>
  );
}
