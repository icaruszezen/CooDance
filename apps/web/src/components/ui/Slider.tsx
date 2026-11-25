import React from 'react';
import { Slider } from '@base-ui/react/slider';
import { cn } from './cn';

export interface StudioSliderProps {
  id?: string;
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export const StudioSlider: React.FC<StudioSliderProps> = ({
  id,
  value,
  onValueChange,
  min,
  max,
  step = 0.01,
  disabled,
  className,
  'aria-label': ariaLabel,
}) => {
  const safeVal = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

  return (
    <Slider.Root
      id={id}
      value={safeVal}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(next) => {
        if (typeof next === 'number' && Number.isFinite(next)) {
          onValueChange(next);
        }
      }}
      className={cn('w-full select-none touch-none', disabled && 'opacity-45 pointer-events-none', className)}
    >
      <Slider.Control className="flex items-center w-full h-6 cursor-pointer">
        {/* Track MUST be relative and MUST NOT have overflow-hidden so Slider.Thumb positions accurately */}
        <Slider.Track className="relative w-full h-[4px] rounded-full bg-hover">
          <Slider.Indicator className="h-full rounded-full bg-accent" />
          <Slider.Thumb
            aria-label={ariaLabel}
            className={cn(
              'block w-3.5 h-3.5 rounded-full bg-primary border border-border-strong shadow-studio-sm',
              'outline-none transition-transform duration-100',
              'hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent/50',
            )}
          />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
};
