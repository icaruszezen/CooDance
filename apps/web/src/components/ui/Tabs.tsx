import React from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { cn } from './cn';

export interface SegmentedTabItem<T extends string = string> {
  value: T;
  label: React.ReactNode;
  id?: string;
  count?: number;
}

export interface SegmentedTabsProps<T extends string = string> {
  value: T;
  onValueChange: (value: T) => void;
  items: ReadonlyArray<SegmentedTabItem<T>>;
  size?: 'xs' | 'sm';
  className?: string;
}

export function SegmentedTabs<T extends string = string>({
  value,
  onValueChange,
  items,
  size = 'sm',
  className,
}: SegmentedTabsProps<T>): React.ReactElement {
  return (
    <Tabs.Root
      value={value}
      onValueChange={(next) => {
        if (typeof next === 'string') {
          onValueChange(next as T);
        }
      }}
      className={cn('inline-flex', className)}
    >
      <Tabs.List className="inline-flex items-center gap-0.5 p-[2px] rounded-[7px] bg-canvas border border-border-subtle">
        {items.map((item) => (
          <Tabs.Tab
            key={item.value}
            id={item.id}
            value={item.value}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-[5px] font-medium whitespace-nowrap cursor-pointer select-none',
              'transition-colors duration-100 outline-none',
              'text-text-muted hover:text-text-secondary',
              'data-[active]:bg-elevated data-[active]:text-text-primary data-[active]:shadow-studio-sm',
              size === 'xs' ? 'h-6 px-2 text-[11px]' : 'h-[26px] px-2.5 text-[11.5px]',
            )}
          >
            {item.label}
            {typeof item.count === 'number' ? (
              <span className="font-mono text-[10px] text-text-muted">{item.count}</span>
            ) : null}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}
