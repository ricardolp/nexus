import type { Table } from '@tanstack/react-table';
import { DownloadIcon } from 'lucide-react';

import type { ApiFiscalDocument } from '@/lib/api-types';
import { Button } from '@/components/ui/button';

export function BulkActionBar({
  table,
  onDownloadZip,
  downloading
}: {
  table: Table<ApiFiscalDocument>;
  onDownloadZip: (documents: ApiFiscalDocument[]) => void;
  downloading: boolean;
}) {
  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedCount = selectedRows.length;

  return (
    <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium">
          {selectedCount} nota{selectedCount !== 1 ? 's' : ''} selecionada{selectedCount !== 1 ? 's' : ''}
        </span>
        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => table.resetRowSelection()}>
          Limpar seleção
        </Button>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={downloading}
        onClick={() => onDownloadZip(selectedRows.map((r) => r.original))}
      >
        <DownloadIcon />
        {downloading ? 'Baixando...' : 'Baixar ZIP das selecionadas'}
      </Button>
    </div>
  );
}
