import { useMemo } from 'react';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FileTextIcon,
  LoaderIcon,
  XCircleIcon,
  type LucideIcon
} from 'lucide-react';

import type { ApiFiscalDocument } from '@/lib/api-types';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { documentListBucket, type DocumentListFilter } from './status-labels';

const KPI_CONFIG: {
  key: DocumentListFilter;
  label: string;
  icon: LucideIcon;
  iconClass: string;
}[] = [
  { key: 'all', label: 'Todas', icon: FileTextIcon, iconClass: 'text-muted-foreground' },
  { key: 'action_needed', label: 'Precisa de ação', icon: AlertTriangleIcon, iconClass: 'text-amber-600' },
  { key: 'in_progress', label: 'Em andamento', icon: LoaderIcon, iconClass: 'text-blue-600' },
  { key: 'completed', label: 'Concluídas', icon: CheckCircle2Icon, iconClass: 'text-emerald-600' },
  { key: 'problem', label: 'Com problema', icon: XCircleIcon, iconClass: 'text-red-600' }
];

export function KpiSummaryCards({
  documents,
  activeFilter,
  onFilterChange
}: {
  documents: ApiFiscalDocument[];
  activeFilter: DocumentListFilter;
  onFilterChange: (filter: DocumentListFilter) => void;
}) {
  const counts = useMemo(() => {
    const c: Record<DocumentListFilter, number> = {
      all: documents.length,
      action_needed: 0,
      in_progress: 0,
      completed: 0,
      problem: 0
    };
    for (const doc of documents) {
      c[documentListBucket(doc.status)]++;
    }
    return c;
  }, [documents]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {KPI_CONFIG.map((kpi) => {
        const Icon = kpi.icon;
        const selected = activeFilter === kpi.key;
        return (
          <button key={kpi.key} type="button" onClick={() => onFilterChange(kpi.key)} className="text-left">
            <Card className={cn('shadow-xs transition-colors', selected && 'ring-primary ring-2')}>
              <CardContent className="flex gap-3 p-3 xl:p-4">
                <div
                  className={`bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg xl:size-10 ${kpi.iconClass}`}
                >
                  <Icon className="size-4 xl:size-5" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-muted-foreground truncate text-xs font-medium">{kpi.label}</p>
                  <p className="text-base font-semibold tabular-nums xl:text-lg">{counts[kpi.key]}</p>
                </div>
              </CardContent>
            </Card>
          </button>
        );
      })}
    </div>
  );
}

export function KpiSummaryCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-3 xl:p-4">
            <Skeleton className="h-14 w-full xl:h-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
