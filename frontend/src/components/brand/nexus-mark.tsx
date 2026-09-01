import { useId, type SVGProps } from 'react';

import { cn } from '@/lib/utils';

type NexusMarkProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

export function NexusMark({ size = 32, className, ...props }: NexusMarkProps) {
  const uid = useId().replace(/:/g, '');
  const n = `nx-n-${uid}`;
  const e = `nx-e-${uid}`;
  const s = `nx-s-${uid}`;
  const w = `nx-w-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      aria-hidden={props['aria-label'] ? undefined : true}
      {...props}
    >
      <defs>
        <linearGradient id={n} x1="20" y1="20" x2="48" y2="2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6B6EF5" />
          <stop offset="1" stopColor="#F062C8" />
        </linearGradient>
        <linearGradient id={e} x1="44" y1="20" x2="62" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F062C8" />
          <stop offset="1" stopColor="#5C71FF" />
        </linearGradient>
        <linearGradient id={s} x1="44" y1="44" x2="16" y2="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F062C8" />
          <stop offset="1" stopColor="#6B6EF5" />
        </linearGradient>
        <linearGradient id={w} x1="20" y1="44" x2="2" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5C71FF" />
          <stop offset="1" stopColor="#F062C8" />
        </linearGradient>
      </defs>
      <polygon points="32,2 44,20 20,20" fill={`url(#${n})`} />
      <polygon points="62,32 44,20 44,44" fill={`url(#${e})`} />
      <polygon points="32,62 44,44 20,44" fill={`url(#${s})`} />
      <polygon points="2,32 20,20 20,44" fill={`url(#${w})`} />
    </svg>
  );
}
