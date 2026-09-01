import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { NexusLogo } from '@/components/brand/nexus-logo';

export function AuthShell({
  children,
  footer,
  className,
  wide = false
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6 py-10',
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[#05030a]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,color-mix(in_oklch,var(--brand-magenta)_28%,transparent),transparent_55%),radial-gradient(ellipse_at_50%_80%,color-mix(in_oklch,var(--brand-blue)_22%,transparent),transparent_50%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(5,3,10,0.55))]"
      />

      <div className={cn('relative z-10 flex w-full flex-col items-center gap-8', wide ? 'max-w-md' : 'max-w-sm')}>
        <NexusLogo to="/" stacked onDark markSize={72} />
        {children}
        {footer ? <div className="text-sm text-white/50">{footer}</div> : null}
      </div>
    </div>
  );
}
