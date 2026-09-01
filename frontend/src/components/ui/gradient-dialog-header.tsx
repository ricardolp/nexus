import type { ComponentType } from 'react';

import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function GradientDialogHeader({
  icon: Icon,
  title,
  description
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <div
      className="rounded-t-lg border-b px-6 py-5"
      style={{
        backgroundImage:
          'linear-gradient(to right in srgb, color-mix(in srgb, var(--brand-magenta) 16%, transparent), color-mix(in srgb, var(--brand-blue) 10%, transparent), transparent)'
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3 text-xl">
          <span className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
            <Icon className="size-5" />
          </span>
          {title}
        </DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
    </div>
  );
}
