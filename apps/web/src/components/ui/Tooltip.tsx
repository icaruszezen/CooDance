import React from 'react';
import { Tooltip } from '@base-ui/react/tooltip';
import { cn } from './cn';

export const StudioTooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Tooltip.Provider delay={320} closeDelay={80}>
    {children}
  </Tooltip.Provider>
);

export interface StudioTooltipProps {
  content: React.ReactNode;
  kbd?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactElement;
}

export const StudioTooltip: React.FC<StudioTooltipProps> = ({
  content,
  kbd,
  side = 'bottom',
  children,
}) => {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner side={side} sideOffset={6} className="z-[160]">
          <Tooltip.Popup
            className={cn(
              'inline-flex items-center gap-2 px-2 py-1 rounded-[6px]',
              'bg-elevated border border-border-strong shadow-studio-md',
              'text-[11.5px] font-medium text-text-primary select-none pointer-events-none',
              'transition-opacity duration-100 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
            )}
          >
            <span>{content}</span>
            {kbd ? (
              <kbd className="font-mono text-[10px] text-text-muted bg-canvas border border-border-subtle rounded-[4px] px-1 py-px leading-tight">
                {kbd}
              </kbd>
            ) : null}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
};
