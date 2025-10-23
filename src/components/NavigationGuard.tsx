import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDirty } from '@/contexts/DirtyContext';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

export function NavigationGuard() {
  const { isDirty, onSave, resetDirty } = useDirty();
  const location = useLocation();
  const navigate = useNavigate();
  const [showDialog, setShowDialog] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<string | null>(null);

  // Track location changes for in-app navigation guard
  useEffect(() => {
    // Navigation handled by GuardedLink and useGuardedNavigate
    // This component primarily handles browser-level events (popstate, beforeunload)
  }, []);

  // Handle browser back/forward with popstate
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (isDirty) {
        console.log('[guard] popstate blocked', { isDirty });
        e.preventDefault();
        // Push current location back to maintain history position
        window.history.pushState(null, '', location.pathname);
        setShowDialog(true);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isDirty, location.pathname]);

  // Handle browser refresh/close with beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        console.log('[guard] beforeunload triggered', { isDirty });
        e.preventDefault();
        e.returnValue = ''; // Standard way to trigger browser default prompt
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleStay = () => {
    console.log('[guard] user stayed');
    setShowDialog(false);
    setPendingLocation(null);
  };

  const handleLeave = () => {
    console.log('[guard] user left without saving');
    resetDirty();
    setShowDialog(false);
    if (pendingLocation) {
      navigate(pendingLocation);
    }
    setPendingLocation(null);
  };

  const handleSaveAndContinue = onSave
    ? async () => {
        console.log('[guard] save-and-continue initiated');
        try {
          await onSave();
          console.log('[guard] save-and-continue success');
          resetDirty();
          setShowDialog(false);
          if (pendingLocation) {
            navigate(pendingLocation);
          }
          setPendingLocation(null);
        } catch (error) {
          console.error('[guard] save-and-continue failed', error);
          // Stay on page if save fails
        }
      }
    : null;

  return (
    <UnsavedChangesDialog
      open={showDialog}
      onStay={handleStay}
      onLeave={handleLeave}
      onSaveAndContinue={handleSaveAndContinue}
    />
  );
}
