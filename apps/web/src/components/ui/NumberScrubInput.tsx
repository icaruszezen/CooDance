import React from 'react';
import { NumberField } from '@base-ui/react/number-field';
import { MoveHorizontal } from 'lucide-react';
import { cn } from './cn';

export interface NumberScrubInputProps {
  id?: string;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  smallStep?: number;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  format?: Intl.NumberFormatOptions;
  'aria-label'?: string;
}

export const NumberScrubInput: React.FC<NumberScrubInputProps> = ({
  id,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  smallStep,
  prefix,
  suffix,
  disabled,
  compact,
  className,
  format,
  'aria-label': ariaLabel,
}) => {
  return (
    <NumberField.Root
      id={id}
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      smallStep={smallStep ?? (step >= 1 ? 1 : step)}
      disabled={disabled}
      format={{ useGrouping: false, ...format }}
      onValueChange={(next) => {
        if (next !== null && Number.isFinite(next)) {
          onValueChange(next);
        }
      }}
      className={cn('w-full', className)}
    >
      <NumberField.Group
        className={cn(
          'flex items-center w-full bg-input border border-border-subtle rounded-[6px] overflow-hidden',
          'transition-colors duration-100 hover:border-border-strong focus-within:border-accent',
          disabled && 'opacity-45 pointer-events-none',
          compact ? 'h-7' : 'h-8',
        )}
      >
        {prefix ? (
          <NumberField.ScrubArea
            direction="horizontal"
            className="flex items-center justify-center h-full px-2 border-r border-border-subtle bg-elevated/60 text-text-muted hover:text-text-primary cursor-ew-resize select-none shrink-0 font-mono text-[11px]"
          >
            <span>{prefix}</span>
            <NumberField.ScrubAreaCursor className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
              <MoveHorizontal size={14} className="text-accent" />
            </NumberField.ScrubAreaCursor>
          </NumberField.ScrubArea>
        ) : null}

        <NumberField.Input
          aria-label={ariaLabel}
          className={cn(
            'w-full min-w-0 flex-1 bg-transparent text-text-primary font-mono tabular-nums outline-none',
            compact ? 'px-2 text-[12px]' : 'px-2.5 text-[12.5px]',
          )}
        />

        {suffix ? (
          <NumberField.ScrubArea
            direction="horizontal"
            className="flex items-center h-full pr-2 pl-1 text-text-muted hover:text-text-secondary cursor-ew-resize select-none shrink-0 font-mono text-[10.5px]"
          >
            <span>{suffix}</span>
            <NumberField.ScrubAreaCursor className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
              <MoveHorizontal size={14} className="text-accent" />
            </NumberField.ScrubAreaCursor>
          </NumberField.ScrubArea>
        ) : null}
      </NumberField.Group>
    </NumberField.Root>
  );
};
