/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IMPORT_LOGS_ENABLED?: string;
  readonly VITE_IMPORT_DEDUP_ENABLED?: string;
  readonly VITE_SERVER_IMPORT_ENABLED?: string;
  readonly VITE_IMPORT_SIZE_THRESHOLD_MB?: string;
  readonly VITE_IMPORT_BUCKET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
