'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SAP_DOC_TYPE_LABELS } from '../../../constants/nfe-status-options';
import { formatDateTime } from '../../../lib/format';
import type { NfeSapDocument } from '../../../api/types';

export function DetailSapDocsTab({ documents }: { documents: NfeSapDocument[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (documents.length === 0) {
    return (
      <p className='text-muted-foreground py-8 text-center text-sm'>
        Nenhum documento SAP gerado ainda.
      </p>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Número</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Exercício</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  {SAP_DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                </TableCell>
                <TableCell className='font-mono'>{doc.docNumber}</TableCell>
                <TableCell>{doc.itemNumber ?? '—'}</TableCell>
                <TableCell>{doc.fiscalYear ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant='outline'>{doc.status}</Badge>
                </TableCell>
                <TableCell>{formatDateTime(doc.createdAt)}</TableCell>
                <TableCell>
                  {doc.rawResponse && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() =>
                        setExpandedId(expandedId === doc.id ? null : doc.id)
                      }
                    >
                      {expandedId === doc.id ? 'Ocultar' : 'JSON'}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {expandedId && (
        <pre className='bg-muted max-h-64 overflow-auto rounded-lg border p-4 text-xs'>
          {JSON.stringify(
            documents.find((d) => d.id === expandedId)?.rawResponse,
            null,
            2,
          )}
        </pre>
      )}
    </div>
  );
}
