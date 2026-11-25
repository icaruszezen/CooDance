import React from 'react';
import { Separator, type SeparatorProps } from 'react-resizable-panels';
import { cn } from './cn';

export const ResizeHandle: React.FC<SeparatorProps> = ({ className, ...props }) => {
  return <Separator className={cn('studio-resize-handle', className)} {...props} />;
};
