import { useState, useCallback } from "react";
import type { ErrorInfo } from "@/components/ui/ErrorPanel";

export function useErrorPanel() {
  const [error, setError] = useState<ErrorInfo | null>(null);
  const showError = useCallback((e: ErrorInfo) => setError(e), []);
  const clearError = useCallback(() => setError(null), []);
  return { error, showError, clearError };
}
