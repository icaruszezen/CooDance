import React from 'react';
import brandLogoUrl from '../assets/brand-logo.png';

export type BrandMarkSize = 'sm' | 'md' | 'lg';

interface BrandMarkProps {
  size?: BrandMarkSize;
  className?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ size = 'sm', className }) => {
  const classes = ['brand-mark', `brand-mark-${size}`, className].filter(Boolean).join(' ');
  return (
    <span className={classes} aria-hidden="true">
      <img
        src={brandLogoUrl}
        alt="CooDance Studio"
        className="brand-mark-img"
        draggable={false}
      />
    </span>
  );
};
