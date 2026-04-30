declare module 'bun' {
  interface Env {
    DATABASE_URL: string;
    EXPO_PUBLIC_API_ORIGIN: string;
    EXPO_PUBLIC_ORIGIN: string;
  }
}
