/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IMPORT_LOGS_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
