import { createContext, useContext } from "react";

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

function useDirty(): DirtyContextValue {
  const ctx = useContext(DirtyContext);
  if (!ctx) throw new Error("useDirty must be used within DirtyProvider");
  return ctx;
}

export { DirtyContext, useDirty };
