import React from 'react';
import { cn } from './cn';

export interface FieldLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  hint?: string;
}

export const FieldLabel: React.FC<FieldLabelProps> = ({ className, children, hint, ...props }) => (
  <label
    className={cn(
      'flex items-center justify-between gap-2 text-[11.5px] font-medium text-text-secondary mb-1.5 select-none',
      className,
    )}
    {...props}
  >
    <span>{children}</span>
    {hint ? <span className="font-mono text-[10.5px] text-text-muted">{hint}</span> : null}
  </label>
);

export interface StudioInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  compact?: boolean;
}

export const StudioInput = React.forwardRef<HTMLInputElement, StudioInputProps>(
  ({ className, mono, compact, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full bg-input text-text-primary placeholder:text-text-muted border border-border-subtle rounded-[6px]',
        'outline-none transition-colors duration-100',
        'hover:border-border-strong focus:border-accent',
        'disabled:opacity-45 disabled:cursor-not-allowed',
        compact ? 'h-7 px-2 text-[12px]' : 'h-8 px-2.5 text-[12.5px]',
        mono && 'font-mono tabular-nums',
        className,
      )}
      {...props}
    />
  ),
);

StudioInput.displayName = 'StudioInput';

export interface StudioTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
}

export const StudioTextarea = React.forwardRef<HTMLTextAreaElement, StudioTextareaProps>(
  ({ className, mono, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full bg-input text-text-primary placeholder:text-text-muted border border-border-subtle rounded-[6px]',
        'px-2.5 py-2 text-[12.5px] leading-relaxed outline-none transition-colors duration-100 resize-y',
        'hover:border-border-strong focus:border-accent',
        'disabled:opacity-45 disabled:cursor-not-allowed',
        mono && 'font-mono tabular-nums',
        className,
      )}
      {...props}
    />
  ),
);

StudioTextarea.displayName = 'StudioTextarea';
