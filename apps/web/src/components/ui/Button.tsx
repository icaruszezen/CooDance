import React from 'react';
import { cn } from './cn';

export type ButtonVariant = 'default' | 'primary' | 'accent' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default:
    'bg-elevated text-text-primary border border-border-subtle hover:bg-hover hover:border-border-strong active:bg-active',
  primary:
    'bg-primary text-primary-ink border border-transparent hover:bg-primary-hover font-semibold',
  accent:
    'bg-accent text-accent-ink border border-transparent hover:bg-accent-hover font-semibold',
  ghost:
    'bg-transparent text-text-secondary border border-transparent hover:bg-hover hover:text-text-primary active:bg-active',
  danger:
    'bg-danger-soft text-danger border border-transparent hover:border-danger/40 active:opacity-90',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-[11px] gap-1 rounded-[5px]',
  sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-[6px]',
  md: 'h-8 px-3 text-[12.5px] gap-1.5 rounded-[6px]',
  icon: 'h-7 w-7 p-0 rounded-[6px]',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'sm', type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap font-medium select-none cursor-pointer transition-colors duration-100',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong',
          'disabled:opacity-40 disabled:pointer-events-none',
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
