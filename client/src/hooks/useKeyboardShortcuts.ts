import { useEffect } from 'react';

interface ShortcutHandlers {
  onLeft?: () => void;
  onRight?: () => void;
  onUp?: () => void;
  onDown?: () => void;
  onUndo?: () => void;
}

export function useKeyboardShortcuts({ onLeft, onRight, onUp, onDown, onUndo }: ShortcutHandlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          onLeft?.();
          break;
        case 'ArrowRight':
          e.preventDefault();
          onRight?.();
          break;
        case 'ArrowUp':
          e.preventDefault();
          onUp?.();
          break;
        case 'ArrowDown':
          e.preventDefault();
          onDown?.();
          break;
        case 'z':
        case 'Z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            onUndo?.();
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onLeft, onRight, onUp, onDown, onUndo]);
}
