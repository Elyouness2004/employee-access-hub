/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_OIDC_AUTHORITY?: string;
  readonly VITE_OIDC_CLIENT_ID?: string;
  readonly VITE_OIDC_REDIRECT_URI?: string;
  readonly VITE_OIDC_POST_LOGOUT_REDIRECT_URI?: string;
  readonly VITE_SESSION_IDLE_TIMEOUT_SECONDS?: string;
  readonly VITE_SESSION_MAX_LIFETIME_SECONDS?: string;
  readonly VITE_SESSION_WARNING_SECONDS?: string;
  readonly VITE_DEV_AUTH?: string;
  readonly VITE_DEV_ROLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
