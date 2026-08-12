import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@/styles/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/App';
import { SILENT_CALLBACK_PATH } from '@/features/auth';

if (window.location.pathname === SILENT_CALLBACK_PATH) {
  // Hidden silent-renewal iframe: hand the authorization response back to the
  // opener tab's UserManager and stop — the SPA itself must not mount here.
  void import('@/features/auth').then((auth) => auth.completeSilentCallback());
} else {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('index.html is missing the #root element');
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
