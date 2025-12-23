import { useEffect } from 'react';
import { useDirty } from '@/contexts/DirtyContext.shared';

export function GlobalShortcuts() {
  const { onSave } = useDirty();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        if (onSave) {
          e.preventDefault();
          console.log('[shortcut] save invoked');
          onSave().catch(err => {
            console.error('[shortcut] save failed', err);
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSave]);

  return null;
}
