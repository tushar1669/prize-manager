import React, { useState, useCallback, useMemo, ReactNode } from 'react';
import { DirtyContext, type DirtyKey, type DirtyContextValue } from '@/contexts/DirtyContext.shared';

export function DirtyProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<Record<DirtyKey, boolean>>({});
  const [onSave, setOnSave] = useState<(() => Promise<void>) | null>(null);

  const isDirty = useMemo(() => Object.values(sources).some(Boolean), [sources]);

  const setDirty = useCallback((key: DirtyKey, value: boolean) => {
    setSources(prev => {
      const wasSet = !!prev[key];
      if (value === wasSet) return prev; // No change, skip update
      const next = { ...prev };
      if (value) next[key] = true; else delete next[key];
      // Quiet by default (flip DEBUG in Setup if you need noise)
      return next;
    });
  }, []);

  const resetDirty = useCallback((key?: DirtyKey) => {
    if (!key) {
      console.log('[guard] resetDirty', { scope: 'all' });
      setSources({});
      return;
    }
    console.log('[guard] resetDirty', { key });
    setSources(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const registerOnSave = useCallback((fn: (() => Promise<void>) | null) => {
    setOnSave(() => fn);
  }, []);

  return (
    <DirtyContext.Provider value={{ isDirty, sources, setDirty, resetDirty, onSave, registerOnSave }}>
      {children}
    </DirtyContext.Provider>
  );
}
