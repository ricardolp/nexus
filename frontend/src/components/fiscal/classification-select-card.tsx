import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon, InfoIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type ClassificationOption = {
  value: string;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'outline';
  keywords?: string;
};

export function ClassificationSelectCard({
  label,
  required,
  tooltip,
  helpText,
  value,
  title,
  subtitle,
  badge,
  badgeVariant = 'outline',
  placeholder = 'Selecione',
  disabled,
  options,
  searchable = true,
  searchPlaceholder = 'Buscar…',
  emptyText = 'Nenhuma opção encontrada',
  initialVisibleCount,
  expandLabel,
  remoteSearch,
  onChange
}: {
  label: string;
  required?: boolean;
  tooltip?: string;
  helpText?: string;
  value: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'outline';
  placeholder?: string;
  disabled?: boolean;
  options: ClassificationOption[];
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  /** When set and there is no search query, only show this many local options until expanded. */
  initialVisibleCount?: number;
  /** Label for the expand control. Receives how many options are still hidden. */
  expandLabel?: (hiddenCount: number) => string | undefined;
  remoteSearch?: {
    enabled?: boolean;
    queryKey: unknown[];
    queryFn: (q: string) => Promise<ClassificationOption[]>;
  };
  onChange: (opt: ClassificationOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!open) {
      setQ('');
      setExpanded(false);
    }
  }, [open]);

  const remoteEnabled = !!remoteSearch?.enabled && open && !disabled;
  const remoteQuery = useQuery({
    queryKey: [...(remoteSearch?.queryKey ?? ['classification-remote']), q],
    queryFn: () => remoteSearch!.queryFn(q),
    enabled: remoteEnabled
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const local = !needle
      ? options
      : options.filter((opt) => {
          const hay = `${opt.title} ${opt.subtitle ?? ''} ${opt.keywords ?? ''} ${opt.value}`.toLowerCase();
          return hay.includes(needle);
        });
    const remote = remoteQuery.data ?? [];
    if (remote.length === 0) return local;
    const seen = new Set<string>();
    for (const opt of local) {
      seen.add(opt.value);
      const digits = `${opt.value} ${opt.subtitle ?? ''} ${opt.keywords ?? ''}`.match(/\d{7}/);
      if (digits) seen.add(digits[0]);
    }
    const extra = remote.filter((opt) => {
      if (seen.has(opt.value)) return false;
      const digits = `${opt.value} ${opt.subtitle ?? ''} ${opt.keywords ?? ''}`.match(/\d{7}/);
      if (digits && seen.has(digits[0])) return false;
      return true;
    });
    return extra.length === 0 ? local : [...local, ...extra];
  }, [options, q, remoteQuery.data]);

  const searching = q.trim().length > 0;
  const canCollapse =
    !searching &&
    !expanded &&
    typeof initialVisibleCount === 'number' &&
    initialVisibleCount > 0 &&
    filtered.length > initialVisibleCount;
  const visible = canCollapse ? filtered.slice(0, initialVisibleCount) : filtered;
  const hiddenCount = canCollapse ? filtered.length - visible.length : 0;
  const expandText = hiddenCount > 0 && expandLabel ? expandLabel(hiddenCount) : undefined;

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-1.5">
        <Label>
          {label}
          {required ? ' *' : ''}
        </Label>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground inline-flex"
                aria-label={`Ajuda: ${label}`}
              >
                <InfoIcon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'border-input bg-background hover:bg-accent/40 flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
              'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none',
              disabled && 'pointer-events-none opacity-60'
            )}
          >
            <div className="min-w-0 flex-1">
              {title ? (
                <>
                  <p className="text-sm leading-snug font-semibold">{title}</p>
                  {subtitle ? <p className="text-muted-foreground mt-0.5 text-xs">{subtitle}</p> : null}
                </>
              ) : (
                <p className="text-muted-foreground text-sm">{placeholder}</p>
              )}
            </div>
            {badge ? (
              <Badge variant={badgeVariant} className="mt-0.5 shrink-0 rounded-full px-2.5">
                {badge}
              </Badge>
            ) : null}
            <ChevronDownIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          {searchable ? (
            <div className="border-b p-2">
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder}
              />
            </div>
          ) : null}
          <div className="max-h-64 overflow-auto p-1">
            {remoteEnabled && remoteQuery.isLoading && visible.length === 0 ? (
              <p className="text-muted-foreground px-3 py-2 text-sm">Buscando…</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground px-3 py-2 text-sm">{emptyText}</p>
            ) : (
              <>
                {visible.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={cn(
                      'hover:bg-accent flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left',
                      opt.value === value && 'bg-accent/60'
                    )}
                    onClick={() => {
                      onChange(opt);
                      setOpen(false);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug font-medium">{opt.title}</p>
                      {opt.subtitle ? (
                        <p className="text-muted-foreground mt-0.5 text-xs">{opt.subtitle}</p>
                      ) : null}
                    </div>
                    {opt.badge ? (
                      <Badge
                        variant={opt.badgeVariant ?? 'outline'}
                        className="mt-0.5 shrink-0 rounded-full px-2.5"
                      >
                        {opt.badge}
                      </Badge>
                    ) : null}
                  </button>
                ))}
                {expandText ? (
                  <button
                    type="button"
                    className="text-primary hover:bg-accent w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium"
                    onClick={() => setExpanded(true)}
                  >
                    {expandText}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {helpText ? <p className="text-muted-foreground text-xs">{helpText}</p> : null}
    </div>
  );
}
