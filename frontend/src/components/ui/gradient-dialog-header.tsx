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
    <div className="bg-muted/40 rounded-t-lg border-b px-6 py-5">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3 text-xl">
          <span className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-md">
            <Icon className="size-5" />
          </span>
          {title}
        </DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>
    </div>
  );
}
