import React from 'react';
import { Switch } from '@base-ui/react/switch';
import { cn } from './cn';

export interface StudioSwitchProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export const StudioSwitch: React.FC<StudioSwitchProps> = ({
  id,
  checked,
  onCheckedChange,
  disabled,
  className,
  'aria-label': ariaLabel,
}) => {
  return (
    <Switch.Root
      id={id}
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onCheckedChange={(val) => onCheckedChange(val)}
      className={cn(
        'relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full border p-[2px]',
        'transition-colors duration-150 cursor-pointer outline-none',
        'focus-visible:ring-1 focus-visible:ring-border-strong',
        'bg-hover border-border-strong data-[checked]:bg-accent data-[checked]:border-accent',
        'disabled:opacity-40 disabled:pointer-events-none',
        className,
      )}
    >
      <Switch.Thumb
        className={cn(
          'block h-[12px] w-[12px] rounded-full bg-text-secondary transition-transform duration-150',
          'translate-x-0 data-[checked]:translate-x-[14px] data-[checked]:bg-accent-ink',
        )}
      />
    </Switch.Root>
  );
};
