import { useNavigate } from 'react-router-dom';
import { useCallback, useState } from 'react';
import { useDirty } from '@/contexts/DirtyContext.shared';

export function useGuardedNavigate() {
  const navigate = useNavigate();
  const { isDirty, onSave, resetDirty } = useDirty();
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const guardedNavigate = useCallback(
    (to: string | number, options?: { replace?: boolean }) => {
      // Allow auth routes without guard
      if (typeof to === 'string' && to.startsWith('/auth')) {
        console.log('[guard] navigate allowlisted', { to });
        navigate(to, options);
        return;
      }

      if (!isDirty) {
        console.log('[guard] navigate clean', { to });
        if (typeof to === 'number') {
          navigate(to);
        } else {
          navigate(to, options);
        }
        return;
      }

      console.log('[guard] navigate blocked', { to, isDirty });
      setPendingNavigation(typeof to === 'string' ? to : null);
      setShowDialog(true);
    },
    [isDirty, navigate]
  );

  const handleStay = useCallback(() => {
    console.log('[guard] user stayed');
    setShowDialog(false);
    setPendingNavigation(null);
  }, []);

  const handleLeave = useCallback(() => {
    console.log('[guard] user left without saving');
    resetDirty();
    setShowDialog(false);
    if (pendingNavigation) {
      navigate(pendingNavigation);
    }
    setPendingNavigation(null);
  }, [pendingNavigation, navigate, resetDirty]);

  const handleSaveAndContinue = useCallback(async () => {
    if (onSave) {
      await onSave();
      resetDirty();
      if (pendingNavigation) {
        navigate(pendingNavigation);
      }
      setPendingNavigation(null);
    }
  }, [onSave, pendingNavigation, navigate, resetDirty]);

  return {
    guardedNavigate,
    showDialog,
    handleStay,
    handleLeave,
    handleSaveAndContinue: onSave ? handleSaveAndContinue : null,
  };
}
