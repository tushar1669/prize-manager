import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

export type DirtyKey = string;

export interface DirtyContextValue {
  isDirty: boolean;
  sources: Record<DirtyKey, boolean>;
  setDirty: (key: DirtyKey, value: boolean) => void;
  resetDirty: (key?: DirtyKey) => void;
  onSave: (() => Promise<void>) | null;
  registerOnSave: (fn: (() => Promise<void>) | null) => void;
}

const DirtyContext = createContext<DirtyContextValue | undefined>(undefined);

export function DirtyProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<Record<DirtyKey, boolean>>({});
  const [onSave, setOnSave] = useState<(() => Promise<void>) | null>(null);

  const isDirty = useMemo(() => Object.values(sources).some(Boolean), [sources]);

  const setDirty = useCallback((key: DirtyKey, value: boolean) => {
    setSources(prev => {
      const wasSet = !!prev[key];
      if (value === wasSet) return prev; // No change, skip update
      
      const next = { ...prev };
      if (value) {
        next[key] = true;
      } else {
        delete next[key];
      }
      
      // Only log on actual transitions
      console.log('[guard] setDirty', { key, value, changed: true });
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
    console.log('[guard] registerOnSave', { registered: !!fn });
    setOnSave(() => fn);
  }, []);

  return (
    <DirtyContext.Provider value={{ isDirty, sources, setDirty, resetDirty, onSave, registerOnSave }}>
      {children}
    </DirtyContext.Provider>
  );
}

export function useDirty(): DirtyContextValue {
  const ctx = useContext(DirtyContext);
  if (!ctx) throw new Error('useDirty must be used within DirtyProvider');
  return ctx;
}
