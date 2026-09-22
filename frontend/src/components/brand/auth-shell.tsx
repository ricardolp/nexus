import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { NexusLogo } from '@/components/brand/nexus-logo';

/** Shared card chrome for public auth pages — solid, corporate, no glass/glow. */
export const authCardClassName = 'w-full border bg-card shadow-sm';

export const authFooterLinkClassName =
  'font-medium text-foreground underline underline-offset-4 hover:text-primary';

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
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-background" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,color-mix(in_oklch,var(--primary)_7%,transparent),transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_60%,color-mix(in_oklch,var(--muted)_80%,transparent))]"
      />

      <div className={cn('relative z-10 flex w-full flex-col items-center gap-8', wide ? 'max-w-md' : 'max-w-sm')}>
        <NexusLogo to="/" stacked markSize={64} />
        {children}
        {footer ? <div className="text-muted-foreground text-sm">{footer}</div> : null}
      </div>
    </div>
  );
}
