/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_CONTROL_API_URL?: string;
  readonly VITE_APP_ENV?: string;
  readonly VITE_ENVIRONMENT?: string;
  readonly VITE_SUPPORT_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
