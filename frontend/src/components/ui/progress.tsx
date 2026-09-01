import { cn } from '@/lib/utils';

function Progress({
  value = 0,
  className
}: {
  value?: number;
  className?: string;
}) {
  return (
    <div
      data-slot="progress"
      className={cn('bg-muted h-2 w-full overflow-hidden rounded-full', className)}
    >
      <div
        className="bg-primary h-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export { Progress };
