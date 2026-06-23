'use client';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AlertIssue } from '../../../lib/extract-validation-issues';

type DetailAlertsTabProps = {
  issues: AlertIssue[];
  alertCode?: string | null;
};

function formatExpectedActual(issue: AlertIssue): string | null {
  if (issue.expected === undefined && issue.actual === undefined) return null;
  return `Esperado: ${issue.expected ?? '—'} · Encontrado: ${issue.actual ?? '—'}`;
}

export function DetailAlertsTab({ issues, alertCode }: DetailAlertsTabProps) {
  if (issues.length === 0) {
    return (
      <p className='text-muted-foreground py-8 text-center text-sm'>
        Nenhum alerta registrado.
      </p>
    );
  }

  const hasStructuredData = issues.some(
    (issue) =>
      issue.expected !== undefined ||
      issue.actual !== undefined ||
      issue.lineNumber !== undefined,
  );

  return (
    <div className='space-y-4'>
      {alertCode && (
        <div className='flex items-center gap-2'>
          <span className='text-muted-foreground text-sm'>Código:</span>
          <Badge variant='outline' className='font-mono text-xs'>
            {alertCode}
          </Badge>
        </div>
      )}

      {hasStructuredData ? (
        <div className='rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-16'>Item</TableHead>
                <TableHead>Divergência</TableHead>
                <TableHead>Valores</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map((issue, index) => {
                const values = formatExpectedActual(issue);
                return (
                  <TableRow key={`${issue.message}-${index}`}>
                    <TableCell className='text-muted-foreground tabular-nums'>
                      {issue.lineNumber ?? '—'}
                    </TableCell>
                    <TableCell className='text-sm'>{issue.message}</TableCell>
                    <TableCell className='text-muted-foreground text-xs'>
                      {values ?? '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <ul className='divide-y rounded-lg border'>
          {issues.map((issue, index) => (
            <li
              key={`${issue.message}-${index}`}
              className='flex items-start gap-3 px-4 py-3 text-sm'
            >
              <span className='bg-amber-500/20 text-amber-700 dark:text-amber-300 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium'>
                {index + 1}
              </span>
              <span className='leading-relaxed'>{issue.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
