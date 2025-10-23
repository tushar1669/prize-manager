import { useEffect, useRef } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface UnsavedChangesDialogProps {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
  onSaveAndContinue?: (() => Promise<void>) | null;
}

export function UnsavedChangesDialog({
  open,
  onStay,
  onLeave,
  onSaveAndContinue,
}: UnsavedChangesDialogProps) {
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const dialogTitleId = 'unsaved-changes-title';
  const dialogDescId = 'unsaved-changes-desc';

  // Focus management
  useEffect(() => {
    if (open) {
      console.log('[a11y] dialog opened');
      previousActiveRef.current = document.activeElement as HTMLElement;
      
      // Focus first focusable element after a brief delay (let dialog render)
      setTimeout(() => {
        const firstButton = document.querySelector('[role="dialog"] button');
        if (firstButton instanceof HTMLElement) {
          firstButton.focus();
        }
      }, 100);
    } else if (previousActiveRef.current) {
      console.log('[a11y] dialog closed, restoring focus');
      previousActiveRef.current.focus();
      previousActiveRef.current = null;
    }
  }, [open]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        console.log('[a11y] escape pressed → stay');
        e.preventDefault();
        onStay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onStay]);

  const handleSaveAndContinue = async () => {
    if (onSaveAndContinue) {
      console.log('[guard] save-and-continue initiated');
      try {
        await onSaveAndContinue();
        console.log('[guard] save-and-continue success');
        onLeave();
      } catch (error) {
        console.error('[guard] save-and-continue failed', error);
        // Stay on page if save fails
      }
    }
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent
        aria-labelledby={dialogTitleId}
        aria-describedby={dialogDescId}
      >
        <AlertDialogHeader>
          <AlertDialogTitle id={dialogTitleId}>
            You have unsaved changes
          </AlertDialogTitle>
          <AlertDialogDescription id={dialogDescId}>
            If you leave now, your changes will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          {onSaveAndContinue && (
            <Button onClick={handleSaveAndContinue} variant="default">
              Save & Continue
            </Button>
          )}
          <AlertDialogCancel onClick={onStay} className="m-0">
            Stay on page
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={onLeave} 
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Leave without saving
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
