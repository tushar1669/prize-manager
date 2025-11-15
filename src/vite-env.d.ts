/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_IMPORT_LOGS_ENABLED?: string;
  readonly VITE_IMPORT_DEDUP_ENABLED?: string;
  readonly VITE_SERVER_IMPORT_ENABLED?: string;
  readonly VITE_IMPORT_SIZE_THRESHOLD_MB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
