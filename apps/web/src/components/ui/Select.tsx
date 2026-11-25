import React from 'react';
import { Select } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from './cn';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export interface StudioSelectProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
  mono?: boolean;
  className?: string;
  popupClassName?: string;
  'aria-label'?: string;
}

export const StudioSelect: React.FC<StudioSelectProps> = ({
  id,
  value,
  onValueChange,
  options,
  placeholder = 'Select...',
  disabled,
  compact,
  mono,
  className,
  popupClassName,
  'aria-label': ariaLabel,
}) => {
  const selectedOption = options.find((o) => o.value === value);

  return (
    <Select.Root
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
    >
      <Select.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          'inline-flex w-full items-center justify-between gap-2 bg-input text-text-primary border border-border-subtle rounded-[6px]',
          'outline-none transition-colors duration-100 cursor-pointer select-none',
          'hover:border-border-strong focus-visible:border-accent data-[popup-open]:border-accent',
          'disabled:opacity-45 disabled:pointer-events-none',
          compact ? 'h-7 px-2 text-[12px]' : 'h-8 px-2.5 text-[12.5px]',
          mono && 'font-mono',
          className,
        )}
      >
        <Select.Value className="truncate text-left flex-1 min-w-0">
          {selectedOption ? (
            <span className="truncate">{selectedOption.label}</span>
          ) : (
            <span className="text-text-muted">{placeholder}</span>
          )}
        </Select.Value>
        <Select.Icon className="text-text-muted shrink-0 flex items-center">
          <ChevronDown size={13} />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner sideOffset={4} alignItemWithTrigger={false} className="z-[140] outline-none">
          <Select.Popup
            className={cn(
              'min-w-[var(--anchor-width)] max-h-[280px] overflow-y-auto rounded-[8px]',
              'bg-panel border border-border-strong shadow-studio-lg p-1 outline-none',
              popupClassName,
            )}
          >
            <Select.List className="flex flex-col gap-0.5">
              {options.map((opt) => (
                <Select.Item
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  className={cn(
                    'flex items-center justify-between gap-2.5 px-2 py-1.5 rounded-[5px] text-[12px] text-text-secondary',
                    'cursor-pointer select-none outline-none transition-colors duration-75',
                    'data-[highlighted]:bg-hover data-[highlighted]:text-text-primary',
                    'data-[selected]:text-text-primary data-[disabled]:opacity-40 data-[disabled]:pointer-events-none',
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                      <Select.ItemIndicator className="text-accent flex items-center justify-center">
                        <Check size={12} strokeWidth={2.5} />
                      </Select.ItemIndicator>
                    </span>
                    <Select.ItemText className={cn('truncate', mono && 'font-mono text-[11.5px]')}>
                      {opt.label}
                    </Select.ItemText>
                  </div>
                  {opt.hint ? (
                    <span className="font-mono text-[10.5px] text-text-muted shrink-0">
                      {opt.hint}
                    </span>
                  ) : null}
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
};
