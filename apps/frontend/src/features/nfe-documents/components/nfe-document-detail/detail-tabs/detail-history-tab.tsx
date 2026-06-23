'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '../../../lib/format';
import type { NfeDocumentTimeline } from '../../../api/types';

export function DetailHistoryTab({ entries }: { entries: NfeDocumentTimeline[] }) {
  if (entries.length === 0) {
    return (
      <p className='text-muted-foreground py-8 text-center text-sm'>
        Nenhum registro no histórico.
      </p>
    );
  }

  return (
    <div className='rounded-lg border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Título</TableHead>
            <TableHead>Mensagem</TableHead>
            <TableHead>Fonte</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className='whitespace-nowrap text-xs'>
                {formatDateTime(entry.createdAt)}
              </TableCell>
              <TableCell className='font-medium'>{entry.title}</TableCell>
              <TableCell className='text-muted-foreground max-w-md truncate text-sm'>
                {entry.message ?? '—'}
              </TableCell>
              <TableCell className='text-xs'>{entry.source}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
