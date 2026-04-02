import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

interface LockdownOptions {
  onViolationReport?: (type: string) => void;
  enabled?: boolean;
}

export const useAssessmentLockdown = ({ onViolationReport, enabled = true }: LockdownOptions = {}) => {
  const [isFullscreen, setIsFullscreen] = useState(document.fullscreenElement !== null);

  useEffect(() => {
    if (!enabled) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      onViolationReport?.('RIGHT_CLICK_ATTEMPT');
      toast.error('Right-click is disabled.');
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Block middle click (often used for paste on Linux)
      if (e.button === 1) {
        e.preventDefault();
        toast.error('Middle-click is disabled.');
      }
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      let violated = false;
      let violationMsg = '';

      // Block F1-F12
      if (e.key.match(/^F([1-9]|1[0-2])$/)) {
        violated = true;
        violationMsg = 'Function keys are disabled.';
      }

      // Block Windows/Command key
      if (e.key === 'Meta' || e.key === 'OS') {
        violated = true;
        violationMsg = 'System keys are disabled.';
      }

      // Block Ctrl/Cmd and Alt combinations
      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl || e.altKey) {
         // Block DevTools shortcuts strictly
         if (e.shiftKey && ['I', 'J', 'C', 'K'].includes(e.key.toUpperCase())) {
            violated = true;
            violationMsg = 'Developer tools blocked.';
         }
         // Block View Source, Save, Print, Find
         if (['U', 'S', 'P', 'F'].includes(e.key.toUpperCase())) {
            violated = true;
            violationMsg = 'This shortcut is disabled.';
         }
         // Block copy/paste/cut overrides in extreme lockdown
         if (['C', 'V', 'X'].includes(e.key.toUpperCase())) {
            violated = true;
            violationMsg = 'Clipboard actions are disabled.';
         }
      }

      if (violated) {
        e.preventDefault();
        e.stopPropagation();
        onViolationReport?.('RESTRICTED_KEY_PRESSED');
        toast.error(violationMsg, { id: 'lockdown-kb' });
      }
    };

    const handleClipboard = (e: ClipboardEvent) => {
      e.preventDefault();
      onViolationReport?.('CLIPBOARD_OPERATION');
      toast.error('Copy/Paste/Cut are disabled.', { id: 'lockdown-clip' });
    };

    const handleDragDrop = (e: Event) => {
      e.preventDefault();
      toast.error('Drag & Drop actions are disabled.', { id: 'lockdown-drag' });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        onViolationReport?.('TAB_SWITCH');
        toast.error('Changing tabs is strictly prohibited!');
      }
    };

    const handleFullscreenChange = () => {
      const isFull = document.fullscreenElement !== null;
      setIsFullscreen(isFull);
      if (!isFull) {
        onViolationReport?.('FULLSCREEN_EXIT');
        toast.error('Fullscreen mode exited! Please re-enter.', { id: 'fs-exit' });
      }
    };

    // Attach events using capture phase to intercept before Monaco/others
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('copy', handleClipboard, true);
    document.addEventListener('cut', handleClipboard, true);
    document.addEventListener('paste', handleClipboard, true);
    document.addEventListener('dragstart', handleDragDrop, true);
    document.addEventListener('drop', handleDragDrop, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('visibilitychange', handleVisibilityChange, true);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('copy', handleClipboard, true);
      document.removeEventListener('cut', handleClipboard, true);
      document.removeEventListener('paste', handleClipboard, true);
      document.removeEventListener('dragstart', handleDragDrop, true);
      document.removeEventListener('drop', handleDragDrop, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange, true);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [enabled, onViolationReport]);

  const enterFullscreen = () => {
    document.documentElement.requestFullscreen().catch(() => {
      toast.error('Fullscreen request failed. Check browser permissions.');
    });
  };

  return { isFullscreen, enterFullscreen };
};
