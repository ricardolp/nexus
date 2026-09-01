import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { NexusMark } from '@/components/brand/nexus-mark';

type NexusLogoProps = {
  to?: string;
  markSize?: number;
  stacked?: boolean;
  wordmark?: boolean;
  subtitle?: string;
  onDark?: boolean;
  className?: string;
};

export function NexusLogo({
  to = '/',
  markSize = 28,
  stacked = false,
  wordmark = true,
  subtitle,
  onDark = false,
  className
}: NexusLogoProps) {
  const content = (
    <>
      <NexusMark size={markSize} />
      {wordmark && (
        <div className={cn('min-w-0', stacked && 'text-center')}>
          <span
            className={cn(
              'block font-semibold tracking-tight',
              stacked ? 'text-2xl' : 'text-base leading-none',
              onDark ? (stacked ? 'text-zinc-300' : 'text-white') : 'text-foreground'
            )}
          >
            Nexus
          </span>
          {subtitle ? (
            <span
              className={cn(
                'block truncate text-xs leading-snug',
                onDark ? 'text-white/50' : 'text-muted-foreground'
              )}
            >
              {subtitle}
            </span>
          ) : null}
        </div>
      )}
    </>
  );

  const layout = stacked ? 'flex flex-col items-center gap-4' : 'flex items-center gap-2.5';

  if (to) {
    return (
      <Link to={to} className={cn(layout, className)}>
        {content}
      </Link>
    );
  }

  return <div className={cn(layout, className)}>{content}</div>;
}
