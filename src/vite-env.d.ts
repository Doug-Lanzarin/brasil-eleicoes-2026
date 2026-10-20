/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TSE_BASE_URL?: string;
  readonly VITE_REFRESH_INTERVAL_SECONDS?: string;
  readonly VITE_STALE_AFTER_SECONDS?: string;
  readonly VITE_DEFAULT_TURNO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
