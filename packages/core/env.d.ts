declare module 'bun' {
  interface Env {
    DATABASE_URL: string;
    EXPO_PUBLIC_API_ORIGIN: string;
    EXPO_PUBLIC_OIDC_CLIENT_ID?: string;
    EXPO_PUBLIC_OIDC_ISSUER?: string;
    EXPO_PUBLIC_ORIGIN: string;
    OAUTH_ISSUER: string;
    OAUTH_WEB_CLIENT_ID: string;
    OAUTH_WEB_REDIRECT_URI?: string;
    OAUTH_WEB_SCOPES?: string;
    OIDC_CLIENT_ID: string;
    OIDC_CLIENT_SECRET: string;
    OIDC_ISSUER: string;
    OIDC_REDIRECT_URI: string;
  }
}
