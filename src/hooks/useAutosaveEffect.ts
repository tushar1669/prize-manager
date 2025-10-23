// src/hooks/useAutosaveEffect.ts
import { useEffect, useRef } from 'react';
import { setDraft } from '@/utils/autosave';

export function useAutosaveEffect<T>(opts: {
  key: string;
  data: T;
  enabled?: boolean;
  debounceMs?: number;
  version?: number;
}) {
  const { key, data, enabled = true, debounceMs = 1200, version = 1 } = opts;
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setDraft(key, data as any, version);
    }, debounceMs);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [key, enabled, debounceMs, version, data]);
}
