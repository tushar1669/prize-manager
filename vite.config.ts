import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import type { UserConfig } from 'vitest/config';
import { componentTagger } from "lovable-tagger";
import { execSync } from "node:child_process";

// https://vitejs.dev/config/

const buildCommit = execSync("git rev-parse --short HEAD 2>/dev/null || echo unknown", { encoding: "utf8" }).trim();
const buildTime = new Date().toISOString();

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "npm:@supabase/supabase-js@2": "@supabase/supabase-js",
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.spec.ts'],
  } satisfies UserConfig['test'],
}));
