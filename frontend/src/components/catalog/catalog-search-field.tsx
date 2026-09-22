import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Option = { value: string; label: string; hint?: string };

export function CatalogSearchField({
  label,
  value,
  displayValue,
  placeholder,
  disabled,
  enabled = true,
  queryKey,
  queryFn,
  onSelect,
  onClear
}: {
  label: string;
  value: string;
  displayValue?: string;
  placeholder?: string;
  disabled?: boolean;
  enabled?: boolean;
  queryKey: unknown[];
  queryFn: (q: string) => Promise<Option[]>;
  onSelect: (opt: Option) => void;
  onClear?: () => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) setQ('');
  }, [open, value]);

  const search = useQuery({
    queryKey: [...queryKey, q],
    queryFn: () => queryFn(q),
    enabled: enabled && open && !disabled
  });

  const selectedLabel = displayValue || value;

  return (
    <div className="relative grid gap-1.5">
      <Label>{label}</Label>
      <Input
        value={open ? q : selectedLabel}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          setOpen(true);
          setQ('');
        }}
        onChange={(e) => {
          setOpen(true);
          setQ(e.target.value);
          if (!e.target.value && onClear) onClear();
        }}
        onBlur={() => {
          // delay so click on option registers
          window.setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && !disabled ? (
        <div className="bg-popover absolute top-full z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border shadow-md">
          {search.isLoading ? (
            <p className="text-muted-foreground px-3 py-2 text-sm">Buscando…</p>
          ) : (search.data ?? []).length === 0 ? (
            <p className="text-muted-foreground px-3 py-2 text-sm">Nenhum resultado</p>
          ) : (
            <ul>
              {(search.data ?? []).map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    className={cn(
                      'hover:bg-muted flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm',
                      opt.value === value && 'bg-muted'
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelect(opt);
                      setOpen(false);
                    }}
                  >
                    <span className="font-medium">{opt.label}</span>
                    {opt.hint ? <span className="text-muted-foreground text-xs">{opt.hint}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
