import type { ReactNode } from 'react';

export function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-muted-foreground text-sm">{label}</span>
      <div className="text-sm font-medium sm:max-w-[60%] sm:text-right">{value || '—'}</div>
    </div>
  );
}
