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
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
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
          <AlertDialogAction onClick={onLeave} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Leave without saving
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
