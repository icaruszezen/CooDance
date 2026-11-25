import React from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { cn } from './cn';

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: 'max-w-[440px]',
  md: 'max-w-[660px]',
  lg: 'max-w-[760px]',
  xl: 'max-w-[980px]',
};

export interface StudioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  id?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  size?: DialogSize;
  hideHeader?: boolean;
  hideCloseButton?: boolean;
  closeButtonId?: string;
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
  bodyClassName?: string;
  popupClassName?: string;
  children: React.ReactNode;
}

export const StudioDialog: React.FC<StudioDialogProps> = ({
  open,
  onOpenChange,
  id,
  title,
  description,
  headerExtra,
  footer,
  size = 'md',
  hideHeader = false,
  hideCloseButton = false,
  closeButtonId,
  onSubmit,
  bodyClassName,
  popupClassName,
  children,
}) => {
  const inner = (
    <>
      {!hideHeader ? (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-subtle shrink-0">
          <div className="min-w-0 flex-1">
            {title ? (
              <Dialog.Title className="m-0 text-[13.5px] font-semibold tracking-[-0.01em] text-text-primary flex items-center gap-2">
                {title}
              </Dialog.Title>
            ) : null}
            {description ? (
              <Dialog.Description className="m-0 mt-0.5 text-[11.5px] text-text-muted">
                {description}
              </Dialog.Description>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerExtra}
            {!hideCloseButton ? (
              <Dialog.Close
                id={closeButtonId}
                aria-label="Close"
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-text-muted',
                  'transition-colors duration-100 cursor-pointer',
                  'hover:bg-hover hover:text-text-primary focus-visible:bg-hover focus-visible:text-text-primary focus-visible:outline-none',
                )}
              >
                <X size={14} />
              </Dialog.Close>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={cn('flex-1 min-h-0 overflow-y-auto px-4 py-4', bodyClassName)}>
        {children}
      </div>

      {footer ? (
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-subtle bg-panel shrink-0">
          {footer}
        </div>
      ) : null}
    </>
  );

  return (
    <Dialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/62 backdrop-blur-[2px] transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-[105] flex items-center justify-center p-4 overflow-hidden">
          <Dialog.Popup
            id={id}
            className={cn(
              'w-full max-h-[88vh] flex flex-col overflow-hidden rounded-[10px]',
              'bg-panel border border-border-strong shadow-studio-lg outline-none',
              'transition-all duration-150 data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.985] data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.985]',
              SIZE_CLASSES[size],
              popupClassName,
            )}
          >
            {onSubmit ? (
              <form onSubmit={onSubmit} className="flex flex-col min-h-0 max-h-[88vh] overflow-hidden">
                {inner}
              </form>
            ) : (
              inner
            )}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
