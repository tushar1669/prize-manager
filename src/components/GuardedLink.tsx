import { Link, LinkProps, useNavigate } from 'react-router-dom';
import { useDirty } from '@/contexts/DirtyContext.shared';
import { MouseEvent, useState } from 'react';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

export function GuardedLink({ to, onClick, children, ...props }: LinkProps) {
  const { isDirty, onSave, resetDirty } = useDirty();
  const navigate = useNavigate();
  const [showDialog, setShowDialog] = useState(false);
  const [pendingTo, setPendingTo] = useState<string>('');

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Allow auth routes without guard
    const href = typeof to === 'string' ? to : '';
    if (href.startsWith('/auth')) {
      console.log('[guard] link allowlisted', { to: href });
      onClick?.(e);
      return;
    }

    if (isDirty) {
      e.preventDefault();
      console.log('[guard] link blocked', { to: href, isDirty });
      setPendingTo(href);
      setShowDialog(true);
      return;
    }

    console.log('[guard] link clean', { to: href });
    onClick?.(e);
  };

  const handleStay = () => {
    console.log('[guard] user stayed');
    setShowDialog(false);
    setPendingTo('');
  };

  const handleLeave = () => {
    console.log('[guard] user left without saving');
    resetDirty();
    setShowDialog(false);
    navigate(pendingTo);
    setPendingTo('');
  };

  const handleSaveAndContinue = onSave
    ? async () => {
        await onSave();
        resetDirty();
        navigate(pendingTo);
        setPendingTo('');
      }
    : null;

  return (
    <>
      <Link to={to} onClick={handleClick} {...props}>
        {children}
      </Link>
      <UnsavedChangesDialog
        open={showDialog}
        onStay={handleStay}
        onLeave={handleLeave}
        onSaveAndContinue={handleSaveAndContinue}
      />
    </>
  );
}
